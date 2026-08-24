# נוכחות as the operations hub — design

STATUS: ✅ SHIPPED (1.60)

## The ask (עידן, 2026-08-02)

> "I need the ability to edit a visit report in a way that also affects the attendance report. I saw you
> can edit non-field attendance — I need to be able to edit and save. Most changes will be the date. If
> it's connected to an EMS task, I want to push an EMS task update. I don't need the visits report
> anymore — everything is managed on the attendance page, and that's the center; from there I can
> produce a report that gives me both visits and attendance, because visits are contained in attendance."

Plus, mid-flight: **the visit form must not pre-fill today's date** — an empty picker prevents mistakes.

## Starting point (what the code actually did)

- 1.59 made **non-field** attendance rows editable. Field days (יום שטח) were not, because they aren't
  attendance rows at all — they're derived from the VISITS table.
- `editVisit()` already existed and `saveVisit()` already handled edits (incl. inventory deltas), but
  `editVisit` reads `window.currentKibbutzVisits`, which is only filled for the **open kibbutz card** —
  so it could not be driven from נוכחות.
- **A visit did NOT store its EMS task.** The task was picked in-form at save time and thrown away; the
  visit row had no `ems_task_id`. So "if it's connected to an EMS task" had no stored answer.
- The `visitsReportModal` was a shared hub holding **four** things, not one: the visits report, the
  delivery-cert picker, the issued-certs range report (accounting), and the visits Excel export.
- The visit form defaulted the date to today, **and `saveVisit` silently fell back to today when the
  field was empty** — the root cause of mis-dated visits in the first place.

## Decisions (confirmed with עידן)

| Question | Decision |
|---|---|
| What to push to EMS on edit | **Comment only.** Never PATCH status or `expectedCompletionDate`. |
| How to know the linked task | **Store it**: `visits.ems_task_id` (mirrors `orders.ems_task_id`). |
| The other three tools in the modal | **Move them to נוכחות**; delete the visits report itself. |
| Unified report | **Extended monthly PDF** (not a new date-range report). |

**Why comment-only:** a visit's date is not the task's due date. PATCHing `expectedCompletionDate`
would silently move EMS planning for everyone; a comment records the correction without side effects.

## Implementation

### 1. `visits.ems_task_id` (migration — APPLIED to production)

`db/visits_ems_task_id.sql`, applied via Supabase MCP. Additive, `if not exists`, default `''`.

- `01-data.js` read: `emsTaskId: v.ems_task_id || ''`.
- `writeVisit`: **partial-safe** — `if (b.emsTaskId !== undefined) row.ems_task_id = …`. An edit that
  touches no EMS task omits the key, so the upsert-merge keeps the existing link instead of blanking it
  (same reasoning as the existing `created_at` handling).
- `saveVisit`: sends `emsTaskId` only when `readVisitEmsIntent()` produced a task.

### 2. Field days editable from נוכחות

- `mergeAttendanceByDate` now carries `visitId` (plus `contact`/`products` for the PDF) on each nested
  visit. The merged **row** still carries no `id` — that field means "an attendance-table row" and routes
  to the attendance editor; a field day routes to the visit editor instead.
- ✏️ behaviour on a field row: **one visit → opens it directly; several → expands the detail** so the
  user picks which (a day with two kibbutzim is one row). The detail was made expandable even when no
  visit has a summary, otherwise a 2-kibbutz day could never be picked apart.
- `openVisitFromAttendance(visitId)`: resolves the visit **globally** via `loadAllVisitsCombined()`,
  checks `canEditAttendanceOf(visit.visitor)`, opens the kibbutz card (which fills
  `currentKibbutzVisits`), then delegates to the normal `editVisit()`. Fails with a message on an unknown
  visit or a missing kibbutz card.
