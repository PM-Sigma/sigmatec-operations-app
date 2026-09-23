# R5 · A — Attendance (נוכחות): spec + implementation plan

STATUS: 🟡 OPEN — planned 23.9, NOT built. Resume: A-L1…A-L4 can start now in a worktree off `origin/main` (A-L1 first: C-L2 and V both wait on it). A-L5 waits for V's release (V8). A-U1…A-U5 start after the designer's PASS on the design system and after S merges. Tick the boxes as you go.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 📅 נוכחות screen on the round-5 design system: the "חסר לך" block redone, holidays and eves purple and missing days red (for the people who file) in the month grid, and stat tiles that color the grid when tapped. Make the screen read attendance rows the way package V now writes them (`source`, manual rows win).

**Architecture:** Every decision stays a pure function in `app/src/lib/attendance.ts` (goldens in `attendance.test.ts`). `Attendance.tsx` stays a thin renderer; its writes keep going through the bridge (`sigma.attSave`). This spec also holds the **canonical contract between V and its readers (A and C)**, §4.

**Tech Stack:** React 18 + TypeScript islands (Vite), TanStack Query, vitest (goldens), Playwright (4 projects), lucide-react, the round-5 tokens (`app/src/tokens.css`).

**Spec:** `docs/superpowers/specs/2026-09-23-round-5-design.md` (package A row, "Attendance rules (exact)", rulings), `docs/superpowers/specs/2026-09-23-design-system-design.md`, `docs/design/tools-and-motion.md`. Companion: `docs/superpowers/specs/2026-09-23-r5-C-calendar.md`.

---

## 0. Where the requirements come from

The round-5 spec names the package "Attendance 8": the "חסר לך" block redone, holidays purple and missing red in the mini calendar, and clickable tiles that color the calendar. Everything below comes from that row and the rulings it points to.

| # | Requirement | Source |
|---|---|---|
| A1 | **"חסר לך" redone** as a design-system SectionBlock (danger title, count Tag, one row per missing day, a tap opens that day). It shows only for a person who files attendance (אביאם, ניתאי). When the month is complete it says so without "!". The team block ("חסר לצוות") follows the same system. | package A row; design-system rulings (missing red only for אביאם/ניתאי; no "!") |
| A2 | **The month grid** on DayCell: holidays and eves purple, filed days green (office info, away neutral), missing past workdays red **only for a filer**, as a dot plus danger ink, **no red border**. Today is a ring. The legend always shows. | package A row; DayCell spec; "Missing-day red: only אביאם and ניתאי" |
| A3 | **Clickable tiles.** The tiles (ימי שטח, משרד ובית, and ימים חסרים for a filer) are StatTiles. Tapping one colors only that category in the grid (holidays and eves stay purple for context); a second tap clears it. | package A row; StatTile spec ("A tile that filters has aria-pressed… a second tap clears it") |
| A4 | **Rows as V writes them.** A day may carry a `manual`, `calendar` or `visit_auto` row. Manual rows win. A `visit_auto` day says it was filled from the visit summary, and the person may change it (which makes it manual). | round-5 "Attendance rules (exact)" §1, §2, §5 |
| A5 | **Copy and icons**: no emoji in UI text (lucide), noun-form buttons, geresh in day letters (יום ג׳), no "!", toast in the verb of the action. | design-system rulings; tools-and-motion §1 (copy) |

What A does **not** do: write attendance from a visit, prompt "הוזן X, לשנות לשטח?", move a row when a visit's date changes, the backfill, the push readers (all V); the calendar's cells (C); the PDF/Excel builders (legacy, untouched).

## 1. Global constraints

Every task's requirements include these. Values copied from the binding specs.

- Phones **360–430 CSS px**. Sweep at 360 / 390 / 412 / 430, plus **344 as a warning only**. Desktop 1440 / 1920 per build, 2560 / 3840 nightly.
- **Tokens only** (no raw hex, px radii, z-index values or durations outside `tokens.css`). Motion tokens: `--s-motion-press 90ms`, `--s-motion-fast 140ms`, `--s-motion-base 200ms`, `--s-motion-enter 280ms`, `--s-motion-exit 180ms`; eases `--s-ease-out cubic-bezier(0.16, 1, 0.3, 1)`, `--s-ease-in cubic-bezier(0.4, 0, 1, 1)`, `--s-ease-standard cubic-bezier(0.2, 0, 0, 1)`. No count-up on numbers.
- **Copy:** noun-form buttons (שמירה, שליחה, סגירה, ביטול), no `!`, no em dash, no emoji in UI strings, geresh/gershayim (יום ג׳, סה״כ), Hebrew `aria-label`s. Dates `d.m` in `<bdi>` with `tabular-nums`. humanizer read; `test-copy-rules.mjs` gate.
- **Purple = holiday and eve only.** Missing red: אביאם and ניתאי only, past workdays only, dot plus danger ink, no red border.
- **StatTile:** 2 per row under 480 px container, 3 at 480+, 4 at 640+ (`StatTileGrid`). A filtering tile has `aria-pressed`; selected = 2 px ring + fill tint in its role color; a second tap clears.
- One primary (gradient) action per screen; action row ≤ 3 bubbles; `position:absolute` only for badge / grab handle / focus ring; logical properties only.
- Every popup is the design-system `Sheet`. Toast: 4 s, or 5 s with "ביטול"; one at a time.
- Boot chunk ≤ **303 kB** (Attendance is a lazy chunk; nothing here goes into boot).
- `qa/impeccable-baseline.json` never rises and ends at 0; `no-overlap-allow.json` ends empty.
- **Designer PASS** before merge, on the same evidence set as C (PNGs at 360×780 and 412×915, light and dark, for every state; impeccable JSON + URL scans; sweep; axe; copy gate; boot size; 360 video normal + reduced motion; tokens/components used and asked for).
- Workflow and ship loop as in CLAUDE.md (worktree off `origin/main`, `node build.mjs`, ff-only push after reading `VERSION`). Skills: ponytail, TDD, verification-before-completion, no-ai-slop + humanizer. `python docs/ops-graph/ops_graph.py file <x>` before touching a file. Never modify another repo.

## 2. File ownership

**A owns (edits freely):**

| File | What A does there |
|---|---|
| `app/src/lib/attendance.ts` | all new pure builders (A-L1…A-L5) |
| `app/src/lib/attendance.test.ts` | goldens |
| `app/src/islands/Attendance.tsx` | the rewrite (A-U1…A-U4) and the V switch-over (A-L5) |
| `app/src/styles.css`, section `/* ===== 📅 נוכחות … */` (`.att-*`, lines 186–306 at `c7faa12`) | shrinks to what the design-system parts don't cover; ends with no raw values |
| `qa/playwright/tests/attendance.spec.ts` | browser tests |

**Shared files, narrow edits only:**

| File | Owner | A's edit, and nothing else |
|---|---|---|
| `app/src/styles.css` token block, lines 38–42 (`--att-field-bg` … `--att-holiday-ink`) | Phase 2 (design system) | delete those five lines in A-U5 once `grep -rn "\-\-att-" app/src css` finds no reader. |
| `app/src/lib/calendar.ts` | C | none. C imports `ATT_FILERS` / `mustFile` from A. |
| `app/src/islands/Holidays.tsx` | R | none, but it renders `dayChip()`. A-L2's geresh fix changes its text from "יום ג · 3.9" to "יום ג׳ · 3.9". Tell R; R's tests are re-run in A-L2. |
| `app/src/lib/gaps.ts`, `Gaps.tsx` | R | none. They use `AttRow` as a type only, and A-L1 only widens `source`. |
| `app/src/components/ui/*`, `tokens.css` | Phase 2 | none. Missing props are requests (§8). |

