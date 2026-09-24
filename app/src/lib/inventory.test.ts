// Goldens for the unified pool (inventory spec §7). The legacy half of the same rules is
// covered by test-inventory-pool.mjs, which evaluates js/src/07-orders.js, 08-inventory.js and
// 09-visits.js against these very numbers.
import { describe, expect, it } from 'vitest';
import {
  LEGACY_PERSON_LOCATIONS, NON_KIBBUTZ_LOCATIONS, POOL, RECOUNT_LOC, SUPPLIER_LOC,
  alreadyPosted, isDropShip, orderApprovalRows, orderDeliveryRows, poolMigrationRows, poolStock,
  receivableOrders, stockByLocation, visitMovementRows,
  activeProducts, csvText, isLowItem, kibbutzCsvRows, kibbutzCards, kibbutzMatrix, lowStockLines,
  lowStockReport, poolCsvRows, poolView, productCategoryMap, sortByCategoryThenName,
  sortByCategoryThenNameFixed,
} from './inventory';
import goldens from './__fixtures__/inventory/legacy-goldens.json';
import fx from './__fixtures__/inventory/ledgers.json';

const mv = (o: Record<string, unknown>) => ({
  product: 'E360CT', fromLocation: '', toLocation: '', quantity: 0,
  reason: 'manual', refId: '', createdBy: '', ...o,
});

describe('constants', () => {
  it('names the pool and the recount counterparty exactly as the spec does', () => {
    expect(POOL).toBe('חברה');
    expect(RECOUNT_LOC).toBe('ספירה');
    expect(SUPPLIER_LOC).toBe('ספק');
    expect(NON_KIBBUTZ_LOCATIONS).toEqual(['חברה', 'ספירה', 'ספק', 'תקול']);
    expect(LEGACY_PERSON_LOCATIONS).toEqual(['עמיחי', 'אביאם', 'ניתאי', 'משרד']);
  });
});

describe('poolStock', () => {
  it('nets only the rows that touch חברה', () => {
    const rows = [
      mv({ product: 'E360CT', toLocation: POOL, quantity: 20, reason: 'order_delivery', fromLocation: SUPPLIER_LOC }),
      mv({ product: 'E360CT', fromLocation: POOL, toLocation: 'גבים', quantity: 3, reason: 'visit_supply' }),
      // a kibbutz→kibbutz row (never happens, but the pool must not care)
      mv({ product: 'E360CT', fromLocation: 'גבים', toLocation: 'יגור', quantity: 1 }),
      mv({ product: 'בקר 504', toLocation: POOL, quantity: 5, fromLocation: SUPPLIER_LOC }),
    ];
    expect(poolStock(rows)).toEqual({ 'E360CT': 17, 'בקר 504': 5 });
  });

  it('counts the migration rows, so the pool equals the sum of the old bags', () => {
    const before = [
      mv({ product: 'E360CT', toLocation: 'אביאם', quantity: 8 }),
      mv({ product: 'E360CT', toLocation: 'ניתאי', quantity: 4 }),
      mv({ product: 'E360CT', toLocation: 'משרד', quantity: 26 }),
    ];
    const migration = poolMigrationRows(stockByLocation(before), LEGACY_PERSON_LOCATIONS, '2026-09-20');
    expect(poolStock([...before, ...migration])).toEqual({ 'E360CT': 38 });
  });

  it('drops a product that nets to zero, and ignores blank product names', () => {
    expect(poolStock([
      mv({ product: 'X', toLocation: POOL, quantity: 2 }),
      mv({ product: 'X', fromLocation: POOL, toLocation: 'גבים', quantity: 2 }),
      mv({ product: '', toLocation: POOL, quantity: 9 }),
    ])).toEqual({});
  });

  it('survives nulls and non-numeric quantities', () => {
    expect(poolStock(null)).toEqual({});
    expect(poolStock([mv({ toLocation: POOL, quantity: 'לא מספר' })])).toEqual({});
  });
});

