-- ══════════════════════════════════════════════════════════════════════════════
-- `kibbutz_meeting_notes` — the per-kibbutz meeting bullets (spec §3 Part B, "סיגמה 2.00").
--
-- One row = ONE SENTENCE from a meeting summary, attached to one card. The import
-- (app/src/islands/ImportNotes.tsx → app/src/lib/meetingNotes.ts) is IDEMPOTENT: it
-- deletes the rows of that (meeting_date, meeting_kind) and inserts the parse again, so
-- re-pasting a corrected summary replaces it instead of doubling it. `unique (kibbutz,
-- meeting_date, meeting_kind, seq)` is what makes that safe even if two admins race.
--
-- `kibbutz` joins to kibbutzim.name (NOT an fk: a summary may name a kibbutz that has no
-- card yet, and the import flags those in the preview instead of writing a broken row).
-- A section that names several kibbutzim (`**27. כפר עזה · יסעור · …**`) is COPIED to each,
-- with seq restarting at 1 per kibbutz.
--
-- `ems_task_id` is set when a task was opened from the bullet (the row then shows 🔗),
-- `done_at` when it was marked handled (the row dims). Neither is ever un-set by the import.
--
-- RLS follows db/rls_staged.sql: anon READS (the whole app sits behind the EMS gate),
-- writes need the `authenticated` pass js/src/01-data.js mints from the EMS session.
-- The viewer role is blocked client-side, like everywhere else in the app.
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists kibbutz_meeting_notes (
  id uuid primary key default gen_random_uuid(),
  kibbutz text not null,                                        -- = kibbutzim.name
  meeting_date date not null,
  meeting_kind text not null default 'company' check (meeting_kind in ('company','dev','client')),
  seq int not null,                                             -- 1..n, per kibbutz section
  text text not null,
  owners text[] not null default '{}',                          -- from the "אחריות …" clause
  ems_task_id text,                                             -- set once a task was opened from this bullet
  done_at timestamptz,
  created_by text,
  created_at timestamptz default now(),
  unique (kibbutz, meeting_date, meeting_kind, seq)
);

-- The card reads "every note for this kibbutz, newest meeting first"; the import deletes
-- "every note of this date+kind". One index per access path.
create index if not exists kmn_kibbutz_date_idx on kibbutz_meeting_notes (kibbutz, meeting_date desc, seq);
create index if not exists kmn_date_kind_idx    on kibbutz_meeting_notes (meeting_date, meeting_kind);

alter table kibbutz_meeting_notes enable row level security;

drop policy if exists kmn_read on kibbutz_meeting_notes;
create policy kmn_read on kibbutz_meeting_notes for select using (true);

drop policy if exists kmn_write on kibbutz_meeting_notes;
create policy kmn_write on kibbutz_meeting_notes for all to authenticated using (true) with check (true);
