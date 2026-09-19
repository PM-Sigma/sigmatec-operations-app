# Data model & security

## Supabase

- **Project ref:** `wwqfcajnxinaxmobrgol` · **URL:** `https://wwqfcajnxinaxmobrgol.supabase.co`
- **Data layer:** `01-data.js` routes all reads/writes. `USE_SUPABASE` (default ON; `?sb=0`
  → mock). The router monkey-patches `window.fetch`; `ems/transcribe/parseRequest` POSTs
  stay on Apps Script. Helpers `sbGet/sbUpsert/sbInsert/sbDelete` use `baseH()` — a
  **dynamic auth header**: the authenticated bridge token if active & unexpired, else `SB_ANON`.
- **Snapshot:** `readSnapshot()` assembles the app snapshot from ~13 tables (snake_case →
  camelCase, numeric coercion via `numish()`, `tasks.seq` exposed as `row`). Dates stored as
  **text ISO strings** for byte-parity with the old Sheets snapshot.

### Tables (17)

| Table | Purpose |
|-------|---------|
| `tasks` | Kibbutzim/cards. PK `seq`(→`row`), unique `tasks_name_uq` on name. The `task` field is an encoded string (PROC_DONE/step/note/cat/type). |
| `visits` | Visit logs (visitor, kibbutz, products, workday flag). |
| `products` | Product catalog (active flag). |
| `orders` | Orders + line items + per-location distribution. |
| `movements` | Stock movement ledger → stock is *computed* from this. |
| `requirements` | Customer requirements (דרישות) + line items. |
| `returns` | Returned equipment. |
| `attendance` | Daily attendance (Aviam/Nitai). |
| `settings` | key → jsonb (app settings, company tasks, etc.). |
| `potentials` | Potential clients. |
| `regions` | code → name. |
| `ems_cache` | Singleton (`id=1`) shared EMS task cache. |
| `ems_queue` | Outbound EMS write queue (identity PK, jsonb payload). |
| `parse_corrections` | 📦 Inventory: order-parser learning store (`{raw_text → items}` few-shot for `parse-order`). Anon read, auth insert. |
| `dev_status_log` | 🧑‍💻 Dev page: PK `(issue,status)` + `day`. First day each ticket was seen in each pipeline stage → the gray day-stamps. Anon read, auth insert (`on_conflict do nothing`). |
| `meter_burns` | 🔥 צריבות: one row per Landis E360 generation meter (EMS snapshot cols + status/burned_by/burned_at/generator_id/note). Anon read; authenticated insert+update (insert added 7.9.26 so the tab can upsert the EMS-owned columns live from the EMS; tracking columns are app-owned). |
| `generators` | 🔥 צריבות: generators per site (`unique(site,name)`, `device_serial`). Anon read, auth insert/update. |

DB helper scripts in `db/`: `supabase_schema.sql` (schema + RLS), `import_from_appsscript.mjs`
(one-time migration), `verify_read_parity.mjs` (parity check), `rls_staged.sql` (lockdown steps),
`parse_corrections.sql` (📦 inventory learning table), `dev_status_log.sql` (🧑‍💻 dev day-stamps table),
`meter_burns.sql` (🔥 צריבות schema + RLS) + `gen_meter_burns_seed.mjs` (generates the seed from the EMS export CSV).

---

## Security model

### RLS staging (`db/rls_staged.sql`) — reversible, no-lockout

- **Baseline** (`supabase_schema.sql`): RLS ON for all 13 tables + a permissive `anon_all`
  policy (`for all to anon`) — parity with the previously-open Apps Script endpoint.
- **STEP 1 — DONE:** add `auth_all` (`for all to authenticated`) on all tables. Bridge tokens
  now work; nothing changes for users. (User ran it: "Success.")
- **STEP 2 — PENDING (lockdown):** drop the `anon_all` policies → only a valid EMS-bridge
  `authenticated` token can read/write. **Run only after** confirming `🔒 pass active` and a
  successful logged-in write. Commented out in the file until then.
- **Emergency rollback:** re-create `anon_all` to re-open if EMS is unreachable.

### The auth bridge

`ems-auth` Edge Function (`supabase/functions/ems-auth/index.ts`):
1. `POST {emsToken}` → validate by calling `GET ${EMS_API_BASE}/v1/employee-tasks?take=1`
   with the token (non-200 → `401 invalid EMS token`).
2. Extract `sub` from the EMS JWT (`id`/`sub`/`userId`).
3. Mint an **HS256** JWT `{role:"authenticated", aud:"authenticated", iss:"ems-bridge", sub,
   exp:+60min}` signed with `JWT_SECRET` → `{token}`.
- **Env vars (names):** `JWT_SECRET` (= the Supabase project JWT secret — required, set in
  Edge Function **Secrets**), `EMS_API_BASE` (default `https://api.sigmatec-ems.com`).
