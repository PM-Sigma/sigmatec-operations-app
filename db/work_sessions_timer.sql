-- ⏱ work_sessions — the RUNNING clock (עידן 22.9, the server-push ruling).
--
-- Until now a ticking timer lived ONLY in the phone's localStorage, and the two-hour
-- "עדכן את השעון" notice was drawn by the screen on its next tick. A phone that stayed in a
-- pocket for two hours therefore heard nothing at all — the one case the reminder exists for.
--
-- So ▶ now OPENS the row (`ended_at = null`) instead of waiting for ■, and the server does the
-- reminding: push-send mode `timerStale` (pg_cron every five minutes, db/cron_timer_5min.sql)
-- reads the open rows and pushes from Supabase, with nobody's PC involved. ■ UPDATEs that same
-- row, 🗑 deletes it, and ⏸/▶/retime keep `started_at` + `paused_ms` in sync — so the arithmetic
-- the phone does (app/src/lib/clockify.ts `elapsedFor`) and the arithmetic the cron does
-- (`timerStaleSelect`, the byte-identical copy) are the SAME arithmetic.
--
-- Additive and idempotent; apply after db/work_sessions.sql and db/work_sessions_log.sql.

-- 1. The two columns the running row needs.
-- Milliseconds this clock spent paused. Not worked, so never counted toward the two hours
-- and never billed. `not null default 0` so the selector never has to reason about null.
alter table work_sessions add column if not exists paused_ms integer not null default 0;
-- Set while the clock is ⏸. A paused clock must NEVER buzz — the same rule the screen keeps
-- (`autoStopDue`), and the reason this column exists at all rather than only `paused_ms`:
-- an open pause has no duration yet, so there is nothing to add to `paused_ms` until ▶.
alter table work_sessions add column if not exists paused_at timestamptz;
-- Stamped by push-send once the nudge went out, so a row buzzes AT MOST ONCE — the same
-- idempotency-by-row the visit reminder uses (db/field_checkins.sql `reminded_at`).
alter table work_sessions add column if not exists reminded_at timestamptz;

-- 2. What the cron reads, five minutes apart, all day: the open clocks nobody was told about.
create index if not exists work_sessions_open_timers on work_sessions (started_at)
  where ended_at is null and reminded_at is null;

-- 3. 🗑 "עצור ומחק" must be able to remove the row the same person's ▶ opened. work_sessions.sql
--    gave everyone insert/update on their OWN rows and work_sessions_log.sql gave DELETE to
--    עידן and עמיחי only — which would leave מתניה's dropped timer as an open row forever,
--    and the cron would nudge him about a session he deliberately threw away.
drop policy if exists ws_delete on work_sessions;
create policy ws_delete on work_sessions for delete to authenticated
  using (person = coalesce(auth.jwt() ->> 'name', person));

comment on column work_sessions.paused_at is
  'Set while the running clock is paused. The timerStale cron skips paused rows.';
comment on column work_sessions.paused_ms is
  'Milliseconds paused (closed pauses). Subtracted from the elapsed time by both the app and the timerStale cron.';
comment on column work_sessions.reminded_at is
  'Set by push-send mode timerStale when the 2 h "update your clock" push went out. At most one per row.';

-- Verify:
--   select id, person, kibbutz, started_at, paused_ms, reminded_at
--     from work_sessions where ended_at is null order by started_at;
--   -- what the cron would pick right now:
--   select * from work_sessions
--    where ended_at is null and reminded_at is null
--      and paused_at is null
      and now() - started_at - (paused_ms || ' milliseconds')::interval >= interval '2 hours';
