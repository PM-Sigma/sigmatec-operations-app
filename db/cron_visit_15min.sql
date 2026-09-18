-- ══════════════════════════════════════════════════════════════════════════════
-- 📍 The 2 h visit-summary reminder — the pg_cron half (spec §5.2, Task 5).
--
-- Unlike attendance and the usage digest, this job is NOT hourly: the promise is "two hours
-- after you arrived", and an hourly tick would make that anything from two to three hours.
-- Every quarter of an hour is close enough to feel deliberate and still cheap — the function
-- answers `{"ok":true,"results":[]}` in a few milliseconds when nothing is due.
--
-- ALL the gating lives in push-send's `visitCron` mode (app/src/lib/field.ts
-- `visitCronSelect`, pinned by app/src/lib/field.test.ts), never in the cron expression:
--   · two hours after the check-in, but never later than 20:00 Israel (§7k ג)
--   · nothing between 21:00 and 06:30 Israel (§7k ג)
--   · at most 3 non-digest pushes per person per day, counted from push_log (§7k ג)
--   · a row is nudged AT MOST ONCE (`reminded_at`), and never when the visit is already filed
--
-- ── AUTH ──────────────────────────────────────────────────────────────────────
-- Same pattern as the usage digest (db/cron_usage_weekly.sql): the mode answers only the
-- `X-Cron-Key` header (the `CRON_SECRET` Edge-Function secret) or a live EMS login. Without
-- it anyone holding the PUBLIC anon key could make two people's phones buzz.
--
-- Prod steps, in order (עידן's — DO NOT run this from a task branch):
--   1. Apply db/field_checkins.sql.
--   2. Confirm `CRON_SECRET` exists (Supabase dashboard → Edge Functions → Secrets). It is
--      the same secret db/cron_usage_weekly.sql set up; do NOT generate a second one.
--   3. Substitute `<ANON>` (the PUBLIC anon key — js/src/01-data.js) and `<CRON_SECRET>`,
--      then run this file.
-- ══════════════════════════════════════════════════════════════════════════════

-- Re-running this file must not leave two jobs behind.
select cron.unschedule('push-visit-15min')
 where exists (select 1 from cron.job where jobname = 'push-visit-15min');

select cron.schedule(
  'push-visit-15min',
  '7-52/15 * * * *',    -- 7, 22, 37, 52 — never on the hour, where the attendance ('0') and
                        -- usage ('5') jobs already are
  $$ select net.http_post(
       url     := 'https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/push-send',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>","X-Cron-Key":"<CRON_SECRET>"}'::jsonb,
       body    := '{"mode":"visitCron"}'::jsonb
     ) $$
);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--   select start_time, status, return_message from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'push-visit-15min')
--    order by start_time desc limit 5;
-- What it sent (one row per device):
--   select sent_at, recipient, where_txt as kibbutz, title, status from push_log
--    where event = 'visitCron' order by sent_at desc limit 20;
-- A 401 in return_message means CRON_SECRET and the header disagree.
