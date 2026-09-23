// 🔔 goldens for the alerts half of the inventory spec (§5, §7 "Digest: digestWindow, digestBody,
// the hour gate and the idempotency tag"). Israel is UTC+3 in September, UTC+2 in January —
// both are exercised, because the digest windows are the one thing DST can silently break.
import { describe, expect, it } from 'vitest';
import { alertArrow, alertText, alertTarget, canSeeAlerts, canSeeEmsUnlinkedAlert, digestBody, digestTag, digestTitle, digestWindow, emsUnlinkedGroup, israelClock, isSeen, lowStockRows, lowStockTag, unseenCount, type AlertRow, groupAlerts, markRowsSeen, unmarkRowsSeen, POOL, visitSupplyVisibleTo } from './alerts';

const mov = (o: Partial<AlertRow> = {}): AlertRow => ({
  id: 'a1', kind: 'movement', product: 'מונה E360CT', qty: 3,
  from_location: 'חברה', to_location: 'גבים', reason: 'visit_supply', ref_id: 'vis-9',
  actor: 'אביאם', created_at: '2026-09-19T11:02:00Z', seen_by: [], ...o,
});

describe('alertText (§5.1)', () => {
  it('a supply out of the pool reads as the spec writes it', () => {
    expect(alertText(mov())).toBe('↘ 3 × מונה E360CT · חברה → גבים · אביאם · 14:02 · סיכום ביקור');
  });

  it('a delivery into the pool points the other way', () => {
    expect(alertText(mov({ from_location: 'ספק', to_location: 'חברה', qty: 20, product: 'בקר 504', reason: 'order_delivery', actor: 'עמיחי' })))
      .toBe('↗ 20 × בקר 504 · ספק → חברה · עמיחי · 14:02 · קבלת הזמנה');
  });

  it('a low-stock row says the shortage and nothing else', () => {
    expect(alertText({ kind: 'low_stock', product: 'סים 1NCE', qty: 4, created_at: '2026-09-19T11:02:00Z' }))
      .toBe('⚠️ מלאי נמוך: סים 1NCE · 4 יח׳ · 14:02');
  });

  it('a movement between two kibbutzim has no arrow into or out of the pool', () => {
    expect(alertArrow(mov({ from_location: 'גבים', to_location: 'יגור' }))).toBe('•');
  });

  it('clock is Israel local across DST', () => {
    expect(israelClock('2026-09-19T11:02:00Z')).toBe('14:02');   // UTC+3
    expect(israelClock('2026-01-19T11:02:00Z')).toBe('13:02');   // UTC+2
  });
});

describe('alertTarget (§5.1 tap → the source)', () => {
  it('a visit supply opens the visit', () => expect(alertTarget(mov())).toEqual({ kind: 'visit', id: 'vis-9' }));
  it('a delivery opens the order', () =>
    expect(alertTarget(mov({ reason: 'order_delivery', ref_id: 'ord-3' }))).toEqual({ kind: 'order', id: 'ord-3' }));
  it('a recount opens the count', () =>
    expect(alertTarget(mov({ reason: 'recount', ref_id: 'rc-1' }))).toEqual({ kind: 'recount', id: 'rc-1' }));
  it('anything without a ref falls back to the product', () =>
    expect(alertTarget(mov({ reason: 'pool_migration', ref_id: '' }))).toEqual({ kind: 'product', id: 'מונה E360CT' }));
});

describe('seen + who gets a bell', () => {
  const rows = [mov({ id: 'a1', seen_by: ['עמיחי'] }), mov({ id: 'a2', seen_by: [] }), mov({ id: 'a3', seen_by: null })];
  it('counts what this person has not marked', () => {
    expect(unseenCount(rows, 'עמיחי')).toBe(2);
    expect(unseenCount(rows, 'אביאם')).toBe(3);
  });
  it('isSeen is per person', () => {
    expect(isSeen(rows[0], 'עמיחי')).toBe(true);
    expect(isSeen(rows[0], 'עידן')).toBe(false);
  });
  it('the four inventory actors have a bell, the viewer does not', () => {
    for (const p of ['עידן', 'עמיחי', 'אביאם', 'ניתאי']) expect(canSeeAlerts(p, false)).toBe(true);
    expect(canSeeAlerts('עידן', true)).toBe(false);
    expect(canSeeAlerts('מתניה', false)).toBe(false);
  });
});

