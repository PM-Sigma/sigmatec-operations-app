-- delivery_certs — תעודות משלוח the app issues (visit summary / EMS task / customer order / visits report).
-- Own numbering series (starts at 1001) — deliberately separate from the iCount books.
-- Every issued cert is persisted so accounting can pull a monthly by-kibbutz report.
-- Run once in the Supabase SQL editor.

create table if not exists public.delivery_certs (
  id           uuid primary key default gen_random_uuid(),
  cert_number  bigserial unique,
  cert_date    date not null default current_date,
  kibbutz      text not null default '',
  customer     jsonb not null default '{}'::jsonb,   -- snapshot of the printed customer block {name, company_id, address, contact}
  items        jsonb not null default '[]'::jsonb,   -- [{name, qty}] — no prices by design
  notes        text not null default '',
  source       text not null default 'manual',       -- visit | order | ems | manual
  ref_id       text not null default '',             -- visit id / order id / EMS task id
  created_by   text not null default '',
  created_at   timestamptz not null default now()
);

alter sequence public.delivery_certs_cert_number_seq restart with 1001;

alter table public.delivery_certs enable row level security;

drop policy if exists delivery_certs_read on public.delivery_certs;
create policy delivery_certs_read on public.delivery_certs
  for select using (true);

-- Insert via the authenticated EMS→Supabase bridge only. No update/delete — an issued cert is immutable
-- (a mistake gets a new cert; keeps the numbering series audit-clean for accounting).
drop policy if exists delivery_certs_insert on public.delivery_certs;
create policy delivery_certs_insert on public.delivery_certs
  for insert to authenticated with check (true);

-- kibbutz_details — customer block per kibbutz (legal name, ח.פ., address, contact).
-- Seed later from the EMS `sites` table (read-only PG user); until seeded the cert form shows
-- editable blanks, so nothing blocks on this data.
create table if not exists public.kibbutz_details (
  kibbutz     text primary key,
  legal_name  text not null default '',
  company_id  text not null default '',   -- ח.פ. / ע.מ.
  address     text not null default '',
  contact     text not null default ''
);

alter table public.kibbutz_details enable row level security;

drop policy if exists kibbutz_details_read on public.kibbutz_details;
create policy kibbutz_details_read on public.kibbutz_details
  for select using (true);

drop policy if exists kibbutz_details_write on public.kibbutz_details;
create policy kibbutz_details_write on public.kibbutz_details
  for all to authenticated using (true) with check (true);
