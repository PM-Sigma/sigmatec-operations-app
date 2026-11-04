-- ══════════════════════════════════════════════════════════════════════════════
-- 📥 CityMind (Arad) — add kibbutz אפיק (same rules as כנרת / אור הנר). NOT APPLIED until עידן approves.
-- How-to: docs/superpowers/specs/2026-10-12-arad-multi-kibbutz-design.md ("how to add an Arad kibbutz").
-- Needs the GitHub secrets AFIK_CITYMIND_USER / AFIK_CITYMIND_PASS (names only here, never values).
-- The readings page tab + manual-run block come from this row (active + rules.source='citymind') — no code change.
-- EMS (4.11): site אפיק has no water meters yet → rows stay "not set up in EMS" until meters are added.
--
-- BACKUP:   create table public.reading_sites_bak_2026_11_04 as select * from public.reading_sites;
--           alter table public.reading_sites_bak_2026_11_04 enable row level security;
-- ROLLBACK: delete from public.reading_sites where kibbutz = 'אפיק'
--             and not exists (select 1 from public.reading_runs r where r.site_id = reading_sites.id);
--           (after runs exist: update public.reading_sites set active = false where kibbutz = 'אפיק';)
-- ══════════════════════════════════════════════════════════════════════════════

insert into public.reading_sites (kibbutz, ems_site_id, active, rules, retention_days)
values ('אפיק', 'bf8fcda4-ebde-45ca-aada-07075989436d', true, $json${
    "source": "citymind", "energy_type_code": 2,
    "max_daily_m3": 100, "spike_factor": 5, "spike_min_m3": 20, "zero_min_avg_daily": 0.0333,
    "avg_min_history_days": 7, "near_zero_m3": 5, "skip": {}, "daily_readings": 1,
    "secrets": { "user": "AFIK_CITYMIND_USER", "pass": "AFIK_CITYMIND_PASS" }
  }$json$::jsonb, 35)
on conflict (kibbutz) do nothing;

-- Verify:
--   select kibbutz, active, ems_site_id, rules->'secrets' secrets, rules->>'daily_readings' daily from public.reading_sites where kibbutz = 'אפיק';
