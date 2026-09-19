# The EMS session — how long it lives, and what happens when it ends

Spec §7n. Two tokens are involved, and only one of them is ours.

| | who mints it | lives | renewed by |
|---|---|---|---|
| **EMS token** (`ems_token_v1`) | the EMS, at sign-in (e-mail + password → e-mailed code) | unknown TTL, see below | **nothing** — a fresh sign-in only |
| **write pass** (`window._sbToken`) | our `ems-auth` function, traded for the EMS token | **180 min** (was 60) | the client, every 50 min and on every return to the foreground |
| client session cap | the app | **12 h** (a workday) | — |

## What the app does

- The pass is minted at sign-in and re-minted **every 50 min** while the EMS token is alive, and
  again whenever the tab comes back to the foreground with less than 10 min left
  (`js/src/15-login-gate.js`; the math is `app/src/lib/remint.ts`, unit-tested).
- Any `401` — an EMS call, a read, a write — funnels into ONE debounced
  `session-expired` (`js/src/00-bridge.js`), which raises the single re-login sheet
  (`app/src/components/ReLoginSheet.tsx`). The page, the scroll position and the open visit
  draft are kept, and the sign-in lands the person back where he was.
- After 12 h the session ends on purpose and a fresh sign-in is required.

## ⚠️ One secret has to be set by hand: `VIEWER_PIN`

The view-only entry (👁 צפייה) has no EMS account by design, so until now it held **no write
pass at all** — which, with the business tables authenticated-only, meant empty screens and a
sign-in sheet a viewer could not satisfy. The access code is therefore checked **server-side**
now: `ems-auth` accepts `{ mode: "viewer", pin }`, compares the code against its own
`VIEWER_PIN` secret, and mints the same 180-min pass with the subject `viewer`. The code is no
longer a constant in the client bundle.

**Until the secret is set, the viewer entry fails closed** — it answers
`כניסת הצפייה עוד לא הופעלה — עידן צריך להגדיר את קוד הצפייה` (HTTP 503, `setup: "VIEWER_PIN"`)
and never falls back to a client-side code. Nothing else is affected: an EMS sign-in is
untouched.

**עידן — one-time setup** (an agent cannot set a secret through the MCP tools):

1. Supabase dashboard → the project → **Edge Functions → Secrets → Add new secret**
   (or `supabase secrets set VIEWER_PIN=<code>` with the CLI).
2. Name: `VIEWER_PIN` · Value: **the 4-digit view-only code the team already uses** — the one
   that was the `VIEWER_PIN` constant in `js/src/15-login-gate.js` until this task removed it
   (`git show 0925a56:js/src/15-login-gate.js | grep VIEWER_PIN`). It is deliberately not
   written in this file or in the task report any more.
3. No redeploy is needed — the function reads its secrets per request. Verify with the app:
   the gate's 👁 entry should sign in and the cards should load.
4. From now on the code is rotated in that one secret, not in the client.

The code the person types is kept in `sessionStorage` for that browser session only, so the
silent re-mint every 50 min needs no re-typing; it is gone when the browser closes, and a
logout removes it immediately.

### The guessing limit (why a short code behind a public function is still safe)

