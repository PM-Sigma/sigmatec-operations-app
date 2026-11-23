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

## 🧭 Branches
`main` is live and the only integration branch. Work in a **git worktree off `origin/main`**, rebase + `node build.mjs` before pushing,
push ff-only `HEAD:main` (CLAUDE.md → "Parallel-safe merge"). **Do not use `dev`** — it is ~550 commits behind `main`, so building from
it or releasing it would revert production. Lane file-ownership (who edits what) is in CLAUDE.md / the specs, not here.


## 📁 Files (load on demand)

| File | When to read it |
|------|-----------------|
| **[ops-graph/](ops-graph/README.md)** | **OPS GRAPH — queryable map of the whole app (4,714 nodes / 12,523 edges, 2.23).** Ask it "what touches what" before grepping: `python docs/ops-graph/ops_graph.py explain <thing>`. Verified defects: local BROKEN.md (not in the public repo). |
| [architecture.md](architecture.md) | How it fits together: PWA ↔ Supabase ↔ EMS API (Apps Script retired). Start here. |
| [modules.md](modules.md) | What every `js/src/*.js` module does + its functions. |
| [data-and-security.md](data-and-security.md) | Supabase tables, data layer, RLS, the auth bridge, key rotation. |
| **[ops-graph/](ops-graph/README.md)** | **OPS GRAPH — queryable map of the whole app (6,747 nodes / 17,724 edges, rebuilt 29.9 at 2.109).** Ask it "what touches what" before grepping: `python docs/ops-graph/ops_graph.py explain <thing>`. Verified defects: local BROKEN.md (not in the public repo). |
| [architecture.md](architecture.md) | How it fits together: PWA ↔ Supabase ↔ Apps Script ↔ EMS. Start here. |
| [modules.md](modules.md) | What every `js/src/*.js` module does + its functions, the React islands map (corrected 29.9) and the edge-function list. |
| [superpowers/DECISIONS-round5.md](superpowers/DECISIONS-round5.md) | **Round 5 decisions table** (who decided, why, where in code) + open questions for עידן. |
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
- **Source-of-truth:** Supabase (round 5 Phase 1, 23.9: the Google Sheet data source is retired —
  `WRITE_ROUTER_URL` in `js/src/01-data.js` is an internal dispatch key now, not a live endpoint).
- **Live:** https://pm-sigma.github.io/sigmatec-operations-app/ (installable PWA). **Repo:** `PM-Sigma/sigmatec-operations-app` (public).
- **Backend:** Supabase (data + REST + RLS + Edge Functions `ems-auth`/`calendar`/`github`) — **no Apps Script any more** (retired; everything goes through Supabase). The app calls the EMS API `api.sigmatec-ems.com/v1` **directly** with the signed-in user's EMS token (tasks/meters/readings).
- **Build:** edit `js/src/*.js` → `node build.mjs` → commit → push ff-only to `main` (= live) from a worktree off `origin/main`. No `dev` branch workflow.
- **Versioning:** `·N` counter up to **·100**, then rolls to **`1.01`** and the minor auto-increments per build; a **big/sweeping update** → `node build.mjs major` (→ `2.00`). Details: [operations.md](operations.md) → Versioning.
- **Edge Function secrets:** changing a secret needs a **redeploy** to take effect.
- **Owners:** עידן(PM/ops, office, owns go-live) · עמיחי(CEO, sees all) · אביאם(field lead) · ניתאי(field) · מתניה(dev, office). Field-report = אביאם/ניתאי only.

## 🚦 Current state — 2026-11-23 (live 2.195+; attendance/notifications fix round 2 in progress)
- **Live on `main`:** the פעולות שטח hub (היום שלי + נוכחות + קריאות IP; one page, `showPage('attendance')` redirects into it),
  readings pull (SpeedNet/DataSense) with history back a year, CityMind (Arad) incl. אפיק, bug bot, visit summary <-> EMS task.
  🔥 צריבות is **OFF** (`BURNS_PROJECT_ACTIVE=false`, 19.11). Home kibbutz card no longer shows meeting notes.
- **Attendance round 1 (merged):** legacy "חסר תיעוד" popup removed; morning push only on work days, stable tag, only when the list changed;
  a field check-in day = "שטח, ממתין לסיכום" (not missing); one manual row per day.
- **Round 2 (branch `fix/r1-att2`, NOT pushed — see CHANGELOG 2026-11-23 "round 2"):** last month keeps reminding (push + screen),
  screen refreshes on the 15s poll, "היום" block for field staff with the visit-summary button, evening push default 20:00, a
  "no device registered" nag + manager flag, holidays survive the poll (`window._holidays`), usage report on the live page list,
  hours page "השעות שלי" for מתניה, ➕ on the hub, landing "דוחות", and push-send hardening (approveOrder / order events / attendanceCron
  authenticated; inventory pushes off until `stock_enforced`). **For MAIN to apply:** deploy `push-send`; run the `db/*.sql` listed in that entry.
- **Open (עידן):** stock correction from the 7.10/4.10 visit-overwrite bug (see backlog); אפיק water meters in EMS; `db/attendance_dedupe_2026_11.sql` approval;
  bug-bot home-server install (`scripts/bugbot/INSTALL.md`).
- **Branching:** there is no `dev` workflow (`origin/dev` is ~550 commits stale). Worktree off `origin/main`, ship ff-only to `main` (CLAUDE.md "Parallel-safe merge").
- Older state blocks were collapsed into this one on 23.11.26; the history is in [CHANGELOG.md](CHANGELOG.md) and git.

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
