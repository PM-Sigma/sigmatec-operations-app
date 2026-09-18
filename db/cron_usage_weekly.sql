-- ══════════════════════════════════════════════════════════════════════════════
-- 📈 Weekly usage digest — the pg_cron half (spec §7j).
--
-- Same shape as the shipped `push-attendance-hourly` job
-- (docs/superpowers/specs/2026-07-16-push-actions-and-scheduled-attendance-design.md):
-- cron fires HOURLY and the Edge Function decides. The gate lives in push-send's
-- `usageDigest` mode (Sunday 08:00 Israel via israelNow(), idempotent on the
-- `usage-<yyyy>-w<ww>` tag in push_log), NOT in the cron expression — because a cron
-- expression is UTC and would drift an hour twice a year, and because a missed hour then
-- re-fires safely instead of being lost.
--
-- Requires the extensions the attendance job already enabled:
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- Replace <ANON> with the PUBLIC anon key (js/src/01-data.js / app/src/lib/supabase.ts) —
-- it is public by design, and `usageDigest` reads the roster and recipient server-side, so a
-- caller cannot redirect the digest at anyone.
-- ══════════════════════════════════════════════════════════════════════════════

-- Re-running this file must not leave two jobs behind.
select cron.unschedule('push-usage-hourly')
 where exists (select 1 from cron.job where jobname = 'push-usage-hourly');

select cron.schedule(
  'push-usage-hourly',
  '5 * * * *',          -- five past the hour, so it never races push-attendance-hourly ('0 * * * *')
  $$ select net.http_post(
       url     := 'https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/push-send',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>"}'::jsonb,
       body    := '{"mode":"usageDigest"}'::jsonb
     ) $$
);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'push-usage-hourly';
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='push-usage-hourly')
--    order by start_time desc limit 5;
-- What it sent (one row per device):
--   select sent_at, recipient, where_txt as week_tag, status from push_log
--    where event = 'usageDigest' order by sent_at desc limit 10;
