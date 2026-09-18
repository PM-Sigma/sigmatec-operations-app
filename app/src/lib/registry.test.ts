import { describe, it, expect, beforeEach } from 'vitest';
import { registerMoreItem, listMoreItems, _resetRegistry } from './registry';

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
