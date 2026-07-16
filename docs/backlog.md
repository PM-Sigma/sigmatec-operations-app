# Backlog & status

_Update this file as things move. Session-by-session history lives in claude-mem._
_Full current snapshot: [INDEX.md](INDEX.md) → 🚦 Current state. Build: **·95 on dev** / **·94 on main** (2026-06-25)._

## 🟡 IN PROGRESS — Excel exports for aggregate reports (spec done, NOT built)
Paused at spec stage 2026-07-16. Spec:
[docs/superpowers/specs/2026-07-16-viewer-excel-exports-design.md](superpowers/specs/2026-07-16-viewer-excel-exports-design.md).
6 reports → real .xlsx (vendored SheetJS, lazy-loaded), 📗 button for **עידן + viewer only**,
row-per-item explosion, typed cells. Sample files approved by עידן. Test plan in the new
[docs/testing-methodology.md](testing-methodology.md) (`test-exports.mjs`, loop until green).

## 🟡 IN PROGRESS — viewer role home tightening (spec done, NOT built)
Paused mid-feature 2026-07-16. Spec + resume point:
[docs/superpowers/specs/2026-07-16-viewer-role-tightening-design.md](superpowers/specs/2026-07-16-viewer-role-tightening-design.md).
Goal: viewer home = navy header only (hide kibbutz cards, company-tasks, urgent-alert, filter-bar,
compact toggle); hide משימות nav; keep מלאי/נוכחות/יומן. 2 edits (CSS block in `css/app.css` +
`isViewer()` line in `applyNavVisibility()`), then `node build.mjs`. **Not started in code.**
Also parked: PUSH notifications (Web Push feasibility noted in the spec's out-of-scope).

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
2. **Calendar** — Workspace **Domain-Wide Delegation**: admin authorizes the SA `client_id` for the `calendar`
   scope → then add a `sub` impersonation claim + wire the יומן UI. (`calendar` fn already in repo.)
3. **Rotate `service_role`** (exposed in chat) — coordinated: roll the JWT secret → update `ems-auth`'s
   `JWT_SECRET` env + redeploy → swap the new `anon` key into the bundle + rebuild.
4. **EMS changelog → calendar** — show EMS version-release days in the יומן (needs the calendar unblocked + the
   changelog source מתניה maintains).
_(No open blockers. Dev sprint board incl. writes is LIVE & verified (·94). Standing admin items: Supabase MCP,
calendar DWD, `service_role` rotation.)_

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
