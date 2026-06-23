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

## 🚦 Current state — last: 2026-06-23 (build ·33)

> **Recent (·30→·33):** auto-incrementing **version stamp** in the footer · home page renamed
> **"דף הבית"** (🏠) · footer RTL bidi fix · EMS bubble → **🟢 מחובר ל-EMS / 🔴 אין חיבור ל-EMS** ·
> **dev-page redesign** (centered column + 3-level nested-rail hierarchy + mobile-first) ·
> **mobile QA pass** (·33): my-tasks bar visibility, attendance-table scroller, sticky matrix column,
> ≥40px tap targets, comment-hint on touch — verified at 375px (no overflow) + desktop unregressed.
> **Mobile test rig:** `python -m http.server` on the project + Preview's mobile preset (Chrome-tab viewport
> can't shrink) — see `.claude/launch.json` (name "sigmatec").


**Everything below is LIVE on `main` + verified:** Supabase migration · PWA · EMS login gate · meters ·
"add to calendar" links · **security bridge + STEP 2 write-lockdown + messages-privacy** (anon = read-only,
auth = write; messages auth-only) · **Stats** (fixed + interactive) · **Employee page** (role-based: עידן=go-live
pipeline, אביאם/ניתאי=field, מתניה=dev/office; gated עידן+עמיחי) · **Dev-tasks page** (`18-dev-tasks.js`, gated) ·
**EMS connection bubble** (status + link) · visit-doc **FAB gated to field staff** · main-page declutter ·
access/roles (עמיחי=all, מתניה no inventory, meeting-mode+attendance עידן-scoped) · 502 login message · meter PM135 fix · Aviam controllers corrected.
Bridge re-verified active after fresh login (`_sbToken` present).

**⛔ Blocked on the user (documented in [RECOMMENDATIONS-he.md](RECOMMENDATIONS-he.md) + below):**
- **Dev-tasks — WORKING ✅** (token authorized). The `github` function pulls 100+ live tickets; the פיתוח page
  groups them by **topic → sub-topic** (parsed from the title `נושא | תת-נושא | תיאור`). Minor: redeploy the
  `github` function to pick up **pagination** (currently capped at 100 issues).
- **Calendar** — needs Workspace **Domain-Wide Delegation** (admin authorizes the SA `client_id` for
  `calendar` scope), then I add a `sub` impersonation claim + wire the יומן UI. (Org blocks public Apps Script + SA calendar-sharing.)
- **Dev-tasks editing (phase 2)** — needs a write-capable GitHub token (toggle priority/sprint labels).
- **Rotate `service_role`** (exposed in chat) — last security follow-up.

See [backlog.md](backlog.md) + [RECOMMENDATIONS-he.md](RECOMMENDATIONS-he.md).
