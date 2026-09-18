-- ══════════════════════════════════════════════════════════════════════════════
-- `import_meeting_notes(jsonb)` — the ONE transactional write behind 📥 ייבוא סיכום ישיבה
-- (app/src/islands/ImportNotes.tsx).
--
-- WHY A FUNCTION. The first cut did DELETE that (date, kind) + INSERT the fresh parse, from
-- the client, as two PostgREST calls. Two bugs in one:
--   1. it WIPED `ems_task_id` and `done_at`. Re-importing a corrected summary silently
--      unlinked every task that had been opened from a bullet and forgot every ✓.
--   2. it was not atomic. A failure between the two calls left the kibbutz with no bullets
--      at all, and a reader in between saw the same hole.
-- One plpgsql function = one statement = one transaction, and the merge keeps the human work.
--
-- MERGE RULES
--   · match on the table's unique key (kibbutz, meeting_date, meeting_kind, seq)
--   · upsert `text` + `owners`; `ems_task_id` / `done_at` are NOT in the update list, so they
--     survive a re-import untouched
--   · text changed while a link existed → the link is KEPT (the task is real and someone is
--     working it) and `text_changed_at` is stamped, so the card can flag that the wording
--     moved on after the task was opened
--   · delete only the rows of that (date, kind) whose (kibbutz, seq) the new parse no longer
--     has — a shorter re-import drops the tail, a dropped kibbutz loses that meeting's rows,
--     and nothing outside that (date, kind) is ever touched
--
-- SECURITY INVOKER (the default): RLS still applies, so an anon caller is refused exactly as
-- a direct insert would be, and the island maps that to "יש להתחבר ל-EMS כדי לשמור".
--
-- PAYLOAD
--   {"meeting_date":"2026-09-17","meeting_kind":"company","created_by":"עידן",
--    "rows":[{"kibbutz":"גבים","seq":1,"text":"…","owners":["אביאם","עידן"]}, …]}
-- RETURNS {"inserted":n,"updated":n,"deleted":n,"flagged":n}
-- ══════════════════════════════════════════════════════════════════════════════

-- The flag column (idempotent — this file is re-runnable).
alter table kibbutz_meeting_notes add column if not exists text_changed_at timestamptz;

create or replace function import_meeting_notes(p jsonb)
returns jsonb
language plpgsql
as $func$
declare
  v_date date := (p->>'meeting_date')::date;
  v_kind text := coalesce(nullif(p->>'meeting_kind', ''), 'company');
  v_by   text := nullif(p->>'created_by', '');
  v_ins  int := 0;
  v_upd  int := 0;
  v_del  int := 0;
  v_flag int := 0;
begin
  if v_date is null then
    raise exception 'import_meeting_notes: meeting_date is required';
  end if;

  -- (1) FLAG first — it has to compare against the OLD text, before the upsert rewrites it.
  with inc as (
    select r->>'kibbutz' as kibbutz, (r->>'seq')::int as seq, r->>'text' as text
      from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) r
  ), f as (
    update kibbutz_meeting_notes n
       set text_changed_at = now()
      from inc i
     where n.meeting_date = v_date
       and n.meeting_kind = v_kind
       and n.kibbutz = i.kibbutz
       and n.seq = i.seq
       and n.text <> i.text
       and n.ems_task_id is not null
    returning 1
  ) select count(*) into v_flag from f;

  -- (2) UPSERT. `xmax = 0` on the RETURNING row distinguishes a fresh insert from an update.
  with inc as (
    select r->>'kibbutz' as kibbutz,
           (r->>'seq')::int as seq,
           r->>'text' as text,
           coalesce(
             array(select jsonb_array_elements_text(coalesce(r->'owners', '[]'::jsonb))),
             '{}'::text[]
           ) as owners
      from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) r
  ), u as (
    insert into kibbutz_meeting_notes (kibbutz, meeting_date, meeting_kind, seq, text, owners, created_by)
    select i.kibbutz, v_date, v_kind, i.seq, i.text, i.owners, v_by from inc i
        on conflict (kibbutz, meeting_date, meeting_kind, seq) do update
       set text = excluded.text, owners = excluded.owners
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_ins, v_upd
    from u;

  -- (3) DELETE what the new parse dropped.
  with inc as (
    select r->>'kibbutz' as kibbutz, (r->>'seq')::int as seq
      from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) r
  ), d as (
    delete from kibbutz_meeting_notes n
     where n.meeting_date = v_date
       and n.meeting_kind = v_kind
       and not exists (select 1 from inc i where i.kibbutz = n.kibbutz and i.seq = n.seq)
    returning 1
  ) select count(*) into v_del from d;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'deleted', v_del, 'flagged', v_flag);
end;
$func$;

-- Writers only. An anon caller would be stopped by RLS inside the function anyway; refusing
-- the call outright says the same thing one step earlier.
revoke all on function import_meeting_notes(jsonb) from public;
grant execute on function import_meeting_notes(jsonb) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — the merge rules, as a re-runnable script. The behaviour lives in SQL, so a
-- vitest cannot reach it; run this against the project (MCP execute_sql or psql) after any
-- change to the function. It cleans up after itself and touches only kibbutz '__test__'.
--
-- Expected (verified 18.9.26):
--   first  import → {"inserted":3,"updated":0,"deleted":0,"flagged":0}
--   second import → {"inserted":1,"updated":2,"deleted":1,"flagged":1}
--   final rows    → seq 1 keeps task-A, owners updated,   not flagged
--                   seq 2 keeps task-B AND done_at, text updated, FLAGGED
--                   seq 3 deleted (dropped from the parse)
--                   seq 4 inserted
-- ══════════════════════════════════════════════════════════════════════════════
-- delete from kibbutz_meeting_notes where kibbutz = '__test__';
--
-- select import_meeting_notes('{"meeting_date":"2020-01-01","meeting_kind":"company","created_by":"t","rows":[
--   {"kibbutz":"__test__","seq":1,"text":"one","owners":["עידן"]},
--   {"kibbutz":"__test__","seq":2,"text":"two","owners":[]},
--   {"kibbutz":"__test__","seq":3,"text":"three","owners":[]}]}'::jsonb);
--
-- -- a task was opened from seq 1, seq 2 was linked AND marked handled
-- update kibbutz_meeting_notes set ems_task_id = 'task-A' where kibbutz='__test__' and seq=1;
-- update kibbutz_meeting_notes set ems_task_id = 'task-B', done_at = '2020-02-02T00:00:00Z'
--   where kibbutz='__test__' and seq=2;
--
-- -- re-import: seq 1 unchanged, seq 2 REWORDED, seq 3 dropped, seq 4 new
-- select import_meeting_notes('{"meeting_date":"2020-01-01","meeting_kind":"company","created_by":"t","rows":[
--   {"kibbutz":"__test__","seq":1,"text":"one","owners":["עידן","אביאם"]},
--   {"kibbutz":"__test__","seq":2,"text":"two REWORDED","owners":[]},
--   {"kibbutz":"__test__","seq":4,"text":"four","owners":[]}]}'::jsonb);
--
-- select seq, text, owners, ems_task_id, done_at is not null as done,
--        text_changed_at is not null as flagged
--   from kibbutz_meeting_notes where kibbutz='__test__' order by seq;
--
-- delete from kibbutz_meeting_notes where kibbutz = '__test__';
