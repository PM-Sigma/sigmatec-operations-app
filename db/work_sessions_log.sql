-- ⏱ work_sessions — the hours page (עידן 22.9, E2): עידן and עמיחי may edit and add rows for
-- anyone, and EVERY change is logged. Additive and idempotent; apply after db/work_sessions.sql.

-- 1. Who may change other people's rows. The own-row policies from work_sessions.sql stay.
drop policy if exists ws_admin_update on work_sessions;
create policy ws_admin_update on work_sessions for update to authenticated
  using (coalesce(auth.jwt() ->> 'name', '') in ('עידן', 'עמיחי'))
  with check (coalesce(auth.jwt() ->> 'name', '') in ('עידן', 'עמיחי'));

drop policy if exists ws_admin_insert on work_sessions;
create policy ws_admin_insert on work_sessions for insert to authenticated
  with check (coalesce(auth.jwt() ->> 'name', '') in ('עידן', 'עמיחי'));

drop policy if exists ws_admin_delete on work_sessions;
create policy ws_admin_delete on work_sessions for delete to authenticated
  using (coalesce(auth.jwt() ->> 'name', '') in ('עידן', 'עמיחי'));

-- 2. The log: one row per insert/update/delete, with who did it and the before/after.
create table if not exists work_sessions_log (
  id bigserial primary key,
  session_id uuid,
  action text not null,                      -- insert | update | delete
  changed_by text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
alter table work_sessions_log enable row level security;
drop policy if exists wsl_read on work_sessions_log;
create policy wsl_read on work_sessions_log for select to authenticated using (true);
-- nobody writes the log directly; the trigger runs as the table owner
create index if not exists work_sessions_log_session on work_sessions_log (session_id, at desc);

create or replace function work_sessions_log_fn() returns trigger
language plpgsql security definer as $$
begin
  insert into work_sessions_log (session_id, action, changed_by, before, after)
  values (
    coalesce(new.id, old.id),
    lower(tg_op),
    coalesce(auth.jwt() ->> 'name', current_user),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists work_sessions_log_trg on work_sessions;
create trigger work_sessions_log_trg
  after insert or update or delete on work_sessions
  for each row execute function work_sessions_log_fn();
