// Goldens for D-L2: grouping by parent domain → priority, filters, "new this week".
// All cases run over the ONE shared fixture (github_board.json, D-L1) so a rule change shows up
// as a diff in a named expectation.
import { describe, expect, it } from 'vitest';
import board from './__fixtures__/github_board.json';
import { stageOf } from './sprintPrep';
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
it('#40 (no priority text, no labels) is tier none inside "ללא אפיון"', () => {
  const none = groupByDomain(board as any).find(d => d.domain === null)!;
  const c40 = (board as any[]).find(x => x.number === 40);
  expect(none.tiers).toEqual([{ tier: 'none', cards: [c40] }]);
});

// audit fix: "ללא אפיון" must sort last ALWAYS, not only as an equal-count tiebreak.
it('the no-parent group sorts last even when it is the LARGEST', () => {
  const cards = [
    { number: 1, title: 'a', status: 'Backlog', parentChain: [] },
    { number: 2, title: 'b', status: 'Backlog', parentChain: [] },
    { number: 3, title: 'c', status: 'Backlog', parentChain: [] },
    { number: 4, title: 'd', status: 'Backlog', parentChain: [{ number: 9, title: 'תחום', state: 'OPEN' }] },
  ] as any;
  const g = groupByDomain(cards);
  expect(g.map(d => d.domain?.title ?? 'ללא אפיון')).toEqual(['תחום', 'ללא אפיון']);
  expect(g.map(d => d.count)).toEqual([1, 3]);
});

// audit fix: a card with `parent` but no `parentChain` (the function-not-yet-redeployed / old
// client shape) resolves its domain through the fallback path — `parent` looked up in the list.
it('a card with parent but no parentChain resolves the domain via the fallback path', () => {
  const cards = [
    { number: 9, title: 'תחום', status: 'Main Fields' },
    { number: 5, title: 'child', status: 'Backlog', parent: 9 },
  ] as any;
  const g = groupByDomain(cards);
  expect(g).toEqual([{ domain: { number: 9, title: 'תחום' }, count: 1, tiers: [{ tier: 'none', cards: [cards[1]] }] }]);
});
