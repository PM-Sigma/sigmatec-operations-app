import { describe, expect, it } from 'vitest';
import {
  INVENTORY_BREAKPOINT_AT, equipmentDelta, equipmentDeltaSource, isArchivedVisit, qtyMap, visitEditLocked,
  visitToChapters,
} from './visitEdit';
import { VISIT_REASONS } from './field';

describe('INVENTORY_BREAKPOINT_AT', () => {
  it('the constant matches the js/src/00-consts.js mirror literal', () =>
    expect(INVENTORY_BREAKPOINT_AT).toBe('2026-09-23T14:05:47.625Z'));
});

describe('isArchivedVisit (round 5, replaces "equipment locked before the breakpoint")', () => {
  it('A1 dated before 23.9 → archived (its original supply is in archive.movements_pre_breakpoint)', () =>
    expect(isArchivedVisit({ date: '2026-09-22T09:00:00.000Z' })).toBe(true));
  it('A2 dated 23.9, filed before T → archived', () =>
    expect(isArchivedVisit({ date: '2026-09-23T09:00:00.000Z', createdAt: '2026-09-23T10:00:00.000Z' })).toBe(true));
  it('A3 dated 23.9, filed after T → not archived (live ledger has it)', () =>
    expect(isArchivedVisit({ date: '2026-09-23T09:00:00.000Z', createdAt: '2026-09-23T15:00:00.000Z' })).toBe(false));
  it('A4 dated after → not archived', () => expect(isArchivedVisit({ date: '2026-09-24T09:00:00.000Z' })).toBe(false));
  it('A5 equipmentDeltaSource follows isArchivedVisit', () => {
    expect(equipmentDeltaSource({ date: '2026-09-10T09:00:00.000Z' })).toBe('archive');
    expect(equipmentDeltaSource({ date: '2026-09-24T09:00:00.000Z' })).toBe('live');
  });
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

describe('equipmentDelta (no double-deduct against the archived/opening-balance ledger)', () => {
  it('D1 a normal (live) edit: delta is new - old', () => {
    expect(equipmentDelta(qtyMap([{ name: 'E360', qty: 2 }]), [{ name: 'E360', qty: 5 }]))
      .toEqual([{ product: 'E360', delta: 3 }]);
  });
  it('D2 the bug this replaces: sourcing "old" from live movements (which archived it) would return {} for an ' +
    'archived visit, double-posting the whole new quantity. Sourcing it from archive_visit_products() instead ' +
    '(here: the same {E360: 2} the visit originally filed) gives the correct, non-doubling delta.', () => {
    const wrongOld: Record<string, number> = {};                 // what a live-movements-by-ref_id lookup would give
    const archiveOld = { E360: 2 };                               // what archive_visit_products() actually gives
    const newProducts = [{ name: 'E360', qty: 5 }];
    expect(equipmentDelta(wrongOld, newProducts)).toEqual([{ product: 'E360', delta: 5 }]);   // the bug
    expect(equipmentDelta(archiveOld, newProducts)).toEqual([{ product: 'E360', delta: 3 }]); // the fix
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
