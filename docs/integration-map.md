# מפת האינטגרציה — integration map

> **GENERATED — do not hand-edit.** `node scripts/integration-map.mjs` rewrites this file from the
> source, `node scripts/integration-map.mjs --check` fails when it is stale, and `test-integration.mjs`
> (part of `npm test`) asserts every contract in it. The prose a grep cannot produce lives in
> `docs/integration-map.annotations.md` and is appended verbatim at the end.

Generated from 29 legacy modules, 129 island sources and 9 edge functions.

## (a) Bridge — `window.sigma.<fn>`

React never touches legacy code directly: `js/src/00-bridge.js` is concatenated first and is the whole
surface. Every entry is a lazy thunk, so a legacy function declared later in the bundle still resolves.

| `sigma.<fn>` | provided at | forwards to (legacy) | React consumers |
|---|---|---|---|
| `sigma.appInstall` | js/src/00-bridge.js:509 | `appInstall` → js/src/16-install.js:34 | app/src/islands/Settings.tsx:109 |
| `sigma.ATT_PEOPLE` | js/src/00-bridge.js:231 | *(own logic)* | app/src/islands/Attendance.tsx:223<br>app/src/islands/Calendar.tsx:782<br>app/src/islands/DayLog.tsx:73<br>app/src/islands/Gaps.tsx:63<br>…+1 |
| `sigma.attExportExcel` | js/src/00-bridge.js:500 | `xlExportAttendanceCurrent` → js/src/21-excel-export.js:282 | app/src/islands/Attendance.tsx:356 |
| `sigma.attExportPdf` | js/src/00-bridge.js:499 | `downloadAttendancePDF` → js/src/04-attendance-daily.js:513 | app/src/islands/Attendance.tsx:353 |
| `sigma.attHolidays` | js/src/00-bridge.js:492 | `attHolidays` → js/src/04-attendance-daily.js:35 | app/src/islands/Attendance.tsx:55<br>app/src/islands/Calendar.tsx:88<br>app/src/islands/Gaps.tsx:93 |
| `sigma.attHolidaysLoad` | js/src/00-bridge.js:493 | `attLoadHolidays` → js/src/04-attendance-daily.js:38 | app/src/islands/Attendance.tsx:54<br>app/src/islands/Calendar.tsx:88<br>app/src/islands/Holidays.tsx:57 |
| `sigma.attPerson` | js/src/00-bridge.js:495 | `attPerson` → js/src/11-search-login.js:170 | app/src/islands/Attendance.tsx:210<br>app/src/islands/Attendance.tsx:253 |
| `sigma.attRefresh` | js/src/00-bridge.js:498 | `renderAttendanceReport` → js/src/04-attendance-daily.js:174 | app/src/islands/Attendance.tsx:280 |
| `sigma.attRows` | js/src/00-bridge.js:489 | `attRowsFor` → js/src/04-attendance-daily.js:99 | app/src/islands/Attendance.tsx:48<br>app/src/islands/Gaps.tsx:101 |
| `sigma.attSave` | js/src/00-bridge.js:481 | *(own logic)* | app/src/islands/Attendance.tsx:286 |
| `sigma.beginReLogin` | js/src/00-bridge.js:465 | *(own logic)* | app/src/components/UserChip.tsx:88 |
| `sigma.calAddEvent` | js/src/00-bridge.js:524 | `calAddEvent` → js/src/14-calendar.js:177 | **—** |
| `sigma.calFetchEvents` | js/src/00-bridge.js:523 | `calFetchEvents` → js/src/14-calendar.js:150 | app/src/islands/Calendar.tsx:93<br>app/src/islands/Presenter.tsx:80 |
| `sigma.calIslandMounted` | js/src/00-bridge.js:538 | *(own logic)* | app/src/islands/Calendar.tsx:1263 |
| `sigma.canInstall` | js/src/00-bridge.js:508 | `canInstall` → js/src/16-install.js:32 | app/src/islands/Settings.tsx:102 |
| `sigma.canSeeAttendance` | js/src/00-bridge.js:497 | `canSeeAttendance` → js/src/11-search-login.js:168 | **—** |
| `sigma.canShowPage` | js/src/00-bridge.js:237 | *(own logic)* | app/src/lib/canShowPage.ts:14 |
| `sigma.canUseEms` | js/src/00-bridge.js:556 | `canUseEms` → js/src/11-search-login.js:134 | app/src/islands/CommandBar.tsx:132 |
| `sigma.certFromVisit` | js/src/00-bridge.js:459 | `certFromVisit` → js/src/20-delivery-cert.js:742 | **—** |
| `sigma.certFromVisitForm` | js/src/00-bridge.js:458 | `certFromVisitForm` → js/src/20-delivery-cert.js:719 | app/src/components/home/CardActions.tsx:46<br>app/src/islands/Field.tsx:1186 |
| `sigma.certIssuedForVisit` | js/src/00-bridge.js:453 | *(own logic)* | app/src/islands/Field.tsx:587 |
| `sigma.changeUser` | js/src/00-bridge.js:230 | `changeUser` → js/src/11-search-login.js:227 | app/src/components/UserChip.tsx:90 |
| `sigma.companyTasks` | js/src/00-bridge.js:565 | *(own logic)* | app/src/islands/Calendar.tsx:589 |
| `sigma.contactPhone` | js/src/00-bridge.js:562 | `contactPhone` → js/src/12-reports.js:18 | app/src/islands/Calendar.tsx:622 |
| `sigma.createTask` | js/src/00-bridge.js:314 | `emsWriteOrQueue` → js/src/13-ems.js:297 | app/src/components/home/InternalTasks.tsx:67<br>app/src/components/home/MeetingNotes.tsx:112<br>app/src/islands/MeetingReview.test.tsx:328<br>app/src/islands/MeetingReview.tsx:145<br>…+1 |
| `sigma.decorateCards` | js/src/00-bridge.js:304 | *(own logic)* | app/src/islands/Home.tsx:94 |
| `sigma.ems` | app/src/lib/ems/gateway.ts:70 *(island)* | *(island-provided)* | **—** |
| `sigma.emsAddComment` | js/src/00-bridge.js:409 | *(own logic)* | app/src/islands/DayLog.tsx:401 |
| `sigma.emsApi` | js/src/00-bridge.js:259 | `emsApi` → js/src/12-reports.js:123 | app/src/lib/ems/adapters/rest.ts:125 |
| `sigma.emsCacheData` | js/src/00-bridge.js:261 | `emsCacheData` → js/src/13-ems.js:19 | app/src/islands/Calendar.tsx:436<br>app/src/islands/Calendar.tsx:569<br>app/src/islands/Calendar.tsx:933<br>app/src/islands/CommandBar.tsx:187<br>…+2 |
| `sigma.emsCacheTasksForKibbutz` | js/src/00-bridge.js:274 | `emsCacheTasksForKibbutz` → js/src/13-ems.js:25 | app/src/components/home/EmsTasks.tsx:31<br>app/src/islands/Field.tsx:167<br>app/src/islands/Field.tsx:1138<br>app/src/islands/Presenter.tsx:119 |
| `sigma.emsCreateTask` | js/src/00-bridge.js:558 | `emsCreateTaskModal` → js/src/14-calendar.js:453 | app/src/islands/CommandBar.tsx:159 |
| `sigma.emsDisconnect` | js/src/00-bridge.js:559 | `emsDisconnect` → js/src/12-reports.js:94 | app/src/components/UserChip.tsx:86<br>app/src/islands/CommandBar.tsx:161 |
| `sigma.emsLabels` | js/src/00-bridge.js:278 | `emsLabels` → js/src/14-calendar.js:431 | app/src/lib/emsTasks.ts:24 |
| `sigma.emsPatchTask` | js/src/00-bridge.js:525 | *(own logic)* | **—** |
| `sigma.emsPatchTasks` | js/src/00-bridge.js:531 | *(own logic)* | app/src/islands/Calendar.tsx:1001<br>app/src/islands/Calendar.tsx:1013 |
| `sigma.emsSetStatus` | js/src/00-bridge.js:557 | `changeEmsStatus` → js/src/14-calendar.js:736 | app/src/islands/Calendar.tsx:607 |
| `sigma.emsSiteIdForKibbutz` | js/src/00-bridge.js:279 | `emsSiteIdForKibbutz` → js/src/14-calendar.js:375 | app/src/islands/MeetingReview.tsx:224 |
| `sigma.emsSync` | js/src/00-bridge.js:267 | *(own logic)* | app/src/lib/query.ts:105 |
| `sigma.emsToken` | js/src/00-bridge.js:288 | `getEmsToken` → js/src/00-consts.js:38 | app/src/components/home/workTimerApi.ts:9<br>app/src/islands/DayLog.tsx:100<br>app/src/islands/DayLog.tsx:133<br>app/src/islands/Feedback.tsx:85<br>…+2 |
| `sigma.emsWrite` | js/src/00-bridge.js:320 | `emsWriteOrQueue` → js/src/13-ems.js:297 | **—** |
| `sigma.ensurePass` | js/src/00-bridge.js:468 | *(own logic)* | **—** |
| `sigma.gapNag` | js/src/00-bridge.js:517 | `gapNag` → js/src/22-push.js:309 | app/src/islands/Gaps.tsx:200 |
| `sigma.getCurrentUser` | js/src/00-bridge.js:224 | `getCurrentUser` → js/src/11-search-login.js:123 | app/src/bridge.ts:379<br>app/src/components/home/CardActions.tsx:38<br>app/src/components/Nav.tsx:60<br>app/src/islands/Burns.tsx:70<br>…+8 |
| `sigma.getEmsSites` | js/src/00-bridge.js:280 | `getEmsSites` → js/src/14-calendar.js:364 | app/src/components/home/HealthStrip.tsx:24<br>app/src/lib/ems/adapters/rest.ts:130<br>app/src/lib/emsChain.ts:59 |
| `sigma.getLastVisit` | js/src/00-bridge.js:380 | `getLastVisit` → js/src/09-visits.js:244 | app/src/islands/Field.tsx:1144 |
| `sigma.getRole` | js/src/00-bridge.js:225 | *(own logic)* | app/src/bridge.ts:380<br>app/src/islands/CommandBar.tsx:130<br>app/src/islands/Feedback.tsx:186<br>app/src/islands/Feedback.tsx:595<br>…+1 |
| `sigma.isAdmin` | js/src/00-bridge.js:229 | `canManageStaff` → js/src/00-bridge.js:63 | app/src/components/home/EmsTasks.tsx:149<br>app/src/islands/DevPresenter.tsx:450<br>app/src/islands/FeedbackInbox.tsx:48<br>app/src/islands/FeedbackInbox.tsx:203<br>…+10 |
| `sigma.isEmsConnected` | js/src/00-bridge.js:260 | `isEmsConnected` → js/src/00-consts.js:42 | app/src/components/home/KibbutzSheet.tsx:96<br>app/src/islands/Settings.tsx:183<br>app/src/lib/ems/adapters/rest.ts:127 |
| `sigma.isIdan` | js/src/00-bridge.js:227 | `isIdan` → js/src/11-search-login.js:126 | app/src/islands/Attendance.tsx:221<br>app/src/islands/DayLog.tsx:72<br>app/src/islands/Gaps.tsx:68<br>app/src/islands/Usage.tsx:38 |
| `sigma.isInstalled` | js/src/00-bridge.js:507 | `isInstalled` → js/src/16-install.js:27 | app/src/islands/Settings.tsx:101 |
| `sigma.isViewer` | js/src/00-bridge.js:226 | `isViewer` → js/src/11-search-login.js:128 | app/src/islands/Attendance.tsx:221<br>app/src/islands/Burns.tsx:70<br>app/src/islands/DevPresenter.tsx:472<br>app/src/islands/FeedbackInbox.tsx:48<br>…+9 |
| `sigma.kibbutzHasSite` | js/src/00-bridge.js:281 | *(own logic)* | **—** |
| `sigma.kibbutzNames` | js/src/00-bridge.js:248 | *(own logic)* | app/src/islands/DayLog.tsx:84 |
| `sigma.loadAllVisitsCombined` | js/src/00-bridge.js:456 | `loadAllVisitsCombined` → js/src/09-visits.js:73 | app/src/islands/Calendar.tsx:932<br>app/src/islands/Field.tsx:153<br>app/src/islands/Gaps.tsx:87<br>app/src/islands/Presenter.tsx:123 |
| `sigma.markOrderDelivered` | js/src/00-bridge.js:393 | `quickOrderStatus` → js/src/07-orders.js:661 | **—** |
| `sigma.onLanding` | app/src/islands/Field.tsx:1090 *(island)* | *(island-provided)* | **—** |
| `sigma.openActivity` | js/src/00-bridge.js:561 | `openActivityModal` → js/src/10-activity.js:6 | app/src/islands/Calendar.tsx:674 |
| `sigma.openCommandBar` | app/src/islands/CommandBar.tsx:281 *(island)* | *(island-provided)* | **—** |
| `sigma.openDeliveryCert` | js/src/00-bridge.js:457 | `openDeliveryCert` → js/src/20-delivery-cert.js:165 | app/src/islands/CommandBar.tsx:146<br>app/src/islands/Field.tsx:823 |
| `sigma.openKibbutzEmsTask` | js/src/00-bridge.js:284 | `openKibbutzEmsTask` → js/src/13-ems.js:406 | app/src/components/home/EmsTasks.test.tsx:107<br>app/src/components/home/EmsTasks.tsx:64<br>app/src/components/home/EmsTasks.tsx:65<br>app/src/components/home/MeetingNotes.tsx:166<br>…+5 |
| `sigma.openKibbutzModal` | js/src/00-bridge.js:294 | *(own logic)* | app/src/components/home/Burns.tsx:154<br>app/src/components/home/CardActions.tsx:61<br>app/src/islands/Calendar.tsx:1053<br>app/src/islands/Calendar.tsx:1138<br>…+1 |
| `sigma.openOrder` | js/src/00-bridge.js:392 | `invEditOrder` → js/src/07-orders.js:811 | app/src/islands/Alerts.tsx:56<br>app/src/islands/InventoryStrip.tsx:87<br>app/src/islands/StockChange.tsx:133 |
| `sigma.openVisitQuick` | js/src/00-bridge.js:356 | *(own logic)* | app/src/components/home/CardActions.tsx:50<br>app/src/components/home/CardActions.tsx:59<br>app/src/components/Nav.tsx:63<br>app/src/components/Nav.tsx:65<br>…+11 |
| `sigma.openVisitsReport` | js/src/00-bridge.js:560 | `openVisitsToolsModal` → js/src/09-visits.js:1170 | app/src/islands/Calendar.tsx:673 |
| `sigma.orders` | js/src/00-bridge.js:391 | *(own logic)* | app/src/islands/InventoryStrip.tsx:40<br>app/src/islands/StockChange.tsx:91 |
| `sigma.passPending` | js/src/00-bridge.js:474 | *(own logic)* | **—** |
| `sigma.poolStock` | js/src/00-bridge.js:386 | `poolStockMap` → js/src/08-inventory.js:24 | app/src/islands/Field.tsx:697<br>app/src/islands/StockChange.tsx:58 |
| `sigma.prefillOpenItems` | js/src/00-bridge.js:419 | *(own logic)* | app/src/islands/Field.tsx:1172 |
| `sigma.productNames` | js/src/00-bridge.js:254 | *(own logic)* | app/src/islands/DayLog.tsx:85 |
| `sigma.products` | js/src/00-bridge.js:388 | `getActiveProducts` → js/src/06-products.js:2 | app/src/islands/InventoryStrip.tsx:43<br>app/src/islands/StockChange.tsx:62 |
| `sigma.pushDeviceCount` | js/src/00-bridge.js:515 | `pushDeviceCount` → js/src/22-push.js:136 | app/src/islands/Settings.tsx:176 |
| `sigma.pushEnable` | js/src/00-bridge.js:513 | `pushEnable` → js/src/22-push.js:111 | app/src/islands/Settings.tsx:137 |
| `sigma.pushState` | js/src/00-bridge.js:511 | `pushState` → js/src/22-push.js:102 | app/src/islands/Settings.tsx:122 |
| `sigma.pushTest` | js/src/00-bridge.js:514 | `pushTest` → js/src/22-push.js:124 | app/src/islands/Settings.tsx:160 |
| `sigma.refreshData` | js/src/00-bridge.js:395 | `refreshData` → js/src/10-activity.js:629 | app/src/islands/StockChange.tsx:153 |
| `sigma.remintOnce` | js/src/00-bridge.js:471 | *(own logic)* | **—** |
| `sigma.saveVisitFromData` | js/src/00-bridge.js:403 | *(own logic)* | app/src/islands/DayLog.tsx:393<br>app/src/islands/Field.tsx:652 |
| `sigma.sbAuthPass` | js/src/00-bridge.js:339 | *(own logic)* | **—** |
| `sigma.sbPass` | js/src/00-bridge.js:334 | *(own logic)* | app/src/islands/DayLog.tsx:134 |
| `sigma.sessionExpired` | js/src/00-bridge.js:464 | *(own logic)* | **—** |
| `sigma.setAttPerson` | js/src/00-bridge.js:496 | `setAttPerson` → js/src/11-search-login.js:171 | app/src/islands/Attendance.tsx:279 |
| `sigma.showPage` | js/src/00-bridge.js:236 | `showPage` → js/src/00-bridge.js:183 | app/src/components/home/Burns.tsx:351<br>app/src/components/MoreSheet.tsx:138<br>app/src/components/MoreSheet.tsx:162<br>app/src/components/Nav.tsx:80<br>…+10 |
| `sigma.STAFF_PEOPLE` | js/src/00-bridge.js:576 | *(own logic)* | app/src/islands/CommandBar.tsx:50 |
| `sigma.staffSendMessage` | js/src/00-bridge.js:571 | *(own logic)* | app/src/islands/CommandBar.tsx:63 |
| `sigma.toast` | js/src/00-bridge.js:581 | *(own logic)* | app/src/components/UserChip.tsx:80<br>app/src/islands/CommandBar.tsx:65<br>app/src/islands/CommandBar.tsx:68<br>app/src/islands/CommandBar.tsx:216<br>…+3 |
| `sigma.track` | js/src/00-bridge.js:241 | *(own logic)* | **—** |
| `sigma.visitDraftDiscard` | js/src/00-bridge.js:444 | `visitDraftDiscard` → js/src/09-visits.js:605 | app/src/islands/Field.tsx:673 |
| `sigma.visitDraftFor` | js/src/00-bridge.js:443 | `visitDraftFor` → js/src/09-visits.js:589 | app/src/components/home/CardActions.tsx:39<br>app/src/components/Nav.tsx:61<br>app/src/islands/Field.tsx:603<br>app/src/islands/Field.tsx:1299<br>…+1 |
| `sigma.visitDraftId` | js/src/00-bridge.js:451 | `visitDraftId` → js/src/09-visits.js:20 | app/src/islands/Field.tsx:615 |
| `sigma.visitDraftPut` | js/src/00-bridge.js:448 | `visitDraftPut` → js/src/09-visits.js:748 | app/src/islands/Field.tsx:569 |

