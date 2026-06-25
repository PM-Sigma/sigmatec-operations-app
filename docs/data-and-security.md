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

### Tables (15)

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

DB helper scripts in `db/`: `supabase_schema.sql` (schema + RLS), `import_from_appsscript.mjs`
(one-time migration), `verify_read_parity.mjs` (parity check), `rls_staged.sql` (lockdown steps),
`parse_corrections.sql` (📦 inventory learning table), `dev_status_log.sql` (🧑‍💻 dev day-stamps table).

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

### Action items

1. Redeploy `ems-auth` (load `JWT_SECRET`) → verify `🔒 pass active`.
2. STEP 2 lockdown.
3. Rotate `service_role` + JWT secret; re-paste new anon key into `01-data.js` if it changes.
4. Add the Apps Script shared secret before deploying/wiring Option B calendar.
