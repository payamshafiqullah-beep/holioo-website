-- Holioo: real-time signals between the devices of one account (phone ↔ tablet / computer).
-- A signal only says "something changed, look in your Drive": technical ids and a time. Never photos,
-- names or text — those stay on the devices and in the user's own Google Drive.
-- The app inserts a row after writing to Drive; the other devices receive it through Supabase Realtime.

create table if not exists public.sync_signals (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id     uuid not null,                         -- random id kept on the sending device
  kind          text not null check (kind in ('state', 'photo', 'note')),
  ref_id        uuid,                                  -- photo id for 'photo', séance id for 'note'
  session_id    uuid,                                  -- séance the photo was filed into ('photo')
  drive_file_id text check (drive_file_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  rev           bigint,
  created_at    timestamptz not null default now()
);
create index if not exists sync_signals_user_created_idx on public.sync_signals (user_id, created_at desc);

alter table public.sync_signals enable row level security;
revoke all on public.sync_signals from anon;
grant select, insert on public.sync_signals to authenticated;
grant usage on sequence public.sync_signals_id_seq to authenticated;

-- Each user reads and writes only their own signals. No update or delete through the API.
drop policy if exists "sync_signals_select_own" on public.sync_signals;
create policy "sync_signals_select_own" on public.sync_signals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "sync_signals_insert_own" on public.sync_signals;
create policy "sync_signals_insert_own" on public.sync_signals
  for insert to authenticated with check (user_id = auth.uid());

-- Signals are only useful for a moment: keep one day.
create or replace function public.sync_signals_prune() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.sync_signals where user_id = new.user_id and created_at < now() - interval '1 day';
  return null;
end $$;
revoke all on function public.sync_signals_prune() from public, anon, authenticated;
drop trigger if exists sync_signals_prune on public.sync_signals;
create trigger sync_signals_prune after insert on public.sync_signals
  for each row execute function public.sync_signals_prune();

-- Delivered live to the other devices (RLS applies to Realtime too).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sync_signals') then
    alter publication supabase_realtime add table public.sync_signals;
  end if;
end $$;
