# Spec A — Kibbutz order → EMS task scheduling flow

**Status:** design, awaiting review · **Date:** 2026-06-29 · **Scope:** customer (kibbutz) orders only.
**Guiding principle (ponytail):** reuse existing machinery; add the minimum. Notes call out the reuse.

## Goal

Turn a kibbutz (customer) order into a properly-scheduled EMS field task with a clear owner, a due date,
and honest stock accounting — without losing work to confusion about who holds the stock or which order a
visit fulfilled. Minimize clicks; chain modules so one action flows to the next.

## Order lifecycle

```
ממתין לאישור ──approve──▶ ממתין לשיבוץ ──שיבוץ(due date+assignee)──▶ נשלח ל-EMS ──visit summary──▶ סופקה
                                                                         │
                                                                         └──edit──▶ back to ממתין לשיבוץ
                                                                         └──cancel─▶ מבוטלת
```

- `נשלח ל-EMS` is **terminal in inventory** — the order stops carrying inventory sub-statuses; the open EMS
  task is the live record (per the decision "an order-opened task is just open in EMS").
- New statuses to add to `ORDER_STATUSES` (02): `awaiting_schedule` (ממתין לשיבוץ), `scheduled` (נשלח ל-EMS),
  `cancelled` (מבוטלת). `supplied` (סופקה) already exists.

## 1. Approval routing — size rule (reuse `orderNeedsAmichai`)

Customer orders adopt the **same size rule already used for supplier orders**: `orderTotalQty(o) > 10 → עמיחי`,
else `אביאם`. One change in `canApproveThisOrder` / `approvalWaitingMsg` (07-orders.js) to apply the size rule
to customer orders (today they go to אביאם/ניתאי regardless of size). עמיחי may approve anything.
**⚠️ Review question:** today **ניתאי can also approve** customer orders. In this flow אביאם is the scheduler.
Does ניתאי keep approval rights for ≤10 (so either field lead can approve), or is ≤10-approval **אביאם only**?
Defaulting the spec to *either אביאם or ניתאי may approve ≤10* (no behavior removal) unless you say otherwise.

## 2. Approval → שיבוץ

- **אביאם approves (≤10):** the **שיבוץ step opens immediately** (he's the field lead).
- **עמיחי approves (>10):** order → `awaiting_schedule`; **reuse the ·95 approved-order notification**
  (`maybeShowOrderNotifications`) to alert **אביאם** ("הזמנה אושרה ע"י עמיחי — לשיבוץ"); tapping opens that
  order's שיבוץ in מלאי. No new notification system.

## 3. שיבוץ step (אביאם only) — reuse `askChoice` + native date input

A small step (reuse the conversational `askChoice` modal built for accessories) collecting:
- **Assignee:** אביאם / ניתאי. The picker shows **that person's available stock per item** (`computeStock`).
- **Due date (תאריך יעד):** native `<input type="date">`.

On confirm:
- `createTask({ assigneeName, expectedCompletionDate: dueDate, … })` — **reuse** the existing createTask queue
  (13-ems.js); just pass `expectedCompletionDate` (new field on the body) + the chosen assignee. Queues if
  offline (existing), retries on connect (·99 fix).
- Order → `scheduled` (נשלח ל-EMS).
- **No stock movement here** (see §4).
- Guard: disable the confirm button while in-flight → no duplicate task.

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

## 5. Delivery → auto-close on the visit summary (fewest clicks)

On saving a visit summary, look up the kibbutz's `scheduled` orders:
- **0** → nothing.
- **1** → **auto-close**: post `customer_supply` (assignee → kibbutz) for the reserved items, order → `supplied`,
  reservation releases. Toast **"✅ ההזמנה ל<kibbutz> סומנה כסופקה · בטל"** (undo) — zero extra clicks.
- **2+** → one popup to pick which order(s) (or "all"). Only when genuinely ambiguous.

The visit report (structured items) documents what was actually received — partial deliveries are recorded by
the report, not modeled as a separate state (decision: full close, report is the record).

### Mismatch handling (report items ≠ order items, or cancel-with-visit)
- Detect deterministically (compare structured item lists / kibbutz). On a mismatch, **call the AI for a
  recommendation** (cancel vs edit-the-task-per-report) — **reuse the existing Gemini/parse-order plumbing**
  (`parse-order` fn or the `parseRequest` Apps Script path); a new lightweight "reconcile" prompt. **Graceful
  fallback:** if AI is unavailable/errs, skip to the deterministic flag below (never block on AI).
- Either way: **flag the order** + surface a **⚠️ banner to עידן** ("אי-התאמה בין הזמנה לדוח ביקור — בדוק"),
  and **log** it so the case is visible ("raise warning lights the first time").
- **If the AI (or the user) decides EDIT:** after the visit summary, show a **blocking must-fix popup** —
  side-clicks do **not** dismiss; it closes **only** via a **small, de-emphasized button** (deliberately easy
  to miss, hard to skip past) — forcing the worker to update the EMS task before moving on.

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

## What is explicitly NOT built (YAGNI)

- No "reserved" location bucket / no `reserve_customer` movement (reserved is computed).
- No separate reassign subsystem (re-edit covers it).
- No partial-delivery state (the visit report documents actuals; full close).
- No new notification system (reuse ·95) and no new alert UI (reuse `renderLowStockAlert`).

## Reuse map (so implementation stays lazy)

| Need | Reuse |
|------|-------|
| Approval size routing | `orderNeedsAmichai`, `orderTotalQty` (07) |
| Notify אביאם on עמיחי-approval | `maybeShowOrderNotifications` (·95, 07) |
| שיבוץ assignee picker | `askChoice` modal (07) + `<input type=date>` |
| Create the task w/ due date | `createTask`/`emsWriteOrQueue` (13) + add `expectedCompletionDate` |
| Stock math / reserved | `computeStock` (08) − computed reservations |
| Shortage alert | `renderLowStockAlert` |
| 12h / due-date nudge | `maybeShowAmichaiApprovalReminder` pattern + localStorage ts |
| AI reconcile (mismatch only) | `parse-order` fn / `parseRequest` Gemini path |
| EMS task cancel/update | `emsWriteOrQueue` (`status` kind) |

## Out of scope (separate spec)

**Spec B — "דף היום" embedded in משימות**: once-daily (after 00:01) update notification with "ניתן לראות שוב
תחת משימות"; משימות layout (today's updates → tasks-with-due-date → rest with click-to-set-target). The
shortage/reserved/due-date alerts from this spec surface there. Built after Spec A.

## Open questions for review
- **ניתאי approval rights** (§1): keep ניתאי as a ≤10 approver, or אביאם-only?
- Status labels: confirm `ממתין לשיבוץ` / `נשלח ל-EMS` / `מבוטלת` wording.
- The AI "reconcile" prompt's exact output contract (recommend: `{action:'cancel'|'edit', reason, suggestedItems?}`).
