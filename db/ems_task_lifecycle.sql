-- ems_task_lifecycle.sql — per-task lifecycle state + append-only events (H5).
--
-- STATUS: FINAL DRAFT, NOT APPLIED. MAIN applies it (after a backup and an audit).
-- Spec: docs/superpowers/specs/2026-09-29-ems-task-lifecycle-design.md (decisions in section 11).
-- Model + golden tests of the diff logic: app/src/lib/emsLifecycleDiff.ts (+ .test.ts) and
-- test-ems-lifecycle-sql.mjs (structure of THIS file). Keep all three in step.
--
-- BACKUP before applying: this file only ADDS two tables, three functions and one backfill call; it
-- changes no existing table. Still, run the backup_export edge function (or a dump of ems_cache and
-- ems_queue) first so the pre-state is on record.
-- ROLLBACK (drops only what this file created; loses only lifecycle data collected after applying):
--   drop function if exists public.ems_apply_snapshot(jsonb, boolean);
--   drop function if exists public.ems_apply_snapshot_core(jsonb, timestamptz, boolean, text);
--   drop function if exists public._ems_ts(text);
--   drop function if exists public._ems_d(text);
--   drop table if exists public.ems_task_events;
--   drop table if exists public.ems_task_state;
-- Verify after applying: as a staff member other than עידן/עמיחי, and as the viewer, a select from
-- both tables returns zero rows; direct insert/update/delete is refused for everyone; anon calling
-- ems_apply_snapshot is refused; calling it twice with the same payload leaves the event count
-- unchanged.
--
-- Definitions (עידן 29.9):
--   assigned (שובצה)  = the task has BOTH an assignee AND a due date (expectedCompletionDate);
--                        assigned_at = the first sync where both are set.
--   closed statuses   = done, rejected, not_relevant, cancelled (EMS_CLOSED). The on-time close %
--                        statistic counts only done + cancelled (see the page); the rest still get closed_at.
--   assigned_src      = 'pending' (not yet assigned) | 'derived' (observed becoming assigned, 30-min
--                        precision) | 'unknown' (already assigned the first time we saw it: true time not
--                        recoverable, excluded from time-to-assign).
--   closed_src        = 'ems' (updatedAt of a task seen closed) | 'derived' (first sync that saw it closed)
--                        | 'disappeared' (left a full open crawl; final status unknown) | 'backfill'.
--   Events are kept forever. No titles or descriptions are stored.

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
  opened_src       text not null default 'unknown',   -- ems | unknown
  last_updated_at  timestamptz,
  closed_at        timestamptz,
  closed_src       text,                              -- ems | derived | disappeared | backfill
  first_seen_at    timestamptz not null,
  assigned_at      timestamptz,
  assigned_src     text not null default 'pending',   -- pending | derived | unknown
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
-- No insert/update/delete policies: clients cannot write; only the SECURITY DEFINER functions below do.
revoke all on public.ems_task_state, public.ems_task_events from anon, authenticated;
grant select on public.ems_task_state, public.ems_task_events to authenticated;

-- Tolerant parsers: a malformed value from the client becomes NULL, never an exception that would
-- abort the whole snapshot.
create or replace function public._ems_ts(x text) returns timestamptz
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
begin return nullif(x,'')::timestamptz; exception when others then return null; end $$;
create or replace function public._ems_d(x text) returns date
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
begin return nullif(left(coalesce(x,''),10),'')::date; exception when others then return null; end $$;
revoke all on function public._ems_ts(text), public._ems_d(text) from public, anon, authenticated;

-- The differ. p_tasks: array of {id,status,site:{id,name},type,priority,assignee:{id,firstName,lastName},
-- expectedCompletionDate,createdAt?,updatedAt?}. p_full: true only when the crawl reached its total.
-- NOT callable by clients (no grant) — the checked wrapper below is the entry point. Idempotent:
-- everything is a diff against ems_task_state, so replaying a snapshot changes nothing.
create or replace function public.ems_apply_snapshot_core(p_tasks jsonb, p_at timestamptz, p_full boolean, p_src text default 'derived')
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t jsonb; s public.ems_task_state; n integer := 0; v_ins integer; v_gone integer;
  v_id text; v_status text; v_asg text; v_name text; v_due date; v_opened timestamptz; v_upd timestamptz;
  v_both boolean; v_fresh boolean; v_becomes_assigned boolean;
  v_closed text[] := array['done','rejected','not_relevant','cancelled'];
  v_src text := case when p_src in ('derived','backfill') then p_src else 'derived' end;
