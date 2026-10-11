-- APPLIED in prod 11.10 by MAIN: 7 compensating movements mov_fix_202610_*; backup public.movements_bak_bugfix_202610; verified all 7 kibbutz balances back to 0 (גניגר E360PP 2). Pool Robustel = -6 → needs a physical count.
-- DRAFT. NOT APPLIED. Do not run until MAIN has run the PREVIEW and the ids below are filled in.
-- Stock reversal for the 4.10-7.10 visit-overwrite bug (fixed in 2.153).
--
-- What went wrong: after a chapters-sheet save the pre-minted visit id was never released, so the next new
-- visit was filed as an EDIT of the previous one. js/src/09-visits.js then diffed the new visit's equipment
-- against the PREVIOUS visit's equipment (priorSnap.products) and, for every item the previous visit had and the
-- new one did not, wrote a "return": movements(from_location = <new kibbutz>, to_location = 'חברה',
-- reason = 'visit_supply_edit', ref_id = <the reused visit id>, created_by = <visitor>).
-- Expected offending rows (backlog 🔴):
--   כפר גלעדי→חברה 3 Robustel + 3 ספק כוח שקע; שלוחות→חברה 50 E360SP; גניגר→חברה 1 E360PP;
--   מעוז חיים→חברה 17 PUSR + 17 ספק כוח פס-דין            (ניתאי, ref_id v_1791390220215_yhblgo)
--   גבים→חברה 1 E360CT                                     (אביאם, ref_id = the גבים visit id)
-- The fix: insert the opposite movements (חברה → <kibbutz>), same product, same qty. History is never
-- updated or deleted (movements is an append-only ledger).
--
-- ── (a) PREVIEW, read-only (run first, send the rows back) ───────────────────────────────────────────
-- select m.id, m.product, m.quantity, m.from_location, m.to_location, m.reason,
--        m.ref_id as visit_id, v.kibbutz as visit_kibbutz, v.visitor, v.date as visit_date,
--        m.created_by, m.date as created_at
-- from movements m
-- left join visits v on v.id = m.ref_id
-- where m.to_location = 'חברה'
--   and m.from_location in ('כפר גלעדי', 'שלוחות', 'גניגר', 'מעוז חיים', 'גבים')
--   and m.reason like 'visit_supply%'
--   and m.date >= '2026-10-03' and m.date < '2026-10-09'
-- order by m.date, m.from_location, m.product;
--
-- -- current stock per affected product, per location (חברה + the five kibbutzim):
-- with p as (
--   select distinct product from movements
--   where to_location = 'חברה' and from_location in ('כפר גלעדי', 'שלוחות', 'גניגר', 'מעוז חיים', 'גבים')
--     and reason like 'visit_supply%' and date >= '2026-10-03' and date < '2026-10-09'
-- ), legs as (
--   select product, to_location as loc, quantity as q from movements
--   union all
--   select product, from_location, -quantity from movements
-- )
-- select l.product, l.loc, sum(l.q) as qty
-- from legs l join p using (product)
-- where l.loc in ('חברה', 'כפר גלעדי', 'שלוחות', 'גניגר', 'מעוז חיים', 'גבים')
-- group by l.product, l.loc
-- order by l.product, l.loc;
--
-- Fill in after the preview: the exact movement ids that are wrong.
--   <ID_1> ... <ID_6>

begin;

-- ── (b) BACKUP ────────────────────────────────────────────────────────────────────────────────────
create table public.movements_bak_reversal_2026_10 as
  select * from movements where id in ('<ID_1>', '<ID_2>', '<ID_3>', '<ID_4>', '<ID_5>', '<ID_6>');

create table public.stock_bak_reversal_2026_10 as
  with legs as (
    select product, to_location as loc, quantity as q from movements
    union all
    select product, from_location, -quantity from movements
  )
  select product, loc, sum(q) as qty from legs
  where product in (select product from public.movements_bak_reversal_2026_10)
  group by product, loc;

-- Backup tables live in `public`, which the REST API exposes: RLS on, no policies = no client access.
alter table public.movements_bak_reversal_2026_10 enable row level security;
alter table public.stock_bak_reversal_2026_10 enable row level security;

-- Sanity: exactly the rows we expect, or stop.
do $$ begin
  if (select count(*) from public.movements_bak_reversal_2026_10) <> 6 then
    raise exception 'expected 6 offending movements, found %', (select count(*) from public.movements_bak_reversal_2026_10);
  end if;
end $$;

-- ── (d) the alert trigger ─────────────────────────────────────────────────────────────────────────
-- The compensating rows move stock OUT of חברה, so inventory_alert_on_movement() would write six 'movement'
-- bell rows and, for any product whose pool drops below products.min_qty, a 'low_stock' alert + an immediate
-- push (inventory_push_low_stock). Those would be false alerts for a ledger correction, so the trigger is off for
-- this transaction only. ALTER TABLE takes a short exclusive lock on movements; the commit re-enables it.
alter table movements disable trigger movements_inventory_alert;

-- ── (c) COMPENSATING inserts: the opposite direction, same product + qty ─────────────────────────────
insert into movements (id, date, product, from_location, to_location, quantity, reason, ref_id, created_by)
select 'mov_fix_202610_' || b.id,
       now()::text,
       b.product,
       b.to_location,            -- 'חברה'
       b.from_location,          -- the kibbutz
       b.quantity,
       'תיקון באג דריסת ביקור 4–7.10',
       b.id,                     -- ref_id → the movement being compensated
       'עידן'
from public.movements_bak_reversal_2026_10 b;

alter table movements enable trigger movements_inventory_alert;

-- ── (e) VERIFY (inside the transaction; COMMIT only if it matches) ──────────────────────────────────
-- 1. every offending row has exactly one compensation, same qty, opposite direction:
select b.id, b.product, b.quantity, c.id as fix_id, c.from_location, c.to_location, c.quantity as fix_qty
from public.movements_bak_reversal_2026_10 b
left join movements c on c.ref_id = b.id and c.reason = 'תיקון באג דריסת ביקור 4–7.10';
-- 2. stock now vs the backup: each kibbutz goes up and חברה goes down by exactly the reversed qty.
with legs as (
  select product, to_location as loc, quantity as q from movements
  union all
  select product, from_location, -quantity from movements
)
select s.product, s.loc, s.qty as before, coalesce(sum(l.q), 0) as after
from public.stock_bak_reversal_2026_10 s
left join legs l on l.product = s.product and l.loc = s.loc
where s.loc in ('חברה', 'כפר גלעדי', 'שלוחות', 'גניגר', 'מעוז חיים', 'גבים')
group by s.product, s.loc, s.qty
order by s.product, s.loc;
-- 3. the trigger is back on:
select tgname, tgenabled from pg_trigger where tgname = 'movements_inventory_alert';   -- 'O'

commit;   -- or ROLLBACK; if any check above is wrong

-- ── ROLLBACK (after commit) ─────────────────────────────────────────────────────────────────────────
-- The ledger is append-only, so undoing the fix = removing ONLY the compensation rows this file added:
-- begin;
-- delete from movements where reason = 'תיקון באג דריסת ביקור 4–7.10' and id like 'mov_fix_202610_%';
-- commit;
-- drop table if exists public.movements_bak_reversal_2026_10;
-- drop table if exists public.stock_bak_reversal_2026_10;
