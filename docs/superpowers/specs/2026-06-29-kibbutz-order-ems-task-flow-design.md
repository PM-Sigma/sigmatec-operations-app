# Spec A — Kibbutz order → EMS task scheduling flow

**Status:** design, awaiting review · **Date:** 2026-06-29 · **Scope:** customer (kibbutz) orders only.
**Guiding principle (ponytail):** reuse existing machinery; add the minimum. Notes call out the reuse.

## Goal

Turn a kibbutz (customer) order into a properly-scheduled EMS field task with a clear owner, a due date,
and honest stock accounting — without losing work to confusion about who holds the stock or which order a
visit fulfilled. Minimize clicks; chain modules so one action flows to the next.

## Order lifecycle

```
ממתין לאישור ──approve──▶ הזמנה אושרה · ממתין לשיבוץ עובד ──שיבוץ(due date+assignee)──▶ נשלח ל-EMS ──visit summary──▶ סופקה
                                                                         │
                                                                         └──edit──▶ back to ממתין לשיבוץ
                                                                         └──cancel─▶ מבוטלת
```

- `נשלח ל-EMS` is **terminal in inventory** — the order stops carrying inventory sub-statuses; the open EMS
  task is the live record (per the decision "an order-opened task is just open in EMS").
- New statuses to add to `ORDER_STATUSES` (02): `awaiting_schedule` (**"הזמנה אושרה · ממתין לשיבוץ עובד"**),
  `scheduled` (**"נשלח ל-EMS"** — set *after* שיבוץ, i.e. due date + assignee chosen and the EMS task created),
  `cancelled` (מבוטלת). `supplied` (סופקה) already exists. Note: for the ≤10 path אביאם approves+schedules in one
  modal, so the order passes through `awaiting_schedule` only on the >10 (עמיחי-approved) path.

## 0. Connection requirement (no offline EMS actions)

Every EMS-requiring action — **new order, approve, שיבוץ, EMS task status/cancel** — is gated on a live EMS
connection. A tiny guard runs first:

```js
function requireEms() {
  if (typeof isEmsConnected === 'function' && isEmsConnected()) return true;
  if (typeof emsRequireLogin === 'function') emsRequireLogin();   // pop the re-login modal
  return false;
}
```

