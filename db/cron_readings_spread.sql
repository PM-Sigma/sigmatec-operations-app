-- ══════════════════════════════════════════════════════════════════════════════
-- ⏰ חולדה readings cron — a different start minute every day (עידן 12.10: "לפזר את שעת הריצה בדקות אקראיות").
-- NOT APPLIED. Replaces the schedule of the `readings-7am` job from db/cron_readings_7am.sql.
--
-- How: pg_cron now pings every 5 minutes inside 04:00–06:55 UTC (covers 07:00–08:45 Israel in summer AND winter).
-- The function (readings-fetch `cron`, helpers.js cronFirstRunDue) starts a site's first run of the day only once
-- Israel time passes 07:00 + an offset of 0–25 min that is fixed per (site, date) and different every day; the
-- window, the "skip a day that already has an ok run" rule and the 30-minute retries are unchanged.
-- Why not a sleep inside the function: an Edge Function invocation must finish in ~150 s (free plan wall clock),
-- so a 0–25 min delay cannot live there. Every ping is cheap (a maintenance query + a no-op decision).
-- Order: deploy readings-fetch (with cronFirstRunDue) FIRST, then run this. With the old function and this
-- schedule, the run would simply start at 07:00 as today.
--
-- BACKUP: the current schedule is '0,30 4-6 * * *' (db/cron_readings_7am.sql). Check before:
--   select jobname, schedule from cron.job where jobname = 'readings-7am';
-- ROLLBACK:
--   select cron.alter_job((select jobid from cron.job where jobname = 'readings-7am'), schedule := '0,30 4-6 * * *');
-- ══════════════════════════════════════════════════════════════════════════════

select cron.alter_job((select jobid from cron.job where jobname = 'readings-7am'), schedule := '*/5 4-6 * * *');

-- Verify:
--   select jobname, schedule, active from cron.job where jobname = 'readings-7am';   -- */5 4-6 * * *
