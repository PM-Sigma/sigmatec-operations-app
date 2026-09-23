# Package M: Team meeting — spec and implementation plan

STATUS: 🟡 OPEN — L done 23.9 (branch `r9/M-L`, 7 commits on top of `origin/main` 7dacbfa: M-L2, M-L1, M-L3, M-L4, a Presenter.tsx fallout fix, M-L5, M-L6, M-L7 — 8 commits total). NOT merged, NOT pushed. Resume: the U tasks (M-U1, M-U2) start after the designer's PASS on the M mock screens and after DS (`r9/DS`, c6eed19) and S are on `origin/main`. One known cross-package gap from M-L2's D1 fix: `DevPresenter.tsx`'s arrival-log effect (D-owned) still gates on `session?.id` before calling `log()`, which now deadlocks since the session is created lazily BY `log()` — 4 `DevPresenter.test.tsx` cases fail until D applies the same fix M made to `Presenter.tsx`'s own arrival effect (see that commit).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild meeting mode (`Presenter.tsx`) around one per-kibbutz timeline of everything since the previous meeting. Add a compact timer, "סמן רגע" with an optional note, one-click EMS closing with undo for עידן / עמיחי, and burns + onboarding status blocks.

**Architecture:** All decisions live in pure modules: `meetingTimeline.ts` (what goes on the timeline and where), `meetingClose.ts` (the close comment + the deferred-commit undo) and `meetingStatus.ts` (burns / onboarding blocks). They are fed by one data hook that reads live EMS tasks through `emsGateway()`, because the EMS cache has no dates. The screen is rewritten on the design-system parts only after the designer's PASS.

**Tech Stack:** React 18, TanStack Query, sonner toasts, supabase-js, `emsGateway()` (`app/src/lib/ems`), vitest, Playwright.

**Spec inputs (binding):** `docs/superpowers/specs/2026-09-23-round-5-design.md` (row M, grill rounds 1–2: timeline, close EMS, "סמן רגע", burns + onboarding only in meeting mode), `2026-09-23-design-system-design.md`, `docs/design/tools-and-motion.md`, OPS GRAPH.

---

## 1. Requirements

