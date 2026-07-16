# Web Push notifications — design spec

STATUS: 🟡 CODE DONE on `feat/web-push` — NOT shipped (awaiting production deploy + smoke).
Date: 2026-07-16
Resume / remaining:
1. ✅ DONE 2026-07-16 — `push_subscriptions` table + RLS applied to prod (4 policies, 0 rows).
2. ⏳ עידן — set Edge Function secrets (dashboard → push-send → Secrets): `VAPID_SUBJECT=mailto:pm@sigmatec-energy.com`,
   `VAPID_PUBLIC` (= the key in js/src/22-push.js), `VAPID_PRIVATE` (handed over out-of-band; NOT in repo).
   Until set, push-send fails to boot (missing keys) — inert, no harm.
3. ✅ DONE 2026-07-16 — `push-send` deployed (v1, ACTIVE, verify_jwt=true; npm:web-push resolved fine).
4. ⏳ Manual smoke: real Android push for pending + approved; iPhone/desktop-unsupported = no crash, in-app modal still shows.
5. ⏳ Merge feat/web-push→dev→main; flip this STATUS to ✅; CHANGELOG + backlog + INDEX.
Code delivered: db/push_subscriptions.sql · supabase/functions/push-send/index.ts · js/src/22-push.js ·
sw.js push/notificationclick handlers · pushNotify hooks in 07-orders (create + 3 approve sites) ·
test-push.mjs (11 golden assertions, green).

## Goal
Phone push notifications for order-approval events. Android gets real OS push (app closed
or open). iPhone (none today, but future-proof) silently falls back to the **existing**
in-app modal — no push subscription attempted, nothing else changes for them.

## Events & routing (locked — mirrors js/src/07-orders.js:475, the single source of truth)
Real statuses (verified via live DB): pending = `pending_approval`; approving a **supplier**
order sets `pending`, a **customer** order sets `supplied`.

1. **Order created (INSERT, status=`pending_approval`) →** push to whoever can approve *that* order:
   - customer order → **אביאם + ניתאי**
   - supplier order ≤10 items → **אביאם**
   - supplier order >10 items → **עמיחי** (`orderNeedsAmichai`)
   Never push the creator (`created_by`). Text: "הזמנה חדשה ממתינה לאישור".
2. **Order approved (UPDATE `pending_approval` → `pending`|`supplied`) →** push to the group
   `אביאם · ניתאי · עמיחי` minus the approver and minus the creator. Text: "הזמנה אושרה".

`computeRecipients(event, order, actor)` ports `canApproveThisOrder`/`orderNeedsAmichai`
verbatim (qty = sum of items, type from order_type). This is the pure, golden-tested core.

## Why no self-hosted repo
Native Web Push + the backend we already own. No ntfy/Gotify/Novu, no always-on box.
- Client: existing service worker (sw.js) + Push API. VAPID keypair (free, generated once).
- Store subscriptions: new Supabase table `push_subscriptions`.
- Send: one Supabase **Edge Function** `push-send` (holds VAPID private key as a secret,
  uses the `web-push` npm lib).
- Trigger: **client calls `push-send`** after a successful order create / approve, passing
  `{event, orderId, actor}`. ponytail: chosen over a DB webhook because the webhook payload
  has no actor identity (no `approved_by` column) — the client already knows who acted and
  where the write succeeded. Missed push only if the device dies in the ~1s between write and
  call (rare, acceptable). Function re-loads the order from DB and computes recipients itself.

## Data
`push_subscriptions`:
- `owner` text (Hebrew owner name, matches getCurrentUser())
- `endpoint` text PRIMARY KEY
- `keys` jsonb (`p256dh`, `auth`)
- `user_agent` text, `created_at` timestamptz default now()
RLS: insert/delete only own rows (owner = the EMS-minted claim). Edge Function reads via
service_role. One owner can have many rows (multiple devices) — send to all, prune 410/404.

## Client (js/src/) — new file `21-push.js` (built via build.mjs)
- `initPush()`: if iOS or Notification unsupported → return (in-app modal already covers them).
  Else, after login, if permission not yet decided, show a small in-app "enable notifications?"
  prompt (don't auto-request on load — browsers penalize that). On accept:
  `Notification.requestPermission()` → `reg.pushManager.subscribe({userVisibleOnly:true,
  applicationServerKey: VAPID_PUBLIC})` → upsert to `push_subscriptions` with current owner.
- Re-sync subscription→owner on each login (owner can change per device).
- VAPID public key is safe to ship in the client bundle. Private key is a Supabase secret ONLY.

## Service worker (sw.js) — add two handlers
- `push`: `event.data.json()` → `showNotification(title, {body, icon:'./icons/icon-192.png',
  data:{url}})`.
- `notificationclick`: focus an existing app tab or `clients.openWindow(url)` to the orders page.
ponytail: no payload encryption library beyond what web-push does automatically.

## Edge Function `push-send`
Input from webhook: the changed order row + event type. Compute recipients (routing above),
load their subscriptions, `webpush.sendNotification` to each, delete rows on 404/410.
Secrets: `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` (mailto:).
Dedup: use order `id` + event in the notification `tag` so a re-fire replaces rather than stacks.

## Open items to verify at build (don't guess)
- Exact `orders.status` values for "pending" vs "approved" — code shows both `pending` (01-data.js:494)
  and `pending_approval` (07-orders.js:582). Confirm against live table via `list_tables`/`execute_sql`
  before wiring the webhook condition.
- Whether orders always hit Supabase directly on create/approve, or some path still goes through
  Apps Script (hybrid). The webhook only fires on the Supabase write — confirm both create and
  approve land in `orders` server-side.

## Testing (per docs/testing-methodology.md)
- Pure builder: `computeRecipients(event, order)` → golden fixtures for both events, actor-exclusion,
  iPhone-owner exclusion. Unit-test this with no network.
- Round-trip: subscribe → row present; simulated 410 → row pruned.
- Manual smoke at release: real Android push for both events; iPhone shows in-app modal, no crash.

## Phases (execution)
1. DB: `push_subscriptions` table + RLS (migration).
2. Edge Function `push-send` + secrets + `computeRecipients` (the testable core).
3. Client `21-push.js` + sw.js handlers + build.mjs include; opt-in prompt.
4. Supabase Database Webhook on `orders` → `push-send`.
5. Test suite green; manual smoke; CHANGELOG + backlog + INDEX; flip this STATUS.
