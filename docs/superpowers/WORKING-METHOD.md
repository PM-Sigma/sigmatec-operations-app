# Sigmatec Operations — working method (עידן 29.9, binding)

## Roles
- **This session = MAIN session of the app.** עידן manages all other sessions from here. Every other session (e.g. "Build external meter-readings fetch feature (Hulda)") reports its branch here; MAIN merges.
- **Opus 5.5 (MAIN)**: integration, planning, specs, final checks (audits, merge gates), production steps, merges to main.
- **Sonnet 5.5**: all execution — building, fixing, tests, evidence, designer-style reviews, performance checks. Maximise Sonnet; Opus only where judgement/integration is needed.
- **Fable: OUT** (not used at all for now).

## Budget
- Work until **85% weekly**; then stop cleanly and wait for עידן to say whether to continue to 100%.
- Check `get_usage` between merges. At ~83%: clean-stop routine (every agent commits `wip(...)` + NEXT, update resume + work log).

## Flow per change
1. Worktree off origin/main, created by MAIN (`git worktree add -b r9/<name> ../SigmatecOps-r9-<name> origin/main`).
2. One small, well-scoped task per Sonnet agent: "do the work yourself, no sub-agents, no follow-up task suggestions, commit after each step".
3. Gate before merge: `node scripts/test-all.mjs` green + the affected Playwright specs on a private port (never kill node.exe; revert port to 8124) + evidence captured INSIDE the asserting test (dark via storage theme).
4. **Real-data risk**: mock-only tests missed a real-data break (27.9). Any change to home/cards/lists must be tested with a real-size fixture.
5. Audit (Sonnet reviewer; Opus only for security/prod/data) → merge by MAIN.
6. Merge method: `git merge origin/main`; generated files → rebuild (`node build.mjs` + `node scripts/integration-map.mjs`); index.html → CR-normalised `git merge-file`, then `comm` ids vs origin/main (none lost except deliberately retired).
7. **Before every push**: `git grep -n "^<<<<<<< \|^>>>>>>> "` must be empty and `node --check sw.js` must pass (27.9: markers reached prod in VERSION + sw.js).
8. After each merge: graph rebuild (`python docs/ops-graph/rebuild.py`), and a line in the work log `docs/reports/2026-09-27-work-log-and-issues.md` (עידן: document ALL work, fixes and issues).
9. Checkpoint docs (CHANGELOG, backlog, INDEX Current state) after each chunk.

## Standing rules (unchanged)
Never change another repo · repo PUBLIC (no secrets/real IPs/row data) · never enter passwords · prod changes only after audit + backup + rollback + CHANGELOG · respond in English, Hebrew UI terms.

## Merge rule (29.9, after #emsstats-view was dropped)
- `index.html` is NEVER resolved with `--theirs`. Before merging, run `git diff $(git merge-base HEAD origin/main) HEAD -- index.html | grep -v "v="`: if the branch has real changes, 3-way it (`git merge-file`), keep both, and take only the version stamps from main. `test-html-structure.mjs` + the release guards catch a missing view container.
