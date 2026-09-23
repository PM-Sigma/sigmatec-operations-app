-- backup_export.sql — lets the backup-export edge function read backup.snapshots without exposing
-- the `backup` schema itself over the API.
--
-- Why: `backup` isn't in the API's exposed-schema list (by design — it's an internal ledger written
-- by the nightly backup.take_snapshot() cron), so PostgREST can't reach it directly. This function is
-- the one narrow door: SECURITY DEFINER so it can read `backup` regardless of who calls it, but EXECUTE
-- is granted only to service_role, so only the edge function (which holds the service-role key) can
-- call it — anon/authenticated get nothing, by grant, not by convention.
--
-- Returns: {"taken_on": "YYYY-MM-DD", "tables": {"<tbl>": [...rows], ...}} for the given date, built
-- straight from backup.snapshots.rows (already jsonb per row). p_date NULL -> the latest taken_on
-- in the table. Unknown/empty date (or an empty table) -> {}.
create or replace function public.backup_export(p_date date default null)
returns jsonb
language sql
security definer
set search_path = 'public', 'backup'
as $$
  with d as (
    select coalesce(p_date, (select max(taken_on) from backup.snapshots)) as taken_on
  )
  select case when count(*) = 0 then '{}'::jsonb
    else jsonb_build_object(
      'taken_on', (select taken_on from d),
      'tables', jsonb_object_agg(tbl, rows)
    )
  end
  from backup.snapshots, d
  where snapshots.taken_on = d.taken_on;
$$;

revoke all on function public.backup_export(date) from public;
revoke all on function public.backup_export(date) from anon;
revoke all on function public.backup_export(date) from authenticated;
grant execute on function public.backup_export(date) to service_role;

-- Verify after applying:
--   select public.backup_export(current_date);              -- as service_role: returns data
--   (as anon/authenticated, e.g. via the REST RPC endpoint)  -- expect a permission-denied error
