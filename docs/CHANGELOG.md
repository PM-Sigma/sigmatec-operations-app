# Changelog

All notable changes to the **Sigmatec Operations App**. Format follows
[Keep a Changelog](https://keepachangelog.com/). Newest first.

> **Per-update protocol:** every change adds an entry here (what + why), updates the relevant
> doc file + [backlog.md](backlog.md) state. Full session detail is captured automatically by
> claude-mem (search with the `mem-search` skill).

## [Unreleased]
### Added
- **Visible version stamp** (`גרסה {date}·{N}`) in the footer, **auto-incremented** by `build.mjs`
  from a `VERSION` counter on every build — so each deploy is visibly newer (continues the old ·NN scheme).
- **Dev-tasks interactive navigation:** topic **chips** (click = jump + open the group), **collapsible**
  topic groups (native `<details>`), live **search** box, and a **"🔨 בפיתוח עכשיו"** section
  (open tickets by most-recent activity; `github` fn now returns `updatedAt`). Verified live (build ·30).
- **Dev-tasks visual redesign (·31):** centered max-width column + **3-level hierarchy via nested rails**
  (📂 topic → ↳ sub-topic that *owns* its tasks → task row), rows as full-row links with the **#issue-number
  de-emphasized** to a muted reference (it is *not* a priority), an **optional** priority chip that appears only
  when a ticket actually sets one, and a **mobile-first** layout (≥44px touch targets, no edge-to-edge smear).
  Chosen via a 3-approach design panel (nested-rails won on hierarchy, merged with mobile-comfort spacing).
- **Dev-tasks interactive tree (·34):** reworked to a real 3-level collapsible tree — 📂 topic → **אב parent**
  (click = show/hide its children) → **בן task** (click = expand its **detail**: state, assignee, priority, dates,
  and the ticket **body**). **GitHub is now an explicit icon button** (does NOT toggle the row / is no longer the
  default click). Grouping unified so a 2-part ticket `T|S` and 3-part `T|S|D` with the **same** sub-name **merge**
  into one parent; parents sorted A→Z (Hebrew) so near-identical names sit adjacent (e.g. `ייצוא אקסל` next to
  `ייצוא לאקסל` — they only fully merge if the ticket titles are spelled identically). `github` fn now returns the
  issue **body** (needs a redeploy to populate the detail panel). Verified on a 375px rig (grouping, collapse,
  detail, git-button-doesn't-toggle, search, no overflow).
- **Planning/reference docs:** `docs/vision-budget.md` (what a funded version unlocks) and `docs/team.md`
  (employee roles, field/office split, per-role metrics — basis for the role-based employee cards).
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
- **Dev-tasks page** (`js/src/18-dev-tasks.js` + `github` Edge Function, gated to עידן + עמיחי):
  read-only live view of the GitHub tickets (`Sigmatec-Energy/tasks`) grouped by **topic → sub-topic**
  (parsed from the title `נושא | תת-נושא | תיאור`), auto-updating. **Working** (pulls 100+ live tickets). Editing (priority/sprint) = phase 2.
- **`github` Edge Function** added to the repo (`supabase/functions/github`) — read-only GitHub-issues
  proxy, EMS-gated, default repo `Sigmatec-Energy/tasks`, with pagination. Token authorized → returns live tickets.
- **EMS connection bubble** + visit-doc **FAB gated to field staff**.
- **Recommendations doc** (`docs/RECOMMENDATIONS-he.md`) — next-stage plan by domain (Hebrew), informed
  by the EMS-validation + BGU-BI projects.
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
- **EMS connection bubble** in the header — live status + a link to the EMS web system.
  Wording: **🟢 מחובר ל-EMS** / **🔴 אין חיבור ל-EMS** (red when disconnected).
- **Visit-doc FAB** now shows only for field staff (אביאם/ניתאי) with the attendance-type picker;
  hidden for office (עידן/מתניה/עמיחי).
- **Overall-progress bar:** per-color hover tooltips + tap-to-show legend (mobile).
- **Home page renamed** "קיבוצים" → **"דף הבית"** (nav icon → 🏠).
- **Footer version line** RTL fix — version + `?sb=0` isolated with `<bdi>` and split to two lines so the
  mixed Hebrew/latin text stops flipping.
- **EMS bubble** wording → **🟢 מחובר ל-EMS** / **🔴 אין חיבור ל-EMS** (red when disconnected).
### Fixed
- **Dev-tasks now reads GitHub Projects-v2 fields** (·39) — the real source of priority. The function added a
  **GraphQL** query against project **"Sigmatec EMS — Roadmap"** (Sigmatec-Energy #1) and merges **Priority +
  Status** (also type/sprint) by issue number. These live on the **project board**, not the issues — which is why
  labels/body showed nothing (118/122 items have Priority, 122/122 have Status). UI: priority chip + colored
  **Status badge**, and **"בפיתוח עכשיו" is now driven by real Status=In-Progress** (activity-sort fallback).
  Requires `GH_TOKEN` to have the **`project`** scope + a redeploy; **graceful** if absent (tickets still load).
- **Dev-tasks priority now reads a GitHub label** (·38) — not just the body `## עדיפות`. A label containing
  `דחוף`/`גבוה`/`high` → גבוהה, `בינוני`/`medium` → בינונית, `נמוך`/`low` → נמוכה (also 🔴/🟡/🟢). Client-side
  (the function already returns labels) so **no redeploy needed** — the chip appears the moment a ticket is labeled.
  *(Confirmed via `gh`: 0/100 tickets currently have any priority — no labels, no body field — which is why none showed.)*
- **`github` function can no longer hang for minutes** (the dev-tree "cold/stuck" stall). Root cause: the
  EMS-validation `fetch` had **no timeout**, so a slow EMS API stalled the whole function. Added an
  **AbortController timeout** (`fetchT`) on the EMS-validation (8s) + GitHub (12s) calls → worst case fails
  fast. Client: `devFetchTasks` now has a **20s timeout** + a **🔄 נסה שוב** retry button (no more endless
  spinner; shows "השרת מתעורר (cold start)" on timeout). *(Cold starts are inherent to serverless; these make them a brief retry, not a hang.)*
- **Removed the obsolete "📱 שלח לעידן" note + button** from the company-tasks modal — it predated the shared
  database; saving now updates the whole team directly (like the kibbutz cards). Dead `sendCompanyTasksToTeam` removed.
- **Saves no longer fail to "נשמר מקומית/לוקאלית"** (the recurring company-tasks / priority-lists bug). Root
  cause: writes need the **authenticated** Supabase bridge pass, but when it lapsed the write went out as
  **anon** (read-only post-lockdown) and was rejected → localStorage fallback. The write shim now **re-mints
  the pass before every upsert** (`01-data.js`), so all save paths (company-tasks, requirements, tasks, visits,
  orders, attendance…) write authenticated. **`saveCompanyTasks`** also awaits properly with a 12s timeout,
  shows an accurate result, and keeps a local safety copy. Verified on a 375px rig (success + failure paths).
- **Wording (post-Sheets migration):** save buttons "💾 שמור לגיליון" → **"💾 שמור"**; save toasts
  "✅ נשמר/נוסף לגיליון" → **"✅ נשמר/נוסף"** (data now goes to Supabase, not a sheet).
- **Mobile QA pass (≤768px)** — audited every view/modal/nav at ~375px via a 6-area agent sweep + a real
  375px test rig, then one desktop-safe patch (build ·33): **my-tasks bar** was white-on-white **invisible** →
  solid surface + dark labels; **attendance table** scrolled the whole page sideways → wrapped in a scroller;
  **inventory matrix** first column (פריט/קיבוץ name) pinned sticky so it stays while scrolling; **tap targets**
  raised to ≥40px (filter chips, header-meta pills, day-type buttons); **comment-hint** ("לחץ לשליחת הערה")
  was hover-only → now visible on touch; EMS filter-bar controls stack full-width; progress-legend enlarged.
  Verified: no horizontal overflow on any view at 375px; desktop untouched (media-scoped).
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
