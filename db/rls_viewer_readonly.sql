-- rls_viewer_readonly.sql — make the view-only session read-only in the DATABASE, not only in the UI.
--
-- STATUS: WRITTEN, NOT APPLIED. Production side effect — waits for עידן's approval. Apply in the SQL
-- editor AFTER every other db/*.sql (it only ADDS policies; it drops nothing). Reversible: see ROLLBACK.
--
-- What it does
--   1. Every table with a client write policy gets a RESTRICTIVE policy per write command it opens
--      (insert / update / delete) that refuses the view-only session. Restrictive policies are AND-ed with the existing permissive ones, so staff
--      behaviour is unchanged and no existing policy is edited.
--   2. messages: the view-only session can neither read nor write it (restrictive, all commands).
--   3. work_sessions: the view-only session is refused like everywhere else (item 1).
--   Exempt on purpose: feedback (the viewer's one allowed write, spec §7 Part F) and usage_events
--   (usage tracking every session sends), plus the feedback-audio storage insert that belongs to feedback.
--
-- How the view-only session is recognised
--   The pass minted by supabase/functions/ems-auth for the view-only entry carries the claim
--   `viewer: true` (sub = 'viewer'). Staff passes carry no such claim, so `is distinct from 'true'` is
--   true for them and for any pass minted before this change.
--
-- DONE (X-L1 / X-L2): the `name` claim now exists (supabase/functions/ems-auth mints it from
-- db/staff_identities.sql), and db/rls_person_scoped.sql replaces messages_auth_all with
-- sender/recipient policies and narrows work_sessions' own-row policies for real. See that
-- file for its STATUS and the order it must apply in (after this file, via X-L3).
--
-- Verify after applying (as the view-only session): any insert/update/delete on a table below → RLS
-- error; select still works (except messages); feedback insert still works.


-- attendance
drop policy if exists attendance_no_viewer_insert on public.attendance;
create policy attendance_no_viewer_insert on public.attendance as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists attendance_no_viewer_update on public.attendance;
create policy attendance_no_viewer_update on public.attendance as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists attendance_no_viewer_delete on public.attendance;
create policy attendance_no_viewer_delete on public.attendance as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- calendar_absences
drop policy if exists calendar_absences_no_viewer_insert on public.calendar_absences;
create policy calendar_absences_no_viewer_insert on public.calendar_absences as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists calendar_absences_no_viewer_update on public.calendar_absences;
create policy calendar_absences_no_viewer_update on public.calendar_absences as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists calendar_absences_no_viewer_delete on public.calendar_absences;
create policy calendar_absences_no_viewer_delete on public.calendar_absences as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- company_holidays
drop policy if exists company_holidays_no_viewer_insert on public.company_holidays;
create policy company_holidays_no_viewer_insert on public.company_holidays as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists company_holidays_no_viewer_update on public.company_holidays;
create policy company_holidays_no_viewer_update on public.company_holidays as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists company_holidays_no_viewer_delete on public.company_holidays;
create policy company_holidays_no_viewer_delete on public.company_holidays as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- day_plans
drop policy if exists day_plans_no_viewer_insert on public.day_plans;
create policy day_plans_no_viewer_insert on public.day_plans as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists day_plans_no_viewer_update on public.day_plans;
create policy day_plans_no_viewer_update on public.day_plans as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists day_plans_no_viewer_delete on public.day_plans;
create policy day_plans_no_viewer_delete on public.day_plans as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- daylog_corrections
drop policy if exists daylog_corrections_no_viewer_insert on public.daylog_corrections;
create policy daylog_corrections_no_viewer_insert on public.daylog_corrections as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- delivery_certs
drop policy if exists delivery_certs_no_viewer_insert on public.delivery_certs;
create policy delivery_certs_no_viewer_insert on public.delivery_certs as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists delivery_certs_no_viewer_update on public.delivery_certs;
create policy delivery_certs_no_viewer_update on public.delivery_certs as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- dev_status_log
drop policy if exists dev_status_log_no_viewer_insert on public.dev_status_log;
create policy dev_status_log_no_viewer_insert on public.dev_status_log as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- ems_cache
drop policy if exists ems_cache_no_viewer_insert on public.ems_cache;
create policy ems_cache_no_viewer_insert on public.ems_cache as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists ems_cache_no_viewer_update on public.ems_cache;
create policy ems_cache_no_viewer_update on public.ems_cache as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists ems_cache_no_viewer_delete on public.ems_cache;
create policy ems_cache_no_viewer_delete on public.ems_cache as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- ems_queue
drop policy if exists ems_queue_no_viewer_insert on public.ems_queue;
create policy ems_queue_no_viewer_insert on public.ems_queue as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists ems_queue_no_viewer_update on public.ems_queue;
create policy ems_queue_no_viewer_update on public.ems_queue as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists ems_queue_no_viewer_delete on public.ems_queue;
create policy ems_queue_no_viewer_delete on public.ems_queue as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- field_checkins
drop policy if exists field_checkins_no_viewer_insert on public.field_checkins;
create policy field_checkins_no_viewer_insert on public.field_checkins as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists field_checkins_no_viewer_update on public.field_checkins;
create policy field_checkins_no_viewer_update on public.field_checkins as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists field_checkins_no_viewer_delete on public.field_checkins;
create policy field_checkins_no_viewer_delete on public.field_checkins as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- generators
drop policy if exists generators_no_viewer_insert on public.generators;
create policy generators_no_viewer_insert on public.generators as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists generators_no_viewer_update on public.generators;
create policy generators_no_viewer_update on public.generators as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- internal_tasks
drop policy if exists internal_tasks_no_viewer_insert on public.internal_tasks;
create policy internal_tasks_no_viewer_insert on public.internal_tasks as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists internal_tasks_no_viewer_update on public.internal_tasks;
create policy internal_tasks_no_viewer_update on public.internal_tasks as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists internal_tasks_no_viewer_delete on public.internal_tasks;
create policy internal_tasks_no_viewer_delete on public.internal_tasks as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- inventory_alerts
drop policy if exists inventory_alerts_no_viewer_insert on public.inventory_alerts;
create policy inventory_alerts_no_viewer_insert on public.inventory_alerts as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- kibbutz_details
drop policy if exists kibbutz_details_no_viewer_insert on public.kibbutz_details;
create policy kibbutz_details_no_viewer_insert on public.kibbutz_details as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists kibbutz_details_no_viewer_update on public.kibbutz_details;
create policy kibbutz_details_no_viewer_update on public.kibbutz_details as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists kibbutz_details_no_viewer_delete on public.kibbutz_details;
create policy kibbutz_details_no_viewer_delete on public.kibbutz_details as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- kibbutz_health
drop policy if exists kibbutz_health_no_viewer_insert on public.kibbutz_health;
create policy kibbutz_health_no_viewer_insert on public.kibbutz_health as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists kibbutz_health_no_viewer_update on public.kibbutz_health;
create policy kibbutz_health_no_viewer_update on public.kibbutz_health as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists kibbutz_health_no_viewer_delete on public.kibbutz_health;
create policy kibbutz_health_no_viewer_delete on public.kibbutz_health as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- kibbutz_meeting_notes
drop policy if exists kibbutz_meeting_notes_no_viewer_insert on public.kibbutz_meeting_notes;
create policy kibbutz_meeting_notes_no_viewer_insert on public.kibbutz_meeting_notes as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists kibbutz_meeting_notes_no_viewer_update on public.kibbutz_meeting_notes;
create policy kibbutz_meeting_notes_no_viewer_update on public.kibbutz_meeting_notes as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists kibbutz_meeting_notes_no_viewer_delete on public.kibbutz_meeting_notes;
create policy kibbutz_meeting_notes_no_viewer_delete on public.kibbutz_meeting_notes as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- kibbutzim
drop policy if exists kibbutzim_no_viewer_insert on public.kibbutzim;
create policy kibbutzim_no_viewer_insert on public.kibbutzim as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists kibbutzim_no_viewer_update on public.kibbutzim;
create policy kibbutzim_no_viewer_update on public.kibbutzim as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists kibbutzim_no_viewer_delete on public.kibbutzim;
create policy kibbutzim_no_viewer_delete on public.kibbutzim as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- meeting_events
drop policy if exists meeting_events_no_viewer_insert on public.meeting_events;
create policy meeting_events_no_viewer_insert on public.meeting_events as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists meeting_events_no_viewer_update on public.meeting_events;
create policy meeting_events_no_viewer_update on public.meeting_events as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists meeting_events_no_viewer_delete on public.meeting_events;
create policy meeting_events_no_viewer_delete on public.meeting_events as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- meeting_sessions
drop policy if exists meeting_sessions_no_viewer_insert on public.meeting_sessions;
create policy meeting_sessions_no_viewer_insert on public.meeting_sessions as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists meeting_sessions_no_viewer_update on public.meeting_sessions;
create policy meeting_sessions_no_viewer_update on public.meeting_sessions as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists meeting_sessions_no_viewer_delete on public.meeting_sessions;
create policy meeting_sessions_no_viewer_delete on public.meeting_sessions as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- meter_burns
drop policy if exists meter_burns_no_viewer_insert on public.meter_burns;
create policy meter_burns_no_viewer_insert on public.meter_burns as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists meter_burns_no_viewer_update on public.meter_burns;
create policy meter_burns_no_viewer_update on public.meter_burns as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- movements
drop policy if exists movements_no_viewer_insert on public.movements;
create policy movements_no_viewer_insert on public.movements as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists movements_no_viewer_update on public.movements;
create policy movements_no_viewer_update on public.movements as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists movements_no_viewer_delete on public.movements;
create policy movements_no_viewer_delete on public.movements as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- onboarding_steps
drop policy if exists onboarding_steps_no_viewer_insert on public.onboarding_steps;
create policy onboarding_steps_no_viewer_insert on public.onboarding_steps as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists onboarding_steps_no_viewer_update on public.onboarding_steps;
create policy onboarding_steps_no_viewer_update on public.onboarding_steps as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists onboarding_steps_no_viewer_delete on public.onboarding_steps;
create policy onboarding_steps_no_viewer_delete on public.onboarding_steps as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- onboarding_templates
drop policy if exists onboarding_templates_no_viewer_insert on public.onboarding_templates;
create policy onboarding_templates_no_viewer_insert on public.onboarding_templates as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists onboarding_templates_no_viewer_update on public.onboarding_templates;
create policy onboarding_templates_no_viewer_update on public.onboarding_templates as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists onboarding_templates_no_viewer_delete on public.onboarding_templates;
create policy onboarding_templates_no_viewer_delete on public.onboarding_templates as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- orders
drop policy if exists orders_no_viewer_insert on public.orders;
create policy orders_no_viewer_insert on public.orders as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists orders_no_viewer_update on public.orders;
create policy orders_no_viewer_update on public.orders as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists orders_no_viewer_delete on public.orders;
create policy orders_no_viewer_delete on public.orders as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- parse_corrections
drop policy if exists parse_corrections_no_viewer_insert on public.parse_corrections;
create policy parse_corrections_no_viewer_insert on public.parse_corrections as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- potentials
drop policy if exists potentials_no_viewer_insert on public.potentials;
create policy potentials_no_viewer_insert on public.potentials as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists potentials_no_viewer_update on public.potentials;
create policy potentials_no_viewer_update on public.potentials as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists potentials_no_viewer_delete on public.potentials;
create policy potentials_no_viewer_delete on public.potentials as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- products
drop policy if exists products_no_viewer_insert on public.products;
create policy products_no_viewer_insert on public.products as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists products_no_viewer_update on public.products;
create policy products_no_viewer_update on public.products as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists products_no_viewer_delete on public.products;
create policy products_no_viewer_delete on public.products as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- push_log
drop policy if exists push_log_no_viewer_insert on public.push_log;
create policy push_log_no_viewer_insert on public.push_log as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- push_subscriptions
drop policy if exists push_subscriptions_no_viewer_insert on public.push_subscriptions;
create policy push_subscriptions_no_viewer_insert on public.push_subscriptions as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists push_subscriptions_no_viewer_update on public.push_subscriptions;
create policy push_subscriptions_no_viewer_update on public.push_subscriptions as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists push_subscriptions_no_viewer_delete on public.push_subscriptions;
create policy push_subscriptions_no_viewer_delete on public.push_subscriptions as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- regions
drop policy if exists regions_no_viewer_insert on public.regions;
create policy regions_no_viewer_insert on public.regions as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists regions_no_viewer_update on public.regions;
create policy regions_no_viewer_update on public.regions as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists regions_no_viewer_delete on public.regions;
create policy regions_no_viewer_delete on public.regions as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- requirements
drop policy if exists requirements_no_viewer_insert on public.requirements;
create policy requirements_no_viewer_insert on public.requirements as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists requirements_no_viewer_update on public.requirements;
create policy requirements_no_viewer_update on public.requirements as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists requirements_no_viewer_delete on public.requirements;
create policy requirements_no_viewer_delete on public.requirements as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- returns
drop policy if exists returns_no_viewer_insert on public.returns;
create policy returns_no_viewer_insert on public.returns as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists returns_no_viewer_update on public.returns;
create policy returns_no_viewer_update on public.returns as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists returns_no_viewer_delete on public.returns;
create policy returns_no_viewer_delete on public.returns as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- settings
drop policy if exists settings_no_viewer_insert on public.settings;
create policy settings_no_viewer_insert on public.settings as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists settings_no_viewer_update on public.settings;
create policy settings_no_viewer_update on public.settings as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists settings_no_viewer_delete on public.settings;
create policy settings_no_viewer_delete on public.settings as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- site_contacts
drop policy if exists site_contacts_no_viewer_insert on public.site_contacts;
create policy site_contacts_no_viewer_insert on public.site_contacts as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists site_contacts_no_viewer_update on public.site_contacts;
create policy site_contacts_no_viewer_update on public.site_contacts as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists site_contacts_no_viewer_delete on public.site_contacts;
create policy site_contacts_no_viewer_delete on public.site_contacts as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- stock_recounts
drop policy if exists stock_recounts_no_viewer_insert on public.stock_recounts;
create policy stock_recounts_no_viewer_insert on public.stock_recounts as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- tasks
drop policy if exists tasks_no_viewer_insert on public.tasks;
create policy tasks_no_viewer_insert on public.tasks as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists tasks_no_viewer_update on public.tasks;
create policy tasks_no_viewer_update on public.tasks as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists tasks_no_viewer_delete on public.tasks;
create policy tasks_no_viewer_delete on public.tasks as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- user_settings
drop policy if exists user_settings_no_viewer_insert on public.user_settings;
create policy user_settings_no_viewer_insert on public.user_settings as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists user_settings_no_viewer_update on public.user_settings;
create policy user_settings_no_viewer_update on public.user_settings as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists user_settings_no_viewer_delete on public.user_settings;
create policy user_settings_no_viewer_delete on public.user_settings as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- visit_drafts
drop policy if exists visit_drafts_no_viewer_insert on public.visit_drafts;
create policy visit_drafts_no_viewer_insert on public.visit_drafts as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists visit_drafts_no_viewer_update on public.visit_drafts;
create policy visit_drafts_no_viewer_update on public.visit_drafts as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists visit_drafts_no_viewer_delete on public.visit_drafts;
create policy visit_drafts_no_viewer_delete on public.visit_drafts as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- visits
drop policy if exists visits_no_viewer_insert on public.visits;
create policy visits_no_viewer_insert on public.visits as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists visits_no_viewer_update on public.visits;
create policy visits_no_viewer_update on public.visits as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists visits_no_viewer_delete on public.visits;
create policy visits_no_viewer_delete on public.visits as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- work_sessions
drop policy if exists work_sessions_no_viewer_insert on public.work_sessions;
create policy work_sessions_no_viewer_insert on public.work_sessions as restrictive for insert to authenticated with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists work_sessions_no_viewer_update on public.work_sessions;
create policy work_sessions_no_viewer_update on public.work_sessions as restrictive for update to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
drop policy if exists work_sessions_no_viewer_delete on public.work_sessions;
create policy work_sessions_no_viewer_delete on public.work_sessions as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- messages: staff only, all commands
drop policy if exists messages_no_viewer on public.messages;
create policy messages_no_viewer on public.messages as restrictive for all to authenticated using (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true') with check (coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');

-- ROLLBACK (run to undo):
-- drop policy if exists attendance_no_viewer_insert on public.attendance;
-- drop policy if exists attendance_no_viewer_update on public.attendance;
-- drop policy if exists attendance_no_viewer_delete on public.attendance;
-- drop policy if exists calendar_absences_no_viewer_insert on public.calendar_absences;
-- drop policy if exists calendar_absences_no_viewer_update on public.calendar_absences;
-- drop policy if exists calendar_absences_no_viewer_delete on public.calendar_absences;
-- drop policy if exists company_holidays_no_viewer_insert on public.company_holidays;
-- drop policy if exists company_holidays_no_viewer_update on public.company_holidays;
-- drop policy if exists company_holidays_no_viewer_delete on public.company_holidays;
-- drop policy if exists day_plans_no_viewer_insert on public.day_plans;
-- drop policy if exists day_plans_no_viewer_update on public.day_plans;
-- drop policy if exists day_plans_no_viewer_delete on public.day_plans;
-- drop policy if exists daylog_corrections_no_viewer_insert on public.daylog_corrections;
-- drop policy if exists delivery_certs_no_viewer_insert on public.delivery_certs;
-- drop policy if exists delivery_certs_no_viewer_update on public.delivery_certs;
-- drop policy if exists dev_status_log_no_viewer_insert on public.dev_status_log;
-- drop policy if exists ems_cache_no_viewer_insert on public.ems_cache;
-- drop policy if exists ems_cache_no_viewer_update on public.ems_cache;
-- drop policy if exists ems_cache_no_viewer_delete on public.ems_cache;
-- drop policy if exists ems_queue_no_viewer_insert on public.ems_queue;
-- drop policy if exists ems_queue_no_viewer_update on public.ems_queue;
-- drop policy if exists ems_queue_no_viewer_delete on public.ems_queue;
-- drop policy if exists field_checkins_no_viewer_insert on public.field_checkins;
-- drop policy if exists field_checkins_no_viewer_update on public.field_checkins;
-- drop policy if exists field_checkins_no_viewer_delete on public.field_checkins;
-- drop policy if exists generators_no_viewer_insert on public.generators;
-- drop policy if exists generators_no_viewer_update on public.generators;
-- drop policy if exists internal_tasks_no_viewer_insert on public.internal_tasks;
-- drop policy if exists internal_tasks_no_viewer_update on public.internal_tasks;
-- drop policy if exists internal_tasks_no_viewer_delete on public.internal_tasks;
-- drop policy if exists inventory_alerts_no_viewer_insert on public.inventory_alerts;
-- drop policy if exists kibbutz_details_no_viewer_insert on public.kibbutz_details;
-- drop policy if exists kibbutz_details_no_viewer_update on public.kibbutz_details;
-- drop policy if exists kibbutz_details_no_viewer_delete on public.kibbutz_details;
-- drop policy if exists kibbutz_health_no_viewer_insert on public.kibbutz_health;
-- drop policy if exists kibbutz_health_no_viewer_update on public.kibbutz_health;
-- drop policy if exists kibbutz_health_no_viewer_delete on public.kibbutz_health;
-- drop policy if exists kibbutz_meeting_notes_no_viewer_insert on public.kibbutz_meeting_notes;
-- drop policy if exists kibbutz_meeting_notes_no_viewer_update on public.kibbutz_meeting_notes;
-- drop policy if exists kibbutz_meeting_notes_no_viewer_delete on public.kibbutz_meeting_notes;
-- drop policy if exists kibbutzim_no_viewer_insert on public.kibbutzim;
-- drop policy if exists kibbutzim_no_viewer_update on public.kibbutzim;
-- drop policy if exists kibbutzim_no_viewer_delete on public.kibbutzim;
-- drop policy if exists meeting_events_no_viewer_insert on public.meeting_events;
-- drop policy if exists meeting_events_no_viewer_update on public.meeting_events;
-- drop policy if exists meeting_events_no_viewer_delete on public.meeting_events;
-- drop policy if exists meeting_sessions_no_viewer_insert on public.meeting_sessions;
-- drop policy if exists meeting_sessions_no_viewer_update on public.meeting_sessions;
-- drop policy if exists meeting_sessions_no_viewer_delete on public.meeting_sessions;
-- drop policy if exists meter_burns_no_viewer_insert on public.meter_burns;
-- drop policy if exists meter_burns_no_viewer_update on public.meter_burns;
-- drop policy if exists movements_no_viewer_insert on public.movements;
-- drop policy if exists movements_no_viewer_update on public.movements;
-- drop policy if exists movements_no_viewer_delete on public.movements;
-- drop policy if exists onboarding_steps_no_viewer_insert on public.onboarding_steps;
-- drop policy if exists onboarding_steps_no_viewer_update on public.onboarding_steps;
-- drop policy if exists onboarding_steps_no_viewer_delete on public.onboarding_steps;
-- drop policy if exists onboarding_templates_no_viewer_insert on public.onboarding_templates;
-- drop policy if exists onboarding_templates_no_viewer_update on public.onboarding_templates;
-- drop policy if exists onboarding_templates_no_viewer_delete on public.onboarding_templates;
-- drop policy if exists orders_no_viewer_insert on public.orders;
-- drop policy if exists orders_no_viewer_update on public.orders;
-- drop policy if exists orders_no_viewer_delete on public.orders;
-- drop policy if exists parse_corrections_no_viewer_insert on public.parse_corrections;
-- drop policy if exists potentials_no_viewer_insert on public.potentials;
-- drop policy if exists potentials_no_viewer_update on public.potentials;
-- drop policy if exists potentials_no_viewer_delete on public.potentials;
-- drop policy if exists products_no_viewer_insert on public.products;
-- drop policy if exists products_no_viewer_update on public.products;
-- drop policy if exists products_no_viewer_delete on public.products;
-- drop policy if exists push_log_no_viewer_insert on public.push_log;
-- drop policy if exists push_subscriptions_no_viewer_insert on public.push_subscriptions;
-- drop policy if exists push_subscriptions_no_viewer_update on public.push_subscriptions;
-- drop policy if exists push_subscriptions_no_viewer_delete on public.push_subscriptions;
-- drop policy if exists regions_no_viewer_insert on public.regions;
-- drop policy if exists regions_no_viewer_update on public.regions;
-- drop policy if exists regions_no_viewer_delete on public.regions;
-- drop policy if exists requirements_no_viewer_insert on public.requirements;
-- drop policy if exists requirements_no_viewer_update on public.requirements;
-- drop policy if exists requirements_no_viewer_delete on public.requirements;
-- drop policy if exists returns_no_viewer_insert on public.returns;
-- drop policy if exists returns_no_viewer_update on public.returns;
-- drop policy if exists returns_no_viewer_delete on public.returns;
-- drop policy if exists settings_no_viewer_insert on public.settings;
-- drop policy if exists settings_no_viewer_update on public.settings;
-- drop policy if exists settings_no_viewer_delete on public.settings;
-- drop policy if exists site_contacts_no_viewer_insert on public.site_contacts;
-- drop policy if exists site_contacts_no_viewer_update on public.site_contacts;
-- drop policy if exists site_contacts_no_viewer_delete on public.site_contacts;
-- drop policy if exists stock_recounts_no_viewer_insert on public.stock_recounts;
-- drop policy if exists tasks_no_viewer_insert on public.tasks;
-- drop policy if exists tasks_no_viewer_update on public.tasks;
-- drop policy if exists tasks_no_viewer_delete on public.tasks;
-- drop policy if exists user_settings_no_viewer_insert on public.user_settings;
-- drop policy if exists user_settings_no_viewer_update on public.user_settings;
-- drop policy if exists user_settings_no_viewer_delete on public.user_settings;
-- drop policy if exists visit_drafts_no_viewer_insert on public.visit_drafts;
-- drop policy if exists visit_drafts_no_viewer_update on public.visit_drafts;
-- drop policy if exists visit_drafts_no_viewer_delete on public.visit_drafts;
-- drop policy if exists visits_no_viewer_insert on public.visits;
-- drop policy if exists visits_no_viewer_update on public.visits;
-- drop policy if exists visits_no_viewer_delete on public.visits;
-- drop policy if exists work_sessions_no_viewer_insert on public.work_sessions;
-- drop policy if exists work_sessions_no_viewer_update on public.work_sessions;
-- drop policy if exists work_sessions_no_viewer_delete on public.work_sessions;
-- drop policy if exists messages_no_viewer on public.messages;
