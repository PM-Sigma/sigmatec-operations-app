# Modules — function reference

Files in `js/src/`, concatenated by `build.mjs` into `js/app.js` (numeric-prefix order).
One shared global scope → functions call each other by bare name; many are `window.*` for
inline `onclick=`. **Constants/flags are listed by name only** (no secret values).

---

### `01-data.js` — Core data layer: backend routing (Supabase / mock), site map, card render/enrich, steppers, filters
- `renderLastUpdated(iso)` — paint "last updated" header
- `maxLastModified(data)` — newest task timestamp
- `setFilter(filter, btn)` / `applyFilters()` — category + search filtering
- `toggleCompactMode()` — toggle mobile compact layout
- `toggleSection(header)` — collapse a section
- `copyLink()` — copy page URL
- `closeModal(e)` — close kibbutz edit modal
- `injectCustomerCodes()` — add #code badges to cards
- `injectSteppers()` — render the 14-step setup progress per card
- `kibbutzSiteIds(name)` — card name → EMS site UUID(s)
- `stripTestData(data)` — drop leftover test rows
- `fetchSheetData()` — GET snapshot from backend
- `setSourceIndicator(state)` — online/offline data-source pill
- `parseTaskField(str)` / `serializeTaskField(...)` — encode/decode the `task` field (`[PROC_DONE] | step=N | note= | cat= | type=`)
- `moveCardToCategory(card, category)` — relocate card DOM
- `lastUpdateText(task)` — "updated by X · time"
- `enrichCardsWithSheet(data)` — merge DB data into cards (status, owners, region, EMS widgets)
- `toggleProcedure(btn)` — flip PROC_DONE flag
- `renderPotentials(data)` / `filterPotentials()` — potential-clients list
- **Flags/consts:** `USE_SUPABASE` (`?sb=0` disables), `SB_URL`, `SB_ANON` (public), `USE_SB_BRIDGE`, `SHEET_API` (Apps Script /exec), `MOCK_MODE`, `STEPS`/`TOTAL_STEPS`(14), `KIBBUTZ_SITE_MAP`, `CATEGORIES`, `ENGAGEMENT_TYPES`, `CUSTOMER_CODES`. Monkey-patches `window.fetch` (mock + Supabase router); leaves `ems/transcribe/parseRequest` on Apps Script. Exposes `window._sbToken`/`_sbTokenExp`/`SHEET_DATA`/`__MOCK`.

### `02-init-attendance.js` — Page nav, inventory shell, attendance reminder + quick FAB
- `switchTab(tabName)` — modal tab switch
- `showPage(page)` — route kibbutz/inventory/attendance/ems/mytasks/calendar (perm-gated)
- `personMissingDays(person)` — workdays with no log
- `maybeShowAttendanceReminder()` — missing-day popup (Aviam/Nitai)
- `openVisitQuick()` / `vqSetType(type)` / `visitQuickGo()` — quick visit/attendance FAB
- `invShowTab(tab)` / `renderInventory()` — inventory sub-tabs + render
- **Consts:** `INV_LOCATIONS`, `STOCK_HOLDERS`, `DEFECTIVE_LOCATION`('תקול'), `ORDER_STATUSES`, `ATT_REMINDER_FLOOR`

### `03-requirements.js` — Customer requirements (דרישות) CRUD
- `invRenderRequirements()` — requirements table
- `populateReqKibbutzDropdown()` / `renderReqItems()` / `addRequirementItemRow()` — form
- `invNewRequirement()` / `invEditRequirement(id)` / `invSaveRequirement(btn)` — create/edit/save
- `quickReqStatus(id, status, btn)` — inline status change
- **Const:** `REQ_STATUSES`

### `04-attendance-daily.js` — Daily attendance + monthly report (Aviam/Nitai)
- `setAviamDayType(type)` — pick day type
- `saveAttendance(btn)` — POST attendance row
- `changeAttendanceMonth(delta)` / `renderAttendanceReport()` — month nav + report
- `mergeAttendanceByDate(entries)` — merge visits+attendance per day
- `toggleAttDetail(i)` — expand a day
- `downloadAttendancePDF()` — printable monthly PDF
- **Consts:** `ATT_LABELS`, `ATT_COLORS`

