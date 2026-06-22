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
- **Main page decluttered:** "My Tasks" bar moved into the **משימות** page; category **counts merged
  onto the filter chips** (search bar) and the separate stat squares under "company tasks" removed.
- **Stats:** removed the "סוג לקוח" (client-type) chart + wavering list (not tracked).
- **Header:** removed the "העתק קישור" button; **meeting-mode** badge shown only to עידן.
- **Access/roles:** עמיחי (CEO) sees everything (incl. attendance); מתניה no longer sees מלאי;
  עמיחי dropped from the employee cards (CEO, not a managed employee).
- **Employee page → role-based cards:** עידן = company **go-live pipeline** (not a personal bar);
  אביאם/ניתאי = field metrics; מתניה = office/dev (dev-load placeholder pending the task source).
- **Overall-progress bar:** per-color hover tooltips + tap-to-show legend (mobile).
### Fixed
- **Low-stock alert** meter label `מונה PM` → full name **`מונה PM135`** (+ precise `PM135` match
  so it can't accidentally bucket other meters).
- **Stats** period filter labeled "(ביקורים/חלוקה)" — it scopes the activity sections, not the
  current-state task KPIs (was misleading; review finding).
- **Staff messages** popup: in-flight guard + removes any existing popup → no double-popup race.
- **Bridge token auto-refresh** (~50 min) so writes don't silently fail after the write-lockdown.
- **Attendance** hidden from עידן (only אביאם/ניתאי see their own; עידן logs in as them if needed).
- **Card "מי מעדכן" field removed** from the edit modal — the updater is auto-recorded as the
  logged-in user (no picker for עידן, no label for others).
- **Login 5xx** (e.g. 502 during an EMS deploy) now shows "⏳ המערכת בעליית גרסה — נא לנסות שוב
  בעוד מספר דקות" instead of the misleading "wrong email/password".
### Security (in progress — #4)
- STEP 1 RLS applied; auth bridge ON (self-verifying, anon fallback).
- `ems-auth` mints an `authenticated` token; `JWT_SECRET` set = the project **Legacy JWT Secret**.
- **VERIFIED ✅:** mint→RLS returns 200 and the on-load bridge logs `🔒 Supabase pass active`.
- **STEP 2 write-lockdown applied + verified** (anon write → 401; reads still work).
- **Review/QA (2 agents)** done. **Pending your SQL:** drop anon-read on `messages` (private notes
  are otherwise readable via the public key). Follow-ups: stronger EMS-token validation, per-user
  message RLS, query-based lockdown, `ems-auth` CORS lock. Full read-lockdown + rotate `service_role` later.

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
