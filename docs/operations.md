# Operations

## Build & deploy

1. Edit files in `js/src/*.js` (never edit `js/app.js` directly — it's generated).
2. `node build.mjs` — concatenates modules → `js/app.js`, stamps a fresh `?v=` on
   `app.js`/`app.css` in `index.html`.
3. Commit + push. **GitHub Pages auto-deploys** (`PM-Sigma/sigmatec-operations-app`).
4. Verify with a cache-buster: open `…/?cb=<something>` and check the loaded
   `app.js?v=<stamp>` matches the new build (SW is network-first, so a normal reload also works).

## Test flags (URL query)

| Flag | Effect |
|------|--------|
| `?sb=0` | Disable Supabase → mock/offline data layer. |
| `?login=0` | Skip the EMS login gate → legacy name-picker + PIN (break-glass). |
| `?cb=<x>` / `?v=<x>` | Cache-buster for verifying a fresh deploy. |

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

## Edge Function (`parse-order`) — AI order parsing  ⏳ awaiting key

Free-text (email/WhatsApp) → catalog item list, via Gemini free tier; learns from `parse_corrections`.
The frontend is **already live** and calls this function, with a graceful fallback to the local matcher —
so nothing breaks until it's deployed. To turn the AI on, do these **3 steps once**:

1. **Get a free Gemini API key** — https://aistudio.google.com → **Get API key → Create API key**.
   - The account **does not matter** (the key is only used server-side). If your **Workspace/org** account
     can't create one (admin-disabled), just use a **personal Gmail** — the key works identically.
   - (Alternative: a **Groq** free key — then change the URL/format in the function. Gemini is recommended.)
2. **Deploy the function:** Supabase → **Edge Functions → Create function → name it exactly `parse-order`**
   → paste the full contents of `supabase/functions/parse-order/index.ts` → **Deploy**.
   - Then **Edge Functions → Secrets → add `GEMINI_API_KEY`** = the key from step 1. (Re-deploy after setting it.)
   - Optional secrets: `GEMINI_MODEL` (default `gemini-2.0-flash`), `EMS_API_BASE` (defaults correctly).
   - **No other function needs changing.** The `github`/`ems-auth` functions are untouched.
3. **Create the learning table:** Supabase → SQL editor → run `db/parse_corrections.sql` (table + RLS).

That's it — reload the app, open a new order, paste text, **🪄 נתח לפריטים**. Every accepted order is saved as a
training example, so accuracy improves with use. If the key is missing/quota-hit, it silently falls back to the
local matcher (no breakage).

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
