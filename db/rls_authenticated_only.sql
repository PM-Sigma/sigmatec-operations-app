-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Task 21 / spec §7n — "nothing without a sign-in", at the DATABASE too.      ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
-- The app gates every screen behind the EMS sign-in now. That is a client rule; this file is
-- the server one. Every table below held business data and answered a plain `anon` SELECT
-- (the policies were granted to `public`, which INCLUDES anon, or to `anon` outright), so the
-- public anon key alone could read kibbutzim, meeting summaries, visits, drafts and per-person
-- settings. After this migration only the `authenticated` pass the sign-in mints can read them.
--
-- What is deliberately NOT changed:
--   • delivery_certs — `delivery_certs_read` stays public: a customer opens a ?cert= link with
--     no session at all, by design (js/src/20-delivery-cert.js, _certViewMode).
--   • tasks / orders / movements / attendance / ems_cache / ems_queue — the legacy screens
--     still read these before a pass exists on some paths; they are the staged-lockdown list
--     (db/rls_staged.sql) and belong to that piece of work, not to this one.
--   • usage_events — insert-only for `authenticated` already; reads go through the
--     `usage_report` RPC. Nothing to tighten.
--   • feedback — already `authenticated`-only for select and insert.
--
-- The sign-in flow itself needs NO anon read: the gate talks to the EMS through the Apps
-- Script proxy, and its one Supabase call (`tasks?select=name&limit=1`,
-- js/src/15-login-gate.js) is made WITH the freshly minted pass, as the self-verification of
-- that pass. Verified after applying: anon → 0 rows on every table below, and a fresh sign-in
-- still reaches the cards.
--
-- Reversible: the commented block at the bottom puts the public read policies back.

-- ── kibbutzim ────────────────────────────────────────────────────────────────
drop policy if exists kibbutzim_read on kibbutzim;
create policy kibbutzim_read on kibbutzim for select to authenticated using (true);

-- ── kibbutz_meeting_notes ────────────────────────────────────────────────────
drop policy if exists kmn_read on kibbutz_meeting_notes;
create policy kmn_read on kibbutz_meeting_notes for select to authenticated using (true);

-- ── visits (the anon policy is simply dropped — auth_all already covers authenticated) ──
drop policy if exists anon_read on visits;

-- ── visit_drafts ─────────────────────────────────────────────────────────────
drop policy if exists visit_drafts_read on visit_drafts;
create policy visit_drafts_read on visit_drafts for select to authenticated using (true);

-- ── user_settings ────────────────────────────────────────────────────────────
drop policy if exists user_settings_read on user_settings;
create policy user_settings_read on user_settings for select to authenticated using (true);

-- ── EMERGENCY ROLLBACK ───────────────────────────────────────────────────────
-- Run this if a sign-in problem ever leaves the team unable to read anything:
--
-- drop policy if exists kibbutzim_read on kibbutzim;
-- create policy kibbutzim_read on kibbutzim for select using (true);
-- drop policy if exists kmn_read on kibbutz_meeting_notes;
-- create policy kmn_read on kibbutz_meeting_notes for select using (true);
-- create policy anon_read on visits for select to anon using (true);
-- drop policy if exists visit_drafts_read on visit_drafts;
-- create policy visit_drafts_read on visit_drafts for select using (true);
-- drop policy if exists user_settings_read on user_settings;
-- create policy user_settings_read on user_settings for select using (true);
