-- Field check-ins — "לאיזה קיבוץ הגעת?" (spec §5.1, Task 5).
--
-- One row per arrival. It is the ONLY thing that starts the two-hour clock: `visitCron` in
-- the `push-send` Edge Function reads rows that are old enough, not yet reminded, not
-- dismissed and have no `visits` row for (person, kibbutz, that day), and stamps
-- `reminded_at` so a row is nudged at most once (idempotent by row, the same shape the
-- attendance job uses).
create table if not exists public.field_checkins (
  id            uuid primary key default gen_random_uuid(),
  person        text not null,
  kibbutz       text not null,
  checked_in_at timestamptz not null default now(),
  -- null = nothing has been sent for this arrival yet. Set by push-send, never by the client.
  reminded_at   timestamptz,
  -- "🙈 לא היום" — he decided this one is not getting a summary today.
  dismissed     boolean not null default false,
  created_at    timestamptz default now()
);

-- The two lookups that exist: "my check-ins today" (the app) and "what is due" (the cron).
create index if not exists field_checkins_person_at
  on public.field_checkins (person, checked_in_at desc);
create index if not exists field_checkins_pending
  on public.field_checkins (checked_in_at) where reminded_at is null and dismissed = false;

alter table public.field_checkins enable row level security;

-- Same shape as visit_drafts / visits: the app has ONE shared `authenticated` pass minted
-- from the EMS gate, so RLS separates "signed in" from "not signed in", not person from
-- person. Reads are open (the "היום" strip and the gaps view both need them); writes need
-- the pass, which is what keeps the public anon key from inventing arrivals.
drop policy if exists field_checkins_read on public.field_checkins;
create policy field_checkins_read on public.field_checkins
  for select using (true);

drop policy if exists field_checkins_write on public.field_checkins;
create policy field_checkins_write on public.field_checkins
  for all to authenticated using (true) with check (true);

comment on table public.field_checkins is
  'Field arrivals (spec §5.1). Starts the 2 h visit-summary reminder; push-send mode visitCron stamps reminded_at.';

-- Verify:
--   select person, kibbutz, checked_in_at, reminded_at, dismissed
--     from public.field_checkins order by checked_in_at desc limit 20;
--   -- what the cron would look at right now:
--   select * from public.field_checkins
--    where reminded_at is null and not dismissed
--      and checked_in_at <= now() - interval '2 hours'
--      and checked_in_at >= now() - interval '14 hours';
