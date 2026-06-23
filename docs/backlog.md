# Backlog & status

_Update this file as things move. Session-by-session history lives in claude-mem._
_Full current snapshot: [INDEX.md](INDEX.md) → 🚦 Current state. Build: **·40** (2026-06-23)._

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

## 🟢 Done (recent — see CHANGELOG for detail)

- **Dev-tasks page**: 3-level collapsible tree (topic→אב→בן→detail+body), explicit GitHub button,
  **Projects-v2 Priority+Status via GraphQL**, "בפיתוח עכשיו" by real Status, search/jump chips, mobile-first.
- **Saves fix**: write shim re-mints the auth pass before every upsert → no more "נשמר מקומית" (·36).
- **Mobile QA pass** (≤768px): no overflow, ≥40px targets, my-tasks/attendance/matrix fixes (·33).
- **Version stamp** auto-increments in the footer; home renamed **"דף הבית"**; EMS bubble wording; footer RTL fix.
- **"שמור לגיליון" → "שמור"** (buttons + toasts); removed obsolete company-tasks "שלח לעידן" workaround.
- **Hang prevention**: function fetch timeouts + client 20s timeout + 🔄 retry.
- Earlier: Supabase migration · PWA · EMS login gate · security bridge + write-lockdown + messages-privacy ·
  Stats page · role-based Employee page · meters · "add to calendar" links · module split + build.