**A does not touch:** `js/src/04-attendance-daily.js`, `js/src/01-data.js`, `js/src/22-push.js`, `supabase/functions/push-send/*`, migrations (all V); `#attendanceLegacy` in `index.html` (stays hidden; `📄 PDF` / `📗 Excel` still read what it renders through `sigma.setAttPerson` / `window._attendanceRows`, so the effect that keeps it in step stays).

## 3. Boundary with V on `attendance.ts`

The round-5 packages table lists `attendance.ts` under V as well. The split, so the two never edit the same lines:

- **A owns `attendance.ts`.** A-L1 lands first and gives V what it needs from this file: the `AttSource` union with `'visit_auto'`, `ATT_FILERS`, `mustFile`, and `mergeByDay` (manual > calendar > visit_auto).
- **V puts its own pure logic in a new file**, suggested `app/src/lib/visitAttendance.ts` (the rows a saved visit writes, the "הוזן X, לשנות לשטח?" decision, what a moved date does). It imports types from `attendance.ts` and never edits it.
- **`withVisitDays`** (the derivation round 5 retires, `attendance.ts:425`) is A's. A-L1 makes it source-aware now; A-L5 deletes it once V's rows are live (V8).

## 4. The V → A/C contract (canonical)

C's spec copies the items it uses (V3, V4, V6, V7). If a copy differs, **this text wins**. V's spec must restate these items as its acceptance criteria.

