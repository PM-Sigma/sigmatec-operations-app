// @vitest-environment jsdom
// Ctrl+K ranking (spec §7k.1): "exact prefix > word prefix > fuzzy; recent items first;
// role-filtered". A command bar whose order cannot be predicted is worse than no command bar,
// so the tiers are pinned here rather than tuned by feel.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  groupCommands, parseQuery, pushRecent, rankCommands, rankedRows, readRecents,
  RECENTS_KEY, scoreCommand, topCommand, withRecent, type Command,
} from '@/lib/commands';

const cmd = (id: string, label: string, over: Partial<Command> = {}): Command =>
  ({ id, label, kind: 'kibbutz', run: () => {}, ...over });

describe('parseQuery — the typed prefixes', () => {
  it('> limits to actions, # to tasks, @ to people', () => {
    expect(parseQuery('>קיבוץ')).toEqual({ kinds: ['action'], text: 'קיבוץ' });
    expect(parseQuery('#שעון')).toEqual({ kinds: ['task'], text: 'שעון' });
    expect(parseQuery('@עידן')).toEqual({ kinds: ['person'], text: 'עידן' });
  });
  it('a bare query searches everything, trimmed', () => {
    expect(parseQuery('  גבת ')).toEqual({ kinds: null, text: 'גבת' });
  });
  it('a lone prefix lists that kind with no filter', () => {
    expect(parseQuery('>')).toEqual({ kinds: ['action'], text: '' });
  });
});

describe('scoreCommand — the three tiers', () => {
  it('an exact prefix beats a word prefix beats fuzzy', () => {
    const exact = scoreCommand(cmd('a', 'גבת'), 'גב');
    const word = scoreCommand(cmd('b', 'קיבוץ גבת'), 'גב');
    const fuzzy = scoreCommand(cmd('c', 'גלעד בית'), 'גב');
    expect(exact).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(fuzzy);
    expect(fuzzy).toBeGreaterThan(0);
  });

  it('keywords match below the label but above fuzzy', () => {
    const byKeyword = scoreCommand(cmd('a', 'שדה אליהו', { keywords: 'עמק המעיינות' }), 'עמק');
    const byFuzzy = scoreCommand(cmd('b', 'עין המ.ק'), 'עמק');
    expect(byKeyword).toBeGreaterThan(byFuzzy);
  });

  it('no match is 0, and an empty query matches everything', () => {
    expect(scoreCommand(cmd('a', 'גבת'), 'zzz')).toBe(0);
    expect(scoreCommand(cmd('a', 'גבת'), '')).toBeGreaterThan(0);
  });

  it('matching ignores case (the app mixes Hebrew labels with English task titles)', () => {
    expect(scoreCommand(cmd('a', 'Satec EM133'), 'satec')).toBe(4);
  });
});

