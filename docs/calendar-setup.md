# Connecting the office calendar (יומן) — setup guide

This is the end-to-end guide to wire the **office Google Calendar** into the app. The backend
(`supabase/functions/calendar`) is already written and deployed; what's left is a one-time Google +
Supabase configuration, plus a small client fetch (Step 5). Allow ~20 minutes.

> **Good news on the model:** the function uses **calendar sharing**, *not* Google Workspace
> **Domain-Wide Delegation**. You do **not** need a Workspace super-admin to authorize a client_id or
> add an impersonation (`sub`) claim. You just **share one calendar with a service account**. Simpler and
> least-privilege. (An older backlog note said DWD — that's stale; ignore it.)

---

## How it works (architecture)

```
PWA (יומן page)
  └─POST {token, action:'list'|'add', …}→  Supabase Edge Function `calendar`
                                              • verifies the EMS login (token) live against the EMS API
                                              • signs a Google service-account JWT (scope: calendar.events)
                                              • calls the Google Calendar API for ONE fixed calendar (GCAL_ID)
                                              └─→ Google Calendar
```

- **EMS-gated:** every call must carry a valid EMS login token, or the function returns `401`.
- **Least privilege:** the service account can only touch the single calendar that's been **shared with
  it**; the calendar id is fixed server-side (`GCAL_ID`) — the client can't target another calendar.
- **Two actions:** `list` (upcoming events) and `add` (create an event). No delete/edit by design.

---

## Prerequisites

- A **Google Cloud project** (any project; can be the one already used for the service account).
- Access to the **Supabase project** `wwqfcajnxinaxmobrgol` → Edge Functions → Secrets.
- Owner/share rights on the **target calendar** (default: `information@sigmatec-energy.com`).

---

## Step 1 — Service account + key (Google Cloud Console)

1. Go to **console.cloud.google.com** → pick (or create) a project.
2. **APIs & Services → Library →** search **"Google Calendar API" → Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account.**
   - Name it e.g. `sigmatec-calendar`. No roles needed (it gets access via calendar sharing, not IAM).
4. Open the new service account → **Keys → Add key → Create new key → JSON → Create.** A `.json` file
   downloads. Keep it safe — it's a secret.
5. From that JSON you need two fields:
   - `client_email`  → e.g. `sigmatec-calendar@<project>.iam.gserviceaccount.com`  → this is **`GCAL_SA_EMAIL`**.
   - `private_key`   → the full `-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n` block → **`GCAL_SA_KEY`**.

---

## Step 2 — Share the calendar with the service account ⭐ (the key step)

1. Open **Google Calendar** as the calendar's owner (the account that owns `information@sigmatec-energy.com`,
   or whichever calendar you want to use).
2. Left sidebar → hover the calendar → **⋮ → Settings and sharing**.
3. **Share with specific people or groups → Add people →** paste the service account's **`client_email`**
   (from Step 1).
4. Set permission to **"Make changes to events"** (this is required for `add`; "See all event details" alone
   only allows `list`). → **Send.**
5. Note the calendar's **Calendar ID** (same Settings page → "Integrate calendar → Calendar ID"). For a
   primary mailbox it's just the email (`information@sigmatec-energy.com`). This is **`GCAL_ID`**.

> That's the whole authorization. No admin console, no DWD, no client_id authorization.

---

## Step 3 — Set the Supabase secrets + redeploy

In **Supabase → Project `wwqfcajnxinaxmobrgol` → Edge Functions → `calendar` → Secrets**, set:

| Secret | Value |
|---|---|
| `GCAL_SA_EMAIL` | the service account `client_email` |
| `GCAL_SA_KEY`   | the full `private_key` PEM (paste as-is; literal `\n` or real newlines both work) |
| `GCAL_ID`       | the calendar id (default `information@sigmatec-energy.com` — set only if different) |
| `APP_ORIGIN`    | `https://pm-sigma.github.io` (the live app origin — already the default) |
| `EMS_API_BASE`  | `https://api.sigmatec-ems.com` (already set) |

