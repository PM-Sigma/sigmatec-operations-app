# Upcoming / Backlog — Sigmatec Operations App
_Last updated: 2026-06-22_

## ✅ Shipped
- Supabase backend (cutover), installable PWA on GitHub Pages, modular code (`js/src/*` + `build.mjs`), real icon, **EMS login gate** (default-on, 2FA, `?login=0` break-glass, logout), install button, one-click "📅 ליומן שלי" on calendar events, auto cache-bust on every build.

## 🔄 In progress / awaiting input
- **#4 Security hardening** — Supabase Edge Function that validates the EMS token → issues a DB session + tightened RLS (staged rollout). *Awaiting decision: (A) full bridge or (B) pragmatic interim.* Needs you to deploy the Edge Function + run one SQL.
- **#2 Full QA pass** — walk every area (cards/status, inventory/stock/orders/movements, attendance, EMS, calendar, reports, search) + fix.
- **#6 Office calendar** (`information@sigmatec-energy.com`) read+write — awaiting: share calendar (edit) + send the **Calendar ID**.
- **#8 EMS meter names + links** — awaiting the EMS **meters endpoint** + the **meter-page URL** pattern.
- **Rotate the Supabase `service_role` key** (your action, Supabase → Settings → API).

## 🆕 New requests (2026-06-22)
1. **Stats page — fix + interactive redesign.** Current `stats` page is clipped / looks broken / shows question-marks (likely a charset/font/RTL + overflow issue). Rebuild as an **interactive** page: **by domain** (תחומים) and **by time period** (חלוקה לזמנים). Data already in Supabase (visits, movements, attendance, tasks); use a light chart lib (Chart.js via CDN) or SVG. First fix the encoding/RTL/clipping, then add the interactive filters.
2. **Employee-management page — עידן + עמיחי ONLY** (gated by identity). Per-employee:
   - Progress overview.
   - **System usage by actions performed** (who did what — derivable now from `visit.visitor`, `task.editor`/`lastModified`, `attendance.person`; a proper audit log is a later upgrade).
   - **Upcoming vacations** (from attendance day-types).
   - **Task load + per-employee task breakdown** (EMS assignee + Sheet/Supabase task owners).
   - **Leave a message for an employee** → shown when they open the app. *Needs a new Supabase `messages` table `{id, to_person, text, from_person, created_at, read_at}` + a login-time "unread messages" popup.*
3. **EMS-login bubble on the main page** — its own bubble showing **EMS connection status + connect/reconnect** (covers token expiry + PIN break-glass users). Note: with the EMS-login gate, a normal login already connects EMS, so this is a *status/reconnect* affordance, not a second login.

## Notes / feasibility
- Employee-mgmt visibility gate: reuse `isIdan()` + add an "amichai" check (identity = עמיחי) → a small `canManageStaff()`.
- Messages popup: check unread for `getCurrentUser()` on load (after the login gate), mark read on view.
- Stats interactivity: filters for domain + date-range drive Chart.js datasets recomputed client-side from the Supabase snapshot.
