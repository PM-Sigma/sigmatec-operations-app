-- ══════════════════════════════════════════════════════════════════════════════
-- 📥 משיכת קריאות מתוכנות חיצונית (SpeedNet + DataSense) — feature `readings-pull`, stage 1 (חולדה)
--
-- PURPOSE: the Edge Function `readings-fetch` pulls each morning's meter readings from the
-- kibbutz's external systems, builds two xlsx files (EMS upload file + exceptions file) and keeps
-- the run history here. Spec: docs/superpowers/specs/2026-09-29-readings-pull-design.md §9.
--
--   reading_sites    one row per kibbutz (rules + retention + EMS site id)
--   reading_sources  the external systems of a site (params only — credentials live in Edge-Function
--                    secrets, named by `secret_prefix`, e.g. HULDA_SPEEDNET_USER / _PASS)
--   reading_runs     one row per run (progress, summary, exceptions, file paths, "uploaded to EMS" marks)
--   reading_values   the last uploaded readings per meter/day — the history the spike / frozen-meter rules read
--
-- BACKUP: NEW tables only, nothing existing is altered → no backup needed.
--
-- ACCESS (עידן 29.9): every signed-in staff member (bridge JWT with a non-empty `name` claim), never the
-- view-only role (`viewer` claim). Must agree with canUseReadings() in
-- supabase/functions/_shared/readingsRoster.js (test-readings-roster.mjs checks both).
--   · RLS on all four tables, SELECT only, `to authenticated using (public.is_readings_user())`.
--   · NO insert/update/delete policies and no such grants: every write is the service role, from the
--     Edge Function (which verifies the roster itself).
--   · `reading_runs.raw` (the raw rows pulled from the sources = real customer data) is not granted to
--     `authenticated` at all — column privileges, so `select *` from the client fails and the client
--     selects named columns. Raw rows stay server-side (service role).
--   · Private Storage bucket `readings`, NO storage policies: downloads are signed URLs made by the function.
--
-- Idempotent (`if not exists` / `on conflict do nothing` / `create or replace`). DO NOT APPLY from a
-- task branch — MAIN audits and applies.
--
-- ROLLBACK (destroys the run history — export first if it matters):
--   drop table if exists public.reading_values;
--   drop table if exists public.reading_runs;
--   drop table if exists public.reading_sources;
--   drop table if exists public.reading_sites;
--   drop function if exists public.is_readings_user();
--   -- Storage: empty the bucket first (dashboard, or the Storage API), then:
--   delete from storage.buckets where id = 'readings';
-- ══════════════════════════════════════════════════════════════════════════════

-- ── who may read ─────────────────────────────────────────────────────────────
create or replace function public.is_readings_user() returns boolean
language sql stable as $$
  select coalesce(nullif(btrim(auth.jwt() ->> 'name'), '') is not null, false)
     and coalesce((auth.jwt() ->> 'viewer')::boolean, false) = false
$$;

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists public.reading_sites (
  id             uuid primary key default gen_random_uuid(),
  kibbutz        text unique not null,
  ems_site_id    uuid,
  active         boolean default true,
  rules          jsonb default '{"spike_factor":5,"spike_min_kwh":50,"frozen_days":3}'::jsonb,
  retention_days int default 35,          -- runs + files only; reading_values are kept longer
  created_at     timestamptz default now()
);

create table if not exists public.reading_sources (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.reading_sites(id) on delete cascade,
  name          text not null,
  type          text not null check (type in ('speednet', 'datasense')),
  params        jsonb,
  secret_prefix text,
  sort          int default 0,
  unique (site_id, name)
);

create table if not exists public.reading_runs (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.reading_sites(id) on delete cascade,
  reading_date    date not null,
  trigger         text check (trigger in ('cron', 'manual')),
  started_by      text,
  started_at      timestamptz default now(),
  finished_at     timestamptz,
  status          text default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  attempt         int default 1,
  progress        jsonb default '{}'::jsonb,   -- source name -> {state, count, error}
  raw             jsonb default '{}'::jsonb,   -- source name -> rows. SERVICE ROLE ONLY (see column grants below)
  n_ok            int,
  n_blocked       int,
  n_warn          int,
  summary         jsonb,
  exceptions      jsonb,
  error           text,
  readings_file   text,                        -- Storage path in bucket `readings`
  exceptions_file text,
  ems_checked     boolean default false,
  ems_checked_by  text,
  ems_checked_at  timestamptz,
  uploaded        boolean default false,
  uploaded_by     text,
  uploaded_at     timestamptz,
  uploaded_source text check (uploaded_source in ('manual', 'auto')),
  seen_by         text[] default '{}'
);
create index if not exists reading_runs_site_date_idx
  on public.reading_runs (site_id, reading_date desc, started_at desc);
-- two users / a double tap can never start two runs for the same kibbutz + day
create unique index if not exists reading_runs_one_running
  on public.reading_runs (site_id, reading_date) where status = 'running';

create table if not exists public.reading_values (
  site_id      uuid not null references public.reading_sites(id) on delete cascade,
  serial       text not null,
  reading_date date not null,
  ft           numeric,
  f1           numeric,
  f2           numeric,
  f3           numeric,
  taken_at     text,
  run_id       uuid,
  primary key (site_id, serial, reading_date)
);

