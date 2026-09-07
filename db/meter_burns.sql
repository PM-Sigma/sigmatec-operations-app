-- 🔥 צריבות — tracking which Landis E360 generation meters were burned in the field, per kibbutz,
-- plus the generators meters are grouped under. Spec: superpowers/specs/2026-09-06-meter-burn-tracker-design.md
-- EMS-sourced columns (serial/site/meter_type/address/role_code/ct_ratio/parent_serial/solar_names) are seeded
-- from db/meter_burns_seed.sql and refreshed by re-running it; tracking columns (status/burned_*/generator_id/note)
-- are owned by the app and never touched by the seed. Run once in the Supabase SQL editor, then run the seed.

create table if not exists public.generators (
  id            uuid primary key default gen_random_uuid(),
  site          text not null,
  name          text not null,
  device_serial text,                       -- generator's own meter/controller number (עידן fills in the helper table)
  created_by    text,
  created_at    timestamptz not null default now(),
  unique (site, name)
);

create table if not exists public.meter_burns (
  meter_id      uuid primary key,           -- EMS meters.id
  serial        text not null,
  site          text not null,              -- EMS site name (= kibbutz card name where linked)
  site_id       uuid,
  meter_type    text not null,              -- 'E360PP' | 'E360SP' | 'E360CT'
  address       text,
  role_code     int,
  ct_ratio      numeric,                    -- EMS current_multiplier
  parent_serial text,
  solar_names   text,                       -- linked solar systems, ' · ' separated
  status        text not null default 'pending' check (status in ('pending','burned','issue')),
  burned_by     text,
  burned_at     timestamptz,
  generator_id  uuid references public.generators(id) on delete set null,
  note          text,
  updated_at    timestamptz not null default now()
);
create index if not exists meter_burns_site_idx on public.meter_burns (site);

alter table public.generators  enable row level security;
alter table public.meter_burns enable row level security;

-- read: anon + authenticated (UI is name-gated client-side, same posture as dev_status_log / push_log)
drop policy if exists generators_read on public.generators;
create policy generators_read on public.generators for select to anon, authenticated using (true);
drop policy if exists meter_burns_read on public.meter_burns;
create policy meter_burns_read on public.meter_burns for select to anon, authenticated using (true);

-- write: only through the authenticated EMS→Supabase bridge token. No delete from the app.
drop policy if exists generators_insert on public.generators;
create policy generators_insert on public.generators for insert to authenticated with check (true);
drop policy if exists generators_update on public.generators;
create policy generators_update on public.generators for update to authenticated using (true) with check (true);
drop policy if exists meter_burns_write on public.meter_burns;
create policy meter_burns_write on public.meter_burns for insert to authenticated with check (true);
drop policy if exists meter_burns_update on public.meter_burns;
create policy meter_burns_update on public.meter_burns for update to authenticated using (true) with check (true);