// ───────────── X-L4: visit-summary rows in the bell go only to מי ביקר ─────────────
describe('visitSupplyVisibleTo (grill round 4, open question 2 — default: literal)', () => {
  const row = mov({ id: 'v1a', ref_id: 'v1', reason: 'visit_supply' });
  it('visible to a visitor of v1, hidden from everyone else — עמיחי included', () => {
    const visitorsByVisit = { v1: ['אביאם'] };
    expect(visitSupplyVisibleTo(row, 'אביאם', visitorsByVisit)).toBe(true);
    expect(visitSupplyVisibleTo(row, 'עידן', visitorsByVisit)).toBe(false);
    expect(visitSupplyVisibleTo(row, 'עמיחי', visitorsByVisit)).toBe(false);
  });
  it('a min_qty / recount row is visible to everyone, as before', () => {
    const recount = mov({ reason: 'recount', ref_id: 'rc-1' });
    const low = { kind: 'low_stock', product: 'x', qty: 1 } as AlertRow;
    for (const p of ['עידן', 'עמיחי', 'אביאם', 'ניתאי']) {
      expect(visitSupplyVisibleTo(recount, p, {})).toBe(true);
      expect(visitSupplyVisibleTo(low, p, {})).toBe(true);
    }
  });
});

describe('groupAlerts (22.9, G1 — one visit = one line)', () => {
  const t = (mm: string) => `2026-09-22T${mm}:00.000Z`;   // 14:02 Israel = 11:02Z in September
  const move = (o: Partial<AlertRow>): AlertRow => ({
    kind: 'movement', product: 'x', qty: 1, from_location: POOL, to_location: 'גבים', reason: 'visit_supply',
    ref_id: 'v1', actor: 'אביאם', created_at: t('11:02'), seen_by: [], ...o,
  });
  it('rows of one visit collapse to one group whose title counts them', () => {
    const rows = [move({ id: 'a', product: 'מונה E360CT', qty: 3 }), move({ id: 'b', product: 'סים 1NCE', qty: 2, created_at: t('11:03') })];
    const g = groupAlerts(rows, 'עידן');
    expect(g).toHaveLength(1);
    expect(g[0].rows.map(r => r.id)).toEqual(['b', 'a']);            // newest first inside
    expect(g[0].title).toBe('↘ סיכום ביקור גבים · 2 פריטים · אביאם · 14:03');
    expect(g[0].seen).toBe(false);
  });
  it('a lone row keeps its own line; a different visit or day is another group; newest group first', () => {
    const rows = [
      move({ id: 'a' }),
      move({ id: 'b', ref_id: 'v2', created_at: t('12:00') }),
      move({ id: 'c', created_at: '2026-09-21T11:02:00.000Z' }),
    ];
    const g = groupAlerts(rows, 'עידן');
    expect(g.map(x => x.rows[0].id)).toEqual(['b', 'a', 'c']);
    expect(g[1].title).toBe(alertText(rows[0]));
  });
  it('low-stock rows of a day are one line; seen = every row seen', () => {
    const rows: AlertRow[] = [
      { id: 'l1', kind: 'low_stock', product: 'סים', qty: 4, created_at: t('11:02'), seen_by: ['עידן'] },
      { id: 'l2', kind: 'low_stock', product: 'בקר', qty: 1, created_at: t('11:05'), seen_by: [] },
    ];
    const g = groupAlerts(rows, 'עידן');
    expect(g).toHaveLength(1);
    expect(g[0].title).toBe('⚠️ מלאי נמוך · 2 פריטים · 14:05');
    expect(g[0].seen).toBe(false);
    expect(groupAlerts(rows, 'עידן').every(x => x.seen)).toBe(false);
    rows[1].seen_by = ['עידן'];
    expect(groupAlerts(rows, 'עידן')[0].seen).toBe(true);
  });
});

