-- Holioo: private usage counting for the owner (Administration screen + Excel export).
-- Server-only tables in the private schema: never exposed through the API, so users cannot read them.
-- Written by the app-ping function, read by the admin-users function ("stats" action, admin only).

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- One row per device (random id kept in the device's local storage). user_id is set once someone signs in
-- on it; a row without user_id is a guest ("Essayer sans compte").
create table if not exists private.app_activity (
  device_id     uuid primary key,
  user_id       uuid references auth.users(id) on delete cascade,
  platform      text,                                  -- ipad / iphone / android / desktop / other
  app_version   text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  opens         integer not null default 0             -- number of app launches
);
create index if not exists app_activity_last_seen_idx on private.app_activity (last_seen_at);
create index if not exists app_activity_user_idx on private.app_activity (user_id);

-- One row per device and day (Europe/Paris), for daily / weekly / monthly active counts.
create table if not exists private.app_activity_daily (
  day       date not null,
  device_id uuid not null references private.app_activity(device_id) on delete cascade,
  primary key (day, device_id)
);

alter table private.app_activity enable row level security;
alter table private.app_activity_daily enable row level security;
