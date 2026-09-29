-- calendar_absences: add kinds 'sick' + 'other' (QA 4.4). Applied by MAIN — not applied by the worker.
-- BACKUP FIRST:  create table public.calendar_absences_bak_r9 as select * from public.calendar_absences;
-- Only אביאם/ניתאי ever reach attendance (apply_absence already skips everyone else); sick/other file
-- for them as day_type 'other'. Everyone else stays calendar-only.
begin;
alter table public.calendar_absences drop constraint if exists calendar_absences_kind_check;
alter table public.calendar_absences add constraint calendar_absences_kind_check
  check (kind in ('vacation', 'sick', 'other', 'reserve', 'event'));

create or replace function public.apply_absence(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a        public.calendar_absences%rowtype;
  v_person text;
  v_day    date;
  v_type   text;
  v_made   integer := 0;
begin
  -- Every row this absence generated, whatever the range used to be.
  delete from public.attendance where source = 'calendar' and id like 'abs_' || p_id::text || '\_%';

  select * into a from public.calendar_absences where id = p_id;
  if not found then return 0; end if;                     -- deleted → the rows are gone, done
  if a.kind = 'event' then return 0; end if;              -- 🎉 marks a day; it does not file one

  v_type := case when a.kind = 'reserve' then 'reserve' when a.kind = 'vacation' then 'vacation' else 'other' end;

  for v_person in
    select unnest(case when a.person is null then array['אביאם', 'ניתאי'] else array[a.person] end)
  loop
    if v_person not in ('אביאם', 'ניתאי') then continue; end if;

    for v_day in select generate_series(a.start_date, a.end_date, interval '1 day')::date loop
      -- Friday (5) + Saturday (6) — `extract(dow)` is 0=Sunday.
      continue when extract(dow from v_day) in (5, 6);
      continue when exists (
        select 1 from public.company_holidays h where h.date = v_day and not h.required
      );
      -- A row he typed himself wins; one an earlier run of some OTHER absence generated
      -- wins too (first range in keeps the day — they overlap, so the day is excused either way).
      continue when exists (
        select 1 from public.attendance att
         where att.person = v_person
           and left(att.date, 10) = to_char(v_day, 'YYYY-MM-DD')
      );

      insert into public.attendance (id, date, person, day_type, note, source)
      values (
        'abs_' || p_id::text || '_' || v_person || '_' || to_char(v_day, 'YYYYMMDD'),
        to_char(v_day, 'YYYY-MM-DD') || 'T12:00:00.000Z',
        v_person,
        v_type,
        coalesce(nullif(a.note, ''), case a.kind when 'reserve' then 'מילואים' when 'sick' then 'מחלה' when 'other' then 'היעדרות' else 'חופשה' end),
        'calendar'
      )
      on conflict (id) do nothing;
      v_made := v_made + 1;
    end loop;
  end loop;

  return v_made;
end;
$$;

commit;

-- ROLLBACK (only if no 'sick'/'other' rows exist, else delete them first):
--   begin;
--   delete from public.calendar_absences where kind in ('sick','other');
--   alter table public.calendar_absences drop constraint calendar_absences_kind_check;
--   alter table public.calendar_absences add constraint calendar_absences_kind_check check (kind in ('vacation','reserve','event'));
--   -- then re-run the apply_absence definition from db/calendar_absences.sql
--   commit;