Bridge entries no island calls today (legacy-side or reserved): `calAddEvent`, `canSeeAttendance`, `certFromVisit`, `emsPatchTask`, `emsWrite`, `ensurePass`, `kibbutzHasSite`, `markOrderDelivered`, `passPending`, `remintOnce`, `sbAuthPass`, `sessionExpired`, `track`.

## (b) Bus — `window.sigmaBus`: source → event → consumers

Legacy announces with `sigmaEmit(name, detail)`; React subscribes with `useSigmaEvent(name)`. The declared
vocabulary is the `SigmaEvent` union in `app/src/bridge.ts` — a name outside it is a typo, not a feature.

| event | emitted by | consumed by |
|---|---|---|
| `attendance-saved` | js/src/04-attendance-daily.js:90 | app/src/islands/Attendance.tsx:245 |
| `burns-changed` | app/src/components/home/Burns.tsx:63 | js/src/24-meter-burns.js:514<br>app/src/components/home/Burns.tsx:56 |
| `checkin-created` | app/src/islands/Field.tsx:1017 | **—** |
| `dayplan-changed` | app/src/islands/Calendar.tsx:975 | app/src/islands/Field.tsx:983<br>app/src/islands/Field.tsx:1288 |
| `ems-cache-synced` | js/src/13-ems.js:90<br>js/src/14-calendar.js:584 | app/src/bridge.ts:398<br>app/src/components/home/EmsTasks.tsx:36<br>app/src/islands/Calendar.tsx:915<br>app/src/islands/Field.tsx:178<br>app/src/islands/Home.tsx:98<br>app/src/islands/Presenter.tsx:110 |
| `ems-queue-flushed` | js/src/13-ems.js:362 | app/src/components/home/MeetingNotes.tsx:52 |
| `feedback-changed` | app/src/islands/Feedback.tsx:56 | app/src/islands/FeedbackInbox.tsx:235 |
| `holidays-loaded` | js/src/04-attendance-daily.js:51 | app/src/islands/Attendance.tsx:252 |
| `internal-tasks-changed` | app/src/components/home/InternalTasks.tsx:40 | app/src/components/home/InternalTasks.tsx:29 |
| `kibbutzim-published` | app/src/islands/Home.tsx:49 | app/src/islands/CommandBar.tsx:253 |
| `notes-changed` | app/src/components/home/MeetingNotes.tsx:87 | app/src/components/home/MeetingNotes.tsx:46 |
| `onboarding-changed` | app/src/components/home/OnboardingProgress.tsx:44 | app/src/components/home/OnboardingProgress.tsx:33 |
| `session-expired` | js/src/00-bridge.js:116<br>app/src/lib/session.ts:126 | app/src/bridge.ts:400<br>app/src/components/ReLoginSheet.tsx:52<br>app/src/lib/session.test.ts:96 |
| `stock-changed` | js/src/07-orders.js:1214<br>js/src/09-visits.js:984<br>app/src/islands/StockChange.tsx:152 | app/src/islands/Alerts.tsx:112<br>app/src/islands/InventoryStrip.tsx:75<br>js/src/08-inventory.js:135 |
| `theme-changed` | app/src/lib/theme.ts:52 | app/src/components/ThemeToggle.tsx:12<br>app/src/components/ui/sonner.tsx:18 |
| `user-changed` | js/src/11-search-login.js:234<br>js/src/11-search-login.js:255<br>js/src/15-login-gate.js:202<br>js/src/15-login-gate.js:215<br>js/src/15-login-gate.js:342<br>…+1 | app/src/bridge.ts:399<br>app/src/islands/Attendance.tsx:253<br>app/src/islands/FeedbackInbox.tsx:228<br>app/src/islands/Field.tsx:157<br>app/src/islands/Usage.tsx:217<br>app/src/lib/currentPage.ts:27<br>…+2 |
| `visit-draft-changed` | js/src/09-visits.js:536<br>js/src/09-visits.js:567<br>js/src/09-visits.js:634<br>js/src/09-visits.js:769 | app/src/lib/visitDrafts.ts:66 |
| `visit-form-open` | js/src/02-init-attendance.js:13 | js/src/00-bridge.js:143<br>js/src/00-bridge.js:434<br>app/src/components/home/CardActions.tsx:49<br>app/src/islands/Field.tsx:1189 |
| `visit-saved` | js/src/09-visits.js:1013<br>js/src/09-visits.js:1130 | app/src/islands/Attendance.tsx:246<br>app/src/islands/Calendar.tsx:916<br>app/src/islands/Field.tsx:156<br>app/src/islands/Field.tsx:1295<br>app/src/islands/Presenter.tsx:111<br>app/src/lib/visitDrafts.ts:67<br>…+2 |
| `work-session-saved` | app/src/components/home/WorkTimerStopSheet.tsx:102 | **—** |

## (c) Islands — placeholder in `index.html` ↔ mount in `main.tsx`

| placeholder | index.html | mounted at |
|---|---|---|
| `#sigma-alerts` | :221 | app/src/islands/Alerts.tsx:195<br>app/src/main.tsx:182 |
| `#sigma-attendance` | :470 | app/src/islands/Attendance.tsx:526<br>app/src/main.tsx:210 |
| `#sigma-burns` | :294 | app/src/islands/Burns.tsx:87<br>app/src/main.tsx:151 |
| `#sigma-burns-modal` | :639 | app/src/main.tsx:151 |
| `#sigma-calendar` | :555 | app/src/islands/Calendar.tsx:1262<br>app/src/main.tsx:229 |
| `#sigma-ceo` | :1245 | **—** |
| `#sigma-command` | :1240 | app/src/islands/CommandBar.tsx:350<br>app/src/main.tsx:258 |
| `#sigma-daylog` | :1230 | app/src/islands/DayLog.tsx:537<br>app/src/main.tsx:347 |
| `#sigma-dev-presenter` | :1236 | app/src/islands/DevPresenter.tsx:461<br>app/src/main.tsx:436 |
| `#sigma-feedback` | :1221 | app/src/islands/Feedback.tsx:587<br>app/src/main.tsx:167 |
| `#sigma-feedback-inbox` | :1222 | app/src/islands/FeedbackInbox.tsx:331<br>app/src/main.tsx:194 |
| `#sigma-field` | :1220 | app/src/islands/Field.tsx:1392<br>app/src/main.tsx:133 |
| `#sigma-gaps` | :1228 | app/src/islands/Gaps.tsx:290<br>app/src/main.tsx:293 |
| `#sigma-header-actions` | :226 | app/src/islands/HeaderActions.tsx:68<br>app/src/main.tsx:258 |
| `#sigma-health-modal` | :644 | app/src/main.tsx:160 |
| `#sigma-holidays` | :1224 | app/src/islands/Holidays.tsx:154<br>app/src/main.tsx:243 |
| `#sigma-home` | :297 | app/src/islands/Home.tsx:252<br>app/src/main.tsx:115 |
| `#sigma-import` | :1226 | app/src/islands/ImportNotes.tsx:377<br>app/src/main.tsx:477 |
| `#sigma-inventory-strip` | :419 | app/src/islands/InventoryStrip.tsx:209<br>app/src/main.tsx:189 |
| `#sigma-meeting-review` | :1239 | app/src/islands/MeetingReview.tsx:643 |
| `#sigma-modal-meetings` | :633 | app/src/main.tsx:142 |
| `#sigma-nav` | :1252 | app/src/main.tsx:81 |
| `#sigma-pm-today` | :1244 | app/src/islands/PmToday.tsx:27<br>app/src/main.tsx:123 |
| `#sigma-presenter` | :1233 | app/src/islands/Presenter.tsx:687<br>app/src/main.tsx:392 |
| `#sigma-refresh` | :1250 | app/src/components/PullToRefresh.tsx:175<br>app/src/main.tsx:97 |
| `#sigma-relogin` | :1247 | app/src/components/ReLoginSheet.tsx:107 |
| `#sigma-settings` | :1227 | app/src/islands/Settings.tsx:406<br>app/src/main.tsx:269 |
| `#sigma-stock-change` | :1231 | app/src/islands/StockChange.tsx:318<br>app/src/main.tsx:175 |
| `#sigma-toaster` | :1251 | app/src/main.tsx:80 |
| `#sigma-today` | :291 | app/src/islands/Field.tsx:1393<br>app/src/main.tsx:133 |
| `#sigma-usage` | :1225 | app/src/islands/Usage.tsx:329<br>app/src/main.tsx:250 |

## (d) Supabase tables the client reads or writes