describe('digestWindow (§5.2)', () => {
  it('12:00 Israel covers everything since yesterday 17:00', () => {
    const w = digestWindow('2026-09-19T09:03:00Z');   // 12:03 Israel
    expect(w).toBeTruthy();
    expect(w!.hh).toBe(12);
    expect(w!.from).toBe('2026-09-18T14:00:00.000Z');  // 17:00 Israel the day before
    expect(w!.tag).toBe('inv-digest-2026-09-19-12');
  });

  it('17:00 Israel covers everything since 12:00 today', () => {
    const w = digestWindow('2026-09-19T14:05:00Z');   // 17:05 Israel
    expect(w!.hh).toBe(17);
    expect(w!.from).toBe('2026-09-19T09:00:00.000Z');
    expect(w!.tag).toBe('inv-digest-2026-09-19-17');
  });

  it('winter time lands on the same local hours', () => {
    const w = digestWindow('2026-01-19T10:04:00Z');   // 12:04 Israel (UTC+2)
    expect(w!.hh).toBe(12);
    expect(w!.from).toBe('2026-01-18T15:00:00.000Z');
  });

  it('any other hour is not a digest hour', () => {
    expect(digestWindow('2026-09-19T08:59:00Z')).toBeNull();   // 11:59 Israel
    expect(digestWindow('2026-09-19T20:00:00Z')).toBeNull();
  });

  it('the tag is one per date per hour', () => expect(digestTag('2026-09-19', 12)).toBe('inv-digest-2026-09-19-12'));
});

describe('digestBody + title (§5.2)', () => {
  const rows: AlertRow[] = [
    mov({ kind: 'movement', product: 'בקר 504', qty: 20, from_location: 'ספק', to_location: 'חברה', reason: 'order_delivery', actor: 'עמיחי' }),
    mov({ kind: 'movement', product: 'מונה E360CT', qty: 3, from_location: 'חברה', to_location: 'גבים', reason: 'visit_supply', actor: 'אביאם' }),
    { kind: 'low_stock', product: 'סים 1NCE', qty: 4, created_at: '2026-09-19T11:02:00Z' },
  ];

  it('the golden body', () => {
    expect(digestBody(rows)).toBe(
      '↗ +20 בקר 504 (ספק → חברה, עמיחי, קבלת הזמנה)\n'
      + '↘ −3 מונה E360CT → גבים (אביאם, סיכום ביקור)\n'
      + 'מלאי נמוך: סים 1NCE 4 יח׳',
    );
  });

  it('the title counts movements only', () => expect(digestTitle(rows, 12)).toBe('📦 תנועות מלאי 12:00 · 2 תנועות'));

  it('a long window is cut, not dumped', () => {
    const many = Array.from({ length: 11 }, (_, i) => mov({ id: 'm' + i, qty: i + 1 }));
    const body = digestBody(many);
    expect(body.split('\n')).toHaveLength(9);
    expect(body.endsWith('+3 נוספות')).toBe(true);
  });

  it('an empty window has no body — the caller pushes nothing', () => expect(digestBody([])).toBe(''));
});

describe('lowStockRows (§5, decision I3)', () => {
  const products = [
    { name: 'סים 1NCE', min_qty: 15, active: true },
    { name: 'בקר 504', min_qty: null, active: true },
    { name: 'מונה E360CT', min_qty: 10, active: true },
    { name: 'מונה ישן', min_qty: 5, active: false },
  ];
  it('only products with a red line, worst breach first', () => {
    expect(lowStockRows({ 'סים 1NCE': 4, 'בקר 504': 0, 'מונה E360CT': 9, 'מונה ישן': 0 }, products))
      .toEqual([
        { product: 'סים 1NCE', qty: 4, min: 15 },
        { product: 'מונה E360CT', qty: 9, min: 10 },
      ]);
  });
  it('a product at its minimum is not low', () =>
    expect(lowStockRows({ 'מונה E360CT': 10 }, products).map(r => r.product)).toEqual(['סים 1NCE']));
  it('the per-product daily tag', () =>
    expect(lowStockTag('סים 1NCE', '2026-09-19')).toBe('inv-low-2026-09-19-סים 1NCE'));
});

