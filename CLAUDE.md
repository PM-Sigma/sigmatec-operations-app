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

### Parallel-safe merge to `main` (MANDATORY — multiple sessions/agents work this repo at once)
There is NO direct channel between sessions; `origin` is the single source of truth, so coordinate
through it in real time. **Never** `git push --force` to `main`/`dev`, and never build/commit in the
shared working tree while another session has uncommitted WIP there — use an isolated **git worktree**
off `origin/main` (`git worktree add -b feat/<name> <path> origin/main`).

Before every push to `main`, run this loop:
1. `git fetch origin`. Inspect what else is live: `git worktree list`, `git branch -r`,
   `git log --oneline -1 origin/main`.
2. If `origin/main` moved past your branch's base → **rebase onto it** (`git rebase origin/main`),
   then **re-run `node build.mjs`** so generated files (`js/app.js`, `?v=` stamps, SW cache name) are
   regenerated on top of the other session's work instead of conflicting.
3. Read the latest `VERSION` on `origin/main` BEFORE bumping, so version numbers don't collide
   (two sessions bumping independently is how 1.47 and 1.49/1.50 diverged — avoid it).
4. Push **ff-only**: proceed only if `origin/main` is an ancestor of your tip
   (`git merge-base --is-ancestor origin/main HEAD`); `git push origin HEAD:main`. If the push is
   rejected because `origin/main` advanced mid-flight, go back to step 1 and retry.
5. Touch only files your feature owns; leave the other session's in-flight files alone.

Production side-effects (edge-fn deploy, DB migration) follow the same rule: deploy from the
rebased-on-`origin/main` worktree so you ship on top of the other session's code, not over it.

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
