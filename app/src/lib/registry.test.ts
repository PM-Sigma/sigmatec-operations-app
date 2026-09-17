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