- After a successful save, `SHEET_DATA.visits` is patched in place and the attendance report re-rendered,
  so the corrected day appears immediately (`refreshData` lands ~1.5s later and doesn't re-render it).

### 3. EMS comment on edit

`buildVisitEditNote(prev, next)` diffs date / visitor / duration / contact / products / summary and
returns a bullet list — **`''` when nothing changed**, so a no-op save never spams the task. Products are
compared order-insensitively. `pushVisitEditToEms` sends it via `emsWriteOrQueue` (offline-queue safe).

Fires **only** when `isEditing && linkedEmsTaskId && !emsIntent`. When an in-form intent exists,
`pushVisitToEms` already sends the full updated summary — which carries the corrected date — so pushing
both would double-comment.

### 4. The visits report is gone; its neighbours moved

- Deleted: `generateVisitsReport` (10-activity.js) and `buildVisitsReport` (09-visits.js, 55 lines), and
  the "📍 דוח ביקורים" button in the my-tasks bar.
- **Kept**: `openVisitCertPicker`, `certRangeReport`, `xlExportVisitsFromModal` — retitled the modal to
  "🚚 תעודות משלוח וייצוא" and moved its entry point to a button on the נוכחות header. They all work on a
  date **range** (not the report's single month) and share those inputs, so the dialog stays as their home.
- **Kept**: `openVisitsReportHTMLView` — still called by the viewer Excel hub (`21-excel-export.js`).

### 5. The monthly PDF is the one report

`downloadAttendancePDF` already printed per-visit summaries. Added contact, products (+ "other"),
work-day marking, and a `📍 N ביקורים ב-M קיבוצים` total so the numbers the old report gave still exist.
All visit-sourced text is HTML-escaped.

### 6. No default visit date

- `openEditModal` sets `visitDate` to `''` (was: today).
- `saveVisit` **rejects** an empty date up front (before `setBtnLoading`/product collection) instead of
  falling back to `new Date()`. This was the real bug — clearing the default alone would only have hidden it.
- Label carries the hint (`📅 תאריך הביקור — בחר תאריך:`); a native date input can't take a placeholder.
- The quick-FAB path is unaffected: it sets its wizard-chosen date **after** `openEditModal` clears it.

## Tests — `test-attendance-hub.mjs` (33 checks)

Date defaulting (empty on open, hard rejection, validation ordering, FAB path preserved) · EMS link
persistence (read map, partial-safe write, migration file) · the edit note (date old→new, no-op returns
'', every field diffed, order-insensitive products, comment-only, never PATCH, no double-comment guard,
snapshot ordering) · field-day editing (visitId threading, single-vs-multi behaviour, global lookup,
permission gate, safe failures, snapshot patch) · report removal (functions gone from the **bundle**, no
dangling markup, surviving tools wired, shared inputs kept, `openVisitsReportHTMLView` kept) · PDF
(contact/products/work-day, totals line, data actually threaded, escaping).

Full suite: **18/18 green**.

## Verified live

Field row with one visit → ✏️ opens the visit editor prefilled with its real date (03.08); changed to
06.08 and saved → POST `{id:'v-9', isNew:false}` (update, not insert), EMS comment pushed to the **stored**
`ems-task-42` reading "📅 תאריך הביקור תוקן: 3.8.2026 → 6.8.2026", the attendance row moved to 06.08, and
the visit count stayed 1 (no duplicate). A 2-visit day shows an ✏️ per visit in its detail. Fresh visit
form opens with an empty date; saving without one is refused. "📍 דוח ביקורים" has zero buttons left; the
נוכחות header opens the cert/Excel tools. PDF contains contact, products, summary, the "אחר" note and the
visit totals. Console clean.

## Not doing (deliberate)

- **No month-lock** (carried over from 1.59): a month already reported to accounting can still be edited.
  Attendance feeds pay, so this is worth a lock or an edit log once a month-close concept exists.
- **No attendance↔field conversion**: a day mis-logged as משרד that was really a field day still needs the
  attendance row fixed and a visit created separately.
- **The FAB still defaults its wizard date to today.** That's an explicit step-1 choice the user sees and
  confirms, unlike the form field that was silently accepted. Easy to change if it causes mistakes too.
- **No date-range version of the unified report** — month-scoped, per the decision. The cert tools keep
  their own range picker.
