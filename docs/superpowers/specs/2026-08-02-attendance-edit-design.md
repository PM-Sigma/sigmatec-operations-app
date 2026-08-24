# Attendance entry editing (עריכת דיווח נוכחות) — design

STATUS: ✅ SHIPPED (1.59)

## Problem

A worker who mis-reported a day of attendance had **no way to fix it**. Verified in the code:

- `saveAttendance()` (`js/src/04-attendance-daily.js`) always POSTs **without an `id`** → every save is an
  INSERT. There is no update path.
- The monthly attendance table renders **read-only rows**; the only control is the `+` detail toggle.
  No edit, no delete.
- Re-entering the day does **not** fix a wrong date: `mergeAttendanceByDate()` groups by calendar date,
  so the wrong-date entry survives as its own row **next to** the corrected one. Both then appear in the
  monthly report and the exported PDF.

Before this change the only remedy was someone editing the Supabase row by hand.

## Key finding — the backend already supported it

The write fetch-router already upserts attendance keyed by `id` (`js/src/01-data.js`):

```js
attendance: b => { const id = b.id || genId('att');
  return ['attendance', 'id', { id, date: …, person: …, day_type: …, note: … }, id]; },
```

Send an existing `id` → `sbUpsert` PATCHes that row. Omit it → new id → insert. `writeVisit()` already
relies on this same create-or-edit-by-id pattern. **So this was purely missing client plumbing — no
backend change, no migration, no Apps Script redeploy.**

## Decisions (confirmed with עידן, 2026-08-02)

| Question | Decision |
|---|---|
| Who may edit? | Each person edits **their own** entries; **עידן + עמיחי may fix anyone's**. Viewer: no. |
| Delete? | **No.** Edit-only — a wrong date is fixed by changing the date, so delete isn't needed yet. |
| Editable fields | date, day type, and the "אחר" note. |
| Day types offered | The six non-field types only (משרד/מהבית/מילואים/חופש/לא בעבודה/אחר). |

**Why field (יום שטח) is excluded:** a field day is not an attendance row at all — it comes from the
VISITS table and is already editable through the visit form. An attendance row has no visit attached, so
offering "field" here would produce a field day with no kibbutz/summary. Converting between the two is
out of scope (see Not doing).

**Viewer safety:** no extra gate needed — `01-data.js` hard-blocks every write for `isViewer()` at the
single choke point all writes pass through. `canEditAttendanceOf()` also checks it so the ✏️ never shows.

## Implementation

### 1. Thread the row id through to the view (the actual blocker)

The id was being dropped in two places:

- `renderAttendanceReport()` mapped attendance rows to `{date,type,kibbutz,duration,note}` — **no id**.
  → add `id: a.id`.
- `mergeAttendanceByDate()` rebuilt the non-field row without the id.
  → carry `id: o.id` on the non-field branch. Field rows deliberately carry **no id** (they're visits).

### 2. ✏️ button on editable rows

Rendered into the **existing last cell** next to the `+` toggle — deliberately not a new column, so the
detail row's `colspan=5` stays valid. Shown only when `r.id && canEditAttendanceOf(who)`.

### 3. Dedicated edit modal (`#attEditModal`)

A standalone modal rather than reusing the create form. **Rationale:** the existing attendance form
(`visitSimpleForm`) lives inside the visit modal and is driven by `onVisitorChange()`, entangled with
`STOCK_HOLDERS`, `visitSource`, `renderProductsForVisitor()` and the field/simple toggle. Reusing it
would have required suppressing all of that — more code than a fresh modal, and a bug there would break
visit creation (a core flow). The standalone modal touches nothing in the create path.

### 4. Save = the same POST plus an `id`

```js
{ type: 'attendance', id: st.id, person: st.person, dayType, note, date: isoDate }
```

- `person` is sent **unchanged from the original row** — an edit must never reassign whose day it is, and
  the upsert writes the full row (`b.person || ''` would blank it if omitted).
- Date is anchored at `T12:00:00` before `toISOString()`, mirroring `saveAttendance()`, so a timezone
  offset can't roll the day backwards.
- On success the in-memory `SHEET_DATA.attendance` row is patched in place (not pushed), then
  `renderAttendanceReport()` re-renders.

## Tests — `test-attendance-edit.mjs`

Pure-logic + contract checks, no DOM:

- **Permission matrix** (`canEditAttendanceOf`): own entry ✓; someone else's ✗; עידן any ✓; עמיחי any ✓;
  viewer nothing ✗ (even their own); not-logged-in ✗.
- **Payload builder**: carries the id (→ update not insert); preserves the original `person`; noon-anchors
  the date so the day never shifts; drops the note for non-"other" types; requires a note for "other".
- **id threading**: guards that `renderAttendanceReport` maps `id:` and `mergeAttendanceByDate` carries
  `id: o.id` on the non-field branch — the two spots whose regression silently removes every ✏️.
- **Field rows carry no id** → never editable from the attendance table.
- **Markup contract**: `#attEditModal` + its inputs exist; the ✏️ is inside the existing last cell so
  `colspan=5` stays correct.

## Not doing (deliberate)

- **No delete** — per the decision above. Add if duplicate entries turn out to be a real problem.
- **No attendance↔field conversion.** Mis-logging a field day as משרד still needs the row fixed and a
  visit created. Revisit only if it actually happens.
- **No time-lock on closed months.** Attendance feeds pay, so editing a month that was already reported
  to accounting is a real risk — but no month-close concept exists in the app yet. Worth adding a lock
  (or an edit log) when one does.
- **Multiple non-field entries on one day:** the table already shows only `d.others[0]`, so the ✏️ edits
  that one. Pre-existing display behaviour, unchanged here.
