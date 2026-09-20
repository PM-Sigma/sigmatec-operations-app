-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  2.00 RLS lockdown — the LAST of the lockdown files. Apply it after           ║
-- ║  rls_staged.sql (STEP 2), rls_authenticated_only.sql,                         ║
-- ║  rls_corrections_lockdown.sql and rls_certs_checkins_lockdown.sql.            ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
-- Task 31 audit C, findings #1 (Critical), #2 (Critical), #3, #4, #5.
--
-- WHY THIS FILE EXISTS
-- `create policy … for select using (true)` with no `to` clause grants to `public`, and
-- `public` INCLUDES `anon`. Every table below was created that way (or with an explicit
-- `to anon`), and none of them is covered by an earlier lockdown — so even after all four
-- parked migrations run, the public anon key baked into the client bundle still SELECTs
-- internal tasks, meeting minutes, the onboarding plan, kibbutz health, the stock-recount
-- audit, the alert feed, customer legal details (ח.פ. + addresses), the meter-burn list and
-- the day plans. Spec §7n is "nothing without a sign-in"; this file is the rest of it.
--
-- THE TRUST MODEL (stated, because the policies below cannot express more than this)
-- `ems-auth` mints ONE shared pass: {role:'authenticated', iss:'ems-bridge', sub, exp} with
-- no name/identity claim (the viewer entry adds `viewer:true`). So a policy here can only
-- ever say "signed in or not" — never "who". Every per-person rule (isIdan(), canTrackTime,
-- the viewer's read-only posture) is CLIENT-side, and any signed-in employee can write as
-- any other. `to authenticated` is therefore the strongest honest statement this schema can
-- make, and finding #4 below removes a policy that pretended otherwise.
--
-- WHY NO CLIENT BREAKS (checked in code before writing this)
-- Every read below happens after the EMS sign-in: js/src/01-data.js:485 sends
-- `Authorization: Bearer <pass>` whenever one is held, js/src/15-login-gate.js gates every
-- screen on holding one, and the VIEWER mints a pass too (15-login-gate.js:305-335, mode
-- 'viewer' → the same authenticated role). The one call made during sign-in itself
-- (`tasks?select=name&limit=1`) is made WITH the fresh pass, as its self-verification.
--
--   · company_holidays — DECIDED: locked down too. The login screen does not read it; the
--     only readers are the attendance grid (js/src/04-attendance-daily.js:36) and the
--     Holidays island, both behind the gate. Nothing stays public here.
--   · delivery_certs is NOT public: rls_certs_checkins_lockdown.sql dropped the old
--     `for select using(true)` and re-created delivery_certs_read `to authenticated`. The
--     ?cert= share link is served exclusively by the SECURITY DEFINER RPC cert_by_id(uuid),
--     which returns exactly one row by id — anon enumeration of the table is closed.
--   · push_log keeps its anon read for now: it is the 📨 log screen's own table and holds no
--     customer data. Listed in the allowlist of the static test, not fixed here.
--
-- Reversible: the rollback block at the bottom restores every public read.

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- #1 — every remaining public SELECT becomes `to authenticated`
-- ══════════════════════════════════════════════════════════════════════════════

drop policy if exists it_read on public.internal_tasks;
create policy it_read on public.internal_tasks for select to authenticated using (true);

drop policy if exists ms_read on public.meeting_sessions;
create policy ms_read on public.meeting_sessions for select to authenticated using (true);

drop policy if exists me_read on public.meeting_events;
create policy me_read on public.meeting_events for select to authenticated using (true);

drop policy if exists ot_read on public.onboarding_templates;
create policy ot_read on public.onboarding_templates for select to authenticated using (true);

drop policy if exists os_read on public.onboarding_steps;
create policy os_read on public.onboarding_steps for select to authenticated using (true);

drop policy if exists kh_read on public.kibbutz_health;
create policy kh_read on public.kibbutz_health for select to authenticated using (true);

drop policy if exists day_plans_read on public.day_plans;
create policy day_plans_read on public.day_plans for select to authenticated using (true);

drop policy if exists calendar_absences_read on public.calendar_absences;
create policy calendar_absences_read on public.calendar_absences for select to authenticated using (true);

-- Decided above: not public. Only the gated attendance surfaces read it.
drop policy if exists company_holidays_read on public.company_holidays;
create policy company_holidays_read on public.company_holidays for select to authenticated using (true);

drop policy if exists dev_status_log_read on public.dev_status_log;
create policy dev_status_log_read on public.dev_status_log for select to authenticated using (true);

-- Legal name, ח.פ., address and contact per kibbutz — the most sensitive of the lot.
drop policy if exists kibbutz_details_read on public.kibbutz_details;
create policy kibbutz_details_read on public.kibbutz_details for select to authenticated using (true);

-- meter_burns / generators were granted `to anon` EXPLICITLY (db/meter_burns.sql:42,44).
drop policy if exists generators_read on public.generators;
create policy generators_read on public.generators for select to authenticated using (true);

drop policy if exists meter_burns_read on public.meter_burns;
create policy meter_burns_read on public.meter_burns for select to authenticated using (true);

-- Belt and braces for the two corrections tables: rls_corrections_lockdown.sql DROPS their
-- read policies; if that file was applied out of order these are no-ops, and if a public
-- policy is somehow back it goes away here.
drop policy if exists daylog_corrections_read on public.daylog_corrections;
drop policy if exists parse_corrections_read on public.parse_corrections;

-- ══════════════════════════════════════════════════════════════════════════════
-- #2 — push_subscriptions: `for all to anon` was the worst grant in the schema
-- ══════════════════════════════════════════════════════════════════════════════
-- Anyone holding the public anon key could read every endpoint + auth key AND DELETE every
-- row, silently killing push for the whole company. The subscribe path runs after the login
-- prompt and sends the pass (js/src/22-push.js:17-19 authHeaders → 01-data.js's `_sbToken`),
-- so `authenticated` is what it actually needs. push-send reads the table as `service_role`,
-- which RLS does not apply to.
drop policy if exists push_subs_all on public.push_subscriptions;

drop policy if exists push_subs_read on public.push_subscriptions;
create policy push_subs_read on public.push_subscriptions
  for select to authenticated using (true);
-- The device re-registers with `on_conflict=endpoint` + merge-duplicates, so it needs both.
drop policy if exists push_subs_insert on public.push_subscriptions;
create policy push_subs_insert on public.push_subscriptions
  for insert to authenticated with check (true);
drop policy if exists push_subs_update on public.push_subscriptions;
create policy push_subs_update on public.push_subscriptions
  for update to authenticated using (true) with check (true);
-- No delete policy, by design: a stale subscription is pruned server-side by push-send when
-- the push service answers 404/410, not by a client.

-- ══════════════════════════════════════════════════════════════════════════════
-- #3 — inventory_alerts / stock_recounts: an audit trail a client can delete is not one
-- ══════════════════════════════════════════════════════════════════════════════
-- Both were `for all to authenticated`, so any signed-in client could forge or delete the
-- very rows §4b calls "linked and auditable". inventory_alerts is written by the
-- SECURITY DEFINER trigger `inventory_alert_on_movement` (db/inventory_pool.sql), which RLS
-- does not gate; stock_recounts is append-only by definition.
drop policy if exists ia_read on public.inventory_alerts;
drop policy if exists ia_write on public.inventory_alerts;

create policy ia_read on public.inventory_alerts
  for select to authenticated using (true);
-- The trigger does not need this; it is here only so a future server-side backfill through a
-- normal session works. No client path inserts alerts.
drop policy if exists ia_insert on public.inventory_alerts;
create policy ia_insert on public.inventory_alerts
  for insert to authenticated with check (true);

-- Marking one seen is the ONE client write, and it must not be able to rewrite the alert
-- itself. A column-limited update policy does not exist in Postgres, so the write goes
-- through this SECURITY DEFINER RPC and the table keeps no client UPDATE policy at all.
create or replace function public.alert_mark_seen(p_id text, p_person text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory_alerts
     set seen_at = now(),
         seen_by = (
           select array_agg(distinct x)
           from unnest(coalesce(seen_by, array[]::text[]) || array[p_person]) as x
         )
   where id = p_id;
end;
$$;
revoke all on function public.alert_mark_seen(text, text) from public;
grant execute on function public.alert_mark_seen(text, text) to authenticated;
comment on function public.alert_mark_seen is
  'The only client write to inventory_alerts: touches seen_at/seen_by and nothing else '
  '(audit C #3). The table has no client UPDATE or DELETE policy.';

drop policy if exists sr_read on public.stock_recounts;
drop policy if exists sr_write on public.stock_recounts;

create policy sr_read on public.stock_recounts
  for select to authenticated using (true);
drop policy if exists sr_insert on public.stock_recounts;
create policy sr_insert on public.stock_recounts
  for insert to authenticated with check (true);
-- No update, no delete: a recount is a historical fact.

-- ══════════════════════════════════════════════════════════════════════════════
-- #4 — work_sessions: drop the ownership tautology
-- ══════════════════════════════════════════════════════════════════════════════
-- `person = coalesce(auth.jwt() ->> 'name', person)` reads as "own rows only", but the bridge
-- pass carries NO `name` claim, so the expression is literally `person = person` — it permits
-- everything while claiming to permit one row. A rule that cannot be enforced should not be
-- written as if it were: this is a plain `to authenticated` policy with the truth in a
-- comment. When `ems-auth`'s mintPass grows a `name` claim, restore the `=` test WITHOUT the
-- coalesce and this becomes a real ownership rule.
drop policy if exists ws_insert on public.work_sessions;
create policy ws_insert on public.work_sessions
  for insert to authenticated with check (true);

drop policy if exists ws_update on public.work_sessions;
create policy ws_update on public.work_sessions
  for update to authenticated using (true) with check (true);

comment on table public.work_sessions is
  'Any signed-in employee can write any person''s row: the EMS bridge pass has no identity '
  'claim, so per-person ownership CANNOT be enforced here (audit C #4). `person` is set '
  'client-side from the signed-in name. Add a `name` claim in ems-auth mintPass to fix.';

-- ══════════════════════════════════════════════════════════════════════════════
-- #5 — meter_burns: the missing INSERT policy
-- ══════════════════════════════════════════════════════════════════════════════
-- db/meter_burns.sql says "rows come only from the seed" and drops the write policy, while
-- docs/data-and-security.md promises "authenticated insert+update … so the tab can upsert the
-- EMS-owned columns live". The doc is the one that matches the product: a meter that appears
-- in the EMS must land here without a human running SQL. The code now agrees with the doc.
drop policy if exists meter_burns_insert on public.meter_burns;
create policy meter_burns_insert on public.meter_burns
  for insert to authenticated with check (true);

commit;

-- ── VERIFY (run as the anon key; every count must be 0) ──────────────────────
-- select count(*) from internal_tasks;      select count(*) from meeting_sessions;
-- select count(*) from meeting_events;      select count(*) from onboarding_templates;
-- select count(*) from onboarding_steps;    select count(*) from kibbutz_health;
-- select count(*) from stock_recounts;      select count(*) from inventory_alerts;
-- select count(*) from kibbutz_details;     select count(*) from meter_burns;
-- select count(*) from generators;          select count(*) from day_plans;
-- select count(*) from calendar_absences;   select count(*) from company_holidays;
-- select count(*) from dev_status_log;      select count(*) from push_subscriptions;

-- ── EMERGENCY ROLLBACK ───────────────────────────────────────────────────────
-- Only if a sign-in problem leaves the team unable to read anything. This puts the PUBLIC
-- reads back — it re-opens the anon hole, so treat it as a few minutes, not a state.
--
-- drop policy if exists it_read on public.internal_tasks;
-- create policy it_read on public.internal_tasks for select using (true);
-- drop policy if exists ms_read on public.meeting_sessions;
-- create policy ms_read on public.meeting_sessions for select using (true);
-- drop policy if exists me_read on public.meeting_events;
-- create policy me_read on public.meeting_events for select using (true);
-- drop policy if exists ot_read on public.onboarding_templates;
-- create policy ot_read on public.onboarding_templates for select using (true);
-- drop policy if exists os_read on public.onboarding_steps;
-- create policy os_read on public.onboarding_steps for select using (true);
-- drop policy if exists kh_read on public.kibbutz_health;
-- create policy kh_read on public.kibbutz_health for select using (true);
-- drop policy if exists day_plans_read on public.day_plans;
-- create policy day_plans_read on public.day_plans for select using (true);
-- drop policy if exists calendar_absences_read on public.calendar_absences;
-- create policy calendar_absences_read on public.calendar_absences for select using (true);
-- drop policy if exists company_holidays_read on public.company_holidays;
-- create policy company_holidays_read on public.company_holidays for select using (true);
-- drop policy if exists dev_status_log_read on public.dev_status_log;
-- create policy dev_status_log_read on public.dev_status_log for select using (true);
-- drop policy if exists kibbutz_details_read on public.kibbutz_details;
-- create policy kibbutz_details_read on public.kibbutz_details for select using (true);
-- drop policy if exists generators_read on public.generators;
-- create policy generators_read on public.generators for select to anon, authenticated using (true);
-- drop policy if exists meter_burns_read on public.meter_burns;
-- create policy meter_burns_read on public.meter_burns for select to anon, authenticated using (true);
-- drop policy if exists ia_read on public.inventory_alerts;
-- create policy ia_read on public.inventory_alerts for select using (true);
-- drop policy if exists sr_read on public.stock_recounts;
-- create policy sr_read on public.stock_recounts for select using (true);
