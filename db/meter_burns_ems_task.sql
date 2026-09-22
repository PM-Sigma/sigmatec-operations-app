-- 🔥 meter_burns — a reported problem can open an EMS fault task (עידן 22.9, I3). The task's
-- id is kept on the meter so the row can say "נפתחה משימה" and link to it.
-- Additive and idempotent; the client falls back to the old shape when the column is missing.

alter table meter_burns add column if not exists ems_task_id text;
