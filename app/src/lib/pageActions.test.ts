import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/runAdd', () => ({ runAdd: vi.fn() }));
import { _resetPageActions, pageActionsFor, registerPageAction } from '@/lib/pageActions';

const a = (id: string, extra: Partial<Parameters<typeof registerPageAction>[1]> = {}) =>
  ({ id, label: id, icon: 'Plus', onSelect: () => {}, ...extra });

beforeEach(() => _resetPageActions());

describe('pageActionsFor', () => {
  it('inventory: the primary add first, primary-marked', () => {
    const r = pageActionsFor('inventory', 'pm');
    expect(r.shown.map(x => [x.id, x.label, x.primary])).toEqual([['add:stockChange', 'דיווח מלאי', true]]);
  });
  it('kibbutz for someone who cannot manage kibbutzim: nothing', () => {
    expect(pageActionsFor('kibbutz', 'field', { canManageKibbutzim: false }).shown).toEqual([]);
  });
  it('viewer: feedback on every page', () => {
    expect(pageActionsFor('calendar', 'viewer').shown.map(x => x.id)).toEqual(['add:feedback']);
  });
  it('at most two shown, the rest overflow', () => {
    registerPageAction('inventory', a('x1'));
    registerPageAction('inventory', a('x2'));
    const r = pageActionsFor('inventory', 'pm');
    expect(r.shown.map(x => x.id)).toEqual(['add:stockChange', 'x1']);
    expect(r.overflow.map(x => x.id)).toEqual(['x2']);
  });
  it('re-registering replaces, a throwing visible hides', () => {
    registerPageAction('dev', a('d1', { label: 'old' }));
    registerPageAction('dev', a('d1', { label: 'new' }));
    registerPageAction('dev', a('d2', { visible: () => { throw new Error('x'); } }));
    expect(pageActionsFor('dev', 'dev').shown.map(x => x.label)).toEqual(['new']);
  });
});
