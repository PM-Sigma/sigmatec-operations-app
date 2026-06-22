# Backlog & status

_Update this file as things move. Session-by-session history lives in claude-mem._

## 🔴 Current blocker

- **#4 Security — wrong `JWT_SECRET` value.** Function now mints a token (✅), but Supabase
  rejects it: `None of the keys was able to decode the JWT` → the value in `JWT_SECRET` is **not**
  the project's legacy JWT signing secret (non-empty but wrong). **Action:** set `JWT_SECRET`
  = the **Legacy JWT Secret** (Settings → JWT Keys → Legacy JWT Secret → Reveal; a plain string,
  *not* an `eyJ…` token) → redeploy → re-test (expect `mint=OK | rest=[200]`). Then `🔒 pass
  active` → STEP 2 lockdown → rotate keys.

## 🟡 Pending

1. **#4 — bridge VERIFIED ✅** (JWT_SECRET = Legacy JWT Secret; mint→RLS 200; `🔒 pass active`).
   NEXT: **STEP 2 write-lockdown** (anon read-only, auth-only writes). Then full read-lockdown
   (after bridging `stats.html` + bridge-token auto-refresh), then rotate `service_role`.
2. **Calendar (service account):** finish GCP service-account setup → deploy `calendar` Edge
   Function → wire read+add UI (needs EMS up to test the token gate). *Apps Script path dropped —
   Workspace blocks public web apps.*
3. **Visit-documentation bubble** — fixes (awaiting specifics from user).
4. **Employee-management page** (עידן + עמיחי only): per-person progress, system-usage by actions,
   upcoming vacations, task load + breakdown, leave-a-message-on-login (needs a `messages` table).
5. **EMS connection bubble** on the main page.
6. **QA pass** + delete old gist + clean duplicate Sheet rows.

## 🟢 Done (recent)

- Full migration Google Sheets → **Supabase** (verified read parity).
- **Module split** of the monolith into `js/src/*.js` + `build.mjs`.
- **PWA**: manifest, network-first SW, install button, cache-busting.
- **EMS login gate** (email/password + 2FA) as the app gate; badge = logout.
- **Meters** on EMS tasks (⚡/💧 + serial + admin link).
- One-click **"add to my calendar"** links on calendar events.
- **Auth bridge** (`ems-auth` + `USE_SB_BRIDGE`, self-verifying, anon fallback) + STEP 1 RLS.
- This **`docs/` memory system**.
- **Stats page** rendering fix (fonts/RTL/clipping) + interactive time-period & region filters.
