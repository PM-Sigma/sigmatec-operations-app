-- Link a visit to the EMS task it reported against (נוכחות-hub work, 1.60).
-- Without this the visit↔EMS link lived only in the form at save time and was never stored, so
-- editing a visit later had no way to know which task to update. Mirrors orders.ems_task_id.
--
-- APPLIED to production 2026-08-02 via the Supabase MCP (apply_migration: visits_ems_task_id).
-- Safe to re-run.
alter table public.visits add column if not exists ems_task_id text default '';

-- App-side wiring that goes with it (all done in 1.60):
--   1. 01-data.js — map ems_task_id ⇄ emsTaskId in the visit read + writeVisit row.
--   2. 09-visits.js (saveVisit) — persist the chosen EMS task id from readVisitEmsIntent();
--      on an EDIT of a visit that already has one, push an update comment to that task.
--   3. 04-attendance-daily.js — ✏️ on a field row opens that visit for editing from נוכחות.