- **V1 · source values.** `public.attendance.source` (the column already exists: `db/calendar_absences.sql`, default `'manual'`) holds only `'manual' | 'calendar' | 'visit_auto'`. V writes `'visit_auto'` for rows it creates from a visit and may add a CHECK constraint. The client-side value `'visit'` (today's derived rows from `attRowsFor`) disappears after V8.
- **V2 · one row per person per day.** After V ships, a person has at most one attendance row per calendar day (`left(date, 10)`). V enforces it on every write, and its backfill dedupes first; a unique index on `(person, left(date, 10))` is recommended. Readers still merge defensively (A-L1 `mergeByDay`).
- **V3 · the reader.** `sigma.attRows(person, year, month)` (React side, 1-based month; legacy `attRowsFor`) returns that person's real rows for the month as `AttRow[]`, with `source` passed through from the DB (`01-data.js readSnapshot` maps it; today it drops it). After V8 it no longer synthesizes field rows from visits. A `visit_auto` row has `type: 'field'`, and may carry `kibbutz` and `hours` for display. It returns `null` while `SHEET_DATA` isn't loaded (unchanged). The mock snapshot (`?sb=0`, `js/src/01-data.js`) carries the same shape, including a `visit_auto` row for each mock visit.
- **V4 · events.** After any attendance write, including the automatic one and a deleted `visit_auto` row, V emits `attendance-saved` with `{ person, date, source }`. It keeps emitting `visit-saved` as today. A and C invalidate `['attRows']` on both.
- **V5 · the manual writer.** `sigma.attSave({ person, date, dayType, note })` writes `source = 'manual'` and **replaces** any existing row of that person on that day (a `visit_auto` or `calendar` row included), so a person can turn an automatic שטח day into משרד. Errors and the viewer block are unchanged.
- **V6 · visitors.** Every row of `sigma.loadAllVisitsCombined()` carries `visitors: string[]` (מי ביקר, multi-select) and keeps `visitor` = the first one for legacy readers; `id` is stable.
- **V7 · the editor API** (C only). `openVisitChapters(kibbutz, { visitId, chapter })` from `@/islands/Field`: `visitId` opens the existing visit for editing, `chapter: 4` lands on תעודת משלוח, `false` when not mounted. Plus `canEditVisit(user, visit, flags): boolean` exported from `app/src/lib/visitDraft.ts`.
- **V8 · one release.** The backfill of existing visits, the reader switch (V3) and the writer change (V5) ship in **one** release. Until then A and C run on today's shape, which A-L1 handles. A-L5 is merged right after V8 is on `origin/main`.

## 5. Graph blast radius

Run first: `python docs/ops-graph/ops_graph.py file Attendance.tsx`, `file attendance.ts`, `table attendance`. At `c7faa12`:

- **`attendance.ts`** (degree 60) is imported by `Attendance.tsx`, `calendar.ts` (re-exports `isHolidayEve`, `missingDaysFor`, `reportedDaysFor`), `Gaps.tsx` and `gaps.ts` (types, `ymd`), `Holidays.tsx` (`dayChip`, `holidayShort`, `ymd`), and `attendance.test.ts`, `gaps.test.ts`. The graph also links it to `22-push.js attNotRequired` (a mirrored rule, not an import).
  - Changing `dayChip` moves `Holidays.tsx`'s text (R).
  - Changing `DAY_LABELS` affects only Attendance.tsx: the legacy side has its own labels.
  - Widening `AttRow.source` is type-only for Gaps.
- **`Attendance.tsx`** (degree 70) reads `sigma.attRows` (key `['attRows', person, y, m]`, **shared with Calendar.tsx**), `SHEET_DATA.visits` (`readVisits`, removed in A-L5) and holidays (`sigma.attHolidays`). It writes through `sigma.attSave` and keeps the legacy report in step (`sigma.setAttPerson`, `window.attendanceViewYear/Month`).
- **The `attendance` table**: writers are `04-attendance-daily.js attSaveRow / saveAttEdit`, `apply_absence()`, and V's new writer. Readers: `01-data.js readSnapshot`, `04-attendance-daily.js attRowsFor / renderAttendanceReport / openAttEdit`, `push-send haveDates`, and the RLS policies (`attendance_read`, `attendance_no_viewer_insert`, pending in `rls_viewer_readonly.sql`). **A changes none of these.** V does.
- **After A ships:** `python docs/ops-graph/rebuild.py`, a Sonnet re-extraction chunk for this spec, and a message to the graph session.

## 6. Review Focus

1. **A manual row and a visit on the same day.** The rule is "manual wins". The golden flips from today's visit-wins. On screen nothing changes until V8, because today's legacy merge already hides the manual row. Test: A-L1.
2. **A `visit_auto` row and a manual row both come back for one day** (V2 violated, or a stale snapshot). The screen shows the manual one, once. Test: A-L1 `mergeByDay`.
3. **A tile stays selected while the month changes.** The count updates and the filter keeps working. A tile with value 0 still toggles without error. Test: A-L3 `attCellLook` / `toggleTile`.
4. **Someone who doesn't file opens the screen** (מתניה, or עידן on his own name). There's no "חסר לך" block, no missing tile and no red cell. A filer seen by someone else gets the block titled with the filer's name. Test: A-L2 `missingBlock`, A-L3 `attTiles`.
5. **A past ערב חג with no row, under a tile filter.** For a filer it's red (missing wins over the eve dot) and keeps the eve name in its label. A future eve stays purple under any tile. Test: A-L3.

---

## 7. Tasks — L (logic/data, start now)

Commands: `cd app && node node_modules/vitest/vitest.mjs run src/lib/attendance.test.ts`; whole suite `npm test`.

### Task A-L1: sources, filers, merge by day (A4) — lands first

**Files:**
- Modify: `app/src/lib/attendance.ts` (`AttRow.source`, new `AttSource`, `ATT_FILERS`, `mustFile`, `mergeByDay`, `withVisitDays`)
- Test: `app/src/lib/attendance.test.ts` (the `withVisitDays` describe, ~line 252; the case at ~line 300 flips)

**Interfaces:**
- Produces: `type AttSource = 'manual' | 'calendar' | 'visit_auto' | 'visit'`; `AttRow.source?: AttSource`; `ATT_FILERS: readonly string[]`; `mustFile(person: string): boolean`; `mergeByDay(rows: AttRow[] | null | undefined): AttRow[]`; `withVisitDays` now lets any real row win over a derived visit day.

- [ ] **Step 1: Write the failing tests.**

```ts
describe('round 5 · A4 — who files, and which row wins a day', () => {
  it('only אביאם and ניתאי file attendance', () => {
    expect(ATT_FILERS).toEqual(['אביאם', 'ניתאי']);
    expect(mustFile('אביאם')).toBe(true);
    expect(mustFile('ניתאי')).toBe(true);
    expect(mustFile('עידן')).toBe(false);
    expect(mustFile('')).toBe(false);
  });
  it('one row per day: manual beats calendar beats visit_auto; unknown source counts as manual', () => {
    const out = mergeByDay([
      { date: '2026-09-03', type: 'field', source: 'visit_auto' },
      { date: '2026-09-03T12:00:00.000Z', type: 'office', source: 'manual' },
      { date: '2026-09-07', type: 'vacation', source: 'calendar' },
      { date: '2026-09-07', type: 'field', source: 'visit_auto' },
      { date: '2026-09-08', type: 'wfh' },
      { date: '2026-09-08', type: 'field', source: 'visit_auto' },
      { date: '', type: 'office' },
    ]);
    expect(out.map(r => [r.date, r.type])).toEqual([
      ['2026-09-03', 'office'], ['2026-09-07', 'vacation'], ['2026-09-08', 'wfh'],
    ]);
  });
  it('a visit_auto row is a real row: a derived visit day never overrides it or duplicates it', () => {
    const out = withVisitDays([{ date: '2026-09-03', type: 'field', source: 'visit_auto', kibbutz: 'יגור' }], [visit('2026-09-03')], 'אביאם');
    expect(out).toEqual([{ date: '2026-09-03', type: 'field', source: 'visit_auto', kibbutz: 'יגור' }]);
  });
});
```

Change the existing case at ~line 300 (`withVisitDays([row('2026-09-03', 'office')], [visit('2026-09-03')], 'אביאם')`) to expect the **manual** row to win, with the reason on a comment line: `// round 5 rule 5: manual rows win over visits (the visit writer asks before changing a manual day)`. The expectation becomes `expect(out).toEqual([{ ...row('2026-09-03', 'office'), date: '2026-09-03' }])`; match the helper `row()`'s real shape in the file. Also re-check the case at ~line 285 (`withManual`), which adds a manual office row on a visit day: it now keeps the office row on that date. Import `ATT_FILERS, mergeByDay, mustFile`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** In `attendance.ts`:

```ts
/**
 * Where a row came from. 'manual' = someone typed it · 'calendar' = generated from a
 * calendar_absences range · 'visit_auto' = written by package V when a visit was saved ·
 * 'visit' = the pre-V derived row the legacy merge builds (retired by A-L5).
 */
export type AttSource = 'manual' | 'calendar' | 'visit_auto' | 'visit';
```

and in `AttRow` replace the `source` line with `source?: AttSource;` (keep the doc comment, updated). Then:

```ts
/** The two people who file attendance (spec §7f). The ONE list — calendar.ts reuses it. */
export const ATT_FILERS: readonly string[] = ['אביאם', 'ניתאי'];

export function mustFile(person: string): boolean {
  return !!person && ATT_FILERS.indexOf(person) !== -1;
}

const SOURCE_RANK: Record<AttSource, number> = { manual: 0, calendar: 1, visit_auto: 2, visit: 3 };

function rankOf(r: AttRow): number {
  const s = (r.source || 'manual') as AttSource;
  return SOURCE_RANK[s] ?? 0;
}

/**
 * One row per day, the strongest source winning (round 5 rule 5: manual rows win). V writes
 * one row per day already (contract V2); this is the reader's guard against a stale snapshot
 * that still has two.
 */
export function mergeByDay(rows: AttRow[] | null | undefined): AttRow[] {
  const byDate = new Map<string, AttRow>();
  for (const r of rows || []) {
    const date = toYmd(r?.date);
    if (!date) continue;
    const cur = byDate.get(date);
    if (!cur || rankOf(r) < rankOf(cur)) byDate.set(date, { ...r, date });
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

Rewrite the body of `withVisitDays`, keeping its signature:

```ts
export function withVisitDays(
  rows: AttRow[] | null | undefined,
  visits: VisitLike[] | null | undefined,
  person?: string,
): AttRow[] {
  // The legacy merge's derived rows are dropped and rebuilt from the visits (an edited visit
  // date must move the day). Every REAL row (manual / calendar / visit_auto) is kept and wins:
  // round 5 rule 5 — a visit never silently overwrites a day someone filed.
  const real = mergeByDay((rows || []).filter(r => r && r.source !== 'visit'));
  const byDate = new Map(real.map(r => [r.date, r] as [string, AttRow]));
  for (const [date, dayVisits] of visitsByDate(visits, person)) {
    if (!byDate.has(date)) byDate.set(date, visitDayRow(date, dayVisits));
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

Update the section comment above it ("a saved visit IS a יום שטח") with one line: "Round 5: a real row wins; package V writes visit days as `visit_auto` rows, and A-L5 retires this derivation."

- [ ] **Step 4: Run, expect PASS.** Then `npm test` (includes `gaps.test.ts`, `calendar.test.ts`).
- [ ] **Step 5: Commit** `feat(attendance): A-L1 — ATT_FILERS/mustFile, source-aware merge, manual rows win`.

**Acceptance:** all attendance goldens pass (two flipped with a written reason). Push this task to `origin/main` early (ship loop), since C-L2 and V both import from it.

---

### Task A-L2: copy in the pure layer, and the "חסר לך" model (A1, A5)

**Files:**
- Modify: `app/src/lib/attendance.ts` (`DAY_LABELS`, `dayChip`, new `savedToast`, `missingBlock`)
- Test: `app/src/lib/attendance.test.ts` (the `dayLabel` case ~line 198; any `dayChip` / `holidayNote` / `eveCountdownText` golden)

**Interfaces:**
- Produces: labels without emoji; `dayChip(date) → 'יום ג׳ · 3.9'`; `savedToast(type: DayType, date: string, holiday: Holiday | null): string`; `interface MissingBlock { show: boolean; title: string; count: number; days: Array<{ date: string; label: string; aria: string }>; empty: string }`; `missingBlock(person: string, me: string, missing: string[], onHoliday?: number): MissingBlock`.

- [ ] **Step 1: Write the failing tests.**

```ts
describe('round 5 · A5 — copy', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  it('day labels are words', () => {
    expect(DAY_LABELS).toEqual({
      field: 'יום שטח', office: 'משרד', wfh: 'מהבית', reserve: 'מילואים', vacation: 'חופש', off: 'לא בעבודה', other: 'אחר',
    });
    for (const s of Object.values(DAY_LABELS)) expect(s).not.toMatch(EMOJI);
  });
  it('a day letter carries its geresh', () => {
    expect(dayChip('2026-09-01')).toBe('יום ג׳ · 1.9');
  });
  it('the save toast says what was saved, and marks a holiday without a sermon', () => {
    const HOL = { date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false } as Holiday;
    expect(savedToast('office', '2026-09-03', null)).toBe('נשמר · משרד · 3.9');
    expect(savedToast('field', '2026-09-21', HOL)).toBe('נשמר · יום שטח · 21.9 · יום חג');
  });
  it('eve copy has no emoji either', () => {
    expect(holidayNote({ date: '2026-09-20', name: 'ערב יום כיפור', kind: 'holiday_eve', required: true })).not.toMatch(EMOJI);
    expect(eveCountdownText(3)).not.toMatch(EMOJI);
  });
});

describe('round 5 · A1 — the "חסר לך" block', () => {
  it('for the person himself', () => {
    expect(missingBlock('אביאם', 'אביאם', ['2026-09-01', '2026-09-03'])).toEqual({
      show: true, title: 'חסר לך', count: 2,
      days: [
        { date: '2026-09-01', label: 'יום ג׳ · 1.9', aria: 'תיעוד יום ג׳ · 1.9' },
        { date: '2026-09-03', label: 'יום ה׳ · 3.9', aria: 'תיעוד יום ה׳ · 3.9' },
      ],
      empty: 'כל ימי העבודה בחודש מתועדים.',
    });
  });
  it('someone else looking names the person', () => {
    expect(missingBlock('ניתאי', 'עידן', []).title).toBe('חסר לניתאי');
  });
  it('a complete month says so, counting work on a holiday', () => {
    expect(missingBlock('אביאם', 'אביאם', [], 1).empty).toBe('כל ימי העבודה בחודש מתועדים · יום עבודה אחד בחג.');
    expect(missingBlock('אביאם', 'אביאם', [], 2).empty).toBe('כל ימי העבודה בחודש מתועדים · 2 ימי עבודה בחג.');
  });
  it('nobody is chased who doesn’t file', () => {
    expect(missingBlock('עידן', 'עידן', ['2026-09-01']).show).toBe(false);
    expect(missingBlock('מתניה', 'מתניה', []).show).toBe(false);
  });
});
```

Update the old `dayLabel` goldens (`'🌾 יום שטח'` → `'יום שטח'`, `'🏢 משרד'` → `'משרד'`) and any `dayChip` golden to the geresh form, noting "round 5: no emoji, geresh" in the same commit. Import `DAY_LABELS, savedToast, missingBlock` (`dayChip`, `holidayNote`, `eveCountdownText` are imported already or add them).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

```ts
export const DAY_LABELS: Record<DayType, string> = {
  field: 'יום שטח',
  office: 'משרד',
  wfh: 'מהבית',
  reserve: 'מילואים',
  vacation: 'חופש',
  off: 'לא בעבודה',
  other: 'אחר',
};

export function dayChip(date: string): string {
  return 'יום ' + HE_DAY_LETTERS[dowOf(date)] + '׳ · ' + dm(date);
}

/** The toast after a save — the verb of the action, the day, and a plain holiday mark. */
export function savedToast(type: DayType, date: string, holiday: Holiday | null): string {
  return 'נשמר · ' + dayLabel(type) + ' · ' + dm(date) + (holiday && !holiday.required ? ' · יום חג' : '');
}

export interface MissingBlock {
  /** Only for a person who files (אביאם / ניתאי). */
  show: boolean;
  title: string;
  count: number;
  days: Array<{ date: string; label: string; aria: string }>;
  /** What the block says when nothing is missing. */
  empty: string;
}

export function missingBlock(person: string, me: string, missing: string[], onHoliday = 0): MissingBlock {
  const tail = onHoliday === 1 ? ' · יום עבודה אחד בחג' : onHoliday > 1 ? ' · ' + onHoliday + ' ימי עבודה בחג' : '';
  return {
    show: mustFile(person),
    title: person === me ? 'חסר לך' : 'חסר ל' + person,
    count: (missing || []).length,
    days: (missing || []).map(date => ({ date, label: dayChip(date), aria: 'תיעוד ' + dayChip(date) })),
    empty: 'כל ימי העבודה בחודש מתועדים' + tail + '.',
  };
}
```

`holidayNote` and `eveCountdownText` read `DAY_LABELS`, so they lose their emoji with this change and need no edit of their own.

- [ ] **Step 4: Run, expect PASS.** Then `npm test`, and `npx playwright test --config qa/playwright/playwright.config.ts qa/playwright/tests/attendance.spec.ts` plus the holidays spec if one exists (`grep -l Holidays qa/playwright/tests`), because `dayChip`'s text moved. Update any string assertion that included "יום ג ·" to "יום ג׳ ·". Tell R that `Holidays.tsx` text changed.
- [ ] **Step 5: Commit** `feat(attendance): A-L2 — words not emoji, geresh day letters, save toast, חסר לך model`.

**Acceptance:** no emoji in `attendance.ts` strings; `test-copy-rules.mjs` green; the toast in `Attendance.tsx` switches to `savedToast` in the same commit (one line in `save.onSuccess`: `toast.success(savedToast(v.type, v.date, cell?.holiday || null))`).

---

### Task A-L3: tiles and the cell look (A2, A3)

**Files:**
- Modify: `app/src/lib/attendance.ts`
- Test: `app/src/lib/attendance.test.ts`

**Interfaces:**
- Produces:

```ts
export type TileKey = 'field' | 'office' | 'missing';
export interface AttTile { key: TileKey; label: string; value: number; role: 'ok' | 'info' | 'danger' }
export function attTiles(k: Kpis, person: string): AttTile[];
export function toggleTile(cur: TileKey | null, t: TileKey): TileKey | null;
export type AttCellState = 'default' | 'selected' | 'holiday' | 'eve' | 'field' | 'office' | 'away' | 'missing';
export interface AttCellLook { state: AttCellState; today: boolean; label: string }
export function attCellLook(c: DayCell, o: { person: string; tile: TileKey | null; selected: boolean }): AttCellLook;
export type AttLegendKey = 'holiday' | 'eve' | 'field' | 'office' | 'away' | 'missing';
export function attLegend(person: string): Array<{ key: AttLegendKey; label: string }>;
```

- [ ] **Step 1: Write the failing tests.** They use the file's September 2026 fixture (`monthGrid(2026, 9, …)`); `TODAY` there is the fixture's "today". If the file's constant has another name, use it.

```ts
describe('round 5 · A3 — tiles', () => {
  const K = { field: 4, office: 6, away: 1, days: 11, missing: 3, onHoliday: 0, hours: 30 };
  it('a filer gets three tiles, anyone else two', () => {
    expect(attTiles(K, 'אביאם')).toEqual([
      { key: 'field', label: 'ימי שטח', value: 4, role: 'ok' },
      { key: 'office', label: 'משרד ובית', value: 6, role: 'info' },
      { key: 'missing', label: 'ימים חסרים', value: 3, role: 'danger' },
    ]);
    expect(attTiles(K, 'מתניה').map(t => t.key)).toEqual(['field', 'office']);
  });
  it('a second tap clears; another tile switches', () => {
    expect(toggleTile(null, 'field')).toBe('field');
    expect(toggleTile('field', 'field')).toBe(null);
    expect(toggleTile('field', 'office')).toBe('office');
  });
});

describe('round 5 · A2 — one look per cell', () => {
  const HOL: Holiday = { date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false };
  const EVE: Holiday = { date: '2026-09-16', name: 'ערב סוכות', kind: 'holiday_eve', required: true };
  const EVE_FUT: Holiday = { date: '2026-09-29', name: 'ערב שמחת תורה', kind: 'holiday_eve', required: true };
  const rows: AttRow[] = [
    { date: '2026-09-01', type: 'field', source: 'visit_auto' },
    { date: '2026-09-02', type: 'office' },
    { date: '2026-09-03', type: 'vacation', source: 'calendar' },
  ];
  const today = new Date(2026, 8, 23, 12);
  const g = monthGrid(2026, 9, rows, [HOL, EVE, EVE_FUT], today);
  const at = (d: string) => g.cells.find(c => c.date === d)!;
  const look = (d: string, o: Partial<{ person: string; tile: TileKey | null; selected: boolean }> = {}) =>
    attCellLook(at(d), { person: 'אביאם', tile: null, selected: false, ...o });

  it('filed days by type; holiday purple; a future eve purple', () => {
    expect(look('2026-09-01').state).toBe('field');
    expect(look('2026-09-02').state).toBe('office');
    expect(look('2026-09-03').state).toBe('away');
    expect(look('2026-09-21')).toMatchObject({ state: 'holiday', label: 'יום ב׳ · 21.9 · יום כיפור' });
    expect(look('2026-09-29').state).toBe('eve');
  });
  it('a missing past workday is red for a filer, plain for anyone else', () => {
    expect(look('2026-09-07')).toMatchObject({ state: 'missing', label: 'יום ב׳ · 7.9 · לא דווחה נוכחות' });
    expect(look('2026-09-07', { person: 'מתניה' }).state).toBe('default');
  });
  it('a past eve with no row is missing for a filer, and keeps its name', () => {
    expect(look('2026-09-16')).toMatchObject({ state: 'missing', label: 'יום ד׳ · 16.9 · ערב סוכות · לא דווחה נוכחות' });
  });
  it('a tile colors only its own category; holidays and eves stay purple', () => {
    expect(look('2026-09-01', { tile: 'office' }).state).toBe('default');
    expect(look('2026-09-02', { tile: 'office' }).state).toBe('office');
    expect(look('2026-09-07', { tile: 'field' }).state).toBe('default');
    expect(look('2026-09-21', { tile: 'field' }).state).toBe('holiday');
    expect(look('2026-09-29', { tile: 'missing' }).state).toBe('eve');
  });
  it('selected wins; today is a ring on top', () => {
    expect(look('2026-09-01', { selected: true }).state).toBe('selected');
    expect(look('2026-09-23')).toMatchObject({ today: true });
  });
  it('the legend shows red only for a filer', () => {
    expect(attLegend('מתניה').map(i => i.key)).toEqual(['holiday', 'eve', 'field', 'office', 'away']);
    expect(attLegend('ניתאי').map(i => i.key)).toEqual(['holiday', 'eve', 'field', 'office', 'away', 'missing']);
  });
});
```

(Dates: 1.9.2026 is a Tuesday, 7.9 a Monday, 16.9 a Wednesday, 21.9 a Monday, 23.9 a Wednesday.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

```ts
// ───────────────────── tiles and the cell look (round 5 · A2, A3) ─────────────────────

export type TileKey = 'field' | 'office' | 'missing';

export interface AttTile { key: TileKey; label: string; value: number; role: 'ok' | 'info' | 'danger' }

/** StatTiles on top of the month. The missing tile exists only for someone who files. */
export function attTiles(k: Kpis, person: string): AttTile[] {
  const out: AttTile[] = [
    { key: 'field', label: 'ימי שטח', value: k.field, role: 'ok' },
    { key: 'office', label: 'משרד ובית', value: k.office, role: 'info' },
  ];
  if (mustFile(person)) out.push({ key: 'missing', label: 'ימים חסרים', value: k.missing, role: 'danger' });
  return out;
}

export function toggleTile(cur: TileKey | null, t: TileKey): TileKey | null {
  return cur === t ? null : t;
}

/** The DayCell states the grid uses (components/ui/day-cell.tsx). */
export type AttCellState = 'default' | 'selected' | 'holiday' | 'eve' | 'field' | 'office' | 'away' | 'missing';

export interface AttCellLook {
  state: AttCellState;
  /** Today is a ring ON TOP of the state. */
  today: boolean;
  label: string;
}

const TILE_OF: Partial<Record<AttCellState, TileKey>> = { field: 'field', office: 'office', missing: 'missing' };

/**
 * What a cell looks like, once. From what he did (monthGrid's `state`) → missing only for a
 * filer → purple for a holiday or an eve with nothing on it → a selected tile keeps its own
 * category and turns the rest plain, except purple, which is context and always stays.
 */
export function attCellLook(c: DayCell, o: { person: string; tile: TileKey | null; selected: boolean }): AttCellLook {
  const filer = mustFile(o.person);
  let base: AttCellState = 'default';
  if (c.state === 'field' || c.state === 'office' || c.state === 'away') base = c.state;
  else if (c.state === 'missing') base = filer ? 'missing' : (c.eve ? 'eve' : 'default');
  else if (c.state === 'holiday') base = 'holiday';
  else if (c.eve && !c.row) base = 'eve';

  let state: AttCellState = base;
  if (o.selected) state = 'selected';
  else if (o.tile && base !== 'holiday' && base !== 'eve' && TILE_OF[base] !== o.tile) state = 'default';

  const facts = [dayChip(c.date)];
  if (c.holiday) facts.push(c.holiday.name);
  if (c.row) facts.push(dayLabel(c.row.type));
  else if (base === 'missing') facts.push('לא דווחה נוכחות');
  return { state, today: c.today, label: facts.join(' · ') };
}

export type AttLegendKey = 'holiday' | 'eve' | 'field' | 'office' | 'away' | 'missing';

export function attLegend(person: string): Array<{ key: AttLegendKey; label: string }> {
  const out: Array<{ key: AttLegendKey; label: string }> = [
    { key: 'holiday', label: 'חג' },
    { key: 'eve', label: 'ערב חג' },
    { key: 'field', label: 'יום שטח' },
    { key: 'office', label: 'משרד ובית' },
    { key: 'away', label: 'חופש, מילואים ואחר' },
  ];
  if (mustFile(person)) out.push({ key: 'missing', label: 'לא דווחה נוכחות' });
  return out;
}
```

Check against `monthGrid`: a past eve with no row has `state === 'missing'` (an eve is required), a future eve has `'future'`, today's `'today'`. The code above handles all three. The label for a filed day adds the type (`'יום שטח'`), so the `'2026-09-01'` label is `'יום ג׳ · 1.9 · יום שטח'`. The tests above only assert labels where there's no row or a holiday.

- [ ] **Step 4: Run, expect PASS.** Then `npm test`.
- [ ] **Step 5: Commit** `feat(attendance): A-L3 — tiles that filter, one look per cell, legend`.

**Acceptance:** every case passes, including the past eve and the non-filer.

---

### Task A-L4: where a row came from (A4)

**Files:**
- Modify: `app/src/lib/attendance.ts`
- Test: `app/src/lib/attendance.test.ts`

**Interfaces:**
- Produces: `type RowOrigin = 'none' | 'manual' | 'calendar' | 'auto'`; `rowOrigin(row: AttRow | null): RowOrigin`; `originLine(row: AttRow | null): string`; `canOverride(row: AttRow | null): boolean`.

- [ ] **Step 1: Write the failing tests.**

```ts
describe('round 5 · A4 — where a day came from', () => {
  it('origin by source', () => {
    expect(rowOrigin(null)).toBe('none');
    expect(rowOrigin({ date: '2026-09-01', type: 'office' })).toBe('manual');
    expect(rowOrigin({ date: '2026-09-01', type: 'vacation', source: 'calendar' })).toBe('calendar');
    expect(rowOrigin({ date: '2026-09-01', type: 'field', source: 'visit_auto' })).toBe('auto');
    expect(rowOrigin({ date: '2026-09-01', type: 'field', source: 'visit' })).toBe('auto');
  });
  it('the line under an automatic day', () => {
    expect(originLine({ date: '2026-09-01', type: 'field', source: 'visit_auto', kibbutz: 'יגור', hours: 4 }))
      .toBe('נרשם אוטומטית מסיכום הביקור · יגור · 4 ש׳');
    expect(originLine({ date: '2026-09-01', type: 'field', source: 'visit_auto' })).toBe('נרשם אוטומטית מסיכום הביקור');
    expect(originLine({ date: '2026-09-03', type: 'vacation', source: 'calendar' })).toBe('נרשם מהיומן');
    expect(originLine({ date: '2026-09-02', type: 'office' })).toBe('');
  });
  it('a V-written or calendar day can be changed; the pre-V derived day cannot (the legacy merge would hide the change)', () => {
    expect(canOverride({ date: 'x', type: 'field', source: 'visit_auto' })).toBe(true);
    expect(canOverride({ date: 'x', type: 'vacation', source: 'calendar' })).toBe(true);
    expect(canOverride({ date: 'x', type: 'office', source: 'manual' })).toBe(true);
    expect(canOverride({ date: 'x', type: 'field', source: 'visit' })).toBe(false);
    expect(canOverride(null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**

```ts
export type RowOrigin = 'none' | 'manual' | 'calendar' | 'auto';

export function rowOrigin(row: AttRow | null): RowOrigin {
  if (!row) return 'none';
  if (row.source === 'visit_auto' || row.source === 'visit') return 'auto';
  if (row.source === 'calendar') return 'calendar';
  return 'manual';
}

export function originLine(row: AttRow | null): string {
  const o = rowOrigin(row);
  if (o === 'calendar') return 'נרשם מהיומן';
  if (o !== 'auto') return '';
  const parts = ['נרשם אוטומטית מסיכום הביקור'];
  if (row!.kibbutz) parts.push(row!.kibbutz);
  if (row!.hours) parts.push(row!.hours + ' ש׳');
  return parts.join(' · ');
}

/**
 * May the day editor offer to change this day? Yes for everything except the pre-V derived
 * row: today's legacy merge always shows the visit over a manual row, so a change there would
 * save and then vanish. After V8 no 'visit' rows exist and this is always true.
 */
export function canOverride(row: AttRow | null): boolean {
  return !row || row.source !== 'visit';
}
```

- [ ] **Step 4: Run, expect PASS.** Then `npm test`.
- [ ] **Step 5: Commit** `feat(attendance): A-L4 — row origin line and when a day may be changed`.

**Acceptance:** tests pass; nothing in the island changes yet (A-U4 uses these).

---

### Task A-L5: switch to V's rows (after V8)

**Depends on:** V8 on `origin/main`: `sigma.attRows` returns `visit_auto` rows, and the mock snapshot has one per mock visit.

**Files:**
- Modify: `app/src/islands/Attendance.tsx` (drop `readVisits`, the `attVisits` query and the `withVisitDays` call; rows = `mergeByDay(rowsQ.data)`), `app/src/lib/attendance.ts` (delete `withVisitDays`, `visitsByDate`, `visitDayRow`, `VisitLike`, `WORKDAY_HOURS`; drop `'visit'` from `AttSource`; `canOverride` becomes `() => true`, or delete it and its call)
- Test: `app/src/lib/attendance.test.ts` (delete the `withVisitDays` describe), `qa/playwright/tests/attendance.spec.ts`

- [ ] **Step 1: Write the failing Playwright test.**

```ts
test('attendance r5 · A4: a saved visit shows as an automatic field day from the row V wrote', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);                 // the helper the spec already uses
  const visitDay = await page.evaluate(() => String(((window as any).SHEET_DATA.visits || []).find((v: any) => v.visitor === 'אביאם').date).slice(0, 10));
  const row = await page.evaluate(d => ((window as any).SHEET_DATA.attendance || []).find((a: any) => a.person === 'אביאם' && String(a.date).slice(0, 10) === d), visitDay);
  expect(row && row.source).toBe('visit_auto');
  await expect(page.locator(`[data-date="${visitDay}"]`)).toHaveAttribute('data-att-state', 'field');
});
```

(Use the spec file's existing open helper name. `data-att-state` exists from A-U3. If A-L5 lands before A-U3, assert today's `data-state="field"` instead and let A-U3 rename it.)

- [ ] **Step 2: Run, expect PASS** already on the reader side if V8 is live. The test pins V's contract. It must FAIL on a build where V's mock still lacks `visit_auto` rows. Then delete the derivation and re-run to prove the screen no longer needs `SHEET_DATA.visits`.
- [ ] **Step 3: Implement.** In `Attendance.tsx`:

```tsx
// round 5 · V8: the rows ARE the answer — package V writes every visit day as a visit_auto
// row, so nothing is derived from the visits any more.
const rows = React.useMemo(() => mergeByDay((rowsQ.data || []) as AttRow[]), [rowsQ.data]);
```

Remove `readVisits`, `visitsQ`, the `['attVisits']` invalidation, and the `withVisitDays` / `VisitLike` imports. Keep `useSigmaEvent('visit-saved', refresh)` (V4: a visit save may change rows). Delete the retired functions from `attendance.ts` and their goldens.
- [ ] **Step 4: Run** `npm test` and the attendance Playwright spec on 4 projects; expect PASS.
- [ ] **Step 5: Commit** `feat(attendance): A-L5 — read V's rows; retire the visit derivation`.

**Acceptance:** `grep -rn "withVisitDays\|attVisits" app/src` finds nothing; field days on visit dates still show.

---

## 8. Tasks — U (screens, after the designer's PASS and S merged)

Before A-U1: `git fetch && git rebase origin/main`; confirm the design-system parts are on `main` (`stat-tile.tsx` with `StatTileGrid`, `day-cell.tsx`, `section-block.tsx`, `list-row.tsx`, `segmented-control.tsx`, `page-action-row.tsx`, `sheet.tsx`); run `python docs/ops-graph/ops_graph.py file Attendance.tsx`. Each U task ends with `npx playwright test --config qa/playwright/playwright.config.ts qa/playwright/tests/attendance.spec.ts` green on all 4 projects.

### Task A-U1: page, person, month, reports

**Files:** Modify `app/src/islands/Attendance.tsx` (the `<header>`), `app/src/styles.css` (`.att-icon-btn`, `.att-report-btn` go); Test `qa/playwright/tests/attendance.spec.ts`.

**Interfaces:** Consumes `PageActionRow`, `SegmentedControl`, `IconBubble` (design system). Produces `data-testid="att-person"` (only when `canSwitch`), keeps `att-month`, `att-pdf`, `att-excel`.

- [ ] **Step 1: Failing test:**

```ts
test('attendance r5: one page row, a person switch for עידן, reports as two icon bubbles', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await openAttendance(page);
  await expect(page.getByTestId('att-person').getByRole('tab')).toHaveText(['אביאם', 'ניתאי']);
  await expect(page.getByTestId('att-pdf')).toHaveAttribute('aria-label', 'הורדת דוח נוכחות PDF');
  await expect(page.getByTestId('att-excel')).toHaveAttribute('aria-label', 'הורדת דוח נוכחות Excel');
  await page.getByTestId('att-person').getByRole('tab', { name: 'ניתאי' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ניתאי');
});
test('attendance r5: ניתאי may look at אביאם’s month but not edit it (round 2 F-6, unchanged)', async ({ page }, ti) => {
  await boot(page, ti, { who: 'ניתאי' });
  await openAttendance(page);
  await page.getByTestId('att-person').getByRole('tab', { name: 'אביאם' }).click();
  await page.locator('[data-testid="att-grid"] [data-date]').first().click();
  await expect(page.locator('[data-testid="att-readonly"]:visible').first()).toBeVisible();
});
```

(Adjust the heading query to whatever element `PageActionRow` renders for its title; read `page-action-row.tsx` on `main`. The row's own markup decides, not this test.) Who may switch and who may write stays pinned by the existing `canSwitchPerson` / `canEditAttendance` goldens in `attendance.test.ts`; this task only moves the control.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement:**

```tsx
<PageActionRow
  title={<>נוכחות · <bdi>{person || me}</bdi></>}
  actions={[
    { icon: <FileText aria-hidden />, label: 'הורדת דוח נוכחות PDF', testId: 'att-pdf', onClick: () => { track('attendance-pdf'); sigma.attExportPdf?.(); } },
    { icon: <FileSpreadsheet aria-hidden />, label: 'הורדת דוח נוכחות Excel', testId: 'att-excel', onClick: () => { track('attendance-xlsx'); sigma.attExportExcel?.(); } },
  ]}
/>
{canSwitch && people.length > 1 ? (
  <div data-testid="att-person">
    <SegmentedControl options={people.map(p => ({ value: p, label: p }))} value={person}
      onChange={p => { setPerson(p); track('attendance-person'); }} />
  </div>
) : null}
<div className="att-period">
  <IconBubble label="חודש קודם" onClick={() => shiftMonth(-1)}><ChevronRight aria-hidden /></IconBubble>
  <strong data-testid="att-month"><bdi>{grid.label}</bdi></strong>
  <IconBubble label="חודש הבא" onClick={() => shiftMonth(1)}><ChevronLeft aria-hidden /></IconBubble>
</div>
```

Use `PageActionRow`'s and `IconBubble`'s real prop names from `main`; don't change the components. If `actions` isn't a prop, render two `IconBubble`s in the row's trailing slot, with `data-testid` and `aria-label` as above. Month swipe on the grid: the same rule as the calendar (25% width, toward the left = next month), off under reduced motion.
- [ ] **Step 4: Run, expect PASS**; `npm test`.
- [ ] **Step 5: Commit** `feat(attendance-ui): A-U1 — page row, person switch, month row`.

### Task A-U2: "חסר לך", "חסר לצוות", "היום"

**Files:** Modify `app/src/islands/Attendance.tsx`, `app/src/styles.css` (`.att-chip-missing`, `.att-chip-plus` go); Test `qa/playwright/tests/attendance.spec.ts`.

**Interfaces:** Consumes `missingBlock`, `missingByPerson`, `DAY_ORDER`, `dayLabel`, `canOverride`, `originLine` (A-L2/A-L4); `SectionBlock`, `ListRow`, `FilterChip` (design system). Keeps `att-missing`, `att-missing-count`, `att-missing-team`, `att-today`, `[data-missing=<date>]`, `[data-person-missing=<p>]`, `[data-daytype=<t>]`.

- [ ] **Step 1: Failing tests:**

```ts
test('attendance r5 · A1: חסר לך is a danger block of rows, each opening its day', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  const block = page.getByTestId('att-missing');
  await expect(block.getByRole('heading')).toHaveText(/^חסר לך/);
  const first = block.locator('[data-missing]').first();
  await expect(first).toHaveAttribute('aria-label', /^תיעוד יום [א-ה]׳ · \d+\.\d+$/);
  await first.click();
  await expect(page.locator('[data-testid="att-sheet"], [data-testid="att-panel"]').filter({ has: page.locator('[data-daytype]') }).first()).toBeVisible();
});
test('attendance r5 · A1: someone else sees the block titled with the filer’s name', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await openAttendance(page);
  await page.getByTestId('att-person').getByRole('tab', { name: 'ניתאי' }).click();
  await expect(page.getByTestId('att-missing').getByRole('heading')).toHaveText(/^חסר לניתאי/);
});
test('attendance r5 · A1: no "!" anywhere on the screen', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  expect(await page.locator('#sigma-attendance').innerText()).not.toContain('!');
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**

```tsx
const mb = missingBlock(person, me, missing, kpis.onHoliday);
{mb.show ? (
  <SectionBlock data-testid="att-missing" title={mb.title} titleRole={mb.count ? 'danger' : 'default'} count={mb.count || undefined}>
    {mb.count ? mb.days.slice(0, showAll ? undefined : 5).map(d => (
      <ListRow key={d.date} data-missing={d.date} aria-label={d.aria}
        title={<bdi>{d.label}</bdi>} trailing={<ChevronLeft aria-hidden />}
        onClick={() => openDay(grid.cells.find(c => c.date === d.date)!)} />
    )) : <p className="att-empty">{mb.empty}</p>}
    {mb.count > 5 && !showAll ? <BubbleButton variant="tonal" size="sm" onClick={() => setShowAll(true)}>עוד {mb.count - 5}</BubbleButton> : null}
  </SectionBlock>
) : null}
```

(`showAll` is local state, reset on month/person change. If `SectionBlock`/`ListRow` don't forward `data-*`, wrap them in a `div` carrying the test ids. The count Tag carries `data-testid="att-missing-count"`: pass it via the wrapper if `count` renders its own Tag.) The team block: `SectionBlock title="חסר לצוות"` with one `ListRow` per `teamMissing` entry (`title` = person, meta = count or "לא נטען", `aria-pressed` for the person shown, a tap switches person), shown when `canSwitch && teamMissing.length > 1`, as today. The today block: `SectionBlock title="היום"` with `dayChip(todayKey)` as subtitle; the day types as a `Cluster` of `FilterChip`s with `data-daytype`. For a row with `rowOrigin(row) === 'auto'` it shows `originLine(row)` plus, when `canEdit && canOverride(row)`, a "שינוי" tonal bubble that reveals the chips. For `!canEdit` it shows the read-only line "צפייה בלבד." without the "אפשר להזכיר לו למלא" sentence (rule 2 of `test-copy-rules`: no sentence about who else sees the data).
- [ ] **Step 4: Run, expect PASS**; `npm test`.
- [ ] **Step 5: Commit** `feat(attendance-ui): A-U2 — חסר לך, חסר לצוות and היום on the design system`.

### Task A-U3: tiles and the month grid

**Files:** Modify `app/src/islands/Attendance.tsx` (`Kpi`, `MonthGridView`), `app/src/styles.css` (`.att-grid`, `.att-cell*`, `.att-kpi*` go or shrink to layout only); Test `qa/playwright/tests/attendance.spec.ts` (migrate the existing `data-state` assertions to `data-att-state`).

**Interfaces:** Consumes `attTiles`, `toggleTile`, `attCellLook`, `attLegend` (A-L3); `StatTile`, `StatTileGrid`, `DayCell`. Produces tiles `data-testid="att-kpi-<key>"` with `aria-pressed`; cells keep `data-date`, carry `data-att-state` (the semantic `monthGrid` state: field/office/away/weekend/holiday/today/future/missing) and DayCell's own `data-state` (the look); `data-testid="att-legend"`.

- [ ] **Step 1: Failing tests:**

```ts
test('attendance r5 · A3: a tile colors only its category, and a second tap clears it', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  const office = page.getByTestId('att-kpi-office');
  await office.click();
  await expect(office).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="att-grid"] [data-att-state="missing"][data-state="missing"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="att-grid"] [data-att-state="office"][data-state="office"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="att-grid"] [data-att-state="holiday"][data-state="holiday"]').first()).toBeVisible();
  await office.click();
  await expect(office).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-testid="att-grid"] [data-state="missing"]').first()).toBeVisible();
});
test('attendance r5 · A2: purple holidays, red missing days as a dot, never a red border', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  const miss = page.locator('[data-testid="att-grid"] [data-state="missing"]').first();
  const border = await miss.evaluate(el => getComputedStyle(el).borderTopColor);
  const danger = await miss.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--danger-ink').trim());
  expect(border.replace(/\s/g, '')).not.toBe(danger.replace(/\s/g, ''));
  await expect(page.locator('[data-testid="att-legend"] [data-legend]')).toHaveText(['חג', 'ערב חג', 'יום שטח', 'משרד ובית', 'חופש, מילואים ואחר', 'לא דווחה נוכחות']);
});
```

(The border check compares against the token's value; if `--danger-ink` is an HSL triplet in `tokens.css`, compare the rendered `rgb()` of `hsl(var(--danger-ink))` instead: resolve it in the page with a probe element. The point is the assertion "no red border", not the exact string.)
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**

```tsx
const [tile, setTile] = React.useState<TileKey | null>(null);
<StatTileGrid>
  {attTiles(kpis, person).map(t => (
    <StatTile key={t.key} data-testid={'att-kpi-' + t.key} value={t.value} label={t.label} role={t.role}
      selected={tile === t.key} onClick={() => { setTile(cur => toggleTile(cur, t.key)); track('attendance-tile', t.key); }} />
  ))}
