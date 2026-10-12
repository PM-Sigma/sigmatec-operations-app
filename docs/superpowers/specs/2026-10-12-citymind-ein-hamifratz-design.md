**STATUS: 🟡 BUILT, not live** — branch `feat/citymind-ein-hamifratz`; waiting on MAIN: SQL, secrets, function deploy, dry-run, then enable.

> ↪ Generalised to every Arad kibbutz: `docs/superpowers/specs/2026-10-12-arad-multi-kibbutz-design.md` (workflow renamed to `citymind-arad.yml`).

# עין המפרץ — daily CityMind water readings (readings-pull, second site)

Source spec (עידן, 12.10.26): `Kibbutzim/עין המפרץ/תוצרים/2026-10-12 — אפיון שאיבה יומית ל-Sigmatec Ops/` + the reference
`שאיבה יומית/citymind_daily.py` and `סגירת חודש/build_month.py` (check rules). Builds on the חולדה feature
(`2026-09-29-readings-pull-design.md`): same tables, same page, same files.

## Flow
1. **GitHub Actions** `.github/workflows/citymind-ein-hamifratz.yml`: two UTC crons (05:40 Israel in summer and winter);
   the first step keeps only the fire that lands 05:30–06:39 Israel and sleeps a random part of the time left to 06:20.
   The schedule is OFF until the repo variable `CITYMIND_ENABLED=true`. `workflow_dispatch` has `dry_run` (default true) and `date`.
2. `scripts/citymind/citymind-daily.mjs`: headless **Firefox** (Playwright) → login → report rid=13 ("from D", daily = 1)
   → in-page export → CSV decoded as windows-1255 → `parseCityMind()` (columns by header name) → POST
   `readings-fetch {mode:'ingest'}` with header `x-ingest-key`. A fetch failure posts `{failed:true, error_code}` instead
   (AUTH / BLOCKED / DOWN / CHANGED / STALE) → a failed run + the usual push to עידן/עמיחי/מתניה.
3. `readings-fetch` `ingest`: key = `READINGS_INGEST_KEY` (timing-safe), site whitelist (`INGEST_SITES`), body ≤ 1 MB,
   ≤ 5000 rows, strict row shape. Once per day (an ok/running run wins). Builds the run with `buildWater()`, stores the
   files + `reading_values`, status ok. `dry_run` = checks + counts, nothing written.
4. The page: a tab per site (SegmentedControl when 2–4 sites). עין המפרץ: no manual pull, a note "נמשך אוטומטית…", the
   files are LOCKED until "בדוק מול EMS" (the function's `sign` refuses too: `NOT_CHECKED`).
5. `emsCheck` for this site: replacement continuity first (EMS `GET /v1/meters?search=` → clientMeters), then the usual
   EMS `validate` (blocks "not set up under the site"), then info rows for the site's water meters missing from the report.

## Rules (citymind.mjs, goldens in test-readings-citymind.mjs)
| | Rule |
|---|---|
| BLOCK | negative · empty reading · skip-list (`rules.skip`) · drop vs the last SAVED reading (a drop to < 5 m³ is labelled "probably a meter replacement") · not set up in EMS (validate) · replacement whose continuity is not proven |
| WARN | > 100 m³/day · zero while the average is > 1 m³ a month · > 5× the daily average and 20 m³ above it (average needs ≥ 7 days of saved history) |
| Replacement | same `מס' זיהוי`, different `מס' משדר` than the previous saved run → blocked until the EMS check: OK when the old meter's client has the new meter starting the day the old association ended (no gap, no overlap) and the new meter has readings |
| INFO | water meters of the site in EMS that the report did not include |

Interpretation notes: "average > 1" (build_month, monthly) → daily average > 1/30; "> 5× average" keeps build_month's
"and 20 m³ above it". Both are rules in `reading_sites.rules` and can be tuned in SQL.

## Stage 2 (not built)
All readings of the day (report CF4 = all). Hook: `buildWater()` already keeps the latest reading per serial per day;
`reportUrl()` in the runner names CF4.

## חולדה cron spread
`db/cron_readings_spread.sql`: pg_cron every 5 min (04–06 UTC); the function starts a site's first run at 07:00 + 0–25 min,
fixed per (site, date) (`cronStartOffset` / `cronFirstRunDue`). A sleep inside the function is impossible (~150 s limit).

## Production steps (MAIN)
1. Apply `db/citymind_ein_hamifratz.sql`. 2. Secrets (one-shot command in the handoff). 3. Deploy `readings-fetch`.
4. Merge the workflow to `main` (schedule stays off) → `gh workflow run citymind-ein-hamifratz.yml -f dry_run=true`.
5. A live dispatch (`-f dry_run=false`) → check the run in the app. 6. `gh variable set CITYMIND_ENABLED --body true`.
7. חולדה spread: deploy (same function) then `db/cron_readings_spread.sql`.
