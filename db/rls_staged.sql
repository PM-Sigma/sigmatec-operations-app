-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  #4 Security — staged RLS lockdown. Run the steps IN ORDER, with verification ║
-- ║  between them. Each step is reversible.                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Tables covered: tasks, visits, products, orders, movements, requirements,
-- returns, attendance, settings, potentials, regions, ems_cache, ems_queue.

-- ── STEP 1 — run NOW. Adds policies for the bridge token's role (authenticated),
--    ALONGSIDE the existing anon policies. Nothing changes for users yet (the app
--    is still on anon), but minted tokens now also work → lets us verify the bridge.
do $$
declare t text;
begin
  foreach t in array array['tasks','visits','products','orders','movements','requirements',
                           'returns','attendance','settings','potentials','regions','ems_cache','ems_queue']
  loop
    execute format('drop policy if exists auth_all on %I', t);
    execute format('create policy auth_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- → Tell the agent. The agent flips USE_SB_BRIDGE=true, redeploys, and verifies
--   every screen + a write works while logged in. ONLY THEN run STEP 2.


-- ── STEP 2 — the LOCKDOWN. Run only AFTER verification. Drops the anon policies,
--    so the public anon key alone can no longer read/write — only a valid EMS-login
--    bridge token works. This is the actual hardening.
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['tasks','visits','products','orders','movements','requirements',
--                            'returns','attendance','settings','potentials','regions','ems_cache','ems_queue']
--   loop
--     execute format('drop policy if exists anon_all on %I', t);
--   end loop;
-- end $$;


-- ── EMERGENCY ROLLBACK — if EMS is ever unreachable and nobody can log in, run this
--    to re-open anon access (un-does STEP 2) so the team isn't locked out of the data.
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['tasks','visits','products','orders','movements','requirements',
--                            'returns','attendance','settings','potentials','regions','ems_cache','ems_queue']
--   loop
--     execute format('drop policy if exists anon_all on %I', t);
--     execute format('create policy anon_all on %I for all to anon using (true) with check (true)', t);
--   end loop;
-- end $$;
