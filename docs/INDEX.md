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

## ⚠️ TWO SESSIONS ACTIVE IN PARALLEL — stay in your lane (2026-06-24, app **·63**)

Two Claude sessions are working this repo at the same time. **Edit only your lane's files**, and
**`git pull --rebase` the other's commits *before* you `node build.mjs`** — the build regenerates the
ENTIRE `js/app.js` from every `js/src/*.js`, so building on a stale tree silently **reverts** the other
lane's bundle. Both branches commit on `dev`.

| Lane | OWNS (edit only these) | Do NOT touch |
|------|------------------------|--------------|
| 🧑‍💻 **DEV-PAGE** (the new session) | `js/src/18-dev-tasks.js` · `supabase/functions/github/` · the `.dev-*` rules in `css/app.css` · the `#dev-view` markup in `index.html` | everything in the inventory lane → |
| 📦 **INVENTORY** (other session) | `js/src/06-products.js` · `07-orders.js` · `08-inventory.js` · `13-ems.js` (`createTask`) · `supabase/functions/parse-order/` · inventory CSS/markup · `02` order-status | the dev-page files ← |

**Shared build artifacts** (`js/app.js`, `VERSION`, the `?v=` stamp in `index.html`): both `build.mjs` runs
rewrite them. Rule: **pull → build → stage ONLY your `js/src/*.js` + the regenerated `js/app.js`/`index.html`/`VERSION`
→ commit → push promptly.** Never `git add -A` (it sweeps the other lane's WIP). If the VERSION numbers race, the
higher one wins on merge — don't fight it. When in doubt, pull and rebuild before pushing.

**This (dev-page) session's scope:** the פיתוח page is fully functional (sub-issue tree + live Projects-v2
priority/status). Open dev-page work = **phase-2 editing** (write-capable token to set Priority/Status/sprint from
the app) + any UI tweaks עידן requests. Do **not** edit orders/inventory/parse-order — the other session owns those.

---

## 📁 Files (load on demand)

| File | When to read it |
|------|-----------------|
| [architecture.md](architecture.md) | How it fits together: PWA ↔ Supabase ↔ Apps Script ↔ EMS. Start here. |
| [modules.md](modules.md) | What every `js/src/*.js` module does + its functions. |
| [data-and-security.md](data-and-security.md) | Supabase tables, data layer, RLS, the auth bridge, key rotation, Apps Script security. |
| [operations.md](operations.md) | Build/deploy/test, edge-function deploy, env values, test flags. |
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
- **Edge Function secrets:** changing a secret needs a **redeploy** to take effect.
- **Owners:** עידן(PM/ops, office, owns go-live) · עמיחי(CEO, sees all) · אביאם(field lead) · ניתאי(field) · מתניה(dev, office). Field-report = אביאם/ניתאי only.

## 🚦 Current state — last: 2026-06-24 (app **·62** live. Customer order accessories: Landis→SIM, non-Landis→controller; controller/power-supply TYPE chosen via a **conversational modal**; non-catalog items prompt add-to-catalog-or-drop at save; every text order feeds the learning loop. `parse-order` re-deploy still pending for ·56-61 glossary (function unchanged in ·62). **TODO: add `Carlo Gavazzi E341` to the מוצרים catalog** — or just let the new "add to catalog?" prompt do it on the next Carlo order.)

**Live & verified on `main`:** Supabase migration · PWA · EMS login gate · meters · "add to calendar" links ·
security bridge + write-lockdown + messages-privacy (anon=read-only, auth=write) · Stats · Employee page
(role-based, gated עידן+עמיחי) · EMS bubble (**🟢 מחובר ל-EMS / 🔴 אין חיבור ל-EMS**) · visit FAB gated to field ·
access/roles (עמיחי=all, מתניה no inventory) · **auto-incrementing version stamp** (footer "גרסה {date}·{N}") ·
home renamed **"דף הבית"** (🏠) · footer RTL fix · **mobile QA pass** (no overflow ≤768px, ≥40px targets;
my-tasks/attendance/matrix fixes).

**🔧 Saves (·36):** the write shim (`01-data.js`) **re-mints the authenticated pass before every upsert** —
fixed the recurring "נשמר מקומית" failure (writes were going out anon → RLS reject). Covers company-tasks,
requirements, tasks, visits, orders. Buttons/toasts "שמור לגיליון"→"שמור". Company-tasks "שלח לעידן" workaround removed.

**💻 Dev-tasks page (פיתוח, `18-dev-tasks.js` + `github` fn):** 3-level **collapsible tree** —
📂 topic → אב sub-topic (toggle children) → בן task (toggle detail: state/assignee/dates/**body**).
GitHub = explicit icon button (not the default click). Priority + Status come from the **GitHub Projects-v2**
board **"Sigmatec EMS — Roadmap" (Sigmatec-Energy #1)** via **GraphQL** (·39); priority chip
(קריטי/גבוה/בינוני/נמוך) + Status badge; **"בפיתוח עכשיו" driven by real Status=In-Progress**. Client timeouts + 🔄 retry.
**Color redesign (·41):** dark navy **KPI hero** (4 live tiles + "עומס לפי נושא" bar/clickable legend, replaces
the jump-chips) + a **per-topic color system** (spine/count-pill/body-rail/bar-segment/legend-dot all share one
color) + violet "בפיתוח עכשיו" card + filled-red critical chip. **"עומס לפי עדיפות" (·44):** priority-load tiles
(קריטי/גבוהה/בינונית/נמוכה counts) under the KPIs, fed by the live Projects-v2 Priority field.
**Full sub-issue tree (·46):** the tree now nests **GitHub native sub-issues** (real hierarchy, any depth:
📂 topic → card → sub-task → leaf), replacing the old title-pipe `אב` grouping that scattered an epic's children.
Function returns each issue's `parent` (one GraphQL query; graceful → flat if absent). **Live & verified (·48):**
40 parent cards nest their sub-tasks (e.g. #104 → its 11). **EMS bubble (·48):** disconnected → in-app login page
(`showPage('ems')`); connected → external EMS system.

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
