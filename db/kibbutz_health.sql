-- kibbutz_health — Task 28 (company-process spec §5): the cached health draft, one row per
-- kibbutz. Written by an ON-DEMAND recompute only; there is deliberately NO pg_cron job until
-- the thresholds are real (ruling §8b — reminder `sigma-health-v1-thresholds`, Tue 22.9), so
-- nothing nightly starts publishing numbers nobody has approved.
--
-- `signals` is the jsonb the strip reads: { finance|energy|alerts|recurring: {score, why} },
-- score 0-3 per signal, `null` where the source does not exist yet. `score` is the weighted
-- average of the non-null signals (app/src/lib/health.ts `healthOf`) and is itself null when
-- no signal had a value — a missing source must never look like a red kibbutz.
--
-- The scoring lives in app/src/lib/health.ts and nowhere else: this table is a cache, not a
-- second implementation.
--
-- Apply with the other db/*.sql migrations (Supabase SQL editor / CLI).

create table if not exists kibbutz_health (
  kibbutz text primary key,
  score numeric,
  signals jsonb not null default '{}'::jsonb,
  computed_at timestamptz default now()
);

alter table kibbutz_health enable row level security;

-- Same shape as onboarding_steps / internal_tasks: read-all, write-authenticated. WHO may
-- look at a health row is decided in the UI (app/src/lib/health.ts `canSeeHealth` — never the
-- field role), the same single-person/role gating pattern the rest of the app uses.
drop policy if exists kh_read on kibbutz_health;
create policy kh_read on kibbutz_health for select using (true);

drop policy if exists kh_write on kibbutz_health;
create policy kh_write on kibbutz_health for all to authenticated using (true) with check (true);

create index if not exists kibbutz_health_computed_at on kibbutz_health (computed_at desc);
