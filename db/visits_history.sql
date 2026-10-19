-- visits_history: every UPDATE / DELETE on visits keeps the OLD row (19.10.26).
-- Why: the 2.153 id-reuse bug overwrote reports on 1.10, 5.10 and 7.10; PITR is off and there were
-- no backups, so the old text was gone for good. With this, any future overwrite is one SELECT away.
-- Status: NOT APPLIED — MAIN applies after עידן's OK. Additive only (new table + trigger), touches no row.

create table if not exists public.visits_history (
  hist_id    bigserial primary key,
  op         text        not null,               -- 'UPDATE' | 'DELETE'
  at         timestamptz not null default now(),
  old_row    jsonb       not null
);
alter table public.visits_history enable row level security;   -- no policies: clients can't read or write it

create or replace function public.visits_keep_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.visits_history(op, old_row) values (tg_op, to_jsonb(old));
  return coalesce(new, old);
end $$;

drop trigger if exists visits_keep_history on public.visits;
create trigger visits_keep_history before update or delete on public.visits
  for each row execute function public.visits_keep_history();

-- Recover a row:  select old_row from visits_history where old_row->>'id' = '<id>' order by at;
-- ROLLBACK:
--   drop trigger if exists visits_keep_history on public.visits;
--   drop function if exists public.visits_keep_history();
--   drop table if exists public.visits_history;
