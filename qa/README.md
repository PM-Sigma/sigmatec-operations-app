# `qa/` — the quality gates

Six gates, one command, all local and offline after the first install.

```bash
npm run qa                      # all six, report → qa/reports/<date>-manual.md
npm run qa -- --label task-23   # …→ qa/reports/<date>-task-23.md
npm run qa -- --only semgrep    # one gate (repeatable)
npm run qa -- --skip lighthouse # everything but that one
```

`npm run qa` exits **non-zero if any gate fails**. The ZAP baseline is the only gate that may be
`SKIPPED`, and only when Docker is absent — it says so in the console and in the report, never
silently.

| # | Gate | Threshold | Config |
|---|------|-----------|--------|
| 0 | build freshness | generated CSS matches its sources · the runner still fails when it should | `build.mjs --check` · `scripts/qa.selftest.mjs` |
| 1 | gitleaks | 0 findings | `qa/gitleaks/.gitleaks.toml` |
| 2 | semgrep | 0 ERROR / 0 WARNING | `qa/semgrep/config.yml` |
| 3 | `npm test` | legacy `test-*.mjs` + app vitest green | `scripts/test-all.mjs` |
| 4 | Playwright | 4 projects green, no console errors | `qa/playwright/playwright.config.ts` |
| 5 | Lighthouse | perf ≥ 85 · a11y ≥ 95 · best-practices ≥ 95 | `qa/lighthouse/lighthouserc.json` |
| 6 | ZAP baseline | 0 High / 0 Medium (passive) | `qa/zap/baseline.ps1` / `.sh` |

**Definition of Done for every task:** `npm run qa` green + the reviewer can read
`qa/reports/<date>-task-N.md`.

---

## Install (Windows 11 · node 24 · npm 11 · python 3.12 — the machine this was built on)

```bash
# 0. node deps for gates 3–5 (Playwright, Lighthouse CI)
npm install
npx playwright install chromium          # ~115 MB, once per machine

# 1. gitleaks — the release binary, into qa/bin/ (gitignored)
curl -sL -o gl.zip https://github.com/gitleaks/gitleaks/releases/download/v8.28.0/gitleaks_8.28.0_windows_x64.zip
unzip -o gl.zip -d qa/bin && rm gl.zip
qa/bin/gitleaks.exe version              # → 8.28.0
#    alternative: winget install --id Gitleaks.Gitleaks -e   (then it is on PATH)

# 2. semgrep
pip install semgrep
semgrep --version                        # → 1.177.0
```

**Semgrep on Windows** works natively from the PyPI wheel (verified 18.9.26, 1.177.0 — it runs
`semgrep-core` and scans js/ts/html/generic without WSL). If a future version drops the Windows
wheel, in order of preference:

1. `pipx install semgrep` (isolated env, same binary);
2. WSL — `wsl --install`, then `pip install semgrep` inside it and run the gate from there;
3. Docker — `docker run --rm -v "${PWD}:/src" semgrep/semgrep semgrep scan --config /src/qa/semgrep/.cache …`.

Record which one this machine uses in the next report, so a reviewer knows what produced the
numbers. `scripts/qa.mjs` finds semgrep on `PATH`, then in the Python user-scripts directory,
then as `python -m semgrep` — all three work.

**Offline:** after the first run every gate is offline. Semgrep's rule packs are downloaded once
into `qa/semgrep/.cache/` (4.2 MB, gitignored) and re-fetched automatically only if that folder
is missing. Playwright serves the app from `qa/playwright/server.mjs` and stubs every Supabase
call with the fixtures in `qa/playwright/tests/_fixtures.ts`; Google Fonts and the Apps Script
endpoint are blocked outright, so the suite passes with the network unplugged.

---

## 1 · gitleaks

```bash
qa/bin/gitleaks.exe detect  --source . --config qa/gitleaks/.gitleaks.toml --no-git --no-banner --redact
qa/bin/gitleaks.exe protect --staged   --config qa/gitleaks/.gitleaks.toml --no-banner
```

The config extends the upstream default ruleset and allowlists only what is **public by design**
— the Supabase `anon` JWT and the VAPID *public* key — each with a comment saying why, plus two
documented false positives of the `generic-api-key` rule (localStorage key *names*, and a fake
secret in a vitest fixture). A non-allowlisted JWT dropped anywhere in the tree is still
reported; that was verified by hand on 18.9.26.

### Pre-commit hook

`.githooks/pre-commit` runs `gitleaks protect --staged` (~0.3 s). Git never enables repo hooks by
itself, so **once per clone and once per worktree**:

