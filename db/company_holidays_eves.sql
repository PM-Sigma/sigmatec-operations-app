-- 🕯️ ערבי חג — the days BEFORE the holiday (round 2, Package F item 5).
--
-- An ערב חג is the opposite of a חג: people work, most of them from home, and the day is
-- still REQUIRED — the report is what says who was where. So the rows below carry
-- `required = true` (unlike every row in db/company_holidays_seed.sql) and a new kind,
-- 'holiday_eve', which is what the attendance screen and the calendar mark with ערב חג and
-- what makes the day sheet offer 🏠 מהבית as its default (app/src/lib/attendance.ts:
-- EVE_DEFAULT_TYPE, EVE_COUNTDOWN_MS).
--
-- NOT APPLIED YET — עידן applies it after the round-2 merge. Apply AFTER db/company_holidays.sql
-- and db/company_holidays_seed.sql; the check constraint has to be widened first, which is
-- what the first statement does.
--
-- Dates: the civil day before each חג in the seed (Israel), civil years 2026–2027. An eve
-- that falls on a Friday or a Saturday is left OUT on purpose — it is not a work day anyway,
-- and a row there would say nothing while making the grid noisier.

alter table public.company_holidays drop constraint if exists company_holidays_kind_check;
alter table public.company_holidays add constraint company_holidays_kind_check
  check (kind in ('holiday', 'chol_hamoed', 'company_closure', 'holiday_eve'));

insert into public.company_holidays (date, name, kind, required, created_by) values
  ('2026-04-01', 'ערב פסח',        'holiday_eve', true, 'eves'),   -- Wed
  ('2026-04-07', 'ערב שביעי של פסח', 'holiday_eve', true, 'eves'), -- Tue
  ('2026-05-21', 'ערב שבועות',     'holiday_eve', true, 'eves'),   -- Thu
  ('2026-09-20', 'ערב יום כיפור',   'holiday_eve', true, 'eves'),   -- Sun
  ('2027-04-21', 'ערב פסח',        'holiday_eve', true, 'eves'),   -- Wed
  ('2027-04-27', 'ערב שביעי של פסח', 'holiday_eve', true, 'eves'), -- Tue
  ('2027-06-10', 'ערב שבועות',     'holiday_eve', true, 'eves'),   -- Thu
  ('2027-10-10', 'ערב יום כיפור',   'holiday_eve', true, 'eves')    -- Sun
on conflict (date) do update
  set name = excluded.name, kind = excluded.kind, required = excluded.required;

-- Verify:
--   select date, name, kind, required from public.company_holidays
--    where kind = 'holiday_eve' order by date;
--   -- an eve is a REQUIRED day; the חג right after it is not:
--   select date, name, required from public.company_holidays
--    where date between '2026-09-20' and '2026-09-26' order by date;
