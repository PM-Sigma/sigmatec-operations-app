-- ems_task_lifecycle.sql — per-task lifecycle state + append-only events (H5).
--
-- STATUS: WRITTEN, NOT APPLIED. Production side effect: waits for עידן's answers (spec section 10) and
-- an audit. Spec: docs/superpowers/specs/2026-09-29-ems-task-lifecycle-design.md
--
-- BACKUP before applying: this file only ADDS two new tables and one function; it changes no existing
-- table. Still, per the working method, run the backup_export edge function (or a dump of ems_cache and
-- ems_queue) first so the pre-state is on record.
-- ROLLBACK (drops only what this file created; loses only lifecycle data collected after applying):
--   drop function if exists public.ems_apply_snapshot(jsonb, timestamptz, boolean);
--   drop table if exists public.ems_task_events;
--   drop table if exists public.ems_task_state;
-- Verify after applying: as a non-עידן/עמיחי staff pass and as the viewer pass, select from both tables
-- returns zero rows; direct insert/update/delete is refused for everyone; calling ems_apply_snapshot twice
-- with the same payload leaves the event count unchanged.

create table if not exists public.ems_task_state (
  task_id          text primary key,
  site_id          text,
  site_name        text,
  type             text,
  priority         text,
  status           text,
  assignee_id      text,
  assignee_name    text,
  due_date         date,
  opened_at        timestamptz,
  opened_src       text not null default 'unknown',   -- ems | backfill | unknown
  last_updated_at  timestamptz,
  closed_at        timestamptz,
  closed_src       text,                              -- ems | derived | backfill
  first_seen_at    timestamptz not null,
  assigned_at      timestamptz,
  assigned_src     text not null default 'unknown',   -- ems | derived | unknown
  last_seen_at     timestamptz not null,
  gone_at          timestamptz
);
create index if not exists ems_task_state_site_idx   on public.ems_task_state (site_name);
create index if not exists ems_task_state_opened_idx on public.ems_task_state (opened_at);

create table if not exists public.ems_task_events (
  id        bigint generated always as identity primary key,
  task_id   text not null,
  kind      text not null check (kind in ('opened','first_seen','assigned','reassigned','unassigned',
                                          'due_set','due_changed','status_changed','closed','reopened','disappeared')),
  at        timestamptz not null,
  prev      text,
  next      text,
  src       text not null default 'derived',           -- ems | derived | backfill
  sync_key  text not null,
  unique (task_id, kind, sync_key)
);
create index if not exists ems_task_events_task_idx on public.ems_task_events (task_id, at);

alter table public.ems_task_state  enable row level security;
alter table public.ems_task_events enable row level security;

-- Read: the trusted `name` claim (minted by ems-auth from staff_identities), never a viewer session.
drop policy if exists ems_task_state_read on public.ems_task_state;
create policy ems_task_state_read on public.ems_task_state for select to authenticated
  using ((auth.jwt() ->> 'name') in ('עידן','עמיחי') and coalesce(auth.jwt() ->> 'viewer','false') is distinct from 'true');
drop policy if exists ems_task_events_read on public.ems_task_events;
create policy ems_task_events_read on public.ems_task_events for select to authenticated
  using ((auth.jwt() ->> 'name') in ('עידן','עמיחי') and coalesce(auth.jwt() ->> 'viewer','false') is distinct from 'true');
-- No insert/update/delete policies: clients cannot write; only the SECURITY DEFINER function below does.

-- The differ. p_tasks: array of {id,status,site:{id,name},type,priority,assignee:{id,firstName,lastName},
-- expectedCompletionDate,createdAt?,updatedAt?}. p_full: true only when the crawl reached its total.
-- DRAFT: intended shape; finalise together with the TS mirror + golden tests before applying.
create or replace function public.ems_apply_snapshot(p_tasks jsonb, p_at timestamptz default now(), p_full boolean default false)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t jsonb; s public.ems_task_state; n integer := 0;
  v_status text; v_asg text; v_name text; v_due date; v_opened timestamptz; v_upd timestamptz;
  v_closed text[] := array['done','rejected','not_relevant','cancelled'];
