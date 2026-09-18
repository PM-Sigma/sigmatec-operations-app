-- ══════════════════════════════════════════════════════════════════════════════
-- `kibbutzim.ems_params` — the result of the EMS verification chain (spec §7b).
--
-- db/kibbutzim.sql shipped `kind`/`parent` for sub-sites but not the third column
-- the spec names, so the ➕ sheet's chain had nowhere to store what it pulled and
-- every sub-site save came back PGRST204 ("column ems_params does not exist").
--
-- Shape written by emsChainReduce (app/src/lib/kibbutzim.ts):
--   { site: {id, name},
--     meters: {electric, water, gas, total},
--     openTasks: n,
--     contacts: [{name, phone}],
--     checkedAt: ISO }
-- Nullable: a kibbutz that was never checked against EMS simply has no params.
-- ══════════════════════════════════════════════════════════════════════════════
alter table kibbutzim add column if not exists ems_params jsonb;

comment on column kibbutzim.ems_params is
  'EMS verification chain snapshot: {site,meters,openTasks,contacts,checkedAt} — spec §7b';
