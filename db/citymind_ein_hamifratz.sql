-- ══════════════════════════════════════════════════════════════════════════════
-- 📥 עין המפרץ — daily CityMind (Arad) water readings (feature `citymind-ein-hamifratz`).
-- NOT APPLIED. MAIN audits and applies (after db/readings_pull.sql, which created the tables).
--
-- Reuses the readings-pull tables: one reading_sites row, NO reading_sources rows (the fetch runs on GitHub Actions
-- and arrives through readings-fetch `ingest`), runs in reading_runs, the history in reading_values.
-- `rules.source = 'citymind'` is what the function keys on: no on-demand pull, no pg_cron run for this site, and the
-- files are signed for download only after the run was checked against the system (emsCheck).
--
-- Rules (spec + citymind_daily.py config.json + build_month.py):
--   energy_type_code 2 = water · max_daily_m3 100 (warn) · spike ×5 and +20 m³ above the daily average (warn) ·
--   zero consumption while the average is above 1 m³ a month (warn) · a drop vs the last saved reading (block; a drop
--   to below 5 m³ is labelled "probably a meter replacement") · negative (block) · not in the system for the site
--   (block, via EMS validate) · the skip-list below (block).
--
-- BACKUP: a new row in an existing table, nothing existing is altered → no backup needed. To be safe:
--   create table public.reading_sites_bak_2026_10 as select * from public.reading_sites;
--   alter table public.reading_sites_bak_2026_10 enable row level security;
--
-- ROLLBACK:
--   delete from public.reading_values where site_id = (select id from public.reading_sites where kibbutz = 'עין המפרץ');
--   delete from public.reading_runs   where site_id = (select id from public.reading_sites where kibbutz = 'עין המפרץ');
--   -- Storage: remove the files under readings/<that site id>/ (dashboard or Storage API) before deleting the runs' rows.
--   delete from public.reading_sites  where kibbutz = 'עין המפרץ';
--   drop table if exists public.reading_sites_bak_2026_10;
-- ══════════════════════════════════════════════════════════════════════════════

insert into public.reading_sites (kibbutz, ems_site_id, active, rules, retention_days)
values (
  'עין המפרץ',
  '5535f354-7a39-4364-a929-e16ad8e4bd07',
  true,
  $json${
    "source": "citymind",
    "energy_type_code": 2,
    "max_daily_m3": 100,
    "spike_factor": 5,
    "spike_min_m3": 20,
    "zero_min_avg_daily": 0.0333,
    "avg_min_history_days": 7,
    "near_zero_m3": 5,
    "skip": { "13723897": "מקבל קריאות שעתיות במערכת ממקור אחר (90005) — לא מעלים כפול" },
    "stage": 1
  }$json$::jsonb,
  35
)
on conflict (kibbutz) do nothing;

-- Verify:
--   select kibbutz, ems_site_id, active, rules->>'source' as source, rules->'skip' as skip from public.reading_sites order by kibbutz;
--   select count(*) from public.reading_sources s join public.reading_sites t on t.id = s.site_id where t.kibbutz = 'עין המפרץ';  -- 0
