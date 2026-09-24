-- rls_person_scoped.sql — messages and work_sessions, scoped to the person (X-L2).
--
-- STATUS: WRITTEN, NOT APPLIED. Production side effect — waits for עידן's explicit "כן"
-- (X-L3, step 5), and only after the `name` claim (X-L1) has been live for at least 180
-- minutes (the pass lifetime), so no name-less staff pass is still in use. Apply AFTER
-- db/rls_viewer_readonly.sql.
--
-- What it does
--   messages:      you read and mark read only what is addressed to you; you send only as
--                  yourself. Closes the gap rls_2_00_lockdown.sql's comment on work_sessions
--                  already named: a pass with no identity claim cannot be scoped to a person.
--   work_sessions: own rows; עידן/עמיחי (the Hours admins, ws_admin_* in work_sessions_log.sql)
--                  keep reading/writing everyone's, unchanged; the viewer reads every row,
--                  same as today (hours.ts:22-30) — Hours must not go blank for him.
--
-- Why not sooner: db/rls_2_00_lockdown.sql's work_sessions comment already names the gap —
-- `person = coalesce(auth.jwt() ->> 'name', person)` compared a column to itself while the
-- pass carried no `name` claim to compare it against. This file replaces that placeholder with
-- a real ownership check, now that the claim exists.

-- messages: the recipient reads and marks read; you send only as yourself.
-- Every create is preceded by its own `drop policy if exists` (audit fix, Opus 24.9) so this
-- file can be re-run — a retried apply, or a future edit to one of these policies — without
-- erroring on "policy already exists".
drop policy if exists messages_auth_all on public.messages;
drop policy if exists messages_read_mine on public.messages;
create policy messages_read_mine   on public.messages for select to authenticated using ((auth.jwt() ->> 'name') = to_person);
drop policy if exists messages_send_as_me on public.messages;
create policy messages_send_as_me  on public.messages for insert to authenticated with check (from_person = (auth.jwt() ->> 'name'));
drop policy if exists messages_mark_mine on public.messages;
create policy messages_mark_mine   on public.messages for update to authenticated using ((auth.jwt() ->> 'name') = to_person) with check ((auth.jwt() ->> 'name') = to_person);

-- work_sessions: own rows; עידן/עמיחי (Hours admins) all rows; the viewer reads (Hours is read-only for him).
-- Drops both the OLD names (so the old permissive rows are actually gone) and the NEW ones
-- (so re-running this file, after a partial failure or a future edit, does not error on
-- "policy already exists" — audit fix, Opus 24.9).
drop policy if exists ws_read   on public.work_sessions;
drop policy if exists ws_insert on public.work_sessions;
drop policy if exists ws_update on public.work_sessions;
drop policy if exists ws_delete on public.work_sessions;
drop policy if exists ws_read_scoped on public.work_sessions;
create policy ws_read_scoped on public.work_sessions for select to authenticated using (
  person = (auth.jwt() ->> 'name')
  or (auth.jwt() ->> 'name') in ('עידן', 'עמיחי')
  or coalesce(auth.jwt() ->> 'viewer', 'false') = 'true');
drop policy if exists ws_write_own on public.work_sessions;
create policy ws_write_own on public.work_sessions for insert to authenticated with check (person = (auth.jwt() ->> 'name'));
drop policy if exists ws_update_own on public.work_sessions;
create policy ws_update_own on public.work_sessions for update to authenticated using (person = (auth.jwt() ->> 'name')) with check (person = (auth.jwt() ->> 'name'));
drop policy if exists ws_delete_own on public.work_sessions;
create policy ws_delete_own on public.work_sessions for delete to authenticated using (person = (auth.jwt() ->> 'name'));
-- ws_admin_insert / ws_admin_update / ws_admin_delete (name in עידן, עמיחי) already exist
-- (work_sessions_log.sql) and start working for real once the claim exists.

-- Verify after applying (X-L3 step 5, with claims set per-transaction):
--   אביאם reads only his own work_sessions rows; עמיחי reads all; the viewer reads all and
--   cannot insert; אביאם cannot insert a row for ניתאי; a message to ניתאי is invisible to אביאם.

-- ROLLBACK — restores the LIVE originals verbatim (audit fix, Opus 24.9: the previous version
-- of this block restored ws_insert/ws_update from a migration rls_2_00_lockdown.sql had already
-- superseded, and dropped ws_delete_own without restoring work_sessions_timer.sql's ws_delete —
-- a rollback that left the table with NO delete policy at all).
-- drop policy if exists messages_read_mine on public.messages;
-- drop policy if exists messages_send_as_me on public.messages;
-- drop policy if exists messages_mark_mine on public.messages;
-- drop policy if exists messages_auth_all on public.messages;
-- create policy messages_auth_all on public.messages for all to authenticated using (true) with check (true);
--
-- drop policy if exists ws_read_scoped on public.work_sessions;
-- drop policy if exists ws_write_own on public.work_sessions;
-- drop policy if exists ws_update_own on public.work_sessions;
-- drop policy if exists ws_delete_own on public.work_sessions;
-- drop policy if exists ws_read on public.work_sessions;
-- create policy ws_read on public.work_sessions for select to authenticated using (true);
-- drop policy if exists ws_insert on public.work_sessions;
-- create policy ws_insert on public.work_sessions for insert to authenticated with check (true);
-- drop policy if exists ws_update on public.work_sessions;
-- create policy ws_update on public.work_sessions for update to authenticated using (true) with check (true);
-- drop policy if exists ws_delete on public.work_sessions;
-- create policy ws_delete on public.work_sessions for delete to authenticated
--   using (person = coalesce(auth.jwt() ->> 'name', person));
