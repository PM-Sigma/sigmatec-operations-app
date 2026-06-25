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

### `17-staff.js` — Staff management (עידן + עמיחי only): per-employee load/usage analytics + leave-a-message
- `canManageStaff()` — gate: `isIdan()` or `getCurrentUser()==='עמיחי'`
- staff analytics from `SHEET_DATA`; `staffSendMessage()` etc. via the Supabase `messages` table (REST)

### `18-dev-tasks.js` — 🧑‍💻 Dev page (פיתוח): GitHub Projects-v2 sprint board + writes + offline cache + day-stamps
- `canSeeDevTasks()` — gate: מתניה / אליה / `canManageStaff()` (inlined names — runs during nav init)
- `renderDevTasks(force)` — cache-first paint; heavy GitHub fetch **once per connection** (`force`=🔄); loads `dev_status_log`
- `devBuild(tasks)` — tasks → `window._devData` + sub-issue hierarchy (`DEV_CHILDREN`)
- `devPaint()` — render hero + toolbar + (board | topic tree) + select bar from `_devData`+filter (no re-fetch)
- `devBoard(d,f)` — the 6 status columns; `devStage(t)` maps Projects-v2 Status → column (`DEV_STAGES`)
- `devMobileCard(t)` / `devMobileNodes()` / `devNode()` — task card + mobile-flat / desktop-tree nodes
- `devStatus(t)` / `devPriority(t)` — status badge / priority chip; `devStamps(t)` — gray day-stamp chain
- `devSetView(v)` (סטטוס|נושא) · `devSetFilter(f)` / `devFilter(q)` / `devSetState(s)` — toggle filters + search + open/all
- `devToggleSelMode()` / `devToggleSel()` / `devPushToReady()` — multi-select → **דחוף ל-Ready**
- `devReleaseVersion()` — **🚀 עלתה גרסה**: move all Done → Committed
- `devWriteStatus(numbers,target)` — POST `github` fn `mode:"setStatus"` (the write path)
- `devLoadStatusLog()` / `devLogStatuses(tasks)` — Supabase `dev_status_log` read/write (forward day-stamps)
- `devSaveCache()` / `devLoadCache()` — `localStorage` ticket cache (`dev_tasks_cache_v1`, keyed open/all)
- **Consts:** `DEV_STAGES`, `DEV_PRANK`, `DEV_TOPIC_COLORS`, `DEV_CACHE_KEY`, `DEV_GH` (icon). Exposes `window._devData/_devView/_devSel/_devStatusLog/_devFetched`.

### `19-version-check.js` — 📦 new-deploy watcher (other lane): polls the live `app.js?v=` stamp → refresh banner / auto-reload

---

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
