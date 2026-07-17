# Phase 1 — Actionable Notifications Engine (design spec)

STATUS: 🟡 OPEN — DRAFT for review. Not built. Phase 1 of the EMS Companion blueprint
([2026-07-17-ems-companion-blueprint-design.md](2026-07-17-ems-companion-blueprint-design.md)).
Gated by the EMS de-dup rule (blueprint §7). One open verification pending a reply from the
"EMS Graph update" session (see §6).
Date: 2026-07-17 · Owner: עידן · Grounded in the 2026-07-17 Fable notifications audit + EMS-graph
native-notification investigation.

---

## 1. Goal

Turn the order-hardcoded push system into a **generic actionable-notification engine**, then add the
high-value **app-owned** events — each delivering the right person a push they can *act on* from the
notification — **without duplicating any notification EMS already sends** (blueprint §7).

## 2. EMS de-dup — exclusion list (BLOCKING)

Confirmed from the EMS graph (master @ 7c7108a) + source. EMS notifies natively via **in-app bell +
(env-dependent) WhatsApp**; it has **no web-push, no websocket, no task emails**.

**EXCLUDE — EMS owns these, the app must NOT push:**
- Task **assigned** to a user (bell + WhatsApp → assignee)
- Task **comment** added (bell + WhatsApp → creator + assignee)
- Task **status** changed (bell + WhatsApp → creator + assignee)
- Alert digests, invoice sends, auth/invite emails (email → relevant party)

**Design fork (pending §6 answer):** EMS WhatsApp fires only if `send4sale` secrets are set in prod.
- If **WhatsApp is LIVE** → keep the three task events excluded (true duplicates).
- If **WhatsApp is OFF** → the assignee only gets the easy-to-miss EMS bell; the app *may* own a
  `task_assigned` / `task_comment` push as the reliable channel. Registry supports this via the
  `source` flag flip — no structural change.

**SAFE — app-owned or EMS-silent (no collision):** all order/stock/attendance/staff/cert events
(EMS doesn't know about them), **and** EMS **task due-soon / overdue** (EMS has no producer for these).

## 3. Architecture — event registry

Refactor `push-send` from inline `if` blocks into a declarative registry. Each event:

```
Event = {
  key,                       // 'order_delivered', 'stock_transfer', 'staff_message', …
  source: 'app' | 'ems',     // only 'app' events are sent by our engine; 'ems' = excluded/mirrored
  recipients(ctx) -> [owner] // pure fn: derive recipient names from event context (server-side)
  payload(ctx) -> {title, body, tag, url, requireInteraction?, actions?}  // pure fn
  actions: [{action, title, kind: 'link' | 'one-tap', authRequired}]
}
```

- **Pure `recipients()` + `payload()` per event** → unit-testable with golden fixtures (no I/O).
- The `Deno.serve` handler becomes: parse → look up event → compute recipients (minus actor/creator)
  → render payload → `sendTo()` (unchanged: send + prune 404/410 + write `push_log`).
- **Time-based events** (escalation, due/overdue, low-stock, monthly report) run from a generalized
  **cron mode** (extend the existing hourly `attendanceCron` into a registry-driven scheduler with an
  Israel-hour gate + `push_log` idempotency lookback — the pattern already exists).

## 4. Event catalog — Phase 1 (app-owned)

Ordered by value/effort. All modeled on the existing one-tap order-approval pattern.

| Event | Trigger | Recipient(s) | Action(s) |
|-------|---------|--------------|-----------|
| `staff_message` | `messages` insert (17-staff) | the addressee | 📖 mark-read (one-tap) · 👁️ open |
| `order_delivered` | order → `delivered` (07-orders) | אביאם/ניתאי/עמיחי − actor | 🎯 distribute (link) · 👁️ view |
| `stock_transfer` | `doStockTransfer` (08) | the `toLocation` holder | ✔️ acknowledge (one-tap) · 👁️ stock |
| `low_stock` | cron: meters/SIMs below red line | אביאם+עמיחי / holder / עידן | 🧾 create order (link) · 👁️ |
| `approval_escalation` | cron: order pending_approval > 24h | approver, then עידן | ✅ approve (one-tap) · 👁️ |
| `return_pending` | return logged awaiting decision (08/09) | עידן | 🔧 defective (one-tap) · ✅ restock (link) |
| `ems_task_due` / `overdue` | cron over emsCache/API | assignee | ✍️ update status (link) *(safe: EMS has no producer — reconfirm §6)* |

Deferred to later (informational, low urgency): `cert_issued`, `monthly_report_ready`, `dev_sprint_changed`.

## 5. Supporting changes

1. **Generic schema:** `push_log` gains `entity_type` (+ keep `order_id` for back-compat, or migrate to
   `entity_id`); `PUSH_EVENT` map in `23-push-log.js` extended to all keys.
2. **`push_prefs (owner, event, muted, created_at)`** — per-user mute matrix; engine skips muted
   recipients; a small settings screen (Phase 2 home) toggles them. RLS: owner reads/writes own rows.
3. **iOS-installed subscription:** `initPush` stops bailing on iOS — attempt subscription when
   `navigator.standalone` / installed PWA (iOS 16.4+ supports Web Push). Non-installed iOS still no-op.
4. **Viewer subscription:** remove the client-side `צפייה` skip; gate delivery by the recipient rules
   instead (so viewer-targeted events like reports can reach them).
5. **One-tap auth (security):** mutating one-tap actions (approve, mark-read, acknowledge, defective)
   must carry a short-lived signed token in the notification `data`, verified server-side in
   `push-send`. Today `approveOrder` trusts an unauthenticated `actor` — fix as part of this phase
   before adding more one-tap actions.

## 6. Open / to-verify

- **EMS Graph update reply** (question sent): (a) notification changes after commit 7c7108a
  (new push? task-email? due/overdue producer?); (b) is EMS task WhatsApp live in prod (→ resolves the
  §2 fork); (c) any other EMS-owned notifications. Update §2 exclusion list on reply.
- Confirm the bell poll interval only matters if we later mirror EMS events (not Phase 1).

## 7. Testing (per docs/testing-methodology.md)

- **Pure builders:** golden-fixture tests for every event's `recipients()` and `payload()` (incl.
  actor/creator exclusion, role targeting, escalation timing). No network.
- **Contract sweep:** each event key round-trips through `push_log` schema; `push_prefs` mute honored.
- **Role-gating matrix:** who receives what per role; viewer inclusion; muted recipients skipped.
- **De-dup guard test:** assert no `source: 'ems'` event is ever emitted by the sender.
- One full-suite runner `test-notifications.mjs`; loop until green; manual smoke at release.

## 8. Rollout order (within Phase 1)

1. Registry refactor + generic schema + one-tap auth fix (no behavior change; existing order/attendance
   events reimplemented through the registry; full suite green = safe).
2. `push_prefs` + iOS/viewer subscription fixes.
3. Add events in §4 order (staff_message → order_delivered → stock_transfer → low_stock →
   approval_escalation → return_pending → ems_task_due), each with its golden-fixture test.
