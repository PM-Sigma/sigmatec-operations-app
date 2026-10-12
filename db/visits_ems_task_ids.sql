-- NOT APPLIED. MAIN applies it in the Supabase SQL editor.
-- Multi-EMS (עידן 12.10): a visit summary can be linked to several EMS tasks. `ems_task_ids` holds all of them;
-- `ems_task_id` keeps holding the first one (the client keeps writing it), so every existing reader still works.
-- The client tolerates this column being absent: it reads ems_task_id instead, and the visit write retries
-- without ems_task_ids on 42703 / PGRST204 (js/src/01-data.js writeVisit). Touches public.visits only.
--
-- BACKUP (before applying): the column does not exist yet, so the only rows touched are those with an
-- ems_task_id; keep a copy of their ids:
--   create table public.visits_ems_bak_2026_10 as select id, ems_task_id from public.visits where coalesce(ems_task_id, '') <> '';
--   alter table public.visits_ems_bak_2026_10 enable row level security;
--
-- The visit edit-lock trigger (visit_edit_lock) fires on UPDATE and would refuse the backfill on every locked
-- month. The backfill only mirrors ems_task_id into the new column, so the trigger is off for this transaction
-- only and back on before commit.

begin;

alter table public.visits add column if not exists ems_task_ids text[] default '{}';

alter table public.visits disable trigger visit_edit_lock;
update public.visits
   set ems_task_ids = array[ems_task_id]
 where coalesce(ems_task_id, '') <> ''
   and coalesce(cardinality(ems_task_ids), 0) = 0;
alter table public.visits enable trigger visit_edit_lock;

commit;

-- Verify
-- select count(*) from public.visits where coalesce(ems_task_id, '') <> '' and not (ems_task_id = any (ems_task_ids));  -- 0
-- select id, ems_task_id, ems_task_ids from public.visits where cardinality(ems_task_ids) > 0 order by date desc limit 10;

-- ROLLBACK
-- alter table public.visits drop column if exists ems_task_ids;
-- (ems_task_id was never changed, so nothing else needs restoring.)
-- drop table if exists public.visits_ems_bak_2026_10;
