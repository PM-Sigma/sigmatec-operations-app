-- The inventory "just works" until the stock count: ONE switch, settings row `stock_enforced`.
--   false  = no low-stock alerts / banners / red lines / digests, no catalog block on orders, negatives are fine.
--   true (or row missing) = the pre-switch behaviour.
-- Owner: stock and item list are not accurate yet. Flip back with:
--   update public.settings set value = 'true'::jsonb where key = 'stock_enforced';
-- Client reads it from the settings snapshot (sigma.stockEnforced → SigmaInv.stockEnforced). push-send must read the
-- same row (see the CHANGELOG entry: inventoryAlert / inventoryDigest return `skipped` when it is false).
--
-- BACKUP: nothing destructive. The function body below is replaced — old body is in db/inventory_pool_v2.sql.
-- ROLLBACK: delete from public.settings where key = 'stock_enforced';
--           then re-run db/inventory_pool_v2.sql to restore the trigger function body.
-- NOTE: movements_inventory_alert is currently DISABLED in prod (tgenabled='D'). This file does NOT enable it; it
-- only makes the function inert while the switch is off, so re-running old SQL (which re-creates + re-arms the
-- trigger) can no longer raise alerts.

insert into public.settings (key, value, updated_at)
values ('stock_enforced', 'false'::jsonb, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
on conflict (key) do nothing;   -- never overwrite a later manual flip

create or replace function public.inventory_alert_on_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_min numeric;
  v_pool numeric;
begin
  -- the switch: off → no alert rows, no push
  if coalesce((select s.value = 'false'::jsonb from settings s where s.key = 'stock_enforced'), false) then
    return new;
  end if;
  begin
    insert into inventory_alerts (kind, product, qty, from_location, to_location, reason, ref_id, actor)
    values ('movement', new.product, new.quantity, new.from_location, new.to_location, new.reason, new.ref_id, new.created_by);

    -- Low stock is about the POOL only: a kibbutz holding few units is not our shortage.
    if new.from_location = 'חברה' or new.to_location = 'חברה' then
      select p.min_qty into v_min from products p where p.name = new.product and coalesce(p.active, true) limit 1;
      if v_min is not null then
        v_pool := pool_qty(new.product);
        if v_pool < v_min then
          if not exists (
            select 1 from inventory_alerts a
            where a.kind = 'low_stock' and a.product = new.product
              and a.created_at > now() - interval '12 hours'
          ) then
            insert into inventory_alerts (kind, product, qty, to_location, reason, ref_id, actor)
            values ('low_stock', new.product, v_pool, 'חברה', 'min_qty', coalesce(new.ref_id, ''), new.created_by);
            perform inventory_push_low_stock(new.product, v_pool);
          end if;
        end if;
      end if;
    end if;
  exception when others then
    raise notice 'inventory_alert_on_movement skipped: %', sqlerrm;
  end;
  return new;
end;
$function$;
