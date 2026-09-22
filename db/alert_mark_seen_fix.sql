-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  🔔 alert_mark_seen — the fix. Apply AFTER db/rls_2_00_lockdown.sql.          ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
-- Round 3, Package Q: "עידן marked the alerts read five times and they still show".
--
-- WHY THEY CAME BACK
-- The RPC created in rls_2_00_lockdown.sql could never run to completion:
--   1. `update … set seen_at = now()` — `inventory_alerts` (db/inventory_pool.sql) has NO
--      `seen_at` column. plpgsql raises 42703 the first time the statement is executed.
--   2. `where id = p_id` — `id` is `uuid`, `p_id` is a plpgsql `text` VARIABLE, and Postgres
--      has no implicit uuid = text cast for a variable (only for an unknown literal), so the
--      same statement also fails to plan with 42883.
-- The bell marks a group seen optimistically and then calls this RPC per row; the call threw,
-- the client swallowed it, and the next refetch (focus, realtime, reload) brought back rows
-- whose `seen_by` had never been written. Nothing was ever marked read on the server.
--
-- This file: gives the table the `seen_at` column the RPC always meant to touch, and
-- re-creates the function with the cast. Idempotent, safe to re-run.

begin;

alter table public.inventory_alerts add column if not exists seen_at timestamptz;

create or replace function public.alert_mark_seen(p_id text, p_person text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_person is null or btrim(p_person) = '' then
    raise exception 'alert_mark_seen: p_person is required';
  end if;
  update public.inventory_alerts
     set seen_at = now(),
         seen_by = (
           select array_agg(distinct x)
           from unnest(coalesce(seen_by, array[]::text[]) || array[btrim(p_person)]) as x
         )
   where id = p_id::uuid;
end;
$$;

revoke all on function public.alert_mark_seen(text, text) from public;
grant execute on function public.alert_mark_seen(text, text) to authenticated;
comment on function public.alert_mark_seen is
  'The only client write to inventory_alerts: touches seen_at/seen_by and nothing else '
  '(audit C #3). The table has no client UPDATE or DELETE policy. Fixed 22.9 (round 3 Q): '
  'seen_at now exists and p_id is cast to uuid.';

commit;
