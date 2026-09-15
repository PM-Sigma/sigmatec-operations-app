# Backlog & status

_Update this file as things move. Session-by-session history lives in claude-mem._
_Full current snapshot: [INDEX.md](INDEX.md) → 🚦 Current state. Build: **·95 on dev** / **·94 on main** (2026-06-25)._

## ✅ IMPLEMENTED — dev-page board columns fixed (branch `fix/dev-board-columns`, NOT built/pushed yet)
Idan's follow-up requests, both addressed in `js/src/18-dev-tasks.js` + `css/app.css`:
1. **Couldn't see the "Main Fields" (ראשיים) tickets** — `devStage()` now matches `"Main Fields"` and
   `"Scope Refinement"` explicitly (new `fields`/`scope` keys in `DEV_STAGES`), instead of both silently
   falling into `backlog` as before.
2. **Empty columns should be minimized, not compete with open ones** — `devBoard()` now splits stages
   into a `.dev-board-mini` row of small square chips (empty columns) above a `.dev-board-grid` of real
   `<details>` columns (non-empty ones only). The grid switched from a fixed 6-slot `grid-template-areas`
   (which required all 6 stages always present) to `repeat(auto-fit, minmax(260px,1fr))`, since the set
   of non-empty stages now varies per load.
3. **Drag a task into an empty column → it opens fully** — mini chips keep the same `.dev-stage` class +
   `data-stage` attribute as real columns, so the existing drag/drop wiring needed zero changes: dragging
   over a chip already gets the `.dev-drop-hover` highlight, a drop already writes the status, and the
   next repaint promotes that stage into a real full-width column automatically (it now has ≥1 card).

**Also fixed as part of the same rework** (required — devStage() needed a full rewrite anyway):
- `DEV_STAGE_TARGET` now sends the exact 7 live option names (`Main Fields`/`Backlog`/`Scope Refinement`/
  `Sprint Ready`/`In Progress`/`In Review`/`Committed`). Checked against `supabase/functions/github/index.ts`'s
  `optionRegexFor()` — the two new names hit no keyword family and fall through to its literal-string
  match, which resolves them correctly. **No edge-function redeploy needed.**
- `devReleaseVersion()` (🚀 עלתה גרסה) — its source stage was `done`, which no longer exists. **Assumption
  made, not confirmed with עידן:** now sources from `review` ("בשלבי בדיקות") instead. Flag to him if a
  different stage was intended as the pre-release bucket.
- `devStamps()` label map updated (no more `done`; added `fields`/`scope`). Old `dev_status_log` rows with
  `status='done'` are now silently orphaned (no schema constraint, nothing breaks — just unused old rows).