describe('poolMigrationRows', () => {
  const stock = {
    'אביאם': { 'E360CT': 8, 'סים 1NCE': 0, 'בקר 504': 2 },
    'ניתאי': { 'E360CT': 4 },
    'משרד': { 'E360CT': 26 },
    'עמיחי': {},
    'גבים': { 'E360CT': 12 },   // a kibbutz — never swept
    [POOL]: { 'E360CT': 1 },    // the pool itself — never swept
  };

  it('sweeps person locations only, skipping zero nets, in a stable order', () => {
    expect(poolMigrationRows(stock, LEGACY_PERSON_LOCATIONS, '2026-09-20')).toEqual([
      // Hebrew collation puts the Hebrew name before the latin one — the order is stable,
      // which is what a dry run printed twice depends on.
      { product: 'בקר 504', fromLocation: 'אביאם', toLocation: POOL, quantity: 2, reason: 'pool_migration', refId: '2026-09-20', createdBy: 'עידן' },
      { product: 'E360CT', fromLocation: 'אביאם', toLocation: POOL, quantity: 8, reason: 'pool_migration', refId: '2026-09-20', createdBy: 'עידן' },
      { product: 'E360CT', fromLocation: 'ניתאי', toLocation: POOL, quantity: 4, reason: 'pool_migration', refId: '2026-09-20', createdBy: 'עידן' },
      { product: 'E360CT', fromLocation: 'משרד', toLocation: POOL, quantity: 26, reason: 'pool_migration', refId: '2026-09-20', createdBy: 'עידן' },
    ]);
  });

  it('sweeps a NEGATIVE balance the other way, so the person really lands on 0', () => {
    const rows = poolMigrationRows({ 'ניתאי': { 'E360CT': -3 } }, ['ניתאי'], '2026-09-20');
    expect(rows).toEqual([
      { product: 'E360CT', fromLocation: POOL, toLocation: 'ניתאי', quantity: 3, reason: 'pool_migration', refId: '2026-09-20', createdBy: 'עידן' },
    ]);
  });

  it('is empty when there is nothing to sweep', () => {
    expect(poolMigrationRows({}, LEGACY_PERSON_LOCATIONS, '2026-09-20')).toEqual([]);
    expect(poolMigrationRows(null, [], '2026-09-20')).toEqual([]);
  });
});

describe('visitMovementRows', () => {
  it('supplies from חברה, with the visitor on created_by', () => {
    expect(visitMovementRows({
      id: 'vis-9', kibbutz: 'גבים', visitor: 'אביאם',
      products: [{ name: 'E360CT', qty: 3 }, { name: 'בקר 504', qty: '1' }],
    })).toEqual([
      { product: 'E360CT', fromLocation: POOL, toLocation: 'גבים', quantity: 3, reason: 'visit_supply', refId: 'vis-9', createdBy: 'אביאם' },
      { product: 'בקר 504', fromLocation: POOL, toLocation: 'גבים', quantity: 1, reason: 'visit_supply', refId: 'vis-9', createdBy: 'אביאם' },
    ]);
  });

  it('merges duplicates and drops blanks / non-positive quantities', () => {
    expect(visitMovementRows({
      id: 'v', kibbutz: 'יגור', visitor: 'ניתאי',
      products: [{ name: 'E360CT', qty: 2 }, { name: 'E360CT', qty: 1 }, { name: '', qty: 5 }, { name: 'X', qty: 0 }],
    })).toEqual([
      { product: 'E360CT', fromLocation: POOL, toLocation: 'יגור', quantity: 3, reason: 'visit_supply', refId: 'v', createdBy: 'ניתאי' },
    ]);
  });

  it('writes nothing without a kibbutz', () => {
    expect(visitMovementRows({ id: 'v', visitor: 'ניתאי', products: [{ name: 'E360CT', qty: 2 }] })).toEqual([]);
    expect(visitMovementRows(null)).toEqual([]);
  });
});

describe('orderApprovalRows', () => {
  const order = { id: 'ord-1', kibbutz: 'גבים', items: [{ name: 'E360CT', qty: 2 }] };

  it('moves חברה → kibbutz on a customer approval', () => {
    expect(orderApprovalRows(order, 'עמיחי')).toEqual([
      { product: 'E360CT', fromLocation: POOL, toLocation: 'גבים', quantity: 2, reason: 'customer_supply', refId: 'ord-1', createdBy: 'עמיחי' },
    ]);
  });

  it('writes nothing for a drop-ship, or without a kibbutz', () => {
    expect(isDropShip({ assignee: 'ספק ישיר' })).toBe(true);
    expect(orderApprovalRows({ ...order, assignee: 'ספק ישיר' }, 'עמיחי')).toEqual([]);
    expect(orderApprovalRows({ ...order, kibbutz: '' }, 'עמיחי')).toEqual([]);
  });

  it('is idempotent by refId + reason (the re-approve guard)', () => {
    const posted = orderApprovalRows(order, 'עמיחי');
    expect(alreadyPosted(posted, 'ord-1', 'customer_supply')).toBe(true);
    expect(alreadyPosted(posted, 'ord-2', 'customer_supply')).toBe(false);
    expect(alreadyPosted(posted, 'ord-1', 'order_delivery')).toBe(false);
  });
});

