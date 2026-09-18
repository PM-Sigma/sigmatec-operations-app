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
