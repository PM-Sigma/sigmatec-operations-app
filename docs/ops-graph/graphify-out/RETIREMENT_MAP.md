# Retirement map — round 5 Phase 1 cleanup

Built 2026-09-23 for `docs/superpowers/specs/2026-09-23-round-5-design.md` Phase 1 ("Remove the
Google Sheet / Apps Script data path" + the legacy-page rewrites) and "How the work runs → Graph":
*"Before Phase 1, Sonnet cleans the retired nodes out of the graph ... Opus reviews that."* This is
that first pass — it does not delete anything from the graph, it **marks** what is about to go so
builders and auditors stop trusting edges into it.

**Method:** for each target, `graphify-out/graph.json` was queried directly (same data
`ops_graph.py explain/file/table/path` reads) to list every node whose `source_file` falls inside
the target, then every edge where a node in the target is the edge's `target` and the other end
(`source`) is **not** itself retiring. Those inbound edges are the dependencies that must move
first — delete the retiring node while one of these still points at it and something breaks.
Edges were split three ways:
- **Code dependencies** — `calls`/`imports`/`imports_from`/`reads_writes`/`implements`/`tests`/
  `references` from code that survives the round. These are real migration blockers.
- **Docs referencing this** — `documents` edges from `.md` files. Update or delete the mention
  after the code is gone; not a build-breaking dependency.
- **Weak/inferred** — `conceptually_related_to`/`semantically_similar_to`, `INFERRED`/`AMBIGUOUS`
  confidence. Informational only, no action implied.

`contains` edges (a file containing its own function) are dropped from all three buckets —
they're structural, not a cross-boundary dependency.

**Verify any single row** with `python docs/ops-graph/ops_graph.py explain "<name>"` or
`file <name>` — the location column gives you the exact line to open.

## Summary

| Target | Nodes | Code deps to migrate | Docs to update | Weak/inferred |
|---|---:|---:|---:|---:|
| Google Sheet / Apps Script data path | 8 | 5 (+10 direct call sites below — graph blind spot) | 5 | 0 |
| `maintenance.html` | 1 | 1 | 0 | 0 |
| Ctrl+K `CommandBar.tsx` | 10 | 5 | 6 | 0 |
| Legacy visit form (09-visits.js UI + index.html) | 53 | 32 | 2 | 1 |
| Legacy kibbutz modal (index.html:613-852 + openEditModal) | 4 | 4 | 0 | 0 |
| Legacy inventory: `06-products.js`/`07-orders.js`/`08-inventory.js` | 109 | 94 | 36 | 3 |
| Legacy inventory: `20-delivery-cert.js` UI parts | 30 | 28 | 0 | 0 |
| `24-meter-burns.js` legacy page | 51 | 13 | 16 | 4 |
| `23-push-log.js` legacy page | 6 | 2 | 7 | 0 |
| `18-dev-tasks.js` legacy page | 52 | 12 | 11 | 1 |
| Tables: `tasks`, `settings`, `ems_cache`, `ems_queue` | 4 | 59 | 4 | 0 |
| **Total** | **328** | **255** (+10) | **87** | **9** |

## Findings that need a decision before Phase 1 deletes anything

1. **RESOLVED (Opus audit 23.9): `visitContactEnsure()` is NOT retiring.** The kept pipeline
   `saveVisitFromData()` calls it (`js/src/09-visits.js:L1333`), and it is self-contained (reads/
   inserts `site_contacts` directly, no dependency on the legacy form's `_visitContacts` chips).
   It was removed from `retiring_nodes.json` and from the counts below; it stays a shared helper.
   The rest of the contact picker (`visitContactsRender/ChipsPaint/Pick/Typed/Persist`) is legacy
   form UI and still retires.
2. **`getActiveProducts()`, `computeStock()`, `poolStockMap()`, `productCategoryMap()`,
   `orderType()`, `orderKibbutz()`** (all defined in the fully-retiring `06-products.js`/
   `07-orders.js`/`08-inventory.js`) are called from files that are **not** part of this round's
   rewrite: `03-requirements.js`, `05-meeting-returns.js`, `09-visits.js` (`visitCatalogNames`),
   `10-activity.js`, `20-delivery-cert.js`, `21-excel-export.js`, `22-push.js`, and the
   `sigma.products`/`sigma.productNames`/`sigma.poolStock` bridge calls in `00-bridge.js`. These
   read as shared inventory primitives that happen to live in the legacy files — Package I
   (`app/src/lib/inventory.ts`) needs to absorb them (or equivalents) before `06/07/08` are deleted,
   not just the UI.
3. **The Google Sheet / Apps Script SHEET_API path is a known graph blind spot** (README.md
   "Known blind spots"): the extraction never modeled the ~40 direct `fetch(SHEET_API, ...)` call
   sites, only the four proxy functions in `01-data.js`/`12-reports.js`/`13-ems.js`. The grep-derived
   list below is the authoritative migration list for this target, not the graph edges.
4. **`24-meter-burns.js`, `23-push-log.js`'s tables (`meter_burns`, `generators`, `push_log`) are
   NOT in the retiring-tables list** — only `tasks`/`settings`/`ems_cache`/`ems_queue` are. The
   first automated pass over this map swept those tables in by file-prefix (same JS file just
   happens to be where the table node is first mentioned) and had to be corrected; kept here as a
   warning for whoever re-runs a similar sweep by hand.
5. **`ext:github`** (the GitHub Projects backend) is referenced from `18-dev-tasks.js` but is not
   retiring — `devBoard.ts`, `DevPresenter.tsx` and `supabase/functions/github` keep talking to it.
   Same file-prefix trap as #4; corrected here.

## SHEET_API direct call sites (grep, not graph — see finding #3)

The spec's Phase 1 names "SHEET_API in 10 modules"; grep confirms exactly 10 call sites besides the
defining/interceptor file (`01-data.js`, kept until the whole path is migrated):

| File | `fetch(SHEET_API` call lines |
|---|---|
| `js/src/02-init-attendance.js` | 290 |
| `js/src/03-requirements.js` | 138, 178 |
| `js/src/04-attendance-daily.js` | 96, 493 |
| `js/src/05-meeting-returns.js` | 148, 150, 166 |
| `js/src/06-products.js` | 115, 143 (file fully retiring anyway) |
| `js/src/07-orders.js` | 76, 282, 393, 507, 526, 528, 560, 572, 574, 665, 1177, 1207, 1220, 1236, 1251 (file fully retiring anyway) |
| `js/src/09-visits.js` | 717, 719, 773, 775, 919, 921, 1106, 1141, 1304, 1349, 1397 (mixed: some inside the retiring form, `saveVisitFromData`'s own SHEET_API writes need a Supabase-only replacement) |
| `js/src/12-reports.js` | 111 (defines `emsProxyCall()`, in graph already) |
| `js/src/13-ems.js` | 86, 239, 350 (defines `emsQueueAdd/Flush`, `emsSyncCache`, in graph already) |
| `js/src/20-delivery-cert.js` | 239, 253, 271, 837 (file's pipeline parts are KEPT — see the 20-delivery-cert section below; these calls must move to Supabase before the Sheet path goes) |

`?sb=0` (local-fixture mode) must keep working without the Sheet, per the spec — verify its code
path doesn't route through any of the above before deleting `01-data.js`'s interceptor.

---


## Google Sheet / Apps Script data path  (8 nodes)

- `file:appsscript/archive-certs.gs` — archive-certs.gs  (appsscript/archive-certs.gs:L958)
- `file:appsscript/ems-calendar-backend.gs` — ems-calendar-backend.gs  (appsscript/ems-calendar-backend.gs:L268)
- `db_import_from_appsscript_mjs` — import_from_appsscript.mjs  (db/import_from_appsscript.mjs:L1)
- `db_import_from_appsscript_h` — H  (db/import_from_appsscript.mjs:L12)
- `db_import_from_appsscript_load` — load()  (db/import_from_appsscript.mjs:L14)
- `concept:import_from_appsscript_script@db/import_from_appsscript.mjs` — load() helper + per-table snapshot mappers (tasks/visits/products/orders/movements/requirements/returns/attendance/settings/potentials/regions/ems_cache/ems_queue)  (db/import_from_appsscript.mjs:L14-104)
- `db_import_from_appsscript_tscore` — tScore()  (db/import_from_appsscript.mjs:L37)
- `ext:google_apps_script_backend` — Google Apps Script proxy (SHEET_API) + backing Sheet  (js/src/12-reports.js:L102)

### Code dependencies from code NOT being retired — migrate before deleting (5)

- `Cert sharing (email/WhatsApp/view-link) + monthly Google-Drive ETL for PDF snapshots` --implements--> `archive-certs.gs`  [EXTRACTED]  (docs/CHANGELOG.md:L989)
- `emsProxyCall()` --calls--> `Google Apps Script proxy (SHEET_API) + backing Sheet`  [EXTRACTED]  (js/src/12-reports.js:L111)
- `emsQueueAdd()` --calls--> `Google Apps Script proxy (SHEET_API) + backing Sheet`  [EXTRACTED]  (js/src/13-ems.js:L239)
- `emsQueueFlush()` --calls--> `Google Apps Script proxy (SHEET_API) + backing Sheet`  [EXTRACTED]  (js/src/13-ems.js:L350)
- `emsSyncCache()` --calls--> `Google Apps Script proxy (SHEET_API) + backing Sheet`  [EXTRACTED]  (js/src/13-ems.js:L86)

### Docs referencing this — update/remove mention after retiring (5)

- `README.md` --documents--> `import_from_appsscript.mjs`  [EXTRACTED]  (README.md:L35)
- `data-and-security.md` --documents--> `import_from_appsscript.mjs`  [EXTRACTED]  (docs/data-and-security.md:L36)
- `modules.md` --documents--> `ems-calendar-backend.gs`  [EXTRACTED]  (docs/modules.md:L268)
- `operations.md` --documents--> `import_from_appsscript.mjs`  [EXTRACTED]  (docs/operations.md:L92)
- `operations.md` --documents--> `ems-calendar-backend.gs`  [EXTRACTED]  (docs/operations.md:L95)

### Weak/inferred mentions (low confidence, informational) (0)

(none)


## maintenance.html  (1 nodes)

- `file:maintenance.html` — maintenance.html  (maintenance.html:L1)

### Code dependencies from code NOT being retired — migrate before deleting (1)

- `[PLANNED] Delete maintenance.html leftover from the 2.00 upgrade window` --references--> `maintenance.html`  [EXTRACTED]  (docs/backlog.md:L12)

### Docs referencing this — update/remove mention after retiring (0)

(none)


### Weak/inferred mentions (low confidence, informational) (0)

(none)


## Ctrl+K CommandBar.tsx  (10 nodes)

- `app_src_islands_commandbar_tsx` — CommandBar.tsx  (app/src/islands/CommandBar.tsx:L1)
- `islands_commandbar_pages` — PAGES  (app/src/islands/CommandBar.tsx:L101)
- `islands_commandbar_readkibbutzim` — readKibbutzim()  (app/src/islands/CommandBar.tsx:L110)
- `islands_commandbar_buildcommands` — buildCommands()  (app/src/islands/CommandBar.tsx:L121)
- `islands_commandbar_runadd` — runAdd()  (app/src/islands/CommandBar.tsx:L170)
- `islands_commandbar_commandbarpanel` — CommandBarPanel()  (app/src/islands/CommandBar.tsx:L186)
- `islands_commandbar_commandbarroot` — CommandBarRoot()  (app/src/islands/CommandBar.tsx:L299)
- `islands_commandbar_mountcommandbar` — mountCommandBar()  (app/src/islands/CommandBar.tsx:L308)
- `islands_commandbar_opencommandbar` — openCommandBar()  (app/src/islands/CommandBar.tsx:L33)
- `islands_commandbar_messagesheet` — MessageSheet()  (app/src/islands/CommandBar.tsx:L45)

### Code dependencies from code NOT being retired — migrate before deleting (5)

- `HeaderActions.tsx` --imports_from--> `CommandBar.tsx`  [EXTRACTED]  (app/src/islands/HeaderActions.tsx:L16)
- `HeaderActions.tsx` --imports--> `runAdd()`  [EXTRACTED]  (app/src/islands/HeaderActions.tsx:L16)
- `HeaderActions.tsx` --imports--> `openCommandBar()`  [EXTRACTED]  (app/src/islands/HeaderActions.tsx:L16)
- `boot()` --imports_from--> `CommandBar.tsx`  [EXTRACTED]  (app/src/main.tsx:L283)
- `test-integration.mjs` --references--> `CommandBar.tsx`  [INFERRED]  (test-integration.mjs:L135)

### Docs referencing this — update/remove mention after retiring (6)

- `CHANGELOG.md` --documents--> `CommandBar.tsx`  [EXTRACTED]  (docs/CHANGELOG.md:L495)
- `click-map.md` --documents--> `CommandBar.tsx`  [EXTRACTED]  (docs/click-map.md:L289)
- `integration-map.annotations.md` --documents--> `CommandBar.tsx`  [EXTRACTED]  (docs/integration-map.annotations.md:L38)
- `integration-map.md` --documents--> `CommandBar.tsx`  [EXTRACTED]  (docs/integration-map.md:L60)
- `2026-09-23-qa-coverage-audit.md` --documents--> `CommandBar.tsx`  [EXTRACTED]  (docs/reports/2026-09-23-qa-coverage-audit.md:L143)
- `2026-09-22-phone-qa-round-3-design.md` --documents--> `CommandBar.tsx`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-3-design.md:L31)

### Weak/inferred mentions (low confidence, informational) (0)

(none)


## Legacy visit form (09-visits.js UI + index.html markup)  (53 nodes)

- `concept:tab_visit@index.html` — modal tab: ביקורים (visit form)  (index.html:L679)
- `concept:aviam_day_type_selector@index.html` — aviamDayTypeSelector — Aviam-only day-type toggle group  (index.html:L736)
- `concept:visit_field_form@index.html` — visitFieldForm — full field-visit form (duration/products/summary/EMS/contact)  (index.html:L750)
- `concept:visit_simple_form@index.html` — visitSimpleForm — Aviam non-field-day simple date form  (index.html:L837)
- `src_09_visits_visitcontactchipspaint` — visitContactChipsPaint()  (js/src/09-visits.js:L101)
- `src_09_visits_visitcontactpick` — visitContactPick()  (js/src/09-visits.js:L108)
- `src_09_visits_visitcontacttyped` — visitContactTyped()  (js/src/09-visits.js:L114)
- `src_09_visits_visitcontactpersist` — visitContactPersist()  (js/src/09-visits.js:L115)
- `src_09_visits_visitotherproductchanged` — visitOtherProductChanged()  (js/src/09-visits.js:L155)
- `src_09_visits_visitaddothertocatalog` — visitAddOtherToCatalog()  (js/src/09-visits.js:L163)
- `src_09_visits_renderproductsforvisitor` — renderProductsForVisitor()  (js/src/09-visits.js:L176)
- `src_09_visits_visitdraftid` — visitDraftId()  (js/src/09-visits.js:L20)
- `src_09_visits_togglevisitworkday` — toggleVisitWorkday()  (js/src/09-visits.js:L25)
- `src_09_visits_tilefor` — tileFor()  (js/src/09-visits.js:L250)
- `src_09_visits_tileedit` — tileEdit()  (js/src/09-visits.js:L251)
- `src_09_visits_tilesync` — tileSync()  (js/src/09-visits.js:L257)
- `src_09_visits_tiletap` — tileTap()  (js/src/09-visits.js:L262)
- `src_09_visits_tileremove` — tileRemove()  (js/src/09-visits.js:L269)
- `src_09_visits_toggleproductrow` — toggleProductRow()  (js/src/09-visits.js:L278)
- `src_09_visits_stepproductqty` — stepProductQty()  (js/src/09-visits.js:L287)
- `src_09_visits_toggleproductqty` — toggleProductQty()  (js/src/09-visits.js:L307)
- `src_09_visits_setvisithours` — setVisitHours()  (js/src/09-visits.js:L35)
- `src_09_visits_editlastvisit` — editLastVisit()  (js/src/09-visits.js:L446)
- `src_09_visits_editlastvisitfromstatus` — editLastVisitFromStatus()  (js/src/09-visits.js:L467)
- `src_09_visits_setvisitworkday` — setVisitWorkday()  (js/src/09-visits.js:L47)
- `src_09_visits_legacyvoiceintakehandoff` — legacyVoiceIntakeHandoff()  (js/src/09-visits.js:L473)
- `src_09_visits_editvisit` — editVisit()  (js/src/09-visits.js:L488)
- `src_09_visits_drafttoday` — draftToday()  (js/src/09-visits.js:L538)
- `src_09_visits_draftperson` — draftPerson()  (js/src/09-visits.js:L551)
- `src_09_visits_visitdraftpayload` — visitDraftPayload()  (js/src/09-visits.js:L559)
- `src_09_visits_syncvisitdurationchips` — syncVisitDurationChips()  (js/src/09-visits.js:L56)
- `src_09_visits_visitdrafthascontent` — visitDraftHasContent()  (js/src/09-visits.js:L586)
- `src_09_visits_draftkey` — draftKey()  (js/src/09-visits.js:L602)
- `src_09_visits_draftmirrorall` — draftMirrorAll()  (js/src/09-visits.js:L607)
- `src_09_visits_draftmirrorsave` — draftMirrorSave()  (js/src/09-visits.js:L627)
- `src_09_visits_draftmirrorput` — draftMirrorPut()  (js/src/09-visits.js:L634)
- `src_09_visits_draftmirrordeletebyid` — draftMirrorDeleteById()  (js/src/09-visits.js:L641)
- `src_09_visits_draftmirrorlist` — draftMirrorList()  (js/src/09-visits.js:L652)
- `src_09_visits_draftmergerows` — draftMergeRows()  (js/src/09-visits.js:L665)
- `src_09_visits_visitdraftssync` — visitDraftsSync()  (js/src/09-visits.js:L683)
- `src_09_visits_visitdraftsave` — visitDraftSave()  (js/src/09-visits.js:L703)
- `src_09_visits_visitdrafttouch` — visitDraftTouch()  (js/src/09-visits.js:L731)
- `src_09_visits_visitdraftflush` — visitDraftFlush()  (js/src/09-visits.js:L738)
- `src_09_visits_visitdraftfor` — visitDraftFor()  (js/src/09-visits.js:L748)
- `src_09_visits_visitdraftsforperson` — visitDraftsForPerson()  (js/src/09-visits.js:L758)
- `src_09_visits_visitdraftdiscard` — visitDraftDiscard()  (js/src/09-visits.js:L764)
- `src_09_visits_visitdraftrestore` — visitDraftRestore()  (js/src/09-visits.js:L798)
- `src_09_visits_visitdraftprompthide` — visitDraftPromptHide()  (js/src/09-visits.js:L843)
- `src_09_visits_drafttime` — draftTime()  (js/src/09-visits.js:L850)
- `src_09_visits_visitdraftpromptshow` — visitDraftPromptShow()  (js/src/09-visits.js:L861)
- `src_09_visits_visitcontactsrender` — visitContactsRender()  (js/src/09-visits.js:L90)
- `src_09_visits_visitdraftput` — visitDraftPut()  (js/src/09-visits.js:L907)
- `src_09_visits_savevisit` — saveVisit()  (js/src/09-visits.js:L993)

### Code dependencies from code NOT being retired — migrate before deleting (32)

- `index.html` --calls--> `editLastVisitFromStatus()`  [EXTRACTED]  (index.html:L633)
- `index.html` --calls--> `visitDraftRestore()`  [EXTRACTED]  (index.html:L691)
- `index.html` --calls--> `visitDraftDiscard()`  [EXTRACTED]  (index.html:L692)
- `index.html` --calls--> `editLastVisit()`  [EXTRACTED]  (index.html:L703)
- `index.html` --calls--> `legacyVoiceIntakeHandoff()`  [EXTRACTED]  (index.html:L715)
- `index.html` --calls--> `setVisitHours()`  [EXTRACTED]  (index.html:L760)
- `index.html` --calls--> `setVisitWorkday()`  [EXTRACTED]  (index.html:L765)
- `index.html` --calls--> `syncVisitDurationChips()`  [EXTRACTED]  (index.html:L770)
- `index.html` --calls--> `toggleVisitWorkday()`  [EXTRACTED]  (index.html:L773)
- `index.html` --calls--> `visitOtherProductChanged()`  [EXTRACTED]  (index.html:L785)
- `index.html` --calls--> `visitAddOtherToCatalog()`  [EXTRACTED]  (index.html:L787)
- `index.html` --calls--> `visitContactTyped()`  [EXTRACTED]  (index.html:L826)
- `index.html` --calls--> `saveVisit()`  [EXTRACTED]  (index.html:L832)
- `00-bridge.js` --calls--> `stepProductQty()`  [EXTRACTED]  (js/src/00-bridge.js:L38) — **false positive (audit 23.9): L38 is a doc comment example, not a call**
- `sigma.visitDraftFor` --calls--> `visitDraftFor()`  [EXTRACTED]  (js/src/00-bridge.js:L460)
- `sigma.visitDraftDiscard` --calls--> `visitDraftDiscard()`  [EXTRACTED]  (js/src/00-bridge.js:L461)
- `sigma.visitDraftPut` --calls--> `visitDraftPut()`  [EXTRACTED]  (js/src/00-bridge.js:L465)
- `sigma.visitDraftId` --calls--> `visitDraftId()`  [EXTRACTED]  (js/src/00-bridge.js:L468)
- `switchTab()` --calls--> `visitDraftsSync()`  [INFERRED]  (js/src/02-init-attendance.js:L21)
- `switchTab()` --calls--> `visitDraftPromptShow()`  [INFERRED]  (js/src/02-init-attendance.js:L22)
- `switchTab()` --calls--> `syncVisitDurationChips()`  [INFERRED]  (js/src/02-init-attendance.js:L26)
- `switchTab()` --calls--> `visitDraftFlush()`  [INFERRED]  (js/src/02-init-attendance.js:L28)
- `openVisitFromAttendance()` --calls--> `editVisit()`  [INFERRED]  (js/src/04-attendance-daily.js:L435)
- `09-visits.js` --calls--> `visitContactPick()`  [EXTRACTED]  (js/src/09-visits.js:L105)
- `09-visits.js` --calls--> `tileTap()`  [EXTRACTED]  (js/src/09-visits.js:L230)
- `09-visits.js` --calls--> `toggleProductQty()`  [EXTRACTED]  (js/src/09-visits.js:L231)
- `09-visits.js` --calls--> `stepProductQty()`  [EXTRACTED]  (js/src/09-visits.js:L236)
- `09-visits.js` --calls--> `visitDraftTouch()`  [EXTRACTED]  (js/src/09-visits.js:L237)
- `09-visits.js` --calls--> `tileRemove()`  [EXTRACTED]  (js/src/09-visits.js:L239)
- `09-visits.js` --calls--> `editVisit()`  [EXTRACTED]  (js/src/09-visits.js:L438)
- `09-visits.js` --implements--> `saveVisit()`  [EXTRACTED]  (js/src/09-visits.js:L993)
- `test-visit-cert-gate.mjs` --tests--> `saveVisit()`  [EXTRACTED]  (test-visit-cert-gate.mjs:L50)

### Docs referencing this — update/remove mention after retiring (3)

- `2026-08-02-attendance-hub-design.md` --documents--> `editVisit()`  [EXTRACTED]  (docs/superpowers/specs/2026-08-02-attendance-hub-design.md:L19,61-64)
- `2026-08-02-attendance-hub-design.md` --documents--> `saveVisit()`  [EXTRACTED]  (docs/superpowers/specs/2026-08-02-attendance-hub-design.md:L19,93-97)

### Weak/inferred mentions (low confidence, informational) (1)

- `modalDirtyByFields()` --semantically_similar_to--> `visitDraftHasContent()`  [INFERRED]  (js/src/00-guard.js)

## Legacy kibbutz modal (index.html:613-852 + 10-activity.js openEditModal)  (4 nodes)

- `concept:modal_backdrop_kibbutz@index.html` — modalBackdrop — ניהול קיבוץ (kibbutz card modal), tabs מצב/ביקורים  (index.html:L613)
- `concept:tab_meetings@index.html` — modal tab: מצב הקיבוץ (meetings/status)  (index.html:L623)
- `concept:edit_last_visit_box@index.html` — editLastVisitBox — read-only last visit summary in status tab  (index.html:L628)
- `src_10_activity_openeditmodal` — openEditModal()  (js/src/10-activity.js:L514)

### Code dependencies from code NOT being retired — migrate before deleting (4)

- `sigma.openKibbutzModal` --calls--> `openEditModal()`  [EXTRACTED]  (js/src/00-bridge.js:L309)
- `sigma.openVisitQuick` --calls--> `openEditModal()`  [EXTRACTED]  (js/src/00-bridge.js:L372)
- `visitQuickGo()` --calls--> `openEditModal()`  [INFERRED]  (js/src/02-init-attendance.js:L316)
- `openVisitFromAttendance()` --calls--> `openEditModal()`  [INFERRED]  (js/src/04-attendance-daily.js:L433)

### Docs referencing this — update/remove mention after retiring (0)

(none)


### Weak/inferred mentions (low confidence, informational) (0)

(none)


## Legacy inventory pages: 06-products.js, 07-orders.js, 08-inventory.js  (109 nodes)

- `js_src_06_products_js` — 06-products.js  (js/src/06-products.js:L1)
- `src_06_products_invtoggleproductactive` — invToggleProductActive()  (js/src/06-products.js:L113)
- `src_06_products_invsaveproduct` — invSaveProduct()  (js/src/06-products.js:L125)
- `src_06_products_getactiveproducts` — getActiveProducts()  (js/src/06-products.js:L2)
- `src_06_products_reportwiringok` — reportWiringOk()  (js/src/06-products.js:L51)
- `src_06_products_productlabel` — productLabel()  (js/src/06-products.js:L54)
- `src_06_products_reportpreview` — reportPreview()  (js/src/06-products.js:L69)
- `src_06_products_invapplydisplaynamegate` — invApplyDisplayNameGate()  (js/src/06-products.js:L76)
- `src_06_products_invrenderproducts` — invRenderProducts()  (js/src/06-products.js:L8)
- `src_06_products_invnewproduct` — invNewProduct()  (js/src/06-products.js:L84)
- `src_06_products_inveditproduct` — invEditProduct()  (js/src/06-products.js:L96)
- `js_src_07_orders_js` — 07-orders.js  (js/src/07-orders.js:L1)
- `src_07_orders_intake_stop` — INTAKE_STOP  (js/src/07-orders.js:L100)
- `src_07_orders_importopenrequirements` — importOpenRequirements()  (js/src/07-orders.js:L1035)
- `src_07_orders_invadditemrow` — invAddItemRow()  (js/src/07-orders.js:L1062)
- `src_07_orders_resolveambiguoussatec` — resolveAmbiguousSatec()  (js/src/07-orders.js:L1070)
- `src_07_orders_accessoryplan` — accessoryPlan()  (js/src/07-orders.js:L108)
- `src_07_orders_orderparseraw` — orderParseRaw()  (js/src/07-orders.js:L1088)
- `src_07_orders_onvisitorchange` — onVisitorChange()  (js/src/07-orders.js:L1121)
- `src_07_orders_invtoggledistribution` — invToggleDistribution()  (js/src/07-orders.js:L1145)
- `src_07_orders_invsaveorder` — invSaveOrder()  (js/src/07-orders.js:L1150)
- `src_07_orders_parselocaltoitems` — parseLocalToItems()  (js/src/07-orders.js:L130)
- `src_07_orders_intakeparselocal` — intakeParseLocal()  (js/src/07-orders.js:L221)
- `src_07_orders_parserawtoitems` — parseRawToItems()  (js/src/07-orders.js:L226)
- `src_07_orders_renderintakegrid` — renderIntakeGrid()  (js/src/07-orders.js:L250)
- `src_07_orders_intakeaddrow` — intakeAddRow()  (js/src/07-orders.js:L268)
- `src_07_orders_he_numwords` — HE_NUMWORDS  (js/src/07-orders.js:L27)
- `src_07_orders_intakesave` — intakeSave()  (js/src/07-orders.js:L273)
- `src_07_orders_intakenormalize` — intakeNormalize()  (js/src/07-orders.js:L30)
- `concept:voice_transcription_flow@js/src/07-orders.js` — Voice recording -> Gemini transcription -> form apply  (js/src/07-orders.js:L305-453)
- `src_07_orders_pickrecordermime` — pickRecorderMime()  (js/src/07-orders.js:L312)
- `src_07_orders_openvoice` — openVoice()  (js/src/07-orders.js:L318)
- `src_07_orders_closevoice` — closeVoice()  (js/src/07-orders.js:L331)
- `src_07_orders_fmtsecs` — _fmtSecs()  (js/src/07-orders.js:L338)
- `src_07_orders_togglevoicerecording` — toggleVoiceRecording()  (js/src/07-orders.js:L340)
- `src_07_orders_intakeqtynear` — intakeQtyNear()  (js/src/07-orders.js:L37)
- `src_07_orders_fakeprogress` — _fakeProgress()  (js/src/07-orders.js:L370)
- `src_07_orders_sendvoicefortranscription` — sendVoiceForTranscription()  (js/src/07-orders.js:L379)
- `concept:customer_intake_pipeline@js/src/07-orders.js` — AI-first customer-request intake (paste -> parse -> confirm -> order)  (js/src/07-orders.js:L4-303)
- `src_07_orders_rendervoicereview` — renderVoiceReview()  (js/src/07-orders.js:L413)
- `src_07_orders_voiceretry` — voiceRetry()  (js/src/07-orders.js:L425)
- `src_07_orders_applyvoiceresult` — applyVoiceResult()  (js/src/07-orders.js:L436)
- `src_07_orders_getorderquickaction` — getOrderQuickAction()  (js/src/07-orders.js:L455)
- `concept:order_approval_workflow@js/src/07-orders.js` — Supplier/customer order approval routing + stock/EMS side-effects  (js/src/07-orders.js:L455-660)
- `src_07_orders_ordertotalqty` — orderTotalQty()  (js/src/07-orders.js:L467)
- `src_07_orders_ordertype` — orderType()  (js/src/07-orders.js:L468)
- `src_07_orders_isdirectsupply` — isDirectSupply()  (js/src/07-orders.js:L470)
- `src_07_orders_orderkibbutz` — orderKibbutz()  (js/src/07-orders.js:L472)
- `src_07_orders_orderneedsamichai` — orderNeedsAmichai()  (js/src/07-orders.js:L480)
- `src_07_orders_canapprovethisorder` — canApproveThisOrder()  (js/src/07-orders.js:L481)
- `src_07_orders_approvalwaitingmsg` — approvalWaitingMsg()  (js/src/07-orders.js:L487)
- `src_07_orders_openintake` — openIntake()  (js/src/07-orders.js:L49)
- `src_07_orders_canapproveorders` — canApproveOrders()  (js/src/07-orders.js:L491)
- `src_07_orders_approveorder` — approveOrder()  (js/src/07-orders.js:L494)
- `src_07_orders_approvesupplierorder` — approveSupplierOrder()  (js/src/07-orders.js:L503)
- `src_07_orders_approvecustomerorder` — approveCustomerOrder()  (js/src/07-orders.js:L518)
- `src_07_orders_maybeshowamichaiapprovalreminder` — maybeShowAmichaiApprovalReminder()  (js/src/07-orders.js:L586)
- `src_07_orders_order_notif_group` — ORDER_NOTIF_GROUP  (js/src/07-orders.js:L607)
- `concept:order_notif_seen_store@js/src/07-orders.js` — localStorage per-user 'orders_notif_seen_' seen-set  (js/src/07-orders.js:L607-616)
- `src_07_orders_ordernotifkey` — orderNotifKey()  (js/src/07-orders.js:L608)
- `src_07_orders_ordernotifseen` — orderNotifSeen()  (js/src/07-orders.js:L609)
- `src_07_orders_ordernotifmarkseen` — orderNotifMarkSeen()  (js/src/07-orders.js:L610)
- `src_07_orders_isapprovedorder` — isApprovedOrder()  (js/src/07-orders.js:L615)
- `src_07_orders_maybeshowordernotifications` — maybeShowOrderNotifications()  (js/src/07-orders.js:L618)
- `src_07_orders_intakebacktostep1` — intakeBackToStep1()  (js/src/07-orders.js:L62)
- `src_07_orders_showordernotifmodal` — showOrderNotifModal()  (js/src/07-orders.js:L633)
- `src_07_orders_quickorderstatus` — quickOrderStatus()  (js/src/07-orders.js:L661)
- `src_07_orders_intakeparse` — intakeParse()  (js/src/07-orders.js:L68)
- `src_07_orders_invrenderorders` — invRenderOrders()  (js/src/07-orders.js:L683)
- `src_07_orders_invpopulateorderkibbutz` — invPopulateOrderKibbutz()  (js/src/07-orders.js:L745)
- `fn:invSetOrderType@js/src/07-orders.js` — invSetOrderType  (js/src/07-orders.js:L753)
- `fn:invAssigneeChanged@js/src/07-orders.js` — invAssigneeChanged  (js/src/07-orders.js:L788)
- `src_07_orders_distinctsuppliers` — distinctSuppliers()  (js/src/07-orders.js:L790)
- `src_07_orders_invpopulatesupplierlist` — invPopulateSupplierList()  (js/src/07-orders.js:L795)
- `src_07_orders_intake_aliases` — INTAKE_ALIASES  (js/src/07-orders.js:L8)
- `src_07_orders_invneworder` — invNewOrder()  (js/src/07-orders.js:L800)
- `src_07_orders_inveditorder` — invEditOrder()  (js/src/07-orders.js:L829)
- `src_07_orders_invapprovefromedit` — invApproveFromEdit()  (js/src/07-orders.js:L864)
- `src_07_orders_renderorderitems` — renderOrderItems()  (js/src/07-orders.js:L872)
- `src_07_orders_pslabel` — psLabel()  (js/src/07-orders.js:L911)
- `src_07_orders_orderupdater` — orderUpdater()  (js/src/07-orders.js:L917)
- `src_07_orders_updaterstockmap` — updaterStockMap()  (js/src/07-orders.js:L923)
- `src_07_orders_parsesourcebadge` — parseSourceBadge()  (js/src/07-orders.js:L928)
- `fn:invChooseProduct@js/src/07-orders.js` — invChooseProduct  (js/src/07-orders.js:L951)
- `src_07_orders_ctrllabel` — ctrlLabel()  (js/src/07-orders.js:L959)
- `concept:conversational_choice_modal@js/src/07-orders.js` — askChoice() 'the app asks, you tap' question modal  (js/src/07-orders.js:L965-991)
- `src_07_orders_askchoice` — askChoice()  (js/src/07-orders.js:L968)
- `concept:accessory_auto_add_model@js/src/07-orders.js` — Controller/SIM/antenna/power-supply auto-add rules for customer orders  (js/src/07-orders.js:L98-127)
- `fn:_orderQPick@js/src/07-orders.js` — _orderQPick  (js/src/07-orders.js:L986)
- `src_07_orders_finalizecustomeraccessories` — finalizeCustomerAccessories()  (js/src/07-orders.js:L995)
- `js_src_08_inventory_js` — 08-inventory.js  (js/src/08-inventory.js:L1)
- `concept:inventory_pool_model@js/src/08-inventory.js` — ONE company pool ('חברה') stock model (spec §1/§4/§6)  (js/src/08-inventory.js:L1-30)
- `src_08_inventory_openstockchangesheet` — openStockChangeSheet()  (js/src/08-inventory.js:L118)
- `concept:stock_changed_event_listener@js/src/08-inventory.js` — sigmaBus 'stock-changed' listener re-renders pool  (js/src/08-inventory.js:L134-139)
- `src_08_inventory_stock_category_order` — STOCK_CATEGORY_ORDER  (js/src/08-inventory.js:L143)
- `src_08_inventory_productcategorymap` — productCategoryMap()  (js/src/08-inventory.js:L144)
- `src_08_inventory_sortbycategorythenname` — sortByCategoryThenName()  (js/src/08-inventory.js:L149)
- `src_08_inventory_invsetstockfilter` — invSetStockFilter()  (js/src/08-inventory.js:L165)
- `src_08_inventory_invrenderstock` — invRenderStock()  (js/src/08-inventory.js:L171)
- `src_08_inventory_computestock` — computeStock()  (js/src/08-inventory.js:L2)
- `src_08_inventory_poolstockmap` — poolStockMap()  (js/src/08-inventory.js:L24)
- `src_08_inventory_invrenderkibbutzinventory` — invRenderKibbutzInventory()  (js/src/08-inventory.js:L243)
- `src_08_inventory_invexportstock` — invExportStock()  (js/src/08-inventory.js:L308)
- `concept:low_stock_redline_rules@js/src/08-inventory.js` — Per-meter-type / per-SIM-type red-line thresholds  (js/src/08-inventory.js:L31-64)
- `src_08_inventory_invexportkibbutzinventory` — invExportKibbutzInventory()  (js/src/08-inventory.js:L316)
- `src_08_inventory_invdownloadcsv` — invDownloadCSV()  (js/src/08-inventory.js:L338)
- `src_08_inventory_meter_rules` — METER_RULES  (js/src/08-inventory.js:L36)
- `src_08_inventory_lowstockreport` — lowStockReport()  (js/src/08-inventory.js:L47)
- `src_08_inventory_renderlowstockalert` — renderLowStockAlert()  (js/src/08-inventory.js:L68)

### Code dependencies from code NOT being retired — migrate before deleting (94)

- `Two-type order flow: הזמנת ספק (raises stock) vs הזמנת לקוח (consumes stock, opens EMS task)` --implements--> `07-orders.js`  [EXTRACTED]  (docs/CHANGELOG.md:L1736)
- `P6 unified inventory: ONE stock pool (חברה) replaces per-person locations (Task 8)` --implements--> `08-inventory.js`  [INFERRED]  (docs/CHANGELOG.md:L319)
- `Drop-ship customer orders (ספק ישיר) — supplier fulfills directly, no stock/EMS task touch` --implements--> `07-orders.js`  [EXTRACTED]  (docs/CHANGELOG.md:L850)
- `Two parallel work lanes (DEV-PAGE / INVENTORY) with file-ownership discipline to avoid build reverts` --owns--> `06-products.js`  [EXTRACTED]  (docs/INDEX.md:L33)
- `Two parallel work lanes (DEV-PAGE / INVENTORY) with file-ownership discipline to avoid build reverts` --owns--> `07-orders.js`  [EXTRACTED]  (docs/INDEX.md:L33)
- `Two parallel work lanes (DEV-PAGE / INVENTORY) with file-ownership discipline to avoid build reverts` --owns--> `08-inventory.js`  [EXTRACTED]  (docs/INDEX.md:L33)
- `2026-06-29-kibbutz-order-ems-task-flow-design.md` --references--> `orderNeedsAmichai()`  [EXTRACTED]  (docs/superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md:L48-50,162)
- `2026-06-29-kibbutz-order-ems-task-flow-design.md` --references--> `orderTotalQty()`  [EXTRACTED]  (docs/superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md:L50,162)
- `2026-06-29-kibbutz-order-ems-task-flow-design.md` --references--> `maybeShowOrderNotifications()`  [EXTRACTED]  (docs/superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md:L59,163)
- `2026-06-29-kibbutz-order-ems-task-flow-design.md` --references--> `computeStock()`  [EXTRACTED]  (docs/superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md:L67,166)
- `2026-06-29-kibbutz-order-ems-task-flow-design.md` --references--> `renderLowStockAlert()`  [EXTRACTED]  (docs/superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md:L89-91,167)
- `invOrderModal — new/edit order (supplier/customer)` --calls--> `invAssigneeChanged`  [EXTRACTED]  (index.html:L1011)
- `invOrderModal — new/edit order (supplier/customer)` --calls--> `orderParseRaw()`  [EXTRACTED]  (index.html:L1027)
- `index.html` --calls--> `orderParseRaw()`  [EXTRACTED]  (index.html:L1027)
- `invOrderModal — new/edit order (supplier/customer)` --calls--> `invAddItemRow()`  [EXTRACTED]  (index.html:L1035)
- `index.html` --calls--> `invAddItemRow()`  [EXTRACTED]  (index.html:L1035)
- `invOrderModal — new/edit order (supplier/customer)` --calls--> `invToggleDistribution()`  [EXTRACTED]  (index.html:L1042)
- `index.html` --calls--> `invToggleDistribution()`  [EXTRACTED]  (index.html:L1042)
- `invOrderModal — new/edit order (supplier/customer)` --calls--> `invApproveFromEdit()`  [EXTRACTED]  (index.html:L1070)
- `index.html` --calls--> `invApproveFromEdit()`  [EXTRACTED]  (index.html:L1070)
- `invOrderModal — new/edit order (supplier/customer)` --calls--> `invSaveOrder()`  [EXTRACTED]  (index.html:L1071)
- `index.html` --calls--> `invSaveOrder()`  [EXTRACTED]  (index.html:L1071)
- `invProductModal — new/edit product` --calls--> `invSaveProduct()`  [EXTRACTED]  (index.html:L1144)
- `index.html` --calls--> `invSaveProduct()`  [EXTRACTED]  (index.html:L1144)
- `app.js` --implements--> `06-products.js`  [INFERRED]  (index.html:L1286)
- `app.js` --implements--> `07-orders.js`  [INFERRED]  (index.html:L1286)
- `app.js` --implements--> `08-inventory.js`  [INFERRED]  (index.html:L1286)
- `inv-section-orders body — orders list + status flow diagram` --calls--> `invNewOrder()`  [EXTRACTED]  (index.html:L375)
- `index.html` --calls--> `invNewOrder()`  [EXTRACTED]  (index.html:L375)
- `inv-section-orders body — orders list + status flow diagram` --calls--> `invRenderOrders()`  [EXTRACTED]  (index.html:L379)
- `index.html` --calls--> `invRenderOrders()`  [EXTRACTED]  (index.html:L379)
- `inv-section-stock body — sigma-inventory-strip island + company stock matrix` --calls--> `invExportStock()`  [EXTRACTED]  (index.html:L421)
- `index.html` --calls--> `invExportStock()`  [EXTRACTED]  (index.html:L421)
- `inv-section-kibbutz body — per-kibbutz inventory matrix` --calls--> `invExportKibbutzInventory()`  [EXTRACTED]  (index.html:L431)
- `index.html` --calls--> `invExportKibbutzInventory()`  [EXTRACTED]  (index.html:L431)
- `inv-section-products body — products catalog list` --calls--> `invNewProduct()`  [EXTRACTED]  (index.html:L454)
- `index.html` --calls--> `invNewProduct()`  [EXTRACTED]  (index.html:L454)
- `index.html` --calls--> `onVisitorChange()`  [EXTRACTED]  (index.html:L722)
- `index.html` --calls--> `openVoice()`  [EXTRACTED]  (index.html:L803)
- `voiceModal — voice recording → Gemini transcription → editable summary` --calls--> `toggleVoiceRecording()`  [EXTRACTED]  (index.html:L864)
- `index.html` --calls--> `toggleVoiceRecording()`  [EXTRACTED]  (index.html:L864)
- `voiceModal — voice recording → Gemini transcription → editable summary` --calls--> `closeVoice()`  [EXTRACTED]  (index.html:L866)
- `index.html` --calls--> `closeVoice()`  [EXTRACTED]  (index.html:L866)
- `voiceModal — voice recording → Gemini transcription → editable summary` --calls--> `voiceRetry()`  [EXTRACTED]  (index.html:L886)
- `index.html` --calls--> `voiceRetry()`  [EXTRACTED]  (index.html:L886)
- `voiceModal — voice recording → Gemini transcription → editable summary` --calls--> `applyVoiceResult()`  [EXTRACTED]  (index.html:L887)
- `index.html` --calls--> `applyVoiceResult()`  [EXTRACTED]  (index.html:L887)
- `intakeModal — customer-request intake (paste → parse → order)` --calls--> `intakeParse()`  [EXTRACTED]  (index.html:L909)
- `index.html` --calls--> `intakeParse()`  [EXTRACTED]  (index.html:L909)
- `intakeModal — customer-request intake (paste → parse → order)` --calls--> `intakeAddRow()`  [EXTRACTED]  (index.html:L918)
- `index.html` --calls--> `intakeAddRow()`  [EXTRACTED]  (index.html:L918)
- `intakeModal — customer-request intake (paste → parse → order)` --calls--> `intakeBackToStep1()`  [EXTRACTED]  (index.html:L920)
- `index.html` --calls--> `intakeBackToStep1()`  [EXTRACTED]  (index.html:L920)
- `intakeModal — customer-request intake (paste → parse → order)` --calls--> `intakeSave()`  [EXTRACTED]  (index.html:L921)
- `index.html` --calls--> `intakeSave()`  [EXTRACTED]  (index.html:L921)
- `invOrderModal — new/edit order (supplier/customer)` --calls--> `invSetOrderType`  [EXTRACTED]  (index.html:L992)
- `sigma.productNames` --calls--> `getActiveProducts()`  [EXTRACTED]  (js/src/00-bridge.js:L266)
- `sigma.poolStock` --calls--> `poolStockMap()`  [EXTRACTED]  (js/src/00-bridge.js:L403)
- `sigma.products` --calls--> `getActiveProducts()`  [EXTRACTED]  (js/src/00-bridge.js:L405)
- `sigma.openOrder` --calls--> `invEditOrder()`  [EXTRACTED]  (js/src/00-bridge.js:L409)
- `sigma.markOrderDelivered` --calls--> `quickOrderStatus()`  [EXTRACTED]  (js/src/00-bridge.js:L410)
- `openVisitQuick()` --calls_indirectly--> `poolStockMap()`  [AMBIGUOUS]  (js/src/02-init-attendance.js:L178)
- `visitQuickGo()` --calls--> `onVisitorChange()`  [INFERRED]  (js/src/02-init-attendance.js:L319)
- `renderInventory()` --calls--> `invRenderOrders()`  [INFERRED]  (js/src/02-init-attendance.js:L332)
- `renderInventory()` --calls--> `invRenderStock()`  [INFERRED]  (js/src/02-init-attendance.js:L333)
- `renderInventory()` --calls--> `invRenderKibbutzInventory()`  [INFERRED]  (js/src/02-init-attendance.js:L334)
- `renderInventory()` --calls--> `invRenderProducts()`  [INFERRED]  (js/src/02-init-attendance.js:L336)
- `renderInventory()` --calls--> `renderLowStockAlert()`  [INFERRED]  (js/src/02-init-attendance.js:L338)
- `renderReqItems()` --calls--> `getActiveProducts()`  [EXTRACTED]  (js/src/03-requirements.js:L71)
- `addRequirementItemRow()` --calls--> `getActiveProducts()`  [INFERRED]  (js/src/03-requirements.js:L80)
- `applyUserRestrictions()` --calls--> `onVisitorChange()`  [INFERRED]  (js/src/05-meeting-returns.js:L30)
- `addReturnedItemRow()` --calls--> `getActiveProducts()`  [INFERRED]  (js/src/05-meeting-returns.js:L57)
- `renderReturnedItems()` --calls--> `getActiveProducts()`  [EXTRACTED]  (js/src/05-meeting-returns.js:L70)
- `visitCatalogNames()` --calls--> `getActiveProducts()`  [INFERRED]  (js/src/09-visits.js:L153)
- `_refreshDataInner()` --calls--> `maybeShowAmichaiApprovalReminder()`  [INFERRED]  (js/src/10-activity.js:L736)
- `_refreshDataInner()` --calls--> `maybeShowOrderNotifications()`  [INFERRED]  (js/src/10-activity.js:L737)
- `_refreshDataInner()` --calls--> `renderLowStockAlert()`  [INFERRED]  (js/src/10-activity.js:L738)
- `collectActivities()` --calls--> `orderType()`  [EXTRACTED]  (js/src/10-activity.js:L81)
- `collectActivities()` --calls--> `orderKibbutz()`  [EXTRACTED]  (js/src/10-activity.js:L86)
- `certFromOrder()` --calls--> `orderKibbutz()`  [INFERRED]  (js/src/20-delivery-cert.js:L896)
- `xlExportStockXlsx()` --calls--> `productCategoryMap()`  [INFERRED]  (js/src/21-excel-export.js:L323)
- `xlExportStockXlsx()` --calls--> `computeStock()`  [INFERRED]  (js/src/21-excel-export.js:L323)
- `xlExportKibbutzXlsx()` --calls--> `computeStock()`  [INFERRED]  (js/src/21-excel-export.js:L326)
- `run()` --calls--> `approveOrder()`  [INFERRED]  (js/src/22-push.js:L348)
- `test-autoadd.mjs` --tests--> `07-orders.js`  [EXTRACTED]  (test-autoadd.mjs:L1)
- `test-cert-removals.mjs` --tests--> `07-orders.js`  [EXTRACTED]  (test-cert-removals.mjs:L20)
- `test-dropship.mjs` --tests--> `07-orders.js`  [EXTRACTED]  (test-dropship.mjs:L1)
- `test-exports.mjs` --tests--> `06-products.js`  [EXTRACTED]  (test-exports.mjs:L11)
- `test-inventory-pool.mjs` --tests--> `07-orders.js`  [EXTRACTED]  (test-inventory-pool.mjs:L172)
- `test-inventory-pool.mjs` --tests--> `08-inventory.js`  [EXTRACTED]  (test-inventory-pool.mjs:L35)
- `test-order-patch.mjs` --tests--> `07-orders.js`  [EXTRACTED]  (test-order-patch.mjs:L55)
- `test-order-site-gate.mjs` --tests--> `07-orders.js`  [EXTRACTED]  (test-order-site-gate.mjs:L9)
- `test-push.mjs` --tests--> `07-orders.js`  [INFERRED]  (test-push.mjs:L2)
- `test-usage-track.mjs` --references--> `07-orders.js`  [INFERRED]  (test-usage-track.mjs:L55)

### Docs referencing this — update/remove mention after retiring (36)

- `CHANGELOG.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/CHANGELOG.md:L1152)
- `CHANGELOG.md` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/CHANGELOG.md:L1269)
- `INDEX.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/INDEX.md:L563)
- `click-map.md` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/click-map.md:L184)
- `click-map.md` --documents--> `06-products.js`  [EXTRACTED]  (docs/click-map.md:L31)
- `click-map.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/click-map.md:L32)
- `integration-map.annotations.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/integration-map.annotations.md:L46)
- `integration-map.annotations.md` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/integration-map.annotations.md:L46)
- `integration-map.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/integration-map.md:L72)
- `integration-map.md` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/integration-map.md:L84)
- `integration-map.md` --documents--> `06-products.js`  [EXTRACTED]  (docs/integration-map.md:L87)
- `modules.md` --documents--> `06-products.js`  [EXTRACTED]  (docs/modules.md:L63)
- `modules.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/modules.md:L68)
- `modules.md` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/modules.md:L79)
- `2026-09-23-qa-coverage-audit.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/reports/2026-09-23-qa-coverage-audit.md:L67)
- `2026-07-19-kibbutz-site-integrity.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/plans/2026-07-19-kibbutz-site-integrity.md:L511)
- `[STATUS UNKNOWN] Hard-block EMS-task creation for site-less kibbutzim (modal + order approval)` --documents--> `approveCustomerOrder()`  [EXTRACTED]  (docs/superpowers/plans/2026-07-19-kibbutz-site-integrity.md:L552-562)
- `2026-09-17-kibbutz-cards-redesign.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/plans/2026-09-17-kibbutz-cards-redesign.md:L388)
- `2026-09-17-kibbutz-cards-redesign.md` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/superpowers/plans/2026-09-17-kibbutz-cards-redesign.md:L388)
- `2026-09-17-kibbutz-cards-redesign.md` --documents--> `06-products.js`  [EXTRACTED]  (docs/superpowers/plans/2026-09-17-kibbutz-cards-redesign.md:L396)
- `2026-06-29-kibbutz-order-ems-task-flow-design.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md:L53)
- `2026-07-16-dropship-orders-design.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/specs/2026-07-16-dropship-orders-design.md:L24)
- `2026-07-16-dropship-orders-design.md` --documents--> `isDirectSupply()`  [EXTRACTED]  (docs/superpowers/specs/2026-07-16-dropship-orders-design.md:L24)
- `2026-07-16-dropship-orders-design.md` --documents--> `approveCustomerOrder()`  [EXTRACTED]  (docs/superpowers/specs/2026-07-16-dropship-orders-design.md:L24)
- `2026-07-16-dropship-orders-design.md` --documents--> `invPopulateSupplierList()`  [EXTRACTED]  (docs/superpowers/specs/2026-07-16-dropship-orders-design.md:L26)
- `2026-07-16-viewer-excel-exports-design.md` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/superpowers/specs/2026-07-16-viewer-excel-exports-design.md:L25-26)
- `2026-07-16-web-push-notifications-design.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/specs/2026-07-16-web-push-notifications-design.md:L22)
- `[SHIPPED] One company-wide stock pool (חברה) replacing per-employee bags — rationale: field reporting not reliable enough for honest per-person balances` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-17-unified-inventory-design.md:L25)
- `2026-09-17-unified-inventory-design.md` --documents--> `08-inventory.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-17-unified-inventory-design.md:L25)
- `2026-09-17-unified-inventory-design.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-17-unified-inventory-design.md:L27,73-80)
- `2026-09-17-unified-inventory-design.md` --documents--> `06-products.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-17-unified-inventory-design.md:L56)
- `[SHIPPED] Two names per product — technical name (staff) vs display name (reports/viewer), עידן-only edit of display_name` --documents--> `06-products.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-17-unified-inventory-design.md:L56-58)
- `2026-09-22-phone-qa-round-2-design.md` --documents--> `06-products.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-2-design.md:L50)
- `[SHIPPED] Package P — inventory certificates-tab re-render loop fix + orders edit status-select fix` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-3-design.md:L41)
- `2026-09-22-phone-qa-round-3-design.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-3-design.md:L41)
- `2026-09-22-phone-qa-round-design.md` --documents--> `07-orders.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-design.md:L90)

### Weak/inferred mentions (low confidence, informational) (3)

- `inventory.ts` --conceptually_related_to--> `07-orders.js`  [EXTRACTED]  (app/src/lib/inventory.ts:L14)
- `inventory.ts` --conceptually_related_to--> `08-inventory.js`  [EXTRACTED]  (app/src/lib/inventory.ts:L14)
- `invSaveRequirement()` --semantically_similar_to--> `invSaveOrder()`  [INFERRED]  (js/src/03-requirements.js)

## Legacy inventory: 20-delivery-cert.js UI parts (pipeline + customer ?cert= view kept)  (30 nodes)

- `src_20_delivery_cert_certmonthlyfromtab` — certMonthlyFromTab()  (js/src/20-delivery-cert.js:L1027)
- `src_20_delivery_cert_certsignopen` — certSignOpen()  (js/src/20-delivery-cert.js:L103)
- `src_20_delivery_cert_opendeliverycert` — openDeliveryCert()  (js/src/20-delivery-cert.js:L165)
- `src_20_delivery_cert_certensuremodal` — certEnsureModal()  (js/src/20-delivery-cert.js:L42)
- `src_20_delivery_cert_certoverlayshow` — certOverlayShow()  (js/src/20-delivery-cert.js:L479)
- `src_20_delivery_cert_certpreviewdraft` — certPreviewDraft()  (js/src/20-delivery-cert.js:L537)
- `src_20_delivery_cert_certsharetext` — certShareText()  (js/src/20-delivery-cert.js:L547)
- `src_20_delivery_cert_certisemail` — certIsEmail()  (js/src/20-delivery-cert.js:L554)
- `src_20_delivery_cert_certwanumber` — certWaNumber()  (js/src/20-delivery-cert.js:L555)
- `src_20_delivery_cert_certsendplan` — certSendPlan()  (js/src/20-delivery-cert.js:L556)
- `src_20_delivery_cert_certsendopen` — certSendOpen()  (js/src/20-delivery-cert.js:L573)
- `fn:certAddContact@js/src/20-delivery-cert.js` — certAddContact()  (js/src/20-delivery-cert.js:L628)
- `src_20_delivery_cert_certrowforvisit` — certRowForVisit()  (js/src/20-delivery-cert.js:L650)
- `src_20_delivery_cert_certsendforvisit` — certSendForVisit()  (js/src/20-delivery-cert.js:L654)
- `src_20_delivery_cert_certdownloadforvisit` — certDownloadForVisit()  (js/src/20-delivery-cert.js:L659)
- `src_20_delivery_cert_dotoast` — doToast()  (js/src/20-delivery-cert.js:L671)
- `src_20_delivery_cert_certsetrange` — certSetRange()  (js/src/20-delivery-cert.js:L686)
- `src_20_delivery_cert_certrangetap` — certRangeTap()  (js/src/20-delivery-cert.js:L717)
- `src_20_delivery_cert_invrendercerts` — invRenderCerts()  (js/src/20-delivery-cert.js:L725)
- `src_20_delivery_cert_certadditemrow` — certAddItemRow()  (js/src/20-delivery-cert.js:L78)
- `src_20_delivery_cert_certreprint` — certReprint()  (js/src/20-delivery-cert.js:L800)
- `src_20_delivery_cert_certreissue` — certReissue()  (js/src/20-delivery-cert.js:L816)
- `src_20_delivery_cert_certcancel` — certCancel()  (js/src/20-delivery-cert.js:L831)
- `src_20_delivery_cert_certfromvisitform` — certFromVisitForm()  (js/src/20-delivery-cert.js:L849)
- `src_20_delivery_cert_openvisitcertpicker` — openVisitCertPicker()  (js/src/20-delivery-cert.js:L906)
- `src_20_delivery_cert_certsigstatuspaint` — certSigStatusPaint()  (js/src/20-delivery-cert.js:L94)
- `src_20_delivery_cert_certrangereport` — certRangeReport()  (js/src/20-delivery-cert.js:L951)
- `src_20_delivery_cert_certgroupname` — certGroupName()  (js/src/20-delivery-cert.js:L960)
- `src_20_delivery_cert_certreportlabel` — certReportLabel()  (js/src/20-delivery-cert.js:L967)
- `src_20_delivery_cert_certrangereportrange` — certRangeReportRange()  (js/src/20-delivery-cert.js:L975)

### Code dependencies from code NOT being retired — migrate before deleting (28)

- `index.html` --calls--> `openVisitCertPicker()`  [EXTRACTED]  (index.html:L1187)
- `index.html` --calls--> `certRangeReport()`  [EXTRACTED]  (index.html:L1188)
- `index.html` --calls--> `certRangeTap()`  [EXTRACTED]  (index.html:L351)
- `inv-section-certs body — delivery certs list + range/search` --calls--> `invRenderCerts()`  [EXTRACTED]  (index.html:L358)
- `inv-section-certs body — delivery certs list + range/search` --calls--> `openDeliveryCert()`  [EXTRACTED]  (index.html:L362)
- `index.html` --calls--> `openDeliveryCert()`  [EXTRACTED]  (index.html:L362)
- `index.html` --calls--> `invRenderCerts()`  [EXTRACTED]  (index.html:L363)
- `index.html` --calls--> `certMonthlyFromTab()`  [EXTRACTED]  (index.html:L365)
- `index.html` --calls--> `certFromVisitForm()`  [EXTRACTED]  (index.html:L828)
- `sigma.openDeliveryCert` --calls--> `openDeliveryCert()`  [EXTRACTED]  (js/src/00-bridge.js:L474)
- `sigma.certFromVisitForm` --calls--> `certFromVisitForm()`  [EXTRACTED]  (js/src/00-bridge.js:L475)
- `renderInventory()` --calls--> `invRenderCerts()`  [INFERRED]  (js/src/02-init-attendance.js:L337)
- `09-visits.js` --calls--> `certFromVisitForm()`  [EXTRACTED]  (js/src/09-visits.js:L346)
- `issueDeliveryCert()` --calls--> `certOverlayShow()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L263)
- `issueDeliveryCert()` --calls--> `certSendOpen()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L298)
- `issueDeliveryCert()` --calls--> `invRenderCerts()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L306)
- `certView()` --calls--> `certOverlayShow()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L527)
- `20-delivery-cert.js` --calls--> `certSignOpen()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L60)
- `20-delivery-cert.js` --calls--> `certAddItemRow()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L65)
- `20-delivery-cert.js` --calls--> `certPreviewDraft()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L71)
- `20-delivery-cert.js` --calls--> `certSendOpen()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L788)
- `20-delivery-cert.js` --calls--> `certReissue()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L790)
- `20-delivery-cert.js` --calls--> `certCancel()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L791)
- `certFromVisitObj()` --calls--> `openDeliveryCert()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L870)
- `certFromEmsTask()` --calls--> `openDeliveryCert()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L887)
- `certFromOrder()` --calls--> `openDeliveryCert()`  [EXTRACTED]  (js/src/20-delivery-cert.js:L895)
- `xlHubCertsPdf()` --calls--> `certRangeReportRange()`  [INFERRED]  (js/src/21-excel-export.js:L376)
- `xlHubSumPdf()` --calls--> `certRangeReportRange()`  [INFERRED]  (js/src/21-excel-export.js:L381)

### Docs referencing this — update/remove mention after retiring (0)

(none)


### Weak/inferred mentions (low confidence, informational) (0)

(none)


## 24-meter-burns.js legacy page  (51 nodes)

- `js_src_24_meter_burns_js` — 24-meter-burns.js  (js/src/24-meter-burns.js:L1)
- `fn:genSummary@js/src/24-meter-burns.js` — B.genSummary()  (js/src/24-meter-burns.js:L117)
- `src_24_meter_burns_burnsactive` — burnsActive()  (js/src/24-meter-burns.js:L169)
- `concept:burn_writer_audience@js/src/24-meter-burns.js` — BURN_WRITERS / BURN_HIDDEN role-gating lists  (js/src/24-meter-burns.js:L175)
- `src_24_meter_burns_burnuser` — burnUser()  (js/src/24-meter-burns.js:L178)
- `src_24_meter_burns_burnisviewer` — burnIsViewer()  (js/src/24-meter-burns.js:L179)
- `src_24_meter_burns_burncansee` — burnCanSee()  (js/src/24-meter-burns.js:L180)
- `src_24_meter_burns_burncanwrite` — burnCanWrite()  (js/src/24-meter-burns.js:L187)
- `src_24_meter_burns_burnesc` — burnEsc()  (js/src/24-meter-burns.js:L188)
- `src_24_meter_burns_burnattr` — burnAttr()  (js/src/24-meter-burns.js:L189)
- `src_24_meter_burns_burnhdr` — burnHdr()  (js/src/24-meter-burns.js:L190)
- `src_24_meter_burns_burnwritehdr` — burnWriteHdr()  (js/src/24-meter-burns.js:L195)
- `src_24_meter_burns_burnload` — burnLoad()  (js/src/24-meter-burns.js:L199)
- `src_24_meter_burns_burnpatchrow` — burnPatchRow()  (js/src/24-meter-burns.js:L213)
- `src_24_meter_burns_burncreategenerator` — burnCreateGenerator()  (js/src/24-meter-burns.js:L221)
- `src_24_meter_burns_burnsyncedat` — burnSyncedAt()  (js/src/24-meter-burns.js:L238)
- `src_24_meter_burns_burnemsall` — burnEmsAll()  (js/src/24-meter-burns.js:L239)
- `src_24_meter_burns_burnrefreshfromems` — burnRefreshFromEms()  (js/src/24-meter-burns.js:L255)
- `src_24_meter_burns_burnrefreshfromemsrun` — burnRefreshFromEmsRun()  (js/src/24-meter-burns.js:L259)
- `src_24_meter_burns_burnstateui` — burnStateUi()  (js/src/24-meter-burns.js:L283)
- `src_24_meter_burns_burnkindtag` — burnKindTag()  (js/src/24-meter-burns.js:L284)
- `src_24_meter_burns_burnwarn` — burnWarn()  (js/src/24-meter-burns.js:L287)
- `src_24_meter_burns_burnrowhtml` — burnRowHtml()  (js/src/24-meter-burns.js:L293)
- `src_24_meter_burns_burnsitehtml` — burnSiteHtml()  (js/src/24-meter-burns.js:L307)
- `src_24_meter_burns_burnrendertiles` — burnRenderTiles()  (js/src/24-meter-burns.js:L324)
- `src_24_meter_burns_burnrenderresults` — burnRenderResults()  (js/src/24-meter-burns.js:L333)
- `src_24_meter_burns_burnrender` — burnRender()  (js/src/24-meter-burns.js:L346)
- `src_24_meter_burns_renderburns` — renderBurns()  (js/src/24-meter-burns.js:L368)
- `src_24_meter_burns_burnrepaint` — burnRepaint()  (js/src/24-meter-burns.js:L379)
- `src_24_meter_burns_burnsetfilter` — burnSetFilter()  (js/src/24-meter-burns.js:L380)
- `src_24_meter_burns_burnenter` — burnEnter()  (js/src/24-meter-burns.js:L386)
- `src_24_meter_burns_burntogglesite` — burnToggleSite()  (js/src/24-meter-burns.js:L390)
- `src_24_meter_burns_burnselect` — burnSelect()  (js/src/24-meter-burns.js:L391)
- `src_24_meter_burns_burnclearsel` — burnClearSel()  (js/src/24-meter-burns.js:L392)
- `src_24_meter_burns_burnnow` — burnNow()  (js/src/24-meter-burns.js:L393)
- `src_24_meter_burns_burnsafe` — burnSafe()  (js/src/24-meter-burns.js:L394)
- `src_24_meter_burns_burntoggle` — burnToggle()  (js/src/24-meter-burns.js:L395)
- `src_24_meter_burns_burnissue` — burnIssue()  (js/src/24-meter-burns.js:L400)
- `src_24_meter_burns_burnburnselected` — burnBurnSelected()  (js/src/24-meter-burns.js:L422)
- `src_24_meter_burns_burnassignselected` — burnAssignSelected()  (js/src/24-meter-burns.js:L433)
- `fn:groupBySite@js/src/24-meter-burns.js` — B.groupBySite()  (js/src/24-meter-burns.js:L45)
- `src_24_meter_burns_burnassignsave` — burnAssignSave()  (js/src/24-meter-burns.js:L453)
- `src_24_meter_burns_burngennamechanged` — burnGenNameChanged()  (js/src/24-meter-burns.js:L468)
- `src_24_meter_burns_burngensearchems` — burnGenSearchEms()  (js/src/24-meter-burns.js:L474)
- `src_24_meter_burns_burngensearchemsrun` — burnGenSearchEmsRun()  (js/src/24-meter-burns.js:L477)
- `src_24_meter_burns_burnopen` — burnOpen()  (js/src/24-meter-burns.js:L490)
- `src_24_meter_burns_burnexportxlsx` — burnExportXlsx()  (js/src/24-meter-burns.js:L514)
- `src_24_meter_burns_burncanmanagegens` — burnCanManageGens()  (js/src/24-meter-burns.js:L519)
- `src_24_meter_burns_burngensopen` — burnGensOpen()  (js/src/24-meter-burns.js:L520)
- `src_24_meter_burns_burngensaveserial` — burnGenSaveSerial()  (js/src/24-meter-burns.js:L530)
- `fn:xlsxSpec@js/src/24-meter-burns.js` — B.xlsxSpec() — one sheet per kibbutz  (js/src/24-meter-burns.js:L96)

### Code dependencies from code NOT being retired — migrate before deleting (13)

- `🔥 צריבות — a temporary few-months project with a single kill-flag (BURNS_PROJECT_ACTIVE), no nav tab` --rationale_for--> `24-meter-burns.js`  [EXTRACTED]  (docs/INDEX.md:L169)
- `עידן — product owner/admin; makes rulings on scope, security, audience gates` --owns--> `24-meter-burns.js`  [EXTRACTED]  (docs/INDEX.md:L179)
- `sigma.canShowPage` --calls--> `burnCanSee()`  [EXTRACTED]  (js/src/00-bridge.js:L220)
- `showPage()` --calls--> `renderBurns()`  [INFERRED]  (js/src/02-init-attendance.js:L101)
- `showPage()` --calls--> `burnCanSee()`  [INFERRED]  (js/src/02-init-attendance.js:L77)
- `[SHIPPED] Ruling (עידן, 6.9.26): the app writes nothing to EMS for meter burns — PUT/logs endpoints documented but not wired` --rationale_for--> `24-meter-burns.js`  [EXTRACTED]  (superpowers/specs/2026-09-06-meter-burn-tracker-design.md:L126-129)
- `test-can-show-page.mjs` --references--> `24-meter-burns.js`  [INFERRED]  (test-can-show-page.mjs:L37)
- `test-can-show-page.mjs` --tests--> `burnsActive()`  [EXTRACTED]  (test-can-show-page.mjs:L49)
- `test-can-show-page.mjs` --tests--> `burnUser()`  [EXTRACTED]  (test-can-show-page.mjs:L50)
- `test-can-show-page.mjs` --tests--> `burnIsViewer()`  [EXTRACTED]  (test-can-show-page.mjs:L50)
- `test-can-show-page.mjs` --tests--> `burnCanSee()`  [EXTRACTED]  (test-can-show-page.mjs:L50)
- `test-integration.mjs` --references--> `24-meter-burns.js`  [INFERRED]  (test-integration.mjs:L256)
- `test-meter-burns.mjs` --tests--> `24-meter-burns.js`  [EXTRACTED]  (test-meter-burns.mjs:L8)

### Docs referencing this — update/remove mention after retiring (16)

- `CHANGELOG.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/CHANGELOG.md:L527)
- `INDEX.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/INDEX.md:L177)
- `click-map.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/click-map.md:L778-262)
- `integration-map.annotations.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/integration-map.annotations.md:L256)
- `integration-map.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/integration-map.md:L119)
- `modules.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/modules.md:L204)
- `2026-09-23-qa-coverage-audit.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/reports/2026-09-23-qa-coverage-audit.md:L68)
- `2026-09-17-kibbutz-cards-redesign.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/superpowers/plans/2026-09-17-kibbutz-cards-redesign.md:L473)
- `2026-09-22-phone-qa-round-design.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-design.md:L17)
- `[SHIPPED] Section A — navigation/dialog-close/back-button fixes (P0): uniform modal-backdrop close rule, page-head back button, stale-while-revalidate SW` --documents--> `24-meter-burns.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-design.md:L17-19)
- `test-meter-burns.mjs` --documents--> `BURN_WRITERS / BURN_HIDDEN role-gating lists`  [EXTRACTED]  (js/src/24-meter-burns.js:L173)
- `2026-09-07-meter-burn-tracker.md` --documents--> `B.groupBySite()`  [EXTRACTED]  (superpowers/plans/2026-09-07-meter-burn-tracker.md:L246)
- `2026-09-07-meter-burn-tracker.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (superpowers/plans/2026-09-07-meter-burn-tracker.md:L34,346)
- `2026-09-07-meter-burn-tracker.md` --documents--> `B.xlsxSpec() — one sheet per kibbutz`  [EXTRACTED]  (superpowers/plans/2026-09-07-meter-burn-tracker.md:L809-854)
- `2026-09-06-meter-burn-tracker-design.md` --documents--> `burnRefreshFromEms()`  [EXTRACTED]  (superpowers/specs/2026-09-06-meter-burn-tracker-design.md:L150-160)
- `2026-09-06-meter-burn-tracker-design.md` --documents--> `24-meter-burns.js`  [EXTRACTED]  (superpowers/specs/2026-09-06-meter-burn-tracker-design.md:L88-114)

