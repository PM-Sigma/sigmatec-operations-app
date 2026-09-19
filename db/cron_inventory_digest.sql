-- 📦 מלאי — the 12:00 / 17:00 digest, the pg_cron half (inventory spec §5.2). Task 10.
--
-- Same arrangement as db/cron_usage_weekly.sql and the attendance job: cron fires HOURLY and
-- the Edge Function decides. The gate lives in push-send's `inventoryDigest` mode (Israel local
-- 12:00 / 17:00 via `digestWindow()`, idempotent on the `inv-digest-<date>-<hh>` tag in
-- push_log), NOT in the cron expression — a cron expression is UTC and would drift an hour
-- twice a year, and a missed hour then re-fires safely instead of being lost.
--
-- AUTH: `inventoryDigest` answers only the shared cron secret in `X-Cron-Key`, or עידן with a
-- live EMS login (the forced smoke). Substitute `<ANON>` (the PUBLIC anon key) and
-- `<CRON_SECRET>` (Edge Functions → Secrets → CRON_SECRET) before running. NEVER commit them.
--
-- The immediate low-stock push is NOT here — it comes from the movements trigger
-- (db/inventory_alert_webhook.sql), because a shortage cannot wait for the next hour.

-- Re-running this file must not leave two jobs behind.
select cron.unschedule('push-inventory-hourly')
 where exists (select 1 from cron.job where jobname = 'push-inventory-hourly');

select cron.schedule(
  'push-inventory-hourly',
  '10 * * * *',        -- ten past, so it never races push-attendance-hourly ('0') or push-usage-hourly ('5')
  $$ select net.http_post(
       url     := 'https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/push-send',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>","X-Cron-Key":"<CRON_SECRET>"}'::jsonb,
       body    := '{"mode":"inventoryDigest"}'::jsonb
     ) $$
);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname='push-inventory-hourly')
--    order by start_time desc limit 5;
-- What went out (one row per device):
--   select sent_at, recipient, where_txt as tag, status from push_log
--    where event in ('inventoryDigest','inventoryAlert') order by sent_at desc limit 10;
-- A 401 in job_run_details' return_message means CRON_SECRET and the header disagree.
--
-- Force one for the smoke (עידן only, from a machine with his EMS token):
--   {"mode":"inventoryDigest","force":true,"actor":"עידן","token":"<EMS JWT>"}
