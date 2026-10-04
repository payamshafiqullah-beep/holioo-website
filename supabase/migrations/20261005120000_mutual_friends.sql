-- Holioo: mutual friends. Adding someone makes the link two-way at once — no request, no approval. Safe to re-run.
-- Apply AFTER 20261004130000.
--
-- `connections` stays the private "my people" list (owner-only RLS), but rows are now only created in pairs by
-- add_friend(): (me → them) and (them → me). Direct inserts are no longer allowed, so a one-way link cannot appear.
-- Both people therefore see each other in their list, and either can share with the other (shares_insert_owner
-- already requires a connection owner → recipient). Blocks still win: nothing is created if either side blocked the other.

create or replace function public.add_friend(p_uid uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_uid is null or p_uid = me then raise exception 'invalid_person' using errcode = 'P0001'; end if;
  if not public.person_exists(p_uid) then raise exception 'invalid_person' using errcode = 'P0001'; end if;
  if public.blocked_by(p_uid, me) or public.blocked_by(me, p_uid) then raise exception 'invalid_person' using errcode = 'P0001'; end if;
  insert into public.connections (owner_id, person_id) values (me, p_uid), (p_uid, me) on conflict do nothing;
end $$;
revoke all on function public.add_friend(uuid) from public, anon;
grant execute on function public.add_friend(uuid) to authenticated;

-- Removing a friend ends the link on both sides.
create or replace function public.remove_friend(p_uid uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.connections
  where (owner_id = me and person_id = p_uid) or (owner_id = p_uid and person_id = me);
end $$;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- No more one-way adds from the client.
drop policy if exists connections_insert_own on public.connections;
revoke insert on public.connections from authenticated;
drop policy if exists connections_delete_own on public.connections;
revoke delete on public.connections from authenticated;   -- removal goes through remove_friend()

-- Existing one-way links become two-way (except where either side blocked the other).
insert into public.connections (owner_id, person_id)
select c.person_id, c.owner_id from public.connections c
where not public.blocked_by(c.owner_id, c.person_id) and not public.blocked_by(c.person_id, c.owner_id)
on conflict do nothing;
