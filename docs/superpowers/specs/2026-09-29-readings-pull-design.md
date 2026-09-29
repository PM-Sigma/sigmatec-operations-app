**STATUS: 🟡 BUILT, not live** — Phase 1 green on `feat/readings-pull`; waiting on MAIN for SQL/deploy/merge. Earlier: **Phase 0 ✅ PASSED 29.9** (197 + 51 + 5 for 28.9; also 31.8, 27.9 — raw fixtures in `supabase/functions/readings-fetch/fixtures/`). ⚠ Sucuri 403s Supabase AND Browserless datacenter IPs → SpeedNet runs inside Browserless with `&proxy=residential&proxyCountry=il` (~17 s). Next: Phase 1. Resume: this file + the source spec in `Kibbutzim/חולדה/תוצרים/2026-09-29 — אפיון שאיבת קריאות יומית ל-Sigmatec Ops/`. Branch `feat/readings-pull`; merges are done by the "Sigmatec Ops — MAIN" session only.

# Plan: "משיכת קריאות מתוכנות חיצונית" (חולדה, stage 1), v2

## Context
Today an employee manually pulls readings from SpeedNet and DataSense for חולדה and prepares a manual upload file for EMS. `miltel_daily.py` already does this and has been checked end to end (31.8, 20.9, 27.9, 28.9). We are moving it into the app: every morning at 07:00, plus a manual run, producing 2 files (readings to upload + exceptions). Access: **all signed-in staff, never the view-only role** (ruling עידן 29.9, replacing "עידן/עמיחי/מתניה only"): a bridge JWT with a non-empty `name` claim (ems-auth mints it only for rostered staff) and no `viewer` claim; the same in `canUseReadings()`, `is_readings_user()` and `canShowPage('readings')`. Cron-failure alerts still go to a named list (עידן, עמיחי, מתניה: `READINGS_ALERT_USERS` in push-send), which is not access. Source of truth: `C:\Users\idann\Projects\Kibbutzim\חולדה\תוצרים\2026-09-29 — אפיון שאיבת קריאות יומית ל-Sigmatec Ops\אפיון — שאיבת קריאות יומית.md`.
What changed from v1: a run is a **server-side job that does not depend on the screen**. The user can move to other screens or close the app, and they get told when it finishes and where to go.

## Architecture
- The client only **starts** a run (`POST readings-fetch {mode:"run"}`) and gets back a `run_id`. From there the server carries it: the function saves the run and fires one call per source (`mode:"source"`, a non-awaited self-call with a service key). The last source to finish runs `mode:"build"`, which builds the xlsx files → Storage → `status=ok|partial|failed`.
- **SpeedNet:** direct HTTP from Deno. This is a port of `speednet()`: POST, a `FromDate` that changes every attempt, a check that most rows are dated D/D+1, and up to 6 attempts.
- **DataSense:** the Browserless REST `/function` endpoint runs a puppeteer script ported from `ds_fetch()`. ⚠ The DataSense credentials pass through Browserless, a third party. עידן decides.
- **Timezone:** always `Asia/Jerusalem`. Deno runs in UTC, and the Python relied on the PC's local time.
- **Dedupe:** if a run is already `running` for the same kibbutz and date, return the existing run (two users, or a double tap). A `running` row that is more than 10 minutes old is marked `failed ("הריצה נתקעה")`.

