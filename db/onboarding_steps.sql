-- onboarding_steps — Task 27 (spec §4): the spawned, per-kibbutz checklist rows. Frozen off the
-- template at create time — editing `onboarding_templates` later never touches these.
--
-- `state`: open → waiting → done, cycled by tapping the step on the 🆕 card (see
-- app/src/lib/onboarding.ts `nextState`). "waiting" is a display state only for P4 — the Gmail
-- label flow that would auto-close it is out of scope (spec §3b excluded); a waiting step is
-- closed manually, same as any other.
--
-- Apply with the other db/*.sql migrations (Supabase SQL editor / CLI).

create table if not exists onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  kibbutz text not null,
  step_key text not null,
  label text,
  seq int,
  state text not null default 'open' check (state in ('open', 'waiting', 'done')),
  sent_at timestamptz,
  done_at timestamptz,
  created_at timestamptz default now(),
  unique (kibbutz, step_key)
);

alter table onboarding_steps enable row level security;

drop policy if exists os_read on onboarding_steps;
create policy os_read on onboarding_steps for select using (true);

drop policy if exists os_write on onboarding_steps;
create policy os_write on onboarding_steps for all to authenticated using (true) with check (true);

create index if not exists onboarding_steps_kibbutz on onboarding_steps (kibbutz);
