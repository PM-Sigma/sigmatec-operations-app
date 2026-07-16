# Sigmatec Operations App — project instructions

The **active** project: installable PWA + Supabase backend. Live: https://pm-sigma.github.io/sigmatec-operations-app/

## On session start
Read **`docs/INDEX.md`** first — it's the memory index, and its **🚦 Current state** section says
exactly where we left off. Then `docs/backlog.md` (blocker/pending) and `docs/CHANGELOG.md` (recent
changes). Load other `docs/*` only as the task needs. Full session history is in claude-mem (`mem-search`).

## Workflow — keep this true
- Edit `js/src/*.js` → run `node build.mjs` (concatenates → `js/app.js` + version stamp) → commit.
  **Never edit `js/app.js` directly.**
- **One feature = one branch.** Cut `feat/<name>` from `dev`, build + test THERE, then merge
  `feat/<name>`→`dev`. Never work a feature directly on `dev`/`main`. Don't commit another feature's
  WIP files (e.g. an in-progress spec) — they stay only on their own branch.
- `main` = live (GitHub Pages auto-deploys). `dev` = integration; preview via
  `raw.githack.com/PM-Sigma/sigmatec-operations-app/dev/…`. Ship path: `feat`→`dev`→`main`
  (fast-forward) once verified.
- Test flags: `?login=0` (skip EMS gate), `?sb=0` (mock data).

## Testing — MANDATORY for every feature
Follow **`docs/testing-methodology.md`**: pure builders + golden fixtures + contract sweeps +
file round-trip + role-gating matrix; one full-suite runner per feature, **loop until green**;
one manual smoke at release, recorded in the CHANGELOG.

## Memory contract — MANDATORY for every feature on this app

**Per feature (non-trivial work): always write a spec.** Before building, brainstorm → write a spec
to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit it. The spec is the feature's
memory — a fresh session must be able to resume from it alone.

**When a feature PAUSES mid-way (not shipped):** the process must never be silently lost.
1. Add a `STATUS: 🟡 OPEN — NOT built` header to the spec with the exact resume steps.
2. Add a `🟡 IN PROGRESS` line at the top of `docs/backlog.md` linking the spec.
No CHANGELOG entry yet — nothing shipped, so nothing to log.

**At EVERY checkpoint (feature shipped or a real chunk done):**
1. Add a `docs/CHANGELOG.md` entry (what + why).
2. Update `docs/backlog.md` (blocker / pending / done — flip the feature's 🟡 to ✅/remove).
3. Refresh the **🚦 Current state** block in `docs/INDEX.md` so a fresh session can resume cold.
4. Flip the spec's STATUS header to `✅ SHIPPED` (or delete it).

## Conventions
- Secrets never in the repo or client bundle. The `service_role` key was exposed in chat → rotate it.
- Respond to the user in **English**; keep dashboard data terms/owner names in Hebrew
  (עידן, ניתאי, אביאם, עמיחי, מתניה, אבצן, אליה).
