// Goldens for D-L4 — the flow strip (port of devFlowSegments + devPctSegments, 18-dev-tasks.js).
import { describe, expect, it } from 'vitest';
import { devFlowSegments } from './devFlow';
import type { DevCard } from './sprintPrep';

const card = (number: number, status: string, state = 'open'): DevCard =>
  ({ number, title: 'x', status, state } as DevCard);

describe('devFlowSegments', () => {
  it('an empty board has no segments', () => {
    expect(devFlowSegments([])).toEqual([]);
  });

  it('integer percentages sum to exactly 100; equal remainders break by pipeline order', () => {
    const segs = devFlowSegments([card(1, 'Backlog'), card(2, 'In Progress'), card(3, 'In Review')]);
    expect(segs).toEqual([
      { key: 'backlog', label: 'ממתין לפיתוח', count: 1, pct: 34 },
      { key: 'prog', label: 'בפיתוח עכשיו', count: 1, pct: 33 },
      { key: 'review', label: 'שלבי בדיקות', count: 1, pct: 33 },
    ]);
  });

  it('omits stages with zero cards, keeps pipeline order for the rest', () => {
    const segs = devFlowSegments([card(1, 'Committed', 'closed'), card(2, 'Committed', 'closed'), card(3, 'Backlog')]);
    expect(segs.map(s => s.key)).toEqual(['backlog', 'committed']);
    expect(segs.find(s => s.key === 'committed')?.pct).toBe(67);
    expect(segs.find(s => s.key === 'backlog')?.pct).toBe(33);
  });
});
