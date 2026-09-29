-- staff_devices.sql — Q7-C (7.1): which staff device runs the app installed, and whether it
-- may show notifications. Feeds the "מצב הצוות" list in the gear sheet (עידן only).
--
-- STATUS: WRITTEN, NOT APPLIED. Production side effect: waits for עידן's explicit "כן".
-- Until it is applied the client silently skips the write, and the list shows
-- "לא פעיל עדיין" in the "installed" column (notifications still work: they are read from
-- push_subscriptions, which already exists).
--
-- BACKUP FIRST: this only ADDS a table + a function, nothing existing is touched, so there is
-- no data to back up. (If a table named staff_devices already exists, stop and look at it.)
--
-- One row per (person, device). The client upserts its own row when the app runs, at most
-- once a day or when its state changes (app/src/lib/devicePresence.ts). PII-light by design:
-- a random per-install device id, a coarse label ("Android · Chrome"), two booleans-ish
-- facts and a timestamp. No endpoint, no keys, no user-agent string.
--
-- RLS, same shape and same stated limitation as usage_events: the app has ONE shared
-- `authenticated` pass, so Postgres cannot tell עידן from anyone else. The reader below is
-- therefore defence in depth (it refuses any actor but עידן), not authentication.
--   • INSERT / UPDATE — authenticated (the upsert needs both).
--   • SELECT / DELETE — no policy, privileges revoked. Reading goes through the function.

create table if not exists public.staff_devices (
  person           text        not null,
  device_id        text        not null,
  label            text,
  is_standalone    boolean     not null default false,   -- display-mode: standalone seen
  notif_permission text,                                  -- 'granted' | 'denied' | 'default' | 'unsupported'
  last_seen        timestamptz not null default now(),
  primary key (person, device_id)
);

alter table public.staff_devices enable row level security;

drop policy if exists staff_devices_insert on public.staff_devices;
create policy staff_devices_insert on public.staff_devices
  for insert to authenticated with check ((auth.jwt() ->> 'name') = person and coalesce(auth.jwt() ->> 'viewer','false') <> 'true');
drop policy if exists staff_devices_update on public.staff_devices;
create policy staff_devices_update on public.staff_devices
  for update to authenticated using ((auth.jwt() ->> 'name') = person and coalesce(auth.jwt() ->> 'viewer','false') <> 'true') with check ((auth.jwt() ->> 'name') = person and coalesce(auth.jwt() ->> 'viewer','false') <> 'true');

-- upsert's ON CONFLICT path needs SELECT on the own row (RLS): own rows only; the report fn reads all.
revoke all on public.staff_devices from anon;
revoke delete on public.staff_devices from authenticated;
grant select, insert, update on public.staff_devices to authenticated;
drop policy if exists staff_devices_select_own on public.staff_devices;
create policy staff_devices_select_own on public.staff_devices
  for select to authenticated using ((auth.jwt() ->> 'name') = person and coalesce(auth.jwt() ->> 'viewer','false') <> 'true');

-- The ONE way to read: SECURITY DEFINER, refuses everyone but עידן (and requires him to be in
-- app_admins, the same double gate usage_report() uses).
create or replace function public.staff_devices_report(p_actor text)
returns setof public.staff_devices
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  -- identity from the trusted JWT claim (minted by ems-auth), never from the client argument
  if (auth.jwt() ->> 'name') is distinct from 'עידן'
     or coalesce(auth.jwt() ->> 'viewer','false') = 'true' then
    raise exception 'staff_devices_report: % may not read device status', coalesce(p_actor, '(null)')
      using errcode = '42501';
  end if;
  return query select * from staff_devices order by person, last_seen desc;
end $$;

revoke all on function public.staff_devices_report(text) from public, anon;
grant execute on function public.staff_devices_report(text) to authenticated;

-- Verify after applying (as authenticated): select * from staff_devices_report('עידן');
-- and a direct `select * from staff_devices` must fail with "permission denied".

-- ROLLBACK
-- drop function if exists public.staff_devices_report(text);
-- drop table if exists public.staff_devices;
