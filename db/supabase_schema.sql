-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Kibbutz Dashboard — Supabase schema (v1)                                  ║
-- ║  Mirrors the Google Sheet tabs served by Apps Script v5.9 (doGet/doPost).  ║
-- ║  Run once in the Supabase SQL editor on a fresh project.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Migration contract (so the client's single fetch-interceptor can swap backends):
--   * READ  : GET snapshot  → one object {settings, tasks[], visits[], ...}  → call get_snapshot()
--   * WRITE : POST {type, ...} → one table upsert per type (PostgREST), except
--             type in (ems, transcribe, parseRequest) which STAY on Apps Script (hybrid).
--   * IDs   : all string ids (v_/ord_/req_/mov_/att_/ret_/prod_) are kept verbatim as text PKs.
--             tasks has no string id → uses generated `seq`, exposed to the client as `row`.
--
-- ponytail: dates kept as text (ISO strings) for byte-parity with the Sheets snapshot —
-- the client already treats them as strings. Migrate to timestamptz later only if we query by date.

-- ── tasks (the kibbutzim — main entities) ───────────────────────────────────
create table if not exists tasks (
  seq            bigint generated always as identity primary key,  -- exposed as "row"
  code           text,
  region         text default '',
  migrated       text default '',
  name           text not null,
  status         text default '',
  expected_task  text default '',
  owners         text default '',   -- comma/newline/slash separated (split client-side, parity)
  task           text default '',
  last_checkup   text default '',
  editor         text default '',
  last_modified  text default ''    -- ISO; optimistic-concurrency token (client sends lastSeenTs)
);
create unique index if not exists tasks_name_uq on tasks (name);

-- ── visits ──────────────────────────────────────────────────────────────────
create table if not exists visits (
  id              text primary key,
  kibbutz         text,
  date            text,
  visitor         text,
  duration        numeric default 0,
  contact         text,
  products        jsonb  default '[]'::jsonb,
  products_other  text   default '',
  summary         text   default '',
  created_at      text,
  workday         boolean default false
);

-- ── products (catalog) ────────────────────────────────────────────────────────
create table if not exists products (
  id          text primary key,
  name        text,
  category    text,
  active      boolean default true,
  created_at  text,
  created_by  text
);

-- ── orders ────────────────────────────────────────────────────────────────────
create table if not exists orders (
  id            text primary key,
  created_at    text,
  created_by    text,
  supplier      text,
  status        text default 'pending',
  items         jsonb default '[]'::jsonb,
  expected_date text default '',
  notes         text default '',
  delivered_at  text default '',
  distribution  jsonb default '{}'::jsonb,
  last_updated  text
);

-- ── movements (stock ledger, append-only) ──────────────────────────────────────
create table if not exists movements (
  id            text primary key,
  date          text,
  product       text,
  from_location text,
  to_location   text,
  quantity      numeric default 0,
  reason        text default 'manual',
  ref_id        text default '',
  created_by    text default ''
);

-- ── requirements (customer requirements → orders) ───────────────────────────────
create table if not exists requirements (
  id              text primary key,
  created_at      text,
  created_by      text,
  kibbutz         text,
  contact_name    text,
  items           jsonb default '[]'::jsonb,
  notes           text default '',
  status          text default 'open',
  linked_order_id text default '',
  fulfilled_at    text default '',
  last_updated    text
);

-- ── returns (returned/defective equipment) ──────────────────────────────────────
create table if not exists returns (
  id        text primary key,
  visit_id  text,
  date      text,
  kibbutz   text,
  visitor   text,
  product   text,
  qty       integer default 0,
  reason    text default '',
  status    text default 'open'
);

-- ── attendance (אביאם / ניתאי work-day log, append-only) ─────────────────────────
create table if not exists attendance (
  id        text primary key,
  date      text,
  person    text,
  day_type  text,
  note      text default ''
);

-- ── settings (flat key → JSON value; e.g. companyTasks_v1) ───────────────────────
create table if not exists settings (
  key        text primary key,
  value      jsonb,
  updated_at text
);

-- ── potentials (read-only reference list) ───────────────────────────────────────
create table if not exists potentials (
  serial text,
  region text,
  name   text
);

-- ── regions (code → name map; doGet builds {code: name}) ─────────────────────────
create table if not exists regions (
  code text primary key,
  name text
);

-- ── ems_cache (singleton: shared EMS task cache) ────────────────────────────────
create table if not exists ems_cache (
  id        integer primary key default 1,
  tasks     jsonb default '[]'::jsonb,
  synced_at text default '',
  synced_by text default '',
  constraint ems_cache_singleton check (id = 1)
);
insert into ems_cache (id) values (1) on conflict (id) do nothing;

-- ── ems_queue (outbound EMS write queue) ────────────────────────────────────────
-- payload shape mirrors whatever emsQueueAdd_ stores; kept generic until confirmed against data.
create table if not exists ems_queue (
  id         bigint generated always as identity primary key,
  payload    jsonb,
  created_at timestamptz default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────────
-- ponytail: permissive anon policy = parity with the current OPEN Apps Script /exec
-- endpoint (anyone with the URL can read/write today). The anon key + these policies is
-- that same boundary. Tighten to per-user auth in phase 2 (the "client side"/login work).
-- NEVER ship the service_role key in the browser.
do $$
declare t text;
begin
  foreach t in array array['tasks','visits','products','orders','movements','requirements',
                           'returns','attendance','settings','potentials','regions',
                           'ems_cache','ems_queue']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_all on %I', t);
    execute format('create policy anon_all on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;
