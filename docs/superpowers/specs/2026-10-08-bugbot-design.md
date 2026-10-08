# Bug bot - design (2026-10-08)

STATUS: 🟡 OPEN - code on `feat/bugbot`, NOT merged, NOT installed. Resume: MAIN applies `db/feedback_bot.sql`, deploys `push-send`, merges; עידן installs on the home server (`scripts/bugbot/INSTALL.md`).

## Goal
An always-on bot on עידן's home server. A new bug in `public.feedback` (kind='bug', status='new') is taken immediately, investigated (reproduce, root cause), fixed, and עידן gets ONLY a push: what, why, status.

## Autonomy (עידן's ruling 8.10)
| Outcome | When | Push |
|---|---|---|
| merged | small code-only fix, OUR gates green | ✅ תוקן ועלה |
| needs_approval | touches data/SQL/edge/permissions, red gates, or larger than the limit. Branch pushed (never main) + githack preview | 🟡 דורש את אישורך |
| not_reproduced | could not reproduce | ❓ לא שוחזר |
| failed | crash, timeout, no verdict | ⚠️ הבוט נכשל |

Never: applies SQL, deploys edge functions, enters passwords, touches other repos, pushes main except via the ff-only merge path.

## Architecture
- `scripts/bugbot/watch.mjs` - polls every 60 s; stale `working` rows (>2 h) are failed; single-instance lock; daily cap 10 runs / 24 h; one bug at a time; `--dry-run` claims nothing. Logs ids/counts only.
- Claim is atomic: `PATCH feedback?id=eq.X&bot_state=is.null&status=eq.new&kind=eq.bug` with `return=representation`; an empty result means someone else won.
- `scripts/bugbot/handle.mjs` - fresh worktree off origin/main (node_modules junctioned from the main clone) -> `claude -p --model sonnet` (prompt from `prompt.md` + the bug text fenced as DATA; tool allowlist; denylist for git push/commit, curl, rm, .env; 45 min timeout; env sanitised so the model never sees the bot's keys) -> `bugbot-result.json` -> handle.mjs commits, runs `build.mjs` (bumps VERSION, CHANGELOG entry), runs OUR gates -> `decideOutcome()` -> merge or branch push -> row update -> push -> cleanup.
- Gates (run by handle.mjs, not trusted from the model): `build.mjs --check`, `scripts/test-all.mjs` (includes release guards: conflict markers, `node --check sw.js`, VERSION), boot-size growth <= 2 % (ui/sigma.js + js/app.js + css/app.min.css vs origin/main). Playwright is NOT part of the autonomous gate.
- Merge decision (`lib.mjs decideOutcome`, tested): merge only if gates green AND model said `small` AND every changed path is source/test/generated (allowlist) AND no sensitive path (`db/`, `supabase/`, `*.sql`, auth/session/role/permission/gate/token/access names, package files, build.mjs, `scripts/bugbot/`) AND source diff <= 60 changed lines AND added lines contain no data writes/RPC/functions/role checks. The model's label can only make it stricter.
- Merge path: ff-only. If origin/main moved, the SOURCE patch is re-applied (3-way) on the new main, rebuilt and re-gated (max 3 tries); any failure -> needs_approval. Branch pushes use a refspec that can only name `refs/heads/bugbot-<8hex>`.
- DB: `db/feedback_bot.sql` (bot_state/bot_note/bot_branch/bot_at). Clients read via the existing select policy; only service_role writes.
- Push: additive mode `bugbot` in `push-send` (X-Cron-Key auth, recipient fixed = עידן, title/body built server-side by `push-send/bugbot.js`). Tap opens `#feedback-inbox?id=<id>`.
- UI: `FeedbackInbox.tsx` shows the status chip on the row; the detail shows note + branch link (only `bugbot-<8hex>` is linkable). Deep link by id supported.

## Tests
`test-bugbot.mjs` (claim, cap, verdict parser, path classes, decision matrix, push payload, env/redact), vitest (`feedback.test.ts`, `FeedbackInbox.test.tsx`), Playwright `feedback-bot-chip.spec.ts` (360 light + dark).

## Known limits
- End-to-end run with a real `claude` was not exercised on the build machine (it would push to origin). First install: run `--dry-run`, then enable with one real test bug.
- The model has Read access to the disk; the .env is denied by rule and the child env is sanitised, but keep the server's `.env` outside any worktree (default `scripts/bugbot/.env` is in the main clone, not the worktrees).
- Bug text is written by staff: treated as data (fenced); the allowlist + OUR diff checks are the real protection.
