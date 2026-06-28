# Backlog & status

_Update this file as things move. Session-by-session history lives in claude-mem._
_Full current snapshot: [INDEX.md](INDEX.md) → 🚦 Current state. Build: **·95 on dev** / **·94 on main** (2026-06-25)._

## 🔴 Release `dev`→`main` — bundle ·91–·95
**What's waiting on `dev` (not yet live):**
- ·95 — Approved-order notifications for אביאם/ניתאי/עמיחי (localStorage seen-set, no schema change)
- ·92 — Dev-page tree hierarchy restored in status board + tree-aware multi-select
- ·91 — Orders actions column header "פעולות על ההזמנה — שנה סטטוס ל:" + left-align
- ·89/·87/·86/·82/·81 — Sprint-board feature set (all already on dev since ·94 but bundled here)

**Command (fast-forward, safe):**
```bash
git fetch origin -q && git push origin origin/dev:main
```
GitHub Pages deploys in ~1–2 min. No migration needed.

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

- 🧑‍💻 **Dev-page: statistics page** — עידן's next ask. The new `dev_status_log` table (first-day-per-stage per ticket)
  is the data source: time-in-stage, cycle time, throughput per sprint, aging in Backlog/Review. Build on the Stats page.
- 🧑‍💻 **Dev-page board grouping (optional revisit)** — the status board groups each whole tree by its **root's** stage,
  so a sub-task's own status doesn't place it in its own column (it nests under its parent's column with a status badge).
  Per "keep the hierarchy" this is intended; revisit only if עידן wants sub-tasks to also surface by their own status.
- 📦 **EMS/inventory: `ems_cache` RLS 401 on login** — `emsOnConnected → emsSyncCache` upserts `ems_cache` as anon →
  RLS reject (seen repeatedly in console). Likely needs the authenticated Supabase pass before the write (cf. the
  ·36 saves fix in `01-data.js`). **Inventory/EMS lane** — not the dev-page lane.

## 🟢 Done (recent — see CHANGELOG for detail)

- **Dev sprint board: per-ticket placement (·97):** the board bucketed whole trees by the **root's** stage, so
  pushing a **child** to a sprint changed its GitHub status but the card didn't visibly move, and column counts
  (=roots) didn't match the cards shown (=subtrees). Now every ticket sits in **its own** status column (flat
  cards, accurate counts); the full tree stays in "לפי נושא". Parent-cascade removed (each card selectable
  directly) — also kills the epic-demotion bug. On `dev` (·97), pending release. `test-devboard.mjs`.

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