| table | migration | referenced at |
|---|---|---|
| `attendance` | db/calendar_absences.sql | supabase/functions/push-send/index.ts:112 |
| `calendar_absences` | db/calendar_absences.sql | app/src/islands/Calendar.tsx:100<br>app/src/islands/Calendar.tsx:1027 |
| `company_holidays` | db/company_holidays.sql | app/src/islands/Holidays.tsx:30<br>app/src/islands/Holidays.tsx:63<br>app/src/islands/Holidays.tsx:69<br>…+1 |
| `day_plans` | db/day_plans.sql | app/src/islands/Calendar.tsx:112<br>app/src/islands/Calendar.tsx:968<br>app/src/islands/Field.tsx:101<br>…+1 |
| `feedback` | db/feedback.sql | app/src/islands/Feedback.tsx:78<br>app/src/islands/FeedbackInbox.tsx:60 |
| `field_checkins` | db/field_checkins.sql | app/src/islands/Field.tsx:87<br>app/src/islands/Field.tsx:1012<br>app/src/islands/Field.tsx:1076<br>…+4 |
| `generators` | db/meter_burns.sql | app/src/components/home/Burns.tsx:46<br>app/src/components/home/Burns.tsx:121 |
| `internal_tasks` | db/internal_tasks.sql | app/src/components/home/InternalTasks.tsx:20<br>app/src/components/home/InternalTasks.tsx:51<br>app/src/components/home/InternalTasks.tsx:60<br>…+2 |
| `inventory_alerts` | db/inventory_pool.sql | app/src/islands/Alerts.tsx:46<br>supabase/functions/push-send/index.ts:605 |
| `kibbutz_meeting_notes` | db/kibbutz_meeting_notes.sql | app/src/components/home/MeetingNotes.tsx:30<br>app/src/components/home/MeetingNotes.tsx:69<br>app/src/components/home/MeetingNotes.tsx:96<br>…+5 |
| `kibbutzim` | db/kibbutzim.sql | app/src/components/home/KibbutzSheet.tsx:164<br>app/src/components/home/KibbutzSheet.tsx:165<br>app/src/components/home/KibbutzSheet.tsx:185<br>…+3 |
| `meeting_events` | db/meeting_events.sql | app/src/lib/meetingRun.ts:62 |
| `meeting_sessions` | db/meeting_sessions.sql | app/src/lib/meetingRun.ts:42<br>app/src/lib/meetingRun.ts:70 |
| `meter_burns` | db/meter_burns.sql | app/src/components/home/Burns.tsx:39<br>app/src/components/home/Burns.tsx:95 |
| `movements` | db/rls_legacy_lockdown.sql | app/src/islands/StockChange.tsx:146 |
| `onboarding_steps` | db/onboarding_steps.sql | app/src/components/home/OnboardingProgress.tsx:24<br>app/src/components/home/OnboardingProgress.tsx:57<br>app/src/components/home/OnboardingProgress.tsx:73 |
| `onboarding_templates` | db/onboarding_templates.sql | app/src/components/home/OnboardingProgress.tsx:69<br>app/src/components/home/OnboardingProgress.tsx:81<br>app/src/components/home/OnboardingProgress.tsx:92 |
| `orders` | db/orders_ems_task_id.sql | app/src/islands/Field.tsx:131<br>supabase/functions/push-send/index.ts:633<br>supabase/functions/push-send/index.ts:637<br>…+1 |
| `products` | db/inventory_pool.sql | app/src/islands/InventoryStrip.tsx:111<br>app/src/islands/InventoryStrip.tsx:127 |
| `push_log` | db/push_log.sql | supabase/functions/push-send/index.ts:195<br>supabase/functions/push-send/index.ts:250<br>supabase/functions/push-send/index.ts:320<br>…+3 |
| `push_subscriptions` | db/push_subscriptions.sql | supabase/functions/push-send/index.ts:232<br>supabase/functions/push-send/index.ts:243 |
| `site_contacts` | db/site_contacts.sql | app/src/components/home/workTimerApi.ts:39<br>app/src/components/home/WorkTimerStopSheet.tsx:57<br>app/src/lib/emsChain.ts:91 |
| `stock_recounts` | db/stock_recounts.sql | app/src/islands/StockChange.tsx:142 |
| `transcribe_log` | db/feedback.sql | supabase/functions/transcribe/index.ts:98 |
| `usage_events` | db/usage_events.sql | app/src/lib/track.ts:193<br>supabase/functions/push-send/index.ts:496 |
| `user_settings` | db/user_settings.sql | app/src/lib/settings.ts:233<br>app/src/lib/settings.ts:257<br>supabase/functions/push-send/index.ts:150 |
| `visit_drafts` | db/visit_drafts.sql | supabase/functions/push-send/index.ts:414 |
| `visits` | db/supabase_schema.sql | supabase/functions/push-send/index.ts:113<br>supabase/functions/push-send/index.ts:413 |
| `work_sessions` | db/work_sessions.sql | app/src/components/home/WorkTimerStopSheet.tsx:88 |

**Live check** (controller, read-only — `select table_name from information_schema.tables where table_schema = 'public'`)
must contain all 29: `attendance`, `calendar_absences`, `company_holidays`, `day_plans`, `feedback`, `field_checkins`, `generators`, `internal_tasks`, `inventory_alerts`, `kibbutz_meeting_notes`, `kibbutzim`, `meeting_events`, `meeting_sessions`, `meter_burns`, `movements`, `onboarding_steps`, `onboarding_templates`, `orders`, `products`, `push_log`, `push_subscriptions`, `site_contacts`, `stock_recounts`, `transcribe_log`, `usage_events`, `user_settings`, `visit_drafts`, `visits`, `work_sessions`.

## (e) Pages — `showPage(x)` → view element → gate

| page | view element | `canShowPage` | called from |
|---|---|---|---|
| `attendance` | `#attendance-view` (index.html:466) | ✓ | js/src/22-push.js:350<br>js/src/22-push.js:351 |
| `burns` | `#burns-view` (index.html:591) | ✓ | app/src/components/home/Burns.tsx:351 |
| `calendar` | `#calendar-view` (index.html:551) | ✓ | app/src/islands/CommandBar.tsx:113<br>app/src/islands/CommandBar.tsx:219 |
| `inventory` | `#inventory-view` (index.html:344) | ✓ | js/src/07-orders.js:657<br>js/src/11-search-login.js:116<br>js/src/22-push.js:349<br>app/src/components/Nav.tsx:119<br>…+2 |
| `kibbutz` | `#kibbutz-view` (index.html:237) | ✓ | js/src/11-search-login.js:97<br>js/src/22-push.js:363<br>app/src/components/Nav.tsx:80<br>app/src/components/Nav.tsx:92 |

Gated in `canShowPage` with no `showPage()` caller in the source (reached by a remembered landing or a ⋯ row that passes the name through a variable): `dev`, `pushlog`.

## (f) Edge functions — client `mode` ↔ `supabase/functions/<fn>/index.ts`

| function | mode | implemented | client call sites |
|---|---|---|---|
| `calendar` | `(default)` | *(no mode field)* | js/src/14-calendar.js:161<br>js/src/14-calendar.js:182 |
| `clockify` | `(default)` | *(no mode field)* | app/src/components/home/workTimerApi.ts:13 |
| `ems-auth` | `(default)` | *(no mode field)* | js/src/15-login-gate.js:79 |
| `ems-auth` | `viewer` | ✓ | js/src/15-login-gate.js:325 |
| `github` | `(default)` | *(no mode field)* | js/src/18-dev-tasks.js:257<br>js/src/18-dev-tasks.js:904<br>app/src/islands/FeedbackInbox.tsx:73<br>app/src/lib/devBoard.ts:23 |
| `parse-daylog` | `(default)` | *(no mode field)* | app/src/islands/DayLog.tsx:107 |
| `parse-daylog` | `correction` | ✓ | app/src/islands/DayLog.tsx:136 |
| `parse-order` | `(default)` | *(no mode field)* | js/src/07-orders.js:232 |
| `push-send` | `(default)` | *(no mode field)* | js/src/22-push.js:151 |
| `push-send` | `attendanceReminder` | ✓ | js/src/22-push.js:285 |
| `push-send` | `feedbackNew` | ✓ | app/src/islands/Feedback.test.tsx:148<br>app/src/islands/Feedback.tsx:86 |
| `push-send` | `gapReminder` | ✓ | js/src/22-push.js:313 |
| `transcribe` | `(default)` | *(no mode field)* | app/src/lib/speech.ts:275<br>app/src/lib/speech.ts:306 |

`push-send` modes with no client caller (cron / server-triggered by design): `approveOrder`, `attendanceCron`, `inventoryAlert`, `inventoryDigest`, `usageDigest`, `visitCron`.

## (g) ⋯ עוד registry (`app/src/lib/registry.ts`)

| id | icon | registered at |
|---|---|---|
| `(dynamic)` | `—` | app/src/lib/registry.ts:38 |
| `burns-table` | `Flame` | app/src/islands/Burns.tsx:64 |
| `dev-presenter` | `GitPullRequest` | app/src/islands/DevPresenter.tsx:464 |
| `dev-presenter` | `GitPullRequest` | app/src/main.tsx:460 |
| `feedback` | `MessageSquarePlus` | app/src/islands/Feedback.tsx:589 |
| `feedback-inbox` | `Inbox` | app/src/islands/FeedbackInbox.tsx:333 |
| `field-journal` | `Notebook` | app/src/islands/DayLog.tsx:540 |
| `field-journal` | `Notebook` | app/src/main.tsx:371 |
| `gaps` | `ClipboardList` | app/src/islands/Gaps.tsx:294 |
| `gaps` | `ClipboardList` | app/src/main.tsx:321 |
| `holidays` | `CalendarCheck` | app/src/islands/Holidays.tsx:158 |
| `import-meeting` | `FileDown` | app/src/islands/ImportNotes.tsx:383 |
| `new-kibbutz` | `Home` | app/src/islands/Home.tsx:112 |
| `presenter` | `Presentation` | app/src/islands/Presenter.tsx:690 |
| `presenter` | `Presentation` | app/src/main.tsx:416 |
| `settings` | `Settings` | app/src/islands/Settings.tsx:408 |
| `stock-change` | `Package` | app/src/islands/StockChange.tsx:320 |
| `usage` | `TrendingUp` | app/src/islands/Usage.tsx:331 |

## (h) EMS access — the gateway (spec §7o)

Every EMS operation goes through `EmsGateway` (`app/src/lib/ems/gateway.ts`), implemented
today by `ems-rest` (`app/src/lib/ems/adapters/rest.ts`) and published to legacy as
`sigma.ems` by `main.tsx`. The adapter is the ONLY place allowed to build an EMS URL or
read raw EMS JSON; `test-integration.mjs` fails on a direct EMS call anywhere else.

Direct EMS call sites: **1** in the adapter, **42** in files still awaiting migration, **0** stray.

| file | direct EMS calls | why it is not behind the gateway yet |
|---|---|---|
| `app/src/bridge.ts` | 1 | the TYPE DECLARATION of the adapter transport (`emsApi(path: string…)`), not a call site |
| `js/src/12-reports.js` | 3 | the proxy ITSELF — emsApi()/emsProxyCall() are the REST transport the adapter calls |
| `js/src/13-ems.js` | 5 | the offline queue + cache crawl (emsSendItem/emsSyncCache); replays queued OPERATIONS, so it moves with the queue, not before it |
| `js/src/14-calendar.js` | 9 | the legacy EMS tab (create/patch/comments/sites/users/meter lookup) — a UI rewrite, not a call swap |
| `js/src/15-login-gate.js` | 3 | login / verify-otp / resend-otp — the auth operations; they run BEFORE there is a session for the gateway to use |
| `js/src/24-meter-burns.js` | 2 | the meter-burn sync + meter search; paginates with its own page loop |
| `supabase/functions/_shared/http.ts` | 1 | Deno emsValid() login probe — the ONE copy the edge functions import (spec §7o "server side too") |
| `supabase/functions/calendar/index.ts` | 3 | Deno emsValid() login probe — needs the Deno build of the adapter (spec §7o "server side too") |
| `supabase/functions/clockify/index.ts` | 2 | Deno emsValid() login probe |
| `supabase/functions/ems-auth/index.ts` | 4 | Deno — mints the bridge JWT; IS the login operation |
| `supabase/functions/github/index.ts` | 2 | Deno emsValid() login probe |
| `supabase/functions/parse-daylog/index.ts` | 2 | Deno emsValid() login probe |
| `supabase/functions/parse-order/index.ts` | 2 | Deno emsValid() login probe |
| `supabase/functions/push-send/index.ts` | 1 | Deno — the digest crawl runs on a cron with no browser bridge |
| `supabase/functions/transcribe/index.ts` | 2 | Deno emsValid() login probe |

---

# Integration map — the hand-written half

**This file holds the PROSE.** The tables — who calls what, who emits what, which island mounts
where, which table has a migration — are generated from the source by
`node scripts/integration-map.mjs` into `docs/integration-map.md`, which appends this file
verbatim at its end. Read `docs/integration-map.md`; edit THIS one.

The split exists because the two halves rot differently. A table of `file:line` facts goes stale
the moment anyone touches the code and nobody notices (this file carried a call to
`flatWithHeadings` for days after Task 4 renamed it `rankedRows`), so it is regenerated and
asserted by `test-integration.mjs`. The WHY — the reasoning behind a channel, a standing ruling,
the trap someone already fell into — cannot be derived from a grep and belongs here, by hand.

---

The "סיגמה 2.00" redesign runs React islands beside 13k lines of legacy JS, so a feature is
never finished when its own screen works: **every surface that shows the same data has to hear
about a write.** This file is the register of those channels. The plan's Global Constraints
make it mandatory — a task that adds a write, an event or a `window.sigma*` surface adds its
row here in the same commit.

Channels, in the order of how loosely they couple:

1. **`sigmaBus` CustomEvent** — a legacy module or an island announces "something changed";
   anyone interested subscribes through `useSigmaEvent`. No imports either way.
2. **TanStack query key** — the shared cache. Invalidating a key refreshes every island reading it.
3. **`window.sigma.*` (bridge)** — React → legacy calls. Declared in `js/src/00-bridge.js`,
   typed in `app/src/bridge.ts`.
4. **`window.sigmaHome` / DOM attribute** — an island's own surface for legacy code and other
   islands, where a bus event would be too coarse (it needs a return value or a target).

## Events on `sigmaBus`

