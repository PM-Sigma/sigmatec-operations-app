-- ems_task_lifecycle_cron.sql — narrow service_role entry to the task lifecycle for the office-PC job (H5).
--
-- STATUS: DRAFT, NOT APPLIED. MAIN applies it, after db/ems_task_lifecycle.sql is live (it calls
-- ems_apply_snapshot_core). Changes no table; adds one function.
-- ROLLBACK:
--   drop function if exists public.ems_apply_snapshot_cron(jsonb, boolean);
-- Verify after applying: anon and an authenticated staff session calling it are refused (permission
-- denied); service_role with a tiny array and p_full=false returns an integer; calling twice with the
-- same payload leaves the event count unchanged.

create or replace function public.ems_apply_snapshot_cron(p_tasks jsonb, p_full boolean default false)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
begin
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
  -- same guard as the staff wrapper: refuse a "full" snapshot that shrinks the open set by more than half
  if coalesce(p_full,false) and jsonb_array_length(p_tasks) * 2 <
       (select count(*) from public.ems_task_state where gone_at is null and status <> all(array['done','rejected','not_relevant','cancelled'])) then
    raise exception 'full snapshot much smaller than the open set' using errcode = '22023';
  end if;
  return public.ems_apply_snapshot_core(p_tasks, now(), coalesce(p_full,false), 'derived');
end $$;
revoke all on function public.ems_apply_snapshot_cron(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.ems_apply_snapshot_cron(jsonb, boolean) to service_role;
