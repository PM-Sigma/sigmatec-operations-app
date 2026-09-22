-- סיבת הביקור — why the technician was there when the summary is attached to no task at all.
-- Spec: docs/superpowers/specs/2026-09-22-phone-qa-round-2-design.md, Package C item 6.
--
-- Linking the summary to an EMS task or to an internal task IS the reason, so this column is
-- filled only for the visits that linked nothing. The five fixed answers live in the client
-- (app/src/lib/field.ts `VISIT_REASONS`); "אחר" stores the free text the person typed, so what
-- lands here is always a readable sentence rather than a code.
--
-- NOT APPLIED. Run once in the Supabase SQL editor when Package C is merged. The client is
-- tolerant of the column being missing: it retries the write without `reason` on a 42703/PGRST204,
-- so shipping the code before the migration costs a reason, never a visit.

alter table if exists public.visits
  add column if not exists reason text;

comment on column public.visits.reason is
  'סיבת הביקור — filled only when the summary linked no EMS task and no internal task. One of the five fixed answers, or the free text of "אחר".';

-- Reporting reads it per kibbutz over a date range; nothing here is a hot path, so one plain
-- index on the non-null rows is enough and costs almost nothing.
create index if not exists visits_reason_idx
  on public.visits (reason)
  where reason is not null;