-- ── RLS: read-only for the roster, writes = service role ─────────────────────
alter table public.reading_sites   enable row level security;
alter table public.reading_sources enable row level security;
alter table public.reading_runs    enable row level security;
alter table public.reading_values  enable row level security;

drop policy if exists readings_select on public.reading_sites;
create policy readings_select on public.reading_sites   for select to authenticated using (public.is_readings_user());
drop policy if exists readings_select on public.reading_sources;
create policy readings_select on public.reading_sources for select to authenticated using (public.is_readings_user());
drop policy if exists readings_select on public.reading_runs;
create policy readings_select on public.reading_runs    for select to authenticated using (public.is_readings_user());
drop policy if exists readings_select on public.reading_values;
create policy readings_select on public.reading_values  for select to authenticated using (public.is_readings_user());

-- ── privileges: select only, and reading_runs.raw not at all ─────────────────
revoke all on public.reading_sites, public.reading_sources, public.reading_runs, public.reading_values from anon, authenticated;
grant select on public.reading_sites, public.reading_sources, public.reading_values to authenticated;
grant select (id, site_id, reading_date, trigger, started_by, started_at, finished_at, status, attempt, progress,
              n_ok, n_blocked, n_warn, summary, exceptions, error, readings_file, exceptions_file,
              ems_checked, ems_checked_by, ems_checked_at, uploaded, uploaded_by, uploaded_at, uploaded_source, seen_by)
  on public.reading_runs to authenticated;

-- ── private Storage bucket (no policies → only signed URLs from the function) ─
insert into storage.buckets (id, name, public) values ('readings', 'readings', false)
on conflict (id) do nothing;

-- ── seed: חולדה (no credentials — those are Edge-Function secrets HULDA_*) ────
insert into public.reading_sites (kibbutz, ems_site_id)
values ('חולדה', 'd697d259-95ee-4dcc-95fa-820f6ec3d32a')
on conflict (kibbutz) do nothing;

insert into public.reading_sources (site_id, name, type, params, secret_prefix, sort)
select s.id, 'SpeedNet', 'speednet',
       '{"site_id":"28","via_browser":true,"proxy":"&proxy=residential&proxyCountry=il"}'::jsonb,
       'HULDA_SPEEDNET', 1
  from public.reading_sites s where s.kibbutz = 'חולדה'
on conflict (site_id, name) do nothing;

insert into public.reading_sources (site_id, name, type, params, secret_prefix, sort)
select s.id, 'DataSense', 'datasense',
       $json${"queries":[
         {"name":"חולדה חשמל חדש","kind":"tou","site_id":1926,"entity":"DailyReadingQueryElectricityView",
          "entity_uid":"C7A6P362T902HE_DailyReadingQueryElectricityView","date_field":"LayerDate",
          "columns":"Device,AmrNumber,ReadingDateTime,Reading_T,Reading_T1,Reading_T3,Consumption_T,Consumption_T1,Consumption_T3"},
         {"name":"חולדה - חשמל (אפליקציית מים)","kind":"simple","site_id":28,"entity":"DailyReadingQueryView",
          "entity_uid":"C7A2P73T122HE_DailyReadingQueryView","date_field":"LayerDateTime",
          "columns":"Device,AmrNumber,ReadingDateTime,Reading"}
       ]}$json$::jsonb,
       'HULDA_DATASENSE', 2
  from public.reading_sites s where s.kibbutz = 'חולדה'
on conflict (site_id, name) do nothing;

-- ── atomic per-source progress + "who builds" claim (readings-fetch mode `source`) ────────────
-- Two sources finish at (almost) the same time; a read-modify-write from the function would lose one.
-- This runs under the row lock: it sets progress[source] (+ raw[source] when rows are given), and when
-- EVERY source in p_names is ok/failed it stamps raw._claim once and returns true -> exactly ONE caller builds.
-- Service role only.
create or replace function public.readings_source_done(p_run uuid, p_source text, p_progress jsonb, p_rows jsonb, p_names text[])
returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.reading_runs%rowtype; n text; done boolean := true;
begin
  select * into r from public.reading_runs where id = p_run and status = 'running' for update;
  if not found then return false; end if;
  r.progress := jsonb_set(coalesce(r.progress, '{}'::jsonb), array[p_source], p_progress, true);
  if p_rows is not null then r.raw := jsonb_set(coalesce(r.raw, '{}'::jsonb), array[p_source], p_rows, true); end if;
  foreach n in array p_names loop
    if coalesce(r.progress -> n ->> 'state', '') not in ('ok', 'failed') then done := false; end if;
  end loop;
  if done and not (coalesce(r.raw, '{}'::jsonb) ? '_claim') then
    r.raw := jsonb_set(coalesce(r.raw, '{}'::jsonb), array['_claim'], to_jsonb(now()::text), true);
    update public.reading_runs set progress = r.progress, raw = r.raw where id = p_run;
    return true;
  end if;
  update public.reading_runs set progress = r.progress, raw = r.raw where id = p_run;
  return false;
end $$;
revoke all on function public.readings_source_done(uuid, text, jsonb, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.readings_source_done(uuid, text, jsonb, jsonb, text[]) to service_role;
-- ROLLBACK addition: drop function if exists public.readings_source_done(uuid, text, jsonb, jsonb, text[]);
