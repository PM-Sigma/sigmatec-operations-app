# Sigmatec Operations App — Memory Index

**Entry point for project memory.** Read this first, then load *only* the file you need.
No secrets live in these files (the repo is public). Session history & decisions live in
**claude-mem** (`mem-search` skill / `get_observations`) — these files are the *stable* reference.

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

## 🚦 Current state (update on change)

- **#4 Security — in progress.** STEP 1 RLS done. Bridge ON (self-verifying, anon fallback).
  `ems-auth` now mints a token, but Supabase rejects it (`None of the keys was able to decode the
  JWT`) → `JWT_SECRET` holds the wrong value. **Next:** set the correct **Legacy JWT Secret** →
  verify `🔒 pass active` → STEP 2 lockdown → rotate `service_role` + JWT secret.
- See [backlog.md](backlog.md) for the full list.