**Then redeploy the function** — secret changes only take effect on a redeploy:
- Supabase Dashboard: Edge Functions → `calendar` → **Deploy** (paste `supabase/functions/calendar/index.ts`), **or**
- CLI: `supabase functions deploy calendar --project-ref wwqfcajnxinaxmobrgol`

---

## Step 4 — Smoke-test the function (before touching the UI)

Grab a valid EMS token (log into the app, then in the browser console: `getEmsToken()`), then:

```bash
# list upcoming events
curl -s -X POST "https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/calendar" \
  -H "apikey: <SB_ANON>" -H "Authorization: Bearer <SB_ANON>" -H "Content-Type: application/json" \
  -d '{"token":"<EMS_TOKEN>","action":"list","days":90}'
# → {"calendar":[{id,title,start,end,allDay,location,description}, …]}

# add a test event
curl -s -X POST "https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/calendar" \
  -H "apikey: <SB_ANON>" -H "Authorization: Bearer <SB_ANON>" -H "Content-Type: application/json" \
  -d '{"token":"<EMS_TOKEN>","action":"add","title":"בדיקה","start":"2026-07-01T09:00:00","allDay":false}'
# → {"ok":true,"id":"…"}   (and it appears in the shared Google Calendar)
```

`<SB_ANON>` is the anon key already in `js/src/01-data.js`.

---

## Step 5 — Wire the client (remaining code step) ⚠️

The UI **does not call the function yet** — `renderCalendarAgenda()` reads `window.SHEET_DATA.calendar`,
which nothing populates today. Once Steps 1–4 pass, add a small fetch so the יומן shows real events.

Minimal wiring (in `js/src/14-calendar.js`, call it once on connect / when opening the calendar):

```js
// fetch office-calendar events into SHEET_DATA.calendar (keyed for the agenda + grid)
async function loadOfficeCalendar() {
  var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
  if (!tok) return;                                   // EMS-gated
  try {
    var r = await fetch(SB_URL + '/functions/v1/calendar', {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok, action: 'list', days: 90 })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok || !Array.isArray(d.calendar)) return;
    // collectCalendarEvents()/renderCalendarAgenda() expect { kib: [{start,type,…}] }; a single
    // "office" bucket is enough for display:
    window.SHEET_DATA = window.SHEET_DATA || {};
    window.SHEET_DATA.calendar = { 'משרד': d.calendar.map(function (e) { return { start: e.start, type: e.title }; }) };
    if (typeof renderCompanyCalendar === 'function') renderCompanyCalendar();
  } catch (e) { /* graceful: calendar just stays empty */ }
}
```

Call `loadOfficeCalendar()` from `emsOnConnected()` (so it loads after a connect) and/or when the יומן page
opens. **Tell me when Steps 1–4 are green and I'll wire this in + the "➕ הוסף אירוע" button (the `add`
action) and verify it live.**

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401 unauthorized: valid EMS login required` | No/expired EMS token in the request. Re-login; pass a fresh `getEmsToken()`. |
| `500 service account not configured` | `GCAL_SA_EMAIL`/`GCAL_SA_KEY` not set, or you didn't **redeploy** after setting them. |
| `500 google token: …invalid_grant…` | `GCAL_SA_KEY` malformed — make sure the **entire** PEM (BEGIN…END) is pasted; newlines as `\n` or real are both fine. |
| `502 calendar list/add failed … Not Found` | The calendar isn't **shared** with the service account, or `GCAL_ID` is wrong. Re-check Step 2. |
| `502 … add failed … insufficient permissions` | Sharing is read-only — set it to **"Make changes to events"** (Step 2.4). |
| CORS error in the browser from a **dev-preview** (githack) | The `calendar` function reflects only `APP_ORIGIN` (production). Test from the live site, or temporarily widen CORS like the `github` function does. |

---

## Security notes (why this design)

- The service-account key never leaves Supabase's encrypted secret store — not the repo, not the client bundle.
- Scope is `calendar.events` only, on **one shared calendar** — the function can't read mail, contacts, or
  other calendars. No Domain-Wide Delegation means no org-wide impersonation surface.
- Every call is EMS-login-gated and CORS-locked to the app origin.
