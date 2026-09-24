# Package D: Dev meeting + the dev board in React — spec and implementation plan

STATUS: 🟡 OPEN — D-U1 and D-U2 BUILT on `r9/D-U` (`a0b5b6dd`, `1e7e0906`, `ce4792c4`), tests green, not yet merged. D-U3 is gated on a designer PASS on both (`dev-board__360/412`, `dev-presenter__360/412/1440`, light+dark) which has not happened — resume there, not by re-implementing.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the dev meeting by GitHub parent issue → priority, with filters, a "new this week" block and marks that stay local to the meeting. Rewrite the dev board page (`js/src/18-dev-tasks.js`, 1033 lines) in React on the design system, then delete the legacy file.

**Architecture:** The `github` edge function (ours, in this repo) returns each card's parent chain with titles. The client does all grouping in one pure module, `devMeeting.ts`. Local marks live in `localStorage` per meeting session and never reach GitHub. The dev page keeps the writes it has today (status, priority, sprint, release) through the existing `ghCall` modes, and uses sheets instead of drag-and-drop.

**Tech Stack:** React 18, TanStack Query, `supabase/functions/github` (Deno), vitest, Playwright.

**Spec inputs (binding):** `docs/superpowers/specs/2026-09-23-round-5-design.md` (row D, the dev-domains ruling, grill round 2 "Dev-meeting marks"), `2026-09-23-design-system-design.md` (dev stage colours stay, scoped to the page), `docs/design/tools-and-motion.md` (the stage palette failed the dataviz validator), OPS GRAPH.

**Hard rule (עידן):** never modify any repo other than this one. The GitHub board (`Sigmatec-Energy/tasks`, project 1) is only read, through our `supabase/functions/github`. No test, script or agent calls a write mode (`setStatus`, `setPriority`, `createIssue`) against the live function. The dev meeting writes nothing to GitHub at all.

---

## 1. Requirements