describe('markRowsSeen / unmarkRowsSeen (round 3, Q)', () => {
  const rows: AlertRow[] = [
    mov({ id: 'a1', seen_by: [] }),
    mov({ id: 'a2', seen_by: ['עמיחי'] }),
    mov({ id: 'a3', seen_by: [] }),
  ];

  it('adds the reader to exactly the rows asked for, keeping the others', () => {
    const out = markRowsSeen(rows, ['a1', 'a2'], 'עידן');
    expect(out[0].seen_by).toEqual(['עידן']);
    expect(out[1].seen_by).toEqual(['עמיחי', 'עידן']);
    expect(out[2].seen_by).toEqual([]);
    expect(rows[0].seen_by).toEqual([]);           // the input is not mutated
  });

  it('never doubles a reader already there', () => {
    const once = markRowsSeen(rows, ['a1'], 'עידן');
    expect(markRowsSeen(once, ['a1'], 'עידן')[0].seen_by).toEqual(['עידן']);
  });

  it('undoing a failed write puts the row back, and only that reader', () => {
    const optimistic = markRowsSeen(rows, ['a1', 'a2'], 'עידן');
    const back = unmarkRowsSeen(optimistic, ['a1', 'a2'], 'עידן');
    expect(back[0].seen_by).toEqual([]);
    expect(back[1].seen_by).toEqual(['עמיחי']);
    expect(isSeen(back[0], 'עידן')).toBe(false);
  });
});

// ───────────── QA round 4 Package Y (22.9): אתרים לא מקושרים ל-EMS ─────────────

describe('canSeeEmsUnlinkedAlert', () => {
  it('עידן and עמיחי only — never אביאם/ניתאי, unlike the rest of the bell', () => {
    expect(canSeeEmsUnlinkedAlert('עידן')).toBe(true);
    expect(canSeeEmsUnlinkedAlert('עמיחי')).toBe(true);
    expect(canSeeEmsUnlinkedAlert('אביאם')).toBe(false);
    expect(canSeeEmsUnlinkedAlert('ניתאי')).toBe(false);
    expect(canSeeEmsUnlinkedAlert('')).toBe(false);
  });
});

describe('emsUnlinkedGroup', () => {
  it('no unlinked names → no group at all', () => {
    expect(emsUnlinkedGroup([])).toBe(null);
  });

  it('one name → its own title, kind ems_unlinked, never "seen"', () => {
    const g = emsUnlinkedGroup(['גבים'], '2026-09-22T18:00:00Z')!;
    expect(g.kind).toBe('ems_unlinked');
    expect(g.title).toBe('⚠️ גבים לא מקושר ל-EMS');
    expect(g.seen).toBe(false);
    expect(g.at).toBe('2026-09-22T18:00:00Z');
    expect(g.rows).toEqual([{ kind: 'ems_unlinked', product: 'גבים' }]);
  });

  it('several names → a count title, one row per name', () => {
    const g = emsUnlinkedGroup(['גבים', 'יגור', 'חוקוק'])!;
    expect(g.title).toBe('⚠️ 3 אתרים לא מקושרים ל-EMS');
    expect(g.rows).toHaveLength(3);
  });

  it('alertText reads a single ems_unlinked row the same way the group title does', () => {
    expect(alertText({ kind: 'ems_unlinked', product: 'גבים' })).toBe('⚠️ גבים לא מקושר ל-EMS');
  });
});
