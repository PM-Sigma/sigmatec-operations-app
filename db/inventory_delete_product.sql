-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  🗑 item delete cascade — package I (inventory rewrite), task L7               ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
-- Ruling ("delete item", round-5 design spec + the 23.9 evening grill, binding for I/V/K):
--   A removed item is deleted COMPLETELY: the item itself, its movements, recounts, alerts,
--   returns, and its lines in visits, requirements and AI examples (parse_corrections). An
--   order left with no lines after the delete is deleted too.
--   Issued delivery certificates stay EXACTLY as they are, lines included — a signed customer
--   record is immutable, full stop. This SQL never writes to delivery_certs at all (not even a
--   line trim): the preview below still reports which certs reference the item, for
--   transparency on the confirmation screen, but the delete function does not touch the table.
--
-- Two calls, so the confirmation screen can never delete something the user didn't just see:
--   inventory_delete_preview(p_name)              → the counts + a fingerprint (md5 of itself)
--   inventory_delete_product(p_name, p_fingerprint) → recomputes the preview and ABORTS with
--     `inventory_changed` if anything moved since; otherwise deletes in one transaction.
-- Both SECURITY DEFINER: delivery_certs (read-only here) and several of these tables have no
-- client delete policy on purpose, and this is the one audited path.
--
-- Client gate (D5): עידן only, checked here too — inventory_delete_guard() refuses the viewer
-- claim outright, and refuses everyone but עידן once package X adds a per-person `name` claim
-- to the JWT (today's tokens carry no such claim, so the check is a no-op until then — the
-- CLIENT'S own עידן-only gate is what actually holds the line meanwhile; see risk §10 #6 in the
-- round-5 inventory spec).
--
-- PRODUCTION APPLY WAITS FOR עידן's EXPLICIT "כן" (this file is written, never run against the
-- live database from this worktree). The real-world rollout target right now is narrower than
-- "any item": the one thing עידן actually wants gone today is the EMPTY item (no name/category,
-- the P13 toggle-bug artifact) — SIM items stay archived (active=false), not deleted. The
-- function itself stays generic (works by name, for any product), because a narrower one would
-- have to be rewritten the day a second item needs the same treatment.
-- Test: db/tests/inventory_delete_product.test.sql — a Supabase BRANCH only, never main
-- (delivery_certs.cert_number is a sequence; a rolled-back transaction does not return a
-- consumed value, so this can never run inside a plain local transaction test against a shared
-- sequence without leaving a gap — a branch is disposable, main is not).

create or replace function public.inventory_line_name(e jsonb) returns text
language sql immutable as $$
  select case when jsonb_typeof(e) = 'string' then e #>> '{}' else e ->> 'name' end
$$;