### Weak/inferred mentions (low confidence, informational) (4)

- `burns.ts` --conceptually_related_to--> `24-meter-burns.js`  [INFERRED]  (app/src/lib/burns.ts:L11)
- `burnIssueTask()` --conceptually_related_to--> `24-meter-burns.js`  [INFERRED]  (app/src/lib/burns.ts:L98)
- `xlBuildCertSummary()` --semantically_similar_to--> `B.genSummary()`  [INFERRED]  (js/src/21-excel-export.js:L139-159)
- `xlBuildStockByKibbutz()` --semantically_similar_to--> `B.groupBySite()`  [INFERRED]  (js/src/21-excel-export.js:L183-198)

## 23-push-log.js legacy page  (6 nodes)

- `js_src_23_push_log_js` — 23-push-log.js  (js/src/23-push-log.js:L1)
- `src_23_push_log_renderpushlog` — renderPushLog()  (js/src/23-push-log.js:L23)
- `src_23_push_log_renderpushlogrun` — renderPushLogRun()  (js/src/23-push-log.js:L27)
- `src_23_push_log_pushlogcansee` — pushLogCanSee()  (js/src/23-push-log.js:L6)
- `src_23_push_log_pushesc` — pushEsc()  (js/src/23-push-log.js:L7)
- `src_23_push_log_pushfmttime` — pushFmtTime()  (js/src/23-push-log.js:L8)

