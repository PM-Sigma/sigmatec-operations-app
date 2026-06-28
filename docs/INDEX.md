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

## 🧭 Work tracks / lanes — both shipped to `main` (·94, 2026-06-25)

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

## 🚦 Current state — last: 2026-06-25 (**·94 LIVE on `main`**). **💻 Dev page (פיתוח) — sprint board LIVE & verified end-to-end:** default **status board**, 6 named columns (ממתין לפיתוח/ספרינט קרוב/בפיתוח עכשיו/בשלבי בדיקות/גמר פיתוח ממתין לגרסה/עלה לאוויר) — **tree hierarchy preserved** (each tree grouped by its root's stage; epic→children nested) + view toggle (סטטוס/נושא); filters+search. **Writes WORKING:** **"העבר משימות לספרינט הקרוב"** (multi-select, **leaf-only checkboxes**; selecting all of a parent's children **cascades the parent** → whole tree moves) + **🚀 עלתה גרסה** (Done→Committed) via `github` fn **`mode:"setStatus"`** (`setProjectStatus`: synonym EN/HE option-match + auto-add issue to board). **⚠️ GOTCHA (resolved): writes need `GH_TOKEN` scope = `project` (write); `read:project` is NOT enough.** **Day-stamps** via Supabase **`dev_status_log`**; **offline cache** (fetch once/connection); visible to **עידן+עמיחי+מתניה+אליה**. **OPEN — dev-page:** (a) **statistics page** = the next ask (the `dev_status_log` feeds time-in-stage / throughput / cycle-time); (b) board places sub-tasks under their root's stage column (not their own status) — revisit only if per-status sub-task placement is wanted. **OPEN — other lane:** `ems_cache` RLS 401 on login (`emsOnConnected→emsSyncCache` anon upsert rejected) — inventory/EMS session to fix (likely needs the auth pass, cf. ·36 saves fix). — AI order parsing **verified live end-to-end** (Gemini via `parse-order`, EMS-gated; Gemini→Groq chain; offline matcher fallback). Customer accessories: Landis(incl E570)→SIM, non-Landis meter→controller; controller & power-supply TYPE via a **conversational modal**; ambiguous "סאטק"→asks model; non-catalog items prompt add-to-catalog-or-drop at save; every text order feeds the learning loop; **parse-source badge** (Gemini/Groq/Offline) on the items label; updater's stock 📦 per item; "תאריך הזמנה" (editable; created_at=entry) + delivery date shown. **Deferred:** customer delivery auto-stamp on EMS task-closure (needs `ems_task_id` col — `db/orders_ems_task_id.sql`); order activities in "פעילות היום". **TODO:** add `Carlo Gavazzi E341` to the מוצרים catalog (or let the add-to-catalog prompt do it).

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
