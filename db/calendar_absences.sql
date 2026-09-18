-- 🌴🪖🎉 calendar_absences — vacation / reserve / company event ranges (spec §7f, Task 13).
--
-- WHY THIS IS A TABLE AND NOT JUST A CALENDAR CHIP: for אביאם and ניתאי a 🌴 or 🪖 range has
-- to FILE ATTENDANCE, or the missing-days logic, the evening nudge and the monthly report
-- all keep asking a man on reserve duty to explain his week. `apply_absence(id)` below is
-- what turns a range into those rows — and, just as importantly, what removes the ones a
-- shortened range no longer covers.
--
-- A 🎉 company event files nothing. It marks the day, and when it is company-wide and nobody
-- ticked "נדרשת נוכחות" it also lands in `company_holidays` as a `company_closure` — that is
-- the table the whole app already asks "was anyone expected today?" (§7e, R8 merges the two
-- admin surfaces into this one ➕).

create extension if not exists "pgcrypto";

create table if not exists public.calendar_absences (
  id          uuid primary key default gen_random_uuid(),
  -- null = the whole company.
  person      text,
  kind        text not null check (kind in ('vacation', 'reserve', 'event')),
  start_date  date not null,
  end_date    date not null,
  note        text default '',
  -- Only meaningful for a company-wide 'event': true = "we work that day anyway", so no
  -- company_holidays row is written and nobody's attendance is excused.
  required    boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendar_absences_range check (end_date >= start_date)
);

-- The calendar always asks by RANGE ("what overlaps this month?"), never by id.
create index if not exists calendar_absences_range_idx on public.calendar_absences (start_date, end_date);
create index if not exists calendar_absences_person on public.calendar_absences (person);

alter table public.calendar_absences enable row level security;

-- Read: everyone. The spec is explicit — absences "are visible to everyone"; a calendar that
-- hides who is away is a calendar nobody can plan a route with.
drop policy if exists calendar_absences_read on public.calendar_absences;
create policy calendar_absences_read on public.calendar_absences
  for select using (true);

-- Write: the authenticated EMS pass only. WHO may file for WHOM (עידן/עמיחי for anyone, a
-- technician for himself, the viewer never) is enforced in the app — the pass is shared, so
-- RLS cannot tell two signed-in people apart. What it guarantees is that the public anon key
-- can never declare somebody on vacation.
drop policy if exists calendar_absences_write on public.calendar_absences;
create policy calendar_absences_write on public.calendar_absences
  for all to authenticated using (true) with check (true);

comment on table public.calendar_absences is
  'Vacation / reserve / company-event ranges (spec §7f). apply_absence(id) generates the attendance rows.';

-- ── the attendance rows a range generates ────────────────────────────────────────
-- `source` distinguishes a row THIS function wrote from one a person typed. Only
-- source='calendar' rows are ever deleted or rewritten here: A MANUAL ROW ALWAYS WINS.
alter table public.attendance add column if not exists source text not null default 'manual';
create index if not exists attendance_person_date on public.attendance (person, date);

comment on column public.attendance.source is
  'manual = someone typed it (never touched by apply_absence) · visit = derived from a visit · calendar = generated from calendar_absences.';

/*
 * apply_absence(id) — make the attendance rows match the range, and nothing more.
 *
 * Idempotent by construction: it DELETES this absence's generated rows first and writes the
 * current range's rows second, so editing a range from 5 days to 2 removes the three that
 * no longer apply, and re-running it changes nothing. Deleting the absence row cascades
 * through the trigger below, which calls this with the range already gone → all rows removed.
 *
 * What it skips, deliberately:
 *   • Friday + Saturday — not work days, so there is nothing to excuse.
 *   • a company_holidays day with required=false — already not required; a generated row
 *     there would turn a holiday into a counted vacation day in the monthly report.
 *   • any day the person already has a row for that this function did NOT write (source
 *     <> 'calendar'). He typed it; he meant it.
 *   • kind='event' — an event marks a day, it does not file one.
 *   • anyone other than אביאם / ניתאי — nobody else files attendance at all.
 *
 * `date` is stored as TEXT (an ISO timestamp at midday) because that is the shape the Apps
 * Script writer, the reports and js/src/04-attendance-daily.js have always used; midday is
 * what stops a timezone from moving a row to the previous day.
 */
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

  v_type := case when a.kind = 'reserve' then 'reserve' else 'vacation' end;

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
        coalesce(nullif(a.note, ''), case when a.kind = 'reserve' then 'מילואים' else 'חופש' end),
        'calendar'
      )
      on conflict (id) do nothing;
      v_made := v_made + 1;
    end loop;
  end loop;

  return v_made;
end;
$$;

comment on function public.apply_absence(uuid) is
  'Regenerate the attendance rows for one calendar_absences range (spec §7f). Idempotent; manual rows always win.';

-- The app never has to remember to call it: every insert, edit and delete re-applies.
create or replace function public.calendar_absences_apply_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.apply_absence(old.id);                 -- the row is gone → all its rows go
    return old;
  end if;
  -- An UPDATE that shrank the range re-runs with the NEW one; the delete-first step inside
  -- apply_absence is what removes the days that fell outside it.
  new.updated_at := now();
  perform public.apply_absence(new.id);
  return new;
end;
$$;

drop trigger if exists calendar_absences_apply on public.calendar_absences;
create trigger calendar_absences_apply
  after insert or update or delete on public.calendar_absences
  for each row execute function public.calendar_absences_apply_trg();

-- `after` triggers cannot set NEW, so the updated_at stamp needs its own `before` pass.
create or replace function public.calendar_absences_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists calendar_absences_touch_trg on public.calendar_absences;
create trigger calendar_absences_touch_trg
  before update on public.calendar_absences
  for each row execute function public.calendar_absences_touch();

grant execute on function public.apply_absence(uuid) to authenticated;

-- Verify (run after applying):
--   insert into public.calendar_absences (person, kind, start_date, end_date, note)
--        values ('ניתאי', 'vacation', '2026-09-10', '2026-09-14', 'חופש') returning id;
--   -- 11.9 Fri + 12.9 Sat are skipped, 13.9 ראש השנה is skipped → 2 rows (10.9, 14.9):
--   select date, day_type, source from public.attendance
--    where person = 'ניתאי' and source = 'calendar' order by date;
--   -- shrink the range → the rows outside it disappear:
--   update public.calendar_absences set end_date = '2026-09-10' where person = 'ניתאי';
--   delete from public.calendar_absences where person = 'ניתאי';   -- → no generated rows left