| # | Requirement | Source |
|---|---|---|
| M-R1 | One timeline per kibbutz, covering everything since the previous meeting, with a toggle to 30 days. | grill 1 + 2 |
| M-R2 | Placement: an **EMS task at its latest change** (creation, a comment that didn't close it, or a due date set in the calendar); an **internal task at its open date**; a **meeting note at its meeting date**; a **visit at its visit date**. | grill 2 |
| M-R3 | Small blocks, not cards inside cards. | row M |
| M-R4 | A compact timer. | row M |
| M-R5 | "סמן רגע" is a bookmark on the meeting timeline: the time plus an optional one-line note. | grill 1 |
| M-R6 | The "מאז הישיבה הקודמת" block (`Presenter.tsx:624-638`) is removed. The timeline replaces it. | row M |
| M-R7 | Burns and onboarding status are shown in meeting mode (they are not on the cards any more): burns as "נותרו X/Y", onboarding as its latest status. | grill 1 |
| M-R8 | Close an EMS task in the meeting with **one click**, בוצע or בוטל, **עידן / עמיחי only**. EMS gets the status and the comment **"נסגר בישיבת צוות d.m · <name>"**, and there's a **5 s undo**. | grill 2 |
| M-R9 | Every existing feature keeps working: kibbutz order, prev/next and keys, the quick note, the live chips, the Meet link, the "מהישיבה של …" bullets, the ✏️ region/section chips, the exit. | `Presenter.tsx` inventory |

**Two defects found in planning, fixed in M (both in M's files):**
- **D1.** Opening meeting mode on any day creates a `meeting_sessions` row on mount (`meetingRun.ts:51-55`), and "the previous meeting" is the newest earlier row (`Presenter.tsx:85-93`). One accidental open on a Tuesday resets the timeline window to that Tuesday. → M-L2.
- **D2.** The 🔒 פנימי live chip inserts a `kibbutz_meeting_notes` row (`Presenter.tsx:294-303`) instead of an `internal_tasks` row, so an "internal task" opened in the meeting never appears as one. → M-L5.

**Open questions for עידן (defaults used until he answers):**
1. **"A due date set in the calendar."** EMS keeps no "due date changed at" time. It only has `updatedAt`, which moves on any edit. Default: an EMS task sits at the latest of `createdAt`, its newest non-closing comment, and `updatedAt`. The label says why: "נפתחה", "תגובה" or "עודכנה". "עודכנה" covers a due date set from the calendar, and it can also be another edit made in EMS. Getting exactly "יעד נקבע" would need the calendar (package C) to log each due-date write in a new table.
2. **Open tasks whose latest change is older than the window.** Default: they don't go on the timeline. They stay reachable in a collapsed "משימות פתוחות ותיקות (N)" block under it, with the same close buttons, so nothing open is hidden in a meeting.
3. **What counts as a real previous meeting** (D1). Default: an earlier company session that lasted at least 10 minutes, or logged at least one note / marker / parking event, or has meeting notes dated that day.

## 2. File ownership

**M owns:**
- `app/src/islands/Presenter.tsx`, `app/src/islands/Presenter.test.tsx`
- `app/src/lib/meetingRun.ts` + test (shared **consumer**: D's `DevPresenter` calls `useMeetingRun('dev', …)`; M keeps its signature)
- `app/src/lib/meetingSession.ts` + test
- `app/src/lib/meetingTimeline.ts` + test (new)
- `app/src/lib/meetingClose.ts` + test (new)
- `app/src/lib/meetingStatus.ts` + test (new)
- `app/src/islands/presenter/*.tsx` (new: `MeetingTimeline.tsx`, `StatusBlocks.tsx`, `MomentSheet.tsx`, `MomentsList.tsx`)
- `qa/playwright/tests/presenter.spec.ts`
- `db/meeting_sessions.sql` (comment only; no schema change needed)

**Shared files: M's edits are limited to:**

| File | M may touch | Owner of the rest |
|---|---|---|
| `app/src/main.tsx` | the Presenter mount block (L416-457) | each package its own block |
| `app/src/lib/emsTasks.ts` | read only (`EMS_CLOSED`, status labels) | shared |
| `app/src/lib/ems/*` | read only (`listOpenTasks`, `listComments`, `updateTask`, `addComment`) | G appends methods |
| `app/src/components/home/Burns.tsx` → after G-L2, `app/src/lib/burnsData.ts` | read only (`useBurns`) | G / K |
| `app/src/components/home/OnboardingProgress.tsx`, `lib/onboarding.ts` | read only (`useOnboardingSteps`, `stepsForKibbutz`, `progressOf`, `nextStep`, `waitAge`) | K / R |
| `app/src/components/home/InternalTasks.tsx` | read only (`useInternalTasks`, `createInternalTask`) | K |
| `app/src/components/home/MeetingNotes.tsx` | read only (`NOTES_QUERY_KEY`, `emitNotesChanged`) | K |

**M never touches:** `components/ui/*`, `KibbutzCard.tsx` or the card's burns / onboarding (K removes them from the card), `DevPresenter.tsx` (D).

## 3. Graph blast radius

`ops_graph.py file Presenter.tsx`, `file meetingRun.ts`, `table meeting_sessions`, `table meeting_events` before M-L2. Known edges:
- `meetingRun.ts` → used by `Presenter.tsx` **and** `DevPresenter.tsx` (`meetingRun.ts:55,93`). The lazy-session change (M-L2) changes when D's session row appears too. M-L2's tests cover both kinds, and D's spec depends on the new behaviour.
- `meeting_sessions` / `meeting_events`: RLS is read for authenticated, write for authenticated, and viewer-blocked by `rls_viewer_readonly.sql:153-167` (package X applies it). Updating an event's `hint` (M-L4) is an UPDATE: fine for staff, blocked for the viewer, who can't present anyway (`canPresent`).
- `kibbutz_meeting_notes` insert from the live chips stays for 📝 / החלטה / רעיון. Only 🔒 moves to `internal_tasks` (M-L5).
- EMS writes go through `sigma.emsWrite` / `emsWriteOrQueue` (`13-ems.js:293`), which is queue-aware. No new write path.
- No legacy file retires in M.

## 4. Global constraints (every task)

- Worktree off `origin/main` (`git worktree add -b r9/pkg-M ../SigmatecOps-r9-M origin/main`), parallel-safe push loop per `CLAUDE.md`.
- `js/src` untouched by M. If a task finds it needs a legacy edit, it stops and asks.
- Copy: noun-form buttons (בוצע and בוטל are status words, allowed as they are), no "!", no em dash, no emoji in UI strings (lucide: `CheckCircle2` בוצע, `XCircle` בוטל, `Bookmark` סמן רגע, `Timer`), ״ ׳, Hebrew aria-labels. Gate: `test-copy-rules.mjs`.
- The close comment is exactly `נסגר בישיבת צוות ${d}.${m} · ${name}` (d and m without leading zeros, the Israel date of the click), e.g. `נסגר בישיבת צוות 23.9 · עמיחי`.
- EMS status slugs: `done` (בוצע), `cancelled` (בוטל) (`emsTasks.ts:13-20`).
- Tokens, motion and z tokens only; Toast 5 s with "ביטול", one at a time, above the nav (DS §2 Toast).
- Presenter stays a lazy chunk; the boot chunk stays ≤ 303 kB.
- No live EMS write from any test. Gateway and bridge are mocked.
- U tasks merge only with the designer's PASS.

## 5. Review focus

1. **The app closes during the 5 s undo** (screen off, back button, next kibbutz). Expected: the close is committed, not lost. It's flushed on `pagehide`, on `visibilitychange → hidden`, on leaving the kibbutz screen and on exit. It's never sent twice. → M-L3 step 1.
2. **EMS offline or the pass expired mid-meeting.** Expected: the close is queued (`emsWriteOrQueue` → `queued`), the row shows "יישלח כשתחזור הרשת", and undo is still possible inside the 5 s. → M-L3 step 1.
3. **A comment that closed the task** (its text or timing matches a status change) must not count as "the latest change" of an open task. Expected: comments whose text starts with "נסגר בישיבת צוות" or that are the visit-summary close pattern are skipped. → M-L1 step 1.
4. **Two people present at once** (עידן on desktop, עמיחי on the phone) and both click בוצע on the same task. Expected: the second click, after refetch, finds the task closed and shows "כבר נסגרה"; no second comment. → M-L3 step 1 (a guard re-reads the task status before sending).
5. **A kibbutz with 0 items in the window.** Expected: EmptyState "אין שינויים מאז הישיבה הקודמת." with the "30 יום" toggle as its one action. → M-U1.

---

## 6. Tasks

Layer key: **L** = logic/data, now. **U** = screens, after PASS.

### Task M-L1: The timeline model (`meetingTimeline.ts`)

**Files:** Create `app/src/lib/meetingTimeline.ts`, `app/src/lib/meetingTimeline.test.ts`

**Interfaces:**
- Consumes: `EmsTask`, `EmsComment` (`lib/ems/types.ts`), `InternalTaskRow` (`lib/internalTasks.ts`), `NoteRow` (`lib/meetingNotes.ts`), visit rows `{ id?, kibbutz, date, visitor, visitors?, summary? }`, `EMS_CLOSED` (`lib/emsTasks.ts`).
- Produces:

```ts
export type TimelineKind = 'ems' | 'internal' | 'note' | 'visit';
export type EmsReason = 'created' | 'comment' | 'updated';
export interface TimelineItem {
  key: string;              // 'ems:<id>' | 'internal:<id>' | 'note:<id>' | 'visit:<kibbutz>|<date>|<visitor>'
  kind: TimelineKind;
  at: string;               // ISO instant (dates become Israel noon, so a d.m label never slides)
  title: string;
  meta: string;             // e.g. 'תגובה · אביאם' | 'נפתחה' | 'עמיחי' | 'ביקור · ניתאי'
  reason?: EmsReason;       // ems only
  taskId?: string;          // ems only — the id the close buttons act on
  status?: string;          // ems only
}
export interface TimelineInput {
  kibbutz: string;
  emsTasks: EmsTask[];
  comments: Record<string, EmsComment[]>;   // by task id; missing = none fetched yet
  internal: InternalTaskRow[];
  notes: NoteRow[];
  visits: Array<Record<string, any>>;
}
export function emsLatestChange(t: EmsTask, comments: EmsComment[]): { at: string; reason: EmsReason; by?: string };
export function isClosingComment(c: EmsComment): boolean;
export function timelineFor(i: TimelineInput, windowStart: string): { items: TimelineItem[]; olderOpen: TimelineItem[] };
export function windowStartFor(mode: 'since' | '30d', previousMeeting: string | null, now: Date): string;
```

- [x] **Step 1: Write the failing goldens.**

```ts
import { describe, it, expect } from 'vitest';
import { emsLatestChange, isClosingComment, timelineFor, windowStartFor } from './meetingTimeline';

const T = (o: any) => ({ id: 't1', title: 'החלפת מונה', description: '', status: 'open', priority: '', type: '', site: { id: 's', name: 'גבים' }, assignee: null, expectedCompletionDate: '', createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z', ...o });
const C = (at: string, message = 'בדקתי', author = 'אביאם') => ({ id: at, message, createdAt: at, author });

describe('emsLatestChange', () => {
  it('creation when nothing else happened', () =>
    expect(emsLatestChange(T({}), [])).toEqual({ at: '2026-09-10T08:00:00Z', reason: 'created' }));
  it('the newest non-closing comment wins over creation', () =>
    expect(emsLatestChange(T({}), [C('2026-09-15T09:00:00Z'), C('2026-09-12T09:00:00Z')])).toEqual({ at: '2026-09-15T09:00:00Z', reason: 'comment', by: 'אביאם' }));
  it('an update after the last comment (e.g. a due date from the calendar) wins', () =>
    expect(emsLatestChange(T({ updatedAt: '2026-09-18T10:00:00Z', expectedCompletionDate: '2026-09-25T12:00:00Z' }), [C('2026-09-15T09:00:00Z')]).reason).toBe('updated'));
  it('updatedAt within 2 minutes of a comment is that comment, not a separate update', () =>
    expect(emsLatestChange(T({ updatedAt: '2026-09-15T09:01:00Z' }), [C('2026-09-15T09:00:00Z')]).reason).toBe('comment'));
  it('a closing comment never counts', () => {
    expect(isClosingComment(C('2026-09-16T09:00:00Z', 'נסגר בישיבת צוות 16.9 · עמיחי'))).toBe(true);
    expect(emsLatestChange(T({}), [C('2026-09-16T09:00:00Z', 'נסגר בישיבת צוות 16.9 · עמיחי')]).reason).toBe('created');
  });
});

describe('timelineFor', () => {
  const input = {
    kibbutz: 'גבים',
    emsTasks: [T({}), T({ id: 't2', title: 'ישן', createdAt: '2026-08-01T08:00:00Z', updatedAt: '2026-08-01T08:00:00Z' }), T({ id: 't3', status: 'done' })],
    comments: { t1: [C('2026-09-15T09:00:00Z')] },
    internal: [{ id: 'i1', title: 'להזמין כבל', owner: 'ניתאי', kibbutz: 'גבים', done: false, created_by: 'עידן', created_at: '2026-09-14T07:00:00Z', due_date: null, priority: null, kind: null } as any],
    notes: [{ id: 'n1', kibbutz: 'גבים', meeting_date: '2026-09-16', text: 'לתאם ביקור', owners: ['אביאם'] } as any],
    visits: [{ kibbutz: 'גבים', date: '2026-09-17', visitor: 'אביאם' }, { kibbutz: 'חוקוק', date: '2026-09-17', visitor: 'ניתאי' }],
  };
  it('places each kind by its own rule, newest first, only this kibbutz, only open EMS', () => {
    const { items, olderOpen } = timelineFor(input as any, '2026-09-11T00:00:00Z');
    expect(items.map(i => i.key)).toEqual(['visit:גבים|2026-09-17|אביאם', 'note:n1', 'ems:t1', 'internal:i1']);
    expect(items.find(i => i.key === 'ems:t1')!.meta).toBe('תגובה · אביאם');
    expect(olderOpen.map(i => i.key)).toEqual(['ems:t2']);
  });
  it('a date-only row lands on Israel noon, so 17.9 stays 17.9', () =>
    expect(timelineFor(input as any, '2026-09-11T00:00:00Z').items[0].at).toBe('2026-09-17T09:00:00.000Z'));
  it('a multi-visitor visit is one item naming everyone', () => {
    const v = { ...input, visits: [{ kibbutz: 'גבים', date: '2026-09-17', visitor: 'אביאם', visitors: ['אביאם', 'ניתאי'] }] };
    expect(timelineFor(v as any, '2026-09-11T00:00:00Z').items.filter(i => i.kind === 'visit').map(i => i.meta)).toEqual(['ביקור · אביאם, ניתאי']);
  });
  it('empty input → empty lists, never throws', () =>
    expect(timelineFor({ kibbutz: 'x', emsTasks: [], comments: {}, internal: [], notes: [], visits: [] }, '2026-09-11T00:00:00Z')).toEqual({ items: [], olderOpen: [] }));
});

describe('windowStartFor', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  it('since the previous meeting (start of that Israel day)', () => expect(windowStartFor('since', '2026-09-16', now)).toBe('2026-09-15T21:00:00.000Z'));
  it('no previous meeting → 30 days', () => expect(windowStartFor('since', null, now)).toBe(windowStartFor('30d', null, now)));
  it('30 days', () => expect(windowStartFor('30d', '2026-09-16', now)).toBe('2026-08-23T21:00:00.000Z'));
});
```

- [x] **Step 2: Run to verify failure.** `cd app && node node_modules/vitest/vitest.mjs run src/lib/meetingTimeline.test.ts` → FAIL (module not found).
- [x] **Step 3: Implement.** Rules: EMS tasks whose `status` is in `EMS_CLOSED` are dropped. `isClosingComment` = `/^נסגר בישיבת צוות /.test(message)`. `emsLatestChange` = max of (createdAt → 'created'), (newest non-closing comment → 'comment', `by` = author) and (updatedAt → 'updated', only when it's more than 2 min after both the others). Israel noon for date-only values via `israelAt(ref, 12)` from `lib/field.ts`. The window start is the Israel midnight of the date, via `israelAt(date, 0)`. Visits: `visitors` array when present, else `visitor`; the key uses the first visitor. Items with `at < windowStart` are dropped, except open EMS tasks, which go to `olderOpen` (open question 2). Sort `at` descending, ties by `key`.
- [x] **Step 4: Run to verify pass.**
- [x] **Step 5: Commit.** `git add app/src/lib/meetingTimeline.* && git commit -m "feat(meeting): pure per-kibbutz timeline (EMS at latest change, internal at open, notes at meeting, visits at visit)"`

**Acceptance:** goldens pass. Every rule in M-R2 has a named case.

### Task M-L2: A previous meeting is a real one; sessions start lazily

**Files:** Modify `app/src/lib/meetingRun.ts`, `app/src/lib/meetingRun.test.ts`, `app/src/lib/meetingSession.ts` (+ test); `db/meeting_sessions.sql` (comment documenting the rule)

**Interfaces:**
- Produces:
  - `useMeetingRun(kind, host, today)`: same return shape `{ session, seconds, running, start, pause, log, endSession }`. **Change:** no insert on mount; the session row is inserted on the first `start()` or `log()`. `session` is `null` until then; `log()` awaits the insert.
  - `isRealMeeting(s: { started_at: string; ended_at: string | null }, eventKinds: string[], hasNotesThatDay: boolean): boolean`
  - `previousMeetingDate(sessions: MeetingSessionRow[], eventsBySession: Record<string, string[]>, noteDates: Set<string>, today: string, kind: 'company' | 'dev'): string | null`
  - `fetchPreviousMeetingDate(kind, today): Promise<string | null>` (moved from `Presenter.tsx:85-93` into `meetingSession.ts`, now using the rule above; D may import it)

- [x] **Step 1: Failing tests.**

```ts
import { isRealMeeting, previousMeetingDate } from './meetingSession';
it('10 minutes, or one note/marker/parking, or notes that day', () => {
  const s = (min: number) => ({ started_at: '2026-09-16T07:00:00Z', ended_at: new Date(Date.parse('2026-09-16T07:00:00Z') + min * 60e3).toISOString() });
  expect(isRealMeeting(s(3), ['kibbutz', 'kibbutz'], false)).toBe(false);
  expect(isRealMeeting(s(12), [], false)).toBe(true);
  expect(isRealMeeting(s(3), ['marker'], false)).toBe(true);
  expect(isRealMeeting({ started_at: '2026-09-16T07:00:00Z', ended_at: null }, [], true)).toBe(true);
});
it('an accidental open on a Tuesday does not move the window', () => {
  const sessions = [
    { id: 'a', date: '2026-09-22', kind: 'company', started_at: '2026-09-22T12:00:00Z', ended_at: '2026-09-22T12:01:00Z' },
    { id: 'b', date: '2026-09-16', kind: 'company', started_at: '2026-09-16T07:00:00Z', ended_at: '2026-09-16T08:10:00Z' },
  ] as any;
  expect(previousMeetingDate(sessions, { a: ['kibbutz'] }, new Set(), '2026-09-23', 'company')).toBe('2026-09-16');
});
it('today never counts; the other kind never counts', () => {
  const sessions = [{ id: 'c', date: '2026-09-23', kind: 'company', started_at: '2026-09-23T07:00:00Z', ended_at: '2026-09-23T08:00:00Z' },
                    { id: 'd', date: '2026-09-20', kind: 'dev', started_at: '2026-09-20T07:00:00Z', ended_at: '2026-09-20T08:00:00Z' }] as any;
  expect(previousMeetingDate(sessions, {}, new Set(), '2026-09-23', 'company')).toBe(null);
});
```

`meetingRun.test.ts` (with the existing supabase mock): mounting the hook inserts nothing; `start()` inserts once; `log('marker')` before `start()` inserts the session first, then the event with `t_sec` 0; the same holds for `kind: 'dev'`.

- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement.** In `useMeetingRun`, move the insert from the mount effect into `ensureSession()`, memoised with a ref-held promise so concurrent calls insert once. `fetchPreviousMeetingDate` selects the last 20 sessions of the kind with `date < today` plus their events (`meeting_events.select('session_id,kind').in('session_id', ids)`) and the note dates in that range (`kibbutz_meeting_notes.select('meeting_date')`), then applies `previousMeetingDate`.
- [x] **Step 4: Run, verify PASS** (including `DevPresenter.test.tsx` unchanged).
- [x] **Step 5: Commit.** `git commit -m "fix(meeting): no session row on open; the previous meeting must be a real one"`

**Acceptance:** opening and closing meeting mode writes nothing; the window boundary ignores sub-10-minute empty sessions.

### Task M-L3: One-click close with a 5 s undo (`meetingClose.ts`)

**Files:** Create `app/src/lib/meetingClose.ts`, `app/src/lib/meetingClose.test.ts`

**Interfaces:**
- Consumes: `emsGateway().getTask(id)`, `sigma.emsWrite(item)` (queue-aware; `bridge.ts:91`, `13-ems.js:293`), `israelParts` (`lib/field.ts`).
- Produces:

```ts
export const CLOSERS = ['עידן', 'עמיחי'];
export function canCloseInMeeting(user: string, isViewer: boolean): boolean;
export function closeComment(name: string, at: Date): string;        // 'נסגר בישיבת צוות 23.9 · עמיחי'
export type CloseStatus = 'done' | 'cancelled';
export interface PendingClose { taskId: string; status: CloseStatus; by: string; at: Date }
export function createCloseQueue(deps: {
  send: (p: PendingClose) => Promise<{ sent: boolean; queued?: boolean; error?: string; skipped?: 'already-closed' }>;
  delayMs?: number;                                                    // default 5000
  onSettled?: (p: PendingClose, r: Awaited<ReturnType<typeof deps.send>>) => void;
}): { schedule(p: PendingClose): () => void /* undo */; flush(): Promise<void>; pending(): PendingClose[] };
export async function sendClose(p: PendingClose): Promise<{ sent: boolean; queued?: boolean; error?: string; skipped?: 'already-closed' }>;
```

- [x] **Step 1: Failing tests** (fake timers; `send` a `vi.fn`).

```ts
import { vi, it, expect } from 'vitest';
import { canCloseInMeeting, closeComment, createCloseQueue } from './meetingClose';

it('only עידן and עמיחי, never the viewer', () => {
  expect(canCloseInMeeting('עידן', false)).toBe(true);
  expect(canCloseInMeeting('עמיחי', false)).toBe(true);
  for (const p of ['אביאם', 'ניתאי', 'מתניה', '']) expect(canCloseInMeeting(p, false)).toBe(false);
  expect(canCloseInMeeting('עידן', true)).toBe(false);
});
it('the comment, Israel date, no leading zeros', () =>
  expect(closeComment('עמיחי', new Date('2026-09-03T22:30:00Z'))).toBe('נסגר בישיבת צוות 4.9 · עמיחי'));
it('commits after 5 s; undo inside the window sends nothing', async () => {
  vi.useFakeTimers();
  const send = vi.fn(async () => ({ sent: true }));
  const q = createCloseQueue({ send });
  const undo = q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
  q.schedule({ taskId: 'b', status: 'cancelled', by: 'עידן', at: new Date() });
  undo();
  await vi.advanceTimersByTimeAsync(5000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].taskId).toBe('b');
});
it('flush sends everything pending once (pagehide / leaving the kibbutz)', async () => {
  vi.useFakeTimers();
  const send = vi.fn(async () => ({ sent: true }));
  const q = createCloseQueue({ send });
  q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
  await q.flush(); await vi.advanceTimersByTimeAsync(5000);
  expect(send).toHaveBeenCalledTimes(1);
});
it('re-scheduling the same task replaces it (clicked בוצע, then בוטל)', async () => {
  vi.useFakeTimers();
  const send = vi.fn(async () => ({ sent: true }));
  const q = createCloseQueue({ send });
  q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
  q.schedule({ taskId: 'a', status: 'cancelled', by: 'עידן', at: new Date() });
  await vi.advanceTimersByTimeAsync(5000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].status).toBe('cancelled');
});
```

`sendClose` tests (gateway and bridge mocked): it re-reads the task, and if the status is already in `EMS_CLOSED` it returns `{ sent: false, skipped: 'already-closed' }` and writes nothing. Otherwise it writes `{ kind: 'comment', taskId, message: closeComment(...) }`, then `{ kind: 'status', taskId, status }`, in that order (the `pushVisitToEms` order, `14-calendar.js:294-297`). A `queued` result from either write returns `queued: true`. An `error` from the comment write stops before the status write.

- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement.** `createCloseQueue` keeps a `Map<taskId, { p, timer }>`. `schedule` clears any timer for the same id and sets a new `setTimeout(delayMs)`, and returns the undo (clear + delete). `flush` clears every timer and awaits each `send` sequentially. The Presenter (M-U2) calls `flush()` on `pagehide`, on `visibilitychange` to hidden, on kibbutz change and on exit.
- [x] **Step 4: Run, verify PASS.**
- [x] **Step 5: Commit.** `git commit -m "feat(meeting): one-click EMS close — comment + status, 5 s deferred commit with undo, flush on leave"`

**Acceptance:** nothing is sent to EMS before 5 s unless the screen is left; an undo inside 5 s leaves EMS untouched (no comment to clean up).

### Task M-L4: "סמן רגע" with an optional one-line note

**Files:** Modify `app/src/lib/meetingRun.ts` (+ test), `app/src/lib/meetingSession.ts` (+ test)

**Interfaces:**
- Produces:
  - `MeetingRun.mark(kibbutz: string | null): Promise<{ id: string; t_sec: number }>` (logs kind `marker`)
  - `MeetingRun.noteMark(id: string, note: string): Promise<void>` (UPDATE `meeting_events.hint`, trimmed, max 120 chars, one line)
  - `momentLine(e: MeetingEventRow): string` → `'12:04 · גבים · לבדוק שוב את המונה'` (the `clockText` time, the kibbutz when present, the note when present)

- [x] **Step 1: Failing tests.** `momentLine({ t_sec: 724, kind: 'marker', kibbutz: 'גבים', hint: 'לבדוק שוב' })` → `'12:04 · גבים · לבדוק שוב'`; with no kibbutz and no hint → `'12:04'`. `noteMark` collapses newlines to spaces and cuts at 120. `mark()` before `start()` creates the session (reuses M-L2).
- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement.** `noteMark` = `supabase.from('meeting_events').update({ hint }).eq('id', id)`. The existing `marker()` in `Presenter.tsx:458` switches to `mark()` in M-U2.
- [x] **Step 4: Run, verify PASS.**
- [x] **Step 5: Commit.** `git commit -m "feat(meeting): סמן רגע — a marker at the meeting clock with an optional one-line note"`

### Task M-L5: The 🔒 פנימי live chip opens an internal task (D2)

**Files:** Modify `app/src/islands/Presenter.tsx:286-305` (the `LiveSheet` submit only), `app/src/islands/Presenter.test.tsx`

- [x] **Step 1: Failing test** in `Presenter.test.tsx`: submitting the live sheet with chip `internal`, text "להזמין כבל" and owner ניתאי calls `createInternalTask({ kibbutz, title: 'להזמין כבל', owner: 'ניתאי', created_by: <me> })` once, and does **not** insert into `kibbutz_meeting_notes`. The 📝 / החלטה / רעיון chips still insert notes (existing tests).
- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement** a third branch: `else if (chip === 'internal') { await createInternalTask({...}); toast.success('נפתחה משימה פנימית'); }` using `createInternalTask` from `components/home/InternalTasks.tsx:76` (read-only import).
- [x] **Step 4: Run, verify PASS.**
- [x] **Step 5: Commit.** `git commit -m "fix(meeting): 🔒 פנימי opens an internal task, not a note"`

### Task M-L6: Status blocks: burns and onboarding (`meetingStatus.ts`)

**Files:** Create `app/src/lib/meetingStatus.ts`, `app/src/lib/meetingStatus.test.ts`

**Interfaces:**
- Consumes: `burnChip(rows, site)`, `canSeeBurns` (`lib/burns.ts`); `progressOf`, `nextStep`, `waitAge`, `isComplete` (`lib/onboarding.ts`).
- Produces:

```ts
export interface StatusBlocks {
  burns: { remaining: number; total: number; text: string } | null;           // text: 'נותרו 4 מתוך 12'
  onboarding: { label: string; next: string | null; waitingDays: number | null; done: boolean } | null;
  emsOpen: number; internalOpen: number;
}
export function statusBlocks(i: { kibbutz: string; burns: BurnRow[]; burnsVisible: boolean; steps: OnboardingStep[];
  emsOpen: number; internalOpen: number; now: Date }): StatusBlocks;
```

- [x] **Step 1: Failing tests.** Burns null when the project is off, when there are no rows for the kibbutz, or when `burnsVisible` is false. Burns text `'נותרו 4 מתוך 12'`, and when all are burned `'הכול נצרב'` (not null: in a meeting "done" is news). Onboarding null with no steps. `{ label: '5/9', next: 'חיבור מונים ל-EMS', waitingDays: 6, done: false }` when the next step is `waiting` since 6 days; `done: true, next: null` when complete.
- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement** on top of the existing helpers. `burnChip`'s own text ("🔥 נותרו X/Y") isn't reused, because of the emoji rule; the numbers are.
- [x] **Step 4: Run, verify PASS.**
- [x] **Step 5: Commit.** `git commit -m "feat(meeting): burns + onboarding status blocks for meeting mode"`

### Task M-L7: The data hook (`useMeetingTimeline`)

**Files:** Create `app/src/islands/presenter/useMeetingTimeline.ts`, `useMeetingTimeline.test.tsx`

**Interfaces:**
- Consumes: `emsGateway().listOpenTasks({ siteId, statuses: OPEN_STATUSES, take: 100 })`, `listComments(taskId)`; `useInternalTasks()`; the notes query (`NOTES_QUERY_KEY`); `sigma.loadAllVisitsCombined()`; the kibbutzim row's `ems_site_ids: string[]` (`lib/kibbutzim.ts:22`; a kibbutz can span several EMS sites, so the hook calls `listOpenTasks` once per id and merges by task id); M-L1 `timelineFor`, `windowStartFor`; M-L2 `fetchPreviousMeetingDate`.
- Produces: `useMeetingTimeline(kibbutz: string, mode: 'since' | '30d'): { items: TimelineItem[]; olderOpen: TimelineItem[]; previousMeeting: string | null; isLoading: boolean; isError: boolean; refetch(): void; emsLive: boolean }`

- [x] **Step 1: Failing test** (gateway mocked): a kibbutz with two `ems_site_ids` merges both task lists without duplicates; a kibbutz with none shows no EMS items and no error; comments are fetched only for the open tasks of the kibbutz on screen, at most 4 at a time; switching kibbutz cancels nothing, and prefetching the next kibbutz starts after the current one resolves; with EMS disconnected, `emsLive` is false and the timeline still shows internal / notes / visits, plus the cached open-task titles in `olderOpen` without dates (reason omitted).
- [x] **Step 2: Run, verify FAIL.**
- [x] **Step 3: Implement** with TanStack Query keys `['meeting-ems', ...ems_site_ids]` (staleTime 60 s) and `['meeting-comments', taskId]` (staleTime 5 min); fall back to `sigma.emsCacheTasksForKibbutz(name)` when the gateway isn't connected.
- [x] **Step 4: Run, verify PASS.**
- [x] **Step 5: Commit.** `git commit -m "feat(meeting): timeline data hook — live EMS dates via the gateway, cache fallback offline"`

### Task M-U1: The meeting screen on the design system

**Gate:** designer PASS on `presenter__360/412 × light/dark` (a busy kibbutz, an empty one, EMS offline, the 30-day toggle, desktop 1440), DS + S on `origin/main`.

**Files:** Modify `app/src/islands/Presenter.tsx`; Create `app/src/islands/presenter/MeetingTimeline.tsx`, `StatusBlocks.tsx`; Modify `Presenter.test.tsx`, `qa/playwright/tests/presenter.spec.ts`

Layout (phone, top to bottom):
- **Header row** (sticky, 48): kibbutz name (title 20/700, 1 line) · compact timer `12:04` in `<bdi>` with one 32 play/pause icon bubble · counter `3/41` · ✕ exit. The Meet link and the carry line move into the ⋯ of this row. This row is M-R4's compact timer.
- **Status blocks**: one `Cluster` of small tiles: EMS open N, internal open N, burns (when not null), onboarding (label + next step + "ממתין 6 ימים"). No card-in-card: plain surface-2 tiles, `sm` radius.
- **Window toggle**: SegmentedControl "מאז 16.9" / "30 יום". The "since" label uses the previous meeting date; with none, only "30 יום" shows.
- **Timeline**: a `SectionBlock` "מה קרה" with ListRows grouped under caption date headers (היום / אתמול / יום ה׳ / d.m, from `lib/format.ts` if DS shipped it, else local). Leading icon per kind (`ClipboardList` EMS, `Lock` internal, `NotebookPen` note, `MapPin` visit); title; meta (`meta` from M-L1). EMS rows get the close bubbles in M-U2.
- **Older open**: a collapsed `SectionBlock` "משימות פתוחות ותיקות" with count.
- **"מהישיבה של …" bullets**: kept, as a collapsed SectionBlock below.
- **Footer** (sticky): prev / next bubbles, the quick-note field, "סמן רגע" (M-U2).
- Remove the `מאז הישיבה הקודמת` block (L624-638) and the `sinceLastMeeting` import. Delete `sinceLastMeeting` from `meetingRun.ts` if nothing else imports it (`ops_graph.py explain sinceLastMeeting` first).

- [ ] **Step 1: Failing tests.** Presenter.test: the string "מאז הישיבה הקודמת" is not rendered; the timeline renders the M-L1 fixture's four items in order; the burns tile is absent when `burnsVisible` is false; keys ←/→ still move kibbutzim. presenter.spec: at 360 no element overlaps (the sweep), the timer is in the header row, the 30-day toggle changes the item count on the mock fixture.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + no-overlap + copy rules + impeccable + boot size.
- [ ] **Step 5: Commit** + sign-off bundle.

### Task M-U2: Close buttons, undo toast, "סמן רגע" sheet and the moments list

**Gate:** designer PASS on the row with close bubbles, the undo toast, the moment sheet, the end-of-meeting list; plus the 360 video (close → undo, close → commit, mark → note), normal and reduced motion.

**Files:** Create `app/src/islands/presenter/MomentSheet.tsx`, `MomentsList.tsx`; Modify `Presenter.tsx`, `MeetingTimeline.tsx`, tests

- Each open EMS row, for `canCloseInMeeting`: two sm bubbles under the meta line (DS allows ≤ 2 in triage lists): "בוצע" (`CheckCircle2`, ok tonal) and "בוטל" (`XCircle`, neutral). One click → `queue.schedule(...)`, the row shows its check drawn (`stroke-dashoffset`, base) and stays during the 5 s, a toast "המשימה סומנה כבוצעה" / "המשימה סומנה כבוטלה" with "ביטול". After commit the row collapses (base). A queued result shows the row tag "יישלח כשתחזור הרשת". `skipped: 'already-closed'` shows toast "המשימה כבר נסגרה". `navigator.vibrate(10)` on the click (tools §3.4).
- "סמן רגע": tap → `mark(kibbutz)` at once (the moment is the tap, not the save) → a small sheet with one text field "הערה (לא חובה)" and "שמירה"; closing it without text keeps the bare marker. Space still marks without opening the sheet (desktop speed).
- On exit: `queue.flush()`, then `MomentsList` shows "רגעים שסומנו" (`momentLine` rows) before the session ends. The list is also handed to `openMeetingReview(parsed, marked)` where it already accepts `marked`.

- [ ] **Step 1: Failing tests.** Presenter.test (closeQueue and gateway mocked): אביאם sees no close bubbles; עמיחי's click on בוצע schedules once, "ביטול" in the toast calls the undo, and nothing is sent; exit flushes. presenter.spec: mark → type a note → reload the events fixture → the moment line shows the note.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** everything, as in M-U1.
- [ ] **Step 5: Commit**, then CHANGELOG / backlog / INDEX 🚦 and flip this spec's STATUS.

---

## 7. Task count and order

| Layer | Tasks | Order |
|---|---|---|
| L (now) | M-L1, M-L2, M-L3, M-L4, M-L5, M-L6, M-L7 | L1, L2, L3, L5, L6 in parallel; L4 after L2 (same file); L7 after L1 + L2 |
| U (after PASS) | M-U1, M-U2 | U1 → U2 |
| **Total** | **9** (7 L + 2 U) | |

## 8. Risks

1. **EMS dates exist only live.** Offline or signed out, EMS items lose their place on the timeline (M-L7 fallback: titles in "older open"). Meetings are at the office, so this should be rare.
2. **Comment fetches.** One `listComments` per open task of the kibbutz on screen. At 41 kibbutzim × ~5 tasks it's paced per screen (max 4 in flight, 5-minute cache), never all at once.
3. **The lazy session touches D.** `DevPresenter` gets the same lazy insert. M-L2 tests the `dev` kind, and D's spec depends on it.
4. **"Due date set" is approximated** by `updatedAt` (open question 1). If עידן wants the exact wording, C must log due-date writes. That's a new table plus a change in `Calendar.tsx`, outside M.
5. **Two presenters.** The re-read guard in `sendClose` stops a double close. A comment already sent by the first presenter isn't duplicated, because the second sees the closed status first.
