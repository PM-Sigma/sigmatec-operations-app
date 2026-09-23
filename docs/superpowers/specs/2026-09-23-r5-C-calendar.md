# R5 · C — Calendar (יומן): spec + implementation plan

STATUS: 🟡 OPEN — planned 23.9, NOT built. Resume: L tasks (C-L1…C-L7) can start now in a worktree off `origin/main`; U tasks (C-U1…C-U6) start only after the designer's PASS on the design system and after package S has merged (PageActionRow/AppHeader). Tick the boxes as you go.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 🗓️ יומן screen on the round-5 design system and add the round-5 calendar rulings: kibbutz blocks on a future day that plan the stop and date the ticked tasks, the calendar of a chosen person, אביאם's "also ניתאי's tasks" setting, a read view for a visit, one detail sheet for Google events, purple holidays and eves, green/red attendance only where it applies, and חודש עבודה / חודש מלא with week-number labels.

**Architecture:** Every decision stays a pure function in `app/src/lib/calendar.ts` (goldens in `calendar.test.ts`). The writes move out of the island into a new `app/src/lib/calendarData.ts` that takes an injectable I/O object, so they are tested without a browser. `Calendar.tsx` becomes a thin renderer on the design-system parts (`components/ui/*`), rewritten in the U tasks only after the designer's PASS.

**Tech Stack:** React 18 + TypeScript islands (Vite), TanStack Query, supabase-js, vitest (goldens), Playwright (4 projects), lucide-react, the round-5 tokens (`app/src/tokens.css`, `--s-*`).

**Spec:** `docs/superpowers/specs/2026-09-23-round-5-design.md` (package C row + rulings), `docs/superpowers/specs/2026-09-23-design-system-design.md`, `docs/design/tools-and-motion.md`. Companion: `docs/superpowers/specs/2026-09-23-r5-A-attendance.md` (canonical V contract, §4 there).

---

## 0. Where the requirements come from

The round-5 spec names package C as "Calendar 1–6" from עידן's phone list. The numbered list itself isn't in the repo, so the items below are rebuilt from the binding rulings in the round-5 spec and the design-system rulings. Each one quotes its source.

| # | Requirement | Source (ruling) |
|---|---|---|
| C1 | A future day (today included) shows **kibbutz blocks**. Each block lists the open tasks at that kibbutz. Picking a block does both things: the kibbutz becomes a planned stop that day (`day_plans`), and the tasks ticked in it get that date (EMS due date / `internal_tasks.due_date`). | round-5 "Calendar, future day" |
| C2 | The blocks show the tasks of **the person whose calendar is shown**. עידן/עמיחי can show (and plan) another person's calendar. **אביאם only** gets a ⚙️ setting "לראות גם את המשימות של ניתאי", which adds ניתאי's tasks to his blocks. | round-5 grill 2 "Planning another person's day" |
| C3 | Tapping a visit summary opens a **compact read view** with ✏️ edit and 🚚 cert. No small pins under it. | round-5 "Calendar, visit summary" |
| C4 | Every Google Calendar (INFORMATION) event chip opens **one generic detail sheet**: title, time, description, location, who. | round-5 grill 2 |
| C5 | Holidays and holiday eves are **purple**, and eves are finally rendered (`cell.eve` is computed but never drawn today). Filed days are green. Missing days are red **only for אביאם/ניתאי**, past workdays only, as a dot plus danger ink, never a red border. The legend always shows. | round-5 "Things you didn't mention" #4; design-system rulings; DayCell spec |
| C6 | The toggle is renamed **חודש עבודה / חודש מלא**. Week numbers are a **small label beside each week row** (not a column, so it fits at 360), shown in חודש מלא and hidden in חודש עבודה. | round-5 grill 2 "Week numbers"; design-system rulings |
| C7 | The whole screen (month, week, רשימה, day sheet, add/absence/schedule sheets) moves to the design system: tokens only, lucide instead of emoji, noun-form buttons, no overlap from 344 to 3840. | round-5 packages table + "zero-allowlist end rule"; design-system §2–§3 |

What C does **not** do: attendance rows from visits (V), the attendance screen (A), the visit editor itself (V), ⚙️'s layout (G), the header (S).

## 1. Global constraints

Every task's requirements include these. Values copied from the binding specs.

