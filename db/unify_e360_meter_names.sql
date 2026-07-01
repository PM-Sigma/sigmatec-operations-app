-- Unify Landis E360PP / E360SP meter names (2026-07-01)
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: the by-location inventory + reports showed the SAME meter under several
-- name strings, because movements/visits were written with drifting names:
--   E360PP:  "Landis+Gyr E360PP" · "מונה E360PP" · "מונה 360PP" · "<garbled> E360PP"
--   E360SP:  "Landis+Gyr E360SP" · "מונה E360SP"               · "<garbled> E360SP"
-- Canonical (English catalog name + מונה prefix, per request):
--   "מונה Landis+Gyr E360PP"  and  "מונה Landis+Gyr E360SP"
--
-- Run in the Supabase SQL editor (service_role — bypasses RLS). Transactional:
-- review the pre/post SELECT output; COMMIT only if the post-counts look right.
--
-- ⚠️ STEP 1 DELETES two movement rows. They are byte-CORRUPTED DUPLICATES of
-- clean rows entered 3 minutes later by עידן (same qty/meter, destination
-- "אביאם" garbled to replacement chars). Keeping them would DOUBLE the stock
-- (SP 135→270, PP 10→20). Deleting them is what makes the totals correct.
--     mov_1781426327919_ezaa : "<garbled> E360SP" 135  (dup of mov_1781426485871_w72x)
--     mov_1781426329912_yj7r : "<garbled> E360PP"  10  (dup of mov_1781426488064_d1l3)
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- Pre-check: every name variant currently in the ledger for these two meters
select 'BEFORE' as phase, product, count(*) rows, sum(quantity) qty
from movements where product like '%360PP%' or product like '%360SP%'
group by product order by product;

-- 1) Drop the corrupted duplicate rows (clean re-entries already exist).
delete from movements where id in ('mov_1781426327919_ezaa','mov_1781426329912_yj7r');

-- 2) Fold every remaining name variant into the canonical catalog name.
--    LIKE '%360PP%' / '%360SP%' catches EN, מונה-short, 360-without-E, all in one.
update movements set product = 'מונה Landis+Gyr E360PP' where product like '%360PP%';
update movements set product = 'מונה Landis+Gyr E360SP' where product like '%360SP%';

-- 3) Visit reports: rewrite matching element names inside the products jsonb array
--    (order + all other items preserved).
update visits v
set products = (
  select jsonb_agg(
    case
      when e->>'name' like '%360PP%' then jsonb_set(e, '{name}', '"מונה Landis+Gyr E360PP"'::jsonb)
      when e->>'name' like '%360SP%' then jsonb_set(e, '{name}', '"מונה Landis+Gyr E360SP"'::jsonb)
      else e
    end)
  from jsonb_array_elements(v.products) e)
where exists (
  select 1 from jsonb_array_elements(v.products) e
  where e->>'name' like '%360PP%' or e->>'name' like '%360SP%');

-- 4) Returns (equipment returns) — currently empty; guard in case one is added first.
update returns set product = 'מונה Landis+Gyr E360PP' where product like '%360PP%';
update returns set product = 'מונה Landis+Gyr E360SP' where product like '%360SP%';

-- 5) Catalog: add מונה to the English name (the "delete the redundant Hebrew" is
--    satisfied by folding above — there was only ONE catalog row per meter).
update products set name = 'מונה Landis+Gyr E360PP' where name = 'Landis+Gyr E360PP';
update products set name = 'מונה Landis+Gyr E360SP' where name = 'Landis+Gyr E360SP';

-- Post-check: should show ONLY the two canonical names, zero other variants.
select 'AFTER' as phase, product, count(*) rows, sum(quantity) qty
from movements where product like '%360PP%' or product like '%360SP%'
group by product order by product;

-- No remaining short/garbled trace anywhere (expect 0 rows):
select 'LEFTOVER' as phase, product from movements
where (product like '%360PP%' or product like '%360SP%')
  and product not in ('מונה Landis+Gyr E360PP','מונה Landis+Gyr E360SP');

commit;
-- If anything looked wrong above, run `rollback;` instead of relying on commit.