create or replace function public.inventory_delete_guard() returns void
language plpgsql stable as $$
begin
  if coalesce(auth.jwt() ->> 'viewer', 'false') = 'true' then
    raise exception 'viewer' using errcode = '42501';
  end if;
  -- package X adds a per-person `name` claim; from that day only עידן passes. Until then no
  -- token carries the claim at all, so this half is a no-op (the client's עידן-only gate is
  -- what holds the line meanwhile — risk §10 #6 in the round-5 inventory spec).
  if (auth.jwt() ? 'name') and (auth.jwt() ->> 'name') is distinct from 'עידן' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

create or replace function public.inventory_delete_preview(p_name text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.inventory_delete_guard();
  with
  o as (select x.id, bool_and(public.inventory_line_name(e) = p_name) as only_this
        from orders x cross join lateral jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e
        group by x.id having bool_or(public.inventory_line_name(e) = p_name)),
  -- delivery_certs is NEVER touched by the delete (binding ruling) — this is read-only,
  -- informational for the confirmation screen ("N certs mention this item; they are not
  -- changed"), not a plan for a write the delete function below does not perform.
  c as (select x.cert_number, x.status
        from delivery_certs x cross join lateral jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e
        where public.inventory_line_name(e) = p_name),
  r as (select x.id, bool_and(public.inventory_line_name(e) = p_name) as only_this
        from requirements x cross join lateral jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e
        group by x.id having bool_or(public.inventory_line_name(e) = p_name)),
  vi as (select distinct x.id from visits x cross join lateral jsonb_array_elements(coalesce(x.products, '[]'::jsonb)) e
         where public.inventory_line_name(e) = p_name),
  pc as (select distinct x.id from parse_corrections x cross join lateral jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e
         where public.inventory_line_name(e) = p_name)
  select jsonb_build_object(
    'product', p_name,
    'exists', (select count(*) from products where name = p_name),
    'movements', (select count(*) from movements where product = p_name),
    'orders_deleted', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from o where only_this),
    'orders_trimmed', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from o where not only_this),
    -- informational only (see the `c` CTE's comment) — never deleted, never trimmed.
    'certs_referencing', (select coalesce(jsonb_agg(cert_number order by cert_number), '[]'::jsonb) from c),
    'certs_referencing_active', (select coalesce(jsonb_agg(cert_number order by cert_number), '[]'::jsonb) from c where status <> 'cancelled'),
    'visits_trimmed', (select count(*) from vi),
    'requirements_deleted', (select count(*) from r where only_this),
    'requirements_trimmed', (select count(*) from r where not only_this),
    'returns', (select count(*) from returns where product = p_name),
    'recounts', (select count(*) from stock_recounts where product = p_name),
    'alerts', (select count(*) from inventory_alerts where product = p_name),
    'parse_examples', (select count(*) from pc)
  ) into v;
  return v || jsonb_build_object('fingerprint', md5(v::text));
end $$;

create or replace function public.inventory_delete_product(p_name text, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  v := public.inventory_delete_preview(p_name);
  if v ->> 'fingerprint' is distinct from p_fingerprint then
    raise exception 'inventory_changed' using errcode = 'P0001', hint = 'הנתונים השתנו מאז התצוגה';
  end if;

  delete from movements where product = p_name;
  delete from stock_recounts where product = p_name;
  delete from inventory_alerts where product = p_name;
  delete from returns where product = p_name;

  -- orders: whole rows whose EVERY line is this item (D2), then trim the rest.
  delete from orders x where x.id in (select value #>> '{}' from jsonb_array_elements(v -> 'orders_deleted'));
  update orders x set items = (
      select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
      from jsonb_array_elements(x.items) with ordinality t(e, i)
      where public.inventory_line_name(e) is distinct from p_name
    ), last_updated = now()::text
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);

  -- delivery_certs: DELIBERATELY ABSENT. The binding ruling is "issued delivery certificates
  -- stay exactly as they are, lines included" — no delete, no line trim, not even for a cert
  -- that becomes "only this item" (unlike orders/requirements, which DO empty out).

  delete from requirements x
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name)
      and not exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) is distinct from p_name);
  update requirements x set items = (
      select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
      from jsonb_array_elements(x.items) with ordinality t(e, i)
      where public.inventory_line_name(e) is distinct from p_name
    ), last_updated = now()::text
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);

  -- visits: the equipment LINE is removed; summary/open_items (the text the visit is really
  -- remembered by) are untouched. A visit row is never deleted, even if products empties out.
  update visits x set products = (
      select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
      from jsonb_array_elements(x.products) with ordinality t(e, i)
      where public.inventory_line_name(e) is distinct from p_name
    )
    where exists (select 1 from jsonb_array_elements(coalesce(x.products, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);

  delete from parse_corrections x
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name)
      and not exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) is distinct from p_name);
  update parse_corrections x set items = (
      select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
      from jsonb_array_elements(x.items) with ordinality t(e, i)
      where public.inventory_line_name(e) is distinct from p_name
    )
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);

  delete from products where name = p_name;
  return v;
end $$;

revoke all on function public.inventory_delete_preview(text) from public, anon;
revoke all on function public.inventory_delete_product(text, text) from public, anon;
grant execute on function public.inventory_delete_preview(text) to authenticated;
grant execute on function public.inventory_delete_product(text, text) to authenticated;