- Phones **360–430 CSS px** (360×780, 390/393, 412×915, 430). Sweep at 360 / 390 / 412 / 430, plus **344 as a warning only**. Desktop 1440 / 1920 per build, 2560 / 3840 nightly.
- **Tokens only.** Raw hex, px radii, z-index values and durations fail lint outside `tokens.css`. Motion: `--s-motion-press 90ms`, `--s-motion-fast 140ms`, `--s-motion-base 200ms`, `--s-motion-enter 280ms`, `--s-motion-exit 180ms`, `--s-ease-out cubic-bezier(0.16, 1, 0.3, 1)`, `--s-ease-in cubic-bezier(0.4, 0, 1, 1)`, `--s-ease-standard cubic-bezier(0.2, 0, 0, 1)`. Calendar month swipe: horizontal, 25% width threshold, swiping toward the left goes to the next month.
- **Copy:** buttons in noun form (שמירה, שליחה, סגירה, ביטול), no `!`, no em dash, no emoji in UI strings (lucide icons instead), geresh and gershayim (יום ג׳, סה״כ), Hebrew `aria-label`s ("סגירה", never "Close"). Dates `d.m`, plus `.yy` only for another year, inside `<bdi>` with `tabular-nums`. humanizer read on every UI string; `test-copy-rules.mjs` is the gate.
- **Purple means holiday or eve, nothing else.** Missing-day red: only אביאם and ניתאי, past workdays only, 6 px danger dot plus danger ink number, **no red border**.
- **Week numbers:** a small caption label beside each week row in חודש מלא; hidden in חודש עבודה.
- One primary (gradient) action per screen. An action row holds at most 3 bubbles; a 4th goes into ⋯. At most 3 tags per meta line, then "+N".
- `position:absolute` only for a badge on its own bubble, the grab handle and a focus ring. Logical properties only (`inset-inline-*`, `margin-inline-*`).
- Every popup is the design-system `Sheet` (bottom sheet on the phone, dialog from 768 up). At most 1 sheet plus 1 confirm; a sheet opened from a sheet pushes with a back chevron.
- The boot chunk stays within **303 kB**. The calendar is a lazy chunk; nothing here may be imported by boot code.
- `qa/impeccable-baseline.json` count may never rise, and ends the round at 0. `no-overlap-allow.json` ends empty.
- **Designer PASS** before merge: PNGs at 360×780 and 412×915, light and dark, of every screen and state C touches (default, loading, empty, error, offline where relevant, one open sheet, longest real content), named `<screen>__<width>__<theme>.png`; `impeccable detect --json` on changed files plus URL scans at `360x780` and `412x915`; the sweep, axe, `test-copy-rules`, the boot size; a 360 Playwright video of the main flow, normal and reduced motion; the list of tokens/components used and any asked for (never invented).
- Workflow: worktree off `origin/main` (`git worktree add -b r5/pkg-C <path> origin/main`), edit `js/src/*` only if at all (C doesn't), run `node build.mjs`, never edit `js/app.js` or `ui/*` by hand. Ship with the CLAUDE.md ff-only loop: fetch, rebase, re-run `node build.mjs`, read `VERSION` on `origin/main` before bumping, `git merge-base --is-ancestor origin/main HEAD`, push `HEAD:main`.
- Skills per package: ponytail (shortest diff), TDD, verification-before-completion, no-ai-slop + humanizer on UI strings. Run `python docs/ops-graph/ops_graph.py file <x>` before touching a file. Never modify any repo other than this one.

## 2. File ownership

**C owns (edits freely):**

| File | What C does there |
|---|---|
| `app/src/lib/calendar.ts` | all new pure builders (C-L1…C-L7) |
| `app/src/lib/calendar.test.ts` | goldens |
| `app/src/lib/calendarData.ts` (new) | reads and writes: `readPlan`, `defaultIo`, `applyBlockPick`, `undoBlockPick` |
| `app/src/lib/calendarData.test.ts` (new) | orchestration tests with a fake I/O |
| `app/src/islands/Calendar.tsx` | the full rewrite (C-U1…C-U4) |
| `app/src/components/CalPeerRow.tsx` (new) | the ⚙️ row for אביאם (C-U5) |
| `app/src/styles.css`, section `/* ===== 🗓️ יומן … */` (`.ucal-*`, lines 307–743 at `c7faa12`) | shrinks to whatever the design-system parts don't cover; ends with no raw values |
| `qa/playwright/tests/calendar.spec.ts` | browser tests |
| `supabase/functions/calendar/index.ts` (the `list` mapper only) + `supabase/functions/calendar/map.ts` (new) | attendees/organizer for C4 |
| `db/user_settings_cal_peer.sql` (new) | the `cal_peer_tasks` column |
| `docs/usage/יומן-גוגל.md` | the detail sheet |

**Shared files, narrow edits only:**

| File | Owner | C's edit, and nothing else |
|---|---|---|
| `app/src/lib/settings.ts`, `settings.test.ts` | G | add the `cal_peer_tasks: boolean` field to `UserSettings`, `DEFAULT_SETTINGS`, `mergeSettings` and the `saveSettings` payload (C-L4). G must keep the field if it rewrites the file. |
| `app/src/islands/Settings.tsx` | G | one import and one `<CalPeerRow />` line inside the personal area (C-U5), done after G's rewrite merges, rebased on it. |
| `app/src/lib/attendance.ts` | A | **read only for C.** C imports `mustFile` and `ATT_FILERS` (A-L1). C-L2 waits for A-L1 to be on `origin/main`. |
| `app/src/components/ui/*`, `app/src/tokens.css`, `styles.css` token block | Phase 2 (design system) | none. A missing prop is a request to the designer (§8), never a local fork. |
| `qa/playwright/tests/_helpers.ts` | shared harness | additive cases only, if any. C's specs stub what they need inside the spec file. |

**C does not touch:** `app/src/islands/Field.tsx` and `lib/visitDraft.ts` (V), `js/src/14-calendar.js` (legacy bridge; `emsPatchTasks` / `calFetchEvents` stay as they are), `index.html`, `js/src/*`, `Attendance.tsx` (A), `Gaps.tsx` (R), header/nav files (S).

## 3. Contracts

### 3.1 What C consumes from V (visit summary + attendance rules)

Canonical text: A spec §4. If the two copies differ, the A spec wins. C uses these items:

- **V3, attendance rows.** `sigma.attRows(person, year, month)` returns the person's real rows, one per day, with `source` in `'manual' | 'calendar' | 'visit_auto'`. `null` while the snapshot isn't loaded. Before V ships it still returns merged rows with `source: 'visit' | 'manual'`. C's `missingInView` / `reportedInView` work on both shapes, since they only ask "is there a row".
- **V4, events.** After any attendance write, including V's automatic one, V emits `attendance-saved` with `{ person, date, source }`, and `visit-saved` as today. C invalidates `['attRows']` on both.
- **V6, visitors.** Every row of `sigma.loadAllVisitsCombined()` carries `visitors: string[]` (מי ביקר, multi-select) and keeps `visitor` = the first one for legacy readers. `id` is stable.
- **V7, the editor.** `openVisitChapters(kibbutz, { visitId, chapter })` from `@/islands/Field`: `visitId` opens the **existing** visit in the new sheet for editing; `chapter: 4` lands on תעודת משלוח. It returns `false` when the sheet isn't mounted. V also exports `canEditVisit(user: string, visit: { visitor?: string; visitors?: string[] }, flags: { isIdan?: boolean; isViewer?: boolean }): boolean` from `app/src/lib/visitDraft.ts`.

C-U3 (visit read view) is blocked until V7 is on `origin/main`. Everything else in C is independent of V.

### 3.2 What C consumes from other packages

- **S:** `PageActionRow`, the header, `--header-h` / `--nav-h` / `--fab-h` / `--sheet-footer-h`. C-U1 waits for S.
- **K:** `sigma.openKibbutzModal(name)` keeps working after the legacy modal becomes the React KibbutzDetail island. K keeps the bridge name. (רשימה's block title calls it.)
- **Design system (Phase 2):** `SectionBlock`, `ListRow`, `DayCell`, `SegmentedControl`, `BubbleButton`, `IconBubble`, `Tag`/`FilterChip`, `EmptyState`, `Sheet`, `sonner` toast, `Skeleton`, `lib/motion.ts`. On `r9/DS` today; C-U waits until it is on `origin/main`.

### 3.3 What C produces (others rely on it)

- **`day_plans.stops` shape is unchanged:** `[{ kibbutz, task_ids[] }]`, order = array order, keyed `(person, date)`. Readers that must keep working: `Field.tsx fetchDayPlan` → `lib/field.ts arrivalOrder` (the arrival sheet), `Gaps.tsx`, `push-send/field.ts` (type mirror). New in round 5: rows may now be written **for another person** by עידן/עמיחי (C2). RLS already allows it (`day_plans_write` is `to authenticated using (true)`).
- **`user_settings.cal_peer_tasks boolean not null default false`**, read and written through `settings.ts` like every other setting.
- **`internal_tasks.due_date`** gets a new writer (the block pick). Its readers (MyTasks, `myTasksBadge.ts`, Field, MeetingReview, home InternalTasks) already read `due_date`, so no reader changes.
- **The `calendar` edge function's `list` response** gains `attendees: Array<{ name, email, self, declined }>` and `organizer: { name, email } | null`. The change is additive: `js/src/14-calendar.js calFetchEvents` passes events through unchanged, and the legacy agenda ignores unknown fields.

## 4. Graph blast radius

Run before starting: `python docs/ops-graph/ops_graph.py file Calendar.tsx`, `file calendar.ts`, `table day_plans`, `table user_settings`, `table internal_tasks`. At `c7faa12`:

- **`calendar.ts`** (degree 82) is imported only by `Calendar.tsx` and `calendar.test.ts`. It re-exports `isHolidayEve / missingDaysFor / reportedDaysFor` from `attendance.ts`. Renaming or removing an export breaks nothing outside those two files.
- **`Calendar.tsx`** (degree 150) reads `day_plans`, `calendar_absences`, `internal_tasks`, the EMS cache (`sigma.emsCacheData`), visits (`sigma.loadAllVisitsCombined`) and attendance (`sigma.attRows`, query key `['attRows', person, y, m]`, shared with Attendance.tsx). It writes `day_plans`, `calendar_absences` and EMS due dates (`sigma.emsPatchTasks`), and calls `openVisitChapters` (Field) and `sigma.openKibbutzModal` (K).
- **`day_plans`** is read by `Field.tsx fetchDayPlan`, `Gaps.tsx fetchSources` and `Calendar.tsx readPlan`. The shape doesn't change. Found in passing: `Gaps.tsx:80` selects `person,date,kibbutz`, but the table has no `kibbutz` column, so that query errors and Gaps sees no planned stops. It belongs to R, not C. It is listed in §9.
- **`user_settings`** is read with `select('*')` by `settings.ts loadSettings`, upserted by `saveSettings` (listed columns only) and read by `push-send eodHourMap` (`eod_hour` only). A new defaulted column breaks none of them.
- **`internal_tasks`** gets one new writer (C-L4). The existing writers only touch `done` or insert.
- **Edge function `calendar`**: one caller, `14-calendar.js calFetchEvents`, serving both the island and the legacy agenda.
- **After C ships:** `python docs/ops-graph/rebuild.py`, then a Sonnet re-extraction chunk for the changed docs (this spec, `יומן-גוגל.md`), and a message to the graph session.

## 5. Review Focus

The five inputs the spec implies but no requirement names, most likely to bite first. Each has a test in the task that owns the code.

1. **עידן plans אביאם's day.** The `day_plans` row must be written as `person = 'אביאם'`, not `'עידן'`, or אביאם's arrival sheet never sees it. Test: C-L4 `applyBlockPick` writes the person it is given; C-U2 Playwright reloads and switches person to check both routes.
2. **A partial EMS failure during a block pick.** The planned stop is still saved, the toast names how many tasks failed, and ביטול still restores the stops and every date. Test: C-L4.
3. **A task already due on that day, and a block already in the route.** The task isn't re-PATCHed and shows as already on the day. A pick with nothing new to do is a no-op, and its button is disabled. Test: C-L3 `pickBlock` / `isNoopPick`.
4. **Google's all-day `end` is exclusive.** A one-day event on 24.9 comes back with `end: '2026-09-25'`, and the sheet must say one day, not "24.9 עד 25.9". Test: C-L5 `eventWhen`.
5. **Google descriptions carry HTML and entities** (`<br>`, `<a>`, `&amp;`). The sheet shows clean text, never tags; declined attendees aren't listed as "who"; empty fields are hidden. Test: C-L5 `plainText` / `eventDetail`.

---

## 6. Tasks — L (logic/data, start now)

Commands used throughout:
- one vitest file: `cd app && node node_modules/vitest/vitest.mjs run src/lib/calendar.test.ts`
- the whole suite: `npm test` (repo root)

### Task C-L1: חודש עבודה / חודש מלא and week-number labels (C6), dead `hideEms`

**Files:**
- Modify: `app/src/lib/calendar.ts` (`workWeekLabel`, `CalendarOptions`, `calendarItems`, new `showWeekNumbers`, `weekAria`)
- Test: `app/src/lib/calendar.test.ts` (the `workWeekLabel` case at ~line 409; the `hideEms` cases at ~145 and ~167)

**Interfaces:**
- Produces: `workWeekLabel(workWeek: boolean): string`, `showWeekNumbers(view: 'week' | 'month', workWeek: boolean): boolean`, `weekAria(week: number): string`. `CalendarOptions` loses `hideEms`.

- [ ] **Step 1: Write the failing tests.** Replace the old `workWeekLabel` expectations and add:

```ts
describe('round 5 · C6 — חודש עבודה / חודש מלא', () => {
  it('the button names where it goes', () => {
    expect(workWeekLabel(true)).toBe('חודש מלא');     // on the work month → offers the full one
    expect(workWeekLabel(false)).toBe('חודש עבודה');  // on the full month → offers the way back
  });
  it('week numbers are shown in חודש מלא only', () => {
    expect(showWeekNumbers('month', false)).toBe(true);
    expect(showWeekNumbers('month', true)).toBe(false);
    expect(showWeekNumbers('week', false)).toBe(false);
    expect(showWeekNumbers('week', true)).toBe(false);
  });
  it('a week label reads as a word for a screen reader', () => {
    expect(weekAria(38)).toBe('שבוע 38');
  });
});
```

Delete the test `'hideEms removes the EMS layer and nothing else'`, and in the internal-tasks case change `calendarItems({ internalTasks }, { me: 'אביאם', hideEms: true })` to `calendarItems({ internalTasks }, { me: 'אביאם' })` (the assertion `toHaveLength(2)` stays). Add `showWeekNumbers, weekAria` to the import list.

- [ ] **Step 2: Run, expect FAIL** (`workWeekLabel(false)` is `'שבוע עבודה'`; the two new names aren't exported).

- [ ] **Step 3: Implement.** In `calendar.ts`:

```ts
export function workWeekLabel(workWeek: boolean): string {
  return workWeek ? 'חודש מלא' : 'חודש עבודה';
}

/**
 * Round 5 · C6 (עידן 23.9): week numbers are a small label beside each row of חודש מלא, and
 * hidden in חודש עבודה. The week VIEW already says "שבוע N" in its title, so it never needs them.
 */
export function showWeekNumbers(view: 'week' | 'month', workWeek: boolean): boolean {
  return view === 'month' && !workWeek;
}

export function weekAria(week: number): string {
  return 'שבוע ' + week;
}
```

Remove `hideEms` from `CalendarOptions` and unwrap the `if (!opts.hideEms) { … }` around the EMS loop in `calendarItems` (the loop body stays). Update the doc comment above `calendarItems` so it no longer mentions `hideEms`. This is the dead code the QA coverage audit listed (`calendar.ts:115`).

- [ ] **Step 4: Run, expect PASS.** Then `npm test`.
- [ ] **Step 5: Commit** `feat(calendar): C6 — חודש עבודה label, week numbers in חודש מלא only; drop dead hideEms`.

**Acceptance:** the three new tests pass; `grep -n hideEms app/src` finds nothing; `Calendar.tsx` still compiles (it never passed `hideEms`).

---

### Task C-L2: whose calendar, אביאם's peer tasks, and the red-only-for-filers gate (C2, C5)

**Depends on:** A-L1 on `origin/main` (exports `ATT_FILERS`, `mustFile` from `attendance.ts`).

**Files:**
- Modify: `app/src/lib/calendar.ts`
- Test: `app/src/lib/calendar.test.ts`

**Interfaces:**
- Consumes: `ATT_FILERS: readonly string[]`, `mustFile(person: string): boolean` from `./attendance`.
- Produces:
  - `calendarPeople(role: string, me: string, team?: readonly string[]): string[]`: the first entry is the default.
  - `canPlanFor(me: string, person: string, can: CalendarAbilities): boolean`
  - `PEER_TASKS: Readonly<Record<string, string>>`, `canTogglePeerTasks(me: string): boolean`
  - `taskOwners(person: string, me: string, peerOn: boolean): string[]`
  - `legendItems(person: string): LegendItem[]`, `type LegendKey = 'holiday' | 'eve' | 'reported' | 'missing'`, `interface LegendItem { key: LegendKey; label: string }`
  - `missingInView` now returns an empty set for anyone who isn't a filer.
  - `ATTENDANCE_PEOPLE` becomes an alias of `ATT_FILERS` (same values).

- [ ] **Step 1: Write the failing tests.**

```ts
describe('round 5 · C2 — whose calendar', () => {
  const ADMIN = abilities('idan', 'עידן');
  const FIELD = abilities('team', 'אביאם');
  const VIEWER = abilities('viewer', 'צפייה');
  const TEAM = ['אביאם', 'ניתאי'];

  it('עידן and עמיחי may show their own calendar or a field person’s; the default is their own', () => {
    expect(calendarPeople('idan', 'עידן', TEAM)).toEqual(['עידן', 'אביאם', 'ניתאי']);
    expect(calendarPeople('team', 'עמיחי', TEAM)).toEqual(['עמיחי', 'אביאם', 'ניתאי']);
  });
  it('a field person sees only his own calendar', () => {
    expect(calendarPeople('team', 'אביאם', TEAM)).toEqual(['אביאם']);
  });
  it('the viewer has no calendar of its own — it starts on the field team', () => {
    expect(calendarPeople('viewer', 'צפייה', TEAM)).toEqual(['אביאם', 'ניתאי']);
  });
  it('nobody signed in → nothing to show', () => {
    expect(calendarPeople('team', '', TEAM)).toEqual([]);
  });
  it('planning: your own day always, someone else’s only for עידן/עמיחי, never for the viewer', () => {
    expect(canPlanFor('אביאם', 'אביאם', FIELD)).toBe(true);
    expect(canPlanFor('אביאם', 'ניתאי', FIELD)).toBe(false);
    expect(canPlanFor('עידן', 'אביאם', ADMIN)).toBe(true);
    expect(canPlanFor('צפייה', 'אביאם', VIEWER)).toBe(false);
    expect(canPlanFor('עידן', '', ADMIN)).toBe(false);
  });
});

describe('round 5 · C2 — אביאם can add ניתאי’s tasks to his blocks', () => {
  it('only אביאם has the setting', () => {
    expect(canTogglePeerTasks('אביאם')).toBe(true);
    expect(canTogglePeerTasks('ניתאי')).toBe(false);
    expect(canTogglePeerTasks('עידן')).toBe(false);
  });
  it('the blocks follow the person whose calendar is shown', () => {
    expect(taskOwners('אביאם', 'אביאם', false)).toEqual(['אביאם']);
    expect(taskOwners('אביאם', 'אביאם', true)).toEqual(['אביאם', 'ניתאי']);
    // עידן looking at אביאם's calendar sees אביאם's tasks — אביאם's own setting is his, not עידן's
    expect(taskOwners('אביאם', 'עידן', true)).toEqual(['אביאם']);
    expect(taskOwners('ניתאי', 'ניתאי', true)).toEqual(['ניתאי']);
    expect(taskOwners('', 'אביאם', true)).toEqual([]);
  });
});

describe('round 5 · C5 — red only for the people who file', () => {
  it('missingInView is empty for a calendar person who doesn’t file attendance', () => {
    const weeks = monthView(2026, 9, HOLIDAYS as unknown as Holiday[], '2026-09-23').weeks;
    const rowsFor = () => [];                           // nothing filed at all
    const TODAY = new Date(2026, 8, 23, 12);
    expect(missingInView('עידן', weeks, rowsFor, HOLIDAYS as unknown as Holiday[], TODAY).size).toBe(0);
    expect(missingInView('אביאם', weeks, rowsFor, HOLIDAYS as unknown as Holiday[], TODAY).size).toBeGreaterThan(0);
  });
  it('the legend always shows purple and green, and red only for a filer', () => {
    expect(legendItems('עידן').map(i => i.key)).toEqual(['holiday', 'eve', 'reported']);
    expect(legendItems('ניתאי').map(i => i.key)).toEqual(['holiday', 'eve', 'reported', 'missing']);
    expect(legendItems('ניתאי').map(i => i.label)).toEqual(['חג', 'ערב חג', 'דווחה נוכחות', 'לא דווחה נוכחות']);
  });
});
```

Add `calendarPeople, canPlanFor, canTogglePeerTasks, taskOwners, legendItems` to the import list (`abilities`, `monthView`, `missingInView` are already there).

- [ ] **Step 2: Run, expect FAIL** (names not exported; `missingInView('עידן', …)` isn't empty).

- [ ] **Step 3: Implement.** Change the import at the top of `calendar.ts`:

```ts
import {
  ATT_FILERS, isHolidayEve, missingDaysFor, mustFile, reportedDaysFor, type AttRow, type Holiday,
} from './attendance';
```

In `missingInView`, change the first guard to:

```ts
  // Round 5 (design-system ruling): red is only for the people who must file — אביאם and
  // ניתאי. עידן's own calendar used to be 16 red days out of 22 (design review §1.10).
  if (!person || !mustFile(person)) return out;
```

Replace `export const ATTENDANCE_PEOPLE = ['אביאם', 'ניתאי'];` with:

```ts
/** Only these two have attendance rows to generate (spec §7f). One list, owned by attendance.ts. */
export const ATTENDANCE_PEOPLE: readonly string[] = ATT_FILERS;
```

In `absenceAttendance`, `ATTENDANCE_PEOPLE.slice()` still works on a readonly array; leave it.

Append the new section after `abilities()`:

```ts
// ───────────────────────────── whose calendar (round 5 · C2) ─────────────────────────────

/**
 * The people the calendar may be shown for, the default first. עידן/עמיחי see their own
 * calendar or a field person's (that is how they plan somebody else's day); a field person
 * sees his own; the viewer has no calendar of its own and starts on the field team.
 */
export function calendarPeople(role: string, me: string, team: readonly string[] = ATT_FILERS): string[] {
  if (role === 'viewer') return team.slice();
  if (!me) return [];
  if (!abilities(role, me).seesEveryone) return [me];
  const out = [me];
  for (const p of team) if (p && out.indexOf(p) === -1) out.push(p);
  return out;
}

/** May `me` put stops and dates on `person`'s day? */
export function canPlanFor(me: string, person: string, can: CalendarAbilities): boolean {
  if (!can.canReorder || !person) return false;
  return person === me || can.seesEveryone;
}

/** Round 5 grill 2: אביאם only may also see ניתאי's tasks in his blocks. */
export const PEER_TASKS: Readonly<Record<string, string>> = { 'אביאם': 'ניתאי' };

export function canTogglePeerTasks(me: string): boolean {
  return Object.prototype.hasOwnProperty.call(PEER_TASKS, me);
}

/**
 * Whose open tasks fill the blocks. Always the person whose calendar is shown; plus the peer
 * only when that person is the signed-in one AND he turned the setting on. אביאם's setting
 * never leaks into עידן's view of אביאם's calendar.
 */
export function taskOwners(person: string, me: string, peerOn: boolean): string[] {
  if (!person) return [];
  const peer = PEER_TASKS[me];
  return person === me && peerOn && peer ? [person, peer] : [person];
}

export type LegendKey = 'holiday' | 'eve' | 'reported' | 'missing';
export interface LegendItem { key: LegendKey; label: string }

/** The legend always shows (design system, DayCell); red joins it only for a filer. */
export function legendItems(person: string): LegendItem[] {
  const out: LegendItem[] = [
    { key: 'holiday', label: 'חג' },
    { key: 'eve', label: 'ערב חג' },
    { key: 'reported', label: 'דווחה נוכחות' },
  ];
  if (mustFile(person)) out.push({ key: 'missing', label: 'לא דווחה נוכחות' });
  return out;
}
```

- [ ] **Step 4: Run, expect PASS.** The existing `missingInView('אביאם', …)` goldens still pass (אביאם files). Then `npm test`.
- [ ] **Step 5: Commit** `feat(calendar): C2/C5 — whose calendar, אביאם peer tasks, red only for filers`.

**Acceptance:** all new tests pass, the old missing/reported goldens unchanged, `ATTENDANCE_PEOPLE` equals `['אביאם','ניתאי']`.

---

### Task C-L3: kibbutz blocks and the block pick (C1)

**Files:**
- Modify: `app/src/lib/calendar.ts` (new section after "the EMS scheduler"; `scheduleTasksPlan` message)
- Test: `app/src/lib/calendar.test.ts`

**Interfaces:**
- Consumes: `taskOwners` (C-L2), existing `canPlanDay`, `toKey`, `dueAt`, `heShort`, `scheduleTasksPlan`, `isMine`, `personName`, `CLOSED`.
- Produces:

```ts
export interface BlockTask {
  key: string;                    // 'ems:<id>' | 'internal:<id>'
  id: string;
  kind: 'ems' | 'internal';
  title: string;
  owner: string | null;
  due: string;                    // 'YYYY-MM-DD' or ''
  onThisDay: boolean;
  overdue: boolean;
}
export interface KibbutzBlock { kibbutz: string; placed: boolean; tasks: BlockTask[] }
export interface BlockInput {
  date: string; today: string; owners: string[];
  emsTasks?: CalEmsTask[]; internalTasks?: CalInternalTask[]; stops?: string[];
}
export function planBlocks(i: BlockInput): KibbutzBlock[];
export interface InternalDuePatch { id: string; due_date: string | null }
export interface BlockPick {
  kibbutz: string;
  stopsBefore: string[];
  stops: string[];
  addedStop: boolean;
  emsTaskIds: string[];
  ems: SchedulePlan;
  internal: { patches: InternalDuePatch[]; undo: InternalDuePatch[] };
  count: number;
  message: string;
}
export function pickBlock(block: KibbutzBlock, ticked: string[], date: string, stops: string[]): BlockPick;
export function isNoopPick(p: BlockPick): boolean;
```

- [ ] **Step 1: Write the failing tests.**

```ts
describe('round 5 · C1 — kibbutz blocks on a future day', () => {
  const DAY = '2026-09-24';
  const TODAY = '2026-09-23';
  const ems: CalEmsTask[] = [
    { id: 'e1', title: 'בדיקת מונים', status: 'new', expectedCompletionDate: null, site: { name: 'יגור' }, assignee: { firstName: 'אביאם', lastName: 'כהן' } },
    { id: 'e2', title: 'החלפת בקר', status: 'in_progress', expectedCompletionDate: '2026-09-20T12:00:00.000Z', site: { name: 'יגור' }, assignee: { firstName: 'אביאם' } },
    { id: 'e3', title: 'כבר ביום', status: 'new', expectedCompletionDate: new Date(2026, 8, 24, 12).toISOString(), site: { name: 'חוקוק' }, assignee: { firstName: 'אביאם' } },
    { id: 'e4', title: 'של ניתאי', status: 'new', expectedCompletionDate: null, site: { name: 'דגניה' }, assignee: { firstName: 'ניתאי' } },
    { id: 'e5', title: 'סגורה', status: 'done', expectedCompletionDate: null, site: { name: 'יגור' }, assignee: { firstName: 'אביאם' } },
    { id: 'e6', title: 'בלי קיבוץ', status: 'new', expectedCompletionDate: null, site: null, assignee: { firstName: 'אביאם' } },
  ];
  const internal: CalInternalTask[] = [
    { id: 'i1', title: 'להחזיר מונה', owner: 'אביאם', kibbutz: 'יגור', done: false, due_date: null },
    { id: 'i2', title: 'פנימית בלי קיבוץ', owner: 'אביאם', kibbutz: '', done: false, due_date: null },
    { id: 'i3', title: 'פנימית סגורה', owner: 'אביאם', kibbutz: 'יגור', done: true, due_date: null },
  ];

  it('one block per kibbutz with the person’s open tasks; overdue first', () => {
    const blocks = planBlocks({ date: DAY, today: TODAY, owners: ['אביאם'], emsTasks: ems, internalTasks: internal });
    expect(blocks.map(b => b.kibbutz)).toEqual(['חוקוק', 'יגור']);
    const yagur = blocks.find(b => b.kibbutz === 'יגור')!;
    expect(yagur.tasks.map(t => t.key)).toEqual(['ems:e2', 'ems:e1', 'internal:i1']);
    expect(yagur.tasks[0]).toMatchObject({ overdue: true, due: '2026-09-20', onThisDay: false });
    expect(blocks.find(b => b.kibbutz === 'חוקוק')!.tasks[0]).toMatchObject({ key: 'ems:e3', onThisDay: true });
  });
  it('the peer’s tasks join only when asked for, with their owner on them', () => {
    const blocks = planBlocks({ date: DAY, today: TODAY, owners: ['אביאם', 'ניתאי'], emsTasks: ems });
    expect(blocks.find(b => b.kibbutz === 'דגניה')!.tasks[0]).toMatchObject({ key: 'ems:e4', owner: 'ניתאי' });
  });
  it('stops already on the route come first, in route order, even with no tasks', () => {
    const blocks = planBlocks({ date: DAY, today: TODAY, owners: ['אביאם'], emsTasks: ems, stops: ['יגור', 'גבת'] });
    expect(blocks.map(b => [b.kibbutz, b.placed])).toEqual([['יגור', true], ['גבת', true], ['חוקוק', false]]);
    expect(blocks[1].tasks).toEqual([]);
  });
  it('a past day has no blocks', () => {
    expect(planBlocks({ date: '2026-09-22', today: TODAY, owners: ['אביאם'], emsTasks: ems })).toEqual([]);
  });
  it('no owners → no blocks', () => {
    expect(planBlocks({ date: DAY, today: TODAY, owners: [], emsTasks: ems })).toEqual([]);
  });
});

describe('round 5 · C1 — picking a block plans the stop AND dates the ticked tasks', () => {
  const DAY = '2026-09-24';
  const block: KibbutzBlock = {
    kibbutz: 'יגור', placed: false, tasks: [
      { key: 'ems:e1', id: 'e1', kind: 'ems', title: 'בדיקת מונים', owner: 'אביאם', due: '', onThisDay: false, overdue: false },
      { key: 'ems:e2', id: 'e2', kind: 'ems', title: 'החלפת בקר', owner: 'אביאם', due: '2026-09-20', onThisDay: false, overdue: true },
      { key: 'internal:i1', id: 'i1', kind: 'internal', title: 'להחזיר מונה', owner: 'אביאם', due: '', onThisDay: false, overdue: false },
      { key: 'ems:e3', id: 'e3', kind: 'ems', title: 'כבר ביום', owner: 'אביאם', due: DAY, onThisDay: true, overdue: false },
    ],
  };

  it('adds the stop at the end of the route and dates exactly the ticked tasks', () => {
    const p = pickBlock(block, ['ems:e1', 'ems:e2', 'internal:i1'], DAY, ['גבת']);
    expect(p.stopsBefore).toEqual(['גבת']);
    expect(p.stops).toEqual(['גבת', 'יגור']);
    expect(p.addedStop).toBe(true);
    expect(p.emsTaskIds).toEqual(['e1', 'e2']);
    expect(p.ems.patches).toEqual([
      { id: 'e1', body: { expectedCompletionDate: dueAt(DAY) } },
      { id: 'e2', body: { expectedCompletionDate: dueAt(DAY) } },
    ]);
    expect(p.ems.undo).toEqual([
      { id: 'e1', body: { expectedCompletionDate: null } },
      { id: 'e2', body: { expectedCompletionDate: dueAt('2026-09-20') } },
    ]);
    expect(p.internal).toEqual({ patches: [{ id: 'i1', due_date: DAY }], undo: [{ id: 'i1', due_date: null }] });
    expect(p.count).toBe(3);
    expect(p.message).toBe('יגור נוסף ל-24.9 · 3 משימות נקבעו ל-24.9');
  });
  it('a task already on the day is not re-written', () => {
    const p = pickBlock(block, ['ems:e3'], DAY, []);
    expect(p.ems.patches).toEqual([]);
    expect(p.count).toBe(0);
    expect(p.message).toBe('יגור נוסף ל-24.9');
  });
  it('a block already in the route with nothing ticked is a no-op', () => {
    const p = pickBlock({ ...block, placed: true }, [], DAY, ['יגור']);
    expect(p.addedStop).toBe(false);
    expect(p.stops).toEqual(['יגור']);
    expect(isNoopPick(p)).toBe(true);
  });
  it('one task reads as one', () => {
    expect(pickBlock({ ...block, placed: true }, ['ems:e1'], DAY, ['יגור']).message).toBe('משימה אחת נקבעה ל-24.9');
  });
  it('a messy saved route is cleaned, never duplicated', () => {
    expect(pickBlock(block, [], DAY, [' גבת ', 'גבת', '']).stops).toEqual(['גבת', 'יגור']);
  });
});
```

Also update the existing `scheduleTasksPlan` message golden(s) to the hyphenated form: `'משימה אחת נקבעה ל-' + …` and `'<n> משימות נקבעו ל-' + …` (grep `נקבעו ל` / `נקבעה ל` in `calendar.test.ts`). Import `planBlocks, pickBlock, isNoopPick, type KibbutzBlock, type CalInternalTask`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** In `scheduleTasksPlan`, change the message to:

```ts
    message: count === 1 ? 'משימה אחת נקבעה ל-' + heShort(date) : count + ' משימות נקבעו ל-' + heShort(date),
```

Add after the scheduler section:

```ts
// ───────────────────────────── kibbutz blocks (round 5 · C1) ─────────────────────────────
//
// A future day offers the person's open work grouped by the place he'd drive to. Picking a
// block does BOTH things the ruling asks for: the kibbutz becomes a planned stop that day,
// and the tasks he ticked in it get that date. One tap, one undo.

export interface BlockTask {
  /** 'ems:<id>' | 'internal:<id>' — an EMS id and an internal uuid may never collide in a Set. */
  key: string;
  id: string;
  kind: 'ems' | 'internal';
  title: string;
  owner: string | null;
  /** 'YYYY-MM-DD' or '' for no date. */
  due: string;
  onThisDay: boolean;
  overdue: boolean;
}

export interface KibbutzBlock { kibbutz: string; placed: boolean; tasks: BlockTask[] }

export interface BlockInput {
  date: string;
  today: string;
  /** From `taskOwners` — whose tasks fill the blocks. */
  owners: string[];
  emsTasks?: CalEmsTask[];
  internalTasks?: CalInternalTask[];
  /** The day's saved route (`stopsOrder(day_plans.stops)`). */
  stops?: string[];
}

function cleanStops(stops: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const s of stops || []) {
    const name = String(s || '').trim();
    if (name && out.indexOf(name) === -1) out.push(name);
  }
  return out;
}

function ownedByAny(name: string | null, owners: string[]): boolean {
  return owners.some(o => isMine(name, o));
}

export function planBlocks(i: BlockInput): KibbutzBlock[] {
  if (!canPlanDay(i.date, i.today) || !i.owners.length) return [];
  const map = new Map<string, BlockTask[]>();
  const add = (kibbutz: string, t: BlockTask) => {
    const list = map.get(kibbutz);
    if (list) list.push(t); else map.set(kibbutz, [t]);
  };
  const task = (kind: 'ems' | 'internal', id: string, title: string, owner: string | null, due: string): BlockTask => ({
    key: kind + ':' + id, id, kind, title, owner, due,
    onThisDay: due === i.date,
    overdue: !!due && due < i.today,
  });

  for (const t of i.emsTasks || []) {
    if (!t || !t.id) continue;
    if (t.status && CLOSED.indexOf(t.status) !== -1) continue;
    const kibbutz = String((t.site && t.site.name) || '').trim();
    const who = personName(t.assignee);
    if (!kibbutz || !ownedByAny(who, i.owners)) continue;
    add(kibbutz, task('ems', t.id, t.title || 'משימה', who, toKey(t.expectedCompletionDate)));
  }
  for (const r of i.internalTasks || []) {
    if (!r || !r.id || r.done) continue;
    const kibbutz = String(r.kibbutz || '').trim();
    const who = String(r.owner || '').trim() || null;
    if (!kibbutz || !ownedByAny(who, i.owners)) continue;
    add(kibbutz, task('internal', r.id, r.title || 'משימה פנימית', who, toKey(r.due_date)));
  }

  const stops = cleanStops(i.stops);
  for (const s of stops) if (!map.has(s)) map.set(s, []);
  const byDebt = (a: BlockTask, b: BlockTask) =>
    Number(b.overdue) - Number(a.overdue)
    || (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99')
    || a.title.localeCompare(b.title, 'he');
  const blocks: KibbutzBlock[] = [];
  for (const [kibbutz, tasks] of map) {
    blocks.push({ kibbutz, placed: stops.indexOf(kibbutz) !== -1, tasks: tasks.sort(byDebt) });
  }
  blocks.sort((a, b) => {
    if (a.placed !== b.placed) return a.placed ? -1 : 1;
    if (a.placed) return stops.indexOf(a.kibbutz) - stops.indexOf(b.kibbutz);
    return a.kibbutz.localeCompare(b.kibbutz, 'he');
  });
  return blocks;
}

export interface InternalDuePatch { id: string; due_date: string | null }

export interface BlockPick {
  kibbutz: string;
  stopsBefore: string[];
  stops: string[];
  addedStop: boolean;
  /** The EMS ids this pick puts on the day — they join the stop's `task_ids` snapshot. */
  emsTaskIds: string[];
  ems: SchedulePlan;
  internal: { patches: InternalDuePatch[]; undo: InternalDuePatch[] };
  count: number;
  message: string;
}

export function pickBlock(block: KibbutzBlock, ticked: string[], date: string, stops: string[]): BlockPick {
  const before = cleanStops(stops);
  const addedStop = before.indexOf(block.kibbutz) === -1;
  const next = addedStop ? before.concat([block.kibbutz]) : before.slice();
  const want = new Set(ticked || []);
  const chosen = block.tasks.filter(t => want.has(t.key) && !t.onThisDay);
  const emsChosen = chosen.filter(t => t.kind === 'ems');
  const ems = scheduleTasksPlan(
    emsChosen.map(t => ({ id: t.id, expectedCompletionDate: t.due ? dueAt(t.due) : null })),
    date,
  );
  const internalChosen = chosen.filter(t => t.kind === 'internal');
  const internal = {
    patches: internalChosen.map(t => ({ id: t.id, due_date: date })),
    undo: internalChosen.map(t => ({ id: t.id, due_date: t.due || null })),
  };
  const count = ems.count + internal.patches.length;
  const d = heShort(date);
  const parts: string[] = [];
  if (addedStop) parts.push(block.kibbutz + ' נוסף ל-' + d);
  if (count) parts.push(count === 1 ? 'משימה אחת נקבעה ל-' + d : count + ' משימות נקבעו ל-' + d);
  return {
    kibbutz: block.kibbutz,
    stopsBefore: before,
    stops: next,
    addedStop,
    emsTaskIds: emsChosen.map(t => t.id),
    ems,
    internal,
    count,
    message: parts.join(' · '),
  };
}

/** Nothing to write: the stop is already there and nothing new was ticked. */
export function isNoopPick(p: BlockPick): boolean {
  return !p.addedStop && p.count === 0;
}
```

- [ ] **Step 4: Run, expect PASS.** Then `npm test`.
- [ ] **Step 5: Commit** `feat(calendar): C1 — kibbutz blocks + block pick (stop + dates, one undo)`.

**Acceptance:** every case above passes, including the no-op and duplicate-stop cases; `scheduleTasksPlan` goldens use `ל-`.

---

### Task C-L4: the writes (`calendarData.ts`) and the peer setting column

**Files:**
- Create: `app/src/lib/calendarData.ts`, `app/src/lib/calendarData.test.ts`, `db/user_settings_cal_peer.sql`
- Modify (shared, G owns): `app/src/lib/settings.ts`, `app/src/lib/settings.test.ts`

**Interfaces:**
- Consumes: `BlockPick`, `InternalDuePatch`, `TaskPatch`, `stopsOrder`, `stopsPayload` from `calendar.ts`.
- Produces:

```ts
export interface CalendarIo {
  upsertPlan(person: string, date: string, stops: string[], due: Record<string, string[]>): Promise<void>;
  patchEms(patches: TaskPatch[]): Promise<{ ok: number; failed: Array<{ id: string; error: string }> }>;
  patchInternal(patches: InternalDuePatch[]): Promise<{ failed: string[] }>;
}
export const defaultIo: CalendarIo;
export function readPlan(person: string, date: string): Promise<string[]>;
export function applyBlockPick(pick: BlockPick, person: string, date: string, due: Record<string, string[]>, io?: CalendarIo): Promise<{ failed: string[] }>;
export function undoBlockPick(pick: BlockPick, person: string, date: string, due: Record<string, string[]>, io?: CalendarIo): Promise<{ failed: string[] }>;
// settings.ts
UserSettings.cal_peer_tasks: boolean   // default false
```

- [ ] **Step 1: Write the failing tests** in `app/src/lib/calendarData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickBlock, type KibbutzBlock } from './calendar';
import { applyBlockPick, undoBlockPick, type CalendarIo } from './calendarData';

const DAY = '2026-09-24';
const block: KibbutzBlock = {
  kibbutz: 'יגור', placed: false, tasks: [
    { key: 'ems:e1', id: 'e1', kind: 'ems', title: 'בדיקת מונים', owner: 'אביאם', due: '', onThisDay: false, overdue: false },
    { key: 'ems:e2', id: 'e2', kind: 'ems', title: 'החלפת בקר', owner: 'אביאם', due: '', onThisDay: false, overdue: false },
    { key: 'internal:i1', id: 'i1', kind: 'internal', title: 'להחזיר מונה', owner: 'אביאם', due: '', onThisDay: false, overdue: false },
  ],
};

function fakeIo(opts: { failEms?: string[]; failInternal?: string[] } = {}) {
  const log: string[] = [];
  const plans: Array<{ person: string; date: string; stops: string[]; due: Record<string, string[]> }> = [];
  const io: CalendarIo = {
    async upsertPlan(person, date, stops, due) { log.push('plan'); plans.push({ person, date, stops, due }); },
    async patchEms(patches) {
      log.push('ems');
      const failed = patches.filter(p => (opts.failEms || []).includes(p.id)).map(p => ({ id: p.id, error: 'x' }));
      return { ok: patches.length - failed.length, failed };
    },
    async patchInternal(patches) {
      log.push('internal');
      return { failed: patches.filter(p => (opts.failInternal || []).includes(p.id)).map(p => p.id) };
    },
  };
  return { io, log, plans };
}

describe('applyBlockPick', () => {
  it('writes the plan for the person it was GIVEN (עידן planning אביאם’s day), then EMS, then internal', async () => {
    const pick = pickBlock(block, ['ems:e1', 'internal:i1'], DAY, ['גבת']);
    const f = fakeIo();
    const res = await applyBlockPick(pick, 'אביאם', DAY, { 'גבת': ['e9'] }, f.io);
    expect(res.failed).toEqual([]);
    expect(f.log).toEqual(['plan', 'ems', 'internal']);
    expect(f.plans[0]).toEqual({ person: 'אביאם', date: DAY, stops: ['גבת', 'יגור'], due: { 'גבת': ['e9'], 'יגור': ['e1'] } });
  });
  it('does not rewrite the route when the stop was already there', async () => {
    const pick = pickBlock({ ...block, placed: true }, ['ems:e1'], DAY, ['יגור']);
    const f = fakeIo();
    await applyBlockPick(pick, 'אביאם', DAY, {}, f.io);
    expect(f.log).toEqual(['ems', 'internal']);
  });
  it('a partial EMS failure keeps the stop and reports exactly what failed', async () => {
    const pick = pickBlock(block, ['ems:e1', 'ems:e2', 'internal:i1'], DAY, []);
    const f = fakeIo({ failEms: ['e2'], failInternal: ['i1'] });
    const res = await applyBlockPick(pick, 'אביאם', DAY, {}, f.io);
    expect(res.failed).toEqual(['e2', 'i1']);
    expect(f.plans).toHaveLength(1);
  });
});

describe('undoBlockPick', () => {
  it('puts the route back and reverses every date', async () => {
    const pick = pickBlock(block, ['ems:e1', 'internal:i1'], DAY, ['גבת']);
    const f = fakeIo();
    const calls: unknown[] = [];
    const io: CalendarIo = {
      ...f.io,
      async patchEms(p) { calls.push(['ems', p]); return { ok: p.length, failed: [] }; },
      async patchInternal(p) { calls.push(['internal', p]); return { failed: [] }; },
    };
    await undoBlockPick(pick, 'אביאם', DAY, { 'גבת': ['e9'] }, io);
    expect(f.plans[0].stops).toEqual(['גבת']);
    expect(calls).toEqual([
      ['ems', [{ id: 'e1', body: { expectedCompletionDate: null } }]],
      ['internal', [{ id: 'i1', due_date: null }]],
    ]);
  });
});
```

Add to `app/src/lib/settings.test.ts`:

```ts
describe('round 5 · C2 — cal_peer_tasks', () => {
  it('defaults to off and survives a merge', () => {
    expect(DEFAULT_SETTINGS.cal_peer_tasks).toBe(false);
    expect(mergeSettings({ cal_peer_tasks: true }).cal_peer_tasks).toBe(true);
    expect(mergeSettings({ cal_peer_tasks: 'yes' as unknown as boolean }).cal_peer_tasks).toBe(false);
    expect(mergeSettings({}, { ...DEFAULT_SETTINGS, cal_peer_tasks: true }).cal_peer_tasks).toBe(true);
  });
});
```

(`DEFAULT_SETTINGS` and `mergeSettings` are exported; add them to the test's import if they aren't already imported there.)

- [ ] **Step 2: Run, expect FAIL** (module missing; field missing).

- [ ] **Step 3: Implement `app/src/lib/calendarData.ts`:**

```ts
// 🗓️ יומן — the calendar's reads and writes (round 5 · C). The decisions live in calendar.ts;
// this file only moves them to Supabase / EMS. Every write goes through `CalendarIo`, so the
// order and the failure handling are tested with a fake (calendarData.test.ts) and never need
// a browser. Supabase and the bridge are imported lazily: importing this file has no effects.
import {
  stopsOrder, stopsPayload, type BlockPick, type InternalDuePatch, type TaskPatch,
} from './calendar';

export interface CalendarIo {
  upsertPlan(person: string, date: string, stops: string[], due: Record<string, string[]>): Promise<void>;
  patchEms(patches: TaskPatch[]): Promise<{ ok: number; failed: Array<{ id: string; error: string }> }>;
  patchInternal(patches: InternalDuePatch[]): Promise<{ failed: string[] }>;
}

export async function readPlan(person: string, date: string): Promise<string[]> {
  if (!person || !date) return [];
  try {
    const { getSupabase } = await import('./supabase');
    const sb = await getSupabase();
    const { data } = await sb.from('day_plans').select('stops').eq('person', person).eq('date', date).maybeSingle();
    return stopsOrder((data as any)?.stops);
  } catch { return []; }
}

export const defaultIo: CalendarIo = {
  async upsertPlan(person, date, stops, due) {
    const { sbWrite } = await import('./supabase');
    await sbWrite(sb => sb.from('day_plans')
      .upsert({ person, date, stops: stopsPayload(stops, due), updated_at: new Date().toISOString() },
        { onConflict: 'person,date' })
      .select('stops').maybeSingle());
    // The arrival sheet reads the same row (spec §5.1) — tell it without a reload.
    try { (window as any).sigmaEmit?.('dayplan-changed', { person, date }); } catch { /* no bus */ }
  },
  async patchEms(patches) {
    if (!patches.length) return { ok: 0, failed: [] };
    const { sigma } = await import('@/bridge');
    if (!sigma.emsPatchTasks) return { ok: 0, failed: patches.map(p => ({ id: p.id, error: 'EMS לא מחובר' })) };
    return sigma.emsPatchTasks(patches);
  },
  async patchInternal(patches) {
    const failed: string[] = [];
    if (!patches.length) return { failed };
    const { sbWrite } = await import('./supabase');
    for (const p of patches) {
      try {
        await sbWrite(sb => sb.from('internal_tasks').update({ due_date: p.due_date }).eq('id', p.id).select('id').single());
      } catch { failed.push(p.id); }
    }
    return { failed };
  },
};

/** The day's `task_ids` snapshot, with the tasks this pick just put there. */
function withPicked(due: Record<string, string[]>, pick: BlockPick): Record<string, string[]> {
  const out: Record<string, string[]> = { ...due };
  const list = (out[pick.kibbutz] || []).slice();
  for (const id of pick.emsTaskIds) if (list.indexOf(id) === -1) list.push(id);
  out[pick.kibbutz] = list;
  return out;
}

/**
 * Stop first (cheap, and the thing he asked for even if EMS is down), then EMS, then the
 * internal rows. A failure never rolls the stop back: the kibbutz is still his plan for the
 * day. The caller shows `failed.length` in the toast.
 */
export async function applyBlockPick(
  pick: BlockPick, person: string, date: string, due: Record<string, string[]>, io: CalendarIo = defaultIo,
): Promise<{ failed: string[] }> {
  if (pick.addedStop) await io.upsertPlan(person, date, pick.stops, withPicked(due, pick));
  const ems = await io.patchEms(pick.ems.patches);
  const internal = await io.patchInternal(pick.internal.patches);
  return { failed: ems.failed.map(f => f.id).concat(internal.failed) };
}

export async function undoBlockPick(
  pick: BlockPick, person: string, date: string, due: Record<string, string[]>, io: CalendarIo = defaultIo,
): Promise<{ failed: string[] }> {
  if (pick.addedStop) await io.upsertPlan(person, date, pick.stopsBefore, due);
  const ems = await io.patchEms(pick.ems.undo);
  const internal = await io.patchInternal(pick.internal.undo);
  return { failed: ems.failed.map(f => f.id).concat(internal.failed) };
}
```

Note the relative `./supabase` import: `calendarData.ts` sits in `lib/` next to `supabase.ts`. The `@/bridge` alias is resolved by Vite and vitest alike.

In `settings.ts` (G's file, only these lines):
- `UserSettings`: add `/** Round 5 · C2 — אביאם only: also show ניתאי's tasks in the calendar blocks. */ cal_peer_tasks: boolean;`
- `DEFAULT_SETTINGS`: add `cal_peer_tasks: false,`
- `mergeSettings` return object: add `cal_peer_tasks: typeof p.cal_peer_tasks === 'boolean' ? p.cal_peer_tasks : base.cal_peer_tasks,`
- `saveSettings` upsert payload: add `cal_peer_tasks: next.cal_peer_tasks,`

Create `db/user_settings_cal_peer.sql`:

```sql
-- Round 5 · C2 — אביאם's calendar setting "לראות גם את המשימות של ניתאי" (spec
-- docs/superpowers/specs/2026-09-23-r5-C-calendar.md). Read/written through app/src/lib/settings.ts
-- like every other per-person setting; only אביאם is ever offered the switch (calendar.ts
-- canTogglePeerTasks), so for everyone else it stays at the default.
alter table public.user_settings
  add column if not exists cal_peer_tasks boolean not null default false;

comment on column public.user_settings.cal_peer_tasks is
  'Round 5 · C2: אביאם only — also show ניתאי''s open tasks in the calendar''s kibbutz blocks.';

-- Verify:
--   select person, cal_peer_tasks from public.user_settings order by person;
```

- [ ] **Step 4: Run, expect PASS.** `cd app && node node_modules/vitest/vitest.mjs run src/lib/calendarData.test.ts src/lib/settings.test.ts`, then `npm test`.
- [ ] **Step 5: Commit** `feat(calendar): calendarData I/O (block pick + undo) and user_settings.cal_peer_tasks`.

**Acceptance:** tests pass; `calendarData.ts` has no top-level side effects; the migration is **applied to production only at ship time** (C-U6), from the rebased worktree, after עידן's go-ahead.

---

### Task C-L5: the Google event detail (C4)

**Files:**
- Modify: `app/src/lib/calendar.ts` (`OfficeEvent`, `CalItem.eventId`, `calendarItems`, new `dayShort`, `plainText`, `eventWhen`, `eventDetail`)
- Create: `supabase/functions/calendar/map.ts`
- Modify: `supabase/functions/calendar/index.ts` (the `list` mapper uses `mapGoogleEvent`)
- Test: `app/src/lib/calendar.test.ts`, `app/src/lib/calendarEventMap.test.ts` (new)

**Interfaces:**
- Produces:

```ts
export interface EventAttendee { name?: string; email?: string; self?: boolean; declined?: boolean }
// OfficeEvent gains:
//   attendees?: EventAttendee[];
//   organizer?: { name?: string; email?: string } | null;
// CalItem gains: eventId?: string   (event layer only)
export function dayShort(key: string): string;                 // 'יום ה׳ · 24.9'
export function plainText(html: string | null | undefined): string;
export function eventWhen(e: OfficeEvent): string;
export interface EventDetail { title: string; when: string; description: string; location: string; who: string[]; meetLink: string | null }
export function eventDetail(e: OfficeEvent): EventDetail;
// supabase/functions/calendar/map.ts
export function mapGoogleEvent(ev: any): { id; title; start; end; allDay; location; description; hangoutLink; attendees; organizer };
```

- [ ] **Step 1: Write the failing tests.** In `calendar.test.ts`:

```ts
describe('round 5 · C4 — one detail sheet for a Google event', () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m).toISOString();   // local, TZ-proof

  it('a timed event: day and hours', () => {
    expect(eventWhen({ id: 'a', title: 'x', start: at(10), end: at(11, 30) })).toBe('יום ה׳ · 24.9 · 10:00–11:30');
  });
  it('a one-day all-day event is one day — Google’s end date is exclusive', () => {
    expect(eventWhen({ id: 'b', title: 'x', start: '2026-09-24', end: '2026-09-25', allDay: true })).toBe('יום ה׳ · 24.9 · כל היום');
  });
  it('a multi-day all-day event says where it ends', () => {
    expect(eventWhen({ id: 'c', title: 'x', start: '2026-09-24', end: '2026-09-27', allDay: true }))
      .toBe('יום ה׳ · 24.9 עד יום ש׳ · 26.9 · כל היום');
  });
  it('HTML and entities in a description become plain text', () => {
    expect(plainText('<b>סדר יום</b><br>1. מונים &amp; בקרים<br/><a href="https://x">קישור</a>&nbsp;'))
      .toBe('סדר יום\n1. מונים & בקרים\nקישור');
    expect(plainText(null)).toBe('');
  });
  it('who: organizer and attendees by name, declined left out, no duplicates', () => {
    const d = eventDetail({
      id: 'd', title: 'ישיבת צוות', start: at(9), end: at(10), location: 'משרד',
      description: 'שורה', hangoutLink: 'https://meet.google.com/abc',
      organizer: { name: 'עמיחי', email: 'amichai@x.com' },
      attendees: [
        { name: 'עמיחי', email: 'amichai@x.com' },
        { email: 'aviam@x.com' },
        { name: 'ניתאי', email: 'nitai@x.com', declined: true },
      ],
    });
    expect(d).toEqual({
      title: 'ישיבת צוות', when: 'יום ה׳ · 24.9 · 09:00–10:00', description: 'שורה', location: 'משרד',
      who: ['עמיחי', 'aviam'], meetLink: 'https://meet.google.com/abc',
    });
  });
  it('missing fields are empty, never "undefined"', () => {
    expect(eventDetail({ id: 'e', title: '', start: '2026-09-24' })).toEqual({
      title: 'אירוע', when: 'יום ה׳ · 24.9 · כל היום', description: '', location: '', who: [], meetLink: null,
    });
  });
  it('an event item carries the id the sheet looks it up by', () => {
    const items = calendarItems({ events: [{ id: 'ev9', title: 'כנס', start: '2026-09-24' }] });
    expect(items[0].eventId).toBe('ev9');
  });
});
```

Create `app/src/lib/calendarEventMap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
// Extensionless on purpose: the app's tsconfig has no allowImportingTsExtensions. Deno's
// index.ts imports the same file as "./map.ts".
import { mapGoogleEvent } from '../../../supabase/functions/calendar/map';

describe('the calendar edge function’s list mapper', () => {
  it('keeps today’s fields and adds attendees + organizer', () => {
    const out = mapGoogleEvent({
      id: 'g1', summary: 'ישיבה', start: { dateTime: '2026-09-24T10:00:00+03:00' }, end: { dateTime: '2026-09-24T11:00:00+03:00' },
      location: 'משרד', description: 'x',
      conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc' }] },
      organizer: { displayName: 'עמיחי', email: 'a@x.com' },
      attendees: [{ displayName: 'אביאם', email: 'b@x.com', self: true }, { email: 'c@x.com', responseStatus: 'declined' }],
    });
    expect(out).toEqual({
      id: 'g1', title: 'ישיבה', start: '2026-09-24T10:00:00+03:00', end: '2026-09-24T11:00:00+03:00',
      allDay: false, location: 'משרד', description: 'x', hangoutLink: 'https://meet.google.com/abc',
      organizer: { name: 'עמיחי', email: 'a@x.com' },
      attendees: [
        { name: 'אביאם', email: 'b@x.com', self: true, declined: false },
        { name: '', email: 'c@x.com', self: false, declined: true },
      ],
    });
  });
  it('an event with no title, no attendees and an all-day date', () => {
    const out = mapGoogleEvent({ id: 'g2', start: { date: '2026-09-24' }, end: { date: '2026-09-25' } });
    expect(out).toMatchObject({ title: '(ללא כותרת)', allDay: true, attendees: [], organizer: null, hangoutLink: null });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Create `supabase/functions/calendar/map.ts` (no imports, no Deno APIs, so vitest can load it):

```ts
// The `list` action's one-event mapper, pure so app/src/lib/calendarEventMap.test.ts can pin
// it. Round 5 · C4 adds attendees + organizer for the calendar's event detail sheet; every
// other field is exactly what index.ts returned before.
export function mapGoogleEvent(ev: any) {
  const person = (p: any) => ({ name: String((p && p.displayName) || ''), email: String((p && p.email) || '') });
  return {
    id: ev.id,
    title: ev.summary || "(ללא כותרת)",
    start: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
    end: (ev.end && (ev.end.dateTime || ev.end.date)) || null,
    allDay: !!(ev.start && ev.start.date),
    location: ev.location || "",
    description: ev.description || "",
    hangoutLink: ev.hangoutLink
      || (ev.conferenceData && Array.isArray(ev.conferenceData.entryPoints)
        && (ev.conferenceData.entryPoints.find((p: any) => p && p.entryPointType === "video") || {}).uri)
      || null,
    organizer: ev.organizer ? person(ev.organizer) : null,
    attendees: (Array.isArray(ev.attendees) ? ev.attendees : []).map((a: any) => ({
      ...person(a),
      self: !!a.self,
      declined: a.responseStatus === "declined",
    })),
  };
}
```

In `supabase/functions/calendar/index.ts`, add `import { mapGoogleEvent } from "./map.ts";` with the other imports and replace the inline `.map((ev: any) => ({ … }))` in the `list` branch with `.map(mapGoogleEvent)`. Keep the 🎥 comment above the new call.

In `calendar.ts`: add `EventAttendee`, extend `OfficeEvent` with `attendees?` and `organizer?`, add `eventId?: string` to `CalItem` (doc: "Present on an office event — what the detail sheet looks it up by."), and in the event loop of `calendarItems` add `eventId: String(e.id || ''),`. Then append:

```ts
// ───────────────────────────── the event detail sheet (round 5 · C4) ─────────────────────────────

/** 'יום ה׳ · 24.9' — the one short day format the sheets use (design system: d.m). */
export function dayShort(key: string): string {
  const d = parseYmd(key);
  if (isNaN(d.getTime())) return key;
  return 'יום ' + HE_DAY_LETTERS[d.getDay()] + '׳ · ' + heShort(key);
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : p2(d.getHours()) + ':' + p2(d.getMinutes());
}

/** Google descriptions are HTML. The sheet shows the words, never the tags. */
export function plainText(html: string | null | undefined): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')                       // last, so "&amp;lt;" stays "&lt;"
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000);
}

export function eventWhen(e: OfficeEvent): string {
  const start = toKey(e.start);
  if (!start) return '';
  const allDay = !!e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(String(e.start || ''));
  if (allDay) {
    // Google's all-day `end` is EXCLUSIVE: a one-day event on the 24th ends on the 25th.
    const endIncl = e.end ? addDays(toKey(e.end), -1) : start;
    const range = endIncl > start ? dayShort(start) + ' עד ' + dayShort(endIncl) : dayShort(start);
    return range + ' · כל היום';
  }
  const from = hhmm(String(e.start));
  const to = e.end ? hhmm(String(e.end)) : '';
  return dayShort(start) + ' · ' + from + (to ? '–' + to : '');
}

export interface EventDetail {
  title: string;
  when: string;
  description: string;
  location: string;
  who: string[];
  meetLink: string | null;
}

export function eventDetail(e: OfficeEvent): EventDetail {
  const who: string[] = [];
  const add = (p: { name?: string; email?: string } | null | undefined) => {
    if (!p) return;
    const label = String(p.name || '').trim() || String(p.email || '').split('@')[0].trim();
    if (label && who.indexOf(label) === -1) who.push(label);
  };
  add(e.organizer);
  for (const a of e.attendees || []) if (a && !a.declined) add(a);
  return {
    title: String(e.title || '').trim() || 'אירוע',
    when: eventWhen(e),
    description: plainText(e.description),
    location: String(e.location || '').trim(),
    who,
    meetLink: e.hangoutLink ? String(e.hangoutLink) : null,
  };
}
```

- [ ] **Step 4: Run, expect PASS.** Also `node test-edge-imports.mjs` (one new import, no duplicates) and `npx deno check supabase/functions/calendar/index.ts` if Deno is available (it's a devDependency).
- [ ] **Step 5: Commit** `feat(calendar): C4 — event detail builder; calendar fn returns attendees + organizer`.

**Acceptance:** tests pass; the edge function's output for an event with no attendees is today's output plus `attendees: [], organizer: null`. **Deploy of the `calendar` function happens at ship time** (C-U6), from the rebased worktree.

---

### Task C-L6: visit read view, day listing, and the cell look (C3, C5)

**Files:**
- Modify: `app/src/lib/calendar.ts`
- Test: `app/src/lib/calendar.test.ts`

**Interfaces:**
- Consumes: V6 (`visitors: string[]` on visit rows). Written so it also works on today's rows that only have `visitor`.
- Produces:

```ts
// VisitRow gains: visitors?: string[]; duration?: number | string;
export function visitPeople(v: VisitRow): string[];
export function durationLabel(v: VisitRow): string;         // 'יום עבודה' | '4 ש׳' | '2.5 ש׳' | ''
export interface VisitRead { id: string; kibbutz: string; when: string; people: string; duration: string; summary: string; openItems: string }
export function visitRead(v: VisitRow): VisitRead;
export function dayListing(date: string, items: CalItem[], visits: VisitRow[]): { visits: VisitRow[]; others: CalItem[] };
export type CalCellState = 'default' | 'selected' | 'holiday' | 'eve' | 'field' | 'missing' | 'outside';
export interface CalCellLook { state: CalCellState; today: boolean; label: string }
export function calCellLook(cell: CalCell, o: { selected: boolean; missing: boolean; reported: boolean }): CalCellLook;
```

`calendarItems` marks a visit `mine` when **any** of `visitPeople(v)` matches.

- [ ] **Step 1: Write the failing tests.**

```ts
describe('round 5 · C3 — a visit opens a compact read view', () => {
  const v: VisitRow = {
    id: 'v7', date: '2026-09-22T09:00:00+03:00', kibbutz: 'יגור', visitor: 'אביאם',
    visitors: ['אביאם', 'ניתאי'], duration: 4, summary: 'הוחלף בקר', open_items: 'להחזיר מונה',
  };
  it('everyone who was there, from the multi-select; falls back to the single visitor', () => {
    expect(visitPeople(v)).toEqual(['אביאם', 'ניתאי']);
    expect(visitPeople({ date: '2026-09-22', visitor: 'ניתאי' })).toEqual(['ניתאי']);
    expect(visitPeople({ date: '2026-09-22' })).toEqual([]);
  });
  it('the duration reads the way people say it', () => {
    expect(durationLabel(v)).toBe('4 ש׳');
    expect(durationLabel({ date: 'x', duration: '2.5' })).toBe('2.5 ש׳');
    expect(durationLabel({ date: 'x', workday: true })).toBe('יום עבודה');
    expect(durationLabel({ date: 'x' })).toBe('');
  });
  it('the read model', () => {
    expect(visitRead(v)).toEqual({
      id: 'v7', kibbutz: 'יגור', when: 'יום ג׳ · 22.9', people: 'אביאם, ניתאי', duration: '4 ש׳',
      summary: 'הוחלף בקר', openItems: 'להחזיר מונה',
    });
  });
  it('a visit is "mine" for every person in מי ביקר', () => {
    const [item] = calendarItems({ visits: [v] }, { me: 'ניתאי' });
    expect(item.mine).toBe(true);
  });
  it('no small pins under a visit: the visit layer items are not listed again', () => {
    const items = calendarItems({ visits: [v], events: [{ id: 'e', title: 'ישיבה', start: '2026-09-22' }] });
    const day = dayListing('2026-09-22', itemsOn(items, '2026-09-22'), [v]);
    expect(day.visits.map(x => x.id)).toEqual(['v7']);
    expect(day.others.map(i => i.layer)).toEqual(['event']);
  });
});

describe('round 5 · C5 — one look per cell', () => {
  const cell = (over: Partial<CalCell> = {}): CalCell => ({
    date: '2026-09-22', day: 22, dow: 2, weekend: false, inMonth: true, today: false, holiday: null, eve: false, ...over,
  });
  const HOL = { date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false } as Holiday;
  const EVE = { date: '2026-09-20', name: 'ערב יום כיפור', kind: 'holiday_eve', required: true } as Holiday;
  const none = { selected: false, missing: false, reported: false };

  it('purple for a holiday and for an eve, and the name goes into the label', () => {
    expect(calCellLook(cell({ holiday: HOL }), none)).toEqual({ state: 'holiday', today: false, label: 'יום ג׳ · 22.9 · יום כיפור' });
    expect(calCellLook(cell({ holiday: EVE, eve: true }), none).state).toBe('eve');
  });
  it('green for a filed day, even on a holiday; red only when the caller says missing', () => {
    expect(calCellLook(cell({ holiday: HOL }), { ...none, reported: true }).state).toBe('field');
    expect(calCellLook(cell(), { ...none, missing: true })).toEqual({ state: 'missing', today: false, label: 'יום ג׳ · 22.9 · לא דווחה נוכחות' });
  });
  it('selected wins, a lead/trail filler is dimmed, today is a ring on top of any state', () => {
    expect(calCellLook(cell(), { ...none, selected: true, reported: true }).state).toBe('selected');
    expect(calCellLook(cell({ inMonth: false }), { ...none, reported: true }).state).toBe('outside');
    expect(calCellLook(cell({ today: true }), { ...none, reported: true })).toMatchObject({ state: 'field', today: true });
  });
});
```

Add `visitPeople, durationLabel, visitRead, dayListing, calCellLook, type CalCell` to the test's import list (`itemsOn`, `VisitRow` and `Holiday` are already imported).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Extend `VisitRow`:

```ts
  /** Round 5 · V6 — everyone in "מי ביקר". `visitor` stays the first one for legacy readers. */
  visitors?: string[];
  /** Hours, as the snapshot carries them (a number or a numeric string). */
  duration?: number | string;
```

In `calendarItems`' visit loop, replace `const who = v.visitor || null;` and the `mine` line with:

```ts
    const people = visitPeople(v);
    const who = people[0] || null;
    // … person: who,
    //   mine: people.some(p => isMine(p, me)),
```

Append:

```ts
// ───────────────────────────── a visit, read only (round 5 · C3) ─────────────────────────────

export function visitPeople(v: VisitRow): string[] {
  const list = Array.isArray(v.visitors) && v.visitors.length ? v.visitors : (v.visitor ? [v.visitor] : []);
  const out: string[] = [];
  for (const p of list) { const n = String(p || '').trim(); if (n && out.indexOf(n) === -1) out.push(n); }
  return out;
}

export function durationLabel(v: VisitRow): string {
  if (v.workday) return 'יום עבודה';
  const h = Number(v.duration);
  if (!isFinite(h) || h <= 0) return '';
  return (Math.round(h * 100) / 100) + ' ש׳';
}

export interface VisitRead {
  id: string;
  kibbutz: string;
  when: string;
  people: string;
  duration: string;
  summary: string;
  openItems: string;
}

export function visitRead(v: VisitRow): VisitRead {
  return {
    id: String(v.id || ''),
    kibbutz: String(v.kibbutz || '').trim() || 'ביקור',
    when: dayShort(toKey(v.date)),
    people: visitPeople(v).join(', '),
    duration: durationLabel(v),
    summary: String(v.summary || '').trim(),
    openItems: String(v.open_items || '').trim(),
  };
}

/**
 * What a day lists: its visit summaries as rows of their own, and everything else. The
 * visit-layer items are NOT listed a second time (the "small pins under it" the ruling drops).
 */
export function dayListing(date: string, items: CalItem[], visits: VisitRow[]): { visits: VisitRow[]; others: CalItem[] } {
  return {
    visits: visitsOn(visits, date),
    others: (items || []).filter(i => i.date === date && i.layer !== 'visit'),
  };
}

// ───────────────────────────── one look per cell (round 5 · C5) ─────────────────────────────

/** The DayCell states the calendar uses (components/ui/day-cell.tsx). */
export type CalCellState = 'default' | 'selected' | 'holiday' | 'eve' | 'field' | 'missing' | 'outside';

export interface CalCellLook {
  state: CalCellState;
  /** Today is a ring ON TOP of the state, never a state of its own (a filed today stays green). */
  today: boolean;
  /** The cell's aria-label: the day, then the holiday or the attendance fact. */
  label: string;
}

/**
 * The precedence, once: outside → selected → missing → filed (green) → eve → holiday → plain.
 * `missing` already comes gated from `missingInView` (filers only, past workdays only).
 */
export function calCellLook(cell: CalCell, o: { selected: boolean; missing: boolean; reported: boolean }): CalCellLook {
  let state: CalCellState = 'default';
  if (!cell.inMonth) state = 'outside';
  else if (o.selected) state = 'selected';
  else if (o.missing) state = 'missing';
  else if (o.reported) state = 'field';
  else if (cell.eve) state = 'eve';
  else if (cell.holiday) state = 'holiday';
  const facts = [dayShort(cell.date)];
  if (cell.holiday) facts.push(cell.holiday.name);
  if (o.missing) facts.push('לא דווחה נוכחות');
  else if (o.reported) facts.push('דווחה נוכחות');
  return { state, today: !!cell.today, label: facts.join(' · ') };
}
```

- [ ] **Step 4: Run, expect PASS.** Then `npm test`.
- [ ] **Step 5: Commit** `feat(calendar): C3/C5 — visit read model, day listing without pins, one cell look`.

**Acceptance:** tests pass; a holiday that's also filed is green with the holiday name in its label; today never loses its ring.

---

### Task C-L7: copy and icons in the pure layer (C7)

**Files:**
- Modify: `app/src/lib/calendar.ts` (`LAYER_LABELS`, `ABSENCE_LABELS`, `ABSENCE_ICONS` → `ABSENCE_ICON`, `ROUTE_HEADERS`, `EMPTY_DAY`, `CalItem.icon`)
- Test: `app/src/lib/calendar.test.ts` (existing goldens that assert emoji titles/icons/headers; grep `🌴\|🪖\|🎉\|📅\|📍\|📋\|🔒\|🌅\|➡️\|🌇\|📥`)

**Interfaces:**
- Produces: `type CalIcon = 'calendar' | 'map-pin' | 'clipboard' | 'lock' | 'palm' | 'shield' | 'party'`; `CalItem.icon: CalIcon`; labels without emoji. The island maps `CalIcon` → a lucide component (C-U1). Designer's map (tools-and-motion §1): 📅→`CalendarDays`, 📍→`MapPin`, 📋→`ClipboardList`, 🔒→`Lock`. The three absence icons (`TreePalm`, `Shield`, `PartyPopper`) are a **proposal**, and the designer confirms them at PASS.

- [ ] **Step 1: Write the failing test** (and update every existing golden that asserted an emoji, in the same commit, with the one-line why "round 5: no emoji in UI strings"):

```ts
describe('round 5 · C7 — no emoji in the calendar’s strings', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  it('labels, headers and item titles are words; icons are names', () => {
    const all = [
      ...Object.values(LAYER_LABELS), ...Object.values(ABSENCE_LABELS), ...Object.values(ROUTE_HEADERS), EMPTY_DAY,
    ];
    for (const s of all) expect(s).not.toMatch(EMOJI);
    const items = calendarItems({
      events: EVENTS, visits: VISITS, emsTasks: TASKS,
      absences: [{ id: 'a', person: 'אביאם', kind: 'reserve', start_date: '2026-09-15', end_date: '2026-09-15' }],
    });
    for (const i of items) { expect(i.title).not.toMatch(EMOJI); expect(i.icon).toMatch(/^[a-z-]+$/); }
    expect(items.find(i => i.layer === 'absence')).toMatchObject({ icon: 'shield', title: 'מילואים · אביאם' });
  });
  it('the route headers', () => {
    expect(ROUTE_HEADERS).toEqual({ first: 'תחילת יום', middle: 'בהמשך', last: 'אחרון להיום', unplaced: 'לא משובץ' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement:**

```ts
export type CalIcon = 'calendar' | 'map-pin' | 'clipboard' | 'lock' | 'palm' | 'shield' | 'party';

export const LAYER_LABELS: Record<Layer, string> = {
  event: 'אירועי משרד',
  visit: 'ביקורים',
  ems: 'משימות EMS',
  internal: 'משימות פנימיות',
  absence: 'היעדרויות',
};

export const ABSENCE_LABELS: Record<AbsenceKind, string> = {
  vacation: 'חופש',
  reserve: 'מילואים',
  event: 'אירוע',
};

export const ABSENCE_ICON: Record<AbsenceKind, CalIcon> = {
  vacation: 'palm',
  reserve: 'shield',
  event: 'party',
};

export const ROUTE_HEADERS = {
  first: 'תחילת יום',
  middle: 'בהמשך',
  last: 'אחרון להיום',
  unplaced: 'לא משובץ',
} as const;

export const EMPTY_DAY = 'אין מה שמתוכנן ליום הזה';
```

Change `CalItem.icon: string` to `icon: CalIcon`, and in `calendarItems` set `icon: 'calendar'` (event), `'map-pin'` (visit), `'clipboard'` (ems), `'lock'` (internal), `ABSENCE_ICON[a.kind] || 'palm'` (absence). Delete `ABSENCE_ICONS`. `absenceAttendance`'s default note becomes `'חופש'` / `'מילואים'`, which now matches `apply_absence` in `db/calendar_absences.sql`. Grep `Calendar.tsx` for `ABSENCE_ICONS`, `LAYER_LABELS` and `ABSENCE_LABELS` and keep it compiling (today's island renders `{item.icon} {item.title}`; until C-U1 the icon name shows as text, which is acceptable only on this branch, so C-L7 lands on `main` **together with C-U1**, or the island gets a minimal `ICON` map in the same commit:

```tsx
import { CalendarDays, ClipboardList, Lock, MapPin, PartyPopper, Shield, TreePalm } from 'lucide-react';
const ICON = { calendar: CalendarDays, 'map-pin': MapPin, clipboard: ClipboardList, lock: Lock, palm: TreePalm, shield: Shield, party: PartyPopper } as const;
// in Chip: const I = ICON[item.icon]; <bdi><I size={13} aria-hidden /> {item.title}</bdi>
```

Take the second option: it keeps `main` shippable.

- [ ] **Step 4: Run, expect PASS.** Then `npm test` (includes `test-copy-rules.mjs`).
- [ ] **Step 5: Commit** `feat(calendar): C7 — words and icon names instead of emoji in calendar.ts`.

**Acceptance:** no emoji in any `calendar.ts` string; the island still renders an icon per chip.

---

## 7. Tasks — U (screens, after the designer's PASS on the design system and S merged)

Before C-U1: `git fetch && git rebase origin/main`, confirm `app/src/components/ui/day-cell.tsx`, `section-block.tsx`, `segmented-control.tsx`, `page-action-row.tsx`, `list-row.tsx`, `empty-state.tsx` exist on `main`, and run `python docs/ops-graph/ops_graph.py file Calendar.tsx`. Each U task ends with the Playwright file for its screen green on all 4 projects: `npx playwright test --config qa/playwright/playwright.config.ts qa/playwright/tests/calendar.spec.ts`.

The Playwright helpers used below exist in `calendar.spec.ts` today: `openCalendar(page)`, `dayBody(page)`, `calDay(page)`, `boot(page, ti, { who })`. `MOCK_CAL_DAY` is next Tuesday; mock tasks `task-cal-1` (גבת) and `task-cal-2` (דגניה) belong to אביאם and are due that day.

### Task C-U1: the page, the grid, week labels, legend, person picker

**Files:**
- Modify: `app/src/islands/Calendar.tsx` (`CalendarIsland` header, `Grid`, `DayCellBox`, `WeekNumbers`), `app/src/styles.css` (`.ucal-grid`, `.ucal-weekno*`, `.ucal-cell*`, `.ucal-legend`, `.ucal-switch*`)
- Test: `qa/playwright/tests/calendar.spec.ts`

**Interfaces:**
- Consumes: `calendarPeople`, `canPlanFor`, `showWeekNumbers`, `weekAria`, `workWeekLabel`, `legendItems`, `calCellLook`, `missingInView`, `reportedInView` (C-L1/2/6); `PageActionRow`, `SegmentedControl`, `DayCell`, `BubbleButton`, `IconBubble` (design system).
- Produces: `data-testid="cal-person"` (picker), `data-testid="cal-weeklabel"` (one per week row, only in חודש מלא), `data-testid="cal-legend"` with `data-legend=<key>` children, cells with `data-state` from `calCellLook` and `data-today="1"`.

- [ ] **Step 1: Write the failing Playwright tests:**

```ts
test('calendar r5: חודש עבודה hides week labels, חודש מלא shows one per week row', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const toggle = page.getByTestId('cal-work-week');
  await expect(toggle).toHaveText('חודש מלא');
  await expect(page.getByTestId('cal-weeklabel')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveText('חודש עבודה');
  const rows = await page.locator('[data-testid="cal-grid"] [data-week-row]').count();
  await expect(page.getByTestId('cal-weeklabel')).toHaveCount(rows);
  await expect(page.getByTestId('cal-weeklabel').first()).toHaveAttribute('aria-label', /^שבוע \d+$/);
});

test('calendar r5: no red for עידן; the legend always shows purple and green', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await expect(page.locator('[data-testid="cal-grid"] [data-state="missing"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="cal-legend"] [data-legend]')).toHaveText(['חג', 'ערב חג', 'דווחה נוכחות']);
});

test('calendar r5: עידן switches to אביאם and sees אביאם’s red days', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.getByTestId('cal-person').getByRole('tab', { name: 'אביאם' }).click();
  await expect(page.locator('[data-testid="cal-legend"] [data-legend="missing"]')).toBeVisible();
});

test('calendar r5: a field person has no person picker', async ({ page }, ti) => {
  await boot(page, ti, { who: 'ניתאי' });
  await openCalendar(page);
  await expect(page.getByTestId('cal-person')).toHaveCount(0);
});
```

Delete or rewrite the existing case(s) that assert the week-number **column** on the right in the work month (they assert the old ruling).

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Replace the island's `<header>` + switch row with:

```tsx
const people = React.useMemo(() => calendarPeople(role, me), [role, me]);
const [person, setPerson] = React.useState(() => people[0] || me);
React.useEffect(() => { if (people.length && people.indexOf(person) === -1) setPerson(people[0]); }, [people.join('|')]);
const canPlan = canPlanFor(me, person, can);
// …every `me` that means "whose calendar" becomes `person`: calendarItems({ … }, { me: person }),
// the attRows queries (['attRows', person, y, m]), missingInView(person, …), reportedInView(person, …),
// the plan query key ['cal', 'plan', person, openDate] and readPlan(person, openDate).

<PageActionRow title="יומן" />
<div className="ucal-controls">
  <SegmentedControl
    options={[{ value: 'month', label: 'חודש' }, { value: 'week', label: 'שבוע' }, { value: 'list', label: 'רשימה' }]}
    value={view}
    onChange={v => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* */ } track('calendar-view', v); }}
  />
  {people.length > 1 ? (
    <SegmentedControl
      data-testid="cal-person"
      options={people.map(p => ({ value: p, label: p }))}
      value={person}
      onChange={p => { setPerson(p); track('calendar-person'); }}
    />
  ) : null}
</div>
{view !== 'list' ? (
  <div className="ucal-period">
    <IconBubble label="הקודם" data-testid="cal-prev" onClick={() => step(-1)}><ChevronRight aria-hidden /></IconBubble>
    <strong data-testid="cal-label"><bdi>{label}</bdi></strong>
    <IconBubble label="הבא" data-testid="cal-next" onClick={() => step(1)}><ChevronLeft aria-hidden /></IconBubble>
    <BubbleButton variant="neutral" size="sm" data-testid="cal-today" onClick={() => setAnchor(today)}>היום</BubbleButton>
    {view === 'month' ? (
      <BubbleButton variant="tonal" size="sm" data-testid="cal-work-week" data-work-week={workWeek ? '1' : '0'}
        onClick={() => { const n = !workWeek; setWorkWeek(n); writeFlag(WORK_WEEK_KEY, n); track('calendar-work-week', n ? '1' : '0'); }}>
        {workWeekLabel(workWeek)}
      </BubbleButton>
    ) : null}
  </div>
) : null}
```

(If `SegmentedControl` doesn't forward `data-testid`, wrap it in `<div data-testid="cal-person">`. The same goes for `IconBubble`'s prop names: read `icon-bubble.tsx` on `main` and use what it takes. Don't change the component.)

Replace `Grid` so each week is one row element, with the label **inside** the row as a caption rather than a grid column:

```tsx
function Grid({ weeks, index, selected, onOpen, mode, workWeek, missing, reported }: { /* same props minus onlyMine */ }) {
  const cols = visibleDows(mode, workWeek).length;
  const labels = showWeekNumbers(mode, workWeek);
  return (
    <div className="ucal-grid" data-testid="cal-grid" data-cols={cols} style={{ ['--ucal-cols' as any]: cols }}>
      <div className="ucal-dows" aria-hidden>{dayLetters(mode, workWeek).map(l => <span key={l}>{l}</span>)}</div>
      {weeks.map(w => (
        <div className="ucal-week" data-week-row key={w.days[0].date}>
          {labels ? <span className="ucal-weeklabel" data-testid="cal-weeklabel" aria-label={weekAria(w.week)}><bdi>{w.week}</bdi></span> : null}
          <div className="ucal-week-days">
            {gridDays(w, mode, workWeek).map(c => {
              const look = calCellLook(c, { selected: c.date === selected, missing: missing.has(c.date), reported: reported.has(c.date) });
              const n = (index[c.date] || []).length;
              return (
                <DayCell key={c.date} day={c.day} state={look.state} eventCount={n || undefined}
                  onClick={() => onOpen(c.date)} className={look.today ? 'ucal-today' : undefined}
                  /* aria-label + data-date/data-today: pass through if DayCell forwards props; otherwise §8 ask #1 */ />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Under the grid, the legend (always shown):

```tsx
<ul className="ucal-legend" data-testid="cal-legend">
  {legendItems(person).map(i => <li key={i.key} data-legend={i.key}><span className={'ucal-swatch ucal-swatch-' + i.key} aria-hidden />{i.label}</li>)}
</ul>
```

In `styles.css`, rewrite the `.ucal-grid` block for this structure with tokens only: `.ucal-week { display: grid; grid-template-columns: auto 1fr; align-items: start; }`; `.ucal-weeklabel { font-size: var(--fs-caption); color: hsl(var(--muted-foreground)); padding-inline-end: var(--s-1); }`; `.ucal-week-days { display: grid; grid-template-columns: repeat(var(--ucal-cols), minmax(0, 1fr)); gap: 2px; }`; swatches use `--holiday-fill`, `--ok-fill`, `--danger-ink`. Delete the rules for the retired classes (`.ucal-weekno*`, `.ucal-holidot`, `.ucal-missdot`, `.ucal-repdot`, `.ucal-cell*` rings). Month swipe: a pointer handler on `.ucal-grid`, `dx > 0.25 * width` → `step(dx < 0 ? 1 : -1)`, no animation beyond the `--s-motion-fast` crossfade, off under `useReducedMotion()`.

- [ ] **Step 4: Run, expect PASS** on all 4 projects; `npm test`.
- [ ] **Step 5: Commit** `feat(calendar-ui): C-U1 — page on the design system, week labels, legend, person picker`.

**Acceptance:** at 360 the month in חודש מלא fits without horizontal scroll (the sweep asserts it); no red cell for עידן; switching person repaints red/green for that person.

### Task C-U2: the future day, blocks, route, add sheet

**Files:**
- Modify: `app/src/islands/Calendar.tsx` (`DayBody`, `RoutePlan`, `PlaceSearch`, `AddSheet`, the plan/savePlan code moves to `calendarData.readPlan` / `defaultIo.upsertPlan`), `app/src/styles.css`
- Test: `qa/playwright/tests/calendar.spec.ts`

**Interfaces:**
- Consumes: `planBlocks`, `pickBlock`, `isNoopPick`, `taskOwners`, `canPlanFor` (C-L2/3), `applyBlockPick`, `undoBlockPick`, `readPlan`, `defaultIo` (C-L4), `useSettings().cal_peer_tasks`.
- Produces: `data-block=<kibbutz>` sections, `data-block-task=<key>` checkboxes, `data-block-pick=<kibbutz>` button, `data-testid="cal-route"` as today.

- [ ] **Step 1: Write the failing Playwright tests:**

```ts
test('calendar r5 · C1: picking a block plans the stop and dates the ticked task', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const day = await calDay(page);
  const next = await page.evaluate(d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); }, day);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), next);
  const block = dayBody(page).locator('[data-block="גבת"]');
  await block.locator('[data-block-task="ems:task-cal-1"]').check();
  await block.locator('[data-block-pick="גבת"]').click();
  await expect(page.getByText(/גבת נוסף ל-.* · משימה אחת נקבעה ל-/)).toBeVisible();
  await expect(dayBody(page).locator('[data-stop="גבת"]')).toBeVisible();
});

test('calendar r5 · C2: עידן plans אביאם’s day, and it lands on אביאם’s route, not his own', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.getByTestId('cal-person').getByRole('tab', { name: 'אביאם' }).click();
  const day = await calDay(page);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), day);
  await dayBody(page).locator('[data-block-pick="דגניה"]').click();
  await expect(dayBody(page).locator('[data-stop="דגניה"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('cal-person').getByRole('tab', { name: 'עידן' }).click();
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), day);
  await expect(dayBody(page).locator('[data-stop="דגניה"]')).toHaveCount(0);
});

test('calendar r5 · C1: a block already on the route with nothing new ticked cannot be picked again', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), await calDay(page));
  await dayBody(page).locator('[data-block-pick="גבת"]').click();
  await expect(dayBody(page).locator('[data-block-pick="גבת"]')).toBeDisabled();
});
```

`window.sigmaCalendarOpenDay(date)` is a small test/deep-link hook the island exposes in this task (`React.useEffect(() => { (window as any).sigmaCalendarOpenDay = openDay; return () => { delete (window as any).sigmaCalendarOpenDay; }; }, [])`). It saves the tests from clicking into another month.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In the island:

```tsx
const settings = useSettings();
const owners = taskOwners(person, me, settings.cal_peer_tasks);
const blocks = React.useMemo(() => planBlocks({
  date: openDate, today, owners,
  emsTasks: (() => { try { return (sigma.emsCacheData?.()?.tasks || []) as CalEmsTask[]; } catch { return []; } })(),
  internalTasks: (internalTasks.data || []) as CalInternalTask[],
  stops: order,
}), [openDate, today, owners.join('|'), internalTasks.data, order.join('|'), tick]);

