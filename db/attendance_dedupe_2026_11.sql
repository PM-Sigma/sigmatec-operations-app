-- Attendance duplicate-day cleanup (2026-11) — NOT APPLIED. Needs עידן's approval.
--
-- Why: before this fix every manual save INSERTED a new row (random id), so re-picking a
-- type for the same person+day left several rows. The screen shows the strongest/first one
-- (mergeByDay), the exports/push may see another.
--
-- Rule (conservative): per person+day, among MANUAL rows only, keep the NEWEST (the id embeds
-- the creation epoch-ms: att_<ms>_<rand>) and delete the older manual ones. visit_auto /
-- calendar rows are never touched (a day with visit_auto + manual stays as is — manual wins
-- on screen by design).
--
-- 1) BACKUP (run first, keep the table until עידן confirms)
create table if not exists public.attendance_dedupe_backup_2026_11 as
  select * from public.attendance where false;

with ranked as (
  select a.*,
         row_number() over (
           partition by person, left(date, 10)
           order by nullif(split_part(id, '_', 2), '')::numeric desc nulls last, id desc
         ) as rn
  from public.attendance a
  where coalesce(source, 'manual') = 'manual'
)
insert into public.attendance_dedupe_backup_2026_11
select id, date, person, day_type, note, source from ranked where rn > 1;

-- 2) REVIEW what will be deleted (should equal the list in the report)
select * from public.attendance_dedupe_backup_2026_11 order by person, date, id;

-- 3) DELETE (only the rows backed up above)
-- begin;
-- delete from public.attendance where id in (select id from public.attendance_dedupe_backup_2026_11);
-- -- check: select person, left(date,10), count(*) from public.attendance
-- --        where coalesce(source,'manual')='manual' group by 1,2 having count(*)>1;  → 0 rows
-- commit;

-- ROLLBACK (restore the deleted rows)
-- insert into public.attendance (id, date, person, day_type, note, source)
--   select id, date, person, day_type, note, source from public.attendance_dedupe_backup_2026_11
--   on conflict (id) do nothing;
