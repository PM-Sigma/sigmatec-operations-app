-- 🔒 internal_tasks — the three fields עידן asked for on 22.9 (phone QA round, D3):
-- a due date (may stay empty), a priority and a kind, so an internal task carries the same
-- parts an EMS task does. This supersedes the §8b "no due dates" ruling of 18.9.
--
-- Additive and idempotent. The client writes these columns when they exist and falls back to
-- the old shape when they do not (InternalTasks.tsx createInternalTask), so the app keeps
-- working before this is applied. Apply in the Supabase SQL editor with the other db/*.sql.

alter table internal_tasks add column if not exists due_date date;
alter table internal_tasks add column if not exists priority text;   -- low | normal | high | urgent (EMS vocabulary)
alter table internal_tasks add column if not exists kind text;       -- free label: מעקב · תיאום · טכני · אחר

create index if not exists internal_tasks_due on internal_tasks (due_date) where done = false;
