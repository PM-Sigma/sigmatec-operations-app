-- ══════════════════════════════════════════════════════════════════════════════
-- ⏰ Daily readings pull for חולדה — the pg_cron half (feature `readings-pull`).
--
-- The job pings `readings-fetch` {"mode":"cron"} at :00 and :30 of 04:00–06:30 UTC. Israel is UTC+2
-- (winter) or UTC+3 (summer), so that window always covers 07:00–08:30 Israel time whichever side of
-- the clock change we are on. THE 07:00–08:30 ISRAEL-TIME WINDOW IS DECIDED INSIDE THE FUNCTION
-- (it acts only inside it, skips a day that already has an `ok` run, and retries up to 3 times) —
-- never in the cron expression, so the clock change needs no edit here.
--
-- ── AUTH ──────────────────────────────────────────────────────────────────────
-- Same pattern as db/cron_timer_5min.sql: the mode answers only the `X-Cron-Key` header (the
-- `CRON_SECRET` Edge-Function secret, the SAME one the other cron jobs use — do not create a second).
--
-- Prod steps, in order (עידן's — DO NOT run this from a task branch):
--   1. Apply db/readings_pull.sql.
--   2. Deploy the `readings-fetch` Edge Function (with the `cron` mode) and set its secrets.
--   3. Substitute `<ANON>` (the PUBLIC anon key — js/src/01-data.js) and `<CRON_SECRET>`, run this file.
--
-- ROLLBACK:  select cron.unschedule('readings-7am');
-- ══════════════════════════════════════════════════════════════════════════════

-- Re-running this file must not leave two jobs behind.
select cron.unschedule('readings-7am')
 where exists (select 1 from cron.job where jobname = 'readings-7am');

select cron.schedule(
  'readings-7am',
  '0,30 4-6 * * *',     -- UTC: 04:00, 04:30 … 06:30
  $$ select net.http_post(
       url     := 'https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/readings-fetch',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>","X-Cron-Key":"<CRON_SECRET>"}'::jsonb,
       body    := '{"mode":"cron"}'::jsonb
     ) $$
);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'readings-7am';
--   select start_time, status, return_message from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'readings-7am')
--    order by start_time desc limit 5;
-- A 401 in return_message means CRON_SECRET and the header disagree.
