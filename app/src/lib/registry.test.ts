import { describe, it, expect, beforeEach } from 'vitest';
import { registerMoreItem, listMoreItems, _resetRegistry, itemBadge } from '@/lib/registry';

const item = (id: string, roles?: Array<'idan' | 'team' | 'viewer'>) => ({
  id, label: id, icon: 'Star' as const, onSelect: () => {}, roles,
});

describe('navMoreItems registry', () => {
  beforeEach(() => _resetRegistry());

  it('registers items and lists them in registration order', () => {
    registerMoreItem(item('a'));
    registerMoreItem(item('b'));
    expect(listMoreItems('team').map(i => i.id)).toEqual(['a', 'b']);
  });

  it('re-registering the same id replaces it instead of duplicating', () => {
    registerMoreItem(item('a'));
    registerMoreItem({ ...item('a'), label: 'updated' });
    const items = listMoreItems('team');
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('updated');
  });

  it('an item without roles is visible to every role', () => {
    registerMoreItem(item('open'));
    expect(listMoreItems('viewer').map(i => i.id)).toEqual(['open']);
    expect(listMoreItems('idan').map(i => i.id)).toEqual(['open']);
  });

  it('excludes items whose roles do not include the viewer role', () => {
    registerMoreItem(item('write', ['idan', 'team']));
    registerMoreItem(item('reports', ['viewer', 'idan']));
    expect(listMoreItems('viewer').map(i => i.id)).toEqual(['reports']);
    expect(listMoreItems('idan').map(i => i.id)).toEqual(['write', 'reports']);
    expect(listMoreItems('team').map(i => i.id)).toEqual(['write']);
  });
});

describe('navMoreItems visible() predicate', () => {
  beforeEach(() => _resetRegistry());

  it('is asked on every listing, so a permission change is never stale', () => {
    // The import entry's real gate is `sigma.isAdmin() && !sigma.isViewer()`. It was
    // evaluated ONCE at mount before this, so changeUser() left it wrong until a reload.
    let admin = false;
    registerMoreItem({ ...item('import'), visible: () => admin });
    expect(listMoreItems('idan')).toHaveLength(0);
    admin = true;
    expect(listMoreItems('idan').map(i => i.id)).toEqual(['import']);
    admin = false;
    expect(listMoreItems('idan')).toHaveLength(0);
  });

  it('roles AND visible must both pass', () => {
    registerMoreItem({ ...item('a', ['idan']), visible: () => true });
    expect(listMoreItems('idan').map(i => i.id)).toEqual(['a']);
    expect(listMoreItems('team')).toHaveLength(0);       // role rejects
  });

  it('an item with no predicate is unaffected', () => {
    registerMoreItem(item('plain'));
    expect(listMoreItems('viewer').map(i => i.id)).toEqual(['plain']);
  });

  it('a throwing predicate hides that item instead of breaking the sheet', () => {
    registerMoreItem({ ...item('boom'), visible: () => { throw new Error('bridge missing'); } });
    registerMoreItem(item('fine'));
    expect(listMoreItems('idan').map(i => i.id)).toEqual(['fine']);
  });
});

describe('⋯ sheet grouping and attention badges (§7k #3)', () => {
  beforeEach(() => _resetRegistry());

  it('itemBadge is 0 for a row with no badge', () => {
    expect(itemBadge({ id: 'a', label: 'a', icon: 'Home', onSelect: () => {} })).toBe(0);
  });

  it('a positive count shows; zero and negative do not (a badge means "act on this")', () => {
    const b = (n: number) => itemBadge({ id: 'a', label: 'a', icon: 'Home', onSelect: () => {}, badge: () => n });
    expect(b(3)).toBe(3);
    expect(b(0)).toBe(0);
    expect(b(-2)).toBe(0);
  });

  it('a fractional count is floored — a nav badge is a whole number of things to do', () => {
    expect(itemBadge({ id: 'a', label: 'a', icon: 'Home', onSelect: () => {}, badge: () => 2.7 })).toBe(2);
  });

  it('a throwing or non-numeric badge hides the badge instead of the row', () => {
    expect(itemBadge({ id: 'a', label: 'a', icon: 'Home', onSelect: () => {}, badge: () => { throw new Error('x'); } })).toBe(0);
    expect(itemBadge({ id: 'a', label: 'a', icon: 'Home', onSelect: () => {}, badge: (() => 'many') as any })).toBe(0);
  });

  it('the group travels with the item so the sheet can split app rows from ניהול rows', () => {
    registerMoreItem({ id: 'imp', label: 'ייבוא', icon: 'Download', group: 'admin', onSelect: () => {} });
    registerMoreItem({ id: 'set', label: 'הגדרות', icon: 'Settings', group: 'app', onSelect: () => {} });
    const items = listMoreItems('idan');
    expect(items.find(i => i.id === 'imp')?.group).toBe('admin');
    expect(items.find(i => i.id === 'set')?.group).toBe('app');
  });

  // round 5 G-L6: the ⋯ "יומן היום" row carries a "ניסיוני" tag; S renders it in MoreSheet.
  it('an item may carry a tag, which travels through the list untouched', () => {
    registerMoreItem({ id: 't', label: 'x', icon: 'Notebook', onSelect: () => {}, tag: 'ניסיוני' });
    expect(listMoreItems('team').find(i => i.id === 't')!.tag).toBe('ניסיוני');
  });

  it('an item with no tag simply has none', () => {
    registerMoreItem(item('untagged'));
    expect(listMoreItems('team').find(i => i.id === 'untagged')!.tag).toBeUndefined();
  });
});
