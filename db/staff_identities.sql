-- staff_identities.sql — X-L1: the server-side map from an EMS user id to a roster name.
--
-- STATUS: WRITTEN, NOT APPLIED. Production side effect — waits for עידן's explicit "כן"
-- (X-L3, which also runs the one-time seed and deploys ems-auth). Additive only.
--
-- Why: the EMS bridge pass never carried a trusted `name` claim, so every policy that reads
-- `auth.jwt() ->> 'name'` was unenforceable (rls_2_00_lockdown.sql's work_sessions comment says
-- so in plain words). This table is the one place `ems-auth` looks up "who is this EMS id" —
-- service role only, no client policy, so nothing but the edge function itself can read or
-- write it. A staff member's OWN pass never carries more trust than this table gives it.
--
-- Populated by scripts/seed-staff-identities.mjs (a one-time run with עידן's EMS admin token)
-- and learned once per new hire by ems-auth itself (index.ts, X-L1 step 3).

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