### Code dependencies from code NOT being retired — migrate before deleting (2)

- `#pushlog-view — התראות (push log) page, עידן only` --implements--> `23-push-log.js`  [INFERRED]  (index.html:L585)
- `showPage()` --calls--> `renderPushLog()`  [INFERRED]  (js/src/02-init-attendance.js:L100)

### Docs referencing this — update/remove mention after retiring (7)

- `CHANGELOG.md` --documents--> `23-push-log.js`  [EXTRACTED]  (docs/CHANGELOG.md:L872)
- `INDEX.md` --documents--> `23-push-log.js`  [EXTRACTED]  (docs/INDEX.md:L324)
- `click-map.md` --documents--> `23-push-log.js`  [EXTRACTED]  (docs/click-map.md:L38)
- `2026-07-16-push-log-table-design.md` --documents--> `23-push-log.js`  [EXTRACTED]  (docs/superpowers/specs/2026-07-16-push-log-table-design.md:L59-65)
- `2026-07-16-push-log-table-design.md` --documents--> `renderPushLog()`  [EXTRACTED]  (docs/superpowers/specs/2026-07-16-push-log-table-design.md:L60)
- `2026-09-22-phone-qa-round-design.md` --documents--> `23-push-log.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-design.md:L35)
- `2026-09-07-meter-burn-tracker.md` --documents--> `23-push-log.js`  [EXTRACTED]  (superpowers/plans/2026-09-07-meter-burn-tracker.md:L7)

### Weak/inferred mentions (low confidence, informational) (0)

(none)


## 18-dev-tasks.js legacy page  (52 nodes)

- `concept:dev_tasks_board@js/src/18-dev-tasks.js` — Dev-tasks board/tree (GitHub Projects mirror)  (js/src/18-dev-tasks.js:L1)
- `js_src_18_dev_tasks_js` — 18-dev-tasks.js  (js/src/18-dev-tasks.js:L1)
- `src_18_dev_tasks_devstage` — devStage()  (js/src/18-dev-tasks.js:L126)
- `src_18_dev_tasks_devfmtdate` — devFmtDate()  (js/src/18-dev-tasks.js:L138)
- `src_18_dev_tasks_devmatchfilter` — devMatchFilter()  (js/src/18-dev-tasks.js:L141)
- `src_18_dev_tasks_devcountmatches` — devCountMatches()  (js/src/18-dev-tasks.js:L153)
- `src_18_dev_tasks_devfilterlabel` — devFilterLabel()  (js/src/18-dev-tasks.js:L159)
- `src_18_dev_tasks_devarg` — devArg()  (js/src/18-dev-tasks.js:L175)
- `src_18_dev_tasks_devhero` — devHero()  (js/src/18-dev-tasks.js:L189)
- `src_18_dev_tasks_canseedevtasks` — canSeeDevTasks()  (js/src/18-dev-tasks.js:L21)
- `src_18_dev_tasks_devfetchtasks` — devFetchTasks()  (js/src/18-dev-tasks.js:L248)
- `src_18_dev_tasks_devparset` — devParseT()  (js/src/18-dev-tasks.js:L274)
- `src_18_dev_tasks_devdetailpanel` — devDetailPanel()  (js/src/18-dev-tasks.js:L285)
- `src_18_dev_tasks_devnodesummary` — devNodeSummary()  (js/src/18-dev-tasks.js:L303)
- `src_18_dev_tasks_devpriorityrank` — devPriorityRank()  (js/src/18-dev-tasks.js:L31)
- `src_18_dev_tasks_devtasknode` — devTaskNode()  (js/src/18-dev-tasks.js:L317)
- `src_18_dev_tasks_devnodelabel` — devNodeLabel()  (js/src/18-dev-tasks.js:L325)
- `src_18_dev_tasks_devtreerowdesktop` — devTreeRowDesktop()  (js/src/18-dev-tasks.js:L333)
- `src_18_dev_tasks_devmobilecard` — devMobileCard()  (js/src/18-dev-tasks.js:L347)
- `src_18_dev_tasks_devtreerowmobile` — devTreeRowMobile()  (js/src/18-dev-tasks.js:L373)
- `src_18_dev_tasks_devloadcache` — devLoadCache()  (js/src/18-dev-tasks.js:L391)
- `src_18_dev_tasks_devsavecache` — devSaveCache()  (js/src/18-dev-tasks.js:L394)
- `src_18_dev_tasks_devago` — devAgo()  (js/src/18-dev-tasks.js:L401)
- `src_18_dev_tasks_devbuild` — devBuild()  (js/src/18-dev-tasks.js:L413)
- `src_18_dev_tasks_devpriority` — devPriority()  (js/src/18-dev-tasks.js:L42)
- `src_18_dev_tasks_devboardlayout` — devBoardLayout()  (js/src/18-dev-tasks.js:L447)
- `src_18_dev_tasks_devpctsegments` — devPctSegments()  (js/src/18-dev-tasks.js:L469)
- `src_18_dev_tasks_devflowsegments` — devFlowSegments()  (js/src/18-dev-tasks.js:L487)
- `src_18_dev_tasks_devtreematch` — devTreeMatch()  (js/src/18-dev-tasks.js:L498)
- `src_18_dev_tasks_devtree` — devTree()  (js/src/18-dev-tasks.js:L507)
- `src_18_dev_tasks_renderdevboard` — renderDevBoard()  (js/src/18-dev-tasks.js:L561)
- `src_18_dev_tasks_devstatus` — devStatus()  (js/src/18-dev-tasks.js:L57)
- `src_18_dev_tasks_renderflowstrip` — renderFlowStrip()  (js/src/18-dev-tasks.js:L588)
- `src_18_dev_tasks_renderdevtree` — renderDevTree()  (js/src/18-dev-tasks.js:L605)
- `src_18_dev_tasks_devinprogress` — devInProgress()  (js/src/18-dev-tasks.js:L63)
- `src_18_dev_tasks_devfmtday` — devFmtDay()  (js/src/18-dev-tasks.js:L635)
- `src_18_dev_tasks_devstamps` — devStamps()  (js/src/18-dev-tasks.js:L636)
- `src_18_dev_tasks_devesc` — devEsc()  (js/src/18-dev-tasks.js:L64)
- `src_18_dev_tasks_devloadstatuslog` — devLoadStatusLog()  (js/src/18-dev-tasks.js:L644)
- `src_18_dev_tasks_devlogstatuses` — devLogStatuses()  (js/src/18-dev-tasks.js:L654)
- `src_18_dev_tasks_renderdevtasks` — renderDevTasks()  (js/src/18-dev-tasks.js:L676)
- `src_18_dev_tasks_devpriocontrol` — devPrioControl()  (js/src/18-dev-tasks.js:L70)
- `src_18_dev_tasks_devpaint` — devPaint()  (js/src/18-dev-tasks.js:L722)
- `src_18_dev_tasks_devismobile` — devIsMobile()  (js/src/18-dev-tasks.js:L841)
- `src_18_dev_tasks_devview` — devView()  (js/src/18-dev-tasks.js:L842)
- `src_18_dev_tasks_devtreecontrols` — devTreeControls()  (js/src/18-dev-tasks.js:L871)
- `src_18_dev_tasks_devwritefield` — devWriteField()  (js/src/18-dev-tasks.js:L898)
- `src_18_dev_tasks_devwritestatus` — devWriteStatus()  (js/src/18-dev-tasks.js:L913)
- `src_18_dev_tasks_devwritepriority` — devWritePriority()  (js/src/18-dev-tasks.js:L914)
- `src_18_dev_tasks_devselcount` — devSelCount()  (js/src/18-dev-tasks.js:L923)
- `src_18_dev_tasks_devpaintselbar` — devPaintSelBar()  (js/src/18-dev-tasks.js:L924)
- `src_18_dev_tasks_devwriteresult` — devWriteResult()  (js/src/18-dev-tasks.js:L930)

### Code dependencies from code NOT being retired — migrate before deleting (12)

- `מתניה — office/dev role; sees dev-page, excluded from meter-burns and inventory` --references--> `18-dev-tasks.js`  [INFERRED]  (docs/INDEX.md:L32)
- `אליה — sees dev-page (מתניה + אליה gate)` --references--> `18-dev-tasks.js`  [INFERRED]  (docs/INDEX.md:L32)
- `Two parallel work lanes (DEV-PAGE / INVENTORY) with file-ownership discipline to avoid build reverts` --owns--> `18-dev-tasks.js`  [EXTRACTED]  (docs/INDEX.md:L32)
- `#dev-view — פיתוח (dev board) page, legacy vanilla drag-and-drop` --implements--> `18-dev-tasks.js`  [EXTRACTED]  (index.html:L569)
- `sigma.canShowPage` --calls--> `canSeeDevTasks()`  [EXTRACTED]  (js/src/00-bridge.js:L214)
- `showPage()` --calls--> `canSeeDevTasks()`  [INFERRED]  (js/src/02-init-attendance.js:L75)
- `showPage()` --calls--> `renderDevTasks()`  [INFERRED]  (js/src/02-init-attendance.js:L99)
- `applyNavVisibility()` --calls--> `canSeeDevTasks()`  [INFERRED]  (js/src/11-search-login.js:L183)
- `test-can-show-page.mjs` --references--> `18-dev-tasks.js`  [INFERRED]  (test-can-show-page.mjs:L36)
- `test-can-show-page.mjs` --tests--> `canSeeDevTasks()`  [EXTRACTED]  (test-can-show-page.mjs:L47)
- `test-devboard.mjs` --tests--> `18-dev-tasks.js`  [EXTRACTED]  (test-devboard.mjs:L68)
- `test-integration.mjs` --references--> `18-dev-tasks.js`  [INFERRED]  (test-integration.mjs:L310)

