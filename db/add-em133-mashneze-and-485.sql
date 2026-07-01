-- Add "EM133 משנ"ז" (fix name) + new "בקר 485" product, with ניתאי's initial stock (2026-07-01)
-- Run in the Supabase SQL editor. Transactional — review the SELECT at the end, commit/rollback.
begin;

-- 1) Fix the product you already added: category "מונה" should carry the מונה prefix in the
--    name too (matches the מונה Landis+Gyr E360PP/SP convention from the last fix).
update products set name = 'מונה EM133 משנ"ז' where id = 'prod_1782921630040_s3pwln';

-- 2) New catalog product: controller "בקר 485"
insert into products (id, name, category, active, created_at, created_by)
values ('prod_1782921700000_bkr485', 'בקר 485', 'בקר', true, now()::text, 'עידן');

-- 3) Initial stock for ניתאי (no source location — this is the "starting balance" pattern
--    already used for אביאם/ניתאי elsewhere in the ledger; the by-location/kibbutz-inventory
--    views read the SUM of movements, so an item with zero movements never shows up there —
--    that's why the 2/3 units didn't appear anywhere yet).
insert into movements (id, date, product, from_location, to_location, quantity, reason, created_by)
values
  ('mov_1782921700001_nitai_em133mz', now()::text, 'מונה EM133 משנ"ז', '', 'ניתאי', 2, 'מלאי התחלתי ניתאי', 'עידן'),
  ('mov_1782921700002_nitai_bkr485',  now()::text, 'בקר 485',           '', 'ניתאי', 3, 'מלאי התחלתי ניתאי', 'עידן');

-- 4) +1 בקר PUSR לניתאי (מוצר קיים בקטלוג; שם התנועה "בקר PUSR" — כבר בשימוש בלדג'ר, לא
--    שם הקטלוג "PUSR Controller". ניתאי נמצא כרגע ב-0 בפועל, אז זו תוספת ולא מלאי התחלתי.)
insert into movements (id, date, product, from_location, to_location, quantity, reason, created_by)
values
  ('mov_1782921700003_nitai_pusr1', now()::text, 'בקר PUSR', '', 'ניתאי', 1, 'תוספת מלאי ניתאי', 'עידן');

-- Verify: should show the fixed name once, the new product, and all three stock rows.
select 'products' as tbl, id, name, category from products where id in ('prod_1782921630040_s3pwln','prod_1782921700000_bkr485')
union all
select 'movements', id, product, to_location from movements where id in ('mov_1782921700001_nitai_em133mz','mov_1782921700002_nitai_bkr485','mov_1782921700003_nitai_pusr1');

commit;
-- If anything looks wrong above, run `rollback;` instead.
