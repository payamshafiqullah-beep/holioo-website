-- Holioo: People + "Holioo Shares" (private, least privilege). Safe to re-run.
--
-- ROOT CAUSE of "searching a holiooId only returns me":
--   the app looked a person up with `select … from public.profiles where holioo_id = …`, but `profiles` is a
--   private table (it holds email, role, blocked…) whose row-level security lets a user read ONLY their own row.
--   The query therefore returned a row only when the searched id was the caller's own. (The old code also required
--   public_profile = true, an opt-in almost nobody had.) `profiles` must stay private, so people are now found
--   through a separate, minimal table and a single exact-match function.
--
-- Model (Firestore equivalent in brackets):
--   public_profiles  [publicProfiles/{uid}]          uid, holioo_id, display_name, avatar_url — no email, nothing private
--   connections      [users/{uid}/connections]       owner-only; one-way "I added this person"
--   shares           [shares/{id}]                   one row per (document, recipient); owner revokes by deleting it
--   storage bucket   shared-items (private)          the shared files; readable only by owner + a recipient of a matching share
--
-- Why Supabase Storage and not Google Drive for the content: a Drive permission needs the recipient's e-mail address
-- (it leaks it to the owner and the owner's to the recipient) and Drive links outlive revocation in caches. A private
-- Storage object is only reachable through a short-lived signed URL issued after the RLS check below.

-- 1) Public profile (everything the whole app may know about a person) ----------------------------------------------
create table if not exists public.public_profiles (
  uid          uuid primary key references auth.users(id) on delete cascade,
  holioo_id    text not null unique,
  display_name text not null default 'Étudiant',
  avatar_url   text
);
alter table public.public_profiles enable row level security;
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- Mirrors profiles → public_profiles (name, avatar, id only). Written by the database, never by the client.
create or replace function public.sync_public_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.holioo_id is null or new.holioo_id = '' then return new; end if;
  insert into public.public_profiles (uid, holioo_id, display_name, avatar_url)
  values (new.id, lower(new.holioo_id), coalesce(nullif(new.name, ''), nullif(new.display_name, ''), 'Étudiant'), new.avatar_url)
  on conflict (uid) do update set holioo_id = excluded.holioo_id, display_name = excluded.display_name, avatar_url = excluded.avatar_url;
  return new;
end $$;
revoke all on function public.sync_public_profile() from public, anon, authenticated;
drop trigger if exists profiles_sync_public on public.profiles;
create trigger profiles_sync_public after insert or update on public.profiles
  for each row execute function public.sync_public_profile();

create or replace function public.drop_public_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.public_profiles where uid = old.id;
  return old;
end $$;
revoke all on function public.drop_public_profile() from public, anon, authenticated;
drop trigger if exists profiles_drop_public on public.profiles;
create trigger profiles_drop_public after delete on public.profiles
  for each row execute function public.drop_public_profile();

-- The holioo_id is the lookup key: once set, an app user can never change it (nobody can take over another id).
create or replace function public.protect_holioo_id() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and tg_op = 'UPDATE' and old.holioo_id is not null and old.holioo_id <> '' then
    new.holioo_id := old.holioo_id;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_holioo_id on public.profiles;
create trigger profiles_protect_holioo_id before update on public.profiles
  for each row execute function public.protect_holioo_id();

insert into public.public_profiles (uid, holioo_id, display_name, avatar_url)
select p.id, lower(p.holioo_id), coalesce(nullif(p.name, ''), nullif(p.display_name, ''), 'Étudiant'), p.avatar_url
from public.profiles p
where p.holioo_id is not null and p.holioo_id <> ''
on conflict (uid) do update set holioo_id = excluded.holioo_id, display_name = excluded.display_name, avatar_url = excluded.avatar_url;

-- 2) Connections: private to their owner -----------------------------------------------------------------------------
create table if not exists public.connections (
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, person_id),
  check (owner_id <> person_id)
);
create index if not exists connections_person_idx on public.connections (person_id);
alter table public.connections enable row level security;
revoke all on public.connections from anon, authenticated;
grant select, insert, delete on public.connections to authenticated;
-- A person you have not added yet is invisible through public_profiles' own policy, so "does this person exist?" is a
-- tiny security-definer check (returns only true/false) used by the connections insert policy.
create or replace function public.person_exists(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.public_profiles where uid = p_uid)
$$;
revoke all on function public.person_exists(uuid) from public, anon;
grant execute on function public.person_exists(uuid) to authenticated;

