# EMS task lifecycle tracking (H5) — design

**STATUS: 🟡 OPEN — spec only, NOT built.** Migration draft `db/ems_task_lifecycle.sql` is written, NOT applied.

Resume steps:
1. Get עידן's answers to the open questions (section 10).
2. Run the one-shot **probe** (section 2): print the KEY NAMES of one raw EMS task (open and closed) from the office PC, and check whether EMS exposes assigned/closed stamps or a history endpoint. This decides how much is derived.
3. Apply `db/ems_task_lifecycle.sql` (after a backup, per its notes), build the pure differ + tests (section 9), wire the refresh job and the browser sync, then the stats page.

Decision (עידן 29.9): track for every EMS task when it was OPENED, CLOSED, last UPDATED and ASSIGNED (שובצה) with a due date (תאריך יעד), for statistics.

## 1. How tasks reach the app today

- Source: EMS REST `GET /v1/employee-tasks?status=...` (paged, 200/page). Two writers do the same crawl: the browser (`emsSyncCache`, js/src/13-ems.js) and the office-PC job (`scripts/ems-cache-refresh.mjs`, every 30 min).
- Both crawl **open statuses only** (`new, in_progress, waiting_for_client, on_hold`), map each raw task through `emsSlimTask` / `slimTask` (byte-identical, pinned by test-ems-refresh.mjs) and overwrite the singleton row `ems_cache` id=1 (`tasks` jsonb, `synced_at`, `synced_by`, `ver`). It is a last-writer-wins snapshot: **no history is kept**.
- `ems_queue` is only the outbound write queue (comment/status changes to EMS), not a source of lifecycle data.
- The typed app client `app/src/lib/ems/*` (`mapTask`) already reads `createdAt`/`updatedAt` (camelCase or snake_case) from the raw task, so EMS is expected to send them; the legacy slim mapper throws them away.

Live check (read-only, counts only): `ems_cache` holds 38 tasks, all with slim keys only (`id, title, status, priority, type, site, assignee, expectedCompletionDate, description, linkType, linkCount`); 0 carry `createdAt`/`updatedAt`. 36/38 have an assignee, 6/38 a due date, 31/38 are `new`. So today the app stores **no timestamp at all**, and "has an assignee" is the norm even for status `new`.

## 2. Timestamps: given by EMS vs derived

| Field | Source | Confidence |
|---|---|---|
| opened_at | raw `createdAt` | likely given (typed client and fixtures expect it); confirm with the probe |
| last_updated_at | raw `updatedAt` | likely given; it moves on ANY edit (comment, priority), not only status |
| due_date | raw `expectedCompletionDate` (already in slim) | given, but only ~16% populated today |
| closed_at | NOT known to be given. Best available: `updatedAt` of a task seen in a closed status (exact only if the close was its last edit). Alternative: first crawl at which it is seen closed (precision = sync interval, 30 min) | approximated / derived |
| assigned_at | NOT given (no such field anywhere in the code). Derived: first snapshot where assignee goes null to non-null, plus assignee changes | derived, 30 min precision |
| first_seen_at | first snapshot containing the task | derived |
| status changes | diff of successive snapshots (open then close between two syncs = one event) | derived |

Probe (build step 0): for one open and one done task, log the raw JSON key names only (never values) and try `GET /employee-tasks/:id` for a history/activity sub-resource. If EMS provides `assignedAt`/`closedAt`/`completedAt` or a history, use them as primary and keep the derived stamps as fallback (`*_src` columns record which).

## 3. Schema (draft: db/ems_task_lifecycle.sql)

- `ems_task_state` — one row per task id: site, type, priority, status, assignee, due_date, opened_at, last_updated_at, closed_at, first_seen_at, assigned_at, last_seen_at, gone_at, each stamp with a `*_src` (ems / derived / backfill / unknown). Fast source for every statistic.
- `ems_task_events` — append-only: `task_id, kind, at, prev, next, src, sync_key`, `unique (task_id, kind, sync_key)`. Kinds: `opened, first_seen, assigned, reassigned, unassigned, due_set, due_changed, status_changed, closed, reopened, disappeared`.

No titles or descriptions are stored (statistics need none).

## 4. How the sync writes events (idempotent)

The differ lives in the database, not in two JS copies: `ems_apply_snapshot(p_tasks jsonb, p_at, p_full)` (SECURITY DEFINER, search_path pinned). The office job and the browser sync call it via RPC right after the cache write, passing the slim tasks plus `createdAt`/`updatedAt` once the mapper is extended (add both to `emsSlimTask`/`slimTask`, bump `EMS_CACHE_VER` to 3; the pin test covers parity).

Per task it compares with `ems_task_state` and emits events only for real changes: new id gives `first_seen`; status differs gives `status_changed`, a closed status gives `closed`, closed to open gives `reopened`; assignee differs gives `assigned|reassigned|unassigned`; due differs gives `due_set|due_changed`. Tasks in state but absent from a **full** crawl (`p_full` true only when the crawl reached its total, never on a page-cap stop) get `disappeared` and `gone_at`; the job then reads that task by id to record its true final status (closed vs deleted) and `updatedAt`.