begin
  if coalesce(auth.jwt() ->> 'viewer','false') = 'true' then raise exception 'viewer session may not write'; end if;
  for t in select * from jsonb_array_elements(coalesce(p_tasks,'[]'::jsonb)) loop
    if coalesce(t->>'id','') = '' then continue; end if;
    v_status := t->>'status';
    v_asg    := nullif(t #>> '{assignee,id}','');
    v_name   := nullif(trim(coalesce(t #>> '{assignee,firstName}','')||' '||coalesce(t #>> '{assignee,lastName}','')),'');
    v_due    := nullif(left(coalesce(t->>'expectedCompletionDate',''),10),'')::date;
    v_opened := nullif(t->>'createdAt','')::timestamptz;
    v_upd    := nullif(t->>'updatedAt','')::timestamptz;
    select * into s from public.ems_task_state where task_id = t->>'id' for update;
    if not found then
      insert into public.ems_task_state(task_id,site_id,site_name,type,priority,status,assignee_id,assignee_name,due_date,
        opened_at,opened_src,last_updated_at,first_seen_at,assigned_at,assigned_src,last_seen_at,closed_at,closed_src)
      values (t->>'id', t #>> '{site,id}', t #>> '{site,name}', t->>'type', t->>'priority', v_status, v_asg, v_name, v_due,
        v_opened, case when v_opened is null then 'unknown' else 'ems' end, v_upd, p_at,
        case when v_asg is not null then p_at end, case when v_asg is not null then 'derived' else 'unknown' end, p_at,
        case when v_status = any(v_closed) then coalesce(v_upd,p_at) end,
        case when v_status = any(v_closed) then case when v_upd is null then 'derived' else 'ems' end end);
      insert into public.ems_task_events(task_id,kind,at,next,src,sync_key)
        values (t->>'id','first_seen',p_at,v_status,'derived',md5(t->>'id'||'first_seen')) on conflict do nothing;
      n := n + 1;
      continue;
    end if;
    if s.status is distinct from v_status then
      insert into public.ems_task_events(task_id,kind,at,prev,next,src,sync_key)
        values (s.task_id, case when v_status = any(v_closed) then 'closed'
                                when s.status = any(v_closed) then 'reopened' else 'status_changed' end,
                p_at, s.status, v_status, 'derived', md5(s.task_id||coalesce(v_status,'')||p_at::text)) on conflict do nothing;
      n := n + 1;
    end if;
    if s.assignee_id is distinct from v_asg then
      insert into public.ems_task_events(task_id,kind,at,prev,next,src,sync_key)
        values (s.task_id, case when v_asg is null then 'unassigned' when s.assignee_id is null then 'assigned' else 'reassigned' end,
                p_at, s.assignee_id, v_asg, 'derived', md5(s.task_id||'asg'||coalesce(v_asg,'')||p_at::text)) on conflict do nothing;
      n := n + 1;
    end if;
    if s.due_date is distinct from v_due then
      insert into public.ems_task_events(task_id,kind,at,prev,next,src,sync_key)
        values (s.task_id, case when s.due_date is null then 'due_set' else 'due_changed' end,
                p_at, s.due_date::text, v_due::text, 'derived', md5(s.task_id||'due'||coalesce(v_due::text,'')||p_at::text)) on conflict do nothing;
      n := n + 1;
    end if;
    update public.ems_task_state set
      status = v_status, assignee_id = v_asg, assignee_name = v_name, due_date = v_due,
      site_id = t #>> '{site,id}', site_name = t #>> '{site,name}', type = t->>'type', priority = t->>'priority',
      opened_at = coalesce(opened_at, v_opened),
      opened_src = case when opened_at is null and v_opened is not null then 'ems' else opened_src end,
      last_updated_at = coalesce(v_upd, last_updated_at),
      assigned_at = case when v_asg is not null and (assigned_at is null or s.assignee_id is distinct from v_asg) then p_at else assigned_at end,
      assigned_src = case when v_asg is not null and (assigned_at is null or s.assignee_id is distinct from v_asg) then 'derived' else assigned_src end,
      closed_at = case when v_status = any(v_closed) then coalesce(closed_at, v_upd, p_at)
                       when s.status = any(v_closed) then null else closed_at end,
      closed_src = case when v_status = any(v_closed) then coalesce(closed_src, case when v_upd is null then 'derived' else 'ems' end)
                        when s.status = any(v_closed) then null else closed_src end,
      last_seen_at = p_at, gone_at = null
    where task_id = s.task_id;
  end loop;
  if p_full then
    -- open tasks absent from a FULL crawl: closed-or-deleted in EMS; the job resolves the final status by id.
    insert into public.ems_task_events(task_id,kind,at,prev,src,sync_key)
      select task_id,'disappeared',p_at,status,'derived',md5(task_id||'gone') from public.ems_task_state
      where gone_at is null and last_seen_at < p_at and status <> all(v_closed)
      on conflict do nothing;
    update public.ems_task_state set gone_at = p_at
      where gone_at is null and last_seen_at < p_at and status <> all(v_closed);
  end if;
  return n;
end $$;
revoke all on function public.ems_apply_snapshot(jsonb, timestamptz, boolean) from public;
grant execute on function public.ems_apply_snapshot(jsonb, timestamptz, boolean) to authenticated;
