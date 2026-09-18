-- 🕎 company_holidays — Israeli public holidays + company closures (spec §7e, Task 12).
--
-- WHAT IT DECIDES: whether a date is a REQUIRED attendance day. A row with `required=false`
-- is skipped by every missing-days path — the island's grid and chips
-- (app/src/lib/attendance.ts), the legacy report (js/src/22-push.js attMissingDays), and the
-- server's nudges (push-send: priorMissing + the evening gate). Entering attendance on such
-- a day is still allowed and still counted as a work day; the report marks it 🕎.
--
-- `required=true` on a holiday row means "we work that day after all" — the day behaves like
-- any other weekday, and the calendar still labels it so nobody is surprised. חול המועד פסח
-- is seeded that way until עמיחי decides (db/holidays_seed.mjs).
--
-- Seed rows: db/company_holidays_seed.sql (generated — run `node db/holidays_seed.mjs`).
create table if not exists public.company_holidays (
  date        date primary key,
  name        text not null,
  kind        text not null check (kind in ('holiday', 'chol_hamoed', 'company_closure')),
  -- false = attendance is optional that day, and the day is never "missing".
  required    boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- The only lookup there is: "the holidays in this month / this range", always by date order.
create index if not exists company_holidays_date on public.company_holidays (date);

alter table public.company_holidays enable row level security;

-- Read: everyone who opened the app. The grid, the chips and the calendar's violet dots all
-- need it, including the viewer, and a calendar of public holidays is not a secret.
drop policy if exists company_holidays_read on public.company_holidays;
create policy company_holidays_read on public.company_holidays
  for select using (true);

-- Write: the authenticated pass the EMS session mints — the same shape user_settings and
-- field_checkins use. WHO within that pass is enforced in the app (עידן/עמיחי only, via
-- canManageStaff → the ⋯ עוד row + the Holidays panel): the app has no auth users, so the
-- pass cannot tell one signed-in person from another. What RLS guarantees here is that the
-- PUBLIC anon key can never declare a company closure.
drop policy if exists company_holidays_write on public.company_holidays;
create policy company_holidays_write on public.company_holidays
  for all to authenticated using (true) with check (true);

comment on table public.company_holidays is
  'Israeli holidays + company closures (spec §7e). required=false → the day is not counted as missing attendance.';

-- Verify:
--   select date, name, kind, required from public.company_holidays
--    where date between '2026-09-01' and '2026-10-31' order by date;
--   -- the days that do NOT require attendance next month:
--   select date, name from public.company_holidays where not required and date >= current_date order by date;
