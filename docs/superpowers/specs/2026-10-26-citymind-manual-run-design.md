# CityMind manual pull from the readings page (26.10.26)

STATUS: BUILT on `feat/citymind-manual-run`, NOT deployed (needs readings-fetch deploy + GH token check, below).

Why (עידן 26.10): the CityMind (Arad) tabs only said "נמשך אוטומטית כל בוקר". They now get the same manual block as חולדה:
date, "משוך עכשיו", optimistic progress, files when done.

## Flow
1. App: `readings-fetch` mode `dispatch` `{kibbutz, date}` (JWT, all staff except the viewer = `canUseReadings`).
2. Function (`dispatch.mjs` = pure decisions, `index.ts` = IO):
   - validates: active citymind site; date YYYY-MM-DD strictly before today; not older than `retention_days` (35);
   - an ok / fresh-running run for that date -> returned, no dispatch;
   - else inserts `reading_runs` (`status running`, `trigger manual`, `started_by` = user, `progress {CityMind:{state:'pending'}}`)
     and `POST /repos/{GH_ACTIONS_REPO}/actions/workflows/citymind-arad.yml/dispatches` `{ref:'main', inputs:{kibbutz,date,dry_run:'false'}}`
     with the Supabase secret `GH_TOKEN`. GitHub 204 = ok; 401/403 -> "token lacks Actions: write", 404, 422, other -> Hebrew errors;
     any failure marks the new row failed (nothing is left running). The token is never logged or returned.
3. Runner -> `ingest`: `ingestPlan()` sees the dispatch row (running + manual + CityMind progress) and FILLS it (update, not insert);
   the once-per-day guard is unchanged (an ok run / a running cron run -> `existing`).
4. Timeout: a dispatch row older than 25 min -> `failed` "המשיכה לא הסתיימה — נסה שוב" (pg_cron `maintenance()` every 5 min, and lazily
   on the next `dispatch`). Other running rows keep the 10-min rule.
5. UI: `ManualRun` (shared with חולדה) calls `dispatchRun` for citymind sites; progress = 4 steps
   "נשלח · מושך מ-CityMind · בודק · מוכן" (step 0 optimistic at the tap, step 1 once the row is polled). History gap rows get "משוך" too.
   The "נמשך אוטומטית כל בוקר" note stays as the small line under the tabs. Downloads still unlock only after the EMS check.

## Config
- Supabase secret `GH_TOKEN` must be able to run workflows in the OPS repo: fine-grained PAT with that repo + **Actions: Read and write**
  (classic: `repo` + `workflow`). NOTE: the existing `github` function uses GH_TOKEN against `GH_REPO` (default Sigmatec-Energy/tasks);
  if that token is not scoped to the ops repo, set a different secret and name it in `dispatch` (today: GH_TOKEN) — decision pending.
- Optional secret `GH_ACTIONS_REPO` (default `PM-Sigma/sigmatec-operations-app`).
- Workflow concurrency: a manual dispatch has its own group per kibbutz+date (GitHub keeps only one pending run per group).

## Tests
`test-readings-citymind-dispatch.mjs` (validation, GitHub body, error map, ingest fill / no duplicate, 25-min timeout, source contract),
`readingsLogic.test.ts` (steps, siteMode), Playwright `readings-citymind.spec.ts` (manual block, dispatch flow, refused dispatch; 360/412/390/desktop light+dark).