- **Client side** (`15-login-gate.js` `sbBridge()`): stores the token, then **self-verifies**
  with a test read; if rejected → drops it → stays on anon (safe during staging).
  Flag `USE_SB_BRIDGE` (in `01-data.js`).

> ⚠️ **Known gotcha:** secrets are loaded into the running function **at deploy time**. If you
> add/change `JWT_SECRET` after deploying, **redeploy** the function or it reads empty
> (`"Key length is zero"` 500). The minted token is HS256-signed with the *legacy* project JWT
> secret — which still verifies (the public `anon` key is itself a legacy HS256 token), so this
> works as long as `JWT_SECRET` = that secret.

### Keys

| Key | Sensitivity | Action |
|-----|-------------|--------|
| `anon` (`SB_ANON`) | **Public by design** (in the bundle). RLS protects data. | none |
| `service_role` | **Secret — full DB, bypasses RLS.** Exposed in session transcripts. | **ROTATE** after #4 (regenerate → also rotates JWT secret). Never ship to the browser. |
| `JWT_SECRET` (project JWT secret) | Secret. Lives only in the Edge Function secret store. | rotate together with service_role |

### Apps Script security (honest assessment — *not* 100%)

- **Deployment:** "Execute as me · Anyone with the link." The `/exec` URL is **embedded in
  the public bundle** (`SHEET_API`) → obscurity provides **no** protection; assume anyone can
  call it.
- **EMS proxy:** low-risk — domain-locked to `*.sigmatec-ems.com` (no SSRF elsewhere) and uses
  the **caller's own EMS token** (no token → EMS rejects).
- **Calendar (Option B):** the read/add endpoints run as the office account and are
  **unauthenticated** → anyone with the URL could read or spam the office calendar.
  **→ Mitigation (do before wiring calendar): a shared secret** the script checks on every
  request. ~5 lines; kills the "anyone with the URL" problem.
- **Blast radius:** the script holds only **Calendar + external-fetch** scopes (not Gmail/Drive).

## 2.00 additions (Task 7 checkpoint, 2026-09-19)

New tables shipped on `feat/kibbutz-cards-redesign` (schema files in `db/`). **Migrations are
committed but NOT yet applied to prod** unless noted — see `docs/HANDOFF-עידן.md` part B for the
apply order (dependency order matters, listed there).

| Table | Purpose | Migration | Applied? |
|-------|---------|-----------|----------|
| `kibbutzim` | Card data-source (region, status, notes, EMS site link); replaces the static card grid + `tasks`-as-card-source. | (part of the T1 migration set) | prod |
| `day_plans` | Field route order per day (drag-reorder persisted). | `db/day_plans.sql` | ⛔ parked |
| `calendar_absences` | 🌴/🪖/🎉 absences; adds `attendance.source`. | `db/calendar_absences.sql` | ⛔ parked |
| `internal_tasks` | 🔒 internal task list (read-only client-side until `INTERNAL_TASKS_WRITABLE` flips). | `db/internal_tasks.sql` | ⛔ parked |
| `daylog_corrections` | 📝 few-shot pairs (raw_len only, no text) improving the day-log parser. | `db/daylog_corrections.sql` | ⛔ parked |
| `meeting_sessions` | ▶ presenter-mode session state. | `db/meeting_sessions.sql` | ⛔ parked |
| `meeting_events` | Presenter events (note/task/parking) per session. | `db/meeting_events.sql` | ⛔ parked |
| `kibbutz_meeting_notes_source` | Raw imported meeting-notes rows, canonical-name merge key. | `db/kibbutz_meeting_notes_source.sql` | ⛔ parked |
| `onboarding_templates` / `onboarding_steps` | New-client onboarding checklist templates + per-client progress (`waits` column). | `db/onboarding_templates.sql`, `db/onboarding_steps.sql` | ⛔ parked |
| `kibbutz_health` | Health v1 scorer inputs/outputs (thresholds still DRAFT, decision pending 22.9). | `db/kibbutz_health.sql` | ⛔ parked |
| `work_sessions` | ▶/■ Clockify work-session timer per kibbutz card. | `db/work_sessions.sql` | ⛔ parked |
| `usage_events` | 📈 usage analytics feeding the weekly narrative digest. | `db/usage_events.sql` | prod (Task 17) |
| `feedback` (+ `feedback_kinds`) | 📣 feedback box (idea/bug/complaint), audio via `feedback-audio` bucket. | `db/feedback.sql`, `db/feedback_kinds` migration | prod (Task 6/6b) |
| `company_holidays` (+ seed) | 🕎 Hebcal holidays for attendance/gap logic. | `db/company_holidays.sql`, `db/company_holidays_seed.sql` (38 rows) | ⛔ parked |
| `inventory_pool` (+ `products` display_name/unit/min_qty, `inventory_alerts`) | 📦 P6/Task 8 — the ONE stock pool (`חברה`); people are no longer locations. Movements trigger emits the low-stock branch. | `db/inventory_pool.sql` | ⛔ parked |
| `stock_recounts` | Every 🔢 recount's own evidence note (NOT NULL), auditable against its `movements` row. | `db/stock_recounts.sql` | ⛔ parked |
| `inventory_pool_v2` | P6/Task 10 — low-stock alert plumbing, second generation. | `db/inventory_pool_v2.sql` | ⛔ parked |
| `inventory_alert_webhook` (+ `push_config` insert) | P6/Task 10 — outbound low-stock push. | `db/inventory_alert_webhook.sql` | ⛔ parked |

