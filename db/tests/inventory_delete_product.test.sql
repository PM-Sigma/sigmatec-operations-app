-- Supabase BRANCH only — never against main (delivery_certs.cert_number is a sequence; a
-- rollback does not return a consumed value). Apply db/inventory_delete_product.sql first.
--   1. supabase branches create --experimental (or the dashboard) → a disposable project
--   2. psql/SQL editor on that branch: apply inventory_delete_product.sql, then this file
--   3. supabase branches delete afterwards
begin;

insert into products(id, name, category, active) values ('t-p1', '__DEL__', 'מונה', true), ('t-p2', '__KEEP__', 'מונה', true);
insert into movements(id, date, product, from_location, to_location, quantity, reason, ref_id, created_by) values
  ('t-m1', '2026-09-23', '__DEL__', 'ספק', 'חברה', 5, 'order_delivery', 't-o1', 't'),
  ('t-m2', '2026-09-23', '__KEEP__', 'ספק', 'חברה', 3, 'order_delivery', 't-o2', 't');
insert into orders(id, status, items) values
  ('t-o1', 'delivered', '[{"name":"__DEL__","qty":5}]'),
  ('t-o2', 'delivered', '[{"name":"__DEL__","qty":1},{"name":"__KEEP__","qty":3}]');
insert into returns(id, date, kibbutz, visitor, product, qty, status) values ('t-r1', '2026-09-23', 'ת', 'ת', '__DEL__', 1, 'open');
insert into stock_recounts(id, date, product, before, counted, delta, note) values ('t-sc1', '2026-09-23', '__DEL__', 5, 4, -1, 'ת');
insert into inventory_alerts(id, kind, product, qty, to_location, reason, actor, created_at) values ('t-ia1', 'movement', '__DEL__', 5, 'חברה', 'order_delivery', 'ת', now());
-- the ONE table this delete must never write to (binding ruling): two certs, one whose ONLY
-- line is the deleted item — it must survive with that line intact, exactly as issued.
insert into delivery_certs(kibbutz, items, status) values
  ('t', '[{"name":"__DEL__","qty":1}]', 'active'),
  ('t', '[{"name":"__KEEP__","qty":1},{"name":"__DEL__","qty":2}]', 'active');
insert into visits(id, kibbutz, date, visitor, products, summary) values ('t-v1', 't', '2026-09-23', 't', '[{"name":"__DEL__","qty":2},"__KEEP__"]', 'סיכום נשאר');
insert into requirements(id, kibbutz, items, status) values ('t-req1', 't', '[{"name":"__DEL__","qty":1}]', 'open');
insert into parse_corrections(id, raw_text, items) values ('t-pc1', 'ת', '[{"name":"__DEL__","qty":1}]');

do $$
declare v jsonb; cert_only_del bigint; cert_mixed bigint;
declare cert_only_del_items jsonb; cert_mixed_items jsonb;
begin
  select cert_number, items into cert_only_del_items from delivery_certs where kibbutz = 't' and items = '[{"name":"__DEL__","qty":1}]'::jsonb;
  select min(cert_number) into cert_only_del from delivery_certs where kibbutz = 't' and items @> '[{"name":"__DEL__","qty":1}]'::jsonb and jsonb_array_length(items) = 1;
  select min(cert_number) into cert_mixed from delivery_certs where kibbutz = 't' and jsonb_array_length(items) = 2;

  v := public.inventory_delete_preview('__DEL__');
  assert (v ->> 'movements')::int = 1, 'movements count: ' || (v ->> 'movements');
  assert v -> 'orders_deleted' = '["t-o1"]'::jsonb, 'orders_deleted ' || (v -> 'orders_deleted')::text;
  assert v -> 'orders_trimmed' = '["t-o2"]'::jsonb, 'orders_trimmed';
  assert v -> 'certs_referencing' = jsonb_build_array(cert_only_del, cert_mixed), 'certs_referencing ' || (v -> 'certs_referencing')::text;
  assert (v ->> 'visits_trimmed')::int = 1, 'visits_trimmed';
  assert (v ->> 'requirements_deleted')::int = 1, 'requirements_deleted (t-req1 is ONLY __DEL__)';
  assert (v ->> 'returns')::int = 1, 'returns';
  assert (v ->> 'recounts')::int = 1, 'recounts';
  assert (v ->> 'alerts')::int = 1, 'alerts';
  assert (v ->> 'parse_examples')::int = 1, 'parse_examples';

  -- a stale fingerprint (the data changed since the preview) must abort, not delete.
  begin
    perform public.inventory_delete_product('__DEL__', 'stale');
    raise exception 'stale fingerprint was accepted';
  exception when raise_exception then
    if sqlerrm <> 'inventory_changed' then raise; end if;
  end;

  perform public.inventory_delete_product('__DEL__', v ->> 'fingerprint');

  assert not exists (select 1 from products where name = '__DEL__'), 'product gone';
  assert not exists (select 1 from movements where product = '__DEL__'), 'movements gone';
  assert exists (select 1 from movements where id = 't-m2'), 'other movements kept';
  assert not exists (select 1 from orders where id = 't-o1'), 'emptied order deleted';
  assert (select items from orders where id = 't-o2') = '[{"name":"__KEEP__","qty":3}]'::jsonb, 'order trimmed';
  assert not exists (select 1 from returns where id = 't-r1'), 'return deleted';
  assert not exists (select 1 from stock_recounts where id = 't-sc1'), 'recount deleted';
  assert not exists (select 1 from inventory_alerts where id = 't-ia1'), 'alert deleted';
  assert not exists (select 1 from requirements where id = 't-req1'), 'emptied requirement deleted';
  assert not exists (select 1 from parse_corrections where id = 't-pc1'), 'emptied parse example deleted';

  -- the binding ruling, proven: BOTH certs are completely untouched — even the one whose only
  -- line is the item just deleted keeps that line, verbatim.
  assert (select items from delivery_certs where cert_number = cert_only_del) = '[{"name":"__DEL__","qty":1}]'::jsonb, 'the only-this-item cert must keep its line unchanged';
  assert (select items from delivery_certs where cert_number = cert_mixed) = '[{"name":"__KEEP__","qty":1},{"name":"__DEL__","qty":2}]'::jsonb, 'the mixed cert must keep BOTH lines unchanged';
  assert (select count(*) from delivery_certs where kibbutz = 't') = 2, 'no cert was deleted';

  assert (select products from visits where id = 't-v1') = '["__KEEP__"]'::jsonb, 'visit line trimmed';
  assert (select summary from visits where id = 't-v1') = 'סיכום נשאר', 'visit summary kept';
end $$;

rollback;
