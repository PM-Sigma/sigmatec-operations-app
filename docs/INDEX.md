# Sigmatec Operations App — Memory Index

**Entry point for project memory.** Read this first, then load *only* the file you need.
No secrets live in these files (the repo is public). Session history & decisions live in
**claude-mem** (`mem-search` skill) — these files are the *stable* reference.

---

## ▶️ RESUME A SESSION (read this to continue)

New session? Read **in this order**, then pick up from **🚦 Current state** (bottom of this file):
1. `docs/INDEX.md` (this file) — map + current state.
2. `docs/backlog.md` — blocker + pending/done.
3. `docs/CHANGELOG.md` — what changed recently.
4. The specific `docs/*` file for the task.

> Tell a fresh session: **"קרא את docs/INDEX.md בפרויקט Sigmatec Operations App והמשך מאיפה שעצרנו"**
> — or the trigger phrase **"סשן חדש של הדשבורד"** (wired into the global memory rule).

---

## 🧭 Work tracks / lanes — `dev`=·95 / `main`=·94 (release pending, 2026-06-28)

The app was built in **two parallel tracks**. Both major bodies of work are **LIVE on `main` (·94)**. A fresh
session can pick up *either* track. If two sessions run at once again, keep the lane file-ownership below and
**`git pull --rebase` before `node build.mjs`** — the build regenerates ALL of `js/app.js` from `js/src/*.js`, so
building on a stale tree silently **reverts** the other lane. Both lanes commit on `dev`; release = ff `dev → main`.