## Progress and notifications while the user is away (the new request)
1. **At the start:** the screen shows a progress bar with steps (✓ SpeedNet 197 · ⏳ DataSense… · building files) and the line: **"אפשר לעבור למסכים אחרים, נודיע לך כשהקבצים מוכנים."** The steps come from `reading_runs.progress jsonb`.
2. **A global watcher** (`app/src/lib/readingsWatch.ts`, mounted once in the shell): keeps the active `run_id` in localStorage and polls the row every 5s from any screen, and a floating **chip** ("⏳ משיכת חולדה…") shows on every screen; tapping it goes to the page.
3. **On finish:** `sigma.toast` with a button **"לקבצים ←"** that opens the page on that run. A partial or failed run gets a red toast with the reason.
4. **App closed or phone locked:** a push through a new `readingsDone` mode in `push-send`, only to the person who started the run. For cron runs: a push to all 3 **only on partial or failed** (no push when everything succeeds, so there's no noise).
5. **Badge on "עוד":** a red dot on the menu item when the last cron run of an active kibbutz is partial or failed and nobody has opened it yet. `registerMoreItem` already supports a badge (`app/src/lib/registry.ts`).

## Critical review: additions beyond the spec (recommended)
| # | Gap | Fix |
|---|---|---|
| A | **7.1 "didn't show up today" can't be detected** without a list of expected meters. If SpeedNet returns 50 meters instead of 197, nobody knows. | The expected list = the union of meters from the last 7 successful runs. A missing meter → a blocking exception. A drop of more than 10% in the count → a warning at the top of the run. |
| B | **Running a past date after a later one** (27.9 after 28.9): rule 7.5 must compare only against readings **before** D. | `reading_values` with `reading_date < D`. A re-run of D overwrites D's values. |
| C | You only see exceptions after downloading the file. | The screen shows a **reasons summary** (a count per reason, and a tap opens the list of meters) before any download. |
| D | Downloading on an iOS/Android PWA with a Hebrew file name. | `createSignedUrl(path, 3600, {download: "<שם עברי>.xlsx"})`, an `<a>` link, not blob/JS. |
| E | A partial source must not silently shrink the upload file. | `partial` = a red strip "SpeedNet לא זמין, 197 מונים לא בקובץ" + a "נסה שוב רק את המקור הזה" button. |
| F | Serial numbers = site numbers. EMS will reject meters that haven't been set up yet. | Out of stage 1's scope (spec section 10). A note on the screen: "מספרי המונים לפי האתר". |
| G | The cron at 07:00 with no clock-change bug | `0,30 4-6 * * *` UTC; the function acts only between 07:00 and 08:30 Israel time, with retries every 30 minutes up to 3. |

## Second round of review (after עידן approved Browserless, the secrets and Phase 0)
Required (going into the plan):
| # | Gap | Fix |
|---|---|---|
| H | **A contradiction in the spec:** retention deletes after 35 days, but rule 7.5 looks back 40 days. | Only runs and files are deleted at 35 days. `reading_values` are kept for 400 days (a few KB). |
| I | **A cold start:** the first run has no history, so the drop, spike and stuck-meter rules are silent. | A one-time import of `שאיבה יומית/_היסטוריה/*.json` (31.8–28.9) into `reading_values`. |
| J | **A drop that blocks forever:** after a meter is replaced (1715447), every day will be blocked, because the reference stays the old reading. | An "אשר ירידה (החלפת מונה)" button in the exceptions summary: it writes a new baseline (`reading_values.reset_by`), with who and when. |
| K | **An unclear failure message:** a wrong password, a site that's down, a site whose structure changed, and a Browserless quota running out look the same. | A distinct error code for each one + a clear message in Hebrew. |
| L | **Did anyone upload to EMS?** Without tracking, you'll miss a day or upload twice. | A "הועלה ל-EMS ✓" checkbox on a run (who and when) + a gray/red color in the history for days that weren't uploaded. |
| M | **Running in parallel with the local script:** history in 2 places will drift. | After the cutover — the Python stops running (a note in `sources.md`). |

Open for עידן's decision (not in by default): a settings screen for thresholds (for now SQL); adding a kibbutz with a new source type = new adapter code, not just a settings row.

## עידן's answers (29.9) → changes to the plan
- **Minimal checks + let EMS do the job.** Checked in the EMS code (`upload-readings.service.ts`): EMS itself blocks an unknown meter, a meter not in the site, a negative value, a **drop** vs the last reading, and a duplicate; it warns on a tariff sum mismatch or partial tariffs. ⚠ **One invalid row rejects the whole file** (`HAS_INVALID_ROWS`). There's a read-only `POST /v1/upload-readings/validate` endpoint (validates, no write).
  → Our checks: source only (7.1 missing, 7.2 no total, 7.6 duplicate, 7.8 day split, 7.9 stale). Then we call EMS `validate` on the file: a row EMS rejects → moves to the exceptions (with EMS's reason) so the file loads clean; an EMS warning → uploads + noted in the exceptions. Spike/stuck meter → warning only (uploads + noted); EMS has `detect_electricity_reading_patterns`, check in Phase 0 that it runs on manual readings too.
  → Our rule 7.5 (drop) and the "approve drop" button (J) are **removed**: EMS checks this itself.
- **Meter in Miltel but not in EMS** → an exception "המונה לא קיים ב-EMS" (from `validate`, `METER_NOT_FOUND/NOT_IN_SITE`). A meter in EMS that doesn't come from Miltel → an informational exception.
- **Push with nobody logged in:** possible and already in use (`push-send` from pg_cron, like the 2-hour reminder, reaches a closed phone). Condition: each of the three turned on notifications once. → a push to all three only on failure.
- **Browserless free, Supabase free (150 seconds)** → a separate call per source + a separate build step.
- **History/back days:** the goal = pulling any past day. The date is `max` = yesterday with no minimum (limited only by what the source keeps, checked in Phase 0). 35 days = file retention only.
- **"Uploaded to EMS" mark:** manual + an automatic check every Sunday: the first of the three who opens the app on Sunday — the client uses their EMS token to compare the last readings in EMS against the runs, and marks automatically.

## Decision: EMS check (עידן, 29.9) — option A
- The 07:00 run builds files with the basic checks only; `reading_runs.ems_checked=false`.
- As long as a run hasn't been checked: next to the downloads a prominent **"בדוק מול EMS לפני הורדה"** button + an orange tag "לא נבדק מול EMS". A click → the client sends the user's EMS token → the function calls `POST /v1/upload-readings/validate` (check only, no write) → moves rejected rows to the exceptions, adds warnings, rebuilds both files → `ems_checked=true` + who and when.
- A manual run by a logged-in user does the EMS check automatically at the end.
- The history shows a ✓EMS tag for each checked run.

## Phase 0: feasibility (stop point)
1. **עידן** sets the secrets `HULDA_SPEEDNET_USER/PASS`, `HULDA_DATASENSE_USER/PASS` and `BROWSERLESS_TOKEN`.
2. Sonnet: `readings-fetch` `mode:"probe"` (the 3 names only) → counts for 28.9 (expected: 197 + 51 + 5). No credentials in the response.
3. Deploy **with עידן's approval**. On failure (Sucuri/geo-block) → stop and present alternatives.
4. On success: save the raw responses for 31.8, 27.9 and 28.9 as fixtures (no secrets) for the golden test.

## Phase 1: build (Sonnet, `feat/readings-pull` from `dev`)
1. `db/readings_pull.sql`: the tables from spec section 9 + `progress jsonb`, `seen_by text[]`, a חולדה seed (prefixes only, no values), a private `readings` bucket, and RLS (`auth.jwt()->>'name'` in the 3 names; writes by the service role only).
2. `supabase/functions/_shared/readingsRoster.js`: the single list; a test checks it matches the SQL.
3. `supabase/functions/readings-fetch/logic.js`: pure logic, no dependencies (the `github/gate.js` pattern): the CSV/JSON parsers, `check()` for 7.1–7.11, 7.3, the expected list (A), and building the rows.
4. `readings-fetch/index.ts`: the modes `run`/`source`/`build`/`sign`/`retention`/`cron`/`probe`; xlsx through SheetJS (`Upload Readings` first + `קריאות`, `חריגות`, `סיכום`); auth like `github/index.ts` (verify `iss:"ems-bridge"`) or `X-Cron-Key`.
5. `push-send`: a `readingsDone` mode.
6. `db/cron_readings_7am.sql`: the pattern of `db/cron_timer_5min.sql`.
7. Client: `app/src/islands/ReadingsPull.tsx` + the `readings` page in `MORE_PAGES` (admin group) in `app/src/components/MoreSheet.tsx`, `canShowPage('readings')`, `SigmaPage` in `app/src/bridge.ts`, the `readingsWatch.ts` watcher + chip + toast + badge. Uses the existing design system (SectionBlock, Tag, Sheet).

## Verification (Sonnet, loop until green)
- Unit tests for every rule (including 7.5 against 28 days of history, and B), the parsers, and the expected list.
- **Golden:** the fixtures 31.8 → 27.9 → 28.9 compared cell by cell against the reference files (250/3, then 249/4 including 1715447) + the samples 1503007, 7010384, 108324, 2859, 1502949.
- Access matrix: the 3 names get in; any other name, the viewer or anon → 403 / empty RLS.
- Background flow (Playwright): start a run → move to another screen → the chip is visible → finish → a toast with a link → the page opens on the run.
- The dedupe is tested, and a stuck run → failed. A re-run returns the same values (the cache trap).
- A secrets scan of the code, the responses and the logs. The EMS upload screen: load only, no submit.
- A wrong password for one source → partial (a temporary secret, on עידן's list).

## Docs
- Now, INDEX: Supabase + a direct call to `api.sigmatec-ems.com/v1` with the user's token; Apps Script is no longer used (Quick facts + the architecture row).
- A spec `docs/superpowers/specs/2026-09-29-readings-pull-design.md` + 🟡 in the backlog; at every checkpoint: CHANGELOG, backlog, Current state.
## Integration (עידן, 29.9)
- **I don't merge anything into `main`.** The supervisor of the whole app is the **"Sigmatec Ops — MAIN" session (integration, Opus)**.
- I work on `feat/readings-pull` (from `origin/dev`) and push only that branch. At every stop point (end of Phase 0, end of Phase 1, after QA) I send a handoff to the MAIN session (through `ListAgents` + `SendMessage`): the branch, the commits, the files the feature owns, test results, and the production steps waiting (migration, deploy, secrets, cron). The merge to `dev`/`main` is **theirs**.
- I touch only files the feature owns; the shared files (`MoreSheet.tsx`, `bridge.ts`, `push-send/index.ts`) get minimal diffs and are listed explicitly in the handoff.
- Prod deploy and migrations: only with עידן's explicit approval, coordinated with the MAIN session.
