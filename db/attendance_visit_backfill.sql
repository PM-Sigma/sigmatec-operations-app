-- NOT APPLIED. עידן applies it in the SQL editor AFTER db/attendance_source.sql and BEFORE the V-L6 client and the
-- push-send deploy ship (until then field days are still derived from visits, so nothing is missing in between).
-- One-time backfill (round 5, rule 5): one `visit_auto` שטח row per (person, day) for אביאם/ניתאי where a visit lists
-- them and that day has NO attendance row at all. A day with a manual row of another type is left alone and listed by
-- the second query for עידן to look at. Re-running inserts nothing (deterministic id + on conflict).
begin;
with d as (
  select trim(p.person) as person, left(v.date, 10) as ymd, min(v.date) as first_date
  from public.visits v
  cross join lateral regexp_split_to_table(coalesce(v.visitor, ''), '\s*,\s*') as p(person)
  where trim(p.person) in ('אביאם', 'ניתאי')
    and coalesce(v.date, '') <> ''
    and coalesce(v.summary, '') !~ '^\[נמחק'
  group by 1, 2
)
insert into public.attendance (id, date, person, day_type, note, source)
select 'att_v_' || replace(d.ymd, '-', '') || '_' || d.person, d.first_date, d.person, 'field', '', 'visit_auto'
from d
where not exists (
  select 1 from public.attendance a where a.person = d.person and left(a.date, 10) = d.ymd
)
on conflict (id) do nothing;
commit;

-- Verify
-- 1. what was written:
-- select person, count(*) from public.attendance where source = 'visit_auto' group by 1;
-- 2. visit days of the filers that still have NO row (must be 0):
-- with d as (select trim(p.person) person, left(v.date,10) ymd from public.visits v
--   cross join lateral regexp_split_to_table(coalesce(v.visitor,''), '\s*,\s*') p(person)
--   where trim(p.person) in ('אביאם','ניתאי') and coalesce(v.date,'') <> '' group by 1,2)
-- select count(*) from d where not exists (select 1 from public.attendance a where a.person=d.person and left(a.date,10)=d.ymd);
-- 3. visit days where a manual row of ANOTHER type won (for עידן to review, not an error):
-- with d as (select trim(p.person) person, left(v.date,10) ymd from public.visits v
--   cross join lateral regexp_split_to_table(coalesce(v.visitor,''), '\s*,\s*') p(person)
--   where trim(p.person) in ('אביאם','ניתאי') and coalesce(v.date,'') <> '' group by 1,2)
-- select a.person, left(a.date,10) ymd, a.day_type from public.attendance a join d on a.person=d.person and left(a.date,10)=d.ymd
-- where a.source <> 'visit_auto' and a.day_type <> 'field' order by 2;

-- ROLLBACK
-- delete from public.attendance where source = 'visit_auto' and id like 'att_v_%';
