-- staff_identities.sql — X-L1: the server-side map from an EMS user id to a roster name.
--
-- STATUS: WRITTEN, NOT APPLIED. Production side effect — waits for עידן's explicit "כן"
-- (X-L3, which also runs the one-time seed and deploys ems-auth). Additive only.
--
-- Why: the EMS bridge pass never carried a trusted `name` claim, so a policy reading
-- `auth.jwt() ->> 'name'` had nothing to compare against a real person (see
-- rls_2_00_lockdown.sql's work_sessions comment). This table is the one place `ems-auth` looks
-- up "who is this EMS id" — service role only, no client policy, so nothing but the edge
-- function itself can read or write it.
--
-- Populated by scripts/seed-staff-identities.mjs (a one-time run with עידן's EMS token,
-- restricted to @sigmatec-energy.com accounts). ems-auth looks the row up at sign-in and does
-- not learn or guess a name on its own — a person the seed misses simply signs in name-less
-- until the seed is re-run (logged as `identity-missing` in usage_events).

create table if not exists public.staff_identities (
  ems_user_id text primary key,
  name text not null check (name in ('עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'מתניה', 'אליה')),
  email text,
  updated_at timestamptz not null default now()
);

alter table public.staff_identities enable row level security;
-- No client policy of any kind: the table answers only the service role (ems-auth's own key).
-- A signed-in staff pass — even a valid one — gets zero rows back, by the absence of a policy.

-- Verify after applying: select * from public.staff_identities; (as the service role only —
-- the same query as `authenticated` should return 0 rows once RLS is on.)

-- ROLLBACK
-- drop table if exists public.staff_identities;