| Lane | Owns (edit only these) | Delivered & live |
|------|------------------------|------------------|
| 🧑‍💻 **DEV-PAGE** (פיתוח) | `js/src/18-dev-tasks.js` · `supabase/functions/github/` · `.dev-*` in `css/app.css` · `#dev-view` markup · `db/dev_status_log.sql` | **Sprint board** — 6 status columns, **tree nesting preserved** (each tree grouped by its root's stage; epic→children nested) + view toggle + filters + search · **multi-select → "העבר משימות לספרינט הקרוב"** (leaf-only checkboxes; all-children-selected cascades the parent) + **🚀 עלתה גרסה** (Done→Committed) via `github` fn `mode:"setStatus"` — **verified live, GH_TOKEN needs `project` WRITE (gotcha: `read:project` ≠ write)** · **day-stamps** (`dev_status_log`) · **offline cache** (fetch once/connection) · access for **מתניה + אליה** |
| 📦 **INVENTORY** (מלאי) | `js/src/06/07/08-*.js` · `13-ems.js` (`createTask`) · `supabase/functions/parse-order/` · inventory CSS/markup · `02` order-status | **Two-type order flow** (ספק raises / לקוח consumes stock) · **AI order parsing** (Gemini→Groq→offline + learning loop) · conversational accessory modal · **parse-source badge** · order/delivery dates |

**Build hygiene (if resuming parallel):** pull → build → stage ONLY your `js/src/*` + the regenerated
`js/app.js`/`index.html`/`VERSION` → commit → push. **Never `git add -A`** (sweeps the other lane's WIP). Higher
VERSION wins on merge. **Function deploys** (handoff convention, עידן): give a **local file link + a GitHub link**
(no raw link), and **reply to עידן in full English**.

---

## 📁 Files (load on demand)

| File | When to read it |
|------|-----------------|
| [architecture.md](architecture.md) | How it fits together: PWA ↔ Supabase ↔ Apps Script ↔ EMS. Start here. |
| [modules.md](modules.md) | What every `js/src/*.js` module does + its functions. |
| [data-and-security.md](data-and-security.md) | Supabase tables, data layer, RLS, the auth bridge, key rotation, Apps Script security. |
| [operations.md](operations.md) | Build/deploy/test, edge-function deploy, env values, test flags. |
| [calendar-setup.md](calendar-setup.md) | **Connecting the office calendar (יומן)** — Google service-account sharing, Supabase secrets, client-wiring step, troubleshooting. |
| [team.md](team.md) | Employee roles, field/office, what to measure per person. |
| [backlog.md](backlog.md) | Current blocker + pending/done. |
| [vision-budget.md](vision-budget.md) | Drawer plan — what a budgeted version unlocks. |
| [RECOMMENDATIONS-he.md](RECOMMENDATIONS-he.md) | **Next-stage recommendations (Hebrew), by domain** — read this for direction. |
| [CHANGELOG.md](CHANGELOG.md) | Dated log of every update. |

**🔄 Update protocol (every checkpoint):** CHANGELOG entry + backlog state + the **Current state** block below.

---

## ⚡ Quick facts
- **Live:** https://pm-sigma.github.io/sigmatec-operations-app/ (installable PWA). **Repo:** `PM-Sigma/sigmatec-operations-app` (public).
- **Backend:** Supabase (data + REST + RLS + Edge Functions `ems-auth`/`calendar`/`github`) + Apps Script (EMS proxy). EMS API for tasks/meters.
- **Build:** edit `js/src/*.js` → `node build.mjs` → commit → push (main = live). `dev` = WIP; preview via raw.githack.com/.../dev/…
- **Versioning:** `·N` counter up to **·100**, then rolls to **`1.01`** and the minor auto-increments per build; a **big/sweeping update** → `node build.mjs major` (→ `2.00`). Details: [operations.md](operations.md) → Versioning.
- **Edge Function secrets:** changing a secret needs a **redeploy** to take effect.
- **Owners:** עידן(PM/ops, office, owns go-live) · עמיחי(CEO, sees all) · אביאם(field lead) · ניתאי(field) · מתניה(dev, office). Field-report = אביאם/ניתאי only.

## 🚦 Current state — last: 2026-07-01 (**1.06 LIVE on `main`; 1.09 on `dev`**).

**🆕 1.09 (dev) — new catalog items pending SQL: EM133 משנ"ז fix + בקר 485.** `db/add-em133-mashneze-and-485.sql`
(not yet run) fixes the EM133-משנ"ז product name (missing מונה prefix) + adds בקר 485 + seeds ניתאי's stock
(2/3/+1). AI glossary + offline-matcher disambiguation already updated in code — **needs the SQL run +
`parse-order` redeploy**.

**✅ 1.08 (dev) — unified Landis E360PP/E360SP meter names, DONE.** Canonical = **`מונה Landis+Gyr E360PP`** /
**`מונה Landis+Gyr E360SP`**. SQL migration ran clean (verified: 11 rows/732 qty PP, 4 rows/337 qty SP,
zero leftover variants; the 2 corrupted duplicate movement rows are gone) and `parse-order` was
redeployed. Code already aligned (PRODUCT_LIST / METER_RULES / returns default / parse-order aliases).
**Remaining:** deploy dev→main (covers both 1.08 and 1.09). Broader drift (CT/E570/PM135/controllers/SIMs
+ a corrupted CT movement + empty-name catalog row) flagged, not touched. See [CHANGELOG](CHANGELOG.md).

### Version era: decimal (`·N`→`1.01` rolled at 100; `node build.mjs major`→2.00).

**✅ Released to `main` (·95 → 1.06) — the full session batch:**
- **·95** approved-order notifications (אביאם/ניתאי/עמיחי). **·96** DATA-LOSS fix — order/requirement status-only writes no longer wipe items (partial PATCH; `writeOrder`/`writeRequirement`/`sbPatch`). **·97** dev sprint board = **per-ticket** placement (push moves the card; accurate counts). **·99** EMS-flow audit fixes (createTask no site-less dead-letter; `changeEmsStatus` queue-aware; **EMS tasks on the calendar**; delivered-without-distribution confirm; req re-fulfill + blank-product guards). **1.01** visit report off the kibbutz status (card shows "ביקור אחרון" = date+who); mobile QA + `.btn-quick-date` ≥40px; **calendar setup guide**. **1.02** 401/RLS save → re-mint+retry then prompt EMS re-login. **1.03** pre-merge review nit. **1.04–1.06** **draggable quick-visit FAB** (free-drag, persisted per device, tap-vs-drag) + glowing drag-hint arrows (fade after first drag) + **gated to עמיחי/אביאם/ניתאי only** (hidden from עידן; עמיחי="תיעוד ביקור", field pair="תיעוד נוכחות").
- Reviewed pre-merge with **superpowers code review + ponytail** → green.

**🔭 Designed, NOT built yet (next):**
- **Spec A — kibbutz order → EMS task scheduling flow** ([spec](superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md)): size-rule approval (≤10 אביאם/>10 עמיחי; **ניתאי = assignee-only**), שיבוץ-on-approve modal ("מלאי ההזמנה יורד מהמלאי שלך", reassign only to workers who hold stock), **computed reserved stock** (no new movement; real movement at delivery via the visit summary), auto-close on visit summary, AI mismatch-reconcile (advisory "מתייעץ עם סוכן" bubble) + message to עידן + must-fix popup, 12h/due-date reminders, **require live EMS connection (no offline EMS actions)**. ⚠️ Needs `db/orders_schedule_fields.sql` run (עידן doing it). Next: writing-plans → build.
- **Spec B — דף היום inside משימות** + once-daily (after 00:01) notification + click-to-set-target per task. Its own spec after A.
- **Calendar UI wiring** still pending (client doesn't fetch the `calendar` fn yet) — see [calendar-setup.md](calendar-setup.md), do it when עידן configures Google + secrets.

**🩺 ·99 (dev) — EMS-task flow audit + fixes:** parallel read-only audit of the whole flow (open/close triggers, visits, calendar, orders↔stock). **No second order-class data-loss bug** (visits re-send full content; movements insert-only; EMS status PATCH hits the external EMS API). Shipped: **EMS tasks now on the calendar** (grid+day panel by `expectedCompletionDate`, `collectCalendarEvents`); **createTask** no longer dead-letters a site-less task on a transient lookup error (#1); **task-detail status is queue-aware offline** (#2, `changeEmsStatus`→`emsWriteOrQueue`); **writeVisit preserves `created_at` on edit** (#4); **delivered-without-distribution confirms** instead of silent downgrade (#5); requirement re-fulfill + blank-product movement guards. **Deferred:** `ems_task_id` link (order/visit ↔ task) — schema change. Open/close map: tasks OPEN only via customer-order approval (`createTask`); CLOSE/advance via the visit form (queued) or the task-detail dropdown (now queued).

**🛠️ ·97 — dev sprint board now per-ticket (LIVE):** the board bucketed whole trees by the **root's** stage (·92 nesting), so a **child** pushed to a sprint changed its GitHub status but the card didn't move, and column counts (=roots) ≠ cards shown (=subtrees) — this is the "push feels broken" report. Fixed — every ticket sits in **its own** status column (flat cards, accurate counts; `devBoard` in `18-dev-tasks.js`); full אב→בנים tree stays in "לפי נושא". Parent-cascade removed (cards selectable directly) → also kills the epic-demotion bug. `test-devboard.mjs`. No `github` fn redeploy needed.

**🐞 ·96 — DATA-LOSS fix (LIVE):** order/requirement **status-only** writes (`{id,status}` from approve / quick-status) used to rebuild the row from empty defaults → **wiped items/supplier/notes/distribution** (reported: עמיחי's 700+100 לנדיס order lost its items after approval+status-push). Fixed — order+requirement writes are now **partial-safe** (PATCH only the fields sent; `writeOrder`/`writeRequirement`+`sbPatch` in `01-data.js`; `test-order-patch.mjs`). ⚠️ orders already wiped before ·96 are **not** auto-recovered.

**💻 Dev page (פיתוח) — sprint board LIVE & verified end-to-end:** default **status board**, 6 named columns (ממתין לפיתוח/ספרינט קרוב/בפיתוח עכשיו/בשלבי בדיקות/גמר פיתוח ממתין לגרסה/עלה לאוויר) — **tree hierarchy preserved** (each tree grouped by its root's stage; epic→children nested) + view toggle (סטטוס/נושא); filters+search. **Writes WORKING:** **"העבר משימות לספרינט הקרוב"** (multi-select, **leaf-only checkboxes**; selecting all of a parent's children **cascades the parent** → whole tree moves) + **🚀 עלתה גרסה** (Done→Committed) via `github` fn **`mode:"setStatus"`** (`setProjectStatus`: synonym EN/HE option-match + auto-add issue to board). **⚠️ GOTCHA (resolved): writes need `GH_TOKEN` scope = `project` (write); `read:project` is NOT enough.** **Day-stamps** via Supabase **`dev_status_log`**; **offline cache** (fetch once/connection); visible to **עידן+עמיחי+מתניה+אליה**.

**📦 Inventory (·95 on dev):** Approved-order notifications — when אביאם/ניתאי/עמיחי approves, the other two see "🔔 N הזמנות חדשות אושרו" modal on next open (localStorage seen-set, no schema change; creator excluded, no repeat). AI order parsing **verified live** (Gemini→Groq→offline; parse-source badge; conversational accessory modal; learning loop). Orders column header "פעולות על ההזמנה — שנה סטטוס ל:" left-aligned.

**OPEN — dev-page:** (a) **statistics page** = next ask (the `dev_status_log` feeds time-in-stage / throughput / cycle-time); (b) board places sub-tasks under root's stage column — intended; revisit if per-status placement wanted. **OPEN — inventory/EMS:** `ems_cache` RLS 401 on login (`emsOnConnected→emsSyncCache` anon upsert rejected) — needs auth pass before write (cf. ·36 saves fix). **Deferred:** customer delivery auto-stamp on EMS task-closure (needs `ems_task_id` col); order activities in "פעילות היום". **TODO:** add `Carlo Gavazzi E341` to catalog.

**Live & verified on `main`:** Supabase migration · PWA · EMS login gate · meters · "add to calendar" links ·
security bridge + write-lockdown + messages-privacy (anon=read-only, auth=write) · Stats · Employee page
(role-based, gated עידן+עמיחי) · EMS bubble (**🟢 מחובר ל-EMS / 🔴 אין חיבור ל-EMS**) · visit FAB gated to field ·
access/roles (עמיחי=all, מתניה no inventory) · **auto-incrementing version stamp** (footer "גרסה {date}·{N}") ·
home renamed **"דף הבית"** (🏠) · footer RTL fix · **mobile QA pass** (no overflow ≤768px, ≥40px targets;
my-tasks/attendance/matrix fixes).

**🔧 Saves (·36):** the write shim (`01-data.js`) **re-mints the authenticated pass before every upsert** —
fixed the recurring "נשמר מקומית" failure (writes were going out anon → RLS reject). Covers company-tasks,
requirements, tasks, visits, orders. Buttons/toasts "שמור לגיליון"→"שמור". Company-tasks "שלח לעידן" workaround removed.

**💻 Dev page (פיתוח) — `18-dev-tasks.js` + `github` Edge Fn + Supabase `dev_status_log`:**
Live tickets from the **GitHub Projects-v2 "Sigmatec EMS — Roadmap" (Sigmatec-Energy #1)** via the EMS-gated
`github` fn (GraphQL: issues + Priority/Status fields + native sub-issue `parent`). Visible to **עידן+עמיחי+מתניה+אליה** (`canSeeDevTasks`).
- **Two views (`devSetView`):** **לפי סטטוס** (default) = the **sprint board** — 6 named columns via `devStage()`:
  ממתין לפיתוח(Backlog) · ספרינט קרוב(Ready) · בפיתוח עכשיו(In Progress) · בשלבי בדיקות(In Review) · גמר פיתוח ממתין לגרסה(Done) ·
  עלה לאוויר(Committed); each card = title/#num/priority/assignee, sorted by priority. **לפי נושא** = the older topic
  tree (📂 topic → nested GitHub sub-issues, any depth). Mobile = flattened card-based tree.
- **Hero + filters:** KPI tiles + "עומס לפי עדיפות"/"עומס לפי נושא" bar+legend; every tile is a **toggle filter**
  (priority / In-Progress / last-7d) re-rendering from cached `_devData` (`devSetFilter`→`devPaint`, no re-fetch). Live search.
- **Writes (·84/·86 — `github` fn `mode:"setStatus"` → `setProjectStatus`):** **☑️ בחר משימות** multi-select +
  sticky bar **🟢 דחוף ל-Ready**; **🚀 עלתה גרסה** = move all Done → Committed. EMS-gated; needs `GH_TOKEN` Projects-v2
  **write** scope + the target Status options ("Ready"/"Committed") to exist in the project (both done).
- **Day-stamps:** tiny gray `Backlog 1.6 · Ready 5.6 · …` per card, from Supabase **`dev_status_log`** (forward-tracking:
  client records first day seen per stage on each sync — anon read, auth insert; `on_conflict do nothing`). `db/dev_status_log.sql`.
- **Offline cache (·77/·79):** tickets persist in `localStorage` (`dev_tasks_cache_v1`) → instant paint even pre-login;
  the heavy GitHub fetch runs **once per connection** (🔄 forces). **`github` fn CORS** reflects an allowlist
  (prod + `*.githack.com` previews + localhost) so dev-branch previews work.

**Morning "היום" view — REMOVED (·44).** Was added ·42; removed per request (not wanted in the app now). The
whole feature is reverted incl. remember-last-page landing; app opens on the home page.

### 📦 Inventory two-type order flow — BUILT (·49)
Orders carry **`orderType`** (toggle in the new-order modal):
- **ספק** (raises stock): approve routed by size — **≤10→אביאם, >10→עמיחי** (+ floating עמיחי nudge,
  `maybeShowAmichaiApprovalReminder`). Approve → `pending` → existing delivery+distribution raises stock.
- **לקוח** (consumes stock): kibbutz picker; approve by **אביאם/ניתאי** → movement `customer_supply`
  (approver→kibbutz) + EMS **"אספקת ציוד"** task (new `createTask` queue kind → sent on next connect) + order
  `supplied` + requirement `fulfilled`.
Code: `07-orders.js` (orderType/orderTotalQty/orderKibbutz/canApproveThisOrder/approveCustomer|SupplierOrder),
`13-ems.js` (`createTask`), `02` (`supplied` status + ORDER_STATUSES), `index.html` (toggle + עמיחי modal).

### ✅ RESOLVED — live priorities/status (2026-06-23)
The `GH_TOKEN` was reissued with **`repo` + `read:org` + `project`** and the `github` fn redeployed.
*(Sigmatec-Energy has no SAML SSO → no SSO-authorize step needed.)* **Verified live:** פיתוח renders 127 status
badges + priority chips across 130 tickets, "בפיתוח עכשיו" driven by real In-Progress. The dev-tasks page is now
fully functional. Remaining dev-page work = **phase 2 (editing)**: a write-capable token to set priority/sprint from the app.

### Other pending (user/admin)
- **Supabase MCP** — already added to `~/.claude.json` → `mcp.mcpServers.supabase` (http, project_ref=wwqfcajnxinaxmobrgol).
  This machine runs Claude in the **desktop app** (no `claude` CLI), so don't use `claude mcp add`. Activate:
  **fully quit + reopen the desktop app → `/mcp` → authenticate** (Supabase OAuth). Then a session can deploy functions / read logs / run SQL directly. Backup of config at `~/.claude.json.bak`.
- **Calendar** — Workspace **Domain-Wide Delegation** (admin authorizes the SA `client_id` for `calendar`).
- **Rotate `service_role`** (exposed in chat) — coordinated JWT-secret roll (roll secret → update `ems-auth` `JWT_SECRET` + redeploy → I swap the new anon key).
- **Dev-tasks editing (phase 2)** — write-capable token to set priority/sprint from the app.

See [backlog.md](backlog.md) · [CHANGELOG.md](CHANGELOG.md) · [RECOMMENDATIONS-he.md](RECOMMENDATIONS-he.md).
