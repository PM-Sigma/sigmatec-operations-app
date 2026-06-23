# Backlog & status

_Update this file as things move. Session-by-session history lives in claude-mem._
_Full current snapshot: [INDEX.md](INDEX.md) → 🚦 Current state. Build: **·43** (2026-06-23)._

## 🔴 Current blocker — live dev-tasks priorities/status

- **`GH_TOKEN` needs the `project` scope.** The `github` Edge Function now fetches GitHub **Projects-v2**
  fields (Priority + Status) via GraphQL (·39), but the function's token can only read issues → the project
  fetch returns nothing (GRACEFUL: tickets still load, just no priority/status).
  **Action:** GitHub → **classic** token with **`repo` + `read:org` + `project`** (SSO-authorize for
  `Sigmatec-Energy`) → set as the **`GH_TOKEN`** secret in Supabase → **redeploy the `github` function** →
  reload פיתוח. *Proven working otherwise:* 125 tickets returned fast; the GraphQL query is correct via `gh`
  (returns גבוה / In Progress). Only the scope is missing.

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
6. **Inventory-flow rework (DESIGNED, not built — awaiting עידן)** — two order types (`supplier`/`customer`):
   supplier raises stock, approval routed by size (**≤10 → אביאם, >10 → עמיחי** + a floating approval alert for
   עמיחי modeled on the attendance reminder); customer order consumes stock — on **אביאם/ניתאי** approval it
   **deducts from the approver's stock → the kibbutz**, **creates a real EMS task** `אספקת ציוד` (queue a new
   `createTask` kind when offline), and keeps the inventory row. Plus: **EMS bubble** routes to in-app reconnect
   when disconnected / external site when connected. Confirmed decisions captured; needs go-ahead + EMS site
   mapping per kibbutz. *(✅ The **low-stock-twice** bug from this batch is already fixed & shipped in ·43; the
   EMS-bubble routing is still pending here.)*

## 🟢 Done (recent — see CHANGELOG for detail)

- **Low-stock "appears twice" fix (·43)**: meter shortage no longer doubles for אביאם/עמיחי (banner + company-task
  line) — they keep the banner, the line is skipped; other users keep the line. Verified per-role.
- **Morning "היום" view + remember-last-page (·42)**: new first nav page aggregating דורש-טיפול / המשימות-שלי /
  סטטוס-הקמה (role-aware, client-only); landing reopens last page same-day, lands on היום on a new day.
  (Recommendations "bottom-nav" + "dev-page 404" were stale → already done.)
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