### `05-meeting-returns.js` — Meeting mode, edit-permission stub, returned-equipment items
- `isMeetingMode()` / `toggleMeetingMode()` / `updateMeetingBadge()` — meeting mode
- `checkEditPermission()` — returns true (no-op gate)
- `applyUserRestrictions()` — hide UI per user
- `addReturnedItemRow()` / `renderReturnedItems()` / `invRenderReturns()` — returns
- `setBtnLoading(btn, loading)` — button spinner

### `06-products.js` — Product catalog CRUD
- `getActiveProducts()` — active products
- `invRenderProducts()` / `invNewProduct()` / `invEditProduct(id)` — list + modal
- `invToggleProductActive(id, makeActive)` / `invSaveProduct(btn)` — toggle/save

### `07-orders.js` — Orders + voice/text intake parsing + distribution
- `intakeNormalize(s)` / `intakeQtyNear(norm, idx)` — text intake helpers
- `openIntake()` / `intakeBackToStep1()` / `renderIntakeGrid()` / `intakeAddRow()` — intake wizard
- `parseLocalToItems(raw)` / `intakeParseLocal(raw)` — local NLP parse
- `pickRecorderMime()` / `openVoice(target)` / `closeVoice()` / `renderVoiceReview(res)` / `voiceRetry()` / `applyVoiceResult()` — voice order (sends `type:'transcribe'`)
- `getOrderQuickAction(status)` / `canApproveOrders()` (Aviam/Amichai) — workflow
- `invRenderOrders()` / `invNewOrder()` / `invEditOrder(id)` / `renderOrderItems()` / `invAddItemRow()` — orders CRUD
- `importOpenRequirements()` — pull open requirements into an order
- `ensureDistributionDefaults()` / `invDistChange(...)` / `invToggleDistribution()` — per-location distribution
- **Consts:** `INTAKE_ALIASES`, `HE_NUMWORDS`

### `08-inventory.js` — Stock computation, low-stock alerts, matrices, CSV export
- `computeStock()` — derive stock from movement ledger
- `lowStockReport()` / `renderLowStockAlert()` — low-stock + SIM-holder rules
- `populateTransferDropdowns()` / `renderTransferProducts()` / `renderTransferMax()` — transfer form
- `invRenderStock()` / `invRenderKibbutzInventory()` — stock tables/matrix
- `invExportStock()` / `invExportKibbutzInventory()` / `invDownloadCSV(rows, filename)` — CSV
- **Consts:** `METER_RULES`, `SIM_HOLDERS`

### `09-visits.js` — Visit logging, products-per-visit, visit report
- `toggleVisitWorkday()` — mark visit a full workday
- `loadAllVisitsCombined()` — merge DB + local visits
- `renderProductsForVisitor()` / `toggleProductQty(chk)` — product checkboxes
- `loadAllVisits()` / `saveAllVisits(visits)` / `getLastVisit(name)` — localStorage visits
- `lastVisitText(visit)` / `renderLastVisit(name)` / `editLastVisit()` / `editVisit(id)` — display/edit
- `saveVisit(btn)` — POST visit (+returned items)
- `buildVisitsReport(visitor, from, to)` / `openVisitsReportModal()` — report
- **Consts:** `VISITS_KEY`, `PRODUCT_LIST`, `WORKDAY_HOURS`(8)

### `10-activity.js` — Activity feed, edit modal, card stats/reorder, visits HTML report
- `openActivityModal()` — activity log modal
- `getRangeStart/End(range)` / `dateRange(from, to)` — date ranges
- `collectActivities(range)` / `renderActivity()` / `copyActivityReport()` — feed
- `setReportRange(range)` / `generateVisitsReport(action)` / `openVisitsReportHTMLView(...)` — reports
- `openEditModal(card)` — open kibbutz edit modal
- `updateStatsFromCards()` — header counters
- `applyCardLastVisit()` — inject last-visit onto cards
- `reorderCards()` — order card sections
- `todayYmd()` — today YYYY-MM-DD

