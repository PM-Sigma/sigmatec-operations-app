-- work_sessions — Task 29 (spec §6 + the §8b Clockify ruling): the hours עידן and מתניה
-- record from a kibbutz card with ▶ / ■.
--
-- The row is the SOURCE OF TRUTH for hours, and Clockify is the mirror — not the other way
-- round. That is why `clockify_id` is NULLABLE: when the Clockify API blinks the stop sheet
-- still writes the row (with `clockify_id = null`) and the entry is pushed on a later quiet
-- retry. Hours are never lost because a third-party API was down.
--
-- Apply with the other db/*.sql migrations (Supabase SQL editor / CLI).

create table if not exists work_sessions (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  kibbutz text,
  task_ref text,
  kind text,
  attendees text[] not null default '{}',
  tags text[] not null default '{}',
  description text,
  started_at timestamptz not null,
  ended_at timestamptz,
  billable boolean not null default false,
  clockify_id text,
  note text,
  created_at timestamptz default now()
);

alter table work_sessions enable row level security;

-- Read: any authenticated employee (the hours report is a team view).
drop policy if exists ws_read on work_sessions;
create policy ws_read on work_sessions for select to authenticated using (true);

-- Write: own rows only. The app writes `person` from the signed-in name, and the EMS pass
-- carries that name in its `name` claim, so a person cannot file hours under someone else.
drop policy if exists ws_insert on work_sessions;
create policy ws_insert on work_sessions for insert to authenticated
  with check (person = coalesce(auth.jwt() ->> 'name', person));

drop policy if exists ws_update on work_sessions;
create policy ws_update on work_sessions for update to authenticated
  using (person = coalesce(auth.jwt() ->> 'name', person))
  with check (person = coalesce(auth.jwt() ->> 'name', person));

create index if not exists work_sessions_person_started on work_sessions (person, started_at desc);
create index if not exists work_sessions_kibbutz on work_sessions (kibbutz);
-- The quiet retry looks for exactly this: finished rows that never reached Clockify.
create index if not exists work_sessions_pending_sync on work_sessions (ended_at)
  where clockify_id is null;
