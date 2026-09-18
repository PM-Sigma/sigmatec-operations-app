# סיגמה 2.00 — phased execution plan (token-safe, minimal dependencies)

Written 18.9.26 on עידן's instruction: "חלק את הפיתוח לשלבים עם תלות מינימלית כך שאם נגמרים הטוקנים זה לא פוגע בפיתוח".
Deadline: **end of Monday 21.9.26** (target: Friday morning). Budget rule: regular usage only, no credits; when the 5-hour
window is exhausted the controller stops, writes the ledger, and schedules a resume task (`scheduled-tasks`) for when the
window reopens. Every phase ends in a state that is shippable on its own; a phase never leaves the branch half-migrated.

## Method (unchanged, made explicit)
- Subagent-driven development: one implementer per task (Opus for judgment/multi-file, Sonnet for mechanical/re-skin),
  one task reviewer (Opus for security/data, Sonnet otherwise), one scoped re-reviewer (Sonnet), ledger in
  `.superpowers/sdd/2026-09-17-kibbutz-cards-redesign/progress.md`. Controller never edits code.
- **Quality gates per task (עידן 18.9, binding — a task is not "done" until all pass locally, offline):**
  1. `gitleaks detect` on the working tree and `gitleaks protect --staged` before every commit → 0 findings.
  2. `semgrep` (`p/default` + `p/owasp-top-ten` + `p/typescript` + `p/javascript`, offline rules cache) → 0 ERROR/WARNING.
  3. Playwright e2e for the feature at **desktop 1440×900 and mobile 390×844**, light + dark, RTL, run against the local
     static server with `?login=0&sb=0` mock mode (no prod writes) → green; screenshots saved under `qa/playwright/shots/`.
  4. Lighthouse CI on the changed page (mobile preset): performance ≥ 85, accessibility ≥ 95, best-practices ≥ 95.
  5. OWASP ZAP baseline against the local server (passive) → 0 High/Medium; full scan before release only.
  6. Existing suites: `npm test` (legacy runners + vitest) green.
  All tool configs and outputs live under **`qa/`** (`qa/gitleaks/`, `qa/semgrep/`, `qa/playwright/`, `qa/lighthouse/`,
  `qa/zap/`) with one runner `npm run qa` that executes 1–6 and writes `qa/reports/<date>-<task>.md`.
- **Blocking on עידן:** his manual steps are collected at the end (`docs/HANDOFF-עידן.md`, ADHD-simple, one action per line
  with a link). If a step blocks progress *now*, the controller sends a phone alert (push + remote control) titled
  **"חייב את ההתערבות שלך כדי להמשיך"** with exactly one instruction, and continues with non-blocked work.
- **Access:** production (`main`) is put into maintenance mode at the start of P1 (`maintenance.html`, one commit) and
  restored only by the release task.

## Phases (each independent of the next; order chosen so the earliest phases carry the most value)

| Phase | Tasks | Value if we stop here | Depends on |
|-------|-------|-----------------------|------------|
| **P0 — Gates & maintenance** | 22 (QA infra), maintenance mode on `main` | Nothing ships without gates; app offline for users as requested | — |
| **P1 — Security & field core** | 21 (session), 5 (arrival+briefing+push), 6b (Whisper live) | Field workers have the full daily loop, secure | P0 |
| **P2 — Calendar & tasks** | 13 (calendar), 14 (list view + retirements per coverage audit), 12 (attendance + holidays) | Planning and attendance complete | P1 |
| **P3 — Dev & analytics surfaces** | 11 (dev page), 20 (stale-while-revalidate + PC refresh), 15 (settings/gaps) | Dev team + gaps | P1 |
| **P4 — AI & meetings** | 16 (day-log AI), company-process tasks (to be planned: meeting mode, internal tasks, PM inbox-lite, onboarding, health v1, hours) | PM/CEO loop | P2, P3 |
| **P5 — Sweep & release** | 18 (integration sweep + EmsGateway), 19 (SRS), 7 (release 2.00, restore access) | Shippable, documented | all above |
| **P6 — Inventory** | 8, 9, 10 (ships as 2.01) | Unified stock | P5 |

Rules: a phase starts only when the previous phase's tasks are review-clean; inside a phase tasks run sequentially (single
worktree). If the budget window closes mid-task, the implementer's report file + uncommitted tree are the resume point; the
resume task's first step is `git status` + reading the ledger's last line.

## Decisions folded in (18.9)
- G5: **no email sending from the app at this stage** — "שתף" copies text only; mail/WhatsApp export dropped.
- Playwright tests are part of every task's Definition of Done from P0 on; earlier tasks (0–4, 6, 17) get their Playwright
  coverage in Task 22's backfill list (one spec per island).
