// The lazy-island OPEN LATCH — the real cause of the daylog.spec.ts timeout that Task 18a
// filed as a flake (Task 18b add-on, controller ruling 19.9).
//
// THE BUG, precisely. `mount()` calls `createRoot(...).render(...)`, which SCHEDULES a render.
// main.tsx flips its `mounted` flag the instant that returns and from then on leaves opening to
// the island — but the island's own window listener does not exist until React COMMITS, one
// tick later. An open event dispatched in that gap reached nobody: main.tsx stood down and the
// island was not listening yet, so the sheet silently never opened. Tapping ⋯ → יומן היום at
// the moment the chunk landed did nothing, and a Playwright spec that dispatches right after
// boot timed out at random.
//
// WHY TASK 18a's FIX WAS NOT ONE. It added `if (pendingOpen) { … }` to the island's effect.
// That branch is unreachable: the `useState` initializer (Task 15) drains `pendingOpen` during
// the render, strictly before any effect commits. And it addressed the wrong path anyway —
// `openDayLog()` raises the flag, but the ⋯ row and the specs dispatch the RAW window event.
//
// THE FIX. A module-level listener attached when the CHUNK evaluates — before the first render
// can happen — which only raises the flag for the initializer to find. Registered before the
// component's own handler, so on a warm open the component's handler runs after it and clears
// the flag again.
//
// Pinned statically: the behaviour itself needs the real chunk + a mount, which is what
// qa/playwright/tests/{daylog,gaps,presenter,dev-meeting}.spec.ts do. What can rot silently is
// the SHAPE, and that is what this file guards.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ISLANDS = ['DayLog.tsx', 'Gaps.tsx', 'Presenter.tsx', 'DevPresenter.tsx'];
const src = (f: string) => readFileSync(resolve(process.cwd(), 'src/islands', f), 'utf8');

describe('every lazy island latches an open event that arrives before its first render', () => {
  for (const f of ISLANDS) {
    it(`${f}: the module-level latch is attached at chunk evaluation`, () => {
      expect(src(f)).toMatch(
        /window\.addEventListener\([A-Z_]+_OPEN_EVENT, \(\) => \{ pendingOpen = true; \}\)/);
    });

    it(`${f}: the flag is drained in the useState initializer, and only there`, () => {
      const s = src(f);
      expect(s).toContain('let pendingOpen = false;');
      // Task 18a's effect-side drain — unreachable, because the initializer already ran.
      expect(s, 'the dead effect-side pendingOpen drain is back')
        .not.toMatch(/if \(pendingOpen\) \{ pendingOpen = false; setOpen\(true\); \}/);
      // …and the initializer itself is still there to do the draining.
      expect(s, 'the useState initializer no longer consumes pendingOpen')
        .toMatch(/useState\([\s\S]{0,200}pendingOpen/);
    });
  }
});