describe('rankCommands', () => {
  beforeEach(() => localStorage.clear());

  it('orders by tier', () => {
    const list = [cmd('c', 'גלעד בית'), cmd('b', 'קיבוץ גבת'), cmd('a', 'גבת')];
    expect(rankCommands(list, 'גב').map(c => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('a recent item wins inside its tier, and never across tiers', () => {
    const list = [cmd('a', 'גבת'), cmd('b', 'גבעת חיים')];
    // same tier (both exact prefix) → the recent one first
    expect(rankCommands(list, 'גב', { recents: ['b'] }).map(c => c.id)).toEqual(['b', 'a']);
    // being recent does NOT promote a fuzzy match above an exact one
    const mixed = [cmd('a', 'גבת'), cmd('z', 'גלעד בית')];
    expect(rankCommands(mixed, 'גב', { recents: ['z'] }).map(c => c.id)).toEqual(['a', 'z']);
  });

  it('is stable — a tie keeps the source order between keystrokes', () => {
    const list = [cmd('a', 'גבת א'), cmd('b', 'גבת ב'), cmd('c', 'גבת ג')];
    expect(rankCommands(list, 'גבת').map(c => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters by role — the bar can never offer what the person may not do', () => {
    const list = [cmd('open', 'פתוח'), cmd('adm', 'ניהול', { roles: ['pm'] })];
    expect(rankCommands(list, '', { role: 'field' }).map(c => c.id)).toEqual(['open']);
    expect(rankCommands(list, '', { role: 'pm' }).map(c => c.id)).toEqual(['open', 'adm']);
  });

  it('honours the typed prefix', () => {
    const list = [cmd('k', 'גבת'), cmd('a', 'גבת — פעולה', { kind: 'action' })];
    expect(rankCommands(list, '>גבת').map(c => c.id)).toEqual(['a']);
    expect(rankCommands(list, '#גבת')).toEqual([]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 80 }, (_, i) => cmd('k' + i, 'קיבוץ ' + i));
    expect(rankCommands(many, 'קיבוץ').length).toBe(40);
    expect(rankCommands(many, 'קיבוץ', { limit: 5 }).length).toBe(5);
  });

  it('empty / missing input is safe', () => {
    expect(rankCommands([], 'x')).toEqual([]);
    expect(rankCommands(null as any, 'x')).toEqual([]);
  });
});

describe('recents', () => {
  beforeEach(() => localStorage.clear());

  it('newest first, de-duplicated, capped at 8', () => {
    let r: string[] = [];
    for (const id of ['a', 'b', 'c']) r = withRecent(r, id);
    expect(r).toEqual(['c', 'b', 'a']);
    expect(withRecent(r, 'a')).toEqual(['a', 'c', 'b']);
    const many = Array.from({ length: 12 }, (_, i) => 'x' + i).reduce(withRecent, [] as string[]);
    expect(many.length).toBe(8);
  });

  it('round-trips through localStorage', () => {
    pushRecent('kibbutz:גבת');
    expect(readRecents()).toEqual(['kibbutz:גבת']);
  });

  it('a corrupt store reads as empty instead of throwing', () => {
    localStorage.setItem(RECENTS_KEY, '{nope');
    expect(readRecents()).toEqual([]);
  });
});

describe('groupCommands', () => {
  it('actions come first, and empty groups are dropped', () => {
    const ranked = [cmd('k', 'גבת'), cmd('a', 'פעולה', { kind: 'action' }), cmd('p', 'מלאי', { kind: 'page' })];
    expect(groupCommands(ranked).map(g => g.kind)).toEqual(['action', 'kibbutz', 'page']);
  });

  it('keeps each group in its ranked order', () => {
    const ranked = [cmd('k1', 'א'), cmd('k2', 'ב')];
    expect(groupCommands(ranked)[0].items.map(c => c.id)).toEqual(['k1', 'k2']);
  });
});

describe('rankedRows — Enter must run the TOP-RANKED item (review fix 4)', () => {
  it('the first row is the top-ranked command, whatever kind it is', () => {
    // A kibbutz outranks an action here (exact prefix vs. fuzzy), and grouping used to put the
    // action first in the DOM — so cmdk selected it and Enter ran the wrong thing.
    const list = [cmd('act', 'הוסף גיבוי', { kind: 'action' }), cmd('kib', 'גבת')];
    const ranked = rankCommands(list, 'גבת');
    expect(ranked[0].id).toBe('kib');
    expect(rankedRows(ranked)[0].cmd.id).toBe('kib');
  });

  it('keeps the ranked order EXACTLY — one row in, one row out', () => {
    const ranked = [cmd('k1', 'גבת'), cmd('a1', 'פעולה', { kind: 'action' }), cmd('k2', 'גבים')];
    expect(rankedRows(ranked).map(r => r.cmd.id)).toEqual(['k1', 'a1', 'k2']);
  });

  it('labels the row that OPENS each run of a kind, and only that one', () => {
    const ranked = [cmd('k1', 'א'), cmd('k2', 'ב'), cmd('a1', 'ג', { kind: 'action' }), cmd('p1', 'ד', { kind: 'page' })];
    expect(rankedRows(ranked).map(r => r.startsKind)).toEqual([true, false, true, true]);
  });

  it('an interleaved ranking re-labels the run rather than reordering it', () => {
    // This is the real case: an exact-prefix kibbutz, a task matched on its site, then a fuzzy
    // kibbutz. The order is the ranking's; the labels follow it.
    const ranked = [cmd('k1', 'גבת'), cmd('t1', 'x', { kind: 'task' }), cmd('k2', 'גבעת חיים')];
    expect(rankedRows(ranked).map(r => (r.startsKind ? 'L:' : '') + r.cmd.id)).toEqual(['L:k1', 'L:t1', 'L:k2']);
  });

  it('every row has a stable unique key (React would otherwise re-mount rows as you type)', () => {
    const keys = rankedRows([cmd('k1', 'a'), cmd('a1', 'b', { kind: 'action' })]).map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('empty input is an empty list', () => {
    expect(rankedRows([])).toEqual([]);
    expect(rankedRows(null)).toEqual([]);
  });

  it('topCommand is the head of the ranked list', () => {
    const ranked = rankCommands([cmd('a', 'גבת'), cmd('b', 'גבים')], 'גבת');
    expect(topCommand(ranked)?.id).toBe('a');
    expect(topCommand([])).toBe(null);
  });
});