</StatTileGrid>

function MonthGridView({ grid, onPick, selected, person, tile }: { grid: MonthGrid; onPick: (c: DayCell) => void; selected: string; person: string; tile: TileKey | null }) {
  return (
    <div data-testid="att-grid" className="att-grid" role="grid" aria-label={'לוח ' + grid.label}>
      {HE_DAY_LETTERS.map((l, i) => <div key={'h' + i} aria-hidden className="att-dow">{l}</div>)}
      {grid.weeks.flat().map((c, i) => {
        if (!c) return <div key={'b' + i} aria-hidden />;
        const look = attCellLook(c, { person, tile, selected: selected === c.date });
        return (
          <DayCell key={c.date} day={c.day} state={look.state} onClick={() => onPick(c)}
            /* pass-through (§9 ask #1): data-date={c.date} data-att-state={c.state} data-eve={c.eve ? '1' : undefined}
               aria-label={look.label} aria-current={look.today ? 'date' : undefined} today={look.today} */ />
        );
      })}
    </div>
  );
}
```

The legend under the grid: `attLegend(person)` as `<ul data-testid="att-legend">` with `data-legend` items and token swatches. Tile state `tile` survives month changes (Review Focus #3) and resets on person change. The `StatTile` doesn't forward `data-testid` today: wrap each in a `div` with the test id if that's still so on `main`, or (better) ask for pass-through in the §9 list. Migrate the existing tests that read `data-state` for the semantic states ('future', 'office', 'field', 'holiday', 'missing') to `data-att-state`.
- [ ] **Step 4: Run, expect PASS**; `npm test`.
- [ ] **Step 5: Commit** `feat(attendance-ui): A-U3 — StatTiles that color the month, DayCell grid, legend`.

### Task A-U4: the day sheet

**Files:** Modify `app/src/islands/Attendance.tsx` (`DayEditor`, `DayTypeRow`, the phone `Sheet`, the desktop panel), `app/src/styles.css`; Test `qa/playwright/tests/attendance.spec.ts`.

**Interfaces:** Consumes `rowOrigin`, `originLine`, `canOverride`, `holidayNote`, `eveCountdownText`, `EVE_*`, `dayChip`, `dayLabel` (A-L2/A-L4); design-system `Sheet` (+ header ✕ "סגירה"), `FilterChip`, `BubbleButton`, `Tag`. Keeps `att-sheet`, `att-panel`, `att-save`, `att-eve-countdown`, `att-eve-cancel`, `att-holiday-note`, `att-readonly`.

- [ ] **Step 1: Failing tests:**

```ts
test('attendance r5 · A4: an automatic day says where it came from and can be changed', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  const visitDay = await page.evaluate(() => String(((window as any).SHEET_DATA.visits || []).find((v: any) => v.visitor === 'אביאם').date).slice(0, 10));
  await page.locator(`[data-date="${visitDay}"]`).click();
  const editor = page.locator('[data-testid="att-sheet"]:visible, [data-testid="att-panel"]:visible').first();
  await expect(editor).toContainText('נרשם אוטומטית מסיכום הביקור');
  await editor.getByRole('button', { name: 'שינוי' }).click();
  await editor.locator('[data-daytype="office"]').click();
  await editor.getByTestId('att-save').click();
  await expect(page.getByText(/^נשמר · משרד · /)).toBeVisible();
});
test('attendance r5 · A5: the save button is a noun', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  await page.getByTestId('att-missing').locator('[data-missing]').first().click();
  const editor = page.locator('[data-testid="att-sheet"]:visible, [data-testid="att-panel"]:visible').first();
  await editor.locator('[data-daytype="office"]').click();
  await expect(editor.getByTestId('att-save')).toHaveText('שמירה');
});
```

The first test needs V8 (a `visit_auto` row in the mock). Before V8 the mock day is a `'visit'` row, `canOverride` is false and "שינוי" doesn't show. Mark the test `test.fixme(!v8, …)` with `const v8 = await page.evaluate(() => ((window as any).SHEET_DATA.attendance || []).some((a: any) => a.source === 'visit_auto'))`, and drop the fixme in A-L5.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `DayEditor`:
  - Header: `dayChip(cell.date)` plus the holiday as a `Tag role="holiday"`.
  - Invite line: `holidayNote(cell.holiday)`.
  - The eve countdown block, unchanged in behaviour, restyled with a neutral bubble "ביטול".
  - Then by origin:
    - `auto` / `calendar`: an info line `originLine(row)`, plus "שינוי" when `canEdit && canOverride(row)`, which reveals the chips.
    - `!canEdit`: `att-readonly` with `dayLabel(row.type)` or "אין דיווח ליום הזה" and "צפייה בלבד."
    - otherwise: the `FilterChip` cluster of `DAY_ORDER` with `data-daytype`, the note input for 'אחר' (placeholder "מה היה ביום?", 16 px), and the footer `BubbleButton variant="primary" size="lg" data-testid="att-save"` labelled "שמירה", or "עדכון" when a row exists; "שומר…" while busy.
  - Icons per day type (lucide, a **proposal** the designer confirms): field `MapPin`, office `Building2`, wfh `House`, reserve `Shield`, vacation `TreePalm`, off `Ban`, other `Plus`.
  - The phone sheet uses the design-system `Sheet` with a visible title (not `sr-only`) and the ✕ "סגירה" in its header grid.
- [ ] **Step 4: Run, expect PASS**; `npm test`.
- [ ] **Step 5: Commit** `feat(attendance-ui): A-U4 — the day sheet, origin line, change an automatic day`.

### Task A-U5: gates, designer PASS, ship

- [ ] **Step 1:** `npm test`, Playwright 4 projects, the no-overlap sweep (360 / 390 / 412 / 430 / 1440 / 1920, 344 warning; 2560 / 3840 nightly), axe both themes, `node test-copy-rules.mjs`, `test-impeccable.mjs` (≤ baseline; attendance's own findings 0), boot ≤ 303 kB. Loop until green.
- [ ] **Step 2:** Delete the `--att-*` token lines (styles.css 38–42) if `grep -rn "\-\-att-" app/src css` finds no reader, and every `.att-*` rule the design-system parts made redundant.
- [ ] **Step 3:** PNG set at 360×780 and 412×915, light and dark: the screen for אביאם (missing days), for עידן on ניתאי, a complete month, each tile selected, the day sheet (empty day, automatic day, eve countdown, holiday invite, read-only), loading, empty, error. The 360 video of "tap a tile, tap a missing day, save", normal and reduced motion. The impeccable JSON, the token/component list and §9. One fix round, one confirm round.
- [ ] **Step 4:** Opus review of the diff against this spec, the V contract (§4) and the graph (§5).
- [ ] **Step 5:** Ship loop (CLAUDE.md), then `python docs/ops-graph/rebuild.py` + a Sonnet re-extraction chunk for this spec + a message to the graph session; CHANGELOG, backlog, INDEX 🚦, STATUS → ✅ SHIPPED. A has no production side effects of its own (no migration, no edge function).

**Acceptance:** designer PASS on record; every gate green; the PDF and Excel buttons still produce the month and person on screen (manual smoke, recorded in the CHANGELOG).

---

## 9. Token / component asks for the designer

1. `DayCell` and `StatTile`: pass-through of `data-*`, `aria-label` and `aria-current`, plus a `today` flag independent of `state` (same ask as C's §8 #1).
2. The Fri/Sat look in the attendance grid (DayCell has no weekend state). The current mapping is `default`.
3. A past ערב חג that is missing: the ruling makes it red. Confirm the eve's purple dot isn't also drawn (one dot per cell).
4. The day-type icons in A-U4 and the order of the tiles.
5. Whether "חסר לך" rows beyond 5 collapse behind "עוד N" (proposed) or all show.

## 10. Risks

- **V's timing.** A-L5 and the "שינוי" path on automatic days wait for V8. Until then the screen is correct but a manual change on a visit day isn't offered (by design, `canOverride`). If V slips past the round, A ships without A-L5 and the derivation stays.
- **The one-row rule (V2) isn't enforced in the DB** unless V adds the unique index. `mergeByDay` hides duplicates on screen, but the legacy PDF/Excel (`mergeAttendanceByDate`) might still show a stale type. That's V's to verify.
- **`dayChip` is shared.** The geresh change moves text in `Holidays.tsx` (R) and in any Playwright assertion that matched "יום ג ·". A-L2 re-runs those specs.
- **The DS isn't on `main` yet** (`r9/DS` has uncommitted changes). A-U waits; if the pass-through props in §9 are refused, test ids move onto wrapper elements.
- **Tile filter vs. the PDF/Excel:** the tile only changes what the grid shows. The reports always export the full month, which is the intended behaviour, and the CHANGELOG entry should say so.
