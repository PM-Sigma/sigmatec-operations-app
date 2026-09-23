// TEMPORARY (D-L4) — pins the React ports against the legacy js/src/18-dev-tasks.js they replace,
// over the shared fixture, so nothing drifts before the legacy file is deleted (D-U3, which also
// deletes this test). Same eval harness as test-devboard.mjs:66-86.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import board from './__fixtures__/github_board.json';
import { stageOf } from './sprintPrep';
import { devFlowSegments } from './devFlow';

const DEV_SRC = readFileSync(fileURLToPath(new URL('../../../js/src/18-dev-tasks.js', import.meta.url)), 'utf8');

function legacy() {
  const store: Record<string, string> = {};
  const win: any = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const doc: any = { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', 'console',
    '(function(){' + DEV_SRC + '\n})();')(
    win, doc,
    { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); }, removeItem: (k: string) => { delete store[k]; } },
    () => 0, () => 0, () => {}, console);
  return win;
}

const win = legacy();

describe('stageOf parity', () => {
  it('matches the legacy devStage for every fixture card', () => {
    for (const c of board as any[]) {
      expect(stageOf(c)).toBe(win.devStage(c));
    }
  });
});

describe('devFlowSegments parity', () => {
  it('matches the legacy devFlowSegments (same keys, counts, percentages) over the fixture', () => {
    const mine = devFlowSegments(board as any).map(s => ({ key: s.key, n: s.count, pct: s.pct }));
    const legacySegs = (win.devFlowSegments(board as any) as any[]).map(s => ({ key: s.key, n: s.n, pct: s.pct }));
    expect(mine).toEqual(legacySegs);
  });
});