begin
  for t in select * from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(t) <> 'object' then continue; end if;
    v_id := t->>'id';
    if coalesce(v_id,'') = '' or length(v_id) > 64 then continue; end if;
    v_status := left(t->>'status', 40);
    v_asg    := left(nullif(t #>> '{assignee,id}',''), 64);
    v_name   := left(nullif(trim(coalesce(t #>> '{assignee,firstName}','')||' '||coalesce(t #>> '{assignee,lastName}','')),''), 120);
    v_due    := public._ems_d(t->>'expectedCompletionDate');
    v_opened := public._ems_ts(t->>'createdAt');
    v_upd    := public._ems_ts(t->>'updatedAt');
    v_both   := v_asg is not null and v_due is not null;
    -- already-assigned-when-first-seen is only trustworthy as "assigned now" for a brand-new task
    v_fresh  := v_opened is not null and v_opened > p_at - interval '1 hour';

    insert into public.ems_task_state(task_id,site_id,site_name,type,priority,status,assignee_id,assignee_name,due_date,
        opened_at,opened_src,last_updated_at,first_seen_at,assigned_at,assigned_src,last_seen_at,closed_at,closed_src)
      values (v_id, left(t #>> '{site,id}',64), left(t #>> '{site,name}',120), left(t->>'type',60), left(t->>'priority',40),
        v_status, v_asg, v_name, v_due,
        v_opened, case when v_opened is null then 'unknown' else 'ems' end, v_upd, p_at,
        case when v_both and v_fresh then p_at end,
        case when not v_both then 'pending' when v_fresh then 'derived' else 'unknown' end,
        p_at,
        case when v_status = any(v_closed) then coalesce(v_upd,p_at) end,
        case when v_status = any(v_closed) then case when v_src = 'backfill' then 'backfill' when v_upd is null then 'derived' else 'ems' end end)
      on conflict (task_id) do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then
      insert into public.ems_task_events(task_id,kind,at,next,src,sync_key)
        values (v_id,'first_seen',p_at,v_status,v_src,md5(v_id||'first_seen')) on conflict do nothing;
      if v_opened is not null then
        insert into public.ems_task_events(task_id,kind,at,next,src,sync_key)
          values (v_id,'opened',v_opened,v_status,'ems',md5(v_id||'opened')) on conflict do nothing;
      end if;
      if v_status = any(v_closed) then
        insert into public.ems_task_events(task_id,kind,at,next,src,sync_key)
          values (v_id,'closed',coalesce(v_upd,p_at),v_status,case when v_src = 'backfill' then 'backfill' else 'derived' end,md5(v_id||'closed_first')) on conflict do nothing;
      end if;
      n := n + 1;
      continue;
    end if;

    -- existing task: lock the row so a concurrent second caller diffs against our result
    select * into s from public.ems_task_state where task_id = v_id for update;
    if s.status is distinct from v_status then
      insert into public.ems_task_events(task_id,kind,at,prev,next,src,sync_key)
        values (s.task_id, case when v_status = any(v_closed) then 'closed'
                                when s.status = any(v_closed) then 'reopened' else 'status_changed' end,
                p_at, s.status, v_status, v_src, md5(s.task_id||'st'||coalesce(v_status,'')||p_at::text)) on conflict do nothing;
      n := n + 1;
    end if;
    -- assignee changes (raw field): null->X is only an event once the task counts as assigned (below)
    if s.assignee_id is distinct from v_asg and (v_asg is null or s.assignee_id is not null) then
      insert into public.ems_task_events(task_id,kind,at,prev,next,src,sync_key)
        values (s.task_id, case when v_asg is null then 'unassigned' else 'reassigned' end,
                p_at, s.assignee_id, v_asg, v_src, md5(s.task_id||'asg'||coalesce(v_asg,'')||p_at::text)) on conflict do nothing;
      n := n + 1;
    end if;
    if s.due_date is distinct from v_due then
      insert into public.ems_task_events(task_id,kind,at,prev,next,src,sync_key)
        values (s.task_id, case when s.due_date is null then 'due_set' else 'due_changed' end,
                p_at, s.due_date::text, v_due::text, v_src, md5(s.task_id||'due'||coalesce(v_due::text,'')||p_at::text)) on conflict do nothing;
      n := n + 1;
    end if;
    -- שובצה: the first sync where assignee AND due date are both set
    v_becomes_assigned := s.assigned_src = 'pending' and v_both;
    if v_becomes_assigned then
      insert into public.ems_task_events(task_id,kind,at,prev,next,src,sync_key)
        values (s.task_id,'assigned',p_at,null,v_asg,v_src,md5(s.task_id||'assigned')) on conflict do nothing;
      n := n + 1;
    end if;
    update public.ems_task_state set
      status = v_status, assignee_id = v_asg, assignee_name = v_name, due_date = v_due,
      site_id = left(t #>> '{site,id}',64), site_name = left(t #>> '{site,name}',120),
      type = left(t->>'type',60), priority = left(t->>'priority',40),
      opened_at = coalesce(s.opened_at, v_opened),
      opened_src = case when s.opened_at is null and v_opened is not null then 'ems' else s.opened_src end,
      last_updated_at = coalesce(v_upd, s.last_updated_at),
      assigned_at  = case when v_becomes_assigned then p_at else s.assigned_at end,
      assigned_src = case when v_becomes_assigned then 'derived' else s.assigned_src end,
      -- closed: stamp once (a 'disappeared' stamp is upgraded to the real one); reopened or
      -- reappeared in a full open crawl: clear it
      closed_at = case when v_status = any(v_closed) then
                         (case when s.closed_at is null or s.closed_src = 'disappeared' then coalesce(v_upd,p_at) else s.closed_at end)
                       when s.status = any(v_closed) or s.closed_src = 'disappeared' then null
                       else s.closed_at end,
      closed_src = case when v_status = any(v_closed) then
                          (case when s.closed_at is null or s.closed_src = 'disappeared'
                                then (case when v_src = 'backfill' then 'backfill' when v_upd is null then 'derived' else 'ems' end)
                                else s.closed_src end)
                        when s.status = any(v_closed) or s.closed_src = 'disappeared' then null
                        else s.closed_src end,
      last_seen_at = p_at, gone_at = null
    where task_id = s.task_id;
  end loop;

  if p_full then
    -- open tasks absent from a FULL crawl: closed or deleted in EMS (final status unknown).
    with g as (
      update public.ems_task_state
         set gone_at = p_at, closed_at = p_at, closed_src = 'disappeared'
       where gone_at is null and last_seen_at < p_at and status <> all(v_closed)
       returning task_id, status)
    insert into public.ems_task_events(task_id,kind,at,prev,src,sync_key)
      select task_id,'disappeared',p_at,status,v_src,md5(task_id||'gone'||p_at::text) from g
      on conflict do nothing;
    get diagnostics v_gone = row_count;
    n := n + v_gone;
  end if;
  return n;
end $$;
revoke all on function public.ems_apply_snapshot_core(jsonb, timestamptz, boolean, text) from public, anon, authenticated;

-- The client entry point. Any signed-in STAFF browser may call it after a sync; never anon, never the
-- viewer. The timestamp is the server's (a client cannot back-date events). Validates the input shape.
create or replace function public.ems_apply_snapshot(p_tasks jsonb, p_full boolean default false)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'authenticated' or coalesce(auth.jwt() ->> 'name','') = '' then
    raise exception 'staff session required' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'viewer','false') = 'true' then
    raise exception 'viewer session may not write' using errcode = '42501';
  end if;
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then
    raise exception 'p_tasks must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tasks) > 5000 then
    raise exception 'snapshot too large' using errcode = '22023';
  end if;
  -- an empty "full" crawl would mark every open task as gone: never accepted
  if coalesce(p_full,false) and jsonb_array_length(p_tasks) = 0 then
    raise exception 'a full snapshot cannot be empty' using errcode = '22023';
  end if;
  return public.ems_apply_snapshot_core(p_tasks, now(), coalesce(p_full,false), 'derived');
end $$;
revoke all on function public.ems_apply_snapshot(jsonb, boolean) from public, anon;
grant execute on function public.ems_apply_snapshot(jsonb, boolean) to authenticated;

-- BACKFILL (one-off, safe to re-run: it is a diff). Seeds state from the CURRENT shared cache (open
-- tasks only; the cache holds no createdAt until EMS_CACHE_VER 3 reaches it, so opened_at fills in on
-- the next sync). Closed history and real historical assigned_at are NOT recoverable from here: they
-- need the closed-status crawl (spec section 5), a separate office-PC script after the probe confirms
-- what EMS exposes. Old tasks stay assigned_src='unknown' and are excluded from time-to-assign.
do $$
begin
  if to_regclass('public.ems_cache') is not null then
    perform public.ems_apply_snapshot_core(c.tasks, now(), false, 'backfill')
      from public.ems_cache c where c.id = 1 and jsonb_typeof(c.tasks) = 'array';
  end if;
end $$;