describe('orderDeliveryRows', () => {
  it('credits the pool from ספק — one line per item, no distribution', () => {
    expect(orderDeliveryRows({ id: 'ord-7', items: [{ name: 'בקר 504', qty: 20 }, { name: 'E360CT', qty: 5 }] }, 'עידן')).toEqual([
      { product: 'בקר 504', fromLocation: SUPPLIER_LOC, toLocation: POOL, quantity: 20, reason: 'order_delivery', refId: 'ord-7', createdBy: 'עידן' },
      { product: 'E360CT', fromLocation: SUPPLIER_LOC, toLocation: POOL, quantity: 5, reason: 'order_delivery', refId: 'ord-7', createdBy: 'עידן' },
    ]);
  });

  it('drops blank item names so no orphan row reaches the ledger', () => {
    expect(orderDeliveryRows({ id: 'o', items: [{ name: '', qty: 3 }] }, 'עידן')).toEqual([]);
  });
});

describe('receivableOrders', () => {
  it('offers only supplier orders that can still be received, most advanced first', () => {
    const orders = [
      { id: 'a', status: 'pending', items: [{ name: 'x', qty: 1 }] },
      { id: 'b', status: 'arrived', items: [{ name: 'x', qty: 1 }] },
      { id: 'c', status: 'delivered', items: [{ name: 'x', qty: 1 }] },
      { id: 'd', status: 'arrived', items: [] },
    ];
    expect(receivableOrders(orders).map(o => o.id)).toEqual(['b', 'a']);
    expect(receivableOrders(null)).toEqual([]);
  });
});