`ems-auth` counts the failures itself: every refused viewer attempt is one row in
**`auth_attempts`** (written with the service role; the table is RLS-enabled with **no
policies** and its privileges revoked, so no client role can read or write it — verified: anon
and authenticated both get `42501`). From the **6th** attempt of the same address within
**15 minutes** the answer is `429` with *"יותר מדי ניסיונות — נסה שוב בעוד 15 דקות"*, and the
code is not even looked at. Every failure also costs a constant **300 ms** — the same for a
right-length wrong code as for a wrong-length one, so nothing can be measured from the timing.
A successful sign-in **deletes that address's rows**, so a person who mistyped four times and
then got it right starts clean. The address is the **first hop** of `X-Forwarded-For` (the later
hops are the client's to forge), and a missing header becomes one shared bucket rather than an
exemption. If the table is ever unreachable the count reads 0 — the limit must never become an
outage of the sign-in itself.

The numbers and the sentence live in `app/src/lib/authThrottle.ts` (unit-tested, and a contract
test asserts the function agrees). **Note:** the limit only comes into play once `VIEWER_PIN` is
set — before that the entry is closed for everyone anyway (503, above).

## Probe findings — is there an EMS refresh? (18.9.26)

`scripts/ems-auth-probe.mjs` (the token comes from `EMS_TOKEN` in the environment, never from
the repo, and is never printed). Run without a token it reports only what it can; the endpoint
existence check below needs no token, because a route that exists answers `401`/`422` while a
route that does not answers `404`:

```
POST /v1/auth/login/password  → 422   (exists — rejects the empty body)
POST /v1/auth/verify-otp      → 401   (exists)
POST /v1/auth/resend-otp      → 401   (exists)
POST /v1/auth/refresh         → 404   (does NOT exist)
POST /v1/auth/token/refresh   → 404   (does NOT exist)
GET  /v1/auth/me              → 404   (does NOT exist)
```

**Conclusion: the EMS has no refresh endpoint today.** So:

1. the OTP sign-in stays the only way to renew the EMS token — which is exactly what the
   re-login sheet asks for, once, wherever the person is;
2. the pass TTL (180 min) and the proactive re-mint remove every expiry we *can* remove;
3. the EMS side is asked for a refresh / a longer TTL through a dev-board card:
   **`[הרשאות] | [סשן] | refresh token / TTL ≥ 8h לאפליקציית התפעול`**, child of the
   `הרשאות` parent (#87). Create it with the `github` function, which needs a live EMS token —
   from the app: the 📣 inbox's 🐙 button, or

   ```
   POST {SB_URL}/functions/v1/github
   { "mode": "createIssue", "token": "<EMS token>", "parent": 87,
     "title": "[הרשאות] | [סשן] | refresh token / TTL ≥ 8h לאפליקציית התפעול",
     "body": "…the app cannot renew an EMS session silently: /v1/auth/refresh is 404…" }
   ```

   ⚠️ **Still open at the end of Task 21** — the function gates on a valid EMS token, and the
   task ran with none available. The next session that is signed in should fire the call above.

## Re-running the probe

```
EMS_TOKEN=<token from a real sign-in> node scripts/ems-auth-probe.mjs
```

It prints the token's own `exp`/`iat` (so the real EMS TTL stops being a guess), the status of
each candidate refresh route, and a one-line conclusion. Update the table above when it changes.

## The gateway — how the app reaches the EMS at all (spec §7o, Task 18b)

Everything above is about the *session*. What uses it is a single object.

```
feature code  →  emsGateway()  →  ems-rest adapter  →  sigma.emsApi (Apps-Script proxy)  →  EMS
                     ▲
                legacy JS reaches the SAME instance as `sigma.ems`
```

| where | what |
|---|---|
| `app/src/lib/ems/types.ts` | the app-owned types (`EmsTask`, `EmsSite`, `EmsMeter`, `EmsUser`, `EmsComment`). No feature ever sees raw API JSON. |
| `app/src/lib/ems/gateway.ts` | the `EmsGateway` interface, `emsGateway()`, `emsCan(op)` and `installEmsBridge()` |
| `app/src/lib/ems/adapters/rest.ts` | **the only place allowed to build an EMS URL or read raw EMS JSON** |
| `sigma.ems` | the same instance, published on the bridge by `main.tsx` on boot |

**Operations:** `listSites` · `listMeters` · `getMeter` · `listOpenTasks` · `getTask` ·
`createTask` · `updateTask` · `listComments` · `addComment` · `listUsers` · `listAlerts` ·
`energyBalance` · `billingSummary`.

**`capabilities()`** answers which of those the *current* transport actually has, so a button is
only drawn for an operation that exists. REST answers `false` for `listAlerts`,
`energyBalance` and `billingSummary` — the EMS REST API has no endpoint for them.

**Writes** (`createTask` / `updateTask` / `addComment`) go through `sigma.emsWrite` =
`emsWriteOrQueue`, so the offline queue is unchanged: a write is tried live, queued on a
connectivity/expiry failure, and surfaced on a real `4xx`.

**401** is unchanged too — the adapter does not handle it. `emsApi` clears the session and
raises the one debounced `session-expired` described above.

### Adding the MCP adapter later

1. Write `app/src/lib/ems/adapters/mcp.ts` implementing `EmsGateway`, with its own
   `capabilities()` derived from the MCP tool list.
2. Run `app/src/lib/ems/rest.test.ts`'s mapping goldens against it (the response half is
   transport-independent).
3. Select it in `emsGateway()` behind `VITE_EMS_TRANSPORT=mcp` — per operation during the
   migration, since `capabilities()` already lets the UI cope with a partial transport.

No feature file changes. `test-integration.mjs` fails the build if a direct `emsApi(` / EMS
`fetch(` appears outside the adapter; the files still awaiting migration are listed with their
reasons in `scripts/integration-map.mjs` (`EMS_LEGACY_ALLOWLIST`) and rendered into
`docs/integration-map.md` section (h).