drop policy if exists connections_select_own on public.connections;
create policy connections_select_own on public.connections for select to authenticated using (owner_id = auth.uid());
drop policy if exists connections_insert_own on public.connections;
create policy connections_insert_own on public.connections for insert to authenticated
  with check (owner_id = auth.uid() and person_id <> auth.uid() and public.person_exists(person_id));
drop policy if exists connections_delete_own on public.connections;
create policy connections_delete_own on public.connections for delete to authenticated using (owner_id = auth.uid());

-- 3) Shares ----------------------------------------------------------------------------------------------------------
create table if not exists public.shares (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('pdf', 'photos')),
  title        text not null check (char_length(title) between 1 and 200),
  course       text check (char_length(course) <= 120),
  section      text check (char_length(section) <= 120),
  paths        text[] not null check (cardinality(paths) between 1 and 80),
  created_at   timestamptz not null default now(),
  check (owner_id <> recipient_id)
);
create index if not exists shares_recipient_idx on public.shares (recipient_id, created_at desc);
create index if not exists shares_owner_idx on public.shares (owner_id, created_at desc);
alter table public.shares enable row level security;
revoke all on public.shares from anon, authenticated;
grant select, insert, delete on public.shares to authenticated;   -- no update: a share is never edited, only revoked

drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares for select to authenticated
  using (owner_id = auth.uid() or recipient_id = auth.uid());
-- Only the owner creates a share, only towards someone they added, and only for files in their own storage folder.
-- A recipient owns nothing in storage, so they cannot create a share (view-only, no re-share).
drop policy if exists shares_insert_owner on public.shares;
create policy shares_insert_owner on public.shares for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.connections c where c.owner_id = auth.uid() and c.person_id = recipient_id)
    and not exists (select 1 from unnest(paths) p where split_part(p, '/', 1) <> auth.uid()::text)
  );
-- The owner revokes; the recipient may also remove it from their own list (the file stays the owner's).
drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares for delete to authenticated
  using (owner_id = auth.uid() or recipient_id = auth.uid());

-- Who is a person? Only the owner of a connection, or a share's recipient, may read that person's public profile.
drop policy if exists public_profiles_select on public.public_profiles;
create policy public_profiles_select on public.public_profiles for select to authenticated using (
  uid = auth.uid()
  or exists (select 1 from public.connections c where c.owner_id = auth.uid() and c.person_id = public_profiles.uid)
  or exists (select 1 from public.shares s where s.recipient_id = auth.uid() and s.owner_id = public_profiles.uid)
);

-- 4) Exact-match lookup: the ONLY way to find someone you have not added yet --------------------------------------
-- Returns at most one row: uid, holioo_id, name, avatar. No listing, no prefix search, no e-mail. Blocked accounts hide.
create or replace function public.find_holioo_person(p_holioo_id text)
returns table (uid uuid, holioo_id text, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select pp.uid, pp.holioo_id, pp.display_name, pp.avatar_url
  from public.public_profiles pp
  join public.profiles p on p.id = pp.uid
  where auth.uid() is not null
    and not coalesce(p.blocked, false)
    and pp.holioo_id = lower(btrim(replace(coalesce(p_holioo_id, ''), '@', '')))
    and length(btrim(coalesce(p_holioo_id, ''))) between 4 and 40
  limit 1
$$;
revoke all on function public.find_holioo_person(text) from public, anon;
grant execute on function public.find_holioo_person(text) to authenticated;

-- 5) Blocked accounts stay blocked everywhere ----------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['public_profiles', 'connections', 'shares'] loop
    execute format('drop policy if exists %I on public.%I', t || '_not_blocked', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (not public.is_blocked()) with check (not public.is_blocked())', t || '_not_blocked', t);
  end loop;
end $$;

-- 6) Private storage bucket for the shared files ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shared-items', 'shared-items', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Objects live at <owner uid>/<share key>/<file>.
drop policy if exists shared_items_insert_owner on storage.objects;
create policy shared_items_insert_owner on storage.objects for insert to authenticated
  with check (bucket_id = 'shared-items' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_blocked());

drop policy if exists shared_items_select on storage.objects;
create policy shared_items_select on storage.objects for select to authenticated
  using (
    bucket_id = 'shared-items'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.shares s where s.recipient_id = auth.uid() and storage.objects.name = any (s.paths))
    )
  );

drop policy if exists shared_items_delete_owner on storage.objects;
create policy shared_items_delete_owner on storage.objects for delete to authenticated
  using (bucket_id = 'shared-items' and (storage.foldername(name))[1] = auth.uid()::text);
-- No update policy: objects are write-once (upsert is refused), so nobody can swap a file after it was shared.
