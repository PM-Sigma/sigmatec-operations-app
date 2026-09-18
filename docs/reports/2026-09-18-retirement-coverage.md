# Retirement coverage audit — R1–R8

Guard rail per §7m: "no retirement may drop a function that is still needed and not covered by the remaining spec."
Scope: `C:\Users\idann\Projects\SigmatecOps-wt-cards` (branch `fix/dev-board-columns`). Read in full:
`js/src/14-calendar.js`, `js/src/12-reports.js`, `js/src/17-staff.js`, `js/src/13-ems.js`, `js/src/00-bridge.js`,
`js/src/22-push.js`, `sw.js`, and the relevant `index.html` sections (home company-tasks block, `#ems-view`,
`#my-tasks-view`, `#staff-view`, `#calendar-view`, EMS task modal). Cross-referenced against `app/src/**` (the
React islands actually built so far) and `css/app.css`.

**Note on scope:** `kibbutz-stats.html` (R6) does not exist anywhere in this worktree (`find . -iname
"kibbutz-stats.html"` → no match; also absent from `sw.js`'s `SHELL` precache list). It may exist only on
`main`/`dev` outside this worktree — R6's row below is written from the spec's description of it, not from a
file read, and should be re-verified once this branch is compared against `dev`.

---

## R1 — standalone "משימות" page (`#my-tasks-view`)

| surface | function (file:line) | what it does | used by (call sites) | new home | verdict |
|---|---|---|---|---|---|
| R1 | `renderMyTasks()` (14-calendar.js:115-160) | Groups the current user's open EMS tasks (assignee match or kibbutz-owner match) + status/expectedTask "- name" lines by kibbutz; renders as a list | `showPage('mytasks')` (02-init-attendance.js:56); nav button `#navMyTasks` (index.html:49) | §7g / R1 — calendar "list view" (3rd view: שבוע/חודש/רשימה) | MOVE |
| R1 | `#my-tasks-view` markup incl. `myTasksPerson` picker (index.html:592-615) | Page shell: title, per-person report picker, list container | `showPage()` toggles it | Dropped with the page; picker functionality superseded by "כולל של אחרים" filter in §7g | DROP (markup); picker's admin-filter intent → MOVE into §7g filters |
| R1 | **📍 דוח ביקורים button** → `openVisitsReportModal()` (09-visits.js:506, button in index.html:611) | Opens the visits-report modal (date range → PDF/Excel) — lives in `viewerReportsHub` too | Sits on `#my-tasks-view` only as an extra button, unrelated to "my tasks" | **Not named anywhere in spec §7g/R1.** `09-visits.js` itself is not retired, but this entry point disappears with the page | GAP — no stated new home for this button once `#my-tasks-view` is deleted (see GAP list) |
| R1 | **📊 פעילות היום button** → `openActivityModal()` (10-activity.js:6, button in index.html:612) | Opens the daily-activity feed modal | Same as above — bolted onto `#my-tasks-view` | Not mentioned in spec | GAP — same as above |
| R1 | `openKibbutzByName(name)` (14-calendar.js:2-6) | Click-through from a `renderMyTasks()` row to open that kibbutz's card modal | Called from `renderMyTasks()` rows only | Needed by whatever renders the list view rows in §7g (row → open card) | MOVE (§7g) |
| R1 | `.my-tasks-bar` / `.my-tasks-btn` CSS (app.css:1394-1436, 1460-1461, 1597-1613) | Styles the picker/action bar on `#my-tasks-view` | Only `#my-tasks-view` | Superseded by the calendar list-view's own styling (§6 tokens) | DROP |

## R2 — legacy "📋 EMS" page (`#ems-view`)

| surface | function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|---|
| R2 | `renderEmsPage()` (14-calendar.js:777-790) | Page bootstrap: shows login vs connected panel, arms EMS session-expiry timer, populates site filter, loads tasks, flushes queue+cache | `showPage('ems')` (02-init-attendance.js:55); called after EMS login (14-calendar.js:271,309); fallback target on 401 (12-reports.js:280, 11-search-login.js:210) | Retired per R2, **but** the "not connected" login panel (`#emsLoginPanel`, `emsDoLogin`, `emsVerifyOtp`, `emsResendOtp`, OTP box) is the *only* place a user authenticates to EMS at all | KEEP (login panel + `renderEmsPage`'s login branch) — spec never states an alternate EMS-login surface. See GAP list. |
| R2 | `loadEmsTasks()` / `debounceEmsSearch()` (14-calendar.js:384-429) | Paginated task list with status/priority/site/search/mine/overdue filters | `#emsFilterStatus/Priority/Site`, `#emsSearch`, `#emsMyTasksOnly`, `#emsOverdueOnly` onchange; `renderEmsPage()`; `saveEmsTask`/`changeEmsStatus` refresh callers | §3.3/§7f "list view" carries "its filters live on in the calendar list view" (R2's own text) | MOVE (§7f/list view per R2's own text) |
| R2 | `renderEmsTaskCard(t)` / `renderEmsLoadMore()` (14-calendar.js:448-480) | Renders one task row + "טען עוד" pager for the page's list | `loadEmsTasks()` only | Same list view | MOVE |
| R2 | `emsPopulateSiteFilter()` (14-calendar.js:372-381) | Fills the site `<select>` for the page's filter bar | `renderEmsPage()` | Site filter in the list view | MOVE |
| R2 | `emsCreateTaskModal(prefilledSiteId)` / `saveEmsTask(btn)` (14-calendar.js:501-514, 595-637) | Create/edit-task modal open + save (POST/PATCH `/employee-tasks`) | Card "➕ פתח משימה" (`createEmsTaskForKibbutz`), `#ems-view` "+ משימה חדשה" button, meeting-bullet ➕ flow (spec §3.3) | Explicitly named a survivor in R2 ("keep only the task detail/create/edit modals — they are used everywhere") | KEEP |
| R2 | `emsEditTask(id)` (14-calendar.js:559-575) | Populates the edit form from a live task | `renderEmsDetail()`'s "✏️ ערוך" button | Same modal, KEEP | KEEP |
| R2 | `openEmsTask(id)` / `renderEmsDetail(t)` / `loadEmsComments`/`addEmsComment`/`changeEmsStatus`/`emsCalendarLink`/`emsEnrichMeters`/`emsFetchMeter`/`emsLinkIds` (14-calendar.js:640-764) | Full task detail: status change, comments thread, calendar-add link, linked-meter enrichment | `openKibbutzEmsTask()` (13-ems.js:240 — card tap), `emsModalTaskClick()` (14-calendar.js:538-541 — kibbutz-modal EMS section), `renderEmsTaskCard` onclick | Named explicitly in R2 as surviving ("task detail/create/edit modals... used everywhere") — also required by §4 (full EMS tasks on card) | KEEP |
| R2 | `emsFillSiteAndAssignee(siteId, assigneeId)` (14-calendar.js:486-499) | Populates site+assignee dropdowns for the modal | `emsCreateTaskModal`, `emsEditTask` | Same modal | KEEP |
| R2 | `getEmsSites()` / `emsSiteIdForKibbutz(name)` / `emsNormName` (14-calendar.js:332-349) | Site cache + best-effort kibbutz→EMS-site-id resolver | Bridge (`00-bridge.js:126-127` exposes both to React), `createEmsTaskForKibbutz`, `emsSlimTask`/queue `createTask` (13-ems.js:135), Part G's EMS verification chain (spec §7b step 1) | Core infra used everywhere, not page-specific | KEEP — must NOT be deleted with the page (defined physically inside the "retired" 14-calendar.js file but load-bearing for React + Part G) |
| R2 | `getEmsUsers()` / `emsUserName(u)` (14-calendar.js:350-361) | Admin-user list (assignee options) + display-name formatter | `emsFillSiteAndAssignee`, `renderEmsTaskCard`, `renderMyTasks`, `emsSendItem('createTask')` (13-ems.js:138), `renderEmsDetail` | Used by the surviving task modal and by `emsSendItem` (queue) | KEEP |
| R2 | `emsEsc`, `emsToast`, `emsTokenRole` (14-calendar.js:362-370) | HTML-escape / toast / JWT role decode helpers | Used throughout 13-ems.js, 14-calendar.js, 12-reports.js | Generic helpers, load-bearing everywhere EMS text is rendered | KEEP |
| R2 | `EMS_STATUS` / `EMS_PRIORITY` / `EMS_TYPE` / `EMS_CLOSED` / `emsStatusLabel` / `emsLabels()` (14-calendar.js:432-446) | Canonical label maps, exposed to React via `sigma.emsLabels()` per an explicit code comment ("this file stays the single source of truth") | `app/src/lib/emsTasks.ts`, `test-ems-labels.mjs` | Explicitly documented survivor | KEEP |
| R2 | `EMS_URL_KEY/TOKEN_KEY/…`, `getEmsUrl`, `emsSessionExpired`, `clearEmsSession`, `getEmsToken`, `isEmsConnected`, `scheduleEmsExpiry`, `emsRequireLogin`, `emsDisconnect`, `emsProxyCall`, `emsApi` (12-reports.js:223-336) | Entire EMS auth/session/proxy layer | Every EMS call in the app, `sigma.emsApi`/`isEmsConnected` bridge entries | Core infra, not page-specific | KEEP |
| R2 | `emsOpenStatuses`, `emsCacheData`, `emsCacheTasksForKibbutz`, `emsSlimTask`, `emsResyncIfStaleCache`, `emsSyncCache`, `emsQueue*`, `emsWriteOrQueue`, `emsSendItem`, `emsOnConnected`, `openKibbutzEmsTask` (13-ems.js, whole file) | Shared cache + outbound queue that lets field cards show tasks and visit summaries reach EMS offline | `app/src/components/home/EmsTasks.tsx`, `MeetingNotes.tsx` (via bridge), card widgets, `09-visits.js` visit→EMS push | Core infra behind §4/§3.3, not the retired page | KEEP |
| R2 | `.ems-task-card`, `.ems-filter-bar` CSS (app.css:1147-1168, 1185-1187) | Styles specific to the page's task-list cards and filter bar | Only `#ems-view` | Superseded by list-view styling | DROP |
| R2 | `.card-ems-task` / `.ems-badge` / `.t-title` / `.t-dot` CSS (app.css:1173-1184) — comment explicitly says these "stay — the legacy kibbutz-modal task list [uses them]" | Compact task-chip style used on the kibbutz-modal EMS section and `renderMyTasks()` | `prepModalEmsSection`, `renderMyTasks` (retired), `renderEmsTaskCard` | Kept for the modal task list regardless of page retirement | KEEP |
| R2 | `#ems-view` markup shell, `#emsConnectedPanel` header/buttons (index.html:453-532) | Page chrome (header, "+ משימה חדשה" button, disconnect button) | `showPage('ems')` | Chrome retired; "+ משימה חדשה" and "ניתוק" actions need a new home once the page is gone | GAP — see GAP list (disconnect/create-task entry points when there is no EMS page) |

## R3 — home "משימות חברה כלליות" block

| surface | function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|---|
| R3 | `.company-tasks` block: orders/info/guidelines lists (index.html:213-229) | Static-ish home-page block of 3 free-text lists (הזמנות/מידע/הנחיות) | `renderCompanyTasks()` on load | §2 internal tasks (`internal_tasks` with `kibbutz = null`), grouped under "חברה" in the list view | MOVE |
| R3 | `readCompanyTasksFromDOM()`, `loadCompanyTasks()`, `renderCompanyTasks()` (12-reports.js:44-72, 129) | Reads/writes the 3 lists to/from `SHEET_DATA.settings.companyTasks` + localStorage fallback | `openCompanyTasksModal`, `saveCompanyTasks`, called once on file load (line 129) | Replaced by `internal_tasks` CRUD (§2) | DROP (superseded, not migrated as code — data model changes) |
| R3 | `openCompanyTasksModal()` / `gatherCompanyTasksFromForm()` / `saveCompanyTasks()` (12-reports.js:74-126) | Edit modal for the 3 lists, saves to Supabase `settings.companyTasks` via the sheet-API write shim | `#companyTasksBtn` (index.html:216), `#companyTasksModal` (index.html:1169-1184) | Superseded by whatever internal-task create/edit UI ships for §2 | DROP |
| R3 | `buildCompanyTasksSection()` (12-reports.js:131-145) | Renders the company-tasks block as WhatsApp/mail text, appended to `buildMyTasksReport` | `buildMyTasksReport()` (R4, below) | Once `internal_tasks` exist, the "חברה" group in the list-view "שתף" text (R4's replacement) needs the same content | MOVE — must be re-derived from `internal_tasks` where `kibbutz IS NULL`, not from DOM |
| R3 | `#companyTasksModal` markup (index.html:1169-1184) | Modal shell (3 textareas) | `openCompanyTasksModal` | Retired with the block | DROP |

## R4 — "משימות באחריותי" report

| surface | function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|---|
| R4 | `CONTACTS` map (12-reports.js:3-11) | Per-person email/phone for mailto/wa.me links | `generateMyTasksReport` (email/whatsapp branches) | Needed by any "שתף" action that emails/WhatsApps a report | MOVE — carries into the "one שתף action" the R4 recommendation calls for |
| R4 | `REGION_ORDER` (12-reports.js:14-21) | North→south region ordering constant | Duplicates the identically-named `REGION_ORDER` already specified for Part G (spec §7b, "regions ordered by a fixed list `REGION_ORDER`") | Kibbutz card grouping (§7b) | KEEP/MOVE — same concept as §7b's list; verify at implementation time there is exactly **one** `REGION_ORDER` constant, not two diverging copies (flagged as a duplication risk, not a functional gap) |
| R4 | `isOwnerOf(task, person)` / `linesForPerson(text, person)` (12-reports.js:25-39) | Parses "- name" owner lines out of the (now-removed, per Part A) `status`/`expectedTask`/`task` free-text fields | `renderMyTasks()` (R1) only | These read fields that Part A removes entirely (`editStatus`/`editTask`/owners free text) — once that ships, this logic has no data source at all | DROP — dead the moment Part A ships; not carried into §7g (the list view sources tasks from EMS + `internal_tasks`, never free-text status lines) |
| R4 | `buildMyTasksReport(person)` (12-reports.js:150-183) | Builds the WhatsApp/mail text: person's open EMS tasks by site + company-tasks section | `generateMyTasksReport` | §7g: "keep one 'שתף' action on the list view (copies the same text)" | MOVE — logic re-targets `internal_tasks`-aware source; the report **format** (per-site grouping, header, footer link) MOVEs, the **data source** changes |
| R4 | `generateMyTasksReport(action)` (12-reports.js:185-218) | preview/copy/email/whatsapp actions | `#my-tasks-view` buttons (index.html:607-610) | Same MOVE as above | MOVE |

## R5 — "עובדים" page (`js/src/17-staff.js`, `#staff-view`)

| surface | function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|---|
| R5 | `canManageStaff()` (17-staff.js:10-13) | Gate: עידן or עמיחי | `showPage()` gate (02-init-attendance.js:38), `sigma.isAdmin()` bridge (00-bridge.js:99), `renderStaff()` | Reused as-is by `sigma.isAdmin` for other admin screens (סקירה, שימוש, ➕ קיבוץ) | KEEP — function itself must not be deleted; only the page it gates is retired |
| R5 | `staffSendMessage` / `staffFetchMessages` / `staffMarkRead` / `staffCheckMessages` / `staffSendMessageUI` (17-staff.js:21-44, 154-199) | Supabase `messages` table: leave-a-message-for-a-colleague + login-time unread popup | `#msgTo_<person>` inputs on the staff page; `staffCheckMessages()` fires unconditionally on every load (line 201, `setTimeout`, **not gated by the staff page being open**) | **Not mentioned anywhere in the redesign spec or R5's recommendation** ("its useful numbers... move into עמיחי's סקירה" only covers `staffStats`/`staffPipeline`, not messaging) | GAP — messaging is a real, independently-useful feature (login-time popup already fires app-wide) with no stated destination once the compose UI (`#staff-view`) is deleted |
| R5 | `staffStats(person)` (17-staff.js:46-66) | Per-person: task-category breakdown (reads `SHEET_DATA.tasks`/`parseTaskField` — a Part A removal target), visits count, attendance count, edits count, upcoming vacation/reserve days | `renderStaff()` only | R5: "useful numbers (visits/month, open tasks per person) move into עמיחי's סקירה" | MOVE — but the `cats`/`parseTaskField` breakdown depends on the free-text `status`/`task` categorization that Part A deletes; the visits/attendance/vacation counts survive, the task-category breakdown does not |
| R5 | `staffPipeline()` (17-staff.js:76-85) | Company-wide "כמה לקוחות פעילים/חדשים/שיווקי" from the `kibbutzim` table | `renderStaff()`'s ops-role card | Exactly a CEO-level KPI — belongs in עמיחי's סקירה (company-process spec §5/§8) | MOVE |
| R5 | `renderStaff()` (17-staff.js:87-152) | Renders one card per `STAFF_PEOPLE` (עידן/אביאם/ניתאי/מתניה) with role-specific stats + message box | `showPage('staff')` | Retired page itself | DROP (the render function); its per-role stat computations MOVE per rows above |
| R5 | `STAFF_PEOPLE`, `STAFF_ROLES` (17-staff.js:8, 70-75) | Person list + role titles for the page | `renderStaff`, `staffStats` | Needed wherever the per-person breakdown lands in סקירה | MOVE |
| R5 | `#staff-view` markup (index.html:632-636), `#navStaff` nav button (index.html:51) | Page shell + (already `display:none`) nav entry | `showPage()` | Retired | DROP |

## R6 — `kibbutz-stats.html`

| surface | function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|---|
| R6 | *(file not present in this worktree — see scope note above)* | Per spec: legacy standalone stats page | — | R6: "Retire after סקירה ships" | Unable to verify in this worktree — **confirm on `dev`/`main` before deleting**; this worktree's `sw.js` (line 7) precaches `./stats.html` (a *different* filename), not `kibbutz-stats.html` |
| R6 | `./stats.html` entry in `sw.js` `SHELL` (sw.js:7) | Precached as part of the app shell | Service-worker install step (`precache()`) | If `stats.html` is the same page as the spec's `kibbutz-stats.html` under a renamed path, removing the file without updating this line breaks `caches.addAll` (404) or leaves a dead precache entry; if it's a distinct file it's out of scope for R6 | GAP — a sweep task must confirm this filename before R6 executes and update `SHELL` accordingly |

## R7 — separate gaps-admin screen

Confirmed: no `#gaps`, "פערים בצוות" screen, or dedicated gaps-admin file exists anywhere in `index.html`/`js/src`/`app/src` in this worktree. Nothing to audit — matches the spec's own note that it "is not built yet." **Verdict: N/A (nothing to retire).**

## R8 — separate holidays admin list

Confirmed: no `company_holidays` admin UI, no "⋯ → חגים" list, and no `db/company_holidays.sql`/`db/holidays_seed.mjs` exist in this worktree (§7e's holiday table/seed script are still planned work, not built). Nothing to audit. **Verdict: N/A (nothing to retire).**

---

## Push deep-links (`js/src/22-push.js`) and `sw.js` — cross-cutting check

`22-push.js`'s `pushact` deep-link handler (lines 221-249) currently resolves only `approve`, `order`, `fillToday`,
`fillMissing` — **none of `#attendance`, `#inventory`, `#my-tasks-view`, `#ems-view`, `#staff-view` are used as
push targets today.** `sw.js`'s `notificationclick` handler (lines 93-99) opens whatever URL the payload carries;
it has no hardcoded knowledge of the retired views either. **Conclusion: retiring R1/R2/R5 breaks no existing push
deep link.** (The spec's planned `visitCron`/`#visit?kibbutz=` deep link is new work, not a migration concern.)

Additionally noted while reading `test-mytasks-filter.mjs` (root of the sibling repo `Sigmatec Operations App`,
not present in this worktree): that repo's copy of `renderMyTasks()` has a `myTasksPerson` "who am I viewing"
picker with admin override logic that this worktree's `14-calendar.js:renderMyTasks()` does **not** have — the
two repos' `14-calendar.js` have diverged. Flagged for awareness; not in scope to reconcile here since the task
is limited to this worktree.

---

## Summary counts

| Verdict | Count |
|---|---|
| MOVE | 16 |
| KEEP | 20 |
| GAP | 7 |
| DROP | 11 |
| N/A (R7, R8 — nothing built yet) | 2 surfaces |

(Counts are per row above; compound rows are counted once by their primary verdict.)

## GAP list — concrete recommendations

1. **📍 דוח ביקורים button** (`openVisitsReportModal()`, on `#my-tasks-view`) — no stated destination once the page is deleted. *Recommendation:* add it to the calendar list-view's `⋯` menu (§7g "Export/copy/mail actions... kept as a ⋯ menu") or to `viewerReportsHub`, since it already exists there for the viewer role.
2. **📊 פעילות היום button** (`openActivityModal()`, on `#my-tasks-view`) — same issue. *Recommendation:* move to the same list-view `⋯` menu, or to עידן's "היום שלי" landing (§7l) since it's a daily-activity feed.
3. **EMS login panel** (`#emsLoginPanel`, `emsDoLogin`/`emsVerifyOtp`/`emsResendOtp`/OTP UI) and **"+ משימה חדשה" / "ניתוק" buttons** on `#ems-view`'s connected header — the spec retires the whole `#ems-view` page but never names a replacement surface for signing in/out of EMS or for a global "create task" entry point outside a kibbutz context. *Recommendation:* fold the login panel into the existing `emsLoginGate`/`emsReloginModal` flow (already used for forced re-auth, `12-reports.js:259-283`) so there is one universal EMS-connect surface; put an unscoped "➕ משימה חדשה" into Ctrl+K's action list (§7k.1 already lists `➕ קיבוץ`/`📥 ייבוא` as precedent) and "ניתוק EMS" into ⚙️ הגדרות → EMS connection status (§7h already plans an "EMS status/connect" row in the header user-chip menu — extend it with disconnect).
4. **Staff messaging** (`staffSendMessage`/`staffFetchMessages`/`staffCheckMessages` login-time popup) — a live, independently-valuable feature with zero mention in either spec. *Recommendation:* keep the Supabase `messages` table and the login-time unread popup exactly as-is (it doesn't depend on `#staff-view` markup — `staffCheckMessages()` already runs unconditionally on every load); relocate only the *compose* UI (currently `#msgTo_<person>` inputs on the staff page) into עמיחי's/עידן's סקירה admin view or into ⚙️ הגדרות → האזור האישי, so admins can still leave a message without the retired page.
5. **`kibbutz-stats.html` vs `sw.js`'s precached `./stats.html`** — filename mismatch between the spec's R6 target and what this worktree's service worker actually ships. *Recommendation:* before deleting anything, diff `stats.html` against the spec's description of `kibbutz-stats.html` on `dev`/`main` to confirm they're the same page (possibly renamed mid-branch) and update the `SHELL` precache list in the same commit that removes the file, or the SW install will either 404 or leave a dead cache entry.
6. **`staffStats()`'s task-category breakdown** (`cats.priority/done/pending/new_client` via `parseTaskField`) — R5 says the "useful numbers... move into סקירה," but this specific number depends on the free-text `status`/`task` field categorization that Part A of the redesign spec deletes outright. *Recommendation:* explicitly drop this one sub-metric (call it out in the Part A removal PR) rather than assume it "moves" with the rest of `staffStats`.
7. **`REGION_ORDER` duplication risk** — `12-reports.js:14-21` already defines a `REGION_ORDER` constant for report grouping, and Part G (spec §7b) plans a *second*, identically-named ordering constant for card grouping by region. *Recommendation:* when Part G ships, make it import/reuse `12-reports.js`'s existing `REGION_ORDER` (or hoist it to a shared constants module) instead of hand-writing a second list that can drift out of sync.

## Shared functions that must survive (defined inside a "retired" module, used elsewhere)

| Function | Currently defined in | Move to (recommended file) | Why it must not be deleted |
|---|---|---|---|
| `getEmsSites()` | `js/src/14-calendar.js` | `js/src/13-ems.js` (EMS cache/session infra file) | Used by the bridge (`sigma.getEmsSites`), `createEmsTaskForKibbutz`, `emsFillSiteAndAssignee`, and Part G's EMS verification chain (spec §7b) |
| `emsSiteIdForKibbutz(name)` / `emsNormName(s)` | `js/src/14-calendar.js` | `js/src/13-ems.js` | Used by the bridge (`sigma.emsSiteIdForKibbutz`, `sigma.kibbutzHasSite`), `emsSendItem('createTask')` in 13-ems.js itself, `createEmsTaskForKibbutz` |
| `getEmsUsers()` / `emsUserName(u)` | `js/src/14-calendar.js` | `js/src/13-ems.js` | Used by `emsFillSiteAndAssignee`, `renderEmsTaskCard`, `emsSendItem('createTask')`, `renderEmsDetail` — all outside the retired page |
| `emsEsc` / `emsToast` / `emsTokenRole` | `js/src/14-calendar.js` | `js/src/13-ems.js` | Generic escape/toast/JWT helpers used across 13-ems.js and 14-calendar.js's surviving task-modal code |
| `EMS_STATUS` / `EMS_PRIORITY` / `EMS_TYPE` / `EMS_CLOSED` / `emsStatusLabel` / `emsLabels()` | `js/src/14-calendar.js` | `js/src/13-ems.js` (or a new small labels file loaded before both) | Single source of truth for React (`app/src/lib/emsTasks.ts` via `sigma.emsLabels()`), pinned by `test-ems-labels.mjs` |
| `emsCreateTaskModal`, `saveEmsTask`, `emsEditTask`, `emsFillSiteAndAssignee`, `openEmsTask`, `renderEmsDetail`, `loadEmsComments`, `addEmsComment`, `changeEmsStatus`, `emsCalendarLink`, `emsEnrichMeters`, `emsFetchMeter`, `emsLinkIds`, `emsLinkLabel`, `emsMeterNumber`, `emsMeterIcon` | `js/src/14-calendar.js` | `js/src/13-ems.js` | Explicitly named survivors in R2 itself ("keep only the task detail/create/edit modals") |
| `EMS_URL_KEY`/`TOKEN_KEY`/session helpers, `emsProxyCall`, `emsApi`, `emsRequireLogin`, `emsDisconnect` | `js/src/12-reports.js` | Stays in `12-reports.js`, or hoist to `13-ems.js` for cohesion (12-reports.js is not itself retired, so this is a cleanliness suggestion, not a requirement) | Core EMS transport layer used everywhere |
| `canManageStaff()` | `js/src/17-staff.js` (retired module) | `js/src/00-bridge.js` or a shared roles file | Bridge's `sigma.isAdmin()` calls it by name (`00-bridge.js:99,83`); `showPage()`'s gate calls it too (`02-init-attendance.js:38`) — both survive R5 |
| `staffSendMessage`, `staffFetchMessages`, `staffMarkRead`, `staffCheckMessages`, `staffSendMessageUI` | `js/src/17-staff.js` (retired module) | New small module, e.g. `js/src/17-messages.js` | Runs app-wide via an unconditional `setTimeout` on every load (17-staff.js:201), independent of `#staff-view` — see GAP #4 |
| `.card-ems-task` / `.ems-badge` / `.t-title` / `.t-dot` CSS | `css/app.css` (in the block otherwise dedicated to the retired EMS page) | No file move needed — just do not delete these selectors when sweeping `.ems-task-card`/`.ems-filter-bar` | Used by the surviving kibbutz-modal EMS section (`prepModalEmsSection`) — already flagged in an existing code comment at app.css:1173 |
