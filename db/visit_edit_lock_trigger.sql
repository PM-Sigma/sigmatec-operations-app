-- NOT APPLIED. עידן applies it in the Supabase SQL editor. Round 5, grill round 5 answers (binding for I, V, K):
-- "Edit lock for past data" — August 2026 or earlier is read-only everywhere; a September-onward record locks on
-- the 10th of the month after it (a September visit locks on 10.10). The app enforces this in
-- app/src/lib/editLock.ts (`editableUntil` / `isLocked`, same formula); this trigger enforces the SAME rule at the
-- database, so a stale client, a direct REST call or a bug in the app cannot edit or delete a locked visit.
--
-- Scope: `public.visits` only (package V's table). The ruling also names attendance, inventory, certificates and
-- orders; those tables get their own copy of this trigger from the packages that own them (I, K) — not duplicated
-- here to avoid two files racing to define the same function name differently.
--
-- Idempotent: `create or replace function`, `drop trigger if exists` + `create trigger`.
begin;

-- Mirrors app/src/lib/editLock.ts editableUntil(): the 10th of the month after `d`'s month.
create or replace function public.visit_editable_until(d date) returns date
language sql immutable as $$
  select (date_trunc('month', d) + interval '1 month' + interval '9 days')::date;
$$;

-- Mirrors app/src/lib/editLock.ts isLocked(): locked = at::date > editable_until(d) OR d < 2026-09-01.
create or replace function public.visit_edit_locked(d date, at timestamptz default now()) returns boolean
language sql stable as $$
  select d < date '2026-09-01' or (at at time zone 'Asia/Jerusalem')::date > public.visit_editable_until(d);
$$;

create or replace function public.enforce_visit_edit_lock() returns trigger
language plpgsql as $$
declare
  v_old_date date;
  v_new_date date;
  v_hint text := 'August 2026 and earlier, or a record past the 10th of the month after it, is read-only (round 5).';
begin
  -- nullif(...,'') first: an empty date string cast straight to `date` raises its own error
  -- (invalid input syntax), which would mask the real lock error with a confusing one.
  v_old_date := nullif(left(old.date, 10), '')::date;
  if tg_op = 'DELETE' then
    if v_old_date is not null and public.visit_edit_locked(v_old_date) then
      raise exception 'visit % is locked for editing: dated %, editable until %',
        old.id, v_old_date, public.visit_editable_until(v_old_date)
        using errcode = '22023', hint = v_hint;
    end if;
    return old;
  end if;

  v_new_date := nullif(left(new.date, 10), '')::date;
  -- INSERT/UPDATE: BOTH dates must be unlocked. Opus audit: checking only NEW.date (or
  -- coalesce(new.date, old.date), which resolves to NEW.date whenever it is present) let an
  -- August visit be smuggled into an open month just by changing its date field — the OLD date
  -- alone decided nothing was wrong with editing a permanently-locked record. Also blocks the
  -- opposite: backdating a currently-open visit into a locked month.
  if v_new_date is not null and public.visit_edit_locked(v_new_date) then
    raise exception 'visit % is locked for editing: dated %, editable until %',
      coalesce(new.id, old.id), v_new_date, public.visit_editable_until(v_new_date)
      using errcode = '22023', hint = v_hint;
  end if;
  if tg_op = 'UPDATE' and v_old_date is not null and public.visit_edit_locked(v_old_date) then
    raise exception 'visit % is locked for editing: dated %, editable until %',
      coalesce(new.id, old.id), v_old_date, public.visit_editable_until(v_old_date)
      using errcode = '22023', hint = v_hint;
  end if;
  return new;
end;
$$;

drop trigger if exists visit_edit_lock on public.visits;
create trigger visit_edit_lock
  before insert or update or delete on public.visits
  for each row execute function public.enforce_visit_edit_lock();

commit;

-- Verify
-- select public.visit_editable_until('2026-09-05');                          -- 2026-10-10
-- select public.visit_edit_locked('2026-08-31', '2026-09-01'::timestamptz);  -- true
-- select public.visit_edit_locked('2026-09-05', '2026-09-23'::timestamptz);  -- false
-- select public.visit_edit_locked('2026-09-05', '2026-10-11'::timestamptz); -- true
-- -- an attempted edit of a locked visit raises (expect an error, not a row):
-- -- update public.visits set summary = summary where date < '2026-08-01' limit 1;

-- ROLLBACK
-- drop trigger if exists visit_edit_lock on public.visits;
-- drop function if exists public.enforce_visit_edit_lock();
-- drop function if exists public.visit_edit_locked(date, timestamptz);
-- drop function if exists public.visit_editable_until(date);
