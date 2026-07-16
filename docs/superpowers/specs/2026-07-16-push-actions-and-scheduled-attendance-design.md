# Push action buttons + scheduled attendance reminders — design spec

STATUS: 🟡 DEPLOYED to backend + merged to dev — BLOCKED on VAPID secrets, then Android smoke → dev→main.
- ✅ merged feat/push-actions → dev (ff, pushed origin, 1c0d8b6).
- ✅ push-send v5 deployed (action buttons + approveOrder + attendanceCron; backward compatible).
- ✅ pg_cron + pg_net enabled; job `push-attendance-hourly` (`0 * * * *`) active — gates on Israel hour.
- 🔴 BLOCKER (unchanged since 1.48): VAPID_PUBLIC/PRIVATE/SUBJECT secrets are NOT set in the push-send
  Edge Function → every send returns 503 "VAPID secrets not set". NOTHING pushes until עידן sets them.
- ⏳ then: Android smoke (order supplier one-tap + customer approveOpen + view; attendance 19:00/09:00) → dev→main.
Date: 2026-07-16.
Delivered: push-send rewrite (action buttons + `approveOrder` one-tap + `attendanceCron` scheduler,
lazy-VAPID init retained) · sw.js multi-action + one-tap approve POST · 22-push.js deep-link handler ·
test-push-actions.mjs (hour-gate, priorMissing, button-selection) green + full regression suite green.
Scheduler folded into push-send (mode `attendanceCron`) — NO separate function; pg_cron hits it hourly.
Prod remaining (need עידן, do AFTER merge to avoid clobbering the shared push-send the other session touches):
  1. redeploy `push-send` (this branch's superset).
  2. `create extension pg_cron; create extension pg_net;`
  3. `select cron.schedule('push-attendance-hourly','0 * * * *', $$ select net.http_post(
       url:='https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/push-send',
       headers:='{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>"}'::jsonb,
       body:='{"mode":"attendanceCron"}'::jsonb) $$);`
  4. Android smoke: order approve (supplier one-tap + customer approveOpen) · view button · attendance 19:00/09:00.

Builds on the shipped unified push (1.48 orders + 1.50 attendance): `push_subscriptions`, `push_log`,
Edge Function `push-send`, client `js/src/22-push.js`, sw.js single push handler.

## Part A — Order push gets action buttons
On a **pending** order push, two buttons:
- **✅ אשר עכשיו** — one-tap approve.
  - **supplier order → true one-tap, no app** (approval = plain status flip `pending_approval`→`pending`,
    no stock/EMS). SW POSTs to `push-send` mode `approveOrder`; server flips status + fires the
    'approved' push to the group. עמיחי's pushes are always supplier>10, so he always gets real one-tap.
  - **customer order → opens the approve confirmation** in-app (approval moves stock + opens an EMS task —
    unsafe to run blind from a notification). Button deep-links to `#inventory?approve=<id>`.
- **👁️ צפה באפליקציה** — opens `#inventory?order=<id>` (highlights the order).
On an **approved** push: just **👁️ צפה** (informational).

Server decides button set by order type and puts it in the payload (`actions` + `data.act`,
`data.orderId`, `data.otype`, per-action `url`). SW reads `e.action` and either POSTs the approve or
opens the URL.

## Part B — Attendance reminders become scheduled push
Today: viewer clicks 🔔 per red row (manual). New: automatic, per field worker (`ATT_PEOPLE` = אביאם, ניתאי).
- **19:00 Israel, same day** — if today is a weekday (Sun–Thu) and the worker has no attendance/visit
  record for today → push "📅 עדכן נוכחות להיום". Button **מלא נוכחות** → opens the "מלא את הנוכחות שלך"
  entry window (`#attendance?fill=today`).
- **09:00 Israel** — prior weekdays (this month, ≤ yesterday) still missing → push listing them.
  Button **מלא נוכחות** → attendance page focused on the missing days (`#attendance?fill=missing`).

The viewer-triggered manual nudge (22-push.js `attNagDay`) stays as-is — this adds automation alongside it.

## Scheduler — Supabase pg_cron (in-DB), DST-safe
- New Edge Function `attendance-cron`: computes missing days server-side (port of `attMissingDays`),
  reads `attendance` + `visits` for אביאם/ניתאי, sends via the existing `sendTo`. It **gates on Israel
  local hour**: runs the evening job only when `Asia/Jerusalem` hour = 19, morning job only when = 9,
  else no-op. This sidesteps DST math entirely.
- pg_cron job runs **hourly** (`0 * * * *`) and `net.http_post`s to `attendance-cron` with the anon key.
  24 trivial calls/day; only 2 do work.
- Idempotency: one push per person per job per day — server tags `att-eve-<person>-<yyyy-mm-dd>` /
  `att-morn-<person>-<yyyy-mm-dd>` and skips if a `push_log` row with that tag already exists today.

## Client deep-links (22-push.js, on load after data)
- `?approve=<id>` → open that order's approve confirmation (`approveOrder(id)`).
- `?order=<id>`   → open the order (invEditOrder or scroll/highlight in #inventory).
- `?fill=today`   → open the daily attendance entry window (find the opener in 04-attendance-daily.js).
- `?fill=missing` → attendance report page with the red missing rows.

## sw.js changes
- Payload `actions` now supports up to 2 buttons (currently 1). Each action id maps to behaviour:
  `approve` → POST approveOrder (no window); `approve-open`/`order`/`fill`/`view`/default → openWindow(url).
- `approve` action shows a brief result notification ("✅ אושר" / "⚠️ נכשל").

## push-send new mode `approveOrder`
Input `{ mode:'approveOrder', orderId, actor }`. Guard: load order; only proceed if
`status==='pending_approval'` AND type is supplier (customer → 409, client must open the app).
PATCH `orders.status='pending'`, then reuse the 'approved' send to notify the group. Returns
`{ok, status}`. ponytail: no auth beyond anon — internal app, and the guard limits blast radius to
flipping a pending supplier order to pending (its normal next state).

## Tests (loop until green — test-push-actions.mjs)
- Pure `israelHour(date)` gate → 19/9 detection across a DST and non-DST date.
- `attMissingDays` evening vs morning selection (today-included evening; prior-only morning).
- Action-payload builder: supplier pending → [approve, view]; customer pending → [approve-open, view];
  approved → [view]. Recipient routing regression (existing test-push.mjs stays green).
- Idempotency: given a same-day log tag present → job skips.

## Phases
1. Client deep-link handlers + find/wire the attendance entry opener. (no prod)
2. sw.js multi-action + approve-POST. (no prod)
3. push-send: action payloads + `approveOrder` mode. (deploy = prod)
4. `attendance-cron` function + missing-day port. (deploy = prod)
5. Enable pg_cron+pg_net, schedule hourly job. (prod DDL)
6. Tests green; Android smoke; feat→dev→main; CHANGELOG/backlog/INDEX; flip STATUS.

## Prod steps (batched, need עידן's OK — same as 1.48)
- `create extension pg_cron; create extension pg_net;`
- deploy `push-send` (updated) + `attendance-cron`
- `cron.schedule('push-hourly','0 * * * *', ...net.http_post(attendance-cron)...)`
- secrets already set (reuses VAPID). Android smoke for all four button paths + both cron times.
