-- Holioo: mandatory Google sign-in, admin role, blocking.
-- Safe to re-run (idempotent).

-- 1) Profile fields managed by the server only --------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists last_login_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check check (role in ('user','admin'));
  end if;
end $$;
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- App users (anon/authenticated API roles) can never change role, blocked or email.
create or replace function public.protect_profile_admin_fields()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op = 'INSERT' then
      new.role := 'user'; new.blocked := false; new.email := null;
    else
      new.role := old.role; new.blocked := old.blocked; new.email := old.email;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_admin_fields on public.profiles;
create trigger profiles_protect_admin_fields before insert or update on public.profiles
  for each row execute function public.protect_profile_admin_fields();

-- 2) Blocking, enforced by RLS on every user table ------------------------------
create or replace function public.is_blocked()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select blocked from public.profiles where id = auth.uid()), false)
$$;
revoke all on function public.is_blocked() from public;
grant execute on function public.is_blocked() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['courses','sections','sessions','photos','pdfs','inbox_batches','inbox_photos','drive_status','public_materials','profiles'] loop
    execute format('drop policy if exists %I on public.%I', t || '_not_blocked', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (not public.is_blocked()) with check (not public.is_blocked())', t || '_not_blocked', t);
  end loop;
end $$;

drop policy if exists public_materials_storage_not_blocked on storage.objects;
create policy public_materials_storage_not_blocked on storage.objects as restrictive for insert to authenticated
  with check (not public.is_blocked());

-- 3) Server-only tables (private schema, never exposed to the API) -------------
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.admin_emails (email text primary key);
insert into private.admin_emails (email) values ('payamshafiqullah@gmail.com') on conflict do nothing;

-- OAuth "state" for the Google sign-in / Drive consent round trip.
create table if not exists private.oauth_states (
  state text primary key,
  return_to text not null,
  user_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- One-time codes handing the new session back to the app (never put tokens in URLs).
create table if not exists private.login_codes (
  code text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null
);

-- Defence in depth: RLS on with no policies = no API access; the server (postgres role) still works.
alter table private.admin_emails enable row level security;
alter table private.oauth_states enable row level security;
alter table private.login_codes enable row level security;
