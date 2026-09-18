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
-- ── AUTH (review fix round 1 — READ THIS BEFORE SCHEDULING) ───────────────────
-- `usageDigest` no longer answers the public anon key. It requires EITHER the shared cron
-- secret in the `X-Cron-Key` header (this job) OR a valid EMS login (עידן, from the app).
-- Without it, anyone holding the anon key could force a digest, spam עידן's phone and read the
-- narrative — which names people — straight out of the response.
--
-- Prod steps, in order:
--   1. Generate a secret and set it on the FUNCTION side:
--        Supabase dashboard → Edge Functions → Secrets → `CRON_SECRET` = <a long random string>
--      (`openssl rand -hex 32`). NEVER commit it; that is why it is not in this file.
--   2. Substitute `<ANON>` (the PUBLIC anon key — js/src/01-data.js / app/src/lib/supabase.ts)
--      and `<CRON_SECRET>` (the value from step 1) below, then run this file.
--   3. The attendance job is re-scheduled with the same header by the block at the bottom, so
--      both scheduled jobs prove themselves the same way.
--
-- The secret sits in the cron job body, which anyone who can read `cron.job` in this database
-- can read — i.e. a DB admin. That is exactly why the cron key may only run the SCHEDULED
-- digest: `force` (skip the Sunday gate) and `force:'resend'` (skip the week tag) are refused
-- for a cron caller and allowed only for עידן with a live EMS session — app/src/lib/usageDigest.ts.
-- ══════════════════════════════════════════════════════════════════════════════

-- Re-running this file must not leave two jobs behind.
select cron.unschedule('push-usage-hourly')
 where exists (select 1 from cron.job where jobname = 'push-usage-hourly');

select cron.schedule(
  'push-usage-hourly',
  '5 * * * *',          -- five past the hour, so it never races push-attendance-hourly ('0 * * * *')
  $$ select net.http_post(
       url     := 'https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/push-send',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>","X-Cron-Key":"<CRON_SECRET>"}'::jsonb,
       body    := '{"mode":"usageDigest"}'::jsonb
     ) $$
);

-- ── the existing attendance job, re-scheduled with the same header ────────────
-- Nothing depends on it yet (`attendanceCron` still accepts the anon key, as it has since
-- 1.50), but both scheduled jobs should prove themselves the same way, and this is what turns
-- "gate attendanceCron too" into a one-line change in the function instead of a coordinated
-- outage. Run it in the SAME session as the block above, with the same substitutions.
select cron.unschedule('push-attendance-hourly')
 where exists (select 1 from cron.job where jobname = 'push-attendance-hourly');

select cron.schedule(
  'push-attendance-hourly',
  '0 * * * *',
  $$ select net.http_post(
       url     := 'https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/push-send',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>","X-Cron-Key":"<CRON_SECRET>"}'::jsonb,
       body    := '{"mode":"attendanceCron"}'::jsonb
     ) $$
);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='push-usage-hourly')
--    order by start_time desc limit 5;
-- What it sent (one row per device):
--   select sent_at, recipient, where_txt as week_tag, status from push_log
--    where event = 'usageDigest' order by sent_at desc limit 10;
-- A 401 in job_run_details' return_message means CRON_SECRET and the header disagree.
