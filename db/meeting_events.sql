-- ══════════════════════════════════════════════════════════════════════════════
-- `meeting_events` — the navigation log of one presenter session (spec §1.2).
--
-- One row per thing that happened, stamped with `t_sec` = seconds since the session's
-- `started_at`. That offset — not a wall clock — is the point: §1.3 lines the log up against
-- the recording's own timeline to split the transcript per kibbutz, and a recording starts
-- when עידן presses record, so only a RELATIVE offset survives a clock that drifts.
--
-- kinds:
--   `kibbutz`  — the screen moved to this kibbutz (the segment boundary)
--   `marker`   — Space, "📌 סמן רגע": something important was just said. No text, by design.
--   `parking`  — P, a tangent. `hint` carries the kibbutz that was on screen when it came up.
--   `general`  — the parts of the meeting that belong to no kibbutz
--   `note`     — one line עידן actually typed during the meeting (the always-visible quick
--                note). A typed note is "just a stronger marker" (§1.2) — no tag, no owner.
--   `issue`    — a dev-meeting item keyed to a GitHub issue number
--
-- Deliberately NOT the place a decision or a task is stored: anything that must survive the
-- meeting goes to `kibbutz_meeting_notes` / EMS through the ✏️ live quick-note (§1.2b).
--
-- RLS follows db/rls_staged.sql: anon reads, `authenticated` writes.
-- Apply AFTER db/meeting_sessions.sql (the fk).
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists meeting_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references meeting_sessions(id) on delete cascade,
  t_sec int not null,
  kind text not null check (kind in ('kibbutz','marker','parking','general','note','issue')),
  kibbutz text,                                   -- = kibbutzim.name (not an fk; a general event has none)
  issue_number int,
  hint text,
  created_at timestamptz default now()
);

-- The only read path that matters: "this session's log, in order".
create index if not exists meeting_events_session_idx on meeting_events (session_id, t_sec);
-- …and the per-kibbutz replay the review screen (Task 25) walks.
create index if not exists meeting_events_kibbutz_idx on meeting_events (kibbutz, created_at desc);

alter table meeting_events enable row level security;

drop policy if exists me_read on meeting_events;
create policy me_read on meeting_events for select using (true);

drop policy if exists me_write on meeting_events;
create policy me_write on meeting_events for all to authenticated using (true) with check (true);