⚠️ **NOT rebuilt into `js/app.js` yet.** The working tree had unrelated uncommitted WIP sitting in
`js/app.js`/`index.html`/`sw.js`/`js/src/14-calendar.js` (a calendar feature) when this session started —
running `node build.mjs` now would have regenerated `js/app.js` from `js/src/*` and silently reverted
that other work, so it was left untouched (per this project's own multi-session build-hygiene rule). This
fix's source is committed on its own branch `fix/dev-board-columns`; **run `node build.mjs` on that branch
once the calendar WIP is safely committed or stashed by whoever owns it**, then merge to `dev`.

## 🔴 TODO — dev page (פיתוח) must follow the reworked EMS board (2026-09-08)
**עידן changed the GitHub Projects board columns. `js/src/18-dev-tasks.js` is now wrong in 4 places.**

**What changed on the board** (`Sigmatec EMS — Roadmap`, field `Status` = `PVTSSF_lADOESUai84BYul6zhTyR6I`):

| Column | Option ID | Meaning |
|---|---|---|
| **Main Fields** 🆕 | `9cc1d1d9` | **Parent/domain issues only** — the headers that group the areas. NOT tasks. 37 issues sit here. |
| Backlog | `ea2c2675` | **The actual tasks** |
| **Scope Refinement** 🆕 | `b4885823` | Ticket sent **back for re-spec** |
| Sprint Ready | `9b75d758` | was **`Ready`** — renamed |
| In Progress | `7e60541e` | unchanged |
| In Review | `092819ac` | unchanged |
| Committed | `83d8b3f6` | unchanged |
| ~~Done~~ | — | **GONE.** Option `b4885823` was **renamed in place** to `Scope Refinement` |

⚠️ **The `Done` option was renamed, not deleted** — same ID. Anything still writing `"Done"` now writes **Scope Refinement**.

**Required fixes in `js/src/18-dev-tasks.js`:**
1. **`DEV_STAGES` (:103-111)** — drop `done`, add `fields` (Main Fields) and `scope` (Scope Refinement).
   Suggested order: `fields → backlog → scope → ready → prog → review → committed`.
   Main Fields is a grouping column — consider `open:false`, or render it as the tree roots rather than a stage.
2. **`devStage()` (:112-122)** — 🔴 **the real bug**: neither `"Main Fields"` nor `"Scope Refinement"` matches any regex, so **both fall through to `backlog`**. All 37 parent issues will silently pile into "ממתין לפיתוח" as if they were tasks. Add the two matchers **before** the others, and drop the `done` branch.
   Also `if (t.state==='closed') return 'done'` (:120) → retarget to `committed`.
3. **`devReleaseVersion()` / 🚀 עלתה גרסה (:730-737)** — filters `devStage(t)==='done'`, which is now **always empty → dead button**. Rewire to move **In Review → Committed** (confirm the intended source column with עידן).
4. **`DEV_STAGE_TARGET` (:750)** — `ready:'Ready'` and `done:'Done'` no longer name real options. Use the exact strings **`Sprint Ready`**, **`Scope Refinement`**, **`Main Fields`**. Verify the `github` fn's synonym matcher (`supabase/functions/github/index.ts:105, :232`) resolves them — **it was written for the old six names**; if it matches loosely it may still land `Ready`→`Sprint Ready`, but `Done` will now silently hit **Scope Refinement**, which is a data-corrupting drag-and-drop.
5. **`devStamps()` names map (:442)** — `done:'גמר'` → replace with `scope`/`fields` labels; `dev_status_log` rows keyed `done` become orphans (`db/dev_status_log.sql`).

**Also:** there is a new **`sprint` ITERATION field** (`PVTIF_lADOESUai84BYul6zhTzARg`) on the board — not consumed by the dev page today; worth surfacing on the cards.

**Suggested check:** extend `test-devboard.mjs` with a case per new column name asserting `devStage()` returns the right key (especially that `"Main Fields"` does NOT return `backlog`).

## 🟡 IN PROGRESS — EMS-linking batch (4 features, A built 2026-07-19)
Sequence A→D→B→C, one spec+branch each.
- **A = ✅ BUILT on `feat/kibbutz-site-integrity` (1.59), pending dev→main.** Exact-match resolver (killed
  the fuzzy `indexOf` bug), corrected data (שלוחות UUID/entity, added דפנה + קיבוץ ניצנים), ⚠️ indicator +
  hard block on all task-creation paths + עידן-only linkage audit. 23 checks green. Spec + plan:
  [spec](superpowers/specs/2026-07-19-kibbutz-site-integrity-design.md) ·
  [plan](superpowers/plans/2026-07-19-kibbutz-site-integrity.md). **Action (עידן):** in EMS, create/verify
  sites for the still-unlinked cards — כפר עזה, ניר עציון, עין דור, דגניה ב, דביר — then ship dev→main.
- **D = delivery-note overhaul** (save-without-PDF → produce-PDF → email; visit-summary-central auto-open
  pulling EMS site details), **B = quick-order-from "אספקת מונים" task (AI)**, **C = remove מלאי בקיבוצים
  window** — not yet spec'd. Next up: D.

## ✅ DONE — attendance-reminder push, viewer-triggered (shipped 1.50)
Spec: [docs/superpowers/specs/2026-07-16-attendance-push-reminder-design.md](superpowers/specs/2026-07-16-attendance-push-reminder-design.md) (SHIPPED).
Viewer sees missing weekdays (red chips) + 🔔 בקש עדכון נוכחות button → sticky push to the worker.
Merged `feat/attendance-push`→dev→main; unified with the 1.48 order push into one `push-send`
(dual-mode) + one client file + one VAPID keypair. **Prod TODO (עידן):** redeploy `push-send` with the
dual-mode code (table + secrets already live from 1.48).

## ✅ DONE — Web Push notifications for order approvals (shipped 1.48)
Spec: [docs/superpowers/specs/2026-07-16-web-push-notifications-design.md](superpowers/specs/2026-07-16-web-push-notifications-design.md).
Native Web Push: `push_subscriptions` + Edge Function `push-send`, client-triggered after create/approve.
Routing mirrors approval rules (customer→אביאם/ניתאי, supplier≤10→אביאם, >10→עמיחי; approved→group minus
approver/creator). Android OS push; iPhone/unsupported keep the in-app modal. Live on main.

## ✅ SHIPPED 2026-07-16 — 1.47 drop-ship orders (ספק ישיר) + supplier datalist (main)
Customer order can be supplied directly by the supplier: אחראי picker option "🏭 ספק ישיר" →
approval touches no stock, opens no EMS task. ספק field backed by a datalist of past supplier
names. Spec: [2026-07-16-dropship-orders-design.md](superpowers/specs/2026-07-16-dropship-orders-design.md).

## ✅ SHIPPED 2026-07-16 — 1.45 viewer rework + Excel exports (dev, b34ceb4)
Both viewer specs delivered together on `feat/viewer-reports-excel` → `dev`. Viewer home = navy
header + **📊 reports hub** (visits/attendance/certs/cert-summary/stock — PDF+📗Excel from one card);
kibbutz cards/company-tasks/urgent/filter/compact hidden; משימות nav hidden; מלאי/נוכחות/יומן stay
browsable but read-only (all action buttons hidden). 📗 Excel = real .xlsx (vendored SheetJS 0.20.3,
lazy-loaded), typed cells, row-per-item, gated to עידן+viewer. `test-exports.mjs` 21 green + all
regression suites. **Pending: manual Excel smoke by עידן on dev preview, then dev→main.**

## 🔴 Run SQL — seed kibbutz_details (delivery-cert customer block, ready)
✅ `db/delivery_certs.sql` RAN (2026-07-14, verified). ✅ EMS `sites` data pulled (2026-07-15 — the
table DOES have company_name/company_id + accountant contact; no address column) and the seed is
generated at **`C:\Users\idann\Documents\seed_kibbutz_details.sql`** (kept OUT of the public repo —
it contains real customer ח.פ./contact data): 47 cards, swapped-column rows fixed, placeholders
blanked. **Action (עידן): run it in the Supabase SQL editor** (writes are authenticated-only, so
Claude can't apply it via anon REST). 6 kibbutzim have genuinely blank details
in EMS (אגודת המים עמק הירדן, אפיק, חולדה, כפר דניאל, מגידו, מעלה גלבוע) — fill in EMS or leave as
editable blanks on the cert. Cert test automation: `test-delivery-cert.mjs` (26 ✓) +
`test-cert-pdf.mjs` (33 ✓, markitdown) — both green 2026-07-15.

## ✅ RELEASED 2026-07-06 — 1.20+1.21 live on `main` (E360 default rule + order assignee)
`db/orders_schedule_fields.sql` ran (`orders.assignee` live), `parse-order` redeployed, ff
`c584261`→`3056380`. Brand-less meters now default to מונה Landis+Gyr E360PP (Satec only on explicit
סאטק/133); "מונה תלת-פאזי משנה זרם" → E360CT; one email may carry PP+CT. עידן+עמיחי can assign supply
responsibility on customer orders (stock from the assignee's bag, EMS task assigned to them). Learning
loop verified. No open items from this batch.

## ✅ RELEASED 2026-07-02 — 1.07–1.15 live on `main` (audit fix sweep)
Migration `db/orders_type_kibbutz.sql` ran clean, `parse-order` + `ems-auth` redeployed, then
`dev`→`main` ff (`83d4924`→`87cc656`). Bundle: P0 critical bugs (sbDelete `H`→`baseH`, customer-order
orderType/kibbutz persistence, blank requirements tab, ems_cache-401 root fix) · dev-page kanban grid ·
connection hardening · design polish. Details: CHANGELOG 1.12–1.15. This also closed the long-pending
"re-deploy parse-order (·56 changes)" item below.

## ⏳ Re-deploy `parse-order` — pick up ·56 changes
**Action:** Supabase → Edge Functions → `parse-order` → paste updated `supabase/functions/parse-order/index.ts` → Deploy.
Changes in this version: Carlo/PM135/PURS/ROBUSTEL/SIM aliases + auto-add rules + `orderType` param + Groq default
model `llama-3.1-8b-instant`. **Optional:** add `GROQ_API_KEY` secret (console.groq.com) for the Groq fallback path.
The app (·56) already has the matching offline matcher — parsing works in degraded mode until redeploy.

## ✅ RESOLVED — live dev-tasks priorities/status (2026-06-23)

- **The `GH_TOKEN` blocker is fixed.** עידן updated the token with **`repo` + `read:org` + `project`** scopes
  and **redeployed** the `github` function. *(Sigmatec-Energy doesn't enforce SAML SSO, so no SSO authorization
  step was needed.)* **Verified live in עידן's session:** the פיתוח page renders **127 status badges + priority
  chips** (קריטי/גבוהה, In Progress/Backlog) across 130 tickets, and **"בפיתוח עכשיו"** is driven by real
  Status=In-Progress (5 items). No code change — token scope only.

## ✅ DONE — עידן's independent add/remove stock tool (1.11, on dev)
Shipped + verified in-browser. Only affects `dev` — deploy dev→main to make it live. No further action
needed unless עידן wants it opened to other roles too (currently עידן-only per the ask).

## 🟡 Pending — pick a new name for "מלאי לפי מיקום" (naming options given, not yet applied)
Category separators shipped (1.10). The tab/header rename is waiting on עידן's pick from the options
Claude proposed in-session — one-line text change once decided (`index.html` tab button + card `<h3>`).

## 🔴 Run SQL — add EM133 משנ"ז fix + בקר 485 + PUSR top-up for ניתאי (1.09, on dev)
**Action:** run `db/add-em133-mashneze-and-485.sql` in the Supabase SQL editor (transactional, has a
verify SELECT). Fixes the name of the EM133 משנ"ז product you already added (missing the מונה prefix —
that's also why it wasn't showing in by-location/kibbutz stock: zero movements yet), adds "בקר 485" to
the catalog, and enters ניתאי's stock (2× EM133 משנ"ז, 3× בקר 485, +1× בקר PUSR). **Also deploy `parse-order`**
(code updated: new AI glossary entries for both items + an offline-matcher disambiguation rule so "EM133"
mentions don't double-match the new EM133-משנ"ז variant).

## ✅ DONE — unify E360PP/SP meter names (1.08, still needs dev→main)
SQL ran clean (`db/unify_e360_meter_names.sql`): 11 rows/732 qty `מונה Landis+Gyr E360PP`, 4 rows/337 qty
`מונה Landis+Gyr E360SP`, zero leftover variants, corrupted duplicates deleted. `parse-order` redeployed
with the new aliases. **Remaining:** deploy the 1.08 bundle dev→main (code was already aligned pre-SQL,
so `main` still has the old short-form fallback strings until this ships). Broader meter/accessory drift
(CT/E570/EM133/PM135/controllers/SIMs + a corrupted CT row + empty-name catalog row) is left untouched
until asked.

## 🟡 Pending (user / admin)

1. **Supabase MCP** — added to `~/.claude.json` (`mcp.mcpServers.supabase`). This machine runs Claude in the
   **desktop app** (no `claude` CLI). Activate: **fully quit + reopen the desktop app → `/mcp` → authenticate**
   (Supabase OAuth). Then a session can deploy functions / read logs / run SQL directly (closes the redeploy loop).
2. **Calendar** — **calendar-sharing** model (NOT DWD): create a service account + key, **share the
   `information@sigmatec-energy.com` calendar** with the SA's `client_email` ("Make changes to events"),
   set `GCAL_SA_EMAIL`/`GCAL_SA_KEY`/`GCAL_ID` secrets + redeploy → then wire the יומן UI (Step 5).
   Full guide: `docs/calendar-setup.md`. (`calendar` fn already in repo **and deployed/ACTIVE**.)
3. **Rotate `service_role`** (exposed in chat) — coordinated: roll the JWT secret → update `ems-auth`'s
   `JWT_SECRET` env + redeploy → swap the new `anon` key into the bundle + rebuild.
4. **EMS changelog → calendar** — show EMS version-release days in the יומן (needs the calendar unblocked + the
   changelog source מתניה maintains).
_(No open blockers. Dev sprint board incl. writes is LIVE & verified (·94). Standing admin items: Supabase MCP,
calendar sharing+secrets, `service_role` rotation.)_

## 🔜 Open feature work (next sessions)

- 🧩 **Spec A — kibbutz order → EMS task scheduling flow** — DESIGNED + approved, **not built**. Spec:
  `docs/superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md`. Needs `db/orders_schedule_fields.sql`
  run first (עידן). Next step: writing-plans → build. Then **Spec B — דף היום inside משימות** (once-daily 00:01
  notification + click-to-set-target). Note the flow **requires a live EMS connection** (no offline EMS actions;
  the offline queue is bypassed, kept for now).

- 🔗 **`ems_task_id` link (order/visit ↔ EMS task)** — store the EMS task id on the order (and visit) so closing
  the task reconciles the order/visit, and a visit's summary attaches to a known task instead of just a comment.
  Needs a DB column + SQL (`db/orders_ems_task_id.sql` already drafted) + wiring in approveCustomerOrder /
  pushVisitToEms. Surfaced in the ·99 EMS-flow audit (deferred — schema change).
- 🧑‍💻 **Dev-page: statistics page** — עידן's next ask. The new `dev_status_log` table (first-day-per-stage per ticket)
  is the data source: time-in-stage, cycle time, throughput per sprint, aging in Backlog/Review. Build on the Stats page.
- 🧑‍💻 **Dev-page board grouping (optional revisit)** — the status board groups each whole tree by its **root's** stage,
  so a sub-task's own status doesn't place it in its own column (it nests under its parent's column with a status badge).
  Per "keep the hierarchy" this is intended; revisit only if עידן wants sub-tasks to also surface by their own status.
- 📦 **EMS/inventory: `ems_cache` RLS 401 on login** — `emsOnConnected → emsSyncCache` upserts `ems_cache` as anon →
  RLS reject (seen repeatedly in console). Likely needs the authenticated Supabase pass before the write (cf. the
  ·36 saves fix in `01-data.js`). **Inventory/EMS lane** — not the dev-page lane.

## 🟢 Done (recent — see CHANGELOG for detail)

- **Draggable quick-visit FAB (1.04→1.06, LIVE):** free-drag + persisted per device + tap-vs-drag; glowing
  drag-hint arrows that fade after first drag; gated to **עמיחי/אביאם/ניתאי only** (hidden from עידן).
  Merged `feat/draggable-visit-fab` → dev → main.
- **Released ·95→1.03 to `main` (2026-06-29):** the whole session batch (notifications, data-loss fix, per-ticket
  board, EMS-flow audit fixes + calendar tasks, visit→status, mobile, 401 fix) — reviewed pre-merge with
  superpowers + ponytail (green). **1.03** = review nit (no optimistic offline EMS status). Added
  `db/orders_schedule_fields.sql` (assignee+due_date) for the upcoming Spec A flow.
- **401/RLS save fix (1.02):** re-mint + retry, then prompt EMS re-login instead of a raw Postgres 401.

- **Visit→status + mobile QA + calendar guide (1.01):** visit report no longer appended to the kibbutz status;
  card "ביקור אחרון" shows date + who only. Mobile QA of notifications/tasks/reports at 375px (no overflow);
  fixed report range buttons to ≥40px tap targets. Calendar setup guide added (`docs/calendar-setup.md` —
  service-account *calendar-sharing*, no DWD). Version rolled ·100 → **1.01**. On `dev`.

- **EMS-task flow audit + fixes (·99):** parallel read-only audit (open/close triggers, visits, calendar,
  orders↔stock). No second order-class data-loss bug. Shipped: **EMS tasks on the calendar** (grid+day panel by
  due date); **createTask** no longer dead-letters a site-less task on a transient lookup error (#1); **task-detail
  status is queue-aware offline** (#2); **writeVisit** preserves `created_at` on edit (#4); **delivered-without-
  distribution** now confirms instead of silently downgrading (#5); requirement re-fulfill + blank-product movement
  guards. On `dev` (·99).

- **Dev sprint board: per-ticket placement (·97):** the board bucketed whole trees by the **root's** stage, so
  pushing a **child** to a sprint changed its GitHub status but the card didn't visibly move, and column counts
  (=roots) didn't match the cards shown (=subtrees). Now every ticket sits in **its own** status column (flat
  cards, accurate counts); the full tree stays in "לפי נושא". Parent-cascade removed (each card selectable
  directly) — also kills the epic-demotion bug. **LIVE on `main` (·97).** `test-devboard.mjs`.

- **DATA-LOSS fix — order/requirement details wiped on status change (·96):** status-only writes (`{id,status}`
  from approve / quick-status) rebuilt the whole row from empty defaults → wiped `items`/`supplier`/`notes`/
  `distribution`. Now order+requirement updates are **partial-safe** (PATCH only the sent fields, via
  `writeOrder`/`writeRequirement` + `sbPatch`; `test-order-patch.mjs`). **LIVE on `main` (·96).**
  ⚠️ orders wiped before this build aren't auto-recovered (e.g. עמיחי's לנדיס order — re-enter via create→edit→בדרך).

- **Approved-order notifications (·95):** אביאם/ניתאי/עמיחי — when one approves, the others see a modal on next
  open ("🔔 N הזמנות חדשות אושרו") listing each order with a "📦 הצג הזמנות" button. Zero schema changes —
  `localStorage` seen-set per user. Creator excluded, no repeat-notify. Fires from `maybeShowOrderNotifications`
  post-data hook. **On dev; not yet released to main.**

- **Dev sprint board — phase 2 LIVE (·86)**: status board (6 named columns + view toggle + day-stamps via Supabase
  `dev_status_log`), **multi-select → דחוף ל-Ready** + **🚀 עלתה גרסה** (Done→Committed) via the `github` fn
  `mode:"setStatus"` (EMS-gated; `GH_TOKEN` Projects-v2 write + a "Committed" status option — both done). Offline
  ticket cache (fetch once/connection). Page now visible to **מתניה + אליה** too. Closes the phase-2 write token item.

- **Inventory two-type order flow (·49)** — BUILT. `orderType` toggle (ספק/לקוח); supplier approval ≤10→אביאם /
  >10→עמיחי + floating עמיחי nudge; customer approval (אביאם/ניתאי) deducts approver stock → kibbutz + opens an EMS
  "אספקת ציוד" task (queued `createTask` kind) + marks order `supplied` & requirement `fulfilled`. Verified e2e
  (approval matrix, toggle, nudge, customer-approval call sequence). *Note: customer EMS task is created on the next
  EMS connect (field approvers are usually offline) — by design, via the outbound queue.*
- **EMS bubble routing (·48)**: disconnected → in-app EMS login page (`showPage('ems')`); connected → external EMS
  system. Verified both states.
- **Dev sub-issue tree LIVE & verified (·48)**: עידן redeployed the `github` fn → 40 parent cards now nest their
  sub-tasks live (#104 → its 11). The "to light up" step is done.
- **Dev-page full sub-issue tree (·46)**: nests GitHub sub-issues to any depth (📂 topic → card → sub-task → leaf),
  cross-topic children preserved, sub-count badges, nested search. Function returns `t.parent` (graceful). Verified.
- **Dev-page "עומס לפי עדיפות" (·44)**: priority-load tiles in the פיתוח hero (קריטי/גבוהה/בינונית/נמוכה counts),
  fed by the now-live Projects-v2 Priority field.
- **Morning "היום" view REMOVED (·44)**: reverted per request — not wanted in the app right now. (Was added ·42;
  the whole feature incl. remember-last-page landing is gone; app opens on the home page.)
- **Dev-tasks priority/status went live (·43, config)**: `GH_TOKEN` reissued with `repo+read:org+project` + redeploy.
- **Low-stock "appears twice" fix (·43)**: meter shortage no longer doubles for אביאם/עמיחי (banner + company-task
  line) — they keep the banner, the line is skipped; other users keep the line. Verified per-role.
- **Dev-tasks color redesign (·41)**: dark navy KPI hero (4 live tiles + "עומס לפי נושא" bar/legend),
  per-topic color system (spine/pill/rail/bar all share one color), violet "בפיתוח עכשיו" card, filled-red
  critical chip. Pure visual — no data/logic change. Verified desktop 1040 + mobile 375 (2-col, no overflow).
- **Dev-tasks page**: 3-level collapsible tree (topic→אב→בן→detail+body), explicit GitHub button,
  **Projects-v2 Priority+Status via GraphQL**, "בפיתוח עכשיו" by real Status, search/jump chips, mobile-first.
- **Saves fix**: write shim re-mints the auth pass before every upsert → no more "נשמר מקומית" (·36).
- **Mobile QA pass** (≤768px): no overflow, ≥40px targets, my-tasks/attendance/matrix fixes (·33).
- **Version stamp** auto-increments in the footer; home renamed **"דף הבית"**; EMS bubble wording; footer RTL fix.
- **"שמור לגיליון" → "שמור"** (buttons + toasts); removed obsolete company-tasks "שלח לעידן" workaround.
- **Hang prevention**: function fetch timeouts + client 20s timeout + 🔄 retry.
- Earlier: Supabase migration · PWA · EMS login gate · security bridge + write-lockdown + messages-privacy ·
  Stats page · role-based Employee page · meters · "add to calendar" links · module split + build.