```bash
git config core.hooksPath .githooks
```

`git commit --no-verify` bypasses it for a genuine emergency — and `npm run qa` then catches the
same thing over the whole tree.

## 2 · semgrep

`qa/semgrep/config.yml` is the manifest `scripts/qa.mjs` reads: the four rule packs
(`p/default`, `p/owasp-top-ten`, `p/javascript`, `p/typescript`), the severities that fail the
gate, **`include`** (the scan targets), `exclude` (paths never scanned), and `exclude_rules` —
the accepted findings, each with the sites reviewed and the reason. Prefer fixing code over
adding an entry there; a *new* site under an already-excluded rule is not automatically safe.

**`include` is the scan target list, and it is deliberate** (task 22b): `js/src`, `app/src`,
`supabase/functions`, `scripts`, `db`, `build.mjs`, `index.html`, `sw.js` and the
root `test-*.mjs` runners. Generated output is NOT scanned — `js/app.js`, `ui/**`,
`css/app.min.css`, `app/dist` — because every byte of it is derived from a path that is. The
gate used to scan `.` minus excludes, which broke quietly the moment `js/app.js` became
minified: one 480 kB line, semgrep stopped reporting inside it, and the accepted-findings count
fell from 24 to 0 with nothing fixed. An entry may contain `*` (expanded against the repo root).

Two Windows traps this gate now handles, both of which used to read as a clean PASS:

* semgrep writes its JSON through Python's **default encoding** — cp1255 on a Hebrew Windows —
  and dies with a `UnicodeEncodeError` on the first finding whose line carries an emoji. The
  runner spawns it with `PYTHONUTF8=1` / `PYTHONIOENCODING=utf-8`.
* an unreadable / empty `findings.json` is now a **FAILED** gate, not "0 findings". A scan that
  crashed can no longer report zero.

Expect `0 blocking · 24–25 accepted by config.yml · 178 file(s) scanned` (the accepted count
moves by one between runs; what is binding is **0 blocking**, 0 scan errors and a non-zero file
count). The gate also **fails on
semgrep's own `errors[]`** — a rule that timed out or a file it could not parse is a coverage
hole, not a pass. Two were found the day the check landed: `raw-html-concat` timed out on
`js/src/18-dev-tasks.js` (hence `--timeout 60`, up from the 5 s default), and semgrep's
JavaScript parser gave up on a whole `.mjs` file because it contained the literal characters
`<!--` inside a regex — it reads them as an HTML-style line comment. **Never write `<!--`
adjacently in a `.mjs` source**; build the string (`'<' + '!--'`) instead.

A manual run:

```bash
semgrep scan --config qa/semgrep/.cache --metrics=off --severity ERROR --severity WARNING   --exclude node_modules --exclude js/app.js --exclude ui --exclude css/app.min.css   --json-output "$PWD/out.json"   js/src app/src supabase/functions scripts db build.mjs index.html sw.js test-*.mjs
```

A single line can be suppressed with `// nosemgrep` on its own line directly above it, plus a
comment saying why (`scripts/qa.mjs` does exactly that for its own `spawnSync`).

## 2b · gate 0 — build freshness, and the runner's own teeth

Two preconditions that used to be invisible (task 22b review):

* **`node build.mjs --check`** — `css/app.min.css` and the `<style>` block inlined into
  index.html's `<head>` are GENERATED from `css/app.css` and `css/critical.css`. Each output
  carries the `src-sha256` of its source, so a source edit committed without `node build.mjs`
  is a checkable fact instead of a silent no-op. The same assertion runs in three places: this
  gate, `test-css-build.mjs` (so `npm test` catches it too) and `.githooks/pre-commit`, which
  blocks the commit. Never hand-edit either output. The generation itself lives in
  `scripts/css-build.mjs`, so the builder and the checkers cannot drift apart.
* **`node scripts/qa.selftest.mjs`** — the semgrep verdict is a pure function
  (`scripts/qa-semgrep-judge.mjs`) and the self-test feeds it the cases a real run cannot
  produce: unreadable JSON, an exit code that is neither 0 (clean) nor 1 (findings reported),
  a non-empty `errors[]`, and a scan that touched 0 files. All four must FAIL the gate — they
  are the ways it could otherwise report "0 findings" without having looked at anything.

## 3 · `npm test`

Unchanged: `scripts/test-all.mjs` runs every root `test-*.mjs` runner and then the app's vitest
suite. `test-cert-pdf.mjs` is a known pre-existing Windows skip (it shells out to `timeout /t`).

## 4 · Playwright

