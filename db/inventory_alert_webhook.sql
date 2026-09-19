-- 🔻 מלאי נמוך → push, straight from the database (inventory spec §5.2). Task 10.
--
-- The trigger in db/inventory_pool_v2.sql raises a `low_stock` row; this file is HOW that row
-- becomes a buzz on עידן's and עמיחי's phones: one `net.http_post` to push-send's
-- `inventoryAlert` mode, with the shared cron secret in the `X-Cron-Key` header.
--
-- pg_net is ASYNCHRONOUS by design — `net.http_post` queues the request and returns an id
-- immediately. That is exactly what a trigger on `movements` needs: the movement insert never
-- waits for an HTTP call, and a push-send outage can never fail a visit summary.
--
-- ── HOW THE SECRET REACHES SQL (read this before running) ─────────────────────────────────
-- The Edge Function's `CRON_SECRET` lives in the Supabase dashboard (Edge Functions → Secrets),
-- where SQL cannot see it. Postgres therefore needs its own copy. It is kept in a table in a
-- PRIVATE schema that no role except `postgres` / `service_role` can read — the anon key the
-- browser holds cannot select from it, so a client can never learn the secret and forge a push.
--
--   MANUAL STEP (עידן, once, in the Supabase SQL editor — NEVER committed, see docs/HANDOFF-עידן.md):
--     insert into private.push_config(key, value) values
--       ('base_url',   'https://wwqfcajnxinaxmobrgol.supabase.co'),
--       ('anon_key',   '<the PUBLIC anon key>'),
--       ('cron_secret','<the same value as the CRON_SECRET function secret>')
--     on conflict (key) do update set value = excluded.value;
--
-- Until those three rows exist, `inventory_push_low_stock()` does nothing and says so in a
-- NOTICE. The alert row is still written; only the push is skipped. That is the right failure:
-- the record of the shortage never depends on a secret being configured.
--
-- Apply order: this file FIRST, then db/inventory_pool_v2.sql (the trigger calls this function).
-- Idempotent.

create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.push_config (
  key   text primary key,
  value text not null
);
alter table private.push_config enable row level security;   -- no policies = nobody but the owner
revoke all on private.push_config from anon, authenticated;

-- Fire one low-stock push. SECURITY DEFINER, because the caller is a trigger running as whoever
-- inserted the movement — an authenticated browser session that must not be able to read the
-- config itself. Never raises: a push is a courtesy, a movement is the record.
create or replace function inventory_push_low_stock(p_product text, p_qty numeric)
returns void
language plpgsql security definer set search_path = public, private, extensions as $$
declare
  v_url    text;
  v_anon   text;
  v_secret text;
begin
  select value into v_url    from private.push_config where key = 'base_url';
  select value into v_anon   from private.push_config where key = 'anon_key';
  select value into v_secret from private.push_config where key = 'cron_secret';

  if v_url is null or v_anon is null or v_secret is null then
    raise notice 'inventory_push_low_stock: private.push_config incomplete — alert written, push skipped';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/push-send',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_anon,
                 'apikey',        v_anon,
                 'X-Cron-Key',    v_secret),
    body    := jsonb_build_object('mode', 'inventoryAlert', 'product', p_product, 'qty', p_qty)
  );
exception when others then
  -- The whole point of Task 8's review note: NOTHING here may fail an insert into `movements`.
  raise notice 'inventory_push_low_stock failed: %', sqlerrm;
end;
$$;

revoke all on function inventory_push_low_stock(text, numeric) from anon, authenticated;

-- Verify:
--   select inventory_push_low_stock('בדיקה', 0);        -- a NOTICE when unconfigured, a row in net._http_response when not
--   select id, status_code, content from net._http_response order by created desc limit 3;
--   select sent_at, recipient, where_txt, status from push_log where event = 'inventoryAlert' order by sent_at desc limit 5;