**Three RLS lockdowns (Task 18a/18b + Task 31, run in this exact order relative to app deploys):**
- `db/rls_corrections_lockdown.sql` — must run **AFTER** `parse-daylog` + `parse-order` are
  redeployed, or it silently kills the few-shot correction flow for both parsers.
- `db/rls_certs_checkins_lockdown.sql` — drops anonymous `SELECT` on `delivery_certs` and
  `field_checkins` (today enumerable: customer names, ח.פ., signatures, who-was-where-when) and
  adds `cert_by_id(uuid)` (security definer) for the cert share-link. Must run **AFTER** 2.00 is
  live on `main`, because the cert viewer's one-release RPC fallback still reads the open table
  until then.
- `db/rls_2_00_lockdown.sql` — **LAST**. Task 31 audit C found that after all of the above, the
  public anon key still `SELECT`ed 15 business tables, because `for select using (true)` with no
  `to` clause grants to `public` (which includes `anon`). This file re-creates every one of them
  `for select to authenticated`, replaces `push_subscriptions`' `for all to anon` (anyone with the
  bundle could delete every push subscription in the company), turns `inventory_alerts` /
  `stock_recounts` into append-only audit trails with an `alert_mark_seen(id, person)` RPC for the
  bell, drops the `work_sessions` ownership tautology (`person = coalesce(auth.jwt()->>'name',
  person)` is `person = person` — the bridge pass has no identity claim), and adds the
  `meter_burns` INSERT policy this document already promised. `company_holidays` is locked down
  too: the login screen never reads it. `db/rls_2_00_lockdown.sql` ships WITH the client change in
  `app/src/islands/Alerts.tsx`, so deploy them together. `node test-rls-policies.mjs` is the static
  sweep that keeps this true.

**Re-run needed:** `db/kibbutz_meeting_notes_import.sql` (`create or replace`, safe to re-run) — a
kibbutz that changed name (e.g. `גת`→`קיבוץ גת`) now keeps its EMS link/✓ across re-imports via
`aliasRenames()` instead of losing it.

**New Edge Functions / redeploys needed:** `calendar` (route range + `hangoutLink`), `push-send`
(carries `usageDigest`, `gapReminder`, feedback/Task-6 titles — currently v13 live, several modes
behind), `parse-daylog` (new, Gemini→Groq chain like `parse-order`, EMS-gated, nothing server-trusted),
`parse-order` (redeploy, shares the corrections-lockdown ordering above), `github` (comments now
included in the read), `clockify` (new, needs `CLOCKIFY_API_KEY`/`WORKSPACE_ID`/`USER_ID` secrets).
`transcribe` (Groq Whisper) already deployed v3, no action needed.

**New cron jobs (parked):** `db/cron_usage_weekly.sql` (weekly 📈 digest + re-schedules the
attendance job with the auth header), a 15-minute visit-reminder cron, an hourly attendance-header
cron, `db/cron_inventory_digest.sql` (P6/Task 10 — daily low-stock digest). All need `CRON_SECRET`
set first.

**P6 migration ordering (Tasks 8–10):** `db/inventory_pool.sql` → `db/stock_recounts.sql` → run
`node db/pool_migration.mjs` (dry-run by default; the dry run against production found 20 rows /
1079 units to migrate — אביאם + ניתאי only, משרד/עמיחי net to 0, and one negative balance, מונה
E360PP ×2 at אביאם, which the migration absorbs) → show עידן the numbers → `--apply --yes` →
`db/inventory_pool_v2.sql` → `db/inventory_alert_webhook.sql` (+ the `push_config` insert it needs)
→ `db/cron_inventory_digest.sql`. `stock_recounts` is covered by `db/rls_2_00_lockdown.sql`'s
append-only treatment above — no separate lockdown file needed for it.

Full list, order, and links: `docs/HANDOFF-עידן.md`.

### Action items

1. Redeploy `ems-auth` (load `JWT_SECRET`) → verify `🔒 pass active`.
2. STEP 2 lockdown.
3. Rotate `service_role` + JWT secret; re-paste new anon key into `01-data.js` if it changes.
4. Add the Apps Script shared secret before deploying/wiring Option B calendar.
