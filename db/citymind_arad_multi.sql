-- ══════════════════════════════════════════════════════════════════════════════
-- 📥 CityMind (Arad) for many kibbutzim (feature `arad-multi-kibbutz`). NOT APPLIED. MAIN audits and applies.
-- Design: docs/superpowers/specs/2026-10-12-arad-multi-kibbutz-design.md
--
-- ORDER (MANDATORY): this file FIRST → then deploy readings-fetch → then merge the workflow.
--   (the new function reads reading_runs.raw_file, and the workflow's site list needs rules.secrets — without them
--    עין המפרץ would silently drop out of the matrix.)
--
-- 1. reading_runs.raw_file — stage A: the raw CityMind export as downloaded (Storage bucket `readings`, private,
--    `<site_id>/<date>/raw-citymind.csv`). Readable to clients as a PATH only; the file itself only via a signed URL.
-- 2. עין המפרץ: rules.secrets = the NAMES of its two GitHub secrets (already set in GitHub), daily_readings = 1
--    (one reading a day — as today; switch to the verified "5 a day" value after the PROBE run, see the spec).
-- 3. אור הנר, עין השופט: config rows, INACTIVE (no secrets yet). Activate per the spec's "how to add a kibbutz".
--
-- BACKUP: create table public.reading_sites_bak_2026_10_12 as select * from public.reading_sites;
--         alter table public.reading_sites_bak_2026_10_12 enable row level security;
-- ROLLBACK:
--   update public.reading_sites s set rules = b.rules from public.reading_sites_bak_2026_10_12 b where b.id = s.id;
--   delete from public.reading_sites where kibbutz in ('אור הנר', 'עין השופט') and not exists (select 1 from public.reading_runs r where r.site_id = reading_sites.id);
--   alter table public.reading_runs drop column if exists raw_file;   -- remove Storage files */raw-citymind.csv first
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.reading_runs add column if not exists raw_file text;
grant select (raw_file) on public.reading_runs to authenticated;

update public.reading_sites
   set rules = rules || $json${
     "secrets": { "user": "EINHAMIFRATZ_CITYMIND_USER", "pass": "EINHAMIFRATZ_CITYMIND_PASS" },
     "daily_readings": 1
   }$json$::jsonb
 where kibbutz = 'עין המפרץ';

-- Same rules as עין המפרץ (water, energy type 2); skip-list empty until the kibbutz says otherwise.
insert into public.reading_sites (kibbutz, ems_site_id, active, rules, retention_days)
select k, sid, false, $json${
    "source": "citymind", "energy_type_code": 2,
    "max_daily_m3": 100, "spike_factor": 5, "spike_min_m3": 20, "zero_min_avg_daily": 0.0333,
    "avg_min_history_days": 7, "near_zero_m3": 5, "skip": {}, "daily_readings": 1
  }$json$::jsonb || jsonb_build_object('secrets', jsonb_build_object('user', p || '_CITYMIND_USER', 'pass', p || '_CITYMIND_PASS')), 35
from (values
  ('אור הנר',   '9d755469-c2f7-4abd-9a48-88d1b07c3146'::uuid, 'ORHANER'),
  ('עין השופט', '0ab92b61-53fc-426d-ac44-67f3406b87fb'::uuid, 'EINHASHOFET')
) v(k, sid, p)
on conflict (kibbutz) do nothing;

-- Verify:
--   select kibbutz, active, rules->>'source' src, rules->'secrets' secrets, rules->>'daily_readings' daily from public.reading_sites order by kibbutz;
--   select column_name from information_schema.columns where table_name = 'reading_runs' and column_name = 'raw_file';
