-- ══════════════════════════════════════════════════════════════════════════════
-- 📥 CityMind (Arad) — kibbutz עין השופט. APPLIED 11.11.26 (עידן asked).
-- The reading_sites row already existed (created 12.10, active=false, same rules as אור הנר, 0 runs) — only switched on.
-- Secrets EINHASHOFET_CITYMIND_USER / EINHASHOFET_CITYMIND_PASS set by עידן 11.11 (names only here, never values).
-- PROBE 11.11: 619 meters; "קריאות יומיות" 1 and 5 = 1 reading/meter/day. Dry + live run 10.11: 619 rows, 0 blocked/warn.
-- EMS (11.11): site עין השופט (0ab92b61…) has no water meters yet → the EMS check marks rows "not set up" until meters are added.
--
-- BACKUP:   public.reading_sites_bak_2026_11_11 (6 rows, RLS on)
-- ROLLBACK: update public.reading_sites set active = false where kibbutz = 'עין השופט';
-- ══════════════════════════════════════════════════════════════════════════════

update public.reading_sites set active = true where kibbutz = 'עין השופט' and active = false;

-- Verify:
--   select kibbutz, active, ems_site_id, rules->'secrets' secrets, rules->>'daily_readings' daily from public.reading_sites where kibbutz = 'עין השופט';
