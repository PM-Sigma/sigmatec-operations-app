# Operations

## Build & deploy

1. Edit files in `js/src/*.js` (never edit `js/app.js` directly — it's generated).
2. `node build.mjs` — concatenates modules → `js/app.js`, stamps a fresh `?v=` on
   `app.js`/`app.css` in `index.html`.
3. Commit + push. **GitHub Pages auto-deploys** (`PM-Sigma/sigmatec-operations-app`).
4. Verify with a cache-buster: open `…/?cb=<something>` and check the loaded
   `app.js?v=<stamp>` matches the new build (SW is network-first, so a normal reload also works).

### Versioning (the footer "גרסה {date}·{ver}" stamp)
`build.mjs` advances the version every build (the `VERSION` file holds the current token; `nextVersion()` computes the next):
- **Counter era:** plain integer `·N` up to **·100** (·98 → ·99 → ·100). This is the legacy scheme.
- **Decimal era:** the build **after ·100 rolls to `1.01`**, and each subsequent build **auto-increments the minor** (`1.01 → 1.02 → …`, zero-padded).
- **Major bump (big, sweeping update):** run **`node build.mjs major`** → next whole major `.00` (e.g. `2.00`, then `2.01 …`). The entire `·NN` + `1.xx` history counts as **major 1**, so the first big release jumps to **`2`**.
- Self-check: `node test-version.mjs` (mirrors `nextVersion`). Set the era/number by editing the `VERSION` file if ever needed manually.

## Test flags (URL query)

| Flag | Effect |
|------|--------|
| `?sb=0` | Disable Supabase → mock/offline data layer. |
| `?login=0` | Skip the EMS login gate → legacy name-picker + PIN (break-glass). |
| `?cb=<x>` / `?v=<x>` | Cache-buster for verifying a fresh deploy. |

## Function deploy handoff (convention — עידן)

When an edge-function file is new or updated and needs a manual redeploy, hand it off with **two links** (only):
1. **Local open link** to the file (opens it here), e.g. `supabase/functions/<fn>/index.ts`.
2. **GitHub address** on the branch, e.g.
   `https://github.com/PM-Sigma/sigmatec-operations-app/blob/<branch>/supabase/functions/<fn>/index.ts`.

No raw-content link. **Reply to עידן in full English.**

## Edge Function (`ems-auth`)

- Deploy/redeploy: Supabase → **Edge Functions → `ems-auth` → Code → Deploy**.
- **Secrets** (Edge Functions → Secrets): `JWT_SECRET`, `EMS_API_BASE`.
  **Redeploy after changing a secret** (loaded at deploy time).
- "Verify JWT with legacy secret" toggle: **OFF** (the function does its own EMS auth).
- Test from the app console (fire-and-forget, no token in transcript):
  ```js
  fetch(SB_URL+'/functions/v1/ems-auth',{method:'POST',
    headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON,'Content-Type':'application/json'},
    body:JSON.stringify({emsToken:localStorage.getItem('ems_token_v1')})})
    .then(r=>r.text().then(t=>window.__r='['+r.status+'] '+t));
  // then read window.__r
  ```

## Edge Function (`parse-order`) — AI order parsing (PROVIDER CHAIN: Gemini → Groq)

Free-text (email/WhatsApp) → catalog item list; learns from `parse_corrections`. The function tries each
configured AI provider **in order and uses the first valid (non-error) answer** — so one provider's quota
can't block you. The frontend calls it with a graceful fallback to the local matcher (never breaks).

**Set at least one AI key as a secret** (Edge Functions → Secrets), then re-deploy the function:
- **`GEMINI_API_KEY`** — https://aistudio.google.com → Get API key. *(On עידן's key: `gemini-2.0-flash` → 429
  quota, `gemini-1.5-flash` → 404 (1.5 retired). Working model = **`gemini-2.5-flash-lite`** (the default now).
  Override with `GEMINI_MODEL`.)*
- **`GROQ_API_KEY`** — https://console.groq.com → API Keys (plain email signup, no Google/Workspace). Default model
  `llama-3.3-70b-versatile`; override with `GROQ_MODEL`.
- Optional: `GEMINI_MODEL`, `GROQ_MODEL`, `EMS_API_BASE` (defaults correctly).

**Deploy steps:** Supabase → Edge Functions → `parse-order` → paste the full `supabase/functions/parse-order/index.ts`
→ Deploy → add the secret(s) → re-deploy. Learning table: SQL editor → `db/parse_corrections.sql` (done).
The account behind a key doesn't matter (server-side only). **No other function changes** (`github`/`ems-auth` untouched).

