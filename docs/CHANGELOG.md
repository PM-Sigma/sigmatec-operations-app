# Changelog

All notable changes to the **Sigmatec Operations App**. Format follows
[Keep a Changelog](https://keepachangelog.com/). Newest first.

> **Per-update protocol:** every change adds an entry here (what + why), updates the relevant
> doc file + [backlog.md](backlog.md) state. Full session detail is captured automatically by
> claude-mem (search with the `mem-search` skill).

## [Unreleased]
### Added
- **Parser alias glossary — taught 4 business mappings (·52)** — explicit term→product rules, applied by both
  the AI (`parse-order` prompt glossary) and the offline matcher (`INTAKE_ALIASES`): **"133"/סאטק → מונה EM133**
  *(confirmed by עידן — catalog has no PM133; EM133 is the "133")*, **לנדיס ישיר לקו → מונה E360PP**, **לנדיס חד
  פאזי → מונה E360SP**, **לנדיס משנה-זרם/משנ"ז (Landis context) → מונה E360CT**. Scoped so a bare `משנ"ז 250/400`
  still maps to the physical CT hardware, not E360CT. Verified in the offline matcher. **Activate the AI side by
  re-deploying `parse-order`** (the glossary lives in its prompt); to add more aliases later, edit the `ALIASES`
  array in `supabase/functions/parse-order/index.ts` (+ `INTAKE_ALIASES`) — or just let it learn from accepted orders.
- **AI order-parsing — frontend + function ready, awaiting key (·51)** — new-order modal now leads with a single
  free-text box (📥 paste email/WhatsApp) → **🪄 נתח לפריטים** → editable rows; the AI box shows for **both**
  order types; a big full-width **➕ הוסף שורה** for manual rows. Parsing now calls a new `parse-order` Edge
  Function (**Gemini** free tier + the live catalog + recent **`parse_corrections` as few-shot** → learns from
  every accepted order); **graceful fallback** to the local matcher until it's deployed, so nothing breaks now.
  Wrote `supabase/functions/parse-order/index.ts`, `db/parse_corrections.sql`, and the `parseCorrection` write
  path (`01-data.js`) that captures `{raw text → accepted items}` on save. **To activate:** see
  `operations.md` → "Edge Function (parse-order)" — 3 steps (free Gemini key → deploy fn + set `GEMINI_API_KEY`
  → run the SQL). Verified: box shows for both types, calls `parse-order`, falls back cleanly when absent.
- **Visit return → "↩️ למלאי" checkbox (·50)** — in the visit summary's "ציוד שהוחזר" rows, a per-item checkbox.
  Checked = the item is intact → goes back to the **visiting employee's** available stock (movement
  kibbutz→visitor, `return_restock`) and is logged as already-`restocked` (won't sit pending in the returns
  tracker). Unchecked = defective → the `תקול` bucket as before. (`05-meeting-returns.js` row UI,
  `09-visits.js` save routing, `01-data.js` returns-row status.)
- **Inventory two-type order flow (·49)** — orders now carry an explicit **`orderType`** with a toggle in the
  new-order modal:
  - 🏭 **הזמנת ספק** (raises stock): approval routed by size — **≤10 items → אביאם**, **>10 → עמיחי**
    (`orderTotalQty` = sum of quantities). >10 orders also trigger a **floating approval nudge for עמיחי**
    (`maybeShowAmichaiApprovalReminder`, mirrors the attendance reminder; once/session, re-fires per login).
    Approve → `pending` → existing purchase flow (delivery+distribution still raises stock).
  - 🧑‍🌾 **הזמנת לקוח** (consumes stock): kibbutz picker; approval by **אביאם/ניתאי**. On approve →
    **deduct each item from the approver's stock → the kibbutz** (movement `customer_supply`), **open a real EMS
    "אספקת ציוד" task** assigned to the approver (queued via the new `createTask` queue kind → created on the next
    connect by anyone), mark the order **`supplied`** (row kept) + the linked requirement **`fulfilled`**.
  - Orders list shows a **type chip** (ספק/לקוח, "ספק 10+" flag) + **ספק/קיבוץ** column; the approve button only
    shows for the correct approver, others see who it's waiting on. New `supplied` status.
  - Verified end-to-end against the bundle: approval matrix (5/12/customer × roles), the toggle, the עמיחי nudge,
    and the customer-approval call sequence (movement → EMS queue → supplied → requirement fulfilled).
- **Dev-page full sub-issue tree (·46)** — the פיתוח tree now reflects GitHub **native sub-issues** (the team's
  real hierarchy), not just the `topic|sub|desc` title text. Cards like #104 (11 sub-issues) whose children point
  at *different* topics were being scattered across the page; now they nest under their card, to **any depth**
  (📂 topic → card → sub-task → … → leaf), each row expandable with its full detail. Cross-topic children keep
  their full path; same-topic prefixes are stripped for readability; a count badge shows each card's sub-tasks;
  search reveals the path to deep matches. **`github` function** change: returns each issue's `parent` via one
  added GraphQL query (graceful → flat grouping if unavailable). **Needs a `github` function redeploy** to light up.
  Verified with a stubbed hierarchy (3 levels deep, cross-topic child preserved, counts correct).
- **Dev-page "עומס לפי עדיפות" (·44)** — a priority-load breakdown in the פיתוח hero: 4 color-coded tiles
  (קריטי / גבוהה / בינונית / נמוכה) with live counts of open tickets per tier, fed by the now-live Projects-v2
  Priority field. Sits below the overview KPIs, above "עומס לפי נושא". Reuses the `.dev-kpi` tile styling.
  Verified: counts bucket correctly (test set 3/2/1/1 → קריטי=3, גבוהה=2, בינונית=1, נמוכה=1).

### Removed
- **Footer dev-hint (·47)** — removed "לחזרה לגיליון הוסף ?sb=0 לכתובת" from the footer (the `?sb=0` flag
  still works; it's just no longer advertised to users). Kept the version stamp.
- **Morning "היום" view (·44)** — removed per request ("לא רוצה את זה באפליקציה כרגע"). Reverted the whole
  ·42 feature: the 🌅 nav page, `js/src/19-today.js`, the today-view dispatch, and the remember-last-page /
  new-day landing (`landOnStartPage`). The app opens on the home page again (·41 behavior). Streamlining /
  automation ideas are being collected separately to brainstorm.
- **Morning "היום" view + smart landing (·42, `19-today.js`):** a new **first** nav page (🌅 היום) that
  aggregates what needs attention *now* — role-aware, pure client-side (no backend/secrets): **דורש טיפול**
  (orders awaiting *your* approval + low-stock relevant to you), **המשימות שלי** (open EMS tasks assigned to
  you → link to the full משימות page), **סטטוס הקמה** (kibbutz pipeline counts). Dark hero greeting + subtle
  load-in animation (`prefers-reduced-motion` respected). **Remember-last-page:** `showPage` persists the page
  + date; `landOnStartPage()` (fired once from `refreshData`) **reopens the last page within the same day**, but
  **lands on היום on a new day** (morning briefing). Verified: render, role-aware user, both landing branches,
  mobile 375 (no overflow). *Note: the recommendations doc's "bottom-nav" and "dev-page 404" items were stale —
  bottom-nav already exists (fixed bar ≤768px), dev page is live (·41).*
- **Dev-tasks color redesign + KPI hero (·41):** the פיתוח page led with a pale, near-styleless tree.
  Added a **dark navy "mission-control" hero band** carrying the page title + **4 live KPI tiles**
  (משימות פתוחות / בפיתוח עכשיו / עודכנו השבוע / נושאים פעילים — all computed from the already-fetched
  ticket list, no new data) and a **"עומס לפי נושא" distribution bar** with a clickable legend that
  **replaces the old jump-chips**. Introduced a **per-topic color system** (`DEV_TOPIC_COLORS`): each
  topic owns one color reused across the bar segment, its legend dot, and its tree section (colored
  **spine** + count pill + body rail) — so a bar slice, its legend chip, and its section read as one color.
  The **"בפיתוח עכשיו"** box became a real **violet card** (violet = "in development" across the app, was
  a near-invisible right-rail only — `.card` was never even defined in CSS). **קריטי/דחוף** priority chip
  is now a **filled red** (was washed-out tint). Static `index.html` heading removed (the hero carries it).
  Verified via computed styles + a static harness at desktop (1040) and mobile (375: 2-col KPIs, no overflow).
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
- **EMS bubble routing (·48)** — when **disconnected**, the header bubble (🔴 אין חיבור ל-EMS) now opens the
  **in-app EMS connection page** (`showPage('ems')` → `emsLoginPanel`) instead of the external site you can't
  use yet; when **connected** (🟢) it opens the EMS system as before. Verified both states.
- **Dev-tasks priority/status now live (2026-06-23, config-only)** — the `GH_TOKEN` blocker is resolved: the
  token was reissued with `repo + read:org + project` and the `github` fn redeployed. Verified live (127 status
  badges + priority chips over 130 tickets; "בפיתוח עכשיו" from real In-Progress). No code change. *(Confirmed
  Sigmatec-Energy has no SAML SSO, so the previously-assumed SSO-authorize step wasn't needed.)*
- **Low-stock alert "appears twice" (·43)** — for אביאם/עמיחי a meter shortage surfaced **both** in the red
  banner *and* as a red line in the company-orders task list. Root cause: `renderLowStockAlert` added the
  company-task line for everyone, but אביאם/עמיחי also get meters in the banner. Fix: skip the company-task
  meter line for the two banner-users; everyone else (עידן/מתניה/ניתאי, who have no banner) still gets the
  line. Verified in a rig: עמיחי → 1 (banner only); עידן → 1 (line only). *(The benign double-call from
  `refreshData`+`renderInventory` was a red herring — it's idempotent, guarded.)*
- **Priority "קריטי" (·40)** now maps to the top red chip (was falling through unmapped). Tier order: קריטי/דחוף → גבוה → בינוני → נמוך.
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