const pick = useMutation({
  mutationFn: async (p: BlockPick) => ({ p, res: await applyBlockPick(p, person, openDate, due) }),
  onSuccess: ({ p, res }) => {
    setDraft(p.stops);
    setTick(t => t + 1);
    qc.invalidateQueries({ queryKey: ['cal', 'plan', person, openDate] });
    qc.invalidateQueries({ queryKey: ['cal', 'internal-tasks'] });
    const failed = res.failed.length ? ' · ' + res.failed.length + ' לא עודכנו' : '';
    toast(p.message + failed, {
      duration: 5000,
      action: { label: 'ביטול', onClick: () => { void undoBlockPick(p, person, openDate, due).then(() => { setDraft(p.stopsBefore); setTick(t => t + 1); }); } },
    });
    track('calendar-block-pick', String(p.count));
  },
  onError: (e: any) => toast.error(String(e?.message || 'השמירה לא עברה')),
});
```

`DayBody` on a day where `canPlanDay` holds renders, in this order: the day title row (`dayShort(date)`, plus a 📍-free "בריפינג" tonal bubble when the route has a stop, plus "הוספה ליום" when `canPlan`), then a `SectionBlock title="מסלול היום"` with the reorderable route (today's `RoutePlan`, restyled: `ListRow`s, ↑/↓ as `IconBubble`s with `aria-label` "העלאת <kibbutz>" / "הורדת <kibbutz>", drag handle via `Reorder`), then a `SectionBlock title="משימות לפי קיבוץ"` with one sub-block per `KibbutzBlock`:

```tsx
function Block({ b, date, stops, onPick, busy, canPlan, peer }: {
  b: KibbutzBlock; date: string; stops: string[];
  onPick: (b: KibbutzBlock, ticked: string[]) => void; busy: boolean; canPlan: boolean; peer: boolean;
}) {
  const [ticked, setTicked] = React.useState<string[]>([]);
  React.useEffect(() => { setTicked([]); }, [date, b.kibbutz]);
  // The same pure call the pick will make — so the button is disabled exactly when the pick
  // would write nothing (Review Focus #3).
  const preview = pickBlock(b, ticked, date, stops);
  return (
    <div className="ucal-block" data-block={b.kibbutz}>
      <div className="ucal-block-head"><strong><bdi>{b.kibbutz}</bdi></strong>{b.placed ? <Tag role="ok">במסלול</Tag> : null}</div>
      {b.tasks.length ? b.tasks.map(t => (
        <label className="ucal-block-task" key={t.key}>
          <input type="checkbox" data-block-task={t.key} disabled={!canPlan || t.onThisDay}
            checked={t.onThisDay || ticked.indexOf(t.key) !== -1}
            onChange={e => setTicked(s => e.target.checked ? s.concat([t.key]) : s.filter(k => k !== t.key))} />
          <span><bdi>{t.title}</bdi>
            <span className="ucal-block-meta">
              {t.onThisDay ? <Tag role="info">כבר ביום הזה</Tag> : t.overdue ? <Tag role="danger">באיחור</Tag> : t.due ? <bdi>{heShort(t.due)}</bdi> : null}
              {peer && t.owner ? <bdi>{t.owner}</bdi> : null}
            </span>
          </span>
        </label>
      )) : <p className="ucal-empty">אין כאן משימות פתוחות</p>}
      {canPlan ? (
        <BubbleButton variant="tonal" size="sm" data-block-pick={b.kibbutz} disabled={busy || isNoopPick(preview)}
          onClick={() => onPick(b, ticked)}>
          {b.placed ? 'קביעת המשימות ליום' : 'הוספה ליום'}
        </BubbleButton>
      ) : null}
    </div>
  );
}
```

Render it as `<Block key={b.kibbutz} b={b} date={openDate} stops={order} … />`, with `onPick = (b, ticked) => pick.mutate(pickBlock(b, ticked, openDate, order))`. `peer` is `owners.length > 1`. The `PlaceSearch` stays under the blocks for a kibbutz with no open tasks, relabelled "חיפוש קיבוץ להוספה למסלול" with a lucide `Search` icon and no emoji. `AddSheet` loses "שיבוץ משימות EMS" (the blocks do that) and keeps "משימה חדשה" and "חופש, מילואים או אירוע". `ScheduleSheet` stays only for רשימה's "שבץ". The inline `readPlan`/`savePlan` in the island are replaced by `calendarData.readPlan` and `defaultIo.upsertPlan` (the reorder path calls `defaultIo.upsertPlan(person, openDate, next, due)` in its mutation).

- [ ] **Step 4: Run, expect PASS** on 4 projects; `npm test`.
- [ ] **Step 5: Commit** `feat(calendar-ui): C-U2 — kibbutz blocks plan the stop and date the tasks`.

**Acceptance:** the three tests pass; ביטול in the toast restores the route and dates; the viewer sees blocks without checkboxes or pick buttons.

### Task C-U3: visit read view and event detail sheet (C3, C4)

**Depends on:** V7 on `origin/main`.

**Files:**
- Modify: `app/src/islands/Calendar.tsx` (`PastDay` → a listing of `ListRow`s; new `VisitSheet`, `EventSheet`), `app/src/styles.css`
- Modify: `docs/usage/יומן-גוגל.md` (a short section: "לחיצה על אירוע פותחת את הפרטים שלו")
- Test: `qa/playwright/tests/calendar.spec.ts`

**Interfaces:**
- Consumes: `dayListing`, `visitRead`, `eventDetail` (C-L5/6); `openVisitChapters(kibbutz, { visitId, chapter })` and `canEditVisit` (V7).
- Produces: `data-visit-row=<id>`, `data-testid="cal-visit-sheet"` with `data-testid="cal-visit-edit"` / `"cal-visit-cert"`; `data-event-row=<id>`, `data-testid="cal-event-sheet"`.

- [ ] **Step 1: Write the failing Playwright tests:**

```ts
test('calendar r5 · C3: a visit opens a read view with edit and cert, and no pins under it', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const visitDay = await page.evaluate(() => String(((window as any).SHEET_DATA.visits || []).find((v: any) => v.visitor === 'אביאם').date).slice(0, 10));
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), visitDay);
  await expect(dayBody(page).locator('[data-layer="visit"]')).toHaveCount(0);
  await dayBody(page).locator('[data-visit-row="vis-אביאם"]').click();
  const sheet = page.getByTestId('cal-visit-sheet');
  await expect(sheet).toContainText('חוקוק');
  await expect(sheet).toContainText('ביקור לדוגמה');
  await expect(sheet.getByTestId('cal-visit-edit')).toBeVisible();
  await expect(sheet.getByTestId('cal-visit-cert')).toBeVisible();
  await sheet.getByTestId('cal-visit-edit').click();
  await expect(page.getByTestId('visit-chapters')).toBeVisible();   // V's sheet (Field.tsx SheetContent test id)
});