Idempotency: (a) diff against state, so replaying a snapshot changes nothing; (b) `sync_key` plus the unique index collapses a concurrent double call (browser and office job at once) via `on conflict do nothing`; (c) state update and event insert share one transaction, `for update` on the state row.

Closed tasks: the crawl gains a cheap second pass over closed statuses (recent `updatedAt` / last N pages, at most hourly), so a task that opens and closes between two open-only crawls is still observed.

## 5. Backfill (what is and is not recoverable)

Recoverable, one-off script on the office PC (same auth path): crawl ALL tasks, open and closed. Per task: `opened_at` from `createdAt`, `last_updated_at`, `due_date`, current status, `closed_at` approximated from `updatedAt` for closed tasks (`closed_src='backfill'`); one state row plus an `opened` and (if closed) a `closed` event with `src='backfill'`.

Not recoverable: real historical `assigned_at` (unless the probe finds it), past reassignments, the status path between open and close, past due-date changes, tasks deleted in EMS before the backfill. Old tasks keep `assigned_src='unknown'` and are **excluded** from time-to-assign. First-seen of currently open tasks is the backfill run time and is never shown as their opening time.

## 6. Statistics (exact formulas)

Computed on `ems_task_state`, Asia/Jerusalem dates; each stat states its denominator (rows with the needed fields known).

1. **Time to assign** = `assigned_at - opened_at`, rows with `assigned_src <> 'unknown'` and both non-null; median, p90, n. Caveats: 30-min precision; tasks born already-assigned give about 0.
2. **On-time close %** = `100 * count(closed_at::date <= due_date) / count(*)` over tasks with `closed_at` and `due_date` non-null (status `done`, see Q4). Closed-without-due-date shown separately.
3. **Overdue open now** = open tasks with `due_date < current_date`; also as % of open-with-due.
4. **Opened per kibbutz per month** = `count(*) group by site_name, date_trunc('month', opened_at)` (uses `opened_at`, never `first_seen_at`); closed per kibbutz per month likewise on `closed_at`.
5. **Open backlog age** = `now() - opened_at` for open tasks; buckets 0-7 / 8-30 / 31-90 / 90+ days, plus median per kibbutz.
6. **Time to close** = `closed_at - opened_at`; median/p90 by type and by kibbutz.
7. **Coverage** = open with assignee / open; open with due date / open (data quality, about 16% today).
8. **Per-assignee load** = open tasks per assignee; on-time % per assignee (formula 2 grouped).
9. **Reopen rate** = tasks with a `reopened` event / tasks ever closed.

## 7. Where it shows

New page "סטטיסטיקת משימות EMS" (React island under app/, new entry in `canShowPage`), visible to עידן and עמיחי only; a tile on the manager home can link to it later. Pure builders in `app/src/lib/emsLifecycle.ts`, fed by a select on the two tables. Kibbutz name joined to `kibbutzim` by site id where possible.

## 8. RLS

Both tables have RLS on. `select` for `authenticated` only when the trusted `name` claim (minted by `ems-auth` from staff_identities) is עידן or עמיחי and the `viewer` claim is not true. No client insert/update/delete policies: writes only via `ems_apply_snapshot` (SECURITY DEFINER; rejects viewer sessions). Whether any staff browser may call it or only the office job: Q5.

## 9. Test plan

- Pure TS differ mirroring the SQL, golden fixtures: first sync, replay (zero events), assign, reassign, unassign, due set/change, close, reopen, disappear plus final-status resolution, page-cap crawl must NOT emit `disappeared`.
- Idempotency: same snapshot twice and two overlapping calls leave the event count unchanged.
- SQL test (style of test-visit-edit-lock-sql.mjs): RLS enabled, no client write policies, function is security definer with pinned search_path, viewer refused.
- Mapper parity: extended `emsSlimTask`/`slimTask` identical (test-ems-refresh.mjs), `EMS_CACHE_VER` pin.
- Stats builders: golden fixture per formula in section 6, null handling and denominators; a real-size fixture (thousands of tasks) per WORKING-METHOD rule 4.
- RLS matrix: עידן/עמיחי read; other staff and viewer denied; nobody writes directly.
- Backfill dry-run prints counts only.

## 10. Open questions for עידן

1. What exactly is "שובצה"? Assignee set (already true for 36/38 tasks, even `new`)? Assignee AND due date? Or status leaves `new`? Formula 1 depends on it.
2. Is 30-minute precision for assigned/closed acceptable if EMS does not send those stamps (the probe decides)?
3. Is closed-at approximated by EMS `updatedAt` acceptable for the backfill, with old tasks excluded from time-to-assign?
4. Which closed statuses count in on-time %: `done` only, or also `rejected / not_relevant / cancelled` (proposal: only `done`, the rest reported separately)?
5. May any signed-in staff browser feed snapshots to the differ, or only the office job (safer, but stats gap when the PC is off)?
6. Stats page audience: עידן and עמיחי only, as assumed?
7. Keep events forever, or prune after N months (proposal: keep, it is tiny)?
