-- ⚙️ הגדרות — per-person app settings (spec §7h, §7l).
-- Task 4 uses landing / card_desc / font / theme; eod_hour is Task 15's end-of-day nudge and
-- is declared now so a Task-4 upsert never has to change the table shape again.
--
-- IDENTITY. The app has no auth users — a person IS his name (localStorage 'dashboard_user_v1',
-- the same key every other table's `created_by` carries), so `person` is the primary key.
-- Everything here is a display preference; the row is readable by the team and writable by the
-- authenticated pass the EMS session mints, exactly like kibbutz_meeting_notes.
create table if not exists public.user_settings (
  person      text primary key,
  landing     text,
  card_desc   text,
  font        text,
  theme       text,
  eod_hour    int,
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- Read: anyone who opened the app (the anon key). These are font/theme choices, not secrets,
-- and the shared-device reality of the field phones means a read gate would only break them.
drop policy if exists user_settings_read on public.user_settings;
create policy user_settings_read on public.user_settings
  for select using (true);

-- Write: only a session that logged in through EMS (the `authenticated` pass).
drop policy if exists user_settings_write on public.user_settings;
create policy user_settings_write on public.user_settings
  for all to authenticated using (true) with check (true);

comment on table public.user_settings is
  'Per-person UI preferences (spec §7h): landing screen, card description length, font, theme, end-of-day hour.';
