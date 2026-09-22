-- ══════════════════════════════════════════════════════════════════════════════
-- ⏱ The 2 h "עדכן את השעון" reminder — the pg_cron half (עידן 22.9).
--
-- THE POINT: the reminder must reach the person with the phone CLOSED. The in-app auto-stop
-- (app/src/components/home/WorkTimer.tsx) only fires while a card is on screen, and no PC of
-- עידן's is involved anywhere in this path — Supabase alone owns the clock.
--
-- Every five minutes, because the promise is "after two hours" and this is the cheapest tick
-- that keeps that promise honest: the function answers `{"ok":true,"results":[]}` in a few
-- milliseconds when no clock is open, which is most of the day.
--
-- ALL the gating lives in push-send's `timerStale` mode (app/src/lib/clockify.ts
-- `timerStaleSelect`, pinned by app/src/lib/clockify.test.ts), never in the cron expression:
--   · the row is still open (`ended_at is null`) and was never nudged (`reminded_at is null`)
--   · two hours of WORK — wall clock minus `paused_ms`, so a paused clock never buzzes
--   · nothing between 21:00 and 06:30 Israel, exactly like the visit nudge (§7k ג)
--   · a row is nudged AT MOST ONCE (`reminded_at`, stamped whatever the delivery said)
--
-- ── AUTH ──────────────────────────────────────────────────────────────────────
-- Same pattern as db/cron_visit_15min.sql: the mode answers only the `X-Cron-Key` header (the
-- `CRON_SECRET` Edge-Function secret) or a live EMS login. Without it anyone holding the
-- PUBLIC anon key could make someone's phone buzz.
--
-- Prod steps, in order (עידן's — DO NOT run this from a task branch):
--   1. Apply db/work_sessions_timer.sql.
--   2. Redeploy the `push-send` Edge Function (the `timerStale` mode + its clockify.ts copy
--      ship with it; the cron 404s on a function that does not know the mode).
--   3. Confirm `CRON_SECRET` exists (Supabase dashboard → Edge Functions → Secrets). It is
--      the same secret the visit and usage jobs use; do NOT generate a second one.
--   4. Substitute `<ANON>` (the PUBLIC anon key — js/src/01-data.js) and `<CRON_SECRET>`,
--      then run this file.
-- ══════════════════════════════════════════════════════════════════════════════

-- Re-running this file must not leave two jobs behind.
select cron.unschedule('push-timer-5min')
 where exists (select 1 from cron.job where jobname = 'push-timer-5min');

select cron.schedule(
  'push-timer-5min',
  '3-58/5 * * * *',     -- 3, 8, 13, … — never on the hour, where the attendance ('0'), usage
                        -- ('5') and visit ('7') jobs already are
  $$ select net.http_post(
       url     := 'https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/push-send',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>","X-Cron-Key":"<CRON_SECRET>"}'::jsonb,
       body    := '{"mode":"timerStale"}'::jsonb
     ) $$
);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--   select start_time, status, return_message from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'push-timer-5min')
--    order by start_time desc limit 5;
-- What it sent (one row per device):
--   select sent_at, recipient, where_txt as kibbutz, title, status from push_log
--    where event = 'timerStale' order by sent_at desc limit 20;
-- A 401 in return_message means CRON_SECRET and the header disagree.