Account/region note: if Google's free tier is 0-quota for your key (429 even on one call), set `GROQ_API_KEY` —
the chain will use Groq automatically. The response includes `provider` so you can see which one answered.

## Edge Function (`github`) — dev page (פיתוח), read + write

EMS-gated proxy to the GitHub **Projects-v2 "Sigmatec EMS — Roadmap" (Sigmatec-Energy #1)**.
- **Deploy/redeploy:** Supabase → Edge Functions → `github` → paste `supabase/functions/github/index.ts` → Deploy.
- **Secrets:** `GH_TOKEN` (GitHub PAT), `GH_REPO` (default `Sigmatec-Energy/tasks`), `GH_PROJECT_OWNER`/`GH_PROJECT_NUMBER`
  (default `Sigmatec-Energy`/`1`), `EMS_API_BASE`, `APP_ORIGIN` (default prod; CORS also reflects `*.githack.com` + localhost).
- **`GH_TOKEN` scope (GOTCHA):** reads work with **`read:project`** (read-only). **Writes** (`mode:"setStatus"`)
  need the full **`project`** scope — `read:project` is NOT enough (GitHub: *"requires ['project'], token has only
  ['read:project']"*). This bit us at ·87–·89: board read fine, every push failed `0·נכשלו:1`. Fix = add **`project`**
  to the classic PAT (editing the existing token's scopes works in place — no new value, no redeploy). Verified live ·89.
- **Read** (default POST `{token,state}`): returns tickets + Priority/Status/sub-issue `parent`.
- **Write** (POST `{token,mode:"setStatus",numbers:[…],status:"Ready"|"Committed"}`): `setProjectStatus()` sets the
  Status field for those issues → `{updated,failed,statusOptions,target}`. The target option (e.g. **Committed**) must
  exist in the project's Status field. Used by **דחוף ל-Ready** + **🚀 עלתה גרסה**.
- **Day-stamps table:** `db/dev_status_log.sql` (run once in SQL editor). The client logs each ticket's current stage.

## Database

- Schema: run `db/supabase_schema.sql` in the SQL editor.
- RLS lockdown: `db/rls_staged.sql` (STEP 1 done → STEP 2 after verify → rollback if needed).
- Migration/verify: `db/import_from_appsscript.mjs`, `db/verify_read_parity.mjs` (Node; need
  `SUPABASE_URL`/keys + the Apps Script `/exec` — kept out of the repo).

## Apps Script (Option B — `appsscript/ems-calendar-backend.gs`)

Deploy under an `@sigmatec-energy.com` account (ideally `information@`):
1. script.google.com → new project → paste the file.
2. Set `CALENDAR_ID` (office calendar).
3. **(Add the shared-secret check first — see security doc.)**
4. Deploy → Web app → Execute as: Me · Who has access: Anyone.
5. Run `authorizeOnce` once (grants Calendar + external-fetch).
6. Send the `/exec` URL → repoint `SHEET_API` in `01-data.js`, wire the calendar UI, retire the
   legacy personal-Gmail script + old gist.

## Environment

| Thing | Value |
|-------|-------|
| Live app | https://pm-sigma.github.io/sigmatec-operations-app/ |
| Repo | `PM-Sigma/sigmatec-operations-app` (public) |
| Supabase | `https://wwqfcajnxinaxmobrgol.supabase.co` (ref `wwqfcajnxinaxmobrgol`) |
| ems-auth fn | `…supabase.co/functions/v1/ems-auth` |
| EMS API | `https://api.sigmatec-ems.com` (`/v1/...`) |
| EMS admin web | `https://sigmatec-ems.com/admin/{meters\|employee-tasks}/{id}` |
| Office calendar | `information@sigmatec-energy.com` |
| Legacy gist (to retire) | `gist.githack.com/PM-Sigma/4863a959e53104be99a98fa33b5abace/raw/kibbutz-dashboard.html` |
| `SHEET_API` | Apps Script `/exec` (legacy v5.9, still live for EMS proxy) — in `01-data.js` |

## Project layout

- **Active project:** `C:\Users\idann\Projects\Sigmatec Operations App\`
- **Legacy (archived):** `C:\Users\idann\Projects\kibbutz-dashboard\` → everything in `archive/`.
- `docs/claude-memory/` — git-ignored handoff notes (contains a test credential).
- `docs/*.md` — this committed reference set.
