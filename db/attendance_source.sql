-- NOT APPLIED. עידן applies it in the Supabase SQL editor. Round 5, package V (attendance rules, rule 5).
-- Idempotent: safe to run twice, and safe whether or not db/calendar_absences.sql (which also adds `source`) ran.
-- Values: manual (typed by a person), visit_auto (written by a visit save for אביאם/ניתאי), calendar (apply_absence).
begin;
alter table public.attendance add column if not exists source text not null default 'manual';
update public.attendance set source = 'visit_auto' where source = 'visit';
update public.attendance set source = 'manual' where source is null or source = '';
alter table public.attendance drop constraint if exists attendance_source_check;
alter table public.attendance add constraint attendance_source_check
  check (source in ('manual', 'visit_auto', 'calendar'));
create unique index if not exists attendance_visit_auto_day
  on public.attendance (person, left(date, 10)) where source = 'visit_auto';
comment on column public.attendance.source is
  'manual | visit_auto (a visit save, אביאם/ניתאי only) | calendar (apply_absence)';
commit;

-- Verify
-- select source, count(*) from public.attendance group by 1 order by 1;   -- only the three values
-- select indexname from pg_indexes where tablename = 'attendance';           -- attendance_visit_auto_day present

-- ROLLBACK
-- drop index if exists public.attendance_visit_auto_day;
-- alter table public.attendance drop constraint if exists attendance_source_check;
-- (the column stays: calendar_absences.sql depends on it)
