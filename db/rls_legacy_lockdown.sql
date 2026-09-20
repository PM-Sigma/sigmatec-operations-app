-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  LEGACY RLS lockdown — the twelve tables no db/*.sql file has ever governed.  ║
-- ║  Apply LAST, after rls_2_00_lockdown.sql.                                     ║
-- ║  DO NOT APPLY FROM A DEV SESSION — the controller applies this one.           ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
-- Task 33 verification, finding D14 → עידן's ruling 20.9: close them.
--
-- WHAT THIS IS
-- Twelve tables still answer the public anon key with `for select using (true)`:
--
--   attendance · ems_cache · ems_queue · movements · orders · potentials · products ·
--   regions · requirements · returns · settings · tasks
--
-- They are the ORIGINAL Apps-Script-era schema, created before this repo kept its policies
-- in db/*.sql. That is the whole reason they survived four lockdown migrations and a static
-- RLS sweep: test-rls-policies.mjs reads db/*.sql, these tables appear in none of it, and a
-- sweep cannot fail a table it has never heard of. The mistake was an ABSENCE again — the
-- same shape as audit C #1. This file ends it, and the sweep now carries a roster so a table
-- with no policy file is a failure rather than a silence.
--
-- WHAT IS IN THEM
-- Every kibbutz and its region (tasks, regions, potentials), every order and supplier
-- (orders, requirements, returns), the whole stock ledger (products, movements), who worked
-- where on which day (attendance), the app's settings, and the cached EMS task list plus its
-- offline write queue (ems_cache, ems_queue — the latter holds the BODIES of pending writes).
-- Anyone who opened the bundle could read all of it. It is the single largest remaining hole.
--
-- THE TRUST MODEL, UNCHANGED
-- `ems-auth` mints ONE shared pass — {role:'authenticated'}, no identity claim. So the only
-- honest statement a policy here can make is "signed in or not", exactly as
-- rls_2_00_lockdown.sql says. This file makes that statement; it does not pretend to more.
--
-- WHY NO CLIENT BREAKS (checked in code before writing this)
--   · Every read of these tables goes through `sbGet` in js/src/01-data.js:512, which does
--     `await sbEnsure()` FIRST — the one memoized mint (js/src/15-login-gate.js
--     `sbEnsurePass`) — and then sends `Authorization: Bearer <pass>` (01-data.js:488).
--     A cold boot therefore reads as `authenticated`, not as `anon`.
--   · The VIEWER mints the same pass (15-login-gate.js, mode 'viewer'), so read-only access
--     is unaffected.
--   · The sign-in itself needs NO anon table read: the gate posts to the `ems-auth` EDGE
--     FUNCTION, and its self-verification `tasks?select=name&limit=1` (15-login-gate.js:96)
--     is sent WITH the freshly minted pass.
--   · The ?cert= share link needs NO anon table read either: js/src/20-delivery-cert.js:428
--     calls the SECURITY DEFINER RPC `cert_by_id(uuid)`, which returns exactly one row by id.
--     `delivery_certs`, `kibbutz_details` and `site_contacts` are already `to authenticated`.
--   · So nothing anonymous is left that must read a table. What DOES change: if the mint
--     fails (EMS down, no session), these reads now 401 instead of quietly returning data.
--     js/src/01-data.js:667 catches that and falls back to Apps Script — the same path the
--     app already takes when Supabase is unreachable. That is the intended posture: a
--     signed-out browser gets nothing.
--
-- HOW THE DROPS WORK
-- The existing policies were never written down here, so their NAMES are unknown — they
-- differ per table and some were created by hand. Rather than guess, the block below drops
-- every SELECT (or ALL) policy on these tables that reaches `public` or `anon`, whatever it
-- is called, and then creates one named policy per table that the static sweep can read.
-- Write policies are left exactly as they are: this file closes READS and changes nothing
-- about who may write.
--
-- Reversible: the rollback block at the bottom restores a public read on all twelve.

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- #1 — drop every public/anon READ policy on the twelve, by discovery
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  legacy text[] := array[
    'attendance', 'ems_cache', 'ems_queue', 'movements', 'orders', 'potentials',
    'products', 'regions', 'requirements', 'returns', 'settings', 'tasks'
  ];
  p record;
begin
  for p in
    select schemaname, tablename, policyname, cmd, roles
      from pg_policies
     where schemaname = 'public'
       and tablename = any (legacy)
       and cmd in ('SELECT', 'ALL')
       -- `using (true)` with no `to` clause lands as the `public` role, which INCLUDES anon.
       and (roles && array['public', 'anon']::name[])
  loop
    raise notice 'dropping % on public.% (for % to %)', p.policyname, p.tablename, p.cmd, p.roles;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- #2 — one named `to authenticated` read per table, so db/*.sql GOVERNS them
--      from now on and test-rls-policies.mjs can see them
-- ══════════════════════════════════════════════════════════════════════════════

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated using (true);

drop policy if exists ems_cache_read on public.ems_cache;
create policy ems_cache_read on public.ems_cache for select to authenticated using (true);

-- Holds the BODIES of queued offline writes — orders, visits, readings not yet sent.
drop policy if exists ems_queue_read on public.ems_queue;
create policy ems_queue_read on public.ems_queue for select to authenticated using (true);

drop policy if exists movements_read on public.movements;
create policy movements_read on public.movements for select to authenticated using (true);

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (true);

drop policy if exists potentials_read on public.potentials;
create policy potentials_read on public.potentials for select to authenticated using (true);

drop policy if exists products_read on public.products;
create policy products_read on public.products for select to authenticated using (true);

drop policy if exists regions_read on public.regions;
create policy regions_read on public.regions for select to authenticated using (true);

drop policy if exists requirements_read on public.requirements;
create policy requirements_read on public.requirements for select to authenticated using (true);

drop policy if exists returns_read on public.returns;
create policy returns_read on public.returns for select to authenticated using (true);

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (true);

-- The kibbutz list itself. Also the table the sign-in self-verifies against — with the
-- freshly minted pass, so `to authenticated` is exactly what that check wants.
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- #3 — RLS must actually be ON, or a policy is decoration
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.attendance   enable row level security;
alter table public.ems_cache    enable row level security;
alter table public.ems_queue    enable row level security;
alter table public.movements    enable row level security;
alter table public.orders       enable row level security;
alter table public.potentials   enable row level security;
alter table public.products     enable row level security;
alter table public.regions      enable row level security;
alter table public.requirements enable row level security;
alter table public.returns      enable row level security;
alter table public.settings     enable row level security;
alter table public.tasks        enable row level security;

commit;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFY (run after applying — expect ZERO rows)
-- ══════════════════════════════════════════════════════════════════════════════
-- select tablename, policyname, cmd, roles
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('attendance','ems_cache','ems_queue','movements','orders','potentials',
--                      'products','regions','requirements','returns','settings','tasks')
--    and roles && array['public','anon']::name[];

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the public read on all twelve
-- ══════════════════════════════════════════════════════════════════════════════
-- begin;
-- drop policy if exists attendance_read on public.attendance;
-- create policy attendance_read on public.attendance for select using (true);
-- drop policy if exists ems_cache_read on public.ems_cache;
-- create policy ems_cache_read on public.ems_cache for select using (true);
-- drop policy if exists ems_queue_read on public.ems_queue;
-- create policy ems_queue_read on public.ems_queue for select using (true);
-- drop policy if exists movements_read on public.movements;
-- create policy movements_read on public.movements for select using (true);
-- drop policy if exists orders_read on public.orders;
-- create policy orders_read on public.orders for select using (true);
-- drop policy if exists potentials_read on public.potentials;
-- create policy potentials_read on public.potentials for select using (true);
-- drop policy if exists products_read on public.products;
-- create policy products_read on public.products for select using (true);
-- drop policy if exists regions_read on public.regions;
-- create policy regions_read on public.regions for select using (true);
-- drop policy if exists requirements_read on public.requirements;
-- create policy requirements_read on public.requirements for select using (true);
-- drop policy if exists returns_read on public.returns;
-- create policy returns_read on public.returns for select using (true);
-- drop policy if exists settings_read on public.settings;
-- create policy settings_read on public.settings for select using (true);
-- drop policy if exists tasks_read on public.tasks;
-- create policy tasks_read on public.tasks for select using (true);
-- commit;
