# Changelog

All notable changes to the **Sigmatec Operations App**. Format follows
[Keep a Changelog](https://keepachangelog.com/). Newest first.

> **Per-update protocol:** every change adds an entry here (what + why), updates the relevant
> doc file + [backlog.md](backlog.md) state. Full session detail is captured automatically by
> claude-mem (search with the `mem-search` skill).

## [Unreleased]
### Added
- **Project memory/docs system** under `docs/`: [INDEX](INDEX.md) → architecture, modules,
  data-and-security, operations, backlog. Index-to-small-files layout (load only what's needed).
- This **CHANGELOG**.
- **Stats page** (`stats.html`): fixed rendering (Heebo + emoji fonts, RTL charts, mobile
  table scroll, back-link → index.html) + interactive **time-period** & **region** filters.
- **Employee-management page** (`js/src/17-staff.js`, gated to עידן + עמיחי): per-employee task
  load + status breakdown, system-usage by actions (visits/edits/attendance), upcoming vacations,
  progress bar, and leave-a-message (Supabase `messages` table) + unread popup on next login.
- **`calendar` Edge Function** (`supabase/functions/calendar`): office-calendar read+add via a
  Google service account — EMS-login-gated, least-privilege (single shared calendar, fixed id).
### Changed
- **Calendar backend:** Apps Script → **Supabase service account** (Workspace blocks public
  Apps Script web apps, so the org-owned script couldn't be reached from the public app).
- **`ems-auth` Edge Function** hardened: reads `JWT_SECRET` **per-request** (not at module
  load, so a freshly-set secret is always picked up) and returns an **env diagnostic**
  (variable names + lengths, no values) instead of a cryptic 500 when the secret is missing.
### Security (in progress — #4)
- STEP 1 RLS applied; auth bridge ON (self-verifying, anon fallback).
- `ems-auth` mints an `authenticated` token; `JWT_SECRET` set = the project **Legacy JWT Secret**.
- **VERIFIED ✅:** mint→RLS returns 200 and the on-load bridge logs `🔒 Supabase pass active`.
  NEXT: **STEP 2 write-lockdown** (anon read-only, auth-only writes) → full read-lockdown later
  (after bridging `stats.html`) → rotate `service_role`.

## [2026-06-22] — Supabase migration · PWA · EMS login
### Added
- **EMS login gate** (email/password + 2FA OTP) as the app gate; badge = logout; login spinner.
- **PWA**: manifest, network-first service worker, install button, cache-busting build.
- **Meters** on EMS tasks (⚡/💧 + serial number + admin link).
- One-click **"📅 add to my calendar"** links on calendar events.
- **EMS→Supabase auth bridge** (`ems-auth` Edge Function) + `USE_SB_BRIDGE` flag + STEP 1 RLS.
- **Org Apps Script backend (Option B)** drafted — EMS proxy + office calendar (not yet deployed).
### Changed
- Backend **migrated Google Sheets → Supabase** (Postgres + PostgREST + RLS); verified read parity.
- Monolithic HTML **split into `js/src/*.js` modules** built by `build.mjs`.
- Project relocated to **`Sigmatec Operations App`**; legacy `kibbutz-dashboard` archived.

## [pre-migration] — builds ·20–·29 (Google Sheets era)
- Original dashboard on Google Sheets + Apps Script. History in `archive/changelog/` + git log.
