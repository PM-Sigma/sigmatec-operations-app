-- daylog_corrections — 📝 יומן היום's learning store (spec §7i), the twin of parse_corrections.
--
-- ONE row per day log the person actually CORRECTED. What it holds is deliberately thin:
--   · the two JSON shapes (what the model said, what the person accepted) — the few-shot pair;
--   · raw_len, the LENGTH of the text, so we can tell "a long day the model mangled" from
--     "one line it got wrong" without ever storing the day log itself.
-- The free text is never written here, and never anywhere else server-side: it is a person's
-- rough notes about his own day, and the record we keep is the visit he confirmed.
--
-- Run once in the Supabase SQL editor.

create table if not exists public.daylog_corrections (
  id           uuid primary key default gen_random_uuid(),
  person       text not null default '',
  raw_len      integer not null default 0,
  json_before  jsonb not null default '{}'::jsonb,
  json_after   jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists daylog_corrections_created_idx on public.daylog_corrections (created_at desc);

alter table public.daylog_corrections enable row level security;

-- Read: the Edge Function feeds the most recent rows back as few-shot examples, with the anon
-- key. These are product/kibbutz mapping shapes, not a person's day — the same call parse_corrections
-- makes. Dropped first so re-running this file is idempotent.
drop policy if exists daylog_corrections_read on public.daylog_corrections;
create policy daylog_corrections_read on public.daylog_corrections
  for select using (true);

-- Write: authenticated ONLY (the EMS→Supabase bridge pass). No anon insert: an unauthenticated
-- writer here would be a free write channel into the model's few-shot examples.
drop policy if exists daylog_corrections_insert on public.daylog_corrections;
create policy daylog_corrections_insert on public.daylog_corrections
  for insert to authenticated with check (true);
