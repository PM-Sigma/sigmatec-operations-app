-- Round 5 · C2 — אביאם's calendar setting "לראות גם את המשימות של ניתאי" (spec
-- docs/superpowers/specs/2026-09-23-r5-C-calendar.md). Read/written through app/src/lib/settings.ts
-- like every other per-person setting; only אביאם is ever offered the switch (calendar.ts
-- canTogglePeerTasks), so for everyone else it stays at the default.
alter table public.user_settings
  add column if not exists cal_peer_tasks boolean not null default false;

comment on column public.user_settings.cal_peer_tasks is
  'Round 5 · C2: אביאם only — also show ניתאי''s open tasks in the calendar''s kibbutz blocks.';

-- Verify:
--   select person, cal_peer_tasks from public.user_settings order by person;
