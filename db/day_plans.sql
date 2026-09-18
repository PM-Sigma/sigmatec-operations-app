-- 🗺️ day_plans — "מסלול היום": the order one person drives his day in (spec §7f, Task 13).
--
-- WHAT IT DECIDES: the order the calendar's day panel lists the day's kibbutz groups in, and
-- the order the ARRIVAL SHEET (spec §5.1, app/src/lib/field.ts `arrivalOrder`) offers
-- kibbutzim in — the day plan comes FIRST there, ahead of the heuristic. Those two screens
-- disagreeing is exactly what this table exists to prevent.
--
-- The headers (🌅 תחילת יום · ➡️ בהמשך · 🌇 אחרון להיום · 📥 לא משובץ) are NOT stored: they are
-- derived from position by app/src/lib/calendar.ts `routeWithHeaders`. Storing them would
-- let a reorder leave a stale "אחרון להיום" in the middle of the list.
--
-- `stops` shape: [{ "kibbutz": "יגור", "task_ids": ["…"] }, …] — the order IS the array order.
-- The task ids are a snapshot of what was due there when he arranged the day; they are a
-- convenience for the arrival sheet, never the source of truth for what a task's date is
-- (EMS owns that).
create table if not exists public.day_plans (
  person      text not null,
  date        date not null,
  stops       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (person, date)
);

-- The only two lookups: "my plan for today" (the pk covers it) and "everyone's plan for a
-- day" — עמיחי's unified calendar and the day panel both ask for that one.
create index if not exists day_plans_date on public.day_plans (date);

alter table public.day_plans enable row level security;

-- Read: everyone who opened the app. עמיחי sees the whole company's day, a field worker sees
-- his own route, and the viewer sees the calendar read-only — one policy covers all three,
-- because a route between kibbutzim is not a secret from anyone inside the company.
drop policy if exists day_plans_read on public.day_plans;
create policy day_plans_read on public.day_plans
  for select using (true);

-- Write: only the authenticated pass the EMS session mints — the same shape
-- company_holidays / field_checkins / user_settings use. WHO within that pass is enforced in
-- the app (a technician reorders his own day; the viewer has no reorder at all): the app has
-- no auth users, so the pass cannot tell one signed-in person from another. What RLS
-- guarantees here is that the PUBLIC anon key can never rewrite somebody's day.
drop policy if exists day_plans_write on public.day_plans;
create policy day_plans_write on public.day_plans
  for all to authenticated using (true) with check (true);

comment on table public.day_plans is
  'Route order per (person, date) — spec §7f. stops = [{kibbutz, task_ids[]}], order = array order.';

-- Verify:
--   select person, date, jsonb_array_length(stops) as stops, updated_at
--     from public.day_plans where date = current_date order by person;
