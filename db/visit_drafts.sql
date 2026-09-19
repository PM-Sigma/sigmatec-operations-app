-- Visit drafts — "nothing typed is ever lost" (spec §5.1c, task-4 step 5b2).
--
-- The id is the PRE-MINTED visit id (js/src/09-visits.js `visitDraftId()`), so a draft, the
-- delivery certificate issued from it and the saved visit all share one identity: the cert's
-- refId keeps pointing at the right visit even though the visit row does not exist yet.
create table if not exists public.visit_drafts (
  id          text primary key,
  person      text not null,
  kibbutz     text not null,
  date        date not null,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- The one lookup the app does: "is there a draft for this kibbutz, by me, today?"
create index if not exists visit_drafts_person_kibbutz_date
  on public.visit_drafts (person, kibbutz, date);

alter table public.visit_drafts enable row level security;

drop policy if exists visit_drafts_read on public.visit_drafts;
create policy visit_drafts_read on public.visit_drafts
  for select using (true);

drop policy if exists visit_drafts_write on public.visit_drafts;
create policy visit_drafts_write on public.visit_drafts
  for all to authenticated using (true) with check (true);

comment on table public.visit_drafts is
  'Autosaved visit drafts (spec §5.1c, §7p). id = the pre-minted visit id. Deleted when the visit is saved.';

-- §7p (chapters) adds three keys to `payload` — `chapter` (1–5, the last chapter he was on),
-- `deliver` (does chapter 4 apply to this visit) and `submittedId`. `payload` is jsonb, so
-- this is NOT a schema change: no migration, and a draft written by the legacy form — which
-- knows none of the three — resumes at chapter 1, which is exactly right.

-- HOUSEKEEPING. §7p is explicit that nothing here is deleted automatically: a draft older
-- than 7 days shows "עדיין רלוונטי?" in the sheet and waits for the person to decide. The
-- statement below is therefore a HAND sweep for the monthly maintenance pass only — it must
-- never be wired to a cron, and 14 days is deliberately twice the age the app asks at:
--   delete from public.visit_drafts where updated_at < now() - interval '14 days';
