import { describe, expect, it } from 'vitest';
import {
  INVENTORY_BREAKPOINT_AT, equipmentDelta, qtyMap, visitEditLocked,
  visitToChapters,
} from './visitEdit';
import { VISIT_REASONS } from './field';

describe('INVENTORY_BREAKPOINT_AT', () => {
  it('the constant matches the js/src/00-consts.js mirror literal', () =>
    expect(INVENTORY_BREAKPOINT_AT).toBe('2026-09-23T14:05:47.625Z'));
});

describe('visitEditLocked (the general round-5 edit lock, unaffected by the breakpoint)', () => {
  it('L1 August 2026 is always locked', () => expect(visitEditLocked({ date: '2026-08-15' }, '2026-09-23')).toBe(true));
  it('L2 a September visit is editable now, archived or not', () => {
    expect(visitEditLocked({ date: '2026-09-05' }, '2026-09-23')).toBe(false);   // archived, still editable
    expect(visitEditLocked({ date: '2026-09-24' }, '2026-09-23')).toBe(false);   // live, editable
  });
  it('L3 a September visit locks the day after its 10.10 deadline', () =>
    expect(visitEditLocked({ date: '2026-09-05' }, '2026-10-11')).toBe(true));
});

describe('equipmentDelta (priorSnap.products is ALWAYS the old-quantity source, archived or not)', () => {
  it('D1 a normal (live) edit: delta is new - old', () => {
    expect(equipmentDelta(qtyMap([{ name: 'E360', qty: 2 }]), [{ name: 'E360', qty: 5 }]))
      .toEqual([{ product: 'E360', delta: 3 }]);
  });
  it('D2 the bug this replaces: an archive/movements diff nets to 0 for real pre-breakpoint data (personal ' +
    'bag → kibbutz, never from חברה), so "old" from the archive is wrongly {} and the whole new quantity is ' +
    'double-posted. priorSnap.products (here: {E360: 2}, the visit\'s own filed row, untouched by the archival) ' +
    'is used unconditionally instead and gives the correct, non-doubling delta — same result, edited once or twice.', () => {
    const wrongOld: Record<string, number> = {};                 // what a from/to-location archive diff wrongly gives
    const priorSnapProducts = { E360: 2 };                        // the visit's own filed row — always correct
    const newProducts = [{ name: 'E360', qty: 5 }];
    expect(equipmentDelta(wrongOld, newProducts)).toEqual([{ product: 'E360', delta: 5 }]);         // the bug
    expect(equipmentDelta(priorSnapProducts, newProducts)).toEqual([{ product: 'E360', delta: 3 }]); // the fix
    // a second edit of the same (now-updated) visit moves only the new delta, never re-posts the first one
    expect(equipmentDelta(qtyMap(newProducts), [{ name: 'E360', qty: 5 }])).toEqual([]);
  });
  it('D3 a product dropped entirely → a negative delta (a return)', () => {
    expect(equipmentDelta({ 'מונה': 2, כבל: 1 }, [{ name: 'מונה', qty: 2 }]))
      .toEqual([{ product: 'כבל', delta: -1 }]);
  });
  it('D4 a brand-new visit has no old row: everything is a fresh addition', () => {
    expect(equipmentDelta({}, [{ name: 'E360', qty: 3 }])).toEqual([{ product: 'E360', delta: 3 }]);
  });
  it('D5 no change → no delta at all', () => {
    expect(equipmentDelta({ E360: 2 }, [{ name: 'E360', qty: 2 }])).toEqual([]);
  });
  it('D6 string products count as qty 1 (legacy shape)', () => {
    expect(equipmentDelta({}, ['מונה'])).toEqual([{ product: 'מונה', delta: 1 }]);
  });
});

describe('visitToChapters', () => {
  it('maps a filed visit onto the sheet draft', () => {
    const d = visitToChapters({
      id: 'v1', kibbutz: 'חוקוק', date: '2026-09-10T09:00:00.000Z', visitor: 'אביאם, ניתאי', duration: 8, workday: true,
      contact: 'רוני', products: [{ name: 'מונה', qty: 2 }, 'כבל'] as any, productsOther: 'ברגים',
      summary: 'הוחלף', openItems: 'תקשורת', reason: VISIT_REASONS[0].label, emsTaskId: 't1',
    } as any, [{ visitId: 'v1', product: 'מונה ישן', qty: 1 }, { visitId: 'v2', product: 'x', qty: 1 }], VISIT_REASONS);
    expect(d).toMatchObject({
      kibbutz: 'חוקוק', date: '2026-09-10', visitor: 'אביאם, ניתאי', visitors: ['אביאם', 'ניתאי'], workday: true, duration: '',
      contact: 'רוני', products: [{ name: 'מונה', qty: 2 }, { name: 'כבל', qty: 1 }], productsOther: 'ברגים',
      summary: 'הוחלף', openItems: 'תקשורת', reasonId: VISIT_REASONS[0].id, emsTaskIds: ['t1'],
      returned: [{ name: 'מונה ישן', qty: 1 }],
    });
  });
  it('an unknown reason text becomes אחר + its text', () => {
    const d = visitToChapters({ id: 'v1', kibbutz: 'k', date: '2026-09-10T09:00:00.000Z', visitor: 'x', reason: 'משהו' } as any, [], VISIT_REASONS);
    expect(d.reasonOther).toBe('משהו');
  });
});
