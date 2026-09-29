-- fix_role_audit_29_9.sql — closes the findings of docs/reports/2026-09-29-role-audit.md (live DB probe, 29.9).
--
-- STATUS: WRITTEN, NOT APPLIED. Production change: MAIN applies it after עידן approves.
--   npx supabase db query --linked --project-ref wwqfcajnxinaxmobrgol -f db/fix_role_audit_29_9.sql
-- It was dry-run inside a rolled-back transaction against the live DB (syntax + the probe matrix re-run: every
-- finding flipped to DENY, nothing else changed).
--
-- BACKUP: this file changes grants, policies and 3 function bodies, and no row data. The previous function bodies
-- and the previous policy are in the ROLLBACK block at the bottom (copy-paste to restore). The three *_bak tables it
-- locks down are themselves backups; their rows are untouched.
--
-- Findings covered (ids as in the report):
--   F1 HIGH   the 3 backup tables (RLS off) are readable AND writable by anon and every signed-in user
--   F2 HIGH   inventory_push_low_stock() is executable by anon (anyone with the public key can fire a staff push)
--   F3 MED    push_log is readable by anon and by the viewer (recipients, order refs)
--   F4 MED    alert_mark_seen() is executable by anon and the viewer
--   F5 MED    usage_report() / feedback_admin_update() trust a client-supplied "actor" name, so ANY signed-in
--             session (viewer included) passes the admin check by sending 'עידן'
--   F6 LOW    apply_absence() (trigger helper) is executable by anon and the viewer
--   F7 LOW    any staff member can DELETE a kibbutzim row or a products row directly (the app never does:
--             kibbutzim are archived, products are removed through the עידן-only inventory_delete_product RPC)
begin;

-- ── F1 ──────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.internal_tasks_bak_test_29_9           enable row level security;
alter table public.kibbutzim_region_section_bak_29_9      enable row level security;
alter table public.calendar_absences_bak_r9               enable row level security;
revoke all on public.internal_tasks_bak_test_29_9      from anon, authenticated;
revoke all on public.kibbutzim_region_section_bak_29_9 from anon, authenticated;
revoke all on public.calendar_absences_bak_r9          from anon, authenticated;

-- ── F2 + F6: functions only the database itself (triggers) calls ─────────────────────────────────────────
-- Trigger functions run as their owner, so revoking client execute does not affect them.
revoke execute on function public.inventory_push_low_stock(text, numeric) from public, anon, authenticated;
revoke execute on function public.apply_absence(uuid)                      from public, anon, authenticated;

-- ── F3: the התראות page is עידן's alone (canShowPage('pushlog')); push-send writes/reads with service_role ──
drop policy if exists push_log_read on public.push_log;
create policy push_log_read on public.push_log for select to authenticated
  using ((auth.jwt() ->> 'name') = 'עידן' and coalesce(auth.jwt() ->> 'viewer', 'false') <> 'true');

-- ── F4: staff only ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.alert_mark_seen(p_id text, p_person text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' or coalesce(auth.jwt() ->> 'name', '') = '' then
    raise exception 'staff session required' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'viewer', 'false') = 'true' then
    raise exception 'viewer session may not write' using errcode = '42501';
  end if;
  if p_person is null or btrim(p_person) = '' then
    raise exception 'alert_mark_seen: p_person is required';
  end if;
  update public.inventory_alerts
     set seen_at = now(),
         seen_by = (select array_agg(distinct x) from unnest(coalesce(seen_by, array[]::text[]) || array[btrim(p_person)]) as x)
   where id = p_id::uuid;
end; $$;
revoke execute on function public.alert_mark_seen(text, text) from public, anon;
grant  execute on function public.alert_mark_seen(text, text) to authenticated;

-- ── F5: identity from the trusted JWT claim (as staff_devices_report already does), never the argument ──
create or replace function public.usage_report(p_days integer, p_actor text)
returns setof usage_events language plpgsql stable security definer set search_path to 'public' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 120);
begin
  if (auth.jwt() ->> 'name') is distinct from 'עידן'
     or coalesce(auth.jwt() ->> 'viewer', 'false') = 'true'
     or not exists (select 1 from app_admins where name = 'עידן') then
    raise exception 'usage_report: not allowed' using errcode = '42501';
  end if;
  return query
    select * from usage_events
     where at >= now() - make_interval(days => d)
     order by at asc
     limit 200000;
end $$;

