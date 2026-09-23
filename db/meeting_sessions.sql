-- ══════════════════════════════════════════════════════════════════════════════
-- `meeting_sessions` — one row per RUN of מצב ישיבה (company-process spec §1.2).
--
-- A session is opened when עידן enters presenter mode and closed when he leaves it. Its only
-- job is to be the anchor `meeting_events` hangs off: the navigation log is what §1.3 later
-- uses to SEGMENT the recording's transcript ("each segment carries its kibbutz"), so the
-- session has to know when it started, in what kind of meeting, and — when the calendar had
-- one — which Google event it belongs to.
--
-- NOT a meeting record: the meeting's CONTENT lives in `kibbutz_meeting_notes` (redesign §3).
-- Nothing here is customer-facing and nothing here is ever shown to a kibbutz.
--
-- `date` is the meeting's own day (the one the summary is filed under), which is not always
-- `started_at::date` — a session opened at 00:10 still belongs to the meeting that was
-- scheduled for the evening before. The island passes it explicitly.
--
-- RLS follows db/rls_staged.sql, like every other table in the app: anon READS (the whole app
-- sits behind the EMS gate), writes need the `authenticated` pass js/src/01-data.js mints
-- from the EMS session.
--
-- D1 (package M, 23.9): the row is written LAZILY now — `useMeetingRun` (app/src/lib/
-- meetingRun.ts) no longer inserts on mount, only on the first `start()` or `log()`. Opening
-- the screen and immediately leaving used to plant a row here that "the previous meeting"
-- (`previousMeetingDate`, app/src/lib/meetingSession.ts) then read as a real prior session,
-- silently resetting every timeline window to that accidental day. A row existing here is no
-- longer proof of a real meeting on its own — see `isRealMeeting`: at least 10 minutes between
-- `started_at`/`ended_at`, OR a `meeting_events` row of kind `marker`/`parking`, OR
-- `kibbutz_meeting_notes` filed under this `date`.
--
-- Apply with the other db/*.sql migrations (Supabase SQL editor / CLI).
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null default 'company' check (kind in ('company','dev')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  host text,
  calendar_event_id text
);

-- "the session I am in" = the newest one with no ended_at; "that day's sessions" = the report.
create index if not exists meeting_sessions_date_idx on meeting_sessions (date desc, started_at desc);
create index if not exists meeting_sessions_open_idx on meeting_sessions (started_at desc) where ended_at is null;

alter table meeting_sessions enable row level security;

drop policy if exists ms_read on meeting_sessions;
create policy ms_read on meeting_sessions for select using (true);

drop policy if exists ms_write on meeting_sessions;
create policy ms_write on meeting_sessions for all to authenticated using (true) with check (true);