### `11-search-login.js` — Global search + user/role/auth (PIN) + data polling
- `closeGlobalSearch()` / `doGlobalSearch(query)` / `goToKibbutz(name)` / `goToInventoryTab(tab)` — search/nav
- `getCurrentUser()` / `getRole()` / `isIdan()` / `canUseEms()` — identity/perms
- `setLoggedInUser(name)` / `backToNamePicker()` / `updateUserBadge()` / `changeUser()` — login UI
- `canSeeAttendance()` / `attPerson()` / `setAttPerson(p)` — attendance perms
- `applyNavVisibility()` / `applyLoginRoleOptions()` — nav gating
- `isAuthed()` / `checkAuthCode()` — PIN auth
- `startPolling()` / `stopPolling()` — periodic refresh
- **Flags/consts:** `LOGIN_FLAG` (`?login=0` = legacy PIN break-glass), `AUTH_KEY`('dashboard_auth_v4'), `USER_KEY`, `ROLE_KEY`, `EMS_USERS`, `ATT_PEOPLE`(['אביאם','ניתאי']), `IDAN_PIN`/`TEAM_PIN` (values redacted)

### `12-reports.js` — Per-person "my tasks", company tasks, EMS session/token lifecycle
- `isOwnerOf(task, person)` / `linesForPerson(text, person)` — ownership filters
- `readCompanyTasksFromDOM()` / `loadCompanyTasks()` / `renderCompanyTasks()` — company tasks
- `openCompanyTasksModal()` / `gatherCompanyTasksFromForm()` / `saveCompanyTasks()` / `sendCompanyTasksToTeam()` — edit/share
- `buildCompanyTasksSection()` / `buildMyTasksReport(person)` / `generateMyTasksReport(action)` — reports
- `getEmsUrl()` — EMS API base
- `emsSessionExpired()` / `clearEmsSession()` / `getEmsToken()` / `isEmsConnected()` / `scheduleEmsExpiry()` / `emsDisconnect()` — EMS token lifecycle
- **Consts:** `CONTACTS`, `REGION_ORDER`, `EMS_URL_KEY`/`EMS_TOKEN_KEY`/`EMS_TOKEN_AT_KEY`, `EMS_MAX_SESSION_MS`(60 min)

### `13-ems.js` — EMS cache reading, offline queue, per-card EMS task widgets
- `emsOpenStatuses()` / `emsCacheData()` / `emsCacheTasksForKibbutz(name)` — read shared EMS cache
- `emsQueuePending()` — pending outbound EMS writes
- `_emsFlushedIds()` / `_emsAddFlushed(id)` / `_emsDropFlushed(ids)` — flushed-id bookkeeping
- `emsSyncStamp(iso)` — sync-time label
- `applyCardEmsWidgets()` / `renderCardEmsTasks(card, name)` — inject EMS tasks onto cards
- `openKibbutzEmsTask(id)` — open EMS task detail
- **Consts:** `EMS_PRIORITY_DOT`, `TAKE`(200)

### `14-calendar.js` — Company calendar, my-tasks, EMS task detail/create, EMS list page
- `openKibbutzByName(name)` — open card by name
- `changeCalMonth(delta)` / `calEsc(s)` / `calAddLink(d, title, details)` — calendar helpers (`calAddLink` = Google Calendar create-event URL for "📅 add to my calendar")
- `collectCalendarEvents()` / `renderCompanyCalendar()` / `renderCalendarAgenda()` / `calDayDetail(y,m,d)` — calendar views
- `renderMyTasks()` — personal tasks page
- `buildVisitSummaryText(...)` / `prepVisitEmsBlock(...)` / `onVisitEmsTaskChange()` / `createEmsTaskFromVisit()` / `readVisitEmsIntent()` — create EMS task from a visit
- `emsNormName/emsUserName/emsEsc/emsToast` — utils
- `emsTokenRole()` — decode role from EMS JWT
- `debounceEmsSearch()` — debounced EMS search
- `emsStatusLabel(s)` / `renderEmsTaskCard(t)` / `renderEmsLoadMore()` / `closeEmsModal()` — EMS list
- `prepModalEmsSection(name)` / `emsModalTaskClick(id)` — EMS section in kibbutz modal
- `emsCalendarLink(t)` / `emsLinkIds(t)` / `emsLinkLabel(type)` / `emsMeterNumber(m,id)` / `emsMeterIcon(m)` — linked-entity helpers (meters: ⚡/💧 + serial + admin link)
- `renderEmsDetail(t)` / `renderEmsPage()` — EMS detail + page
- **Consts:** `EMS_STATUS`, `EMS_PRIORITY`, `EMS_TYPE`, `EMS_CLOSED`

