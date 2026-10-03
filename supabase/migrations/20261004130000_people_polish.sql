-- Holioo: People polish — block a person + rate-limited exact-ID lookup. Safe to re-run. Apply AFTER 20261004120000.
--
-- Block: I can block someone. They then (without being told) cannot find me by ID, cannot add me, cannot share with me,
-- and everything they shared with me disappears from my Holioo Shares. Blocks are private to the blocker.
-- Rate limit: find_holioo_person allows 15 lookups per minute and 100 per hour per user (anti-enumeration of IDs).

-- 1) Blocks -------------------------------------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;
drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid() and public.person_exists(blocked_id));
drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks for delete to authenticated using (blocker_id = auth.uid());

drop policy if exists blocks_not_blocked on public.blocks;
create policy blocks_not_blocked on public.blocks as restrictive for all to authenticated
  using (not public.is_blocked()) with check (not public.is_blocked());

-- "Did a block exist?" cannot be answered by the caller's own RLS view (the blocker's rows are invisible to the blocked
-- person), so it is a tiny security-definer check returning only true / false.
create or replace function public.blocked_by(p_blocker uuid, p_blocked uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where blocker_id = p_blocker and blocked_id = p_blocked)
$$;
revoke all on function public.blocked_by(uuid, uuid) from public, anon;
grant execute on function public.blocked_by(uuid, uuid) to authenticated;

-- 2) Policies that honour blocks -------------------------------------------------------------------------------------
drop policy if exists connections_insert_own on public.connections;
create policy connections_insert_own on public.connections for insert to authenticated
  with check (
    owner_id = auth.uid() and person_id <> auth.uid() and public.person_exists(person_id)
    and not public.blocked_by(person_id, auth.uid())     -- they blocked me
    and not public.blocked_by(auth.uid(), person_id)     -- I blocked them (unblock first)
  );

drop policy if exists shares_insert_owner on public.shares;
create policy shares_insert_owner on public.shares for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.connections c where c.owner_id = auth.uid() and c.person_id = recipient_id)
    and not exists (select 1 from unnest(paths) p where split_part(p, '/', 1) <> auth.uid()::text)
    and not public.blocked_by(recipient_id, auth.uid())
  );

-- A recipient who blocked the sender no longer sees (or can open) the sender's shares: storage reads go through this policy.
drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares for select to authenticated
  using (owner_id = auth.uid() or (recipient_id = auth.uid() and not public.blocked_by(auth.uid(), owner_id)));

-- I can see the public profile of people I blocked (to list / unblock them).
drop policy if exists public_profiles_select on public.public_profiles;
create policy public_profiles_select on public.public_profiles for select to authenticated using (
  uid = auth.uid()
  or exists (select 1 from public.connections c where c.owner_id = auth.uid() and c.person_id = public_profiles.uid)
  or exists (select 1 from public.shares s where s.recipient_id = auth.uid() and s.owner_id = public_profiles.uid)
  or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = public_profiles.uid)
);

-- 3) Rate-limited lookup ---------------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from anon, authenticated;
create table if not exists private.lookup_log (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists lookup_log_user_at_idx on private.lookup_log (user_id, at desc);
alter table private.lookup_log enable row level security;   -- no policy: the API can never read it

create or replace function public.find_holioo_person(p_holioo_id text)
returns table (uid uuid, holioo_id text, display_name text, avatar_url text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  n_min int;
  n_hour int;
begin
  if me is null then return; end if;
  delete from private.lookup_log l where l.user_id = me and l.at < now() - interval '1 hour';
  select count(*) filter (where l.at > now() - interval '1 minute'), count(*) into n_min, n_hour
  from private.lookup_log l where l.user_id = me;
  if n_min >= 15 or n_hour >= 100 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into private.lookup_log (user_id) values (me);
  return query
    select pp.uid, pp.holioo_id, pp.display_name, pp.avatar_url
    from public.public_profiles pp
    join public.profiles p on p.id = pp.uid
    where not coalesce(p.blocked, false)
      and not public.blocked_by(pp.uid, me)                 -- someone who blocked me is simply "not found"
      and pp.holioo_id = lower(btrim(replace(coalesce(p_holioo_id, ''), '@', '')))
      and length(btrim(coalesce(p_holioo_id, ''))) between 4 and 40
    limit 1;
end $$;
revoke all on function public.find_holioo_person(text) from public, anon;
grant execute on function public.find_holioo_person(text) to authenticated;
