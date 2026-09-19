// 🔔 goldens for the alerts half of the inventory spec (§5, §7 "Digest: digestWindow, digestBody,
// the hour gate and the idempotency tag"). Israel is UTC+3 in September, UTC+2 in January —
// both are exercised, because the digest windows are the one thing DST can silently break.
import { describe, expect, it } from 'vitest';
import {
  alertArrow, alertText, alertTarget, canSeeAlerts, digestBody, digestTag, digestTitle,
  digestWindow, israelClock, isSeen, lowStockRows, lowStockTag, unseenCount, type AlertRow,
} from './alerts';

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
      + '⚠️ מלאי נמוך: סים 1NCE 4 יח׳',
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