### `15-login-gate.js` — EMS login gate (email/password + 2FA) + EMS→Supabase JWT bridge
- `setupEmsLoginGate()` — IIFE gated by `LOGIN_FLAG`
- `sbBridge()` — EMS token → Supabase `authenticated` pass via `/functions/v1/ems-auth`; **self-verifies** against `/rest/v1/tasks` else drops token → anon. `window._sbBridge`; sets `_sbToken`/`_sbTokenExp` (55 min)
- `resolveIdentity(email)` — EMS email → app person (firstName)
- `onAuthed(email)` — finalize login (USER/ROLE/AUTH keys, bridge, refresh)
- `storeToken(url, token)` — persist EMS token
- `window.gateLogin()` — email/password (`/v1/auth/login/password`)
- `window.gateVerifyOtp()` — verify OTP (`/v1/auth/verify-otp`)
- `window.gateResendOtp()` — resend OTP (`/v1/auth/resend-otp`)
- `window.gateLogout()` — clear session + reload

### `16-install.js` — PWA install button
- `setupInstall()` — IIFE; captures `beforeinstallprompt`, hides when standalone
- `window.appInstall()` — trigger native install (iOS → manual Share-sheet)

### ~~`17-staff.js`~~ — RETIRED (spec §7m R5). The file no longer exists.
- The עובדים page went with it. `canManageStaff()` now lives in `js/src/00-bridge.js`; messaging moved to
  `js/src/17-messages.js` (see below).

### `18-dev-tasks.js` — 🧑‍💻 Dev page (פיתוח): GitHub Projects-v2 board + tree + writes + offline cache + day-stamps
Deliberately LEGACY VANILLA (spec §7d / Task 11): one self-contained module with working DnD — it took the new
styling tokens, not React.
- `canSeeDevTasks()` — gate: מתניה / אליה / `canManageStaff()` (inlined names — runs during nav init)
- `renderDevTasks(force)` — cache-first paint; heavy GitHub fetch **once per connection** (`force`=🔄); loads `dev_status_log`
- `devBuild(tasks)` — tasks → `window._devData` + sub-issue hierarchy (`DEV_CHILDREN`)
- `devPaint()` — render hero + flow strip + toolbar + (board | tree) + select bar from `_devData`+filter (no re-fetch)
- **PURE builders** (exposed on `window` for `test-devboard.mjs`, nothing in the app calls them there):
  - `devStage(t)` — Projects-v2 Status → one of the **seven live** columns (`DEV_STAGES`, pipeline order):
    `fields` Main Fields · `backlog` · `scope` Scope Refinement · `ready` Sprint Ready · `prog` · `review` · `committed`
  - `devBoardLayout(tasks, expanded)` → `{full:[{key,tasks}], rail:[{key,count,expanded}]}` — `DEV_FULL_KEYS`
    (`ready`·`prog`·`review`·`backlog`) are always full columns; the rest are rail chips, a tap expands one in place
  - `devTree(tasks,{hideDone,assignee,stage,q})` — root issue → nested sub-issues; parentless leaves go to **ללא נושא**;
    `hideDone` drops done leaves and any root left with nothing live under it; each root carries a `bar`
  - `devFlowSegments(tasks)` / `devPctSegments(counts)` — stacked-bar slices, integer `pct` summing to exactly 100
