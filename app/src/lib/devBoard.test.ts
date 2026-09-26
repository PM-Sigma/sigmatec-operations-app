// Goldens for D-L4 — the board's write path (setStatus/setPriority/releaseReview, ported from
// 18-dev-tasks.js devWriteStatus/devWritePriority/devReleaseVersion) and the two client gates
// (canSeeDevBoard/canDragOrMove). ghCall is mocked via a stubbed global fetch — no live write.
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/bridge', () => ({ sigma: { emsToken: () => 'ems-tok' } }));
vi.mock('@/lib/session', () => ({ sessionLost: (tag: string) => new Error('session-lost:' + tag) }));

const { pageGate } = vi.hoisted(() => ({ pageGate: { dev: false } }));
vi.mock('./canShowPage', () => ({ canShowPage: (page: string) => page === 'dev' && pageGate.dev }));

const calls: any[] = [];
beforeEach(() => {
  calls.length = 0;
  pageGate.dev = false;
  (globalThis as any).fetch = vi.fn(async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return { ok: true, json: async () => ({ updated: body.numbers, failed: [] }) };
  });
});

import { setStatus, setPriority, releaseReview, STAGE_TARGET, canSeeDevBoard, canDragOrMove, canWriteGithub } from './devBoard';
import type { DevCard } from './sprintPrep';

describe('setStatus', () => {
  it('posts mode:setStatus with the target stage', async () => {
    await setStatus([3, 4], STAGE_TARGET.ready);
    expect(calls[0]).toMatchObject({ mode: 'setStatus', numbers: [3, 4], status: 'Sprint Ready' });
  });
});

describe('setPriority', () => {
  it('posts mode:setPriority with the tier text', async () => {
    await setPriority([5], 'קריטי');
    expect(calls[0]).toMatchObject({ mode: 'setPriority', numbers: [5], priority: 'קריטי' });
  });
});

describe('releaseReview', () => {
  it('sends only the review-stage cards, to Committed', async () => {
    const cards: DevCard[] = [
      { number: 1, title: 'a', status: 'In Review' } as DevCard,
      { number: 2, title: 'b', status: 'In Progress' } as DevCard,
      { number: 3, title: 'c', status: 'In Review' } as DevCard,
    ];
    await releaseReview(cards);
    expect(calls[0]).toMatchObject({ mode: 'setStatus', numbers: [1, 3], status: 'Committed' });
  });

  it('no review cards → no call', async () => {
    await releaseReview([{ number: 1, title: 'a', status: 'Backlog' } as DevCard]);
    expect(calls.length).toBe(0);
  });
});

describe('STAGE_TARGET', () => {
  it('is the DEV_STAGE_TARGET port', () => {
    expect(STAGE_TARGET).toEqual({
      fields: 'Main Fields', backlog: 'Backlog', scope: 'Scope Refinement',
      ready: 'Sprint Ready', prog: 'In Progress', review: 'In Review', committed: 'Committed',
    });
  });
});

describe('canSeeDevBoard', () => {
  // audit fix: this must NOT re-implement the מתניה/אליה/admin rule — it is a pure forward to
  // canShowPage('dev'), the ONE source of truth (00-bridge.js canShowPage), so the two can never
  // drift apart the way a second hardcoded copy would.
  it('delegates to canShowPage(\'dev\') and nothing else', () => {
    pageGate.dev = true;
    expect(canSeeDevBoard()).toBe(true);
    pageGate.dev = false;
    expect(canSeeDevBoard()).toBe(false);
  });
});

// D-U review round 2 (Opus): the write gate is the SAME roster the server's own gate.js
// enforces (supabase/functions/github/gate.js WRITERS) — pinned here so the two lists can
// never drift apart silently.
describe('canWriteGithub / canDragOrMove — the github WRITERS roster', () => {
  it('עידן, עמיחי, מתניה — matches supabase/functions/github/gate.js WRITERS', () => {
    expect(canWriteGithub('עידן')).toBe(true);
    expect(canWriteGithub('עמיחי')).toBe(true);
    expect(canWriteGithub('מתניה')).toBe(true);
    expect(canWriteGithub('אביאם')).toBe(false);
    expect(canWriteGithub('צפייה')).toBe(false);
    expect(canWriteGithub(null)).toBe(false);
    expect(canWriteGithub(undefined)).toBe(false);
    expect(canWriteGithub('  עידן  ')).toBe(true);
  });

  it('canDragOrMove is the same gate, not a second copy', () => {
    expect(canDragOrMove('עידן')).toBe(true);
    expect(canDragOrMove('עמיחי')).toBe(true);
    expect(canDragOrMove('מתניה')).toBe(true);
    expect(canDragOrMove('אביאם')).toBe(false);
  });
});
