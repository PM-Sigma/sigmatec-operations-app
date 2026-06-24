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