| # | Requirement | Source |
|---|---|---|
| D-R1 | Dev domains are GitHub **parent issues** (every card sits under a parent). Grouping is **parent → priority (קריטי / גבוה / נמוך)**. A card with no parent goes to **"ללא אפיון"**. | round-5 ruling |
| D-R2 | Filters. | row D |
| D-R3 | A **"new this week"** block. | row D |
| D-R4 | Dev-meeting marks are **local to the meeting only**, with a **summary list at the end**. **GitHub isn't touched.** | grill 2 |
| D-R5 | The dev board page is rewritten in React, and `18-dev-tasks.js` is deleted. | row D |
| D-R6 | Every dev-page feature people use today survives: board by stage, the tree (now the parent grouping), text search, assignee / stage / priority filters, hide done, the detail view (state, #, priority, assignee, dates, day-stamps from `dev_status_log`, body, GitHub link), priority edit, move-to-sprint for a selection, "🚀 עלתה גרסה" (review → Committed), the flow strip, and the view choice per device. The audience is unchanged: מתניה, אליה, עידן, עמיחי (`canSeeDevTasks`). | `18-dev-tasks.js` inventory |
| D-R7 | The stage palette passes the dataviz validator in both themes: the two greys merge into one neutral + texture, and the in-segment counts are kept. | tools-and-motion §1 |

**Open questions for עידן (defaults used until he answers):**
1. **Four priorities in the data, three in the ruling.** GitHub has קריטי / גבוהה / **בינונית** / נמוכה (`18-dev-tasks.js:31-38`). Default: four sub-groups in rank order, so no card is hidden or relabelled, plus "ללא עדיפות" last. If you want exactly three, say where בינונית goes.
2. **Which parent.** A card can sit under a sub-feature that sits under a Main Field. Default: group by the **top ancestor** (the Main Field = the domain), and show the direct parent in the row's meta when it's a different issue.
3. **"ללא אפיון" is already taken.** The current prep screen uses it for "cards with an empty body" (`sprintPrep.ts:139 cardsWithoutSpec`). Default: that prep list is renamed **"בלי תיאור"**, and "ללא אפיון" means only "no parent", per the ruling.
4. **Mark vocabulary.** Default: three marks, one per card: "לספרינט", "לבירור", "לדחות", plus an optional one-line note. The summary at the end lists them grouped by mark, and "העתקה" copies it as text.
5. **Drag-and-drop** (עידן, desktop only today). Default: removed. The detail sheet gets "העברה לשלב" with the seven stages. Drag isn't discoverable on a phone, and the design system rules out hidden gestures.
6. **"New this week"** = created in the last 7 days (`createdAt`). The legacy board's "week" filter meant *updated* in 7 days. Default: the block uses created; the filter "עודכנו השבוע" stays as a filter.

## 2. File ownership

**D owns:**
- `supabase/functions/github/index.ts`: the `fetchParentLinks` query and the item mapping only
- `supabase/functions/github/lineage.js` + `test-github-lineage.mjs` (new)
- `app/src/lib/devBoard.ts` (+ new `devBoard.test.ts`)
- `app/src/lib/sprintPrep.ts` + test (rename the "ללא אפיון" label only; logic unchanged)
- `app/src/lib/devMeeting.ts` + test (new)
- `app/src/lib/devMarks.ts` + test (new)
- `app/src/lib/devStatusLog.ts` + test (new; port of `devLoadStatusLog` / `devLogStatuses` / `devStamps`)
- `app/src/lib/devFlow.ts` + test (new; port of `devFlowSegments` / `devPctSegments`)
- `app/src/islands/DevPresenter.tsx` + test
- `app/src/islands/DevBoard.tsx` + test (new), `app/src/islands/dev/*.tsx` (new: `CardSheet`, `FiltersSheet`, `FlowStrip`, `GroupedList`, `StageList`)
- `qa/playwright/tests/dev-board.spec.ts`, `qa/playwright/tests/dev-presenter.spec.ts`
- `app/src/lib/__fixtures__/github_board.json` (new; the one shared fixture)
- Deletes: `js/src/18-dev-tasks.js`, `test-devboard.mjs`

**Shared files: D's edits are limited to:**

| File | D may touch | Owner of the rest |
|---|---|---|
| `supabase/functions/github/index.ts` | `fetchParentLinks` (L56-83) and the item mapping (L428-454) | X-L8 adds the write-mode gate at the top of the handler; whoever merges second rebases |
| `app/src/main.tsx` | the DevPresenter block (L460-500) + a new dev-view observer block (Hours pattern, L236-251) | each package its own block |
| `app/src/lib/meetingRun.ts` | read only (`useMeetingRun('dev', …)`, lazy session per M-L2) | M |
| `js/src/00-bridge.js` | the `case 'dev'` line of `canShowPage` (L228) | shared |
| `js/src/02-init-attendance.js` | the `dev` gate (L75) and `renderDevTasks()` (L99) | shared |
| `js/src/11-search-login.js` | `applyNavVisibility`'s `navDev` line (L182-183) | shared |
| `index.html` | `#dev-view` inner (L566-576), `#navDev` (L83) | S (header / nav), others |
| `css/app.css` | delete only `.dev-*` rules and the `--stage-*` tokens after they move to the page's scope | DS |
| `test-can-show-page.mjs`, `test-integration.mjs` | the dev rows only (`test-can-show-page.mjs:36,47`; `test-integration.mjs:310-314`) | shared |
| `app/src/islands/FeedbackInbox.tsx` | nothing (it uses `ghCall` `listParents` / `createIssue`, unchanged) | R |

**D never touches:** `components/ui/*`, `Presenter.tsx` (M), the GitHub repo itself.

## 3. Graph blast radius (`ops_graph.py file 18-dev-tasks.js`, RETIREMENT_MAP §"18-dev-tasks.js")

`18-dev-tasks.js`: 52 nodes, degree 73. Inbound code edges from outside the file:
- `sigma.canShowPage` → `canSeeDevTasks()` (`00-bridge.js:228`) → inline in D-L5.
- `showPage()` → `canSeeDevTasks()` / `renderDevTasks()` (`02-init-attendance.js:75,99`) → D-L5 / D-U3.
- `applyNavVisibility()` → `canSeeDevTasks()` (`11-search-login.js:183`) → D-L5.
- `test-can-show-page.mjs:36,47` loads the file → rewritten in D-L5.
- `test-devboard.mjs` → sections [2]–[4] become vitest goldens (D-L4), and the file is deleted in D-U3.
- `test-integration.mjs:310-314` (the `devArg()` quoting guard) → deleted with the file; the React page has no inline `onclick`.
- Table `dev_status_log` **stays** (anon read, authenticated insert, viewer-blocked by X). New writer: `devStatusLog.ts`.
- `ext:github` **stays** (RETIREMENT_MAP finding #5): `devBoard.ts`, `DevPresenter.tsx`, `FeedbackInbox.tsx` and the function keep using it.
- `sprintPrep.ts` is conceptually related (a deliberate copy of `devStage`); after D-U3 `stageOf` is the only copy.
- Local keys retired: `dev_tasks_cache_v1` (TanStack's persisted cache replaces it) and `dev_view` (becomes `dev_view_v2`, values `domains` | `stages`).
- The "🧪 DEV" tab in `01-data.js:478-486` is the mock-mode badge, not the dev board. It isn't D's (S moves it into ⋯ עוד).

Docs to update after the delete (D-U3): `docs/INDEX.md` (L31-32, the DEV-PAGE lane), `docs/modules.md` (L170-178), `docs/click-map.md` (L207-224), `docs/integration-map.md` (L234), `docs/integration-map.annotations.md` (L381).

## 4. Global constraints (every task)

- Worktree `git worktree add -b r9/pkg-D ../SigmatecOps-r9-D origin/main`; parallel-safe push loop per `CLAUDE.md`; `node build.mjs` after every `js/src` edit.
- **No live GitHub writes, ever, from tests or agents.** `ghCall` is mocked in every unit test; Playwright runs in mock mode, where `ghCall` reads `app/src/lib/__fixtures__/github_board.json`. The function change (D-L1) is verified by a **read-mode** call only.
- The edge function deploy is a production side effect: deploy from the rebased worktree, and only after the review of D-L1.
- Copy: noun-form buttons, no "!", no em dash, no emoji in UI (the stage icons 🗂️📋↩️🟢🔨🔍🚀 become lucide: `FolderTree`, `ListTodo`, `Undo2`, `CalendarCheck`, `Hammer`, `SearchCheck`, `Rocket`), ״ ׳, Hebrew aria-labels.
- Tokens / motion / z tokens only. Stage colours are page-scoped tokens (`--s-stage-*`) that pass the dataviz validator (D-R7).
- The dev board and dev presenter are lazy chunks; the boot chunk stays ≤ 303 kB.
- U tasks merge only with the designer's PASS.

## 5. Review focus

1. **A card whose parent chain is longer than the query depth** (4 levels), or has a cycle from a bad edit on GitHub. Expected: it groups under the deepest ancestor it got, and never loops. → D-L2 step 1.
2. **A parent that is closed** (not in the open list). Expected: its title still shows, taken from the chain the function returns, never "#123" when GitHub has the title. → D-L1 / D-L2.
3. **The meeting is left mid-way** (phone locked, app killed). Expected: the marks are still there when the same session reopens that day. A new day's meeting starts empty; yesterday's marks stay readable from the summary for 7 days, then they're cleaned up. → D-L3 step 1.
4. **The priority text is free-form** ("דחוף!!", "🔴", "High"). Expected: it maps through the same keyword families as today; unknown text lands in "ללא עדיפות", never in a made-up group. → D-L2 step 1.
5. **The GitHub read fails** (token expired, rate limit). Expected: the page shows the inline error "לא הצלחנו לטעון את לוח הפיתוח." + "ניסיון נוסף" over the last cached board, never an empty board that reads as "no work". → D-U1 step 1.

---

## 6. Tasks

Layer key: **L** = logic/data, now. **U** = screens, after PASS.

### Task D-L1: The `github` function returns each card's parent chain with titles

**Files:** Modify `supabase/functions/github/index.ts` (L56-83 and the mapping at L428-454); Create `supabase/functions/github/lineage.js`, `test-github-lineage.mjs`, `app/src/lib/__fixtures__/github_board.json`; Modify `test-edge-imports.mjs` only if the import list changes (it shouldn't)

**Interfaces:**
- Produces: each item in the default read gains `parentChain: Array<{ number: number; title: string; state: 'OPEN' | 'CLOSED' }>`, nearest parent first, up to 4 levels. `parent` (number) stays as today for old clients.

- [ ] **Step 1: Write the failing check.** The helper lives in its own plain-JS module, `supabase/functions/github/lineage.js`, which Deno imports from `index.ts` and Node imports directly, so there's no copy to drift:

```js
// test-github-lineage.mjs
import assert from 'node:assert';
import { chainOf } from './supabase/functions/github/lineage.js';
const L = { chainOf };
const node = { number: 5, parent: { number: 4, title: 'טופס ביקור', state: 'OPEN', parent: { number: 1, title: 'שטח', state: 'CLOSED', parent: null } } };
assert.deepStrictEqual(L.chainOf(node), [{ number: 4, title: 'טופס ביקור', state: 'OPEN' }, { number: 1, title: 'שטח', state: 'CLOSED' }]);
assert.deepStrictEqual(L.chainOf({ number: 9, parent: null }), []);
const loop = { number: 7, parent: { number: 8, title: 'x', state: 'OPEN', parent: { number: 7, title: 'y', state: 'OPEN', parent: null } } };
assert.deepStrictEqual(L.chainOf(loop).map(p => p.number), [8], 'a cycle stops at the first repeat');
console.log('github lineage OK');
```

- [ ] **Step 2: Run, verify FAIL.** `node test-github-lineage.mjs` → `ERR_MODULE_NOT_FOUND`.
- [ ] **Step 3: Implement.** Change the `fetchParentLinks` query to `nodes{ number parent { number title state parent { number title state parent { number title state parent { number title state } } } } }` and send the header `"GraphQL-Features": "sub_issues"` (it's missing there, `gqlCall` L265 has it). Return `Record<number, Chain>`, built with `import { chainOf } from "./lineage.js";` from:

```js
// supabase/functions/github/lineage.js — pure, dependency-free; imported by index.ts (Deno) and test-github-lineage.mjs (Node)
export function chainOf(node) {
  const out = [], seen = new Set([node && node.number]);
  let p = node && node.parent;
  while (p && p.number && !seen.has(p.number) && out.length < 4) {
    seen.add(p.number);
    out.push({ number: p.number, title: String(p.title || ''), state: p.state === 'CLOSED' ? 'CLOSED' : 'OPEN' });
    p = p.parent;
  }
  return out;
}
```

In the mapping, `t.parentChain = chains[t.number] || []` and `t.parent = t.parentChain[0]?.number ?? t.parent`. Graceful failure stays: any GraphQL error → `{}` → every card lands in "ללא אפיון" with the page still working. Then write `github_board.json`, the open-state read as the function returns it. #1 "שטח" is a **closed** Main Field, so it appears only inside chains:

```json
[
  { "number": 2,  "title": "מלאי", "state": "open", "status": "Main Fields", "createdAt": "2026-07-01T08:00:00Z", "updatedAt": "2026-07-01T08:00:00Z", "parentChain": [] },
  { "number": 4,  "title": "טופס ביקור", "state": "open", "status": "Backlog", "priority": "גבוהה", "createdAt": "2026-09-01T08:00:00Z", "updatedAt": "2026-09-02T08:00:00Z", "parentChain": [{ "number": 1, "title": "שטח", "state": "CLOSED" }] },
  { "number": 12, "title": "טופס ביקור: שדה חתימה", "state": "open", "status": "Sprint Ready", "priority": "קריטי", "assignee": "matanya", "createdAt": "2026-09-20T08:00:00Z", "updatedAt": "2026-09-21T08:00:00Z", "parentChain": [{ "number": 4, "title": "טופס ביקור", "state": "OPEN" }, { "number": 1, "title": "שטח", "state": "CLOSED" }] },
  { "number": 13, "title": "טופס ביקור: טיוטה", "state": "open", "status": "In Progress", "priority": "בינונית", "createdAt": "2026-09-05T08:00:00Z", "updatedAt": "2026-09-19T08:00:00Z", "parentChain": [{ "number": 4, "title": "טופס ביקור", "state": "OPEN" }, { "number": 1, "title": "שטח", "state": "CLOSED" }] },
  { "number": 14, "title": "צ׳ק-אין בשטח", "state": "open", "status": "In Review", "priority": "דחוף!!", "createdAt": "2026-09-10T08:00:00Z", "updatedAt": "2026-09-22T08:00:00Z", "parentChain": [{ "number": 1, "title": "שטח", "state": "CLOSED" }], "comments": [{ "id": 1, "issue_number": 14, "author": "matanya", "body": "@עידן לשלוח לבדיקה?", "createdAt": "2026-09-22T09:00:00Z" }] },
  { "number": 15, "title": "בריפינג", "state": "open", "status": "Committed", "priority": "נמוכה", "createdAt": "2026-08-20T08:00:00Z", "updatedAt": "2026-09-15T08:00:00Z", "parentChain": [{ "number": 1, "title": "שטח", "state": "CLOSED" }] },
  { "number": 31, "title": "ייצוא מלאי", "state": "open", "status": "Backlog", "priority": "High", "createdAt": "2026-09-22T10:00:00Z", "updatedAt": "2026-09-22T10:00:00Z", "parentChain": [{ "number": 2, "title": "מלאי", "state": "OPEN" }], "comments": [{ "id": 2, "issue_number": 31, "author": "elia", "body": "איזה עמודות?", "createdAt": "2026-09-22T11:00:00Z" }] },
  { "number": 32, "title": "ספירה חוזרת", "state": "open", "status": "Scope Refinement", "priority": "משהו", "createdAt": "2026-09-01T08:00:00Z", "updatedAt": "2026-09-03T08:00:00Z", "parentChain": [{ "number": 2, "title": "מלאי", "state": "OPEN" }] },
  { "number": 33, "title": "התראות מלאי", "state": "open", "status": "", "labels": ["🔴"], "createdAt": "2026-08-01T08:00:00Z", "updatedAt": "2026-08-01T08:00:00Z", "parentChain": [{ "number": 2, "title": "מלאי", "state": "OPEN" }] },
  { "number": 40, "title": "באג בכניסה", "state": "open", "status": "Backlog", "priority": "", "createdAt": "2026-09-12T08:00:00Z", "updatedAt": "2026-09-12T08:00:00Z", "parentChain": [] }
]
```

`assignee` in the real payload is the GitHub login (`it.assignee.login`), hence `matanya`. The UI maps logins to names only where a map already exists; D adds none.

It covers: two domains (one closed), a sub-feature level, one card without a parent, every tier (crit #12 #14, high #4 #31 #33-by-label, med #13, low #15, none #32 #40), all seven stages, two cards created within 7 days of `2026-09-23T09:00:00Z` (#31, #12), and comments on two cards.
- [ ] **Step 4: Run** `node test-github-lineage.mjs && node test-edge-imports.mjs` → PASS. Then deploy the function (review first) and do one **read-mode** smoke: in the app with an EMS login, open the dev page and confirm in the network tab that items carry `parentChain`. No write mode.
- [ ] **Step 5: Commit** `supabase/functions/github/index.ts supabase/functions/github/lineage.js test-github-lineage.mjs app/src/lib/__fixtures__/github_board.json`: `git commit -m "feat(github): parent chain with titles per card (sub_issues header, cycle-safe)"`

**Acceptance:** read-mode payload has `parentChain`; the function never writes; `ghCall` callers that ignore the new field are unaffected.

### Task D-L2: Grouping, priority, filters, new-this-week (`devMeeting.ts`)

**Files:** Create `app/src/lib/devMeeting.ts`, `app/src/lib/devMeeting.test.ts`; Modify `app/src/lib/sprintPrep.ts` (add `parentChain?` to `DevCard`; rename the prep label per open question 3)

**Interfaces:**
- Consumes: `DevCard` (+ `parentChain`), `stageOf`, `isParentCard` (`sprintPrep.ts`).
- Produces:

```ts
export type PrioTier = 'crit' | 'high' | 'med' | 'low' | 'none';
export const PRIO_LABEL: Record<PrioTier, string>;   // קריטי · גבוהה · בינונית · נמוכה · ללא עדיפות
export function priorityTier(c: DevCard): PrioTier;   // body "## עדיפות" / project field first, then labels (port of devPriority + devPriorityRank)
export interface DomainGroup {
  domain: { number: number; title: string } | null;   // null = 'ללא אפיון'
  count: number;
  tiers: Array<{ tier: PrioTier; cards: DevCard[] }>; // only non-empty tiers, crit → none
}
export function groupByDomain(cards: DevCard[]): DomainGroup[];     // parents (stage 'fields') are headers, never rows
export function directParentLabel(c: DevCard): string | null;       // meta when the direct parent ≠ the domain
export interface DevFilters { q?: string; assignee?: string; stage?: string; tier?: PrioTier; updatedThisWeek?: boolean; hideDone?: boolean }
export function applyDevFilters(cards: DevCard[], f: DevFilters, now: number): DevCard[];
export function newThisWeek(cards: DevCard[], now: number): DevCard[];   // createdAt within 7×24 h, parents excluded, newest first
```

- [ ] **Step 1: Failing goldens** over `__fixtures__/github_board.json`:

```ts
import board from './__fixtures__/github_board.json';
import { groupByDomain, priorityTier, applyDevFilters, newThisWeek, directParentLabel } from './devMeeting';
const NOW = Date.parse('2026-09-23T09:00:00Z');

it('domains = top ancestors, sorted by open count; "ללא אפיון" last', () => {
  const g = groupByDomain(board as any);
  expect(g.map(d => d.domain?.title ?? 'ללא אפיון')).toEqual(['שטח', 'מלאי', 'ללא אפיון']);   // 5 · 3 · 1 cards
  expect(g.map(d => d.count)).toEqual([5, 3, 1]);
  expect(g.every(d => d.tiers.every(t => t.cards.every(c => stageOf(c) !== 'fields')))).toBe(true);   // #2 is a header, not a row
  expect(g[0].tiers.map(t => [t.tier, t.cards.map(c => c.number)])).toEqual([['crit', [12, 14]], ['high', [4]], ['med', [13]], ['low', [15]]]);
});
it('tiers in rank order, empty tiers omitted', () => {
  const t = groupByDomain(board as any)[0].tiers.map(x => x.tier);
  expect(t).toEqual([...t].sort((a, b) => ['crit', 'high', 'med', 'low', 'none'].indexOf(a) - ['crit', 'high', 'med', 'low', 'none'].indexOf(b)));
});
it.each([['דחוף!!', 'crit'], ['High', 'high'], ['בינונית', 'med'], ['נמוכה', 'low'], ['משהו', 'none'], ['', 'none']])('priority %s → %s', (p, tier) =>
  expect(priorityTier({ number: 1, title: 'x', priority: p } as any)).toBe(tier));
it('labels are the fallback (🔴 → high)', () => expect(priorityTier({ number: 1, title: 'x', labels: ['🔴'] } as any)).toBe('high'));
it('a closed parent keeps its title', () =>
  expect(groupByDomain(board as any)[0].domain).toEqual({ number: 1, title: 'שטח' }));
it('the direct parent shows only when it differs from the domain', () => {
  expect(directParentLabel({ number: 5, title: 'x', parentChain: [{ number: 4, title: 'טופס ביקור', state: 'OPEN' }, { number: 1, title: 'שטח', state: 'OPEN' }] } as any)).toBe('טופס ביקור');
  expect(directParentLabel({ number: 6, title: 'x', parentChain: [{ number: 1, title: 'שטח', state: 'OPEN' }] } as any)).toBe(null);
});
it('filters compose; hideDone drops committed', () => {
  const f = applyDevFilters(board as any, { tier: 'crit', hideDone: true }, NOW);
  expect(f.every(c => priorityTier(c) === 'crit' && stageOf(c) !== 'committed')).toBe(true);
  expect(applyDevFilters(board as any, { q: 'טופס' }, NOW).length).toBeGreaterThan(0);
});
it('new this week = created in 7 days, parents excluded', () =>
  expect(newThisWeek(board as any, NOW).map(c => c.number)).toEqual([31, 12]));
it('#33 has no status → backlog, and its 🔴 label → high', () => {
  const c = (board as any[]).find(x => x.number === 33);
  expect(stageOf(c)).toBe('backlog'); expect(priorityTier(c)).toBe('high');
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** The domain is `c.parentChain.at(-1)` (the top ancestor, open question 2), else `c.parent` resolved against the card list, else null. Sort domains by `count` descending, then Hebrew title, with `null` last. Inside a tier, cards sort by board order `pos`, then `number` ascending (the fixture has no `pos`, hence `[12, 14]`). The tier keyword families come verbatim from `18-dev-tasks.js:31-53`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(dev): group by parent domain → priority, filters, new this week"`

### Task D-L3: Local meeting marks (`devMarks.ts`)

**Files:** Create `app/src/lib/devMarks.ts`, `app/src/lib/devMarks.test.ts`

**Interfaces:**
- Produces:

```ts
export type DevMark = 'sprint' | 'clarify' | 'defer';
export const MARK_LABEL: Record<DevMark, string>;           // לספרינט · לבירור · לדחות
export interface MarkEntry { number: number; mark: DevMark; note?: string; at: string }
export function marksKey(date: string): string;             // 'dev_meeting_marks_v1:2026-09-23'
export function loadMarks(date: string): Record<number, MarkEntry>;
export function setMark(date: string, e: MarkEntry | { number: number; mark: null }): Record<number, MarkEntry>;
export function pruneOldMarks(today: string, keepDays = 7): void;
export function marksSummary(marks: Record<number, MarkEntry>, cards: DevCard[]): Array<{ mark: DevMark; label: string; rows: Array<{ number: number; title: string; note?: string }> }>;
export function marksText(summary: ReturnType<typeof marksSummary>, date: string): string;   // the "העתקה" payload
```

- [ ] **Step 1: Failing tests.** Set, replace and clear a mark; reload from `localStorage` gives the same map; a different date starts empty; `pruneOldMarks('2026-09-23')` removes the `…:2026-09-15` key and keeps `…:2026-09-17`; `marksText` golden:

```
ישיבת פיתוח 23.9
לספרינט
· #12 טופס ביקור: שדה חתימה
לבירור
· #31 ייצוא מלאי (לשאול את עמיחי על העמודות)
```

Also: `localStorage` throwing (private mode) makes `setMark` return the in-memory map and never throw. And a static check: `devMarks.ts` imports nothing from `devBoard.ts` / `ghCall`, which pins D-R4 at compile time (`expect(fs.readFileSync(...)).not.toMatch(/ghCall|devBoard/)`).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** The key is the meeting **date** (Israel), not the session id: the session row is lazy since M-L2, and a reopen the same day must see the same marks.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(dev-meeting): local marks per meeting day + summary text; never touches GitHub"`

### Task D-L4: Port the board's remaining logic: flow strip, status-log stamps, writes

**Files:** Create `app/src/lib/devFlow.ts` (+ test), `app/src/lib/devStatusLog.ts` (+ test); Modify `app/src/lib/devBoard.ts` (+ new `devBoard.test.ts`); Create `app/src/lib/devParity.test.ts` (temporary, deleted in D-U3)

**Interfaces:**
- Produces:
  - `devFlowSegments(cards: DevCard[]): Array<{ key: DevStage; label: string; count: number; pct: number }>` (integer pct summing to 100, port of `devFlowSegments` + `devPctSegments`)
  - `fetchStatusLog(numbers: number[]): Promise<Record<number, Partial<Record<DevStage, string>>>>`, `logStatuses(cards: DevCard[], today: string): Promise<void>` (upsert with ignore-duplicates, authenticated client), `stampsFor(log, number): Array<{ stage: DevStage; day: string }>`
  - `setStatus(numbers: number[], target: string)`, `setPriority(numbers: number[], p: string)`, `releaseReview(cards: DevCard[])` (review → `'Committed'`), `STAGE_TARGET: Record<DevStage, string>` (port of `DEV_STAGE_TARGET`, `18-dev-tasks.js:980`), `canSeeDevBoard(user: string, isAdmin: boolean): boolean`, `canDragOrMove(user: string): boolean` (עידן, as today)

- [ ] **Step 1: Failing tests.** `devParity.test.ts` loads `18-dev-tasks.js` with the same `new Function(window, document, localStorage, …)` stub harness as `test-devboard.mjs:66-86` and asserts `devFlowSegments(board)` equals the legacy `devPctSegments(devFlowSegments(board))` over the fixture, and that `stageOf` equals the legacy `devStage` for every card. `devBoard.test.ts` (ghCall mocked): `setStatus([3, 4], STAGE_TARGET.ready)` posts `{ mode: 'setStatus', numbers: [3, 4], status: 'Sprint Ready' }`; `releaseReview` sends only the review cards with `'Committed'`; `canSeeDevBoard` matrix: מתניה ✓, אליה ✓, עידן ✓, עמיחי ✓, אביאם ✗, ניתאי ✗, viewer ✗. `devStatusLog.test.ts`: `stampsFor` orders by the `DEV_STAGES` order and skips missing stages.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** `SPRINT_STATUS_TARGET` in `sprintPrep.ts` stays `'Ready'` for the prep screen (both match the server's ready family, `github/index.ts:136-145`).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(dev): port flow strip, status-log stamps and board writes to React libs, pinned by parity"`

### Task D-L5: Move the dev gates off the retiring file

**Files:** Modify `js/src/00-bridge.js:228`, `js/src/02-init-attendance.js:75`, `js/src/11-search-login.js:182-183`, `test-can-show-page.mjs:36,47`; build

- [ ] **Step 1: Failing test.** In `test-can-show-page.mjs`, drop `const dev = src('18-dev-tasks.js')` (L36) and `fnSource(dev, 'canSeeDevTasks')` from `program`, and in the `call` map replace `canSeeDevTasks` with `canManageStaff: canManageStaff`. The existing dev column of the identity × page matrix (מתניה / אליה / עידן / עמיחי ✓, the rest ✗, viewer ✗) must pass against `00-bridge.js` alone. Add `assert.ok(!/src\('18-dev-tasks\.js'\)/.test(fs.readFileSync(path.join(root, 'test-can-show-page.mjs'), 'utf8')))`. (G-L4 edits the burns lines of the same file; rebase onto whichever lands first.)
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** `case 'dev': { var _d = call('getCurrentUser', [], ''); return _d === 'מתניה' || _d === 'אליה' || !!call('canManageStaff', [], false); }`. `02-init-attendance.js:75` → `if (page === 'dev' && !(window.sigma && window.sigma.canShowPage && window.sigma.canShowPage('dev'))) page = 'kibbutz';`. `11-search-login.js:183` → the same `sigma.canShowPage('dev')`. Then `node build.mjs`.
- [ ] **Step 4: Run** `node test-can-show-page.mjs && node test-devboard.mjs && npm test` → PASS (the legacy page still renders).
- [ ] **Step 5: Commit.** `git commit -m "refactor(dev): page gate leaves 18-dev-tasks.js"`

### Task D-U1: The dev board page in React

**Gate:** designer PASS on `dev-board__360/412 × light/dark` (domains view, stages view, a card sheet, the filters sheet, the selection footer, error over cache, loading) and on the stage palette's dataviz validator output in both themes; DS + S on `origin/main`.

**Files:** Create `app/src/islands/DevBoard.tsx`, `DevBoard.test.tsx`, `app/src/islands/dev/{CardSheet,FiltersSheet,FlowStrip,GroupedList,StageList}.tsx`, `qa/playwright/tests/dev-board.spec.ts`; Modify `index.html` `#dev-view` inner → `<div id="sigma-dev-board"></div>`; Modify `app/src/main.tsx` (dev-view observer block)

Screen:
- `PageActionRow` "פיתוח" + back; actions: "סינון" (opens `FiltersSheet`, with a count badge when filters are on) and ⋯ (עלתה גרסה, רענון).
- `SegmentedControl` תחומים / שלבים (kept in `dev_view_v2`).
- `FlowStrip`: one StackedBar, plain SVG/CSS, 2 px surface gaps, in-segment counts, a legend; tapping a segment sets the stage filter. Colours are the validated `--s-stage-*` set.
- **תחומים** (default): "חדש השבוע" SectionBlock first (`newThisWeek`, collapsible, hidden when empty), then one SectionBlock per domain (title = domain, count Tag), with caption tier sub-headers and ListRows: title (2-line clamp), meta = stage Tag · assignee · `directParentLabel` · updated `d.m`.
- **שלבים**: one SectionBlock per stage (the four full stages expanded, the rest collapsed = the old rail); from 768 px the four full stages sit as a 4-column grid.
- `CardSheet`: #, state, priority (a `SegmentedControl` of the 4 tiers + none → `setPriority`, optimistic with revert), stage ("העברה לשלב" list → `setStatus`, for עידן as drag was), assignee, created / updated, day-stamps (`stampsFor`), body (markdown as plain text), "פתיחה ב-GitHub".
- Selection: "בחירה" in ⋯ turns on checkboxes; footer "העברה לספרינט (N)" → `setStatus(numbers, STAGE_TARGET.ready)`.
- States: skeleton > 300 ms; the error "לא הצלחנו לטעון את לוח הפיתוח." + "ניסיון נוסף" shown **over** the persisted cache; EmptyState per filter "אין כרטיסים שתואמים לסינון." + "ניקוי סינון".
- `logStatuses(cards, today)` runs once per session after a successful load (same behaviour as today).

- [ ] **Step 1: Failing tests.** DevBoard.test (ghCall mocked with the fixture): domains view renders "ללא אפיון" last; switching to שלבים persists; a failed fetch with a cache shows the error block and the cached rows; אביאם's mount renders null; the priority change reverts on a rejected `setPriority`. dev-board.spec (mock mode): at 360, open a card sheet from the domains view, filter by קריטי, clear the filter; no `dialog` events; the sweep is green.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + no-overlap + copy + impeccable + the dataviz validator on the stage palette (light and dark) + boot size.
- [ ] **Step 5: Commit** + sign-off bundle (+ the 360 video of opening a card and moving it to the sprint).

### Task D-U2: The dev meeting (DevPresenter) grouped by domain, with local marks

**Gate:** designer PASS on `dev-presenter__360/412/1440 × light/dark` (new-this-week, a domain screen, a card with its mark bar, the end summary); DS + S + M-L2 on `origin/main`.

**Files:** Modify `app/src/islands/DevPresenter.tsx`, `DevPresenter.test.tsx`; Create `qa/playwright/tests/dev-presenter.spec.ts`

Flow:
1. **Prep** (as today, restyled): burndown, "בלי תיאור" (renamed), "תקוע מעל שבוע", questions for עידן, the proposed sprint. The per-row accept that called `moveToSprint` **becomes the local mark "לספרינט"**. No GitHub call from anywhere in the presenter.
2. **חדש השבוע**: one screen listing `newThisWeek`.
3. **Walk**: one screen per domain (in `groupByDomain` order), cards listed by tier. Each card shows title, stage Tag, assignee, body excerpt, its questions, and a mark bar of 3 FilterChips (לספרינט / לבירור / לדחות) + "הערה". Keys ←/→ move domains, j/k move cards, 1/2/3 set marks, Space = "סמן רגע" through `useMeetingRun('dev')` (unchanged).
4. **Filters** in the header ⋯: assignee, tier, stage (the D-L2 filters), applied to the walk.
5. **Summary** at the end: `marksSummary` grouped by mark, plus "העתקה" (`marksText` to the clipboard) and "סיום".

- [ ] **Step 1: Failing tests.** DevPresenter.test: no call to `moveToSprint` / `ghCall` with a write mode anywhere in a full walk (spy on the mocked `devBoard` module: only `fetchDevBoard` is called); marks survive an unmount + remount the same day; the summary lists marked cards grouped by mark; the gate `canRunDevMeeting` is unchanged. dev-presenter.spec: walk two domains with keys, mark with 1 and 2, finish, and the summary text matches the golden format.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** everything as in D-U1.
- [ ] **Step 5: Commit** + sign-off bundle.

### Task D-U3: Delete `18-dev-tasks.js` and close the graph

**Gate:** D-U1 and D-U2 merged with PASS.

**Files:**
- Delete: `js/src/18-dev-tasks.js`, `test-devboard.mjs`, `app/src/lib/devParity.test.ts`
- Modify: `js/src/02-init-attendance.js:99` (remove `renderDevTasks()`), `index.html` (`#devTasksContent` and legacy dev markup already gone in D-U1; check `#navDev` L83: S's nav may have removed it; if it's still there, leave it wired to `showPage('dev')`), `css/app.css` (remove `.dev-*` rules and the global `--stage-*` tokens now scoped in the page), `test-integration.mjs:310-314` (delete the `devArg` quoting guard)
- Docs: INDEX, modules, click-map, integration-map(+annotations)
- `node build.mjs`, `python docs/ops-graph/rebuild.py`

- [ ] **Step 1: Failing contract test** in `test-integration.mjs`: `18-dev-tasks.js` doesn't exist; no reader of `renderDevTasks`, `canSeeDevTasks`, `devTasksContent`, `dev_tasks_cache_v1` remains in `js/src`, `index.html` or `app/src`.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Delete and edit.** Also clear the old keys once: `try { localStorage.removeItem('dev_tasks_cache_v1'); localStorage.removeItem('dev_view'); } catch {}` in `DevBoard.tsx`'s mount.
- [ ] **Step 4: Run** `npm test`, the full Playwright suite, no-overlap, impeccable. Loop until green.
- [ ] **Step 5: Commit** `git commit -m "chore(round5-D): retire 18-dev-tasks.js"`, then CHANGELOG / backlog / INDEX 🚦, flip this STATUS, and tell the graph session to untag the `18-dev-tasks.js` entry in `retiring_nodes.json`.

---

## 7. Task count and order

| Layer | Tasks | Order |
|---|---|---|
| L (now) | D-L1, D-L2, D-L3, D-L4, D-L5 | L1 → L2 (fixture); L3, L4, L5 in parallel with L1 |
| U (after PASS) | D-U1, D-U2, D-U3 | U1 and U2 in either order (U2 also needs M-L2); U3 last |
| **Total** | **8** (5 L + 3 U) | |

## 8. Risks

1. **Sub-issues API drift.** `parent` on GraphQL needs the `sub_issues` feature header on some accounts. D-L1 adds it; graceful fallback keeps the page up, with every card in "ללא אפיון". The read smoke after deploy catches that at once.
2. **Four vs three priorities** (open question 1). Until עידן rules, בינונית shows as its own tier, so nothing is misfiled.
3. **The github function has no role check on writes** (found in planning: any valid EMS login can call `setStatus` / `setPriority` / `createIssue`). It isn't D's to fix; it's X-L8. D keeps the client gates (`canSeeDevBoard`, `canDragOrMove`) as they are.
4. **The lazy session (M-L2)** changes when the dev meeting's session row appears. D-L3 keys marks by date for this reason.
5. **Drag removed** (open question 5). עידן is the only drag user. The sheet's "העברה לשלב" covers the same moves in two taps.
