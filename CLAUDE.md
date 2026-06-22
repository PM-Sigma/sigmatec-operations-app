# Sigmatec Operations App — project instructions

The **active** project: installable PWA + Supabase backend. Live: https://pm-sigma.github.io/sigmatec-operations-app/

## On session start
Read **`docs/INDEX.md`** first — it's the memory index, and its **🚦 Current state** section says
exactly where we left off. Then `docs/backlog.md` (blocker/pending) and `docs/CHANGELOG.md` (recent
changes). Load other `docs/*` only as the task needs. Full session history is in claude-mem (`mem-search`).

## Workflow — keep this true
- Edit `js/src/*.js` → run `node build.mjs` (concatenates → `js/app.js` + version stamp) → commit.
  **Never edit `js/app.js` directly.**
- `main` = live (GitHub Pages auto-deploys). `dev` = work-in-progress; preview via
  `raw.githack.com/PM-Sigma/sigmatec-operations-app/dev/…`; merge `dev`→`main` (fast-forward) when verified.
- Test flags: `?login=0` (skip EMS gate), `?sb=0` (mock data).

## Memory contract (do this at EVERY checkpoint — end of a feature or a chunk of work)
1. Add a `docs/CHANGELOG.md` entry (what + why).
2. Update `docs/backlog.md` (blocker / pending / done).
3. Refresh the **🚦 Current state** block in `docs/INDEX.md` so a fresh session can resume cold.

## Conventions
- Secrets never in the repo or client bundle. The `service_role` key was exposed in chat → rotate it.
- Respond to the user in **English**; keep dashboard data terms/owner names in Hebrew
  (עידן, ניתאי, אביאם, עמיחי, מתניה, אבצן, אליה).
