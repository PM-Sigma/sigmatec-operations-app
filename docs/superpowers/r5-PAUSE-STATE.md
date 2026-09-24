# Round 5: pause state (24.9.2026), resume from here with no gaps

**Paused at the request of עידן** (he needs the machine and quota for the workday). Every agent stopped at a commit with a clean worktree, and nothing is half-applied in production. **The freeze is still on**: only עידן and עמיחי get in.

To resume, say "המשך סבב 5". Read this file, then `docs/superpowers/specs/2026-09-23-round-5-design.md` (plan, rulings, weights, standing authority) and `docs/reports/2026-09-23-r5-decisions-log.md`.

## Progress: about 52%

## Already on `main` (all passed an audit and tests)
| Package | What | Production |
|---|---|---|
| 0 | freeze | live |
| 1 | cleanup, breakpoint, backups | live |
| A-L, K-L, S-L, C-L, M-L, D-L, G-L | logic layers | C: `cal_peer_tasks` migration + `calendar` deploy · D: `github` deploy |
| V-L | visit editor and attendance rules | `attendance.source` + backfill of 54 rows + edit-lock trigger + push-send deploy |
| DOC-0 | documentation tooling | — (coverage checks warn-only until DOCS_STRICT=1) |
| S-P0 | fix for pages wider than the phone + `no-page-overflow.spec` (not waivable) | live |

## Open branches: exactly where each stopped
| Branch / worktree | Status | Next step on resume |
|---|---|---|
| `r9/DS` · `SigmatecOps-r9-DS` (design system) | designer confirm = NOT PASS (9/13). This round fixed 8 more items (commit 1f422410) | ① re-record both motion videos on the new Sheet (Settings / ⋯ עוד) with `qa/playwright/capture-motion.mjs` ② extend the sweep: horizontal scroll can't be waived by the allow-list, check the fixed nav and that elements stay inside their card, show home's collision at 360 ③ rebase onto origin/main ④ regenerate the signoff-phase2 evidence ⑤ npm test ⑥ send to the designer to check the gallery (option B), then merge. **Blocks every screen layer.** |
| `r9/X-L` · `SigmatecOps-r9-X-L` (security) | rebased onto main; none of the re-check's 4 must-fixes done | ① install/find `deno`, then `deno check` ems-auth, push-send, github (fix TS2345 in push-send/index.ts:494) ② two GitHub write callers still send the anon key: `js/src/18-dev-tasks.js:903-907`, `FeedbackInbox.tsx:71-78` ③ **seed only `@sigmatec-energy.com`** (otherwise a customer named עידן gets admin), and abort on a name that appears twice ④ constant-time cron compare ⑤ `iss` check + neutral wording ⑥ npm test, a short audit, then production in the runbook below |
| `r9/R-L` · `SigmatecOps-r9-R-L` (every other screen, logic) | L1–L7 done and green (1859 vitest, gaps/feedback Playwright 44/44), **not audited yet** | Opus audit, then merge |
| `r9/I-L` · `SigmatecOps-r9-I-L` (inventory, logic) | 10/11 tasks; audit = FAIL | fixes: ① the delete RPC fails on August visits because of the lock trigger (**question for עידן: does a full delete override the lock?** default until he answers: skip locked visits and show them as kept in the preview) ② EXECUTE stays revoked from `authenticated` (Fable runs the one delete of the empty item via SQL) ③ in-file backup and rollback ④ fix the SQL test (movements alert trigger) ⑤ stock goldens with opening_balance rows ⑥ forward `expectedDate` ⑦ block double delivery on the save path too ⑧ trims. L6 = the minimal version only (SigmaInv in the bundle, `certDocHtml` and `computeStock` pointed at it). Then a re-audit and merge |
| `r9/A-L` | merged; A-L5 remains (waited for V, which is now merged) | A-L5 |

## Production steps still ahead
1. **V:** re-run `db/attendance_visit_backfill.sql` (idempotent) on 25.9, to catch visits saved from phones still running the old version.
2. **X (after the fixes and a re-audit), in this order:**
   1. backup
   2. `db/staff_identities.sql` plus the reviewed seed
   3. deploy ems-auth
   4. ship the client, then wait ≥180 min. Precheck: `identity-missing` = 0
   5. `db/rls_viewer_readonly.sql`
   6. `db/rls_person_scoped.sql`, then the verify queries for אביאם, עמיחי and viewer
   7. deploy push-send, then github, then verify 401/403/200
3. **I:** delete only the empty item, after the fixes.

## After the logic layers: screens (U) for every package
Blocked on the design system's PASS. Order: S-U, then K-U and V-U, then the rest in parallel, ~6 agents at once (quota). Every package passes its gate before merge: Opus audit, the designer's PASS (360/412 light and dark), impeccable per rule, no-overlap + no-page-overflow + axe, Playwright on 4 projects plus mobile-360, a graph update. **Every package that changes visible text updates its Playwright tests in the same commit.**

## End of the round
DOC-1 (write the docs, `DOCS_STRICT=1`), DOC-2 (Sonnet re-extracts the graph, Opus audits it), a full QA check, the decisions table for עידן, and a stop for עידן's phone QA before the unfreeze.

## Open questions for עידן (don't block the resume)
- A full item delete versus the lock on past data (see I above).
- Adding to CLAUDE.md: "every feature updates its module doc".