- `renderDevBoard()` / `renderDevTree()` / `renderFlowStrip()` — paint only; `devTreeRowDesktop()` / `devTreeRowMobile()`
- `devMobileCard(t)` — the task card (board columns at every width + mobile tree leaves)
- `devStatus(t)` / `devPriority(t)` — column pill (Hebrew, `--stage-*` tinted) / priority chip; `devStamps(t)` — day-stamps
- `devSetView(v)` (`board`|`tree`, remembered per device in `localStorage['dev_view']`, tree is the phone default) ·
  `devToggleRail(key)` · `devToggleHideDone()` / `devSetAssignee(v)` / `devTreeAll(open)` / `devSetStageFilter(v)` ·
  `devSetFilter(f)` (`prio`|`status`|`week`|`stage`|`topic`) / `devFilter(q)` / `devSetState(s)`
- `devToggleSelMode()` / `devToggleSel()` / `devPushToReady()` — multi-select → **העבר לספרינט** (writes `Sprint Ready`)
- `devReleaseVersion()` — **🚀 עלתה גרסה**: move all **In Review** → Committed (the board has no Done column since 8.9)
- `devWriteStatus(numbers,target)` — POST `github` fn `mode:"setStatus"` (the write path); `DEV_STAGE_TARGET` holds the
  seven live option names, so a drop on a full column **or on a rail chip** writes the right one
- `devLoadStatusLog()` / `devLogStatuses(tasks)` — Supabase `dev_status_log` read/write (forward day-stamps)
- `devSaveCache()` / `devLoadCache()` — `localStorage` ticket cache (`dev_tasks_cache_v1`, keyed open/all)
- **Consts:** `DEV_STAGES`, `DEV_FULL_KEYS`, `DEV_DONE_KEYS`, `DEV_STAGE_TARGET`, `DEV_PRANK`, `DEV_TOPIC_COLORS`,
  `DEV_CACHE_KEY`, `DEV_VIEW_KEY`, `DEV_GH` (icon). Exposes
  `window._devData/_devView/_devExpanded/_devHideDone/_devAssignee/_devSel/_devStatusLog/_devFetched`.
- **CSS:** `.dev-*` in `css/app.css`; stage colors are the `--stage-fields … --stage-committed` tokens (light + dark).

### `19-version-check.js` — 📦 new-deploy watcher (other lane): polls the live `app.js?v=` stamp → refresh banner / auto-reload

### 🔥 צריבות — round 5 G-U4 retired `24-meter-burns.js`. The full table is `app/src/islands/BurnsPage.tsx` (React), the data layer `app/src/lib/burnsData.ts`, pure logic `app/src/lib/burns.ts`. `window.BURNS_PROJECT_ACTIVE` (the one removal flag) now lives in `js/src/00-consts.js`. The card chip / modal section / briefing rows stay in `app/src/components/home/Burns.tsx` (K-owned, unchanged by this retirement).

---

## 2.00 additions (Task 7 checkpoint, 2026-09-19)

New `js/src/*.js` modules since the last update of this doc:
- **`17-messages.js`** — internal staff messaging (canManageStaff-gated) + Ctrl+K compose action.
- **`18-dev-tasks.js`** — dev-page redesign: `devStage()` (Main Fields/Scope Refinement recognized),
  `DEV_STAGE_TARGET` (7 live GitHub option names), `devReleaseVersion()`, 4-column board + minimized
  rail + 🌳 tree view.
- **`20-delivery-cert-logo.js`** — split out of `20-delivery-cert.js` (logo asset only, cert gate
  logic unchanged, byte-identical per `test-visit-cert-gate.mjs`).
- **`24-kibbutzim.js`** — `kibbutzim` table read/render (region grouping, alpha order, energy-gate
  warnings via `applyCardSiteWarnings`), replaces the static card grid.
- **`24-meter-burns.js`** — retired in round 5 G-U4; see "🔥 צריבות" above.

