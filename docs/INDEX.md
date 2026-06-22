# Sigmatec Operations App — Memory Index

**Entry point for project memory.** Read this first, then load *only* the file you need.
No secrets live in these files (the repo is public). Session history & decisions live in
**claude-mem** (`mem-search` skill / `get_observations`) — these files are the *stable* reference.

---

## ▶️ RESUME A SESSION (read this to continue)

New session? Read **in this order**, then pick up from **🚦 Current state** (bottom of this file):
1. `docs/INDEX.md` (this file) — map + current state.
2. `docs/backlog.md` — current blocker + pending/done.
3. `docs/CHANGELOG.md` — what changed recently.
4. The specific `docs/*` file for the task (see the table below).

> Tell a fresh session: **"קרא את docs/INDEX.md בפרויקט Sigmatec Operations App והמשך מאיפה שעצרנו"**
> — or just the trigger phrase **"סשן חדש של הדשבורד"** (wired into the global memory rule).

---

## 📁 Files (load on demand)

| File | When to read it |
|------|-----------------|
| [architecture.md](architecture.md) | How the whole system fits together: PWA ↔ Supabase ↔ Apps Script ↔ EMS. Start here. |
| [modules.md](modules.md) | What every `js/src/*.js` module does + its functions. The big reference. |
| [data-and-security.md](data-and-security.md) | Supabase tables, the data layer, RLS staging, the auth bridge, key rotation, Apps Script security model. |
| [operations.md](operations.md) | Build/deploy/test, edge-function deploy, env values (URLs/IDs/accounts), test flags. |
| [backlog.md](backlog.md) | Current blocker + pending features + what's done. |
| [CHANGELOG.md](CHANGELOG.md) | Dated log of every update — what changed and why. |

**Read order for a cold start:** INDEX → architecture → backlog (current state) → then the specific file for the task.

---

## 🔄 Update protocol (every change)

1. Make the change.
2. Add an entry to [CHANGELOG.md](CHANGELOG.md) (what + why).
3. Update the relevant doc file + the current-state line in [backlog.md](backlog.md).
4. claude-mem records the session automatically — search past work with the `mem-search` skill.

---

## ⚡ Quick facts

- **Live app:** https://pm-sigma.github.io/sigmatec-operations-app/  (installable PWA)
- **Repo:** `PM-Sigma/sigmatec-operations-app` (public — client code only, no secrets)
- **Backend:** Supabase (data + REST + RLS + Edge Function) + Apps Script (EMS proxy / calendar). EMS API for tasks/meters/users.
- **Source of truth for data:** Supabase (migrated off Google Sheets).
- **Build:** edit `js/src/*.js` → `node build.mjs` → commit → push (GitHub Pages auto-deploys).
- **Owners (Hebrew, used in data):** עידן(IDAN), ניתאי(NITAY), אביאם(AVIEM), עמיחי(AMIHAHI), מתניה(MATANIA), אבצן(IVZAN), אליה.
- **Attendance people:** אביאם, ניתאי. **Admin role:** עידן.

## 🚦 Current state (updated at every checkpoint) — last: 2026-06-22, EMS back online

**Branches:** `main` = live (Stats shipped). `dev` = ahead by the **employee page + changelog**,
verified on preview, **not yet merged**.

**In flight:**
- **#4 Security — bridge VERIFIED ✅:** `JWT_SECRET` = the **Legacy JWT Secret**; `ems-auth` mints an
  `authenticated` token, Supabase accepts it (mint→RLS = 200), and the on-load bridge auto-activates
  (`🔒 Supabase pass active`). NEXT: run **STEP 2 write-lockdown** (anon read-only, auth-only writes).
  Full *read*-lockdown later (after bridging `stats.html` + adding bridge-token auto-refresh). Then rotate `service_role` (E).
- **Employee page** (`js/src/17-staff.js`, gated עידן+עמיחי): built + verified on `dev`. Awaiting
  the `messages` table SQL + a real EMS-login test, then merge to `main`.
- **Calendar:** `supabase/functions/calendar` (service account, EMS-gated) written. Awaiting GCP
  setup (service account + share `information@` calendar + secrets `GCAL_*` + deploy), then test + wire UI.

**Waiting on the user:** (A) set Legacy JWT Secret · (B) run `messages` SQL · (C) GCP calendar setup ·
(D) visit-doc bubble specifics · (E) rotate `service_role` after #4.

See [backlog.md](backlog.md) for the full list.
