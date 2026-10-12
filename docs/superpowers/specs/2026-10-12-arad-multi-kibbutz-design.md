**STATUS: 🟡 BUILT, not live** — branch `feat/arad-multi-kibbutz` (off origin/main 2.175). Waiting on MAIN: SQL → function
deploy → merge → dispatch PROBE + dry run. Resume = "Production steps (MAIN)" below.

# CityMind (Arad) for many kibbutzim — config, not code

Builds on `2026-10-12-citymind-ein-hamifratz-design.md` (one site, live in prod 12.10, schedule off). עידן 12.10: the same
automation for every Arad kibbutz (next: אור הנר, עין השופט), raw pull and conversion split into two stages, 5 readings a day.

## The config = one `reading_sites` row
| field | meaning |
|---|---|
| `kibbutz` | the tab name; also the key the runner sends |
| `ems_site_id` | the EMS site (validate scope, missing-meters info) |
| `active` | false = no tab, not pulled |
| `rules.source = 'citymind'` | automatic mode: no manual pull, files only after the EMS check |
| `rules.secrets = {user, pass}` | the NAMES of the two GitHub secrets (capitals, `^[A-Z][A-Z0-9_]+$`). Never a value. |
| `rules.daily_readings` | the report's "קריאות יומיות" value (CF4FVAL). Absent/invalid → `1`. |
| `rules.skip`, `max_daily_m3`, `spike_*`, `zero_min_avg_daily`, `near_zero_m3`, … | the checks (unchanged from עין המפרץ) |

Nothing else names a kibbutz: `INGEST_SITES` is gone (the function accepts an active citymind row), the workflow builds its
matrix from the DB, the app makes a tab per active row (SegmentedControl for 2–4 sites, a Select above).

## Flow
1. `.github/workflows/citymind-arad.yml` (replaces `citymind-ein-hamifratz.yml`, same crons + `CITYMIND_ENABLED` gate):
   job `sites` → `scripts/citymind/sites.mjs` → readings-fetch `{mode:'ingestSites'}` (x-ingest-key) → `ingestMatrix()` =
   `[{kibbutz, user_secret, pass_secret, daily}]`. Job `pull` = matrix, **fail-fast off**, one runner + one Firefox per
   kibbutz, each its own random start minute (05:40–06:20 Israel). Credentials: `secrets[matrix.user_secret]` — so a new
   kibbutz never edits the workflow. Dispatch inputs: `dry_run`, `date`, `kibbutz` (one only), `probe`.
2. **Stage A — raw** (`scripts/citymind/citymind-daily.mjs`): login → report (CF4 = `daily`) → in-page export → the file's
   **exact bytes, base64** → `ingest {csv_b64}`. The runner does not convert anything (it parses only for a count in the log).
   The function stores the bytes at `readings/<site_id>/<date>/raw-citymind.csv` (private) → `reading_runs.raw_file`.
   A CHANGED/STALE export is still stored (failed run + raw file = what to look at).
3. **Stage B — conversion** (function, `stageB()` → `cmBuild()` → `buildWater()`): parse by header name → per meter: the LAST
   reading of the day goes to the upload file; ALL readings of the day stay in `raw[CityMind]` (rows) and in the new sheet
   **"כל הקריאות ביום"** of the readings file; a drop inside the day blocks the meter ("ירידה בתוך היום"). Then the existing
   checks (drop vs saved history, consumption, skip, replacement continuity at the EMS check) → files + `reading_values`.
4. **Re-run stage B without CityMind**: mode `rebuild` (signed-in user) re-parses the stored raw file; resets the EMS check.
5. App (ReadingsPull): per history row of a citymind site with a raw file — **"קובץ גולמי"** (signed URL, `sign kind:'raw'`,
   no EMS check needed: it is the input, not the upload file) and **"בנה מחדש מהגולמי"**. Upload/exceptions files stay
   locked until "בדוק מול EMS".

