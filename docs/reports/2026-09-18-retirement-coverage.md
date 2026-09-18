# Retirement coverage audit — 2026-09-18

Scope: verify every user-facing function/behavior of the pages/blocks slated for retirement in
`docs/superpowers/specs/2026-09-17-kibbutz-cards-redesign-design.md` §7m has a home in the new design,
or is explicitly flagged as a gap. Read-only audit; no code changed.

Note found in passing (not a retirement item, flag separately): `index.html:157` links to
`href="kibbutz-stats.html"` but the actual file in this worktree is `stats.html` (also the name used
in `sw.js`'s `SHELL` precache list). That link is currently broken regardless of the retirement.

---

## R1 — standalone "משימות" page (`#my-tasks-view`, `index.html:592-615`)

| function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|
| `renderMyTasks()` (`14-calendar.js:115-160`) | Builds the grouped-by-kibbutz list: my open EMS tasks (assignee match or "owner of kibbutz") + status/expectedTask lines ending "- me", each row clickable to open the kibbutz or the EMS task | called from `showPage('my-tasks')` page-show wiring (grep target for `showPage('my-tasks'` did not resolve to a distinct call site — page switch is generic; confirm in `01-data.js`/`showPage`) | §7g "list view inside the calendar island" | MOVE — logic (grouping, overdue-first, EMS+internal merge) is explicitly the content of the new list view |
| `openKibbutzByName(name)` (`14-calendar.js:2-6`) | Opens the kibbutz card modal by `data-name`, used from a task row | called by `renderMyTasks` rows and `renderMyTasksReport`-adjacent UI | Card/list-view "open kibbutz" action | MOVE — trivial helper, re-implemented or reused by the React list view |
| `#myTasksPerson` select + "📋 דוח משימות לפי אחראי" bar (`index.html:596-613`) | Person picker feeding `generateMyTasksReport` | R4 report actions | R4 (below) | Retires with R4, see R4 rows |
| **"📍 דוח ביקורים" button** → `openVisitsReportModal()` (`09-visits.js:506`) | Opens the existing visits-PDF/Excel report modal | Lives inside `#my-tasks-view`'s action bar, but the function itself is defined in `09-visits.js`, not the retired file, and is also reachable from `#viewerReportsHub` | `#viewerReportsHub` (§6, "Viewer / reports user" — visits PDF/Excel already listed there) | **KEEP** — function is NOT part of the retired module; only its entry point on this page goes away. Confirm the button is re-exposed somewhere reachable for non-viewer roles too (it currently sits only on this page for non-viewer users) |
| **"📊 פעילות היום" button** → `openActivityModal()` (`10-activity.js:6`) | Opens the daily-activity modal | Same as above — defined in `10-activity.js`, only its launcher lives on this retired page | Not explicitly named in §7f/§7g/§7l | **GAP** — no other launcher for `openActivityModal()` was found in `index.html`/`js/src`; if this page is deleted verbatim the button (and only reachable entry point for non-viewer roles) disappears |
| `#myTasksList` container + inline HTML the function writes (dot colors, overdue "⏰" flag, EMS badge classes) | Visual language (overdue badge, `.card-ems-task`) | shared CSS classes with the card widget | reused as-is by the card/list-view since the CSS classes (`card-ems-task`, `ems-badge`, `t-dot`) are shared, not owned by this page | MOVE — no new CSS needed |

## R2 — legacy "📋 EMS" page (`#ems-view`, `index.html:452-532`)

Per spec: retire the list/filter/search/load-more UI; KEEP the task detail/create/edit modals and their functions.

| function (file:line) | what it does | used by (call sites outside `#ems-view`) | new home | verdict |
|---|---|---|---|---|
| `loadEmsTasks(append)` / `_emsPage`, `_emsTasksTotal`, `debounceEmsSearch()` (`14-calendar.js:384-429`) | Paginated task list fetch bound to `#emsFilterStatus/#emsFilterPriority/#emsFilterSite/#emsSearch/#emsMyTasksOnly/#emsOverdueOnly` and `#emsTasksList`/`#emsLoadMoreWrap` DOM ids | `renderEmsPage()`, the filter `onchange` handlers in the retired markup, `saveEmsTask`/`changeEmsStatus` call it to refresh the list when `#ems-view` is visible | §7g/§7f "list view" (its filters are supposed to live on in the calendar list view per R2's own recommendation) | MOVE — but note: `loadEmsTasks` is tightly coupled to specific DOM ids that live IN the retired markup; the list-view reimplementation needs its own version, this exact function cannot be "kept" once the DOM ids are gone |
| `renderEmsTaskCard(t)` (`14-calendar.js:448-469`) | HTML builder for one task row, `onclick="openEmsTask(id)"` | `loadEmsTasks` | list-view row renderer | MOVE — visual pattern reused |
| `renderEmsLoadMore()` (`14-calendar.js:471-480`) | "טען עוד" pager | `loadEmsTasks` | list-view pagination | MOVE — same load-more pattern |
| `emsPopulateSiteFilter()` (`14-calendar.js:372-381`) | Fills the `#emsFilterSite` dropdown | `renderEmsPage()` | list-view site filter | MOVE |
| `renderEmsPage()` (`14-calendar.js:777-790`) | Page-show hook: toggles login/connected panels, arms expiry timer, populates filters, loads tasks, `emsOnConnected()` | called by the generic `showPage('ems')` switch | this exact function retires with the page; its ONE non-list responsibility — `scheduleEmsExpiry()` + `emsOnConnected()` (queue flush + cache sync once per session) — must fire from SOMEWHERE ELSE once the page is gone | **GAP** — `scheduleEmsExpiry()`/`emsOnConnected()` currently only run (a) after login (`emsDoLogin`/`emsVerifyOtp`, safe, unaffected) and (b) every time `#ems-view` is shown (this call site disappears). If no other page start-up calls `emsOnConnected()` once per session, the queue-flush-on-reconnect and the "keep cache fresh" behavior silently stops for anyone who never visits EMS-labelled UI |
| `emsLoginPanel` / `emsDoLogin()`, `emsVerifyOtp()`, `emsResendOtp()`, `emsDisconnect()` (`14-calendar.js` various, ~L241-327, `12-reports.js` `emsRequireLogin`) | The whole EMS sign-in flow (URL/email/password, 2FA/OTP, disconnect) | `emsRequireLogin()`'s "🔑 התחבר מחדש" button routes to `#emsLoginGate` first, `showPage('ems')` as **fallback** only | still needed somewhere reachable — spec doesn't name a EMS-connect surface post-retirement other than the universal `#emsLoginGate` | **KEEP as fallback path**, but flag: `emsRequireLogin()`'s fallback (`else if (typeof showPage === 'function') showPage('ems')`) breaks if `#ems-view`/`'ems'` page id is deleted outright — either keep a minimal `#ems-view` shell hosting only the login panel, or repoint this fallback |
| `emsCreateTaskModal`, `saveEmsTask`, `emsEditTask`, `openEmsTask`, `renderEmsDetail`, `changeEmsStatus`, `loadEmsComments`, `addEmsComment`, `emsFillSiteAndAssignee`, `emsEnrichMeters`/`emsFetchMeter`/`emsLinkIds`/`emsLinkLabel`/`emsMeterNumber`/`emsMeterIcon`, `emsCalendarLink`, `emsWriteOrQueue` (queue sync, referenced not shown but called throughout), `emsAfterWrite` | Full task detail/create/edit modal + comments + meter enrichment + cache resync | called from cards (`emsModalTaskClick`, `prepModalEmsSection`), the visit form (`pushVisitToEms`), the calendar day panel plan, and directly from card widgets | Explicitly named KEEP in the retirement spec itself | **KEEP** — confirmed: none of these live inside the deleted list markup; they are standalone and already reused across the app |
| `emsPage`'s `+ משימה חדשה` header button (`index.html:501`) `onclick="emsCreateTaskModal()"` | Entry point to create a task with no site prefilled | only launcher independent of a specific kibbutz | §7f "➕ on a day" flow creates via `emsCreateTaskModal` too (date-prefilled), and cards have `createEmsTaskForKibbutz()` | MOVE — a kibbutz-agnostic "new EMS task" entry point should still exist somewhere (Ctrl+K action list §7k.1 lists "➕ קיבוץ"/"📥 ייבוא"/"📝 יומן היום" but not a bare "new EMS task"); low-severity **GAP** — recommend adding to Ctrl+K's actions if a kibbutz-agnostic task creation is still wanted, otherwise DROP as "always create from a kibbutz/day" is the new pattern |
| `getEmsSites`, `emsSiteIdForKibbutz`, `emsNormName`, `getEmsUsers`, `emsUserName`, `emsEsc`, `emsToast`, `emsTokenRole`, `emsApi`, `emsProxyCall`, `EMS_STATUS/EMS_PRIORITY/EMS_TYPE/EMS_CLOSED/EMS_PRIORITY_DOT`, `emsStatusLabel`, `emsLabels()` (exposed as `window.emsLabels`, consumed by the React card widget) | Core EMS client/cache/label constants | Used by **11 other files**: `00-bridge.js`, `07-orders.js`, `20-delivery-cert.js`, `13-ems.js`, `10-activity.js`, `02-init-attendance.js`, `11-search-login.js`, `12-reports.js`, `17-staff.js`, `18-dev-tasks.js`, plus the React bridge | N/A — these are shared infrastructure, physically defined inside `14-calendar.js` (a file that survives) | **KEEP — flagged as "must not move with any retirement."** They are not part of `#ems-view`'s markup/list logic at all; they only happen to live in the same source file. No action needed as long as whoever deletes R1/R2 code deletes only the list/page-specific functions, not this block. (See "shared functions that must survive" below.) |

## R3 — home-page "משימות חברה כלליות" block (`index.html:213-231`, modal `:1171`, `12-reports.js:41-129`)

| function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|
| `readCompanyTasksFromDOM()`, `loadCompanyTasks()`, `renderCompanyTasks()` (`12-reports.js:44-72`) | Read/render the 3 fixed groups (🛒 הזמנות / ℹ️ מידע / 📋 הנחיות) from `SHEET_DATA.settings.companyTasks` or `localStorage` | called on load (`renderCompanyTasks()` fires unconditionally at file scope, `12-reports.js:129`) and by `saveCompanyTasks()` | §2 of company-process spec: "company task = an internal task with `kibbutz = null`", shown under a "חברה" group in the list view | MOVE, but **data-model change**: current data is 3 free-text bullet groups (not owner/state/source), while `internal_tasks` rows are structured (title/description/owner/due/state). Needs an explicit one-time migration decision: split each existing bullet into an `internal_tasks` row with `kibbutz=null`, or accept the 3 categories are dropped and staff re-enter as tasks. **Flag for the implementer**, not a hard gap, but not automatic either. |
| `openCompanyTasksModal()`, `gatherCompanyTasksFromForm()`, `saveCompanyTasks()` (`12-reports.js:74-126`) | Edit UI (3 textareas) + optimistic local save + Supabase `settings.companyTasks` write via the sheet API write shim | `#companyTasksBtn` "✏️ ערוך" (`index.html:216`) | replaced by the internal-task create UI (kibbutz field left empty) | DROP the modal itself once R3 merges into internal tasks (per spec's own recommendation) — no distinct gap, this *is* the retirement |
| `buildCompanyTasksSection()` (`12-reports.js:131-145`) | Appends a "📌 משימות חברה כלליות" section into the WhatsApp/email/copy report text | `buildMyTasksReport()` (R4) | R4's replacement — the "חברה" group in the list view + its own "שתף" action | MOVE — content source changes from DOM scrape to `internal_tasks` query, but the concept (append company items to the shareable report) is exactly what §7g/R4 describe |
| `COMPANY_TASKS_KEY` localStorage fallback | Offline safety net for the free-text bullets | `saveCompanyTasks()` | N/A once the block is a table-backed internal task | DROP — internal_tasks presumably gets its own offline/optimistic-write handling; not this module's concern |

## R4 — "משימות באחריותי" report (`12-reports.js:150-218`)

| function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|
| `buildMyTasksReport(person)` (`12-reports.js:150-183`) | Builds a plain-text report: person's open EMS tasks grouped by site + the company-tasks section appended | `generateMyTasksReport` | §7g "one 'שתף' action on the list view (copies the same text)" | MOVE — content logic (group by site, status label, due date) is exactly what the list view already needs to render; the text-builder can be kept as the "שתף"/copy payload generator |
| `generateMyTasksReport(action)` — `'preview'/'copy'/'email'/'whatsapp'` (`12-reports.js:185-218`) | 4 export actions off the same report text, using `CONTACTS` map (email/phone per person) | the 4 buttons in `#my-tasks-view`'s action bar | §7g says only **copies** the text via one "שתף" action | **partial GAP** — spec explicitly narrows 4 export channels (preview/copy/email/WhatsApp) down to "one שתף action". If email/WhatsApp send-to-a-*different*-person's-report (the whole point of `#myTasksPerson` picker — a manager pulling someone else's report) is still wanted, that's not covered; the new list view is implicitly "my own tasks" only. **Recommendation:** confirm with עידן whether the manager use case ("show me אבצן's open tasks and text them to him") is intentionally dropped or needs a small admin affordance (e.g. in עמיחי's סקירה / gaps view, where per-person data already surfaces per §7h/R7). Until confirmed, treat as **GAP**. |
| `CONTACTS` map (`12-reports.js:3-11`) | Name → email/phone for the export actions | `generateMyTasksReport` | wherever WhatsApp/email is still wired (e.g. `attNagDay` in `22-push.js` uses `push-send`, not this map) | KEEP the map's *data* (phone numbers) if any manager-report feature survives per the GAP above; otherwise DROP with R4 |

## R5 — "עובדים" page (`#staff-view`, `js/src/17-staff.js`)

| function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|
| `canManageStaff()` (`17-staff.js:10-13`) | Role gate: עידן or עמיחי | `renderStaff()` | role gating pattern reused by §7l's סקירה (CEO-only) and §7h gaps admin | MOVE — pattern (not code) reused; the exact function likely retires with the page |
| `staffStats(person)` (`17-staff.js:46-66`) | Per-person: task categories from legacy `data.tasks`/`owners`, visit count (30-day), attendance count, edit count, upcoming vacation/reserve dates, progress % | `renderStaff()` | §7l "gaps per person (admin view)" + §5's health table use *different* underlying data (per-kibbutz health, not per-person load); §7m R5 says "useful numbers (visits/month, open tasks per person) move into עמיחי's סקירה" | **MOVE, but not automatic** — `staffStats` reads the legacy `owners`/`task` string-parsing model (`parseTaskField`, "- name" line convention) which §2 of the redesign spec explicitly removes (`editStatus`/`editTask`/`owners` are being deleted in Part A). The visits/attendance/edit counts are portable; the "cats" task-category breakdown is NOT (it depends on data being deleted). **Flag: the per-person load numbers promised to move into סקירה must be re-derived from EMS tasks + internal_tasks + visits, not ported as-is from `staffStats`.** |
| `staffPipeline()` (`17-staff.js:78-85`) | Company-wide קיבוצים pipeline % (live/new/marketing) off `window.KIBBUTZIM` | `renderStaff()`'s "ops" (עידן) card | §7l CEO סקירה's "revenue mix"/health table area does not explicitly include a pipeline %; §2's card counts (section headers) cover this implicitly | MOVE (trivial to recompute; the `KIBBUTZIM` table read already matches the redesigned data model in §7b) — low-risk, but **not explicitly named** in §5/§7l; recommend adding as a line item in סקירה since עמיחי will lose this view |
| `staffSendMessage`, `staffFetchMessages`, `staffMarkRead`, `staffCheckMessages`, `staffSendMessageUI` (`17-staff.js:21-45, 154-201`) — the `messages` table leave-a-note-for-next-login feature | Manager leaves a free-text note for an employee, shown as a modal popup on their next login (`setTimeout(..., 2500)` at file scope, runs **globally on every load**, not just on the staff page) | Called from `#staff-view`'s per-person message box; **but `staffCheckMessages()` self-registers at module load and fires for EVERY user session**, independent of the page | **not covered anywhere in the redesign spec** | **GAP** — this is NOT page-gated functionality; it is a standing app-wide feature (any manager message left in `#staff-view` pops up for the recipient on their next login, everywhere in the app). Deleting `17-staff.js` wholesale removes both the send UI AND the app-wide receive/popup mechanism. No mention of a replacement ("leave a message for an employee") anywhere in §7h/§7l/company-process spec. Recommend either keeping this feature (move the send UI into עמיחי's סקירה or a person's row in gaps admin) or an explicit decision to drop it. |
| `STAFF_PEOPLE`, `STAFF_ROLES` constants (`17-staff.js:8, 70-75`) | Person list + role/title labels for the page | `renderStaff()` | role/person lists exist elsewhere (`CONTACTS` in `12-reports.js`, `ATT_PEOPLE` in the bridge) — redundant but not identical (titles like "ראש צוות שטח" only exist here) | MOVE data (titles) if the health/סקירה page wants to show job titles; otherwise DROP as decorative |

## R6 — `stats.html` (linked in `index.html:157` as `kibbutz-stats.html`; actual filename `stats.html`; listed in `sw.js` `SHELL` precache)

Standalone page, own `<script>` block, reads `SHEET_API`/Supabase snapshot directly — no shared code with `js/src/*`.

| function (file:line) | what it does | used by | new home | verdict |
|---|---|---|---|---|
| `parseTaskField`, `getCategory`, `getEngagementType` (`stats.html:346-402`) | Parses the legacy free-text `task`/status fields into category/engagement stats | `render(data)` | Depends entirely on the legacy `tasks.task`/`owners` string model that Part A of the redesign explicitly deletes | DROP — this parsing has no target once the source fields are gone |
| Category/region/owner-load pie & bar charts (`render()` body, `stats.html:457-644` incl. `buildRegionOptions`, `setPeriod`, `setRegion`, `applyFilters`, `inPeriod`) | "חלוקה לפי קטגוריית סטטוס / אזור / שלב הקמה", "עומס לפי אחראי", period/region filters | none outside this file | §7l CEO סקירה: "health table sorted red→green", "gaps per person" | **MOVE (conceptually)** — סקירה is the named replacement, but it computes from different tables (`kibbutz_health`, EMS tasks) not the legacy status parsing; nothing here ports literally |
| Visitor/visit-month/product charts (`visitorChart`, `visitMonthChart`, `productChart`, `topVisitedList`) | Visit analytics: visits per visitor, per month, top products distributed, most-visited kibbutzim | none outside this file | not explicitly named in §5/§7l/§7j (usage analytics §7j tracks *app usage events*, not field visit volume) | **GAP** — no named replacement for "visits by visitor / by month" or "top distributed products" or "most-visited kibbutzim" charts. §6's "reports viewer" (visits PDF/Excel) exposes raw data but not these aggregate charts. Recommend adding these as a widget in סקירה or the (future) hours/equipment "revenue mix" per §7l, or explicitly accept the loss. |
| "⏸️ קיבוצים שלא עודכנו ב-14 הימים האחרונים" (stale-kibbutz list, `stats.html:248`) | Flags kibbutzim with no recent status edit | none outside this file | close cousin of §7h "gaps" (though gaps is per-person, this is per-kibbutz staleness) | **GAP** — no direct equivalent found; "no summary filed" gaps in §7h are about visits, not about "no meeting-note/status update in N days" per kibbutz. Recommend folding into סקירה's health signals (§5, "בעיות חוזרות"/recency) or accepting the drop since meeting bullets (§3) now make staleness visually obvious on the card itself ("no bullet since date X"). |
| `drawChart()` (`stats.html:645`) | Generic Canvas chart primitive (no chart.js dependency — hand-rolled) | all the above | §7j/§7l call for shadcn Charts/Recharts/Tremor instead | DROP — infra choice changes, not portable, not meant to be |
| Item-distribution table "מי קיבל מה" (`stats.html:283`) | Per-kibbutz equipment distribution history | none outside this file | §6 "stock/kibbutz Excel" (viewer reports hub) covers raw export; no chart/summary view named | GAP-adjacent, low severity — raw data is exportable elsewhere (viewer hub), only the summarized/visual view disappears. Treat as **DROP** (acceptable, data still reachable via export) unless עמיחי wants it in סקירה. |

## R7 — separate gaps-admin screen (not built)

Nothing to retire in code — confirmed no `#gaps-view` / `gapsAdmin` / similar markup or function exists anywhere in `index.html` or `js/src`. §7h/§7m R7 correctly describe this as "not built yet"; no action needed, no GAP (there is nothing to lose).

## R8 — separate holidays admin list (not built)

Same as R7: no `#holidays-view`, `company_holidays` UI, or "⋯ → חגים" markup/handler exists yet in this codebase (§7e describes it as a planned admin list, not shipped). No GAP.

---

## Push deep links (`js/src/22-push.js:222-249`) — `pushact` targets

Current handled actions: `approve` (orders), `order` → `showPage('inventory')`, `fillToday`/`fillMissing` →
`showPage('attendance')` + `openVisitQuick()`. **None of the current push deep links target `#ems-view`,
`#my-tasks-view`, or `#staff-view`** — so no `pushact` value breaks from these retirements today. However, the
redesign spec's own new pushes (§5.2 `visitCron` action `✍️ כתוב סיכום` → `#visit?kibbutz=<name>&person=<me>`) are
**not yet wired into this handler** — that's a build task (Task 5), not a retirement gap, noted for completeness.

## Tests

No `test-*.mjs` in this repo exercises `#my-tasks-view`, `#ems-view`'s list/filter code, or `17-staff.js`
(`test-ems-createtask.mjs`, `test-ems-card.mjs`, `test-ems-labels.mjs` all test the create-task modal / card widget /
label constants — all KEEP-side code, unaffected by R1/R2/R5 retirement). No test references `stats.html`. So no
test suite needs updating to retire R1/R2/R5/R6 — but also **no regression safety net exists today** for the
KEEP-side EMS modal code once the surrounding list page is deleted; recommend a smoke test that opens
`emsCreateTaskModal`/`openEmsTask` without `#ems-view` present.

---

## Summary counts

| Verdict | Count |
|---|---|
| MOVE | 17 |
| KEEP | 4 |
| GAP | 8 |
| DROP | 8 |

(Counts are per logical row above, not per individual function name inside a grouped row.)

## GAP list — one-liner recommendations

1. **`openActivityModal()` launcher (R1)** — only entry point is inside `#my-tasks-view`; add a launcher elsewhere (bottom nav ⋯, or CEO סקירה) before deleting the page.
2. **`emsOnConnected()`/`scheduleEmsExpiry()` no longer triggered on page-show (R2)** — currently fire only via `renderEmsPage()`; wire them into a still-surviving startup/page-show hook (e.g. app boot or the card grid's page-show) so queue-flush and session-expiry still run once `#ems-view` is gone.
3. **`emsRequireLogin()`'s fallback `showPage('ems')` (R2)** — breaks if `#ems-view`/`'ems'` page id is deleted; keep a minimal EMS-login-only shell or repoint the fallback to `#emsLoginGate`.
4. **Kibbutz-agnostic "new EMS task" entry point (R2)** — the header "+ משימה חדשה" button has no equivalent outside a kibbutz/day context; add to Ctrl+K's action list or confirm it's intentionally dropped.
5. **Manager pulling another person's task report via email/WhatsApp (R4)** — `generateMyTasksReport`'s per-person picker + email/WhatsApp actions narrow to "my own tasks, copy only" in §7g; confirm with עידן whether the "text X's tasks to X" manager flow is intentionally dropped.
6. **"Leave a message for an employee" + login-time popup (R5, `staffCheckMessages`/`staffSendMessage`)** — an app-wide always-on feature, not page-gated; no replacement named anywhere; decide keep (move UI into סקירה/gaps admin) or explicitly drop.
7. **Per-person task-category load numbers (R5, `staffStats` cats)** — depend on the legacy `owners`/status string model being deleted in Part A; the "open tasks per person" promised in סקירה must be re-derived from EMS + internal_tasks, not ported.
8. **Visit-analytics charts + stale-kibbutz list (R6, `stats.html`)** — "visits by visitor/month", "top distributed products", "most-visited kibbutzim", "not updated in 14 days" have no named replacement in §5/§7l; fold into סקירה's health signals or accept the loss explicitly.

## Shared functions that must survive (defined inside a retired-adjacent module, used elsewhere)

| Function(s) | Currently defined in | Used by | Action |
|---|---|---|---|
| `getEmsSites`, `emsSiteIdForKibbutz`, `emsNormName`, `getEmsUsers`, `emsUserName`, `emsApi`, `emsProxyCall`, `emsEsc`, `emsToast`, `emsTokenRole`, `EMS_STATUS`/`EMS_PRIORITY`/`EMS_TYPE`/`EMS_CLOSED`, `emsStatusLabel`, `emsLabels()` | `14-calendar.js` (same file as the retired `renderMyTasks`/EMS-list code, but NOT part of it) | 11 files: `00-bridge.js`, `07-orders.js`, `20-delivery-cert.js`, `13-ems.js`, `10-activity.js`, `02-init-attendance.js`, `11-search-login.js`, `12-reports.js`, `17-staff.js`, `18-dev-tasks.js`, plus the React bridge (`window.emsLabels`) | Do not delete with R1/R2; if `14-calendar.js` is reorganized, extract this block into its own module (e.g. `13-ems.js` or a new `ems-core.js`) so its survival is structural, not incidental |
| `emsCreateTaskModal`, `saveEmsTask`, `emsEditTask`, `openEmsTask`, `renderEmsDetail`, `changeEmsStatus`, `loadEmsComments`, `addEmsComment`, `emsFillSiteAndAssignee`, `emsEnrichMeters` family, `emsCalendarLink`, `emsAfterWrite`, `createEmsTaskForKibbutz`, `emsModalTaskClick`, `prepModalEmsSection` | `14-calendar.js` | Cards (`prepModalEmsSection`), visit form (`pushVisitToEms`), calendar day-panel scheduling (§7f) | Explicitly named KEEP already; same recommendation — extract into a dedicated file to make the boundary explicit for whoever deletes the list-page code |
| `emsWriteOrQueue` (offline queue + sync) | referenced throughout `14-calendar.js` and `09-visits.js` but not shown defined in the read excerpts — locate before deletion | comments, status changes, visit→EMS push | KEEP — confirm its definition site is not inside anything slated for deletion |
| `openVisitsReportModal` (`09-visits.js`), `openActivityModal` (`10-activity.js`) | Their own files (not retired), only their **launch buttons** live inside `#my-tasks-view` | R1's page | Re-home the two buttons before deleting the page markup |
| `staffPipeline()` (`17-staff.js`) | Reads `window.KIBBUTZIM`, matches the new data model | none yet outside `17-staff.js` | Port into סקירה per R5's own recommendation, don't let it die with the file |

Report path: `C:\Users\idann\Projects\SigmatecOps-wt-cards\docs\reports\2026-09-18-retirement-coverage.md`
