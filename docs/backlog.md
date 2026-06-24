# Backlog & status

_Update this file as things move. Session-by-session history lives in claude-mem._
_Full current snapshot: [INDEX.md](INDEX.md) → 🚦 Current state. Build: **·51** (2026-06-24)._

## ⏳ Awaiting key — AI order parsing (frontend + function BUILT, ·51)
Everything is shipped and graceful; the AI lights up after **3 steps** (see `operations.md` → "Edge Function
(parse-order)"): **(1)** free Gemini key from aistudio.google.com (any account — personal Gmail if the org one
is blocked); **(2)** create the `parse-order` function (paste `supabase/functions/parse-order/index.ts`) + set
secret **`GEMINI_API_KEY`** + deploy; **(3)** run `db/parse_corrections.sql`. No other function changes. Until
then the new-order box falls back to the (weak) local matcher — no breakage.

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
4. **Dev-tasks editing (phase 2)** — a write-capable token to set Priority/Status/sprint from the app.
5. **EMS changelog → calendar** — show EMS version-release days in the יומן (needs the calendar unblocked + the
   changelog source מתניה maintains).
_(No open blockers. Inventory-flow rework is built — see Done. Remaining items are the standing admin ones:
Supabase MCP, calendar DWD, `service_role` rotation, dev-page phase-2 write token.)_

## 🟢 Done (recent — see CHANGELOG for detail)

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
