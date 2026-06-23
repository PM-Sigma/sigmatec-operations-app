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

## 🚦 Current state — last: 2026-06-23 (build ·43, deployed to main)

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
color) + violet "בפיתוח עכשיו" card + filled-red critical chip. Pure CSS/markup — no data/logic change.

**Morning "היום" view (·42, `19-today.js`):** new **first** nav page (🌅) — role-aware briefing: דורש-טיפול
(approvals you can act on + low-stock), המשימות-שלי (your open EMS tasks), סטטוס-הקמה (pipeline counts).
Client-only. **Landing:** reopen last page same-day, land on היום on a new day (`landOnStartPage` from `refreshData`).

### 🅿️ Parked this session (out-of-office, needs עידן) — see backlog #6
**Inventory-flow rework** is fully **designed** (two order types; supplier ≤10→אביאם / >10→עמיחי + floating alert;
customer order → אביאם/ניתאי approval deducts approver stock → kibbutz + creates a real EMS `אספקת ציוד` task +
keeps the row; EMS-bubble routing). **Not built** — awaiting go-ahead + per-kibbutz EMS site mapping.
*(The low-stock-twice bug from that batch is already fixed & live in ·43.)*

### ⛔ THE next action — live priorities/status (one step left)
The function's **`GH_TOKEN` must have the `project` scope**. Steps: GitHub → **classic** token with
**`repo` + `read:org` + `project`** (SSO-authorize for Sigmatec-Energy) → set as the **`GH_TOKEN`** secret in
Supabase → **redeploy the `github` function**. Until then priority/status are empty (GRACEFUL — tickets still load).
*Proven:* the function returns 125 tickets fast (pagination OK) and the GraphQL query is correct via `gh`
(returns גבוה / In Progress) — **only the token scope is missing.**

### Other pending (user/admin)
- **Supabase MCP** — already added to `~/.claude.json` → `mcp.mcpServers.supabase` (http, project_ref=wwqfcajnxinaxmobrgol).
  This machine runs Claude in the **desktop app** (no `claude` CLI), so don't use `claude mcp add`. Activate:
  **fully quit + reopen the desktop app → `/mcp` → authenticate** (Supabase OAuth). Then a session can deploy functions / read logs / run SQL directly. Backup of config at `~/.claude.json.bak`.
- **Calendar** — Workspace **Domain-Wide Delegation** (admin authorizes the SA `client_id` for `calendar`).
- **Rotate `service_role`** (exposed in chat) — coordinated JWT-secret roll (roll secret → update `ems-auth` `JWT_SECRET` + redeploy → I swap the new anon key).
- **Dev-tasks editing (phase 2)** — write-capable token to set priority/sprint from the app.

See [backlog.md](backlog.md) · [CHANGELOG.md](CHANGELOG.md) · [RECOMMENDATIONS-he.md](RECOMMENDATIONS-he.md).
