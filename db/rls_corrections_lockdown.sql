-- db/rls_corrections_lockdown.sql — remove the anon SELECT on the two "corrections" tables.
--
-- ⚠️ NOT APPLIED. Filed by the Task 16 review, written by the Task 18 integration sweep,
-- to be run by עידן. See "Deploy needed" in .superpowers/sdd/…/task-18a-report.md.
--
-- WHY
-- Both tables were created with `for select using (true)` — readable by anyone holding the
-- PUBLIC anon key, which ships in the client bundle. The comments in the original migrations
-- justify it with "these are mapping shapes, not sensitive". That was true of the SHAPES and
-- false of the ROWS:
--   · daylog_corrections carries `person` and `raw_len` — who dictated a day log, when, and how
--     long it was. That is an attendance signal about a named employee, readable by the world.
--   · parse_corrections carries `raw_text` — the actual order text a customer sent, verbatim,
--     with product names and quantities, plus `created_by`.
-- Nothing in the BROWSER reads either table: the only readers are the two Edge Functions, which
-- fetch few-shot examples server-side. So the anon SELECT buys the app nothing and costs it a
-- public read of customer text.
--
-- ORDER OF OPERATIONS (both halves are required — the second alone silently degrades the
-- parsers to zero few-shot examples, because both reads fail closed into a `catch`):
--   1. Deploy `parse-daylog` and `parse-order`. Both now read with SUPABASE_SERVICE_ROLE_KEY
--      (injected by the platform), falling back to the anon key, so they work either way.
--   2. Run this file.
--   3. Verify: `select * from pg_policies where tablename in
--      ('daylog_corrections','parse_corrections');` — each table should list exactly one
--      INSERT policy for `authenticated` and no SELECT policy at all.
--   4. Smoke: dictate one day log (📝 יומן היום) and paste one order — both must still parse.
--      The service role bypasses RLS, so the few-shot examples keep flowing.
--
-- ROLLBACK: re-run the SELECT policies from db/daylog_corrections.sql and db/parse_corrections.sql.
-- Both files remain the tables' source of truth for everything except these two policies; this
-- file is the amendment, and the comments there have been left pointing at it.

begin;

-- ── daylog_corrections ──────────────────────────────────────────────────────────────────
-- Dropped, not narrowed: no browser code reads this table, so there is no role to narrow TO.
drop policy if exists daylog_corrections_read on public.daylog_corrections;

-- ── parse_corrections ───────────────────────────────────────────────────────────────────
drop policy if exists parse_corrections_read on public.parse_corrections;

-- The INSERT policies are deliberately untouched: the app writes an accepted correction
-- through the authenticated EMS→Supabase bridge pass, and that path still has to work.

commit;

-- Post-check (run separately; should return zero rows):
--   select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('daylog_corrections', 'parse_corrections')
--     and cmd = 'SELECT';