create or replace function public.feedback_admin_update(p_id uuid, p_actor text, p_status text default null, p_github_issue integer default null)
returns feedback language plpgsql security definer set search_path to 'public' as $$
declare r feedback;
begin
  if coalesce(auth.jwt() ->> 'viewer', 'false') = 'true'
     or not exists (select 1 from app_admins where name = (auth.jwt() ->> 'name')) then
    raise exception 'feedback_admin_update: not an admin' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('new','seen','done') then
    raise exception 'feedback_admin_update: bad status %', p_status using errcode = '22023';
  end if;
  update feedback
     set status       = coalesce(p_status, status),
         github_issue = coalesce(p_github_issue, github_issue)
   where id = p_id
  returning * into r;
  if r.id is null then
    raise exception 'feedback_admin_update: no such feedback %', p_id using errcode = 'P0002';
  end if;
  return r;
end $$;

-- ── F7 ────────────────────────────────────────────────────────────────────────────────────────────────────
-- inventory_delete_product is SECURITY DEFINER (owner rights), so it keeps working. Manual clean-up in the
-- SQL editor runs as postgres and is unaffected.
revoke delete on public.kibbutzim from authenticated;
revoke delete on public.products  from authenticated;

commit;

-- ══ OPTIONAL HARDENING (not part of the findings; decide separately, each can break a working path) ══
-- 1. anon holds full table privileges on every public table and is stopped only by RLS. A defence-in-depth revoke
--    (keep usage_events/feedback only if the pre-login flow needs them, and the cert_by_id RPC stays for ?cert= links):
--      revoke all on all tables in schema public from anon;
-- 2. push_subscriptions: every staff member and the viewer can read all rows (endpoint + push keys) and delete
--    others'. The app only needs own rows, except "מצב הצוות" (עידן) which reads every owner:
--      drop policy push_subs_read on public.push_subscriptions;
--      create policy push_subs_read on public.push_subscriptions for select to authenticated
--        using (owner = (auth.jwt() ->> 'name') or (auth.jwt() ->> 'name') = 'עידן');

-- ══ ROLLBACK ═══════════════════════════════════════════════════════════════════════════════════════════════
-- begin;
-- grant all on public.internal_tasks_bak_test_29_9, public.kibbutzim_region_section_bak_29_9, public.calendar_absences_bak_r9 to anon, authenticated;
-- alter table public.internal_tasks_bak_test_29_9      disable row level security;
-- alter table public.kibbutzim_region_section_bak_29_9 disable row level security;
-- alter table public.calendar_absences_bak_r9          disable row level security;
-- grant execute on function public.inventory_push_low_stock(text, numeric) to public, anon, authenticated;
-- grant execute on function public.apply_absence(uuid) to public, anon, authenticated;
-- grant execute on function public.alert_mark_seen(text, text) to public, anon, authenticated;
-- drop policy if exists push_log_read on public.push_log;
-- create policy push_log_read on public.push_log for select to anon, authenticated using (true);
-- grant delete on public.kibbutzim, public.products to authenticated;
-- create or replace function public.alert_mark_seen(p_id text, p_person text) returns void language plpgsql security definer set search_path to 'public' as $$
-- begin
--   if p_person is null or btrim(p_person) = '' then raise exception 'alert_mark_seen: p_person is required'; end if;
--   update public.inventory_alerts set seen_at = now(),
--     seen_by = (select array_agg(distinct x) from unnest(coalesce(seen_by, array[]::text[]) || array[btrim(p_person)]) as x)
--    where id = p_id::uuid;
-- end; $$;
-- create or replace function public.usage_report(p_days integer, p_actor text) returns setof usage_events language plpgsql stable security definer set search_path to 'public' as $$
-- declare d int := least(greatest(coalesce(p_days, 30), 1), 120);
-- begin
--   if p_actor is distinct from 'עידן' or not exists (select 1 from app_admins where name = p_actor) then
--     raise exception 'usage_report: % may not read usage analytics', coalesce(p_actor, '(null)') using errcode = '42501';
--   end if;
--   return query select * from usage_events where at >= now() - make_interval(days => d) order by at asc limit 200000;
-- end $$;
-- create or replace function public.feedback_admin_update(p_id uuid, p_actor text, p_status text default null, p_github_issue integer default null) returns feedback language plpgsql security definer set search_path to 'public' as $$
-- declare r feedback;
-- begin
--   if not exists (select 1 from app_admins where name = p_actor) then
--     raise exception 'feedback_admin_update: % is not an admin', coalesce(p_actor, '(null)') using errcode = '42501';
--   end if;
--   if p_status is not null and p_status not in ('new','seen','done') then raise exception 'feedback_admin_update: bad status %', p_status using errcode = '22023'; end if;
--   update feedback set status = coalesce(p_status, status), github_issue = coalesce(p_github_issue, github_issue) where id = p_id returning * into r;
--   if r.id is null then raise exception 'feedback_admin_update: no such feedback %', p_id using errcode = 'P0002'; end if;
--   return r;
-- end $$;
-- commit;