### Docs referencing this — update/remove mention after retiring (11)

- `CHANGELOG.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/CHANGELOG.md:L1851)
- `INDEX.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/INDEX.md:L31)
- `click-map.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/click-map.md:L207-224)
- `integration-map.annotations.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/integration-map.annotations.md:L381)
- `integration-map.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/integration-map.md:L234)
- `modules.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/modules.md:L170)
- `2026-09-17-kibbutz-cards-redesign.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/superpowers/plans/2026-09-17-kibbutz-cards-redesign.md:L404)
- `[SHIPPED] Part H — dev page (עמוד פיתוח) redesign: 4-column board + minimized rail + tree view + flow strip` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-17-kibbutz-cards-redesign-design.md:L379)
- `2026-09-17-kibbutz-cards-redesign-design.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-17-kibbutz-cards-redesign-design.md:L379)
- `2026-09-22-phone-qa-round-design.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (docs/superpowers/specs/2026-09-22-phone-qa-round-design.md:L35)
- `2026-09-07-meter-burn-tracker.md` --documents--> `18-dev-tasks.js`  [EXTRACTED]  (superpowers/plans/2026-09-07-meter-burn-tracker.md:L7)

### Weak/inferred mentions (low confidence, informational) (1)

- `sprintPrep.ts` --conceptually_related_to--> `18-dev-tasks.js`  [EXTRACTED]  (app/src/lib/sprintPrep.ts:L13-16,77-83)

## Retired tables: tasks, settings, ems_cache, ems_queue  (4 nodes)

- `table:ems_cache` — ems_cache (table)  ()
- `table:ems_queue` — ems_queue (table)  ()
- `table:settings` — settings (table)  ()
- `table:tasks` — tasks (table)  ()

### Code dependencies from code NOT being retired — migrate before deleting (59)

- `internal_tasks.sql` --reads_writes--> `settings (table)`  [EXTRACTED]  (db/internal_tasks.sql:L43-55)
- `parseCards()/energyOf()/regionsByName() — rebuilds kibbutzim rows from index.html's four legacy grids + live Supabase tasks.region lookup` --reads_writes--> `tasks (table)`  [EXTRACTED]  (db/kibbutzim_seed.mjs:L105-118)
- `kibbutzim_seed.mjs` --reads_writes--> `tasks (table)`  [EXTRACTED]  (db/kibbutzim_seed.mjs:L106)
- `ems_queue_read on ems_queue — defined in 1 migration(s): rls_legacy_lockdown.sql` --implements--> `ems_queue (table)`  [EXTRACTED]  (db/rls_legacy_lockdown.sql:L101-102)
- `settings_read on settings — defined in 1 migration(s): rls_legacy_lockdown.sql` --implements--> `settings (table)`  [EXTRACTED]  (db/rls_legacy_lockdown.sql:L125-126)
- `tasks_read on tasks — defined in 1 migration(s): rls_legacy_lockdown.sql` --implements--> `tasks (table)`  [EXTRACTED]  (db/rls_legacy_lockdown.sql:L130-131)
- `rls_legacy_lockdown.sql` --reads_writes--> `ems_cache (table)`  [INFERRED]  (db/rls_legacy_lockdown.sql:L157)
- `rls_legacy_lockdown.sql` --reads_writes--> `ems_queue (table)`  [INFERRED]  (db/rls_legacy_lockdown.sql:L157)
- `ems_cache_read on ems_cache — defined in 1 migration(s): rls_legacy_lockdown.sql` --implements--> `ems_cache (table)`  [EXTRACTED]  (db/rls_legacy_lockdown.sql:L97-98)
- `auth_all — authenticated full access added alongside anon on 13 legacy tables (staged lockdown step 1)` --implements--> `ems_cache (table)`  [EXTRACTED]  (db/rls_staged.sql:L11-20)
- `auth_all — authenticated full access added alongside anon on 13 legacy tables (staged lockdown step 1)` --implements--> `ems_queue (table)`  [EXTRACTED]  (db/rls_staged.sql:L11-20)
- `auth_all — authenticated full access added alongside anon on 13 legacy tables (staged lockdown step 1)` --implements--> `settings (table)`  [EXTRACTED]  (db/rls_staged.sql:L11-20)
- `auth_all — authenticated full access added alongside anon on 13 legacy tables (staged lockdown step 1)` --implements--> `tasks (table)`  [EXTRACTED]  (db/rls_staged.sql:L11-20)
- `tasks_no_viewer_insert on tasks — defined in 1 migration(s): rls_viewer_readonly.sql` --reads_writes--> `tasks (table)`  [EXTRACTED]  (db/rls_viewer_readonly.sql:L285)
- `ems_queue_no_viewer_insert on ems_queue — defined in 1 migration(s): rls_viewer_readonly.sql` --reads_writes--> `ems_queue (table)`  [EXTRACTED]  (db/rls_viewer_readonly.sql:L88)
- `supabase_schema.sql` --references--> `settings (table)`  [EXTRACTED]  (db/supabase_schema.sql:L125-129)
- `supabase_schema.sql` --references--> `ems_cache (table)`  [EXTRACTED]  (db/supabase_schema.sql:L145-152)
- `supabase_schema.sql` --references--> `ems_queue (table)`  [EXTRACTED]  (db/supabase_schema.sql:L156-160)
- `anon_all — permissive anon full access across 13 legacy tables (Apps Script parity, phase 1)` --implements--> `ems_cache (table)`  [EXTRACTED]  (db/supabase_schema.sql:L167-178)
- `anon_all — permissive anon full access across 13 legacy tables (Apps Script parity, phase 1)` --implements--> `ems_queue (table)`  [EXTRACTED]  (db/supabase_schema.sql:L167-178)
- `anon_all — permissive anon full access across 13 legacy tables (Apps Script parity, phase 1)` --implements--> `settings (table)`  [EXTRACTED]  (db/supabase_schema.sql:L167-178)
- `anon_all — permissive anon full access across 13 legacy tables (Apps Script parity, phase 1)` --implements--> `tasks (table)`  [EXTRACTED]  (db/supabase_schema.sql:L167-178)
- `supabase_schema.sql` --references--> `tasks (table)`  [EXTRACTED]  (db/supabase_schema.sql:L18-31)
- `verify_read_parity.mjs` --reads_writes--> `settings (table)`  [EXTRACTED]  (db/verify_read_parity.mjs:L15-18)
- `verify_read_parity.mjs` --reads_writes--> `tasks (table)`  [EXTRACTED]  (db/verify_read_parity.mjs:L15-18)
- `Ruling: close 12 Apps-Script-era tables to anon (עידן 20.9, NOT yet applied)` --references--> `ems_cache (table)`  [EXTRACTED]  (docs/backlog.md:L11)
- `Ruling: close 12 Apps-Script-era tables to anon (עידן 20.9, NOT yet applied)` --references--> `ems_queue (table)`  [EXTRACTED]  (docs/backlog.md:L11)
- `rls_legacy_lockdown.sql` --reads_writes--> `settings (table)`  [EXTRACTED]  (docs/backlog.md:L12)
- `Ruling: close 12 Apps-Script-era tables to anon (עידן 20.9, NOT yet applied)` --references--> `tasks (table)`  [EXTRACTED]  (docs/backlog.md:L12)
- `13-ems.js` --reads_writes--> `ems_cache (table)`  [EXTRACTED]  (docs/ems-cache-refresh.md:L19)
- `ems-cache-refresh.mjs` --reads_writes--> `ems_cache (table)`  [EXTRACTED]  (docs/ems-cache-refresh.md:L32)
- `01-data.js` --reads_writes--> `ems_cache (table)`  [EXTRACTED]  (docs/ems-cache-refresh.md:L34)
- `sigma.emsWrite/createTask → call('emsWriteOrQueue')` --calls_indirectly--> `ems_queue (table)`  [INFERRED]  (js/src/00-bridge.js:L325)
- `readSnapshot()` --reads_writes--> `ems_cache (table)`  [EXTRACTED]  (js/src/01-data.js:L573)
- `01-data.js` --reads_writes--> `ems_queue (table)`  [EXTRACTED]  (js/src/01-data.js:L573)
- `readSnapshot()` --reads_writes--> `ems_queue (table)`  [EXTRACTED]  (js/src/01-data.js:L573)
- `01-data.js` --reads_writes--> `settings (table)`  [EXTRACTED]  (js/src/01-data.js:L573)
- `readSnapshot()` --reads_writes--> `settings (table)`  [EXTRACTED]  (js/src/01-data.js:L573)
- `01-data.js` --reads_writes--> `tasks (table)`  [EXTRACTED]  (js/src/01-data.js:L573)
- `readSnapshot()` --reads_writes--> `tasks (table)`  [EXTRACTED]  (js/src/01-data.js:L573)
- `W write-type dispatch map` --reads_writes--> `settings (table)`  [EXTRACTED]  (js/src/01-data.js:L602)
- `writeTask()` --reads_writes--> `tasks (table)`  [EXTRACTED]  (js/src/01-data.js:L644)
- `W write-type dispatch map` --reads_writes--> `ems_cache (table)`  [EXTRACTED]  (js/src/01-data.js:L747)
- `window.fetch override — write router dispatch by b.type` --reads_writes--> `ems_queue (table)`  [EXTRACTED]  (js/src/01-data.js:L748)
- `W write-type dispatch map` --reads_writes--> `ems_queue (table)`  [EXTRACTED]  (js/src/01-data.js:L748)
- `populateReqKibbutzDropdown()` --reads_writes--> `tasks (table)`  [EXTRACTED]  (js/src/03-requirements.js:L53)
- `fn pushVisitEditToEms(...) — sends buildVisitEditNote as an EMS comment (offline-queue safe)` --calls_indirectly--> `ems_queue (table)`  [INFERRED]  (js/src/09-visits.js:L1371)
- `pushVisitToEms(kibbutz,visit,intent) [external ref — EMS comment writer]` --calls_indirectly--> `ems_queue (table)`  [INFERRED]  (js/src/09-visits.js:L1372)
- `collectActivities()` --reads_writes--> `tasks (table)`  [INFERRED]  (js/src/10-activity.js:L58)
- `doGlobalSearch()` --reads_writes--> `tasks (table)`  [INFERRED]  (js/src/11-search-login.js:L16)
- `emsCacheData()` --reads_writes--> `ems_cache (table)`  [EXTRACTED]  (js/src/13-ems.js:L20)
- `emsSyncCache()` --reads_writes--> `ems_cache (table)`  [EXTRACTED]  (js/src/13-ems.js:L88)
- `15-login-gate.js` --reads_writes--> `tasks (table)`  [EXTRACTED]  (js/src/15-login-gate.js:L107)
- `_sbBridgeMint()` --reads_writes--> `tasks (table)`  [EXTRACTED]  (js/src/15-login-gate.js:L107)
- `contract 4: twelve legacy Apps-Script tables are governed and closed` --tests--> `ems_cache (table)`  [EXTRACTED]  (test-rls-policies.mjs:L65)
- `test-rls-policies.mjs` --tests--> `ems_queue (table)`  [EXTRACTED]  (test-rls-policies.mjs:L65)
- `contract 4: twelve legacy Apps-Script tables are governed and closed` --tests--> `ems_queue (table)`  [EXTRACTED]  (test-rls-policies.mjs:L65)
- `contract 4: twelve legacy Apps-Script tables are governed and closed` --tests--> `settings (table)`  [EXTRACTED]  (test-rls-policies.mjs:L65)
- `contract 4: twelve legacy Apps-Script tables are governed and closed` --tests--> `tasks (table)`  [EXTRACTED]  (test-rls-policies.mjs:L65)

### Docs referencing this — update/remove mention after retiring (4)

- `data-and-security.md` --documents--> `tasks (table)`  [EXTRACTED]  (docs/data-and-security.md:L1081)
- `data-and-security.md` --documents--> `settings (table)`  [EXTRACTED]  (docs/data-and-security.md:L1089)
- `data-and-security.md` --documents--> `ems_cache (table)`  [EXTRACTED]  (docs/data-and-security.md:L1092)
- `data-and-security.md` --documents--> `ems_queue (table)`  [EXTRACTED]  (docs/data-and-security.md:L1093)

### Weak/inferred mentions (low confidence, informational) (0)

(none)
