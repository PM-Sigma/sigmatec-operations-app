-- NOT APPLIED. עידן applies it in the Supabase SQL editor. Round 5, grill round 5 answers (binding for V),
-- "Consequence for the inventory breakpoint" — REPLACES V-L4a's original "equipment locked before the breakpoint"
-- rule:
--   September visits dated before the breakpoint (1-23.9) stay editable, INCLUDING equipment. Their original supply
--   movements are in `archive.movements_pre_breakpoint` (2.29, CHANGELOG: 159 rows archived, replaced by 81
--   opening_balance rows). When one of those visits changes equipment, the stock difference must be computed
--   against the ARCHIVED movement, not the live `movements` ledger — because the live ledger no longer has that
--   visit's original `visit_supply` row (it was folded into an aggregate opening_balance), so a naive "look up the
--   old movement by ref_id in `movements`" finds nothing and posts the visit's WHOLE new quantity as if it were an
--   addition on top of the opening balance, double counting stock that opening_balance already includes.
--
-- `archive.movements_pre_breakpoint` is not exposed to the client (no PostgREST route, not part of the anon/
-- authenticated schema search path for REST). This file adds ONE narrow, read-only, SECURITY DEFINER RPC so the visit
-- pipeline can read just what it needs — a single visit's own original quantities — without exposing the archive
-- table itself. It changes nothing else: `app/src/lib/inventory.ts` / `computeStock()` still read `public.movements`
-- only, exactly as `docs/superpowers/specs/2026-09-23-r5-I-inventory.md` rules ("archive.movements_pre_breakpoint is
-- never read" — that line is about STOCK REPORTING; this RPC is the one, narrow exception for a pre-breakpoint
-- VISIT EDIT's delta, per עידן's later ruling. Tell package I.).
--
-- Idempotent: `create or replace function`, grants re-applied.
begin;

-- The net quantity this visit originally supplied per product, from the ARCHIVED ledger. A visit's `visit_supply`
-- (and any `visit_supply_edit` made before the archive cut, though none are expected) moved stock FROM the pool
-- (`חברה`) TO the kibbutz; net per product = sum(quantity) where to_location <> 'חברה' minus sum where from_location
-- <> 'חברה' — written generically so it is correct even if a row's direction was ever reversed (a return).
create or replace function public.archive_visit_products(p_visit_id text)
returns table(product text, qty numeric)
language sql
stable
security definer
set search_path = public, archive
as $$
  select m.product,
         sum(case when m.to_location <> 'חברה' then m.quantity else 0 end)
           - sum(case when m.from_location <> 'חברה' then m.quantity else 0 end) as qty
  from archive.movements_pre_breakpoint m
  where m.ref_id = p_visit_id
    and m.reason in ('visit_supply', 'visit_supply_edit')
  group by m.product
  having sum(case when m.to_location <> 'חברה' then m.quantity else 0 end)
       - sum(case when m.from_location <> 'חברה' then m.quantity else 0 end) <> 0;
$$;

comment on function public.archive_visit_products(text) is
  'Round 5 V20 (replaced rule): a single visit''s original pre-breakpoint supply, from archive.movements_pre_breakpoint. '
  'SECURITY DEFINER because the archive schema is not on the client search path. Used only by the visit-edit stock '
  'diff for visits dated 1-23.9.2026; never by stock reporting.';

revoke all on function public.archive_visit_products(text) from public;
grant execute on function public.archive_visit_products(text) to authenticated;

commit;

-- Verify
-- 1. pick a real pre-breakpoint visit id with products and confirm it returns rows:
-- select * from public.archive_visit_products('<a visit id dated before 2026-09-23>');
-- 2. a visit with no archived movements returns zero rows (not an error):
-- select * from public.archive_visit_products('does-not-exist');
-- 3. the anon role cannot call it directly (expect a permission error), only `authenticated`:
-- set role anon; select * from public.archive_visit_products('x'); reset role;

-- ROLLBACK
-- revoke execute on function public.archive_visit_products(text) from authenticated;
-- drop function if exists public.archive_visit_products(text);
