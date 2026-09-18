-- ══════════════════════════════════════════════════════════════════════════════
-- 📈 `usage_events` — who used what, and when (spec §7j Part M, "סיגמה 2.00").
--
-- One row = one thing that happened in the app: a page view, an island mount, a primary
-- action (visit saved, cert issued, order approved, …) or a dead-end signal (a search that
-- found nothing, a sheet opened and abandoned).
--
-- PII-LIGHT BY DESIGN, and this is a ruling, not a preference:
--   person  — the app login name, the same string getCurrentUser() returns
--   page    — an app page KEY ('kibbutz' | 'inventory' | …), never a URL with parameters
--   action  — a fixed key from app/src/lib/usageNarrative.ts, never free text
--   target  — a SHORT identifier: a kibbutz name, a cert number, an EMS id (40 chars max)
--   at / session_id / device — timestamp, per-tab id, and 'phone' | 'desktop'
-- Nothing a user TYPED is ever stored — NO EXCEPTIONS (review fix round 1). §7j's example
-- narrative quoted the failed search terms; the ruling is that a typed query is typed text
-- whatever it happens to contain, so a search miss lands as `target = 'results:0,len:<n>'` and
-- the weekly narrative counts misses instead of quoting them.
--
-- RLS. The client may only ever WRITE here:
--   • INSERT — `authenticated` (the EMS-minted pass). A phone with no EMS session simply
--     drops its buffer (app/src/lib/track.ts flushPolicy) rather than writing anon.
--   • SELECT — NO policy, and the privilege is revoked. Reading is 📈 שימוש's alone and goes
--     through `usage_report()` below, which checks the actor server-side.
--   • UPDATE / DELETE — no policy and revoked. An analytics row is never edited.
--
-- LIMITATION, stated as plainly as db/feedback.sql states it: the app has ONE shared
-- `authenticated` JWT minted from the EMS gate, so Postgres cannot tell עידן from ניתאי. The
-- actor check below is therefore defence in depth, not authentication — it stops every
-- ordinary app path and makes reading the table require deliberately forging a name. Real
-- per-user identity needs per-user Supabase auth (docs/integration-map.md).
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists usage_events (
  id         bigint generated always as identity primary key,
  person     text,
  page       text,
  action     text not null,
  target     text,
  at         timestamptz not null default now(),
  session_id text,
  device     text
);

-- The report reads "the last 30 days, ascending" and nothing else.
create index if not exists usage_events_at_idx     on usage_events (at desc);
create index if not exists usage_events_person_idx on usage_events (person, at desc);

alter table usage_events enable row level security;

drop policy if exists usage_events_insert on usage_events;
create policy usage_events_insert on usage_events for insert to authenticated with check (true);

-- No select/update/delete policy ON PURPOSE. Belt and braces: take the privileges away too,
-- so a direct read fails loudly ("permission denied") instead of quietly returning 0 rows and
-- looking like "there is no usage yet".
revoke select, update, delete on usage_events from anon, authenticated;

-- ── the ONE way in ────────────────────────────────────────────────────────────
-- SECURITY DEFINER (owner: postgres) so it may read past the missing SELECT policy, and it
-- refuses any actor that is not עידן. Two conditions on purpose:
--   • membership in `app_admins` — the existing DB-side roster mechanism (same as
--     feedback_admin_update), so the gate is data, inspectable in the database
--   • and literally 'עידן' — §7j says this screen is his alone, and `app_admins` also holds
--     עמיחי. Widening it is therefore a deliberate code change, not an INSERT someone makes
--     in passing.
create or replace function usage_report(p_days int, p_actor text)
returns setof usage_events
language plpgsql
security definer
set search_path = public
stable
as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 120);
begin
  if p_actor is distinct from 'עידן'
     or not exists (select 1 from app_admins where name = p_actor) then
    raise exception 'usage_report: % may not read usage analytics', coalesce(p_actor, '(null)')
      using errcode = '42501';
  end if;
  return query
    select * from usage_events
     where at >= now() - make_interval(days => d)
     order by at asc
     limit 200000;
end $$;

revoke all on function usage_report(int, text) from public, anon;
grant execute on function usage_report(int, text) to authenticated;

-- ── RETENTION ─────────────────────────────────────────────────────────────────
-- The page and the digest never look further back than 30 days, so nothing older than a
-- quarter has a reader. There is no TTL in Postgres; the sweep is this statement, run from
-- the SQL editor or as a pg_cron job (same pattern as db/cron_usage_weekly.sql):
--
--   delete from usage_events where at < now() - interval '90 days';
