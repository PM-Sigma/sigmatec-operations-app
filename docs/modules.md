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

### ~~`06-products.js` / `07-orders.js` / `08-inventory.js`~~ - RETIRED (round 5 package I, U10). The files no longer exist.
- Rules: `app/src/lib/inventory.ts` (published as `window.SigmaInv`); API: `app/src/lib/inventoryApi.ts`; order parsing: `app/src/lib/orderParse.ts`
  (+ `supabase/functions/parse-order/`); screens: `app/src/islands/Inventory*.tsx` (Stock, Orders, Products, Kibbutzim, Certs, Nudges, Returns, sheets);
  boot: `app/src/islands/inventoryBoot.ts`.
- What legacy callers still reach lives in **`06-inventory.js`** (compat names only: `getActiveProducts`, `computeStock`, `approveOrder`, ...;
  each line is deleted when its last caller is rewritten).

### `00-guard.js` - the ONE pending-state helper + the ONE modal-dismiss owner (concatenated right after `00-bridge.js`; no screens). See `ux-loading-patterns.md`.

### `21-excel-export.js` - aggregate Excel exports (pure builders + one SheetJS writer; buttons visible to עידן + viewer only).

### `22-push.js` - Web Push subscription client (Android/desktop OS push; server side is `supabase/functions/push-send/`). The push log screen is `app/src/islands/PushLog.tsx` + `app/src/lib/pushLog.ts` (`23-push-log.js` is retired).

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

### ~~`18-dev-tasks.js`~~ — RETIRED (D-U3, round 5 package D). The file no longer exists.
- 💻 פיתוח is now `app/src/islands/DevBoard.tsx` (React, on the design system) + `app/src/islands/DevPresenter.tsx`
  (the ▶ ישיבת פיתוח meeting) + `app/src/lib/devBoard.ts` (the one `github` Edge Function data path) +
  `app/src/lib/devMeeting.ts` (domain grouping) + `app/src/lib/devMarks.ts` (local meeting marks) +
  `app/src/lib/devFlow.ts` / `devStatusLog.ts` / `sprintPrep.ts`. `.dev-*` CSS and the global `--stage-*`
  tokens are gone from `css/app.css` — the React page uses the validated Tag semantic palette instead.

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

**`app/src/` - React islands** (Vite+TS+Tailwind+shadcn, built to `ui/sigma.js|css`, mounted lazily from legacy via `window.sigma`, spec 7c).
Corrected 29.9 against the code. Round-5 screen packages (letters as in `superpowers/r5-MEMORY.md`): **A** attendance, **D** dev page,
**K** kibbutz card, **C** calendar, **G** burns/push-log/generators, **X** security + gates, **M** meeting presenter, **S** shell,
**I** inventory, **V** visit summary, **R** remaining pages, plus the voice fix and the field-ops page.

| Area | Islands (`app/src/islands/`) | Pure logic / data (`app/src/lib/`) |
|---|---|---|
| Home / cards / alerts | `Home`, `Alerts`, `MessageSheet`, `DesktopNav`, `HeaderActions` (+ `components/home/*`, `components/alerts/*`) | `freshness`, `format`, `navigate`, `staffMessages` |
| Kibbutz card | `KibbutzDetail` (+ `components/kibbutz/`: `StatusTab`, `VisitsTab`, `VisitRowActions`) | `kibbutzDetail`, `kibbutzVisits`, `meetingNotesOps` (row actions: delete / move / internal task / EMS task), `meetingStatus` |
| Field / visit | `Field` (arrival, briefing, visit summary sheet), `DayLog` | `visitSave`, `visitEdit`, `visitContacts`, `visitAttendance`, `editLock`, `runAdd` |
| Calendar | `Calendar` (month / work week / list, route, absences, peer row) | `calendar`, `calendarData` |
| Attendance / hours | `Attendance`, `Hours`, `Holidays`, `Gaps` | `visitAttendance`, `hours` |
| Meetings | `Presenter` (+ `presenter/*`), `MeetingReview`, `ImportNotes`, `DevPresenter` | `meetingTimeline`, `meetingClose`, `devMeeting` |
| Dev page | `DevBoard` (+ `dev/*`) | `devBoard`, `devFlow`, `devMarks`, `devStatusLog`, `sprintPrep` |
| Tasks | `MyTasks` | `emsTasks`, `internalTasks` |
| Inventory | `Inventory`, `InventoryStock/Orders/Products/Kibbutzim/Certs/Cert/Nudges/Returns`, `InventoryOrderSheet`, `InventoryProductSheet`, `StockChange` | `inventory`, `inventoryApi`, `orderParse`, `certDoc`, `certLogo` |
| Burns | `BurnsPage` (+ `burns/*`), `Burns` | `burns`, `burnsData` |
| Field-ops (Modbus) | `FieldOps` | `fieldops/{fieldOpsView,modbusScale}`, `ems/adapters/{fieldOps,fieldOpsOps}` -> edge fn `field-ops` |
| Feedback / usage / settings | `Feedback`, `FeedbackInbox`, `Usage`, `PushLog`, `Settings`, `Gallery` | `pushLog`, `pushPrompt`, `errorMessages`, `online`, `pageActions`, `shell` |

Retired islands (no longer in the tree): `CommandBar`, `ModalMeetings`, `InternalModal`, `Health`, `PmToday`, `ViewSwitcher`.
Shell chrome: `app/src/shell/` (`PageBar`, `GearSheet`, `IdentityRow`, `OfflineBanner`). Design system: `app/src/components/ui/`
(`section-block`, `list-row`, `segmented-control`, `stat-tile`, `chip`, ...) + `app/src/tokens.css`. The EMS door is
`app/src/lib/ems/{types,gateway,adapters/rest,adapters/fieldOps,adapters/fieldOpsOps}.ts`, published to legacy as `sigma.ems`/`sigma.emsWrite`.

**Edge functions** (`supabase/functions/`): `ems-auth`, `calendar`, `clockify`, `github`, `parse-daylog`, `parse-order`, `push-send`,
`transcribe`, `backup-export` (key-guarded nightly export, called by the backup job, not the client), `field-ops` (Modbus read, round 5).

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
