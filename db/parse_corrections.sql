-- parse_corrections — the order parser's learning store.
-- Every accepted order that started from free text saves {raw_text → final items}. The `parse-order`
-- Edge Function feeds the most recent rows back as few-shot examples, so parsing improves with use.
-- Run once in the Supabase SQL editor.

create table if not exists public.parse_corrections (
  id          uuid primary key default gen_random_uuid(),
  raw_text    text not null,
  items       jsonb not null default '[]'::jsonb,
  created_by  text default '',
  created_at  timestamptz not null default now()
);

create index if not exists parse_corrections_created_idx on public.parse_corrections (created_at desc);

alter table public.parse_corrections enable row level security;

-- Read: allowed (anon ok) — the function reads recent rows for few-shot. These are product-mapping
-- examples, not sensitive. Drop the policy first so re-running this file is idempotent.
drop policy if exists parse_corrections_read on public.parse_corrections;
create policy parse_corrections_read on public.parse_corrections
  for select using (true);

-- Insert: the app writes accepted parses via the authenticated EMS→Supabase bridge.
drop policy if exists parse_corrections_insert on public.parse_corrections;
create policy parse_corrections_insert on public.parse_corrections
  for insert to authenticated with check (true);