## 5 readings a day — NOT guessed
`rules.daily_readings` stays `1` (today's behaviour, proven) until the site confirms the value. The probe:
`gh workflow run citymind-arad.yml -f probe=true -f kibbutz=עין המפרץ -f date=<yesterday>` prints the report's small
dropdowns (option value=label) and, for CF4 = 1, 5, 0, how many readings per meter per day each returns — counts only.
Pick the value that gives max 5 / meter / day, then:
`update reading_sites set rules = rules || '{"daily_readings": <value>}' where kibbutz = '…';` — no code change.

## Public-repo rules (kept)
Logs: counts + error codes only (the runner never prints a reading, serial, name, URL or exception text). No artifacts. The
raw file travels only to the function (TLS, ingest key) and lives in the private bucket. The golden 11.10 file is LOCAL
(`Kibbutzim/עין המפרץ/תוצרים/2026-10-12 — גולמי משוחזר 11.10 לבדיקת golden/`), never committed; its test skips without it.

## Tests (`test-citymind-arad.mjs`, 13 + `test-readings-citymind.mjs` 51 + vitest)
golden 11.10 → 496 rows, 495 ok / 1 blocked · 5 a day: last one uploaded, sequence kept in time order, intraday drop blocks ·
dummy kibbutz by config only → in the matrix, generic tab mode, dry-run ingest accepted · runner end-to-end with a stub
browser + stub function: 3 kibbutzim in parallel, one wrong password → AUTH + exit 1, the other two post their raw bytes ·
log scan (no password/user/key/serial/reading/URL) · committed-file scan (no real serial from the golden, no password literal).

## איך מוסיפים קיבוץ ארד חדש (צעד אחר צעד)
1. **שם קידומת לסודות** — באנגלית, אותיות גדולות: `ORHANER`, `EINHASHOFET`, …
2. **שני secrets ב-GitHub** (Settings → Secrets → Actions, או):
   `gh secret set <PREFIX>_CITYMIND_USER` ו-`gh secret set <PREFIX>_CITYMIND_PASS` (מקלידים את הערך כשמתבקש — לא בשורת הפקודה).
3. **שורת הגדרה** (SQL Editor / MCP):
   ```sql
   insert into public.reading_sites (kibbutz, ems_site_id, active, rules, retention_days) values (
     '<שם הקיבוץ>', '<ems site uuid — PGadmin/sigmatec-ems-session/sites-lookup.md>', true,
     '{"source":"citymind","energy_type_code":2,"max_daily_m3":100,"spike_factor":5,"spike_min_m3":20,
       "zero_min_avg_daily":0.0333,"avg_min_history_days":7,"near_zero_m3":5,"skip":{},"daily_readings":1,
       "secrets":{"user":"<PREFIX>_CITYMIND_USER","pass":"<PREFIX>_CITYMIND_PASS"}}'::jsonb, 35);
   ```
   (שורה קיימת ולא פעילה — כמו אור הנר ועין השופט — `update public.reading_sites set active = true where kibbutz = '…';`)
4. **ריצת ניסיון**: `gh workflow run citymind-arad.yml -f dry_run=true -f kibbutz=<שם הקיבוץ>` → בלוג: מספר שורות, תקין/חסום.
5. **ריצה אמיתית**: `-f dry_run=false` → הלשונית של הקיבוץ באפליקציה מציגה את הריצה; "בדוק מול EMS" → הורדה.
6. מעכשיו הקיבוץ רץ כל בוקר עם השאר (אם `CITYMIND_ENABLED=true`). אין שינוי קוד ואין שינוי ב-workflow.
7. רשימת דילוג / ספים לקיבוץ: `update reading_sites set rules = rules || '{"skip":{"<serial>":"<סיבה>"}}' …` (ב-DB בלבד — לא בריפו).

**אור הנר** (`ORHANER`) ו**עין השופט** (`EINHASHOFET`): השורות כבר ב-`db/citymind_arad_multi.sql`, לא פעילות. נשאר: צעד 2
(שני secrets לכל אחד) → צעד 3 (`active = true`) → צעדים 4–5.

## Production steps (MAIN) — ORDER MATTERS
1. Apply `db/citymind_arad_multi.sql` (adds `reading_runs.raw_file` + grant; עין המפרץ `rules.secrets` + `daily_readings`;
   inactive rows for אור הנר / עין השופט). **Before** the deploy: the new function reads `raw_file`, and without
   `rules.secrets` עין המפרץ drops out of the matrix.
2. Deploy `readings-fetch` (accepts both the old `rows` payload and the new `csv_b64` — the old workflow keeps working).
3. Merge the branch (the workflow file is renamed; `CITYMIND_ENABLED` and the עין המפרץ secrets are reused as they are).
4. `gh workflow run citymind-arad.yml -f dry_run=true` → the `sites` job lists עין המפרץ; the pull logs counts.
5. PROBE (above) → set `daily_readings`. 6. Live dispatch → the app tab shows the run + "קובץ גולמי". 7. Schedule stays per
   `CITYMIND_ENABLED`.
