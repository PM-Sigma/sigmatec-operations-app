-- NOT APPLIED. עידן applies it in the Supabase SQL editor, AFTER db/visit_edit_lock_trigger.sql.
-- Per-person, per-month unlock of the round-5 visit edit lock (עידן 11.10): the 4.10-7.10 visit-overwrite bug
-- (fixed in 2.153) erased reports dated September, which locked on 10.10; the people who wrote them need to
-- rewrite them. An unlock row lets the visit's visitor edit visits of that month until `until`, then the
-- ordinary lock is back by itself. Mirrored on the client by visitUnlockActive (js/src/00-consts.js) and
-- app/src/lib/visitEdit.ts (visitEditLocked's `unlocks` argument).
--
-- BACKUP (before applying): the current definition of the function this file replaces —
--   select pg_get_functiondef('public.enforce_visit_edit_lock()'::regprocedure);
-- save the output; it is also db/visit_edit_lock_trigger.sql as committed.
--
-- Idempotent: create table if not exists, create or replace, drop policy if exists.
begin;

create table if not exists public.visit_edit_unlocks (
  person     text not null,                 -- roster name, the same string as visits.visitor / the JWT `name` claim
  month      date not null check (month = date_trunc('month', month)::date),   -- first of the month
  until      timestamptz not null,
  reason     text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (person, month)
);

alter table public.visit_edit_unlocks enable row level security;

-- Read: a signed-in staff member sees only his own unlocks. The person is the trusted `name` claim minted by
-- ems-auth from staff_identities (same mapping as db/ems_task_lifecycle.sql), never a viewer session.
drop policy if exists visit_edit_unlocks_read_own on public.visit_edit_unlocks;
create policy visit_edit_unlocks_read_own on public.visit_edit_unlocks for select to authenticated
  using (person = (auth.jwt() ->> 'name') and coalesce(auth.jwt() ->> 'viewer', 'false') is distinct from 'true');
-- No insert/update/delete policies: only service_role (the SQL editor) writes.
revoke all on public.visit_edit_unlocks from anon, authenticated;
grant select on public.visit_edit_unlocks to authenticated;

-- Is a visit by `visitor` (one name or a ', '-joined list) dated `d` unlocked at `at`?
-- SECURITY DEFINER: the trigger must see every unlock, not only the caller's own row (RLS).
create or replace function public.visit_edit_unlocked(visitor text, d date, at timestamptz default now())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.visit_edit_unlocks u
    where u.month = date_trunc('month', d)::date
      and u.until > at
      and u.person = any (select btrim(x) from unnest(string_to_array(coalesce(visitor, ''), ',')) x)
  );
$$;
revoke all on function public.visit_edit_unlocked(text, date, timestamptz) from anon;

-- The lock trigger, unchanged except: a locked date is allowed when the row's visitor holds an unexpired
-- unlock for that date's month (NEW.visitor for the new date, OLD.visitor for the old date).
create or replace function public.enforce_visit_edit_lock() returns trigger
language plpgsql as $$
declare
  v_old_date date;
  v_new_date date;
  v_hint text := 'August 2026 and earlier, or a record past the 10th of the month after it, is read-only (round 5).';
begin
  if tg_op = 'UPDATE' and public.visit_inventory_delete_override(old, new) then
    return new;
  end if;

  v_old_date := nullif(left(old.date, 10), '')::date;
  if tg_op = 'DELETE' then
    if v_old_date is not null and public.visit_edit_locked(v_old_date)
       and not public.visit_edit_unlocked(old.visitor, v_old_date) then
      raise exception 'visit % is locked for editing: dated %, editable until %',
        old.id, v_old_date, public.visit_editable_until(v_old_date)
        using errcode = '22023', hint = v_hint;
    end if;
    return old;
  end if;

  v_new_date := nullif(left(new.date, 10), '')::date;
  if v_new_date is not null and public.visit_edit_locked(v_new_date)
     and not public.visit_edit_unlocked(new.visitor, v_new_date) then
    raise exception 'visit % is locked for editing: dated %, editable until %',
      coalesce(new.id, old.id), v_new_date, public.visit_editable_until(v_new_date)
      using errcode = '22023', hint = v_hint;
  end if;
  if tg_op = 'UPDATE' and v_old_date is not null and public.visit_edit_locked(v_old_date)
     and not public.visit_edit_unlocked(old.visitor, v_old_date) then
    raise exception 'visit % is locked for editing: dated %, editable until %',
      coalesce(new.id, old.id), v_old_date, public.visit_editable_until(v_old_date)
      using errcode = '22023', hint = v_hint;
  end if;
  return new;
end;
$$;

commit;

-- SEED (separate statement, run on its own after the commit above):
-- insert into public.visit_edit_unlocks (person, month, until, reason, created_by)
-- values ('אביאם', '2026-09-01', timestamptz '2026-10-25 23:59 Asia/Jerusalem', 'שחזור דוחות שנדרסו (באג 4–7.10)', 'עידן')
-- on conflict (person, month) do update set until = excluded.until, reason = excluded.reason, created_by = excluded.created_by;

-- Verify
-- select public.visit_edit_unlocked('אביאם', '2026-09-22', '2026-10-12'::timestamptz);           -- true (after the seed)
-- select public.visit_edit_unlocked('אביאם', '2026-09-22', '2026-10-26'::timestamptz);           -- false (expired)
-- select public.visit_edit_unlocked('ניתאי', '2026-09-22', '2026-10-12'::timestamptz);           -- false (not his)
-- select public.visit_edit_unlocked('אביאם, ניתאי', '2026-09-22', '2026-10-12'::timestamptz);    -- true (joint visit)
-- select public.visit_edit_unlocked('אביאם', '2026-08-20', '2026-10-12'::timestamptz);           -- false (other month)

-- ROLLBACK: restore the saved BACKUP definition (or re-run db/visit_edit_lock_trigger.sql), then:
-- drop function if exists public.visit_edit_unlocked(text, date, timestamptz);
-- drop table if exists public.visit_edit_unlocks;
