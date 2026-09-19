-- 📦 מלאי אחוד — the trigger, v2 (Task 10). Replaces ONLY `inventory_alert_on_movement()`
-- from db/inventory_pool.sql; everything else in that file (the `products` columns, the
-- `inventory_alerts` table, `pool_qty`, the RLS) stands unchanged and is not repeated here.
--
-- Two changes, both from the Task 8 review:
--
--   1. THE GUARD (review, "Important"): the old body had no exception handling. It is an
--      AFTER INSERT trigger on `movements`, so ANY failure inside it — a dropped column, a
--      permissions change, a type error on a legacy row — would roll back the movement that
--      caused it, and a person saving a visit summary would be told his summary failed for a
--      reason he cannot see. The alert is a convenience; the ledger is the record. The whole
--      body is therefore wrapped, and a failure is a NOTICE, never an error.
--
--   2. THE PUSH (spec §5.2, Task 10): the low_stock branch now calls
--      `inventory_push_low_stock()` (db/inventory_alert_webhook.sql) — the one line Task 8
--      left marked `TASK 10 HOOK`. That function is itself non-raising and pg_net is async, so
--      the insert never waits on the network.
--
-- Apply AFTER db/inventory_pool.sql and db/inventory_alert_webhook.sql. Idempotent.

create or replace function inventory_alert_on_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_min numeric;
  v_pool numeric;
begin
  begin
    insert into inventory_alerts (kind, product, qty, from_location, to_location, reason, ref_id, actor)
    values ('movement', new.product, new.quantity, new.from_location, new.to_location, new.reason, new.ref_id, new.created_by);

    -- Low stock is about the POOL only: a kibbutz holding few units is not our shortage.
    if new.from_location = 'חברה' or new.to_location = 'חברה' then
      select p.min_qty into v_min from products p where p.name = new.product and coalesce(p.active, true) limit 1;
      if v_min is not null then
        v_pool := pool_qty(new.product);
        if v_pool < v_min then
          -- One open low_stock alert per product: crossing the line twice in a day is the same
          -- fact, and a bell full of repeats is a bell nobody reads.
          if not exists (
            select 1 from inventory_alerts a
            where a.kind = 'low_stock' and a.product = new.product
              and a.created_at > now() - interval '12 hours'
          ) then
            insert into inventory_alerts (kind, product, qty, to_location, reason, ref_id, actor)
            values ('low_stock', new.product, v_pool, 'חברה', 'min_qty', coalesce(new.ref_id, ''), new.created_by);
            -- §5.2: the immediate push. Async (pg_net) and non-raising, by construction.
            perform inventory_push_low_stock(new.product, v_pool);
          end if;
        end if;
      end if;
    end if;
  exception when others then
    -- A movement is never lost because its alert could not be written.
    raise notice 'inventory_alert_on_movement skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

-- The trigger itself is unchanged; re-created so this file can be applied on its own.
drop trigger if exists movements_inventory_alert on movements;
create trigger movements_inventory_alert
  after insert on movements
  for each row execute function inventory_alert_on_movement();

-- Verify (on a throwaway product, then delete the rows):
--   insert into movements (id, date, product, from_location, to_location, quantity, reason, created_by)
--   values (gen_random_uuid()::text, now(), 'בדיקה', 'ספק', 'חברה', 1, 'manual', 'עידן');
--   select kind, product, qty, reason, created_at from inventory_alerts order by created_at desc limit 3;
