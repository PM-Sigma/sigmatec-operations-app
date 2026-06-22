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

1. **#4 finish:** verify pass active → **STEP 2 RLS lockdown** (`db/rls_staged.sql`) → **rotate
   `service_role` + JWT secret** → update anon key in `01-data.js` if it changes.
2. **Option B calendar:** add a **shared-secret** check to `appsscript/ems-calendar-backend.gs`,
   deploy under `information@sigmatec-energy.com`, run `authorizeOnce`, send `/exec` URL → repoint
   `SHEET_API`, wire calendar read+add UI, retire the legacy personal-Gmail script + old gist.
3. **Stats page** (`stats.html`): fix clipping / RTL / question-marks; rebuild interactive
   (by domain + by time period).
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