| Event | Emitted by | Consumers |
|---|---|---|
| `user-changed` | `js/src/11-search-login.js:227,248` · `js/src/15-login-gate.js:93,184,194` | `bridge.ts:useCurrentUser` (→ `components/Nav.tsx`, `islands/Home.tsx`, `islands/ModalMeetings.tsx`, `islands/ImportNotes.tsx`) · `bridge.ts:useEmsConnected` |
| `ems-cache-synced` | `js/src/13-ems.js:60` (`emsCacheSave`) | `bridge.ts:useEmsConnected` · `islands/Home.tsx:87` (re-runs `decorateCards`) · `components/home/EmsTasks.tsx:useCardEmsTasks` (re-reads `sigma.emsCacheTasksForKibbutz` so the card's open-task list stays live) |
| `kibbutzim-published` | `islands/Home.tsx:publishToLegacy` (Task 20) | `islands/CommandBar.tsx` — Ctrl+K snapshots `window.KIBBUTZIM` / `localStorage.kibbutzim_v1` once per open, and neither store notifies anyone. On a cold boot the publish can land a few ms AFTER the first card is in the DOM, and a Ctrl+K inside that window left the bar with no kibbutzim for as long as it stayed open. It now rebuilds on this event while open, keeping what the person typed. |
| `visit-saved` | `js/src/09-visits.js:413` | no island consumer yet — the cards' last-visit line is still a legacy decorator |
| `visit-form-open` | `js/src/02-init-attendance.js:13` (`switchTab('visit')`) | `components/home/CardActions.tsx` (🚚 waits for the form before asking for a cert) |
| `theme-changed` | `app/src/lib/theme.ts:applyTheme` | `components/ThemeToggle.tsx:12` · `components/ui/sonner.tsx:18` |
| **`notes-changed`** | `components/home/MeetingNotes.tsx:emitNotesChanged` — after import (`islands/ImportNotes.tsx:saveParsedMeeting`), ➕ link (`linkNoteToTask`), ✓ done (`setNoteDone`), pending→real id (`resolvePendingTasks`) | `MeetingNotes.tsx:listenForNotesChanges` → invalidates `['meetingNotes']`, which repaints **every card** (`components/home/KibbutzCard.tsx`) and the modal tab (`islands/ModalMeetings.tsx`). ONE listener per page, at module scope — a listener per component would mean one per card. |
| **`feedback-changed`** | `islands/Feedback.tsx:emitFeedbackChanged` — after a feedback is sent (and after a status flip / a bug→card in the inbox, both of which also invalidate the key directly) | `islands/FeedbackInbox.tsx` → invalidates `['feedback']`, so an admin with the inbox open sees the new row without reloading |
| **`session-expired`** | `js/src/00-bridge.js:sigmaSessionExpired` — the ONE funnel for every 401: `emsApi` (`js/src/12-reports.js`), the legacy REST reads (`js/src/01-data.js:sbGet`), the supabase-js interceptor (`app/src/lib/supabase.ts:sessionAwareFetch`) and the 12 h session cap. **Debounced (4 s)**, so five concurrent 401s are one event | `components/ReLoginSheet.tsx` (the one re-login sheet, mounted on every page) · `bridge.ts:useEmsConnected` (the connection flipped off) · `lib/session.ts:useEmsGate` → every island re-renders its gate |
| **`checkin-created`** | `islands/Field.tsx` — after a field worker picks a kibbutz in the arrival sheet and the `field_checkins` row is written (spec §5.1). `detail = {id, kibbutz, person}` | the `היום` strip (`islands/Field.tsx` `Today`, via `['checkins', person, day]`); anything that wants to know he is on site. The row is ALSO the only thing that starts the 2 h `visitCron` clock. |
| **`stock-changed`** | `js/src/09-visits.js` (a visit supplied from the pool) · `js/src/07-orders.js` (a supplier delivery landed in it) · `app/src/islands/StockChange.tsx` (a 🔢 recount corrected it) — inventory spec §4b | `js/src/08-inventory.js` — re-renders the 🏢 pool and the red-line banner immediately, instead of waiting for the next data poll. One listener, at module scope. |
| **`attendance-saved`** | `js/src/04-attendance-daily.js:attSaveRow` — every day filed, from the legacy form OR from the island through `sigma.attSave`. `detail = {id, person, dayType, note, date}` | `islands/Attendance.tsx` → invalidates `['attRows']`, so the grid, the three KPIs and the missing chips all move together |
| **`holidays-loaded`** | `js/src/04-attendance-daily.js:attLoadHolidays` — the session's `company_holidays` list landed in `SHEET_DATA.holidays` (once per session) | the legacy report redraws (a חג stops being a red row); `islands/Attendance.tsx` reads the same list through `sigma.attHolidays()` |
| **`burns-changed`** | `components/home/Burns.tsx:emitBurnsChanged` — after every 🔥 צריבות write (✅ נצרב from the card modal, the briefing checklist or a bulk mark; ⚠ בעיה; ⚡ גנרטור; a new `generators` row) | `Burns.tsx:listenForBurnChanges` → invalidates `['meterBurns']` + `['burnGenerators']`, which repaints the card chip, the card-modal section and the landing strip at once · `js/src/24-meter-burns.js` reloads the full table if it is open. ONE listener per page, at module scope — a listener per component would mean one per card. |
| **`ems-queue-flushed`** | `js/src/13-ems.js:emsQueueFlush` — `detail.created = [{queueId, taskId}]`, one entry per `createTask` that went out | `components/home/MeetingNotes.tsx:resolvePendingTasks` — swaps every `ems_task_id = 'pending:<queueId>'` for the real task id. Without it a bullet linked while offline keeps a 🔗 that can never open anything. |
| **`onboarding-changed`** | `components/home/OnboardingProgress.tsx:emitOnboardingChanged` — after a step tap (`tapStep`) and after a fresh 🆕 kibbutz spawns its checklist (`spawnOnboardingForNewKibbutz`, called from `KibbutzSheet.tsx` on create) | `OnboardingProgress.tsx:listenForOnboardingChanges` → invalidates `['onboardingSteps']`, repainting every 🆕 card's strip at once. ONE listener per page, at module scope — same pattern as `internal-tasks-changed`. |

## Session & access (spec §7n, Task 21)

| Surface | Direction | Why |
|---|---|---|
| `sigma.sessionExpired(reason)` → bool | React → legacy (`window.sigmaSessionExpired`) | the debouncer has to be SHARED by both halves — a legacy 401 and an island 401 arriving together must raise one sheet, so the canonical one lives in the legacy bundle and `app/src/lib/session.ts:notifySessionExpired` routes into it (its own local debounce is only the no-bridge fallback). Returns true when this call is the one that announced the expiry, which is what the tests assert. |
| `sigma.beginReLogin()` | React → legacy (`window.sigmaBeginReLogin`) | hands over to the sign-in while keeping the place: `ems_return_page_v1` + `ems_return_scroll_v1` in `sessionStorage`, then the gate (`js/src/15-login-gate.js` restores both). The visit draft needs nothing — `js/src/09-visits.js` already mirrored it to `visitDrafts_v2`. |
| `window.sigmaOpenReLogin()` | island → legacy | assigned by `ReLoginSheet.tsx` while it is mounted. `emsRequireLogin` (`js/src/12-reports.js`) calls it, so a legacy page raises the SAME sheet; the old modal is only what a page without the React bundle gets, and neither path jumps to the retired EMS page any more (§7m G3). |
| `app/src/lib/session.ts:useEmsGate()` + `components/EmsGate.tsx` | island-side | "nothing without a sign-in" as a property of the shell: every island wraps its content, and renders `<LoginRequired/>` instead when the gate is closed. `?login=0` opens it ONLY on localhost / `*.githack.com` (mirrored in `js/src/11-search-login.js`, where `LOGIN_FLAG` lives). |
| `app/src/lib/supabase.ts:sessionAwareFetch` | island-side | the one supabase-js interceptor — read, write and RPC alike — so a `401`/`PGRST301` anywhere reaches the funnel. Its sibling `bearerForRequest()` now MINTS a pass for reads too, because the business tables are authenticated-only (`db/rls_authenticated_only.sql`). |

## Postgres functions (RPC)

| Function | Called by | Why a function |
|---|---|---|
| `feedback_admin_update(p_id, p_actor, p_status, p_github_issue)` (`db/feedback.sql`) | `islands/FeedbackInbox.tsx` (status buttons, the `github_issue` stamp) | `feedback` has **no UPDATE/DELETE policy and the privilege is revoked**, so a row cannot be changed directly at all. **The app has ONE shared `authenticated` JWT** minted from the EMS gate (`js/src/01-data.js`), so Postgres cannot tell עידן from ניתאי and RLS cannot be the identity check. The function is `SECURITY DEFINER` and validates the `actor` the client passes against the `app_admins` table (עידן, עמיחי) — defence in depth, not authentication: it stops every ordinary path and any accidental write, and tampering would mean deliberately forging an actor name. Real per-user identity needs per-user Supabase auth (own piece of work). Verified with `set local role authenticated`: direct UPDATE/DELETE → `42501`, a non-admin actor → `42501`, a bad status → `22023`, anon SELECT → 0 rows. |
| `import_meeting_notes(jsonb)` (`db/kibbutz_meeting_notes_import.sql`) | `islands/ImportNotes.tsx:saveParsedMeeting` | the import must be ONE transaction and must not destroy human work. A client-side DELETE+INSERT wiped `ems_task_id`/`done_at` on every re-import and left a hole if it failed in between. The function upserts on the unique key, keeps the link and the ✓, stamps `text_changed_at` when a linked bullet's wording changed, and deletes only the rows the new parse dropped. `SECURITY INVOKER`, so RLS still refuses an anon caller. |

## Query keys

| Key | Written by | Read by |
|---|---|---|
| `['kibbutzim']` | `islands/Home.tsx` (create/edit/archive) | `islands/Home.tsx` · `islands/ImportNotes.tsx` (the parser's name catalog — the import must never resolve against a staler list than the cards do) |
| `['meetingNotes']` | `islands/ImportNotes.tsx` · `components/home/MeetingNotes.tsx` | `components/home/MeetingNotes.tsx` (cards + modal tab) |
| `['feedback']` | `islands/Feedback.tsx:sendFeedback` (via `feedback-changed`) · `islands/FeedbackInbox.tsx` (status flip, `github_issue`) | `islands/FeedbackInbox.tsx` (the admin inbox) |
| `['gh-parents']` | — (read-only, `staleTime` 10 min) | `islands/FeedbackInbox.tsx` — the Main Fields parent picker, from the `github` function's `listParents` mode |
| `['checkins', person, day]` | `islands/Field.tsx` (a check-in, a `visitDismiss` deep link) | `islands/Field.tsx` — the arrival sheet's "already here today" and the היום strip |
| `['dayPlan', person, day]` | — (read-only; `day_plans` is the calendar task's table and is **feature-detected** — a missing table answers `[]`, never an error) | `islands/Field.tsx` — the arrival order and the strip's route |
| `['openOrders']` | — (read-only) | `islands/Field.tsx` — "לפני שיוצאים" stock rows, and whether 🚚 has anything to hand over |
| `['meterBurns']` | `components/home/Burns.tsx` (`markBurned` / `markUnburned` / `markIssue` / `assignGenerator`, all via `burns-changed`) | `components/home/Burns.tsx` — the card chip (`BurnChip`), the card-modal section (`BurnsPanel`) and the landing strip (`BurnsStrip`) · `islands/Field.tsx` — the briefing's `burn` checklist rows. **`enabled` is the role gate**: someone outside the project's audience never issues the query at all. |
| `['burnGenerators']` | `components/home/Burns.tsx:ensureGenerator` | `components/home/Burns.tsx:BurnsPanel` — the ⚡ name on a meter row and the ⚡ שבץ לגנרטור picker |

## Bridge surfaces added / changed by the meeting-notes task

| Surface | Direction | Why |
|---|---|---|
| `sigma.createTask(item)` → `{sent, id?}` / `{queued, queueId}` | React → legacy (`js/src/13-ems.js:emsWriteOrQueue`) | a bullet has to remember **which** EMS task it became (`ems_task_id`). The legacy function used to return a bare `{sent:true}`; it now returns the created task's id via `emsCreatedId`, which unwraps BOTH shapes EMS answers with (`{id}` and `{data:{id}}` — reading `res.id` alone silently produced no id). Queued ⇒ the note is stamped `pending:<queueId>`, shows ⏳, and `ems-queue-flushed` resolves it later. Pinned by `test-ems-createtask.mjs`. |
| `emsSendItem` `createTask` honours `item.priority` / `item.siteId` | React → legacy | the note prefill sets priority `medium`; site is still resolved from `item.kibbutz` at send time so a queued task resolves it on flush. |
| `window.sigmaHome.openSheet(name)` | island → island / legacy → island | `islands/Home.tsx` exposes its ➕/✏️ sheet. The import preview's **צור קיבוץ** and the modal tab's **✏️ פרטי קיבוץ** both need to open it for a *specific* name — a bus event cannot target one card. Deleted on unmount. |
| `#sigma-modal-meetings[data-kibbutz]` | legacy → island | `js/src/10-activity.js:openEditModal` stamps the kibbutz it is showing; `islands/ModalMeetings.tsx` observes the attribute. One React root for the whole session instead of a mount per modal open. |
| `sigma.decorateCards()` | React → legacy | already existed; the cards' notes block is React, so the legacy passes still attach after `.kibbutz-name-row` — the notes sit between the two (order: name → notes → EMS tasks). |
| `sigma.emsCacheTasksForKibbutz(name)` → `EmsTask[]` | React → legacy (`js/src/13-ems.js:emsCacheTasksForKibbutz`) | task-3-brief: the on-card EMS-tasks widget moved to React (`components/home/EmsTasks.tsx`), reusing the legacy site-id filter (merged sites, e.g. שדה אליהו + חקלאות) instead of re-deriving `KIBBUTZ_SITE_MAP` in TS. `applyCardEmsWidgets`/`renderCardEmsTasks` are removed from `js/src/13-ems.js` and from `sigma.decorateCards()`; the legacy kibbutz-modal task list (`prepModalEmsSection`) is untouched. Pinned by `test-ems-card.mjs` (slim-mapper `description` field) and `app/src/components/home/EmsTasks.test.tsx`. |

## Bridge surfaces / channels added by the feedback task (Task 6)

| Surface | Direction | Why |
|---|---|---|
| `sigma.emsToken()` → `string` | React → legacy (`getEmsToken`, `js/src/12-reports.js`) | the `github` Edge Function gates EVERY mode on a valid EMS login (the legacy dev board passes the same token). The inbox's 🐙 button needs it to create a ticket; no other island may use it. |
| `registerMoreItem({id:'feedback'})` — label `📣 רעיון / באג`, **no `roles`** | island → nav | every role may submit, the viewer included (spec §7). The live `visible` predicate only hides it before anyone has picked who they are. |
| `registerMoreItem({id:'feedback-inbox'})` — `roles: ['idan','team']` + live `canSeeFeedbackInbox` | island → nav | the inbox is admins only (`canManageStaff` = עידן + עמיחי) and never a viewer, evaluated on every listing so `changeUser()` cannot leave it open. |
| `#feedback-inbox` hash | push → island | `push-send` mode `feedbackNew` opens the app at `?pushact=feedback#feedback-inbox`; `islands/FeedbackInbox.tsx` watches the hash AND `user-changed` (the island mounts before the user is known, so a single check at mount would swallow the deep link). |

## Edge functions this release touches

| Function | Mode added | Called by |
|---|---|---|
| `transcribe` (new) | Three modes on the one endpoint (task 6b, spec §7i). **Transcribe** `{token, path, audio_sec}` → `{text, engine, ms, refined, job_id?, refine_eta_seconds?}` — **EMS-gated**, `path` must match the whitelist `<name>.<audio ext>` (`chain.ts validAudioPath`). **Poll** `{token, job_id}` → proxies the self server's GET with the bearer → `{text, status, refined, seconds_remaining}`, no `transcribe_log` row (a status check, not a new attempt). **Health** `{health:true}` → `{ok, engine}`, no EMS gate. | `app/src/lib/speech.ts:uploadAndTranscribe` + `pollRefineStatus` (the fallback voice path). Self-hosted Whisper first (`https://idanhomepc.tail9e880d.ts.net`, `DEFAULT_SELF_WHISPER_URL`), Groq as insurance, one retry (2 s) on network/5xx never on 4xx — `supabase/functions/transcribe/chain.ts`. Refine merge rule (untouched→replace, edited/sent→discard) is `app/src/lib/feedback.ts:refineMerge`. Pointer runbook: `docs/whisper-server.md`. Writes `transcribe_log`. |
| `push-send` | `feedbackNew` `{token, kind, preview}` → עידן + עמיחי — **EMS-gated** (the public anon key alone must not be able to push to anyone's phone) | `islands/Feedback.tsx:sendFeedback` (fire-and-forget; the author is never sent, so an anonymous feedback stays anonymous) |
| `push-send` | **`visitCron`** `{}` — the 2 h visit-summary reminder (spec §5.2). **Authenticated**: the `X-Cron-Key` header (`db/cron_visit_15min.sql`, every 15 min) or a live EMS login. Every decision is the pure `visitCronSelect` in `supabase/functions/push-send/field.ts`, a **byte-identical copy** of `app/src/lib/field.ts` (`test-field.mjs` fails on drift): 2 h after the check-in but never past 20:00 Israel, quiet hours 21:00–06:30, **≤ 3 non-digest pushes per person per day** counted from `push_log` (`attendanceCron` obeys the same cap), one nudge per arrival (`reminded_at`), never when the visit is filed. Words from the 19-variant pool, `hashIdx(checkin id)`; a draft swaps in its own line (§5.1c) | `pg_cron` → `field_checkins` → the two field phones |
| `github` | `listParents` · `createIssue` `{title, body, labels, parent}` — `parent` is **required server-side** (the board is two-level by rule) and `body` is capped at 20k | `islands/FeedbackInbox.tsx` — a bug becomes a CHILD of a Main Fields parent, titled `[מודול] | [תת-תחום] | [תיאור]`, into Backlog (the Git Ticket System rules) |

## Surfaces / channels added by the usage-analytics task (Task 17, spec §7j)

| Surface | Direction | Why |
|---|---|---|
| `window.sigmaTrack(action, target?, page?)` + `sigma.track(...)` | legacy → shared queue → React | ONE stamping point for who/where/when. Legacy modules call it guarded by `typeof` and never touch Supabase; `app/src/lib/track.ts` drains `window.__sigmaTrack` and owns the only insert. If `ui/sigma.js` never loads, the array caps at 200 and the events are lost — the intended failure mode. |
| `window.showPage` **wrapped** by `sigma.sigmaWrapShowPage()` | legacy → analytics | page views are tracked in the wrapper, NOT in `sigma.showPage`. showPage is the single door every page change goes through (legacy nav buttons, deep links, the React nav), so the wrapper counts each change exactly once; tracking inside the bridge call would have missed the legacy buttons and double-counted React clicks. It logs `window._currentPage` (the page actually landed on), because showPage rewrites `page` when a gate denies it. Pinned behaviourally by `test-usage-track.mjs [1]`. |
| `track()` / `trackMount()` from `app/src/lib/track.ts` | island → analytics | the React-side twin of `sigmaTrack`; routes through the bridge when legacy is loaded. `islands.tsx mount()` calls `trackMount(id)`, so **every island mount is an event** with no per-island wiring. `track.ts` is in the BOOT chunk and therefore imports supabase-js lazily (`await import('./supabase')`) — `test-sigma-shell.mjs [3]` enforces that the library itself never lands there. |
| `registerMoreItem({id:'usage'})` — label `📈 שימוש`, `roles:['idan']` + live `canSeeUsage` | island → nav | §7j makes this screen עידן's alone. The predicate is evaluated on every listing, so `changeUser()` cannot leave it listed, and the dialog closes itself if the current user stops being עידן. |
| `#usage` hash | push → island | `push-send` mode `usageDigest` opens the app at `#usage`; `islands/Usage.tsx` watches the hash AND `user-changed` (the island mounts before the user is known, so a single check at mount would swallow the deep link — same lesson as `#feedback-inbox`). |
| `usage_report(p_days, p_actor)` RPC | island → DB | `usage_events` has **no client SELECT policy and the privilege is revoked**, so the page cannot read the table at all. The RPC is SECURITY DEFINER and refuses any actor but עידן. The client gate is the first door, this is the second; identity is still the app's one shared `authenticated` pass (same honest limitation as `feedback_admin_update`). |
| `app/src/lib/usageNarrative.ts` ↔ `supabase/functions/push-send/usageNarrative.ts` | shared logic | a **byte-identical copy**: Deno cannot import from `app/src`, and the Sunday push must say exactly what the page says and what the vitest goldens pin. Edit `app/src/lib` and copy it over — `test-usage-track.mjs [3]` fails the build on any drift. Keep the module import-free so the copy stays possible. |

### Query keys (Task 17)

| Key | Invalidated by | Read by |
|---|---|---|
| `['usage', 30]` | nothing — `staleTime` 60 s, and the island flushes the tracker before each fetch so the current session's own events are in the report | `islands/Usage.tsx` (📈 שימוש) |

### Standing rulings on `usage_events` (fix round 1 — do not re-litigate per task)

| Ruling | What it means in code |
|---|---|
| **Analytics never stores text a user typed. No exceptions.** §7j's example narrative quoted the failed search terms ("לא נמצאו: 'גשר'"); the review overruled it — a typed query is typed text whatever it happens to contain. | A search miss is `track('search-no-results', searchMissTarget(q))` → `target = "results:0,len:<n>"` (`app/src/lib/track.ts`). `usageNarrative` COUNTS misses and quotes nothing, even if a row somehow carries text. Pinned by `test-usage-track.mjs [5b]` + goldens in `track.test.ts` / `usageNarrative.test.ts`. A new `target` must be an id or a name the APP chose. |
| **A `target` is capped at 40 chars** — a backstop, not a licence. | `MAX_TARGET` in `track.ts` and `TRACK_TARGET` in `js/src/00-bridge.js`. |
| **The unload flush uses `fetch(..., {keepalive:true})`, NOT `navigator.sendBeacon`.** | sendBeacon cannot set headers, and PostgREST needs `apikey` + `Authorization: Bearer <EMS-minted pass>`; without the pass the insert arrives as `anon` and RLS rejects it, and a JWT in a query string is not something we do. Accepted loss, documented in `track.ts`: browsers without `keepalive` lose the last page's tail (≤ 10 s of events). |
| **`p_actor` on `usage_report()` is a client-supplied string** (one shared `authenticated` pass ⇒ Postgres cannot tell עידן from ניתאי). Defence in depth, not authentication. | Deferred to **Task 18** (per-user Supabase auth). Same limitation as `feedback_admin_update`. |

### Edge function / cron (Task 17)

| Function | Mode added | Called by |
|---|---|---|
| `push-send` | `usageDigest` `{force?, token?, actor?}` → the weekly narrative to עידן. **AUTH (fix round 1): the public anon key is NOT enough.** Either the `X-Cron-Key` header matches the `CRON_SECRET` secret (pg_cron — scheduled runs only, never a forced one, because the key sits in a readable SQL job body) or `emsValid(token)` passes AND `actor === 'עידן'` (the only caller allowed to `force` past the Sunday gate, and with `force:'resend'` past the week tag). The decision is the pure `usageDigestAuth()` — `app/src/lib/usageDigest.ts`, byte-identical copy in the function dir, four cases tested. Gated on **Sunday 08:00 Israel** (`israelNow()`: DST server-side, a missed hour re-fires safely), idempotent on the `usage-<yyyy>-w<ww>` tag in `push_log`, recipient fixed server-side. **The response never contains the sentences** — `{ok, tag, sent, lines}` only; the narrative names people and reaches עידן's devices and `push_log`, never a caller. Reads `usage_events` with the service role (no RPC — that is the client's door). | pg_cron `push-usage-hourly` (`db/cron_usage_weekly.sql`, `5 * * * *` so it never races `push-attendance-hourly` at `0 * * * *`; the same file re-schedules the attendance job with the header). **Not scheduled yet** — prod steps after the merge: set `CRON_SECRET`, then run the file. |

---

## Task 4 — brand polish, landing per role, settings, Ctrl+K, visit drafts (סיגמה 2.00)

### Tables added

| Table / column | Written by | Read by | Notes |
|---|---|---|---|
| `user_settings(person pk, landing, card_desc, font, theme, eod_hour, updated_at)` (`db/user_settings.sql`) | `app/src/lib/settings.ts saveSettings()` (⚙️ הגדרות) | `loadSettings()` at boot and on `user-changed` | Identity is the person's NAME (`dashboard_user_v1`), the app's only identity. A **localStorage mirror** (`sigma_settings_v1`) is authoritative for the first paint and offline; the row is merged over it field-by-field (`mergeSettings`), so an unknown value from another build cannot strand someone on the defaults. `card_desc` drives the phone clamp (§7k #2), `font` writes the `--font` token, `landing` overrides the §7l role default. Task 15 extends both. |
| `visits.open_items text` (`db/visits_open_items.sql`) | `saveVisit()` in `js/src/09-visits.js` (the "מה נשאר לי פתוח" field) | the visit form's edit path, the last-visit block, the visits PDF/Excel (`js/src/12-reports.js`, `js/src/21-excel-export.js`), and the briefing's previous-visit block (Task 5) | The summary is now TWO fields: `summary` = "מה עשיתי בביקור", `open_items` = what he left open (§5.1b). Old visits have `null` — every reader treats that as "nothing left open", never as an error. |
| `visit_drafts(id pk, person, kibbutz, date, payload jsonb, updated_at)` (`db/visit_drafts.sql`) | `visitDraftSave()` in `js/src/09-visits.js` — debounced 800 ms, plus `switchTab` / `pagehide` / `visibilitychange` | `visitDraftFor()` via the bridge (the card chip, the "המשך טיוטה" prompt, the 🚚 gate) | **`id` is the PRE-MINTED visit id** (`visitDraftId()`), so a draft, the delivery certificate issued from it and the saved visit share one identity — the cert's `refId` keeps pointing at the right visit before the visit row exists. Deleted on a successful save. A localStorage mirror (`visitDraft_v1`) carries the offline case. 14-day sweep statement is in the .sql. |

### Bridge surface added (`js/src/00-bridge.js`)

| Surface | Direction | Why |
|---|---|---|
| `sigma.visitDraftFor(kibbutz, person, date)` → `{id, updated_at, payload} \| null` | React → legacy | The card chip "סיכום ביקור בהתהוות" and the "המשך טיוטה מ-HH:MM" prompt need to know a draft exists WITHOUT owning the draft format. The legacy module is the only writer, so it is the only reader too. |
| `sigma.visitDraftDiscard(id?)` | React → legacy | "התחל מחדש" in the resume prompt. |
| `sigma.onLanding(target, role)` — **optional hook, assigned by a later task** | landing → legacy | §7l's landing calls it after the first screen is chosen, for every role. Task 5 attaches the field arrival sheet here instead of editing `app/src/lib/landing.ts`. |
| `sigma.openCommandBar()` | legacy → React | The desktop header search and the phone search field open the Ctrl+K list (§7k.1) instead of carrying their own result UI. |

### Query keys / events added

| Key or event | Fired / invalidated by | Read by |
|---|---|---|
| `visit-draft-changed` (sigmaBus) | every `visitDraftSave()` / discard / delete-on-save | the card's draft chip, the briefing (Task 5) |
| `sigma-open-settings` (window event, `SETTINGS_OPEN_EVENT`) | the ⋯ sheet row, the user-chip menu, Ctrl+K | `islands/Settings.tsx` | The event lives in `lib/settings.ts`, NOT in the island, so the boot chunk can ask for the panel without importing it. |

### Standing rulings from Task 4

| Ruling | What it means in code |
|---|---|
| **The ⋯ sheet badges are ATTENTION ONLY** (§7k #3). | `registry.itemBadge()` — a positive integer means "this needs you". Totals and "new since" counts get no badge. The gaps badge is 0 until Task 15 computes it. |
| **No page is retired here** (§7m guard rail). | `MoreSheet`'s `MORE_PAGES` still lists משימות / EMS / עובדים; Task 14 removes them after a coverage audit. |
| **The tokens-only region of `css/app.css` may not contain a hex literal.** | The marked `/* @tokens-only */ … /* @end */` block; `test-theme.mjs` fails the build otherwise. New legacy CSS goes inside it. |
| **RTL is a release gate.** | `test-rtl.mjs` — logical properties only in the new CSS and in `app/src/**`; a physical property needs a `/* rtl-ok */` on the line, with the reason. |
| **The UI never explains its own mechanics, and never says who else sees the data.** | `test-copy-rules.mjs` greps `app/src/**` and `index.html` for the banned words. |

### Task 4 — review fix round 1

| Change | Why it matters downstream |
|---|---|
| The visit-draft mirror is a **MAP** keyed `person|kibbutz|date` in `localStorage['visitDrafts_v2']` (was one slot in `visitDraft_v1`, which a second kibbutz overwrote). `visitDraftFor(kibbutz?, person?, date?)` still answers one row — the NEWEST when the query is widened — and `visitDraftsForPerson(person)` lists them all, newest first. A v1 row is migrated on the first read. | Anything asking "is there a draft?" keeps the same call. Anything LISTING drafts (Task 5's briefing, Task 15's gaps line) should use `visitDraftsForPerson` rather than assuming one. |
| `visitDraftsSync()` READS `visit_drafts` for the logged-in person and merges newest-`updated_at`-wins into the mirror (pure `draftMergeRows`, tested). Called on `switchTab('visit')` and on `user-changed`. | The table is no longer write-only, so "the draft follows you to another device" is now true. A new draft writer must keep `updated_at` honest — it is the only tie-breaker. |
| `user_settings` now carries **`updated_at` as the person's own choice stamp**, and `pickNewer(local, remote)` decides boot conflicts newest-wins; a device that is ahead PUSHES its row back. | Task 15 must stamp every settings write (`setSettingsLocal` does it by default) and must pass `{ stamp: false }` when the patch came FROM the row, or the row's timestamp is lost and the two devices ping-pong. |
| `primaryAdd`'s labels: only `kibbutz` / `visit` / `feedback` carry ➕. `stockChange` / `schedule` / `event` read "עבור למלאי" / "עבור ליומן" until Tasks 8/13 ship their forms — `ADD_OPENS_FORM` is the flag to flip. | §7k.2's matrix is unchanged; only the wording is. When those forms land, flip the flag and the label in ONE place and the header icon follows. |
| Ctrl+K renders ONE flat ranked list with the kind labels as dividers (`rankedRows`, `app/src/lib/commands.ts:165` — this line said `flatWithHeadings` until the Task 18 sweep; the function was renamed in Task 4 and the map was not, which is the reason the map is generated now), because cmdk selects by DOM order and real groups made Enter run the first ACTION instead of the top hit. | Any new command source just needs a `kind`; do not reintroduce `CommandGroup` per kind. |

## QA gates (Task 22 — P0) — the commands every later task is measured by

`npm run qa` (= `scripts/qa.mjs`) runs six gates on the current tree, writes
`qa/reports/<yyyy-mm-dd>-<label>.md`, and exits non-zero if any of them failed.
**Definition of Done for every task from P0 on: `npm run qa` green + the reviewer can read
`qa/reports/<date>-task-N.md`.** Install steps, per-gate detail and every fallback:
[`qa/README.md`](../qa/README.md).

| # | Gate | Command | Threshold |
|---|------|---------|-----------|
| 1 | gitleaks | `qa/bin/gitleaks.exe detect --source . --config qa/gitleaks/.gitleaks.toml --no-git` | 0 findings |
| 2 | semgrep | `npm run qa -- --only semgrep` (manifest: `qa/semgrep/config.yml`) | 0 ERROR / 0 WARNING |
| 3 | existing suites | `npm test` | green |
| 4 | Playwright | `npx playwright test --config qa/playwright/playwright.config.ts` | 4 projects green, no console errors |
| 5 | Lighthouse | `node qa/lighthouse/run.mjs` | perf ≥ 85 · a11y ≥ 95 · bp ≥ 95 |
| 6 | ZAP baseline | `pwsh -File qa/zap/baseline.ps1` · `bash qa/zap/baseline.sh` | 0 High / 0 Medium (passive) |

```bash
npm run qa                        # all six
npm run qa -- --label task-23     # → qa/reports/<date>-task-23.md
npm run qa -- --only playwright   # one gate (repeatable)
git config core.hooksPath .githooks   # ONCE per clone / worktree: pre-commit = gitleaks --staged
```

### Standing rulings from Task 22 (do not re-litigate per task)

| Ruling | What it means in code |
|---|---|
| **A gate is never silently skipped.** | Only the ZAP baseline may report `SKIPPED`, and only when Docker is absent (its script exits 2). Every other gate is PASS or FAIL. |
| **Thresholds are not lowered to make a run pass.** | A page that cannot reach a Lighthouse threshold gets its numbers and its top causes written into the report instead. |
| **An accepted finding is recorded, not hidden.** | `qa/semgrep/config.yml` `exclude_rules` / the allowlist in `qa/gitleaks/.gitleaks.toml`, each with the sites reviewed and the reason. A NEW site under an already-excluded rule is not automatically safe. |
| **The Playwright suite owns port 8124.** | Not 8123: `cards-wt` serves this worktree there with a single-threaded python server, which drops island-chunk requests under four workers. The suite starts `qa/playwright/server.mjs` itself (`reuseExistingServer: false`). |
| **Specs are hermetic and can never write to production.** | `qa/playwright/tests/_helpers.ts` `boot()` serves Supabase reads from `_fixtures.ts` and answers every write 401 — which is a real mock-mode session, and the reason a spec can assert the "יש להתחבר ל-EMS כדי לשמור" hint. A new island's tables go in `_fixtures.ts`, not in a live call. |
| **One spec per screen, four projects, RTL asserted in every one.** | `desktop-1440-{light,dark}` + `mobile-390-{light,dark}`; `expectRtl()` + `expectNoConsoleErrors()` end every test. A new feature adds its spec to `qa/playwright/tests/`. |
| **The fixture rows are UI fixtures, not a copy of production.** | Two sections · three regions · one sub-site · one 🤝 marketing row · one gas site — so section headers, region sub-labels, both chips and a non-⚡ energy badge all have something to render. |

### Bugs the backfill found and fixed (Task 22)

| Fix | Downstream note |
|---|---|
| `app/src/islands/Feedback.tsx` now listens for **`sigma-open-feedback`** (exported as `FEEDBACK_OPEN_EVENT`). The command bar's 📣 action and `runAdd('feedback')` dispatch that event and nothing was listening, so both did nothing at all. | Any surface may open the sheet with `window.dispatchEvent(new CustomEvent('sigma-open-feedback'))`; importing `openFeedback()` still works. |
| `app/src/lib/feedback.ts` gained the **`record-denied`** voice event. A microphone refused during the RECORD leg was reported as `live-denied`, which only the `listening` phase handles — so the sheet sat on "מקליט…" for 10 s and then blamed the wrong thing ("המיקרופון לא נפתח"). It now fails immediately with "אין הרשאה למיקרופון — אפשר להקליד". | Task 6b (Whisper live) must keep the two legs' error events distinct: `live-denied` for the listening leg, `record-denied` for the recorder. |
| `stats.html` — the jsdelivr `chart.js` tag gained `integrity` + `crossorigin` (semgrep `missing-integrity`). | Any new CDN tag needs an SRI hash or gate 2 fails. |
| `scripts/test-all.mjs` — dropped `shell: true` in favour of `npm.cmd` on Windows (semgrep `spawn-shell-true`). | Spawn native commands by name, never through a shell. |

## Surfaces / channels added by the field-day task (Task 5, spec §5)

| Surface | Direction | Why |
|---|---|---|
| `sigma.prefillOpenItems(kibbutz, text)` | React → legacy (`js/src/00-bridge.js`) | the briefing's "לפני שיוצאים" leftovers have to land in the visit form's `#visitOpenItems` (§5.1b). React must not touch legacy form DOM, so it hands the text over and the bridge writes it on the next `visit-form-open` — **once**, and only while the field is still empty, so a restored draft's own words always win. The `input` event it fires is what makes the draft autosave pick the text up. |
| `window.sigmaField` = `{ maybeOpen, openArrival, openBriefing(name), dismiss(cid) }` | island → legacy / island → island | `components/Nav.tsx`'s raised 📍 calls `maybeOpen()`: a field worker with no check-in today gets the arrival sheet, everyone else goes straight to the visit form (§5.1 fast path + §7k #1). `js/src/22-push.js` calls `dismiss(cid)` for the `?pushact=visitDismiss` deep link — the island owns the write, because it owns the supabase-js client and the query cache. Deleted on unmount. |
| `sigma.onLanding(target, role)` | legacy/React landing (§7l) → island | the one hook `app/src/lib/landing.ts` already called for every role. The field island wraps it (keeping any previous hook) and opens the arrival sheet when a `field` role lands on קיבוצים with no check-in. Latched by `window._fieldPromptShown` — **once per browser session**, like the push and attendance prompts, which is also how the Playwright harness keeps it off unrelated specs. |
| `?pushact=visit&kibbutz=<name>` · `?pushact=visitDismiss&cid=<id>` | push → `js/src/22-push.js` → island / bridge | the notification's two buttons. `visit` → `sigma.openVisitQuick(kibbutz)` (the form, kibbutz prefilled, one tap); `visitDismiss` → `sigmaField.dismiss(cid)`, which retries for ~5 s because the field island is a lazy chunk. `sw.js` needs no change — `actUrls` in the payload's `data` already routes both. |
| `#sigma-today` (new placeholder, ABOVE `#sigma-home`) | index.html → island | the "היום" strip (§7k #11): today's stops from `day_plans` + check-ins, and the in-app mirror of the 2 h nudge (§7k #4), rendered from the clock and **independent of push delivery**. Same lazy chunk as `#sigma-field`, two roots. Renders nothing for a non-field role or a closed session gate. |

## Surfaces / channels added by the 🔥 צריבות task (Task 23 — a TEMPORARY project)

צריבות is a few months of field work, not a part of the app. It therefore has **no nav tab**: it
lives on the surfaces where the work happens, and **one flag removes all of them**.

| Surface | Direction | Why |
|---|---|---|
| `window.BURNS_PROJECT_ACTIVE` (set in `js/src/24-meter-burns.js`) | legacy → everything | **the removal path.** `false` hides the card chip, the card-modal section, the briefing rows, the landing strip, the ⋯ עוד row and the full-table page; the `meter_burns` rows stay for the report. The React half reads the same global through `app/src/lib/burns.ts:burnsProjectActive()`, which treats *absent* as active so an island loaded without the legacy bundle (vitest) still renders. |
| `app/src/lib/burns.ts` — `canSeeBurns` / `canWriteBurns` | pure | THE audience gate, mirrored in `js/src/24-meter-burns.js` between `BURN-AUDIENCE-START/END` (`test-meter-burns.mjs` asserts the two lists match). Write: אביאם/ניתאי/עידן/עמיחי · read: + the viewer · hidden: מתניה/אליה and any unknown name. |
| `#sigma-burns` (new placeholder, between `#sigma-today` and the cards) | index.html → island | the progress strip. Work for the field team (`🔥 צריבות — נותרו N ב-M קיבוצים`), **progress** for everyone else (`בוצעו X מתוך Y · NN%` — עידן 18.9 21:50, so it is not only a field surface). Hidden at zero. |
| `#sigma-burns-modal` (new placeholder, in `#tab-meetings`) | legacy → island | the card modal's 🔥 צריבות section. `js/src/10-activity.js:openEditModal` stamps `data-kibbutz` on it, exactly like `#sigma-modal-meetings`; the shared `app/src/lib/modalSlot.ts:useModalKibbutz(slotId)` observes it, so ONE root serves every card. |
| `body.burn-filter-on` + `.kibbutz.burn-filtered-out` | island → the card DOM | tapping the strip filters the cards to the kibbutzim that still have pending burns. A class, not a React filter, because the strip is its own root and must not own the home island's state; released on a second tap and on unmount. |
| `sigma.showPage('burns')` + `canShowPage('burns')` | React → legacy | the full table / Excel / generators helper is one legacy screen (`js/src/24-meter-burns.js`), reached from the strip's "הכול ›", from the section's link and from ⋯ עוד → צריבות מונים (פרויקט זמני). `canShowPage` asks the legacy `burnCanSee()`, so a stale deep link lands on 🏘 קיבוצים instead of on a page the person may not see. |
| ⋯ עוד row `burns-table` | island → registry | registered by `islands/Burns.tsx` with a LIVE `visible` predicate, so a `changeUser()` (or the flag going false) takes the row away without a reload. |
| `LeaveItem.kind = 'burn'` + `LeaveItem.meterId` (`app/src/lib/field.ts`) | pure → the briefing | the pending meters of the kibbutz become "לפני שיוצאים" rows, LAST in the list. Ticking one is not a checkbox — `islands/Field.tsx:toggleLeaveItem` calls `markBurned`, optimistically, rolling back on a refusal. `burn` rows are deliberately **excluded from `openItemsPrefill`**: an unburned meter is a `meter_burns` row, not a line of free text in a visit summary. |

## Surfaces / channels added by the stale-while-revalidate task (Task 20, spec §7k #10)

עידן's ruling: every screen paints the **last known state instantly** and refreshes silently
behind it; skeletons only when there is no cache at all; pull-to-refresh on the phone; and the
shared EMS snapshot keeps refreshing even when nobody has the app open.

| Surface | Direction | Why |
|---|---|---|
| `app/src/lib/query.ts` — `QUERY_DEFAULTS` (`refetchOnMount:'always'` · `refetchOnWindowFocus` · `networkMode:'offlineFirst'` · `staleTime` 60 s · `gcTime` 24 h) | the policy every island inherits | the four settings ARE decision #10. `'always'` is what makes painting a stale cache safe; `offlineFirst` is because `navigator.onLine` is wrong often enough on cellular in a קיבוץ that the default `'online'` mode would leave screens `fetchStatus:'paused'` with no refresh at all. Pinned by name in `app/src/lib/query.test.ts` — a diff that "tidies" one of them fails the suite. |
| `app/src/lib/query.ts` — `persistedHas` / `hasPersistedData(key)` | pure + localStorage | the persister restores one microtask AFTER the first render, so `useQuery` honestly reports `isLoading` while a full answer sits in `sigma-query-cache-v1`. Asking the blob directly is how a screen distinguishes "nothing to show" from "a paint is one tick away". |
| `app/src/lib/query.ts` — `showSkeleton(hasData, cached)` | pure | the one sentence of #10, as a function. Used by `islands/Home.tsx`, whose `cached` is the legacy `kibbutzim_v1` mirror **or** the persisted blob. The other islands already gated on TanStack `isLoading`, which is false once data exists. |
| `app/src/lib/query.ts` — `refreshAll()` | island → both caches | invalidate every query **and** force `sigma.emsSync(true)`. Two different caches: TanStack's, and the shared EMS snapshot in `ems_cache` that the on-card task widget reads. Never rejects — a gesture must not raise an unhandled rejection. |
| `#sigma-refresh` (new placeholder, next to `#sigma-toaster`) → `components/PullToRefresh.tsx` | index.html → island | ONE pull-to-refresh for the whole app. The touch listeners are on `document`, so a single mount serves every page; a `window.__sigmaPullToRefresh` claim makes a second instance inert (one pull must never refresh twice). Phone only, via `matchMedia('(max-width: 767px)')` re-evaluated on change. Lazy + `whenIdle` so TanStack stays out of the boot chunk. |
| `sigma.emsSync(force?)` → `Promise<boolean>` | React → legacy (`js/src/13-ems.js:emsBackgroundSync`) | refresh the SHARED snapshot now. `force` skips the 5-minute throttle (that is the pull-to-refresh path); a bare call is a nudge the throttle may decline. Resolves `false` when nothing happened and never rejects. |
| `js/src/13-ems.js` — `emsBackgroundSync` / `emsBgSyncInstall` / `emsBgDue` | legacy, installed from `js/src/01-data.js` | the snapshot used to refresh only on CONNECT (`emsOnConnected`, once per session). Now: any page, on `visibilitychange`, on `focus` and on a 5-minute tick, while connected. The throttle stamp (`localStorage['ems_bg_sync_at_v1']`) is shared across tabs, so three tabs cost one crawl; `emsSyncCache` stamps it too, so a sync from any path resets it. Emits the existing `ems-cache-synced`. `emsBgDue` is pure and pinned by `test-ems-refresh.mjs`, including the clock-went-backwards case. |
| `scripts/ems-cache-refresh.mjs` (+ `docs/ems-cache-refresh.md`) | office PC → `ems_cache` | the half-hourly job for the hours when nobody is in the app. It reproduces the browser's three steps: EMS sign-in → `functions/v1/ems-auth` → `POST /rest/v1/ems_cache?on_conflict=id`. **`emsCacheWrite` is not an Apps Script call** — `js/src/01-data.js` intercepts it and upserts Supabase with the authenticated bridge pass, and the anon key is read-only, which is why the job needs the mint. Credentials come from a git-ignored `.env`; nothing is hardcoded and nothing is logged. |
| `kibbutzim-published` → `islands/CommandBar.tsx` | island → island | the regression this task's own QA run caught, and the fix. Ctrl+K builds its source list once per open from two stores that notify nobody; the boot-time work this task added was enough to get a Ctrl+K in before the card home published them, and the bar then answered "לא נמצא כלום" for a kibbutz on the screen behind it (2 of 3 full Playwright runs, against 0 of 3 on the same tree without Task 20). Two changes: the bar rebuilds on the event while open, and the pull-to-refresh chunk moved off `whenIdle` to the first `touchstart`, so it no longer competes with the card home's effect flush. |
| `scripts/ems-cache-refresh.mjs:slimTask` ↔ `js/src/13-ems.js:emsSlimTask` | the one contract that can hurt | both write the same `ems_cache.tasks` column and the card renders whichever landed last, so a drifted mapper would blank task text for everyone with no obvious cause. `test-ems-refresh.mjs` runs the REAL `emsSlimTask` out of the legacy source over `qa/fixtures/ems-tasks.json` and diffs values AND key order; it also pins `EMS_CACHE_VER` and `OPEN_STATUSES = EMS_STATUS − EMS_CLOSED`. |

## Surfaces / channels added by ▶ מצב ישיבה (Task 24, company-process spec §1.2 + §1.2b)

The in-meeting screen. It writes to three places and reads from four, and the one thing that
must stay true is that it never becomes the place a decision LIVES: the navigation log is a
timeline for splitting the recording (§1.3), and anything that has to survive the meeting is
written through the paths that already own it.

| Surface | Direction | Why |
|---|---|---|
| `meeting_sessions` (`db/meeting_sessions.sql`) | island → Postgres | one row per run of the screen. `started_at` is the zero of every event's `t_sec`, and `ended_at` is stamped on the way out. A failed insert is **not** fatal — the overlay runs with `session === null` and simply logs nothing, because a meeting must not be blocked by its own bookkeeping. |
| `meeting_events` (`db/meeting_events.sql`) | island → Postgres | the navigation log: `kibbutz` (the segment boundary) · `marker` (Space) · `parking` (P) · `note` (the typed line) · `general` · `issue`. Offsets, never wall clocks: §1.3 lines the log up against a recording that started when עידן pressed record. |
| `kibbutz_meeting_notes.source` (`db/kibbutz_meeting_notes_source.sql`) | migration | `'live'` = typed during the meeting, `'review'` = Task 25, `null`/`'import'` = the pasted summary. The import is idempotent by `(kibbutz, meeting_date, meeting_kind, seq)`, so a line that was never in the summary has to be distinguishable or a re-import would fight it. |
| `app/src/lib/meetingSession.ts` — `presenterOrder` | pure | imports `groupBySection` from `lib/kibbutzim.ts` and flattens it. It does **not** re-implement the comparator: the meeting walks the board, and a second sort is how the two would drift. |
| `app/src/lib/meetingSession.ts` — `tSec` / `nextIndex` / `carryOverLine` / `eventRow` / `canPresent` | pure | the whole decision surface of the screen, golden-tested without a DOM (`meetingSession.test.ts`). `tSec` clamps clock skew to 0 (a negative offset would place an event before the recording starts); `nextIndex` never wraps (wrapping looks like the meeting restarted). |
| `sigma.createTask(taskFromBullet(...))` | island → legacy → EMS | the ✏️ 📋 chip reuses the EXISTING chain (`components/home/MeetingNotes.tsx:linkNoteToTask` uses the same one), so the offline queue and the `ems-queue-flushed` id resolution keep working from here for free. |
| `notes-changed` (existing event) | island → every card | emitted after the ✏️ sheet creates anything, so the cards behind the overlay are already right when he exits. |
| Query key `['cal', 'events', today, today]` | shared with `islands/Calendar.tsx` | the 🎥 Meet link of today's company/dev meeting is **display only** and comes from the calendar's own query, reused by key so the two share one fetch. No second data path. |
| `sigma.presenterStrip?(kibbutz)` | optional, Task 28 → island | the third state strip, read through the bridge rather than imported. Absent → nothing renders and nothing errors; Task 24 has **no** dependency on Task 28. |
| `#sigma-presenter` (new placeholder, after `#sigma-daylog`) → `islands/Presenter.tsx` | index.html → island | deferred behind `whenIdle` like the gaps and day-log panels, with the ⋯ row and the opener registered eagerly (the task-15 cold-tap lesson) and the cold-open flag consumed inside the island's first render. |
| ⋯ עוד row `presenter` (group `admin`) | island + `main.tsx` → registry | `canPresent(isAdmin, isViewer)` — עידן and עמיחי, never a viewer, asked LIVE so a `changeUser()` takes the row away without a reload. |
| 🔒 פנימי chip — **offered** (Task 26) | — | `INTERNAL_TASKS_WRITABLE` in **`app/src/lib/caps.ts`** flipped to `true`: `internal_tasks` now has a client write path (`components/home/InternalTasks.tsx`), so the chip that was hidden here and in `islands/MeetingReview.tsx` is offered in both — one flag, both screens agree. |

## 📝 ישיבה → סיכום (Task 25, company-process spec §1.3)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/meetingReview.ts` — `proposeChip` · `draftFromParsed` · `setChip`/`setOwner`/`editLine`/`addLine`/`moveLine`/`removeLine`/`setTask` · `reviewSummary` · `applyReview` | pure | the whole review, golden-tested without a DOM (`meetingReview.test.ts` + `__fixtures__/review_17.9.26.json`). A **contract test asserts the module imports nothing but `./meetingNotes`** — "nothing is written before בצע" is then a property of the code, not a promise in a comment. Every mutator is immutable, which is what makes ביטול real. |
| `import_meeting_notes(jsonb)` (`db/kibbutz_meeting_notes_import.sql`) | `islands/MeetingReview.tsx:saveReview` → Postgres | the review commits through the SAME transactional merge the import uses, on the same `(kibbutz, meeting_date, meeting_kind, seq)` key. Reviewing a meeting that was already imported therefore REPLACES its bullets instead of doubling them, and keeps every `ems_task_id` / `done_at` set in between. No second write path, and no new migration. |
| `sigma.createTask(taskFromBullet(...))` + `kibbutz_meeting_notes.ems_task_id` PATCH | island → legacy → EMS, then → Postgres | one task per 📋 line at בצע, then the note it came from is linked — the same two steps `components/home/MeetingNotes.tsx:linkNoteToTask` does for a single bullet. Not reused as a call: the review carries the 📋 modal's per-line overrides, which that helper cannot see. A queued task still links, as `pending:…`, so `resolvePendingTasks` picks it up. |
| `sigma.emsSiteIdForKibbutz(kibbutz)` | island → legacy | display only, inside the 📋 modal: it says whether the kibbutz resolves to an EMS site BEFORE בצע, so a card with no site is seen here instead of after the task went out under none. `createTask` resolves the site itself (`js/src/13-ems.js`). |
| `notes-changed` (existing event) | island → every card | emitted once after בצע, so the cards are right the moment the sheet closes. |
| `📝 עבור על הסיכום` (`islands/ImportNotes.tsx:review`) | island → island | the hand-off. `import('@/islands/MeetingReview')` is dynamic, so an ordinary import never pays for the review chunk; the straight `שמור N בולטים` path is untouched. The parse is handed over as an object — nothing round-trips through the database in between. |
| `sigma-open-import` window event (`islands/ImportNotes.tsx:IMPORT_OPEN_EVENT`) | page → island | the import sheet joins the other sheets (feedback, day log, מצב ישיבה) in being openable by event. The module opener stays for in-bundle callers; the event is what the legacy page and the QA harness can reach. |
| `#sigma-meeting-review` (new placeholder, after `#sigma-presenter`) → `islands/MeetingReview.tsx` | index.html → island | mounted ON DEMAND by the hand-off (`mount()` is idempotent), so it costs nothing anywhere else. The draft handed over before the first render waits in the module's `pending` slot and is consumed inside that render — the presenter's cold-open lesson. |
| Role gate `canReview(isAdmin, isViewer)` | island | עידן + עמיחי, never a viewer, asked LIVE at open AND re-checked while open, so a `changeUser()` closes the sheet instead of leaving a write surface up. |

## 🔒 internal tasks (Task 26, company-process spec §2 + §8b: no due dates, no reminders)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/internalTasks.ts` — `openFor` · `myOpen` · `countBadge` · `toggleDone` · `promoteToEms` · `canWriteInternal` | pure | every decision golden-tested (`internalTasks.test.ts`), including a **contract sweep asserting the module has no field named `due` or `remind`** — the §8b ruling enforced on the source, not trusted. `promoteToEms` reuses `meetingNotes.ts:taskFromBullet` rather than a second payload shape. |
| `internal_tasks` table (`db/internal_tasks.sql`, created by Task 14, unchanged by Task 26 — `if not exists` made the schema a no-op to re-declare) | Postgres | RLS: read-all, write-authenticated. `kibbutz = null` = company-wide, read by `islands/Calendar.tsx`'s list-view "חברה" group (`companyItems`, Task 14); `kibbutz = '<name>'` is this task's per-kibbutz card section. |
| `INTERNAL_TASKS_WRITABLE` (`app/src/lib/caps.ts`) flipped `false` → `true` | one flag, four readers | `components/home/InternalTasks.tsx` (new UI), `islands/Presenter.tsx` (live ✏️ 🔒 chip), `islands/MeetingReview.tsx` (review 🔒 chip + `saveReview`'s `internal_tasks` insert) all read the same const — none holds its own copy, so they cannot drift out of sync. |
| `internal-tasks-changed` (new `sigmaBus` event, `components/home/InternalTasks.tsx:emitInternalTasksChanged`) | island → every card + "היום שלי" | ONE listener at module scope (same pattern as `notes-changed`) invalidates `['internalTasks']` — a listener per card would mean one per card. Emitted by every write: add, ✓ toggle, ⬆ promote. |
| Query key `['internalTasks']` | shared | one fetch (`select * from internal_tasks`) feeds every card's 🔒 section, "היום שלי" (`islands/PmToday.tsx`), and (read-only, via `sigma.companyTasks?.()` fallback) the calendar list's "חברה" group. |
| `<InternalTasksSection kibbutz canAct>` in `components/home/KibbutzCard.tsx` | React tree | card order stays EMS tasks → notes → 🔒 (§7k #7); renders nothing when there is nothing open and the viewer cannot write, so a quiet kibbutz never grows a box. |
| `#sigma-pm-today` (existing placeholder, §7l — left empty for Tasks 15/16) → `islands/PmToday.tsx` | index.html → island, new lazy chunk | Task 26 fills it with `MyInternalTasks` (the person's own open 🔒 rows, company-wide + every kibbutz); Task 15/16's EMS "היום שלי" card set, if it ships later, adds to the same root rather than replacing it. |
| ⬆ הפוך למשימת EMS (`promoteInternalTask`) | island → legacy → EMS, then → Postgres | creates the EMS task first, THEN sets the internal row `done = true` — never the reverse, so a failed EMS create leaves the row open for retry. |
| Legacy company-task retirement (redundancy-audit R-rulings) | — | already done by Task 14: the home "משימות חברה כלליות" block is removed, `settings.companyTasks` migrated one-shot into `internal_tasks` (`kibbutz = null`), and the calendar list's "חברה" group reads the real rows with the legacy settings row as a fallback only until the migration lands (`db/internal_tasks.sql`'s trailing `insert`). Task 26 adds nothing here — the per-kibbutz 🔒 section is new surface, not a retirement. |

## 🆕 new-client onboarding (Task 27, company-process spec §4)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/onboarding.ts` — `stepsFromTemplate` · `progressOf` · `daysInOnboarding` · `waitAge` · `nextStep` · `isComplete` · `nextState` · `canEditTemplate` | pure | golden-tested (`onboarding.test.ts`), including a DST-boundary date built from Y/M/D parts (methodology) and the role matrix (`canEditTemplate` — עידן only). |
| `onboarding_templates` (`db/onboarding_templates.sql`) — one seeded `'ברירת מחדל'` row, `steps: jsonb[{key,label,waits}]` | Postgres | RLS: read-all, write-authenticated (UI, not RLS, gates the write to עידן — same pattern as every other single-person gate in this app). |
| `onboarding_steps` (`db/onboarding_steps.sql`) — frozen per-kibbutz copy, unique `(kibbutz, step_key)`, `state` open\|waiting\|done | Postgres | spawned once at create time (`spawnOnboardingForNewKibbutz`, upsert with `ignoreDuplicates` so a retried create is a no-op); editing the template afterwards never touches an already-spawned row. |
| `onboarding-changed` (new `sigmaBus` event, `components/home/OnboardingProgress.tsx:emitOnboardingChanged`) | island → every 🆕 card | ONE listener at module scope (same pattern as `internal-tasks-changed`) invalidates `['onboardingSteps']`. Emitted by a step tap and by a fresh spawn. |
| Query key `['onboardingSteps']` | shared | one fetch feeds every 🆕 card's strip; `stepsForKibbutz` filters client-side, same shape as `internalTasks.ts:openFor`. |
| `<OnboardingProgress kibbutz canAct>` in `components/home/KibbutzCard.tsx`, gated `section === 'new'` | React tree | a ✅ active card never renders the strip — it has no spawned rows once it graduates, and the gate is belt-and-suspenders even if rows lingered. |
| `spawnOnboardingForNewKibbutz` wired into `components/home/KibbutzSheet.tsx`'s `save()` | island → Postgres | fires only on a genuine INSERT (`!row?.id`) with `section === 'new'`; best-effort (`.catch`) so a template hiccup never blocks the kibbutz itself from saving. |
| `OnboardingTemplateRow` in `islands/Settings.tsx`, gated `canEditTemplate(user)` | React tree | an ordered-list editor (reorder / relabel / toggle ממתין למייל) for עידן only; `saveOnboardingTemplate` writes only `steps` + `updated_by/at` — never touches `onboarding_steps`. |
| עמיחי's onboarding-age overview column | deferred | `lib/landing.ts` notes the CEO/עמיחי "סקירה" table isn't built yet (later task). `daysInOnboarding` is the pure function that table will call per client — nothing to wire until the table itself exists. |

## 🩺 מצב הקיבוץ — health v1 DRAFT (Task 28, company-process spec §5 + ruling §8b)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/health.ts` — `HEALTH_CONFIG_DRAFT` · `scoreFinance` · `scoreEnergy` · `scoreAlerts` · `scoreRecurring` · `healthOf` · `bandOf` · `canSeeHealth` | pure | the whole tuning surface is ONE exported const, so 22.9's answer (`sigma-health-v1-thresholds`) is a one-line diff. A contract sweep in `health.test.ts` reads the source and fails if any scorer body carries a digit — every threshold therefore comes from the config by construction. `null` in → `{score: null, why: 'אין נתונים'}`, and a null signal is **excluded from the average**, never counted as 0: a source nobody wired up must not fake a red. |
| `canSeeHealth(user, role)` → `audienceFor(role).health` (`app/src/lib/field.ts`) | pure → pure | who may look at a management signal is decided once, in §5.1b's `audienceFor`, and re-used here rather than re-derived. On top of it: עמיחי, עידן, and a read-only viewer. |
| `app/src/lib/healthSources.ts` — `HealthSource` · `emsApiSource` · `nullSource` · `sourceFor(cfg, deps)` · `loadHealth` | island → legacy → EMS | the §9 "EMS API vs read-only Postgres" question never reaches the UI: the strip asks a `HealthSource` and gets inputs or `null`. EMS exposes `/sites`, `/meters`, `/employee-tasks`, `/users` and nothing else, so **מאזן כספי, מאזן אנרגיה and בעיות חוזרות are `null` today** and only the age of the oldest open `/employee-tasks` row is real. `pgReadOnlySource` is deliberately NOT written — the interface is the deliverable. |
| `kibbutz_health` (`db/kibbutz_health.sql`) | Postgres | the on-demand cache: `kibbutz` pk · `score numeric` · `signals jsonb` · `computed_at`. RLS read-all / write-authenticated, like `onboarding_steps`. **No pg_cron job** until the thresholds are real — nothing nightly publishes unapproved numbers. |
| `#sigma-health-modal` (new slot in `index.html`, stamped by `js/src/10-activity.js:openEditModal`) → `islands/Health.tsx` | legacy → island, new lazy chunk | the third slot on the meetings/צריבות contract: ONE root for the session reads `data-kibbutz` off its own slot (`lib/modalSlot.ts`). Renders nothing outside the overview's audience. |
| `sigma.presenterStrip` ← `components/home/HealthStrip.tsx:presenterStripFor` | island → bridge → `islands/Presenter.tsx` | Task 24 reads this optional hook off the bridge, so the dependency runs one way only: the presenter never imports this file, and a page without the health chunk simply shows two strips. Served from the last answer the strip already has — the presenter triggers no second fetch. |
| Query key `['kibbutzHealth', kibbutz]` | island | one query per kibbutz, `staleTime` 5 min, `retry: false` — an EMS that is not signed in answers `null` rather than retrying behind a modal. |
| טיוטה marker | UI | permanent for v1: the strip says the numbers are a draft and that nobody should act on them yet. Removing it is part of the 22.9 follow-up, not of this task. |

## ⏱️ Clockify — ▶/■ שעות per kibbutz (Task 29, company-process spec §6 + ruling §8b)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/clockify.ts` — `canTrackTime` · `elapsed` · `formatElapsed` · `entryPayload` · `projectIdFor` · `tagIdsFor` · `tagsCached` · `loadRunning`/`saveRunning`/`clearRunning` · `startBlockedBy` | pure | every rule is a golden (`clockify.test.ts`, fake clock): the description format (`'<kibbutz> — <tags>'`, and **no dangling `— `** with no tags), the elapsed time across a reload and across midnight, the TTL cache that serves the STALE list when the API blinks, the duplicate-start guard and the role matrix (עידן ✓ מתניה ✓ אביאם ✗ עמיחי ✗ viewer ✗). |
| `supabase/functions/clockify/index.ts` — actions `tags` (rate-limited + 10-min instance cache) · `projects` · `entry` | island → edge function → Clockify | the ONLY holder of `CLOCKIFY_API_KEY` / `CLOCKIFY_WORKSPACE_ID` / `CLOCKIFY_USER_ID`. Same EMS gate, `{error}` shape, origin allowlist and hard fetch timeout as `supabase/functions/github/index.ts`. Creating a project is out of scope: an unmatched kibbutz gets `projectId: null` and keeps its name in the description. A sweep in `WorkTimer.test.tsx` asserts no `CLOCKIFY_*` read exists under `app/` or `js/`. |
| `work_sessions` (`db/work_sessions.sql`) — `clockify_id` **nullable** | Postgres | the row is the source of truth and Clockify is the mirror. RLS: read for authenticated, insert/update own rows only (`person = auth.jwt() ->> 'name'`). A partial index on `ended_at where clockify_id is null` is what a later quiet retry scans. |
| `components/home/WorkTimer.tsx` (button) + `WorkTimerStopSheet.tsx` (**lazy** chunk) + `workTimerApi.ts` / `workTimerEvents.ts` | React tree | the sheet, the Sheet primitives and the form are only loaded when someone actually stops a timer — the card itself pays for a button. The running session lives in `localStorage` (`sigma_clockify_running_v1`, keyed by person), so a reload keeps the clock and one person can only run one timer. |
| Attendee picker = `site_contacts` by `kibbutz`, addable inline | island → Postgres | the same rule as the visit summary: a name typed inline is usable immediately and is best-effort inserted into `site_contacts`; a refused insert never costs the session its attendee. |
| `work-session-saved` (new `sigmaBus` event, `workTimerEvents.ts`) | island → anyone | emitted once per saved session with `{kibbutz, clockify_id}`. `clockify_id = null` means "saved locally, not yet in Clockify" — the hook a later hours/retry surface listens on. |
| `sigma_clockify_tags_v1` (localStorage, 1 h) | client cache | the tag vocabulary is **theirs** (87 live tags) and is never hard-coded. A failed refresh keeps the stale list rather than emptying the picker. |

## ▶ ישיבת פיתוח — dev meeting mode + sprint prep (Task 30, company-process spec §7)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/sprintPrep.ts` — `stageOf` · `walkOrder` · `cardsWithoutSpec` · `blockedOver` · `questionsForIdan` · `burndown` · `rankCard` · `proposeSprint` · `sprintList` · `devPrep` · `canRunDevMeeting` | pure | every judgement the meeting makes is a golden over one board fixture (`sprintPrep.test.ts`, 34 cases): the three-column walk order, the "no `## ` section = no spec" rule, the >7-day stall, עידן's open questions, a burndown that is 0/0 rather than NaN on an empty board, and a ranking that is **total and stable** (ties → issue number ascending, so a re-run never reshuffles the list under him). `rankCard` is the WHOLE ranking in one exported function, so re-tuning it is a change to four numbers and to nothing else. |
| `devPrep(cards, opts)` → the one object | pure | the presenter walks `walk`; the 📋 prep card prints `burndown` / `cardsWithoutSpec` / `blocked` / `questions` / `sprint`. **One derivation, two surfaces** — there is no second data path and therefore no way for the screen and the prep sheet to disagree in front of the room. |
| `proposeSprint` never proposes a parent | pure | the Git Ticket System's rule (every card is a CHILD under a Main Fields parent, title `[מודול] \| [תת-תחום] \| [תיאור]`) is **enforced** here, not trusted: `stageOf(card) === 'fields'` is filtered out before ranking, and a board of nothing but parents proposes nothing. |
| `rankCard({ redKibbutzim })` ← `sigma.healthBands` ← `components/home/HealthStrip.tsx:healthBandsKnown` | island → bridge → island | Task 28's red signal, read the same one-way, null-safe way `sigma.presenterStrip` already is: no health chunk on the page → no map → **no bonus and no crash**. This screen has no import of that task. Pinned by a golden that `redKibbutzim: null` and `[]` both leave the score untouched. |
| `app/src/lib/devBoard.ts` — `DEV_BOARD_QUERY_KEY('open')` · `fetchDevBoard` · `moveToSprint` | island → `github` Edge Function | the React side's ONE path to the dev board. The read is the function's **default mode** — the same call `js/src/18-dev-tasks.js` makes for 💻 לוח פיתוח — under one shared query key, so the walk and the prep card are one fetch. **No new Edge-Function action was added for this task.** |
| `moveToSprint(numbers)` → `mode:'setStatus'`, `status:'Ready'` | island → edge function → GitHub Projects v2 | accepting a proposal uses the **EXISTING** "העבר לספרינט הקרוב" write and nothing else. The dev meeting **never creates a ticket**: the QA harness refuses every github mode but `setStatus`, so a create would fail loudly rather than quietly inventing a card. |
| `islands/DevPresenter.tsx` — a SEPARATE island, not a `mode` prop on `Presenter.tsx` | decision | the two screens share their frame (timer, counter, key map, session row, event log) and that frame is already `lib/meetingSession.ts`, which this island imports. Below the header they share nothing: one walks kibbutz ROWS with two state strips, a bullet history and a ✏️ sheet writing to `kibbutz_meeting_notes`; the other walks GitHub CARDS across three board columns and writes to the board. A `mode` prop would have forked the data source, the strips, the body, the sheet and the footer — five branches in one 721-line file. |
| `meeting_events` rows of kind `issue`, carrying `issue_number` | island → Postgres | the dev meeting's navigation log, on the SAME table and the same offsets §1.3 lines up against the recording. Arriving at a card logs it once (keyed against StrictMode); 📌 adds one more row for the card on screen and the screen does not move. |
| `#sigma-dev-presenter` (new placeholder, after `#sigma-presenter`) → `islands/DevPresenter.tsx` | index.html → island | deferred behind `whenIdle` exactly like ▶ מצב ישיבה, with the ⋯ row and the opener registered eagerly (the task-15 cold-tap lesson) and the cold-open flag consumed inside the island's first render. |
| ⋯ עוד → **▶ ישיבת פיתוח** (`registry.ts`, group `admin`) | registry | gated live by the **dev page's own audience**: עידן + מתניה + אליה, or anyone the app already calls an admin, and **never a viewer** — the screen writes to the meeting log and moves cards on the board. Asked on every listing, so `changeUser()` cannot leave a stale row behind. |

