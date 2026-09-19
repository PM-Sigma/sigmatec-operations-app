-- 📦 מלאי אחוד — the unified company pool (inventory spec §1, §2). Task 8, ships as 2.01.
--
-- עידן, 17.9.26: "עוברים לניהול מלאי אחוד לחברה ללא שיוך לעובד לאור פער ביכולת דיווח".
-- Three things happen here and NOTHING else:
--   1. `products` gets the columns §2 and §3 need (display_name / unit / min_qty);
--   2. `inventory_alerts` is created, together with the trigger on `movements` that fills it —
--      so EVERY path (visit, order, recount, the migration itself) raises an alert with zero
--      client changes;
--   3. RLS, in the house style: read for everyone the anon key reaches, write for authenticated.
--
-- What this file does NOT do: it does not move a single unit. The pool consolidation is
-- `db/pool_migration.mjs`, it is append-only (one `<person> → חברה` movement per balance), and
-- עידן runs it himself after the release smoke (open decision I1).
--
-- Apply with the other db/*.sql migrations (Supabase SQL editor / CLI). Idempotent.

-- ── 1. products ─────────────────────────────────────────────────────────────────────────
-- `name` stays the TECHNICAL name (what אביאם/ניתאי/עמיחי work with, what is written on the
-- box). `display_name` is the name reports print — Task 9 builds the UI and `productLabel`;
-- the column lands here so the migration and the backfill happen once.
alter table products add column if not exists display_name text;
alter table products add column if not exists unit text default 'יח׳';
alter table products add column if not exists min_qty numeric;

-- Backfill: until עידן edits one, the report name IS the technical name. Only rows that have
-- none, so re-running never overwrites an edited display name.
update products set display_name = name where display_name is null or btrim(display_name) = '';

-- ── 2. inventory_alerts ─────────────────────────────────────────────────────────────────
-- What the bell lists (§5.1). The push is a side effect Task 10 adds on top; this table is the
-- record, so an alert that was never pushed is still there to read.
create table if not exists inventory_alerts (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('movement', 'low_stock', 'digest')),
  product       text,
  qty           numeric,
  from_location text,
  to_location   text,
  reason        text,
  ref_id        text,
  actor         text,
  created_at    timestamptz default now(),
  seen_by       text[] default '{}'
);

create index if not exists inventory_alerts_recent on inventory_alerts (created_at desc);
create index if not exists inventory_alerts_kind on inventory_alerts (kind, created_at desc);

-- The pool's net per product, from the append-only ledger. One place, so the trigger and any
-- report agree by construction with app/src/lib/inventory.ts `poolStock`.
create or replace function pool_qty(p_product text) returns numeric
language sql stable as $$
  select coalesce(sum(
    case when m.to_location = 'חברה' then m.quantity else 0 end
    - case when m.from_location = 'חברה' then m.quantity else 0 end
  ), 0)
  from movements m
  where m.product = p_product;
$$;

-- Every movement insert → one 'movement' alert; and when the pool drops below the product's
-- own `min_qty`, one 'low_stock' alert as well.
--
-- Task 10 hangs the push off this function (a pg_net call on the low_stock branch, per §5.2) —
-- that is the ONLY line it has to add here, which is why the branch is already separated out.
create or replace function inventory_alert_on_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_min numeric;
  v_pool numeric;
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
          -- TASK 10 HOOK: pg_net POST → functions/v1/push-send {mode:'inventoryAlert'} (spec §5.2).
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists movements_inventory_alert on movements;
create trigger movements_inventory_alert
  after insert on movements
  for each row execute function inventory_alert_on_movement();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────────────────
-- Same shape as internal_tasks / work_sessions: read is open to the anon key the client holds,
-- writing is for an authenticated session. The trigger is `security definer`, so it fills the
-- table regardless of who posted the movement.
alter table inventory_alerts enable row level security;

drop policy if exists ia_read on inventory_alerts;
create policy ia_read on inventory_alerts for select using (true);

drop policy if exists ia_write on inventory_alerts;
create policy ia_write on inventory_alerts for all to authenticated using (true) with check (true);