If offline → pop the re-login prompt **before** the user does any work; the action does not proceed and is
**not** queued. (The ·1.02 401-retry fix still covers the after-the-fact case for any Supabase write.) The
**visit summary itself still saves** (it's core field work and writes to Supabase via the auth pass). This
removes the offline-task edge cases entirely: createTask always runs **live**, so site/assignee resolve live
with no dead-letter and no flush dedup. **The existing `emsWriteOrQueue`/flush/dedup code is kept but bypassed**
(entry points gate on `requireEms()` so the offline branch is unreachable) — remove later if confirmed unused.

## 1. Approval routing — size rule (reuse `orderNeedsAmichai`)

Customer orders adopt the **same size rule already used for supplier orders**: `orderTotalQty(o) > 10 → עמיחי`,
else `אביאם`. **DECIDED: ניתאי is NOT an approver** — only **אביאם** approves ≤10 (ניתאי is an *assignee* only,
chosen by אביאם at שיבוץ); **עמיחי** approves >10 and may approve anything. Change `canApproveThisOrder` /
`approvalWaitingMsg` (07-orders.js) so customer orders follow the size rule and **drop ניתאי from approval**.

## 2. Approval → שיבוץ

- **אביאם approves (≤10):** the **שיבוץ step opens immediately** (he's the field lead).
- **עמיחי approves (>10):** order → `awaiting_schedule`; **reuse the ·95 approved-order notification**
  (`maybeShowOrderNotifications`) to alert **אביאם** ("הזמנה אושרה ע"י עמיחי — לשיבוץ"); tapping opens that
  order's שיבוץ in מלאי. No new notification system.

## 3. שיבוץ — opens on "אשר הזמנה" (אביאם only) — reuse `askChoice` + native date input

Clicking **אשר הזמנה** (אביאם) opens the שיבוץ modal in one step (no separate screen):
- **Header:** "מלאי ההזמנה יורד מהמלאי שלך" — the assignee **defaults to אביאם**.
- **"שבץ על עובד אחר":** opens a worker picker listing **only workers who hold the full order stock**
  (`computeStock[worker] ≥ every order item`). Picking ניתאי = it comes off ניתאי's stock.
  - If **no worker** has the full stock, אביאם can still take it himself → `available` goes negative → the §4
    shortage nag fires (link to order/move stock). *(Per the "don't block, nag" decision.)*
- **Due date (תאריך יעד):** native `<input type="date">`.

On confirm:
- `createTask({ assigneeName, expectedCompletionDate: dueDate, … })` — live (§0); site/assignee resolve immediately.
- Order → `scheduled` (נשלח ל-EMS).
- **No stock movement here** (§4; reserved is computed).
- Guard: disable confirm while in-flight → no duplicate task.

The **>10 (עמיחי-approved)** path opens this **same modal** when אביאם taps the "לשיבוץ" notification (§2).

## 4. Reserved stock — COMPUTED, no new movement

The crux of the lazy design: **"מלאי שמור ללקוח" is derived, not stored.**

- `reserved[person]` = sum of items across that person's `scheduled` (נשלח ל-EMS, not-yet-delivered) orders.
- **`available = computeStock()[person] − reserved[person]`**, computed where stock is shown. Scheduling an
  order makes `available` drop immediately (satisfies "stock goes down at שיבוץ") **with zero new movement** —
  the items are physically still with the employee until delivery.
- Display a **"מלאי שמור ללקוח: <items> ל<kibbutz>"** line (card / משימות).
- If `available` goes **negative** → allowed; raise the **persistent shortage alert** — **reuse
  `renderLowStockAlert`** — shown in משימות **and on every app entry**, with the missing numbers + a link to
  order or move stock. Clears automatically when `available ≥ 0` again.

The single real stock movement (`customer_supply`, assignee → kibbutz) is posted **only at delivery** (§5),
which is when the stock physically leaves — and the movement type already exists.

## 4a. Data model — two new order fields (small migration)

Computed-reserved (§4) and the reminders (§6) read the **assignee** and **due date** off the order itself
(not by joining to the EMS task), so the order must persist them:
- `assignee` (the scheduled worker — אביאם/ניתאי)
- `due_date` (תאריך יעד; also passed to the EMS task as `expectedCompletionDate`)

Add both as columns on `orders` (`db/orders_schedule_fields.sql`) and map them in `writeOrder`/the read in
`01-data.js`. *(This is the only schema change; everything else reuses existing tables.)* `expected_date`
stays "תאריך הזמנה" (order date); `due_date` is the delivery target — distinct fields.

## 5. Delivery → auto-close on the visit summary (fewest clicks)

On saving a visit summary, look up the kibbutz's `scheduled` orders:
- **0** → nothing.
- **1** → **auto-close**: post `customer_supply` (assignee → kibbutz) for the reserved items, order → `supplied`,
  reservation releases. Toast **"✅ ההזמנה ל<kibbutz> סומנה כסופקה · בטל"** (undo) — zero extra clicks.
- **2+** → one popup to pick which order(s) (or "all"). Only when genuinely ambiguous.

The visit report (structured items) documents what was actually received — partial deliveries are recorded by
the report, not modeled as a separate state (decision: full close, report is the record).

### Mismatch handling (report items ≠ order items, or cancel-with-visit)
- Detect deterministically (compare structured item lists / kibbutz). On a mismatch, **consult the AI for a
  recommendation** — show a processing bubble **"🤖 מתייעץ עם סוכן על אופן ההתקדמות…"** with a **filling %
  progress bar** (**reuse `_fakeProgress`** from the voice feature) until the answer returns. **The AI is
  advisory — it does NOT auto-act.** Reuse the Gemini/parse-order plumbing; output `{action:'cancel'|'edit',
  reason, suggestedItems?}`. **Graceful fallback:** if AI is unavailable/errs, skip straight to the flag below.
- **Always (regardless of AI):** flag the order + a **⚠️ banner to עידן**, **send עידן a message** (reuse the
  `messages` table / staff-message → unread-popup system, 17-staff.js), and **log** it ("warning lights the
  first time").
- **If the recommendation is EDIT** (not cancel): continue into the **blocking must-fix popup** after the visit
  summary — side-clicks do **not** dismiss; it closes **only** via a **small, de-emphasized button** (easy to
  miss, hard to skip) — forcing the EMS-task update before moving on. **If CANCEL:** route to the §7 cancel.

## 6. Reminders (reuse the floating-reminder pattern + a localStorage timestamp)

- **Awaiting שיבוץ (12h):** while an order is `awaiting_schedule`, on app open if >12h since the last shown
  (per-device `localStorage` ts) → nudge אביאם "הזמנה ממתינה לשיבוץ". Mirror `maybeShowAmichaiApprovalReminder`.
- **Due-date arrival:** when a `scheduled` order's due date ≤ today, alert the **assignee**:
  "המלאי השמור ל<kibbutz> נדרש לניפוק — אל תשכח למלא דו"ח סיכום ביקור."

## 7. Edit / Cancel

- **Edit a `scheduled` order** (items / date / assignee) → revert to `awaiting_schedule`; שיבוץ is redone and the
  EMS task updated/recreated cleanly. No half-synced state. (No separate reassign path — reassign = re-edit.)
- **Cancel a `scheduled` order** → status `cancelled` (מבוטלת, **kept not deleted**); the computed reservation
  releases automatically (stock frees up); queue an EMS task **cancel**. If a visit exists for it → the §5
  mismatch flow (AI recommend + warning).

## What is explicitly NOT built (YAGNI) — *features are NOT dropped, only redundant plumbing*

- No **physical** "reserved" location/bucket or `reserve_customer` movement — **the reserved-stock feature IS
  built (§4), just computed.** (Available drops at שיבוץ, "שמור ללקוח" indicator, real movement at delivery — all present.)
- No new notification **infrastructure** — but **every notification/alert the flow needs IS built** as a new
  trigger on existing rails: approve→אביאם (·95, §2), 12h & due-date nudges (§6), shortage alert
  (`renderLowStockAlert`, §4), mismatch message-to-עידן (`messages`, §5).
- No separate reassign subsystem (re-edit covers it).
- No partial-delivery state (the visit report documents actuals; full close).
- No offline path for EMS actions — connection is required (§0); the queue code stays but is bypassed.

## Reuse map (so implementation stays lazy)

| Need | Reuse |
|------|-------|
| Require-connection guard | `isEmsConnected` (13) + `emsRequireLogin` (12) → `requireEms()` |
| Approval size routing | `orderNeedsAmichai`, `orderTotalQty` (07) |
| Notify אביאם on עמיחי-approval | `maybeShowOrderNotifications` (·95, 07) |
| שיבוץ assignee picker | `askChoice` modal (07) + `<input type=date>` |
| Create the task w/ due date | `createTask`/`emsWriteOrQueue` (13) + add `expectedCompletionDate` |
| Stock math / reserved | `computeStock` (08) − computed reservations |
| Shortage alert | `renderLowStockAlert` |
| 12h / due-date nudge | `maybeShowAmichaiApprovalReminder` pattern + localStorage ts |
| AI reconcile (mismatch only) | `parse-order` fn / `parseRequest` Gemini path |
| "מתייעץ עם סוכן" % progress bubble | `_fakeProgress` (07, voice feature) |
| Message to עידן on mismatch | `messages` table + staff unread-popup (17) |
| EMS task cancel/update | `emsWriteOrQueue` (`status` kind) |

## Out of scope (separate spec)

**Spec B — "דף היום" embedded in משימות**: once-daily (after 00:01) update notification with "ניתן לראות שוב
תחת משימות"; משימות layout (today's updates → tasks-with-due-date → rest with click-to-set-target). The
shortage/reserved/due-date alerts from this spec surface there. Built after Spec A.

## Resolved (review pass 2)
- **ניתאי = assignee-only**, not an approver (§1). אביאם ≤10, עמיחי >10.
- **Labels:** `הזמנה אושרה · ממתין לשיבוץ עובד` (approved, awaiting worker assignment) · `נשלח ל-EMS` (after שיבוץ
  — task created) · `מבוטלת`.
- **שיבוץ** opens on "אשר הזמנה"; "מלאי ההזמנה יורד מהמלאי שלך"; reassign limited to workers who hold the stock.
- **AI** is advisory with a "מתייעץ עם סוכן" % bubble; `{action,reason,suggestedItems?}`; EDIT→continue, CANCEL→cancel.
- **Message to עידן** on every mismatch (+ ⚠️ banner + log).

## Open questions for review
- **Schema:** OK to add `assignee` + `due_date` columns on `orders` (§4a)? It's the only DB change; needs the
  SQL run (Supabase). Everything else reuses existing tables.
- Otherwise: confirm the spec and I'll move to the implementation plan.
