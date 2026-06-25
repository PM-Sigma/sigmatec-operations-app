-- dev_status_log — forward-tracking of when each dev ticket first entered each Projects-v2 status.
-- GitHub doesn't expose per-status entry dates, so the פיתוח page records the FIRST day it sees a
-- ticket in a given status (one row per issue+status). Feeds the tiny gray day-stamps + future stats.
-- Day granularity only. Run once in the Supabase SQL editor.

create table if not exists public.dev_status_log (
  issue   integer not null,
  status  text    not null,
  day     date    not null default current_date,
  primary key (issue, status)
);

alter table public.dev_status_log enable row level security;

-- Read: allowed (anon ok) — just status dates, not sensitive. Idempotent re-run: drop then create.
drop policy if exists dev_status_log_read on public.dev_status_log;
create policy dev_status_log_read on public.dev_status_log
  for select using (true);

-- Insert: the app writes via the authenticated EMS→Supabase bridge, once per (issue,status)
-- using `on conflict (issue,status) do nothing` so the first-seen day is never overwritten.
drop policy if exists dev_status_log_insert on public.dev_status_log;
create policy dev_status_log_insert on public.dev_status_log
  for insert to authenticated with check (true);