// ───────────────────────── task L2: stock = today (goldens recorded from js/src/08-inventory.js) ─────────────────────────
describe('stock/product/low-stock/kibbutz/CSV rules = today (legacy-goldens.json)', () => {
  for (const [name, rows] of Object.entries(fx.ledgers)) {
    const g = (goldens as any)[name];
    it(name + ': stockByLocation', () => expect(stockByLocation(rows as any)).toEqual(g.stock));
    it(name + ': poolStock', () => expect(poolStock(rows as any)).toEqual(g.pool));
    it(name + ': lowStockReport', () => expect(lowStockReport(poolStock(rows as any))).toEqual(g.low));
    it(name + ': category map + sort (the UNFIXED order — P15 is its own test below)', () => {
      expect(productCategoryMap(fx.products as any)).toEqual(g.cat);
      expect(sortByCategoryThenName(Object.keys(poolStock(rows as any)), productCategoryMap(fx.products as any))).toEqual(g.sorted);
    });
    it(name + ': CSV rows', () => {
      expect(poolCsvRows(poolStock(rows as any))).toEqual(g.poolCsv);
      expect(kibbutzCsvRows(stockByLocation(rows as any))).toEqual(g.kibbutzCsv);
    });
  }

  it('csvText matches invDownloadCSV byte for byte', () => {
    expect(csvText([['פריט', 'חברה'], ['a"b', 3]])).toBe('﻿"פריט","חברה"\n"a""b","3"');
  });

  it('lowStockLines: task line for others, banner for אביאם/עמיחי', () => {
    const r = { meters: [{ label: 'מונה PM135', match: 'PM135', total: 2, min: 5, found: true }] };
    expect(lowStockLines(r, 'עידן')).toEqual({
      taskLines: ['🔴 מלאי המונים בחברה ירד מתחת לקו האדום, ישנם 2 מסוג "מונה PM135" (קו אדום: 5)'],
      bannerLines: [],
    });
    expect(lowStockLines(r, 'אביאם')).toEqual({ taskLines: [], bannerLines: ['מונה PM135: נותרו 2 (קו אדום 5)'] });
  });

  it('activeProducts falls back to the built-in list only when the catalog is empty', () => {
    expect(activeProducts([], ['X'])).toEqual([{ name: 'X', active: true, category: '' }]);
    expect(activeProducts([{ name: 'A', active: false }], ['X'])).toEqual([]);
    expect(activeProducts([{ name: 'A', active: true }], ['X'])).toEqual([{ name: 'A', active: true }]);
  });

  it('poolView: יחידות counts the shown rows, פריטים and מלאי נמוך count the whole pool', () => {
    const pool = { 'מונה PM135': 2, 'בקר 504': 12 };
    const catMap = { 'מונה PM135': 'מונה', 'בקר 504': 'בקר' };
    const report = lowStockReport(pool);
    const all = poolView(pool, catMap, report, '');
    expect([all.productCount, all.totalUnits, all.lowCount]).toEqual([2, 14, 1]);
    const low = poolView(pool, catMap, report, 'low');
    expect([low.productCount, low.totalUnits, low.lowCount, low.names]).toEqual([2, 2, 1, ['מונה PM135']]);
  });

  it('P15 fix: משנ״ז (gershayim, the product-modal option value) sorts WITH משנ"ז (ASCII quote, the STOCK_CATEGORY_ORDER spelling) — today they split into two buckets', () => {
    const names = ['משנ"ז 400', 'משנ״ז 250', 'בקר 504'];
    const catMap = { 'משנ"ז 400': 'משנ"ז', 'משנ״ז 250': 'משנ״ז', 'בקר 504': 'בקר' };
    // unfixed: משנ"ז (index 3) sorts before בקר (index 1)? no — בקר is index 1, משנ"ז index 3, so
    // בקר first either way; the bug is that משנ״ז (gershayim) finds NO index (-1 → 999) and sorts
    // AFTER both, instead of next to its ASCII sibling.
    expect(sortByCategoryThenName(names, catMap)).toEqual(['בקר 504', 'משנ"ז 400', 'משנ״ז 250']);
    expect(sortByCategoryThenNameFixed(names, catMap)).toEqual(['בקר 504', 'משנ״ז 250', 'משנ"ז 400']);
    // the fix's real effect shows once the ASCII spelling ISN'T already first alphabetically:
    const names2 = ['משנ״ז 250', 'משנ"ז 400'];
    const catMap2 = { 'משנ״ז 250': 'משנ״ז', 'משנ"ז 400': 'משנ"ז' };
    // unfixed: category index decides (משנ"ז=3 beats gershayim's unmatched 999) — ASCII first.
    expect(sortByCategoryThenName(names2, catMap2)).toEqual(['משנ"ז 400', 'משנ״ז 250']);
    // fixed: same bucket now, so Hebrew collation (ICU 'he', not a codepoint compare) decides —
    // it puts the gershayim spelling first. The point isn't which one wins; it's that the two
    // spellings sort NEXT TO each other instead of splitting into two buckets.
    expect(sortByCategoryThenNameFixed(names2, catMap2)).toEqual(['משנ״ז 250', 'משנ"ז 400']);
  });
});

describe('kibbutzCards / kibbutzMatrix (S13)', () => {
  const stock = {
    [POOL]: { 'E360CT': 1 },
    'אביאם': { 'E360CT': 8, 'בקר 504': 0 },
    'גבים': { 'E360CT': 12, 'בקר 504': 3 },
    'יגור': { 'E360CT': 0 },
  };
  it('kibbutzCards: person-locations and the pool excluded; zero items dropped; an all-zero kibbutz dropped entirely', () => {
    expect(kibbutzCards(stock)).toEqual([
      { kibbutz: 'גבים', items: [['בקר 504', 3], ['E360CT', 12]], totalUnits: 15 },
    ]);
  });
  it('kibbutzMatrix: every product non-zero SOMEWHERE, zero cells kept, totals per row', () => {
    const m = kibbutzMatrix(stock);
    expect(m.kibbutzim).toEqual(['גבים', 'יגור']);
    expect(m.products).toEqual(['בקר 504', 'E360CT']);
    expect(m.cells).toEqual([[3, 12], [0, 0]]);
    expect(m.totals).toEqual([15, 0]);
  });
});