```bash
npx playwright test --config qa/playwright/playwright.config.ts
npx playwright test --config qa/playwright/playwright.config.ts --project mobile-390-light -g "home cards"
npx playwright test --config qa/playwright/playwright.config.ts --ui        # to poke at a failure
```

Four projects — `desktop-1440-{light,dark}` and `mobile-390-{light,dark}` — over 11 specs. RTL is
not a fifth project: `expectRtl()` asserts `<html dir="rtl">` and `dir="rtl"` on every island
root inside every spec, which is stronger than one more browser.

* **The server is the config's**: `qa/playwright/server.mjs` on **port 8124**. Not 8123 — the
  `cards-wt` launch entry serves this worktree there with a single-threaded python
  `http.server`, and `reuseExistingServer` would hand the suite that server, which drops island
  chunk requests under four parallel workers. (`npx http-server` did the same; that is why the
  server is 70 lines of `node:http` instead.) It gzips text assets, because GitHub Pages does
  and Lighthouse would otherwise be measuring this file.
* **Hermetic**: `_helpers.ts` `boot()` stubs the Supabase origin (reads → `_fixtures.ts`, writes
  → 401, which is the real state of a mock-mode session and the reason the islands show their
  "יש להתחבר ל-EMS כדי לשמור" hint), seeds the localStorage a PIN login would leave
  (`dashboard_user_v1` · `dashboard_role_v1` · `dashboard_auth_v4` · `theme`), and opens
  `index.html?login=0&sb=0`.
* It also sets two latches the legacy bundle owns — `_pushPromptShown` and `_attReminderShown` —
  because both open a full-screen modal a couple of seconds after load for a headless browser,
  covering the whole page. They are the app's own once-per-session flags; nothing else is faked.
* **Screenshots**: `qa/playwright/shots/<spec>/<viewport>-<theme>[-<suffix>].png` (gitignored).
* Every spec ends with `expectNoConsoleErrors()`. The ignore list in `_helpers.ts` covers only
  what the harness itself aborts or 401s.

## 5 · Lighthouse

```bash
node qa/lighthouse/run.mjs           # what the gate runs
npx lhci autorun --config=qa/lighthouse/lighthouserc.json   # the documented fallback
```

Thresholds and settings live in `lighthouserc.json` (mobile preset, three runs, median) and
`run.mjs` reads them, so there is one source of truth.

**Why `run.mjs` and not `lhci autorun`:** on Windows, chrome-launcher's `destroyTmp()` throws
`EPERM, Permission denied: C:\…\Temp\lighthouse.<n>` after every single run — Chrome still holds
its temp profile when the launcher deletes it. The audit completes, but both `lhci autorun` and
the plain `lighthouse` CLI then exit non-zero with no report on disk. `run.mjs` drives Lighthouse
over CDP against the Chromium Playwright already installed, so chrome-launcher is never used.
Output: `qa/lighthouse/.cache/summary.json` + `run-{1,2,3}.{json,html}`.

Thresholds are **never lowered to make a run pass**. A page that cannot reach one gets its
numbers and its top causes written into the report.

## 6 · ZAP baseline

```powershell
pwsh -File qa/zap/baseline.ps1        # Windows
bash qa/zap/baseline.sh               # bash
```

Passive scan only (a full active scan is release-time), `-l MEDIUM`, against
`http://host.docker.internal:8124/index.html?login=0&sb=0` from the `zaproxy/zap-stable`
container. Exit codes: `0` clean · `1` High/Medium findings · `2` **SKIPPED, no Docker**.

**Docker is not installed on the machine this was built on**, so gate 6 reports SKIPPED. To make
it real, either:

```powershell
winget install --id Docker.DockerDesktop -e     # then: npm run qa
```

or run ZAP without Docker:

```powershell
winget install --id ZAP.ZAP -e
node qa/playwright/server.mjs 8124              # in another terminal
& "$env:ProgramFiles\ZAP\Zed Attack Proxy\zap.bat" -cmd `
    -quickurl "http://127.0.0.1:8124/index.html?login=0&sb=0" `
    -quickprogress -quickout "qa\zap\.cache\zap-baseline.html"
```

Then read the report and treat any High or Medium as a gate failure.

---

## What is committed

Committed: every config, the specs and fixtures, `server.mjs`, `run.mjs`, the ZAP scripts, this
README, and **one** baseline report (`qa/reports/2026-09-18-task-22.md`).
Gitignored: `qa/bin/`, `qa/playwright/shots/`, every `qa/**/.cache/`, `test-results/`, and all
other `qa/reports/*`. Never `git add -A` here — add the files you mean.