test('calendar r5 · C4: an office event opens one detail sheet', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  const day = await calDay(page);
  await page.evaluate(d => {
    (window as any).calFetchEvents = async () => [{
      id: 'ev-r5', title: 'ישיבת צוות', start: d + 'T09:00:00', end: d + 'T10:00:00', location: 'משרד',
      description: 'סדר יום<br>מונים &amp; בקרים', attendees: [{ name: 'אביאם' }, { name: 'ניתאי', declined: true }],
      organizer: { name: 'עמיחי' }, hangoutLink: null,
    }];
  }, day);
  await openCalendar(page);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), day);
  await dayBody(page).locator('[data-event-row="ev-r5"]').click();
  const sheet = page.getByTestId('cal-event-sheet');
  await expect(sheet).toContainText('ישיבת צוות');
  await expect(sheet).toContainText('09:00–10:00');
  await expect(sheet).toContainText('מונים & בקרים');
  await expect(sheet).toContainText('עמיחי, אביאם');
  await expect(sheet).not.toContainText('ניתאי');
  await expect(sheet).not.toContainText('<br>');
});
```

(`visit-chapters` is the chapters sheet's test id at `c7faa12`; re-check it on `main` after V merges. If `calFetchEvents` is captured by the bridge before the override lands, override `sigma.calFetchEvents` instead. Either way, the test must fail today and pass after.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** The day listing (past **and** future days) renders `dayListing(date, dayItems, visits)`: `visits` as `ListRow`s (leading `MapPin`, title = kibbutz, meta = people · duration, trailing chevron, `data-visit-row={v.id}`), then `others` (events as `ListRow`s with `data-event-row={i.eventId}`, EMS/internal/absence rows as today, restyled). The visit sheet:

```tsx
function VisitSheet({ visit, onClose, me }: { visit: VisitRow | null; onClose: () => void; me: string }) {
  const r = visit ? visitRead(visit) : null;
  const flags = (() => { try { return { isIdan: !!sigma.isIdan?.(), isViewer: !!sigma.isViewer?.() }; } catch { return {}; } })();
  const canEdit = !!visit && canEditVisit(me, visit, flags);
  return (
    <Sheet open={!!visit} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" data-testid="cal-visit-sheet">
        <SheetTitle><bdi>{r?.kibbutz}</bdi></SheetTitle>
        <SheetDescription><bdi>{r?.when}</bdi>{r?.people ? <> · <bdi>{r.people}</bdi></> : null}{r?.duration ? <> · <bdi>{r.duration}</bdi></> : null}</SheetDescription>
        {r?.summary ? <p className="ucal-visit-text">{r.summary}</p> : <p className="ucal-empty">הביקור נרשם בלי טקסט</p>}
        {r?.openItems ? <SectionBlock title="נשאר פתוח"><p className="ucal-visit-text">{r.openItems}</p></SectionBlock> : null}
        {canEdit ? (
          <SheetFooter>
            <BubbleButton variant="primary" size="lg" data-testid="cal-visit-edit"
              onClick={() => { onClose(); openVisitChapters(visit!.kibbutz || '', { visitId: visit!.id }); }}>
              <Pencil aria-hidden /> עריכה
            </BubbleButton>
            <BubbleButton variant="neutral" size="lg" data-testid="cal-visit-cert"
              onClick={() => { onClose(); openVisitChapters(visit!.kibbutz || '', { visitId: visit!.id, chapter: 4 }); }}>
              <Truck aria-hidden /> תעודה
            </BubbleButton>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
```

The event sheet renders `eventDetail(e)`: title, `when`, then location / description / who, each only when non-empty (a `MapPin`, `AlignRight` and `Users` lucide leading icon), and the Meet link as a tonal bubble "הצטרפות ל-Meet" only when `meetLink`. The events are looked up by `eventId` in `events.data`. Old `MeetButton` goes; its test id `cal-meet` moves to that bubble.

- [ ] **Step 4: Run, expect PASS** on 4 projects; `npm test`.
- [ ] **Step 5: Commit** `feat(calendar-ui): C-U3 — visit read view (edit/cert) + one event detail sheet`.

**Acceptance:** no visit chip is rendered under a visit row; ✏️ opens V's sheet on that visit; 🚚 opens chapter 4; an event with an HTML description shows clean text.

### Task C-U4: רשימה, the filter sheet, absence and schedule sheets, copy

**Files:**
- Modify: `app/src/islands/Calendar.tsx` (`TaskListView`, `ListInternalRow`, `ScheduleSheet`, `AbsenceSheet`, `AddSheet`), `app/src/styles.css` (the `.ucal-l*`, `.ucal-filters`, `.ucal-company*`, `.ucal-more*` rules)
- Test: `qa/playwright/tests/calendar.spec.ts`

**Interfaces:**
- Consumes: `filterTasks`, `groupTasks`, `sortTasks`, `shareText`, `waLink`, `hasActiveFilters` (lib/taskList.ts, unchanged); design-system `FilterChip`, `ListRow`, `Tag`, `SectionBlock`, `EmptyState`, `Sheet`.
- Produces: `data-testid="cal-list-filter-open"` bubble, `data-testid="cal-list-filter-sheet"`; the existing `cal-list-*` test ids keep their meaning.

- [ ] **Step 1: Write the failing Playwright test:**

```ts
test('calendar r5: רשימה has one filter bubble; the selects live in a sheet', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.getByRole('tab', { name: 'רשימה' }).click();
  await expect(page.locator('[data-testid="cal-list"] select')).toHaveCount(0);
  await page.getByTestId('cal-list-filter-open').click();
  const sheet = page.getByTestId('cal-list-filter-sheet');
  await expect(sheet.getByTestId('cal-list-status')).toBeVisible();
  await expect(sheet.getByTestId('cal-list-priority')).toBeVisible();
  await expect(sheet.getByTestId('cal-list-site')).toBeVisible();
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Top of רשימה: the search input (full width) and one row of at most 3 bubbles: "סינון" (opens the sheet, shows a count Tag when `hasActiveFilters`), "באיחור" (`FilterChip`), "כולל של אחרים" (`FilterChip`, admins only); ⋯ holds copy / WhatsApp / דוח ביקורים / פעילות היום. The filter sheet holds the three selects (design-system `Select`), plus "ניקוי סינון". Status and priority options lose their emoji ("חדשה", "בטיפול", "ממתין ללקוח", "מוקפא"; "דחופה", "גבוהה", "רגילה", "נמוכה"). Groups become `SectionBlock`s titled with the kibbutz (the title opens the card via `sigma.openKibbutzModal`), tasks become `ListRow`s with status/priority as `Tag`s (vocabulary per design system: חדשה = info, דחופה / באיחור = danger, בטיפול = info, ממתין ללקוח = neutral), "שבץ" and "סיום" under the meta line (triage list: up to 2 sm bubbles). Buttons in noun form: "שמירה" (absence), "שיבוץ N משימות" (schedule). `EmptyState` for an empty list ("אין משימות פתוחות." + "הצגת כל המשימות" when `mine` hides some).
- [ ] **Step 4: Run, expect PASS** on 4 projects; `npm test`.
- [ ] **Step 5: Commit** `feat(calendar-ui): C-U4 — רשימה on the design system, filters in a sheet`.

**Acceptance:** no native `<select>` in the page body; the old `cal-list-*` tests still pass (update them if they clicked a select in the bar).

### Task C-U5: ⚙️ row for אביאם

**Files:**
- Create: `app/src/components/CalPeerRow.tsx`
- Modify (shared, G owns): `app/src/islands/Settings.tsx`, one import and one line
- Test: `qa/playwright/tests/settings.spec.ts` (one added case; the file belongs to G, and the addition is additive)

**Interfaces:**
- Consumes: `canTogglePeerTasks` (C-L2), `useSettings`, `saveSettings` (settings.ts + C-L4 field), design-system `Switch` row.
- Produces: `data-testid="set-cal-peer"`.

- [ ] **Step 1: Write the failing test:**

```ts
test('settings r5 · C2: only אביאם sees "לראות גם את המשימות של ניתאי"', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-settings')));
  await expect(page.getByTestId('set-cal-peer')).toBeVisible();
  await page.getByTestId('set-cal-peer').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sigma_settings_v1') || '{}').cal_peer_tasks)).toBe(true);
});
test('settings r5 · C2: ניתאי has no such row', async ({ page }, ti) => {
  await boot(page, ti, { who: 'ניתאי' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-settings')));
  await expect(page.getByTestId('set-cal-peer')).toHaveCount(0);
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `app/src/components/CalPeerRow.tsx`:

```tsx
// ⚙️ — אביאם's calendar setting (round 5 · C2). Owned by package C; Settings.tsx (package G)
// only mounts it, so the rule of who sees it stays in lib/calendar.ts.
import { Switch } from '@/components/ui/switch';
import { canTogglePeerTasks } from '@/lib/calendar';
import { saveSettings, useSettings } from '@/lib/settings';

export function CalPeerRow({ user }: { user: string }) {
  const s = useSettings();
  if (!canTogglePeerTasks(user)) return null;
  return (
    <label className="flex min-h-12 items-center justify-between gap-3">
      <span className="min-w-0">לראות גם את המשימות של ניתאי ביומן</span>
      <Switch
        data-testid="set-cal-peer"
        checked={s.cal_peer_tasks}
        onCheckedChange={v => { void saveSettings(user, { cal_peer_tasks: v }).catch(() => { /* offline: the mirror is right */ }); }}
        aria-label="לראות גם את המשימות של ניתאי ביומן"
      />
    </label>
  );
}
```

In `Settings.tsx`, inside the personal area next to the other per-person rows: `import { CalPeerRow } from '@/components/CalPeerRow';` and `<CalPeerRow user={user} />`. Use the design-system row wrapper that G's rewrite uses, if different. The humanizer read of the label happens at the designer's PASS.
- [ ] **Step 4: Run, expect PASS**; `npm test`.
- [ ] **Step 5: Commit** `feat(calendar-ui): C-U5 — ⚙️ row for אביאם (ניתאי's tasks in the blocks)`.

**Acceptance:** the row appears for אביאם only; toggling it changes the blocks on his next calendar render (C-U2's `useSettings`).

### Task C-U6: gates, designer PASS, ship

**Files:** none new beyond fixes the gates ask for; `docs/CHANGELOG.md`, `docs/backlog.md`, `docs/INDEX.md` (🚦), this spec's STATUS line, `VERSION` (via the ship loop).

- [ ] **Step 1:** Full suite: `npm test`, then Playwright 4 projects, then the no-overlap sweep (360 / 390 / 412 / 430 / 1440 / 1920, plus 344 warning; 2560 / 3840 nightly), axe in both themes, `node test-copy-rules.mjs`, `test-impeccable.mjs` (count ≤ baseline; the calendar's own findings at 0), boot size ≤ 303 kB. Loop until green. Never loosen an assertion.
- [ ] **Step 2:** Capture the PNG set (calendar month in חודש עבודה and חודש מלא, week, רשימה, the filter sheet, a future day with blocks, the route, a past day, the visit sheet, the event sheet, add/absence/schedule sheets; each in default, loading, empty, error, offline where relevant, and longest real content) at 360×780 and 412×915, light and dark. Record the 360 video of "pick a block, undo", normal and reduced motion. Send them to the designer with the impeccable JSON and the token/component list (§8). Apply one fix round if asked; one confirm round.
- [ ] **Step 3:** Opus review of the diff against this spec, the graph (§4) and the tests. Fix what it rejects.
- [ ] **Step 4:** Production side effects, from the worktree rebased on `origin/main`, **after עידן's go-ahead**: apply `db/user_settings_cal_peer.sql` (Supabase `apply_migration`), deploy the `calendar` edge function. Verify: `select column_name from information_schema.columns where table_name='user_settings' and column_name='cal_peer_tasks';` returns one row; one live `list` call returns `attendees`.
- [ ] **Step 5:** Ship loop (CLAUDE.md): fetch, rebase, `node build.mjs`, read `VERSION` on `origin/main` and bump above it, `git merge-base --is-ancestor origin/main HEAD`, push `HEAD:main`. Then `python docs/ops-graph/rebuild.py`, a Sonnet re-extraction chunk for this spec and `יומן-גוגל.md`, and a message to the graph session. CHANGELOG + backlog + INDEX 🚦 + STATUS → ✅ SHIPPED.

**Acceptance:** designer PASS on record; every gate green; no `.ucal-*` rule with a raw hex, px radius, z-index or duration left in `styles.css`.

---

## 8. Token / component asks for the designer (never invented locally)

1. `DayCell`: a `today` flag independent of `state` (today's ring on a green or purple cell), plus pass-through of `aria-label`, `data-date` and `data-today`.
2. `DayCell`: a labels slot for a container ≥ 560 px (tools-and-motion §2.0: "DayCell shows labels at 560+. Below that it shows dots").
3. The weekend (Fri/Sat) look in חודש מלא: DayCell has no weekend state.
4. The week label's exact placement at 360 (in the row gutter, caption, text-2) and whether the row reserves its width in חודש עבודה too (it shouldn't: the label is hidden there).
5. Confirm the absence icons `TreePalm` / `Shield` / `PartyPopper`.
6. `SegmentedControl` with 3 person options at 360 (עידן · אביאם · ניתאי): fits, or needs a compact variant.

## 9. Risks

- **The DS isn't on `main` yet.** `r9/DS` carries the components with uncommitted changes. C-U can't start until it merges. If a prop in §8 is refused, C-U1 needs a different cell structure.
- **V7 slips.** C-U3 blocks on it. Everything else in C can ship; C-U3 can ship later as its own merge.
- **EMS writes.** A block pick PATCHes EMS for real. In mock mode the harness answers; in production a wrong date is visible to the whole company. Mitigations: the 5 s undo, the pure `pickBlock` goldens, and `dueAt`'s midday rule.
- **Planning for another person** writes `day_plans` rows that person didn't make. RLS can't tell people apart (shared pass), so the only guard is `canPlanFor`. X's per-person claim in `ems-auth` doesn't change `day_plans`; if X later scopes writes per person, `day_plans` needs an exception for עידן/עמיחי.
- **`settings.ts` is G's file.** If G rewrites it without the field, the setting silently resets. The settings goldens in C-L4 fail in that case, which is the guard.
- **Out of scope, found in passing:** `Gaps.tsx:80` selects a `kibbutz` column that `day_plans` doesn't have, so Gaps never sees planned stops. It belongs to R.
