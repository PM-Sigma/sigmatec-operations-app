-- readings_rules_v13.sql — daily readings pull, rules v1.3 (עידן, 29.9.26). NOT APPLIED YET — apply on MAIN's production DB
-- after the readings-fetch function is redeployed (the old function ignores the new keys, the new one falls back to the
-- same defaults, so the order is not critical).
--
-- BACKUP first (copy the result somewhere):
--   select kibbutz, rules from public.reading_sites order by kibbutz;
--   -- expected for חולדה: {"spike_factor":5,"spike_min_kwh":50,"frozen_days":3}
--
-- ROLLBACK:
--   update public.reading_sites
--      set rules = '{"spike_factor":5,"spike_min_kwh":50,"frozen_days":3}'::jsonb
--    where kibbutz = 'חולדה';
--   alter table public.reading_sites alter column rules
--     set default '{"spike_factor":5,"spike_min_kwh":50,"frozen_days":3}'::jsonb;

begin;

update public.reading_sites
   set rules = '{"max_daily_kwh":500,"spike_factor":5,"spike_min_history_days":30,"spike_min_kwh":50,"frozen_days":3}'::jsonb
 where kibbutz = 'חולדה';

alter table public.reading_sites alter column rules
  set default '{"max_daily_kwh":500,"spike_factor":5,"spike_min_history_days":30,"spike_min_kwh":50,"frozen_days":3}'::jsonb;

commit;

-- verify: select kibbutz, rules from public.reading_sites where kibbutz = 'חולדה';