**`app/src/` — React islands** (Vite+TS+Tailwind+shadcn, built to `ui/sigma.js|css`, mounted lazily
from legacy via `window.sigma`, spec §7c): `Home` (card grid), `Field` (arrival/briefing/visit
summary), `Calendar` (month/week/list + route order + absences), `Presenter` (live-meeting overlay),
`MeetingReview` (post-meeting import), `DayLog` (📝 יומן היום), `Feedback`/`FeedbackInbox` (📣 + voice),
`Attendance`, `Health` (v1 draft scorers), `OnboardingProgress`, `Usage` (📈 weekly digest), `Gaps`
(📋 הפערים שלי), `Settings` (⚙️ incl. EOD hour, push, personal area), `DevPresenter` (▶ ישיבת פיתוח +
sprint prep), `Holidays`, `CommandBar` (Ctrl+K), `HeaderActions`, `ImportNotes`, `ModalMeetings`,
`PmToday`, `Burns` (🔥 full table), `StockChange` (📦 §4b — the ONE pool's 🔢 דיווח שינוי, Task 8; a
stock change ROUTES to the visit form / order modal and only writes directly for a recount; note
the `sc-submit` button shows only a spinner while saving, no label, unlike every other pending
button — filed to backlog, not fixed in 2.01). Pure logic lives in `app/src/lib/*.ts` (vitest,
incl. `inventory.ts`/`stockChange.ts` for the pool and `visitDraft.ts` for the §7p chapters); the
EMS door is `app/src/lib/ems/{types,gateway,adapters/rest}.ts` — `app/src` has zero direct EMS
calls left, all 13 typed operations go through `EmsGateway`, published to legacy as
`sigma.ems`/`sigma.emsWrite`.

`Field.tsx` also exports `VisitChapters` (the §7p visit-summary sheet, Task 32) and
`openVisitChapters(kibbutz, opts)`, reachable from anywhere via the `window.sigmaVisitChapters`
global (same pattern `Gaps.tsx` and `app/src/components/home/CardActions.tsx` use — no static
import of the Field island, so callers' own chunks stay small). Every visit entry point (card 📍,
briefing 📍/🚚, the "היום" nudge, `Gaps.tsx`, the push deep link) resolves through this one global,
falling back to the legacy `sigma.openVisitQuick(kibbutz)` form when the chapters island has not
mounted (ruling 19.9: the card's own 📍 joined this list in 2.01 — it used to go straight to the
legacy form).

Full contract inventory (bridge functions, bus events, tables, pages) is generated by
`node build.mjs` into `docs/integration-map.md` (123 contracts, checked by `test-integration.mjs` —
do not hand-edit its "generated" sections).

## Non-module files

- **`index.html`** — `<head>`: manifest, theme-color, Apple PWA metas, icons, Heebo font,
  versioned `css/app.css?v=…`, inline `.gate-spin` spinner style. Body: install button
  `#installBtn`; EMS gate overlay `#emsLoginGate` (`gateEmail`/`gatePass`/`gateError`,
  OTP box `#gateOtpBox`/`gateOtp`). End: versioned `js/app.js?v=…` + SW registration.
- **`sw.js`** — `CACHE='sigmatec-ops-v2'`; network-first same-origin GET; pre-caches the
  shell; bypasses non-GET & cross-origin (Supabase/Apps Script always live).
- **`build.mjs`** — concat `js/src/*.js` → `js/app.js`; stamp `?v=<base36 time>` on
  `app.js`/`app.css` in `index.html`. Run `node build.mjs` before committing.
- **`supabase/functions/ems-auth/index.ts`** — see [data-and-security.md](data-and-security.md).
- **`supabase/functions/github/index.ts`** — dev-page proxy to GitHub Projects-v2 (read tickets/fields + write
  `mode:"setStatus"` via `setProjectStatus`). EMS-gated; CORS allowlist (prod + `*.githack.com` + localhost). See [operations.md](operations.md).
- **`supabase/functions/parse-order/index.ts`** — 📦 AI order parser (Gemini→Groq→offline). See [operations.md](operations.md).
- **`db/dev_status_log.sql`** — dev day-stamps table · **`db/parse_corrections.sql`** — 📦 order-parser learning table.
- **`appsscript/ems-calendar-backend.gs`** — Option B org backend: `doGet`(calendar),
  `doPost`(`ems`/`calendarAdd`/`calendarList`), `emsProxy`, `listCalendarEvents_`,
  `calendarAdd`, `authorizeOnce`. `CALENDAR_ID='information@sigmatec-energy.com'`.
