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
  amichaiPending, approvalPlan, canApproveThisOrder, canMarkStuck, distinctSuppliers,
  editStatusOptions, freshApprovedOrders, isDirectSupply, orderFormFields, orderKibbutz,
  orderSavePlan, orderStatusPlan, orderType, quickAction, restockPlan, approvalWaitingMsg,
  deleteSummaryLines,
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

// ───────────────────────── task L3: the order machine ─────────────────────────
const o = (x: Partial<{ id: string; status: string; items: Array<{ name: string; qty: number }>; orderType: string; kibbutz: string; assignee: string; notes: string; supplier: string; createdBy: string }>) =>
  ({ id: 'o1', status: 'pending_approval', items: [{ name: 'בקר 504', qty: 4 }], ...x }) as any;

describe('approval rights (O9) — 5 users × 4 kinds', () => {
  const kinds = {
    small: o({ orderType: 'supplier' }),
    big: o({ orderType: 'supplier', items: [{ name: 'x', qty: 11 }] }),
    cust: o({ orderType: 'customer', kibbutz: 'חוקוק' }),
    drop: o({ orderType: 'customer', kibbutz: 'חוקוק', assignee: 'ספק ישיר' }),
  };
  const want: Record<string, Record<string, boolean>> = {
    'עידן': { small: false, big: false, cust: false, drop: false },
    'עמיחי': { small: true, big: true, cust: true, drop: true },
    'אביאם': { small: true, big: false, cust: true, drop: true },
    'ניתאי': { small: false, big: false, cust: true, drop: true },
    'אבצן': { small: false, big: false, cust: false, drop: false },
  };
  for (const [me, row] of Object.entries(want)) {
    for (const [k, ok] of Object.entries(row)) {
      it(`${me} × ${k} → ${ok}`, () => expect(canApproveThisOrder((kinds as any)[k], me)).toBe(ok));
    }
  }
  it('waiting texts', () => {
    expect(approvalWaitingMsg(kinds.cust)).toBe('ממתין לאישור אביאם או ניתאי');
    expect(approvalWaitingMsg(kinds.big)).toBe('מעל 10 פריטים, ממתין לאישור עמיחי');
    expect(approvalWaitingMsg(kinds.small)).toBe('ממתין לאישור אביאם');
  });
});

describe('orderType / orderKibbutz / isDirectSupply fallbacks (O6-O8)', () => {
  it('notes mark a customer order', () => expect(orderType({ notes: 'בקשת לקוח: גבים' } as any)).toBe('customer'));
  it('kibbutz from the field, then from notes, then from the linked requirement', () => {
    expect(orderKibbutz({ id: 'a', kibbutz: 'חוקוק' } as any, [])).toBe('חוקוק');
    expect(orderKibbutz({ id: 'a', notes: 'בקשת לקוח — גבים (דני)' } as any, [])).toBe('גבים');
    expect(orderKibbutz({ id: 'a' } as any, [{ id: 'r', linkedOrderId: 'a', kibbutz: 'יגור' }])).toBe('יגור');
  });
  it('drop-ship needs BOTH customer type and the ספק ישיר assignee', () => {
    expect(isDirectSupply(o({ orderType: 'customer', assignee: 'ספק ישיר' }))).toBe(true);
    expect(isDirectSupply(o({ orderType: 'supplier', assignee: 'ספק ישיר' }))).toBe(false);
  });
});

describe('quick actions + סימון כתקוע (O4, O5)', () => {
  it('supplier chain', () => {
    expect(['pending', 'in_transit', 'at_port', 'stuck', 'arrived', 'delivered'].map(s =>
      quickAction(o({ orderType: 'supplier', status: s }))?.next ?? null),
    ).toEqual(['in_transit', 'at_port', 'arrived', 'arrived', 'delivered', null]);
  });
  it('customer orders have no quick action', () => expect(quickAction(o({ orderType: 'customer', status: 'pending' }))).toBeNull());
  it('stuck is offered except on delivered/supplied/stuck/pending_approval', () => {
    expect(['pending', 'in_transit', 'at_port', 'arrived', 'delivered', 'supplied', 'stuck', 'pending_approval']
      .map(s => canMarkStuck(o({ orderType: 'supplier', status: s })))).toEqual([true, true, true, true, false, false, false, false]);
  });
});

describe('editStatusOptions (O18a/O18b fix)', () => {
  it('no picker while pending_approval', () => expect(editStatusOptions(o({ status: 'pending_approval' }))).toEqual([]));
  it('supplier keeps arrived as a real option (O18a)', () => expect(editStatusOptions(o({ orderType: 'supplier', status: 'arrived' }))).toContain('arrived'));
  it('customer only ever offers supplied', () => expect(editStatusOptions(o({ orderType: 'customer', status: 'supplied' }))).toEqual(['supplied']));
});

describe('distinctSuppliers / orderFormFields', () => {
  it('distinctSuppliers: unique, he-sorted', () => {
    expect(distinctSuppliers([o({ supplier: 'לנדיס' }), o({ supplier: 'סאטק' }), o({ supplier: 'לנדיס' }), o({ supplier: '' })])).toEqual(['לנדיס', 'סאטק']);
  });
  it('orderFormFields: supplier field for a supplier order OR a customer drop-ship', () => {
    expect(orderFormFields('supplier', undefined, 'עידן', true)).toMatchObject({ supplier: true, kibbutz: false });
    expect(orderFormFields('customer', 'ספק ישיר', 'עידן', true)).toMatchObject({ supplier: true, kibbutz: true });
    expect(orderFormFields('customer', undefined, 'עידן', true)).toMatchObject({ supplier: false, kibbutz: true, assignee: true });
    expect(orderFormFields('customer', undefined, 'אביאם', true)).toMatchObject({ assignee: false });
  });
});

describe('orderStatusPlan (D6 fix)', () => {
  const ctx = (movements: any[] = []) => ({ me: 'עמיחי', movements, requirements: [{ id: 'r1', linkedOrderId: 'ord-3', status: 'in_progress' }] });
  const arrived = o({ id: 'ord-3', orderType: 'supplier', status: 'arrived', items: [{ name: 'E360PP', qty: 20 }] });
  it('posts delivery rows once and fulfils linked requirements', () => {
    const p = orderStatusPlan(arrived, 'delivered', ctx());
    expect(p.movements).toEqual([{ product: 'E360PP', fromLocation: 'ספק', toLocation: 'חברה', quantity: 20, reason: 'order_delivery', refId: 'ord-3', createdBy: 'עמיחי' }]);
    expect(p.fulfil).toEqual(['r1']);
  });
  it('posts nothing when the ledger already has them', () => {
    expect(orderStatusPlan(arrived, 'delivered', ctx([{ refId: 'ord-3', reason: 'order_delivery' }])).movements).toEqual([]);
  });
  it('non-delivery transitions post nothing', () => expect(orderStatusPlan(arrived, 'stuck', ctx()).movements).toEqual([]));
  it('parseInt quantity like the legacy delivery (2.5 → 2)', () => {
    expect(orderStatusPlan(o({ ...arrived, items: [{ name: 'X', qty: '2.5' as any }] }), 'delivered', ctx()).movements[0].quantity).toBe(2);
  });
  it('a customer order never delivers via this path (customer orders use approvalPlan, not orderStatusPlan)', () => {
    expect(orderStatusPlan(o({ orderType: 'customer', status: 'supplied' }), 'delivered', ctx()).movements).toEqual([]);
  });
});

describe('orderSavePlan (O16-O19, O27-O28, O18a/O18b fixed)', () => {
  const base = { orderType: 'supplier' as const, supplier: 'לנדיס', createdBy: 'עמיחי', items: [{ name: 'בקר 504', qty: 3 }] };
  const ctx = { catalog: ['בקר 504'], movements: [], requirements: [], me: 'עמיחי' };
  it('a new order is always pending_approval and pushes', () => {
    const p = orderSavePlan({ ...base, status: 'delivered' } as any, ctx);
    expect([p.body.status, p.pushPending, p.delivery]).toEqual(['pending_approval', true, false]);
  });
  it('raw text goes into the notes and into a learn row of base items only', () => {
    const p = orderSavePlan({ ...base, raw: '3 בקרים', items: [...base.items, { name: 'בקר 504', qty: 1, auto: true }] } as any, ctx);
    expect(p.body.notes).toBe('📥 דרישת לקוח גולמית:\n3 בקרים');
    expect(p.learn).toEqual({ rawText: '3 בקרים', items: [{ name: 'בקר 504', qty: 3 }] });
  });
  it('blocks non-catalog lines (O27 ruling: no add-to-catalog path)', () => {
    const p = orderSavePlan({ ...base, items: [{ name: 'פריט חדש', qty: 1 }] } as any, ctx);
    expect(p.unknown).toEqual(['פריט חדש']);
    expect(p.errors[0]).toBe('פריטים שלא בקטלוג: פריט חדש. אפשר להסיר אותם מההזמנה');
  });
  it('O18b fix: editing a pending_approval order keeps its status', () => {
    expect(orderSavePlan({ ...base, id: 'x', origStatus: 'pending_approval', status: '' } as any, ctx).body.status).toBe('pending_approval');
  });
  it('O18a fix: an arrived order saved unchanged stays arrived and posts nothing', () => {
    const p = orderSavePlan({ ...base, id: 'x', origStatus: 'arrived', status: 'arrived' } as any, ctx);
    expect([p.body.status, p.delivery]).toEqual(['arrived', false]);
  });
  it('editing to delivered for real DOES set delivery=true', () => {
    const p = orderSavePlan({ ...base, id: 'x', origStatus: 'arrived', status: 'delivered' } as any, ctx);
    expect([p.body.status, p.delivery]).toEqual(['delivered', true]);
  });
  it('errors match the legacy order', () => {
    expect(orderSavePlan({ ...base, items: [] } as any, ctx).errors[0]).toBe('צריך לפחות פריט אחד');
    expect(orderSavePlan({ ...base, items: [{ name: '', qty: 1, choose: ['ספק כוח פס-דין', 'ספק כוח שקע'] }] } as any, ctx).errors[0])
      .toBe('יש שורת ספק כוח בלי סוג. בחירה: ספק כוח פס-דין או ספק כוח שקע');
    expect(orderSavePlan({ ...base, createdBy: '' } as any, ctx).errors[0]).toBe('חסר מי יצר את ההזמנה');
    expect(orderSavePlan({ ...base, orderType: 'customer', kibbutz: '' } as any, ctx).errors.at(-1)).toBe('חסר קיבוץ להזמנת לקוח');
  });
  it('AUDIT FIX: expectedDate reaches the body (was dropped silently — never read from the draft)', () => {
    const p = orderSavePlan({ ...base, expectedDate: '2026-10-05' } as any, ctx);
    expect(p.body.expectedDate).toBe('2026-10-05');
  });
  it('AUDIT FIX: no expectedDate on the draft → the key stays absent (never forced to "")', () => {
    const p = orderSavePlan(base as any, ctx);
    expect('expectedDate' in p.body).toBe(false);
  });
  it('AUDIT FIX: delivered again while a delivery movement already exists locally does not re-post (save path, not just UI)', () => {
    const dupCtx = { ...ctx, movements: [{ refId: 'x', reason: 'order_delivery' }] };
    const p = orderSavePlan({ ...base, id: 'x', origStatus: 'arrived', status: 'delivered' } as any, dupCtx);
    expect([p.body.status, p.delivery]).toEqual(['delivered', false]);
  });
});

describe('approvalPlan (O11-O13)', () => {
  const ctx = { me: 'ניתאי', movements: [], requirements: [{ id: 'r1', linkedOrderId: 'c', status: 'in_progress' }], hasSite: (k: string) => k !== 'בלי-אתר' };
  it('customer: movements, EMS text byte-exact, supplied, fulfil', () => {
    const p = approvalPlan(o({ id: 'c', orderType: 'customer', kibbutz: 'חוקוק', items: [{ name: 'A', qty: 2 }] }), ctx);
    expect(p.kind).toBe('customer');
    expect(p.patch).toEqual({ status: 'supplied' });
    expect(p.fulfil).toEqual(['r1']);
    expect(p.ems).toEqual({ kind: 'createTask', kibbutz: 'חוקוק', title: 'אספקת ציוד: חוקוק', description: 'אספקת ציוד לחוקוק: אושר ע"י ניתאי\n• A ×2', assigneeName: 'ניתאי' });
  });
  it('the site gate blocks', () => {
    expect(approvalPlan(o({ orderType: 'customer', kibbutz: 'בלי-אתר' }), ctx).error)
      .toBe('לקיבוץ "בלי-אתר" אין אתר EMS מקושר. צריך לקשר או ליצור את האתר ב-EMS לפני אישור ההזמנה.');
  });
  it('drop-ship: no movement, no EMS', () => {
    const p = approvalPlan(o({ id: 'c', orderType: 'customer', kibbutz: 'חוקוק', assignee: 'ספק ישיר' }), ctx);
    expect([p.kind, p.movements, p.ems]).toEqual(['dropship', [], undefined]);
  });
  it('supplier → pending', () => expect(approvalPlan(o({ orderType: 'supplier' }), { ...ctx, me: 'אביאם' }).patch).toEqual({ status: 'pending' }));
  it('no permission', () => expect(approvalPlan(o({ orderType: 'supplier' }), { ...ctx, me: 'עידן' }).error).toBe('אין הרשאה לאשר את ההזמנה הזו. ממתין לאישור אביאם'));
});

describe('notices (O14, O15)', () => {
  it('first run seeds and shows nothing', () => expect(freshApprovedOrders([o({ id: 'a', status: 'pending' })], null, 'אביאם')).toEqual({ seed: ['a'], fresh: [] }));
  it('fresh = approved, unseen, not mine', () => {
    expect(freshApprovedOrders(
      [o({ id: 'a', status: 'pending' }), o({ id: 'b', status: 'pending', createdBy: 'אביאם' }), o({ id: 'c' })],
      [], 'אביאם',
    ).fresh.map((x: any) => x.id)).toEqual(['a']);
  });
  it('amichaiPending lists only >10 supplier orders, only for עמיחי', () => {
    const big = o({ orderType: 'supplier', items: [{ name: 'x', qty: 11 }] });
    expect(amichaiPending([big, o({})], 'עמיחי')).toEqual([big]);
    expect(amichaiPending([big], 'אביאם')).toEqual([]);
  });
});

describe('restockPlan (S18)', () => {
  it('kibbutz → חברה once', () => {
    const r = { id: 'ret-1', kibbutz: 'חוקוק', product: 'A', qty: 1, status: 'open' };
    expect(restockPlan(r, { me: 'עידן', movements: [] }).movements).toEqual([
      { product: 'A', fromLocation: 'חוקוק', toLocation: 'חברה', quantity: 1, reason: 'return_restock', refId: 'ret-1', createdBy: 'עידן' },
    ]);
    expect(restockPlan(r, { me: 'עידן', movements: [{ refId: 'ret-1', reason: 'return_restock' }] }).error).toBe('הפריט כבר הוחזר למלאי, לא נרשמה תנועה נוספת');
    expect(restockPlan({ ...r, kibbutz: '' }, { me: 'עידן', movements: [] }).error).toBe('לא ידוע מאיזה קיבוץ הוחזר הפריט, אי אפשר להחזיר למלאי');
  });
});

// ───────────────────────── task L7: delete cascade summary (binding: certs untouched) ─────────────────────────
describe('deleteSummaryLines (D1-D5, binding update: issued certs stay exactly as they are)', () => {
  it('the confirmation screen text, zero counts omitted, Hebrew singular for 1', () => {
    expect(deleteSummaryLines({
      product: '__DEL__', exists: 1, movements: 3,
      orders_deleted: ['ord-9'], orders_trimmed: ['ord-2'],
      certs_referencing: [1050], certs_referencing_active: [1050],
      visits_trimmed: 2, requirements_trimmed: 0, requirements_deleted: 0,
      returns: 1, recounts: 0, alerts: 4, parse_examples: 0, fingerprint: 'x',
    })).toEqual([
      { text: '3 תנועות מלאי', danger: false },
      { text: 'שורה בהזמנה אחת', danger: false },
      { text: 'הזמנה ord-9 נמחקת כולה', danger: true },
      { text: 'תעודה אחת מזכירה פריט זה — לא תשתנה (תעודה שהופקה היא רשומה סופית)', danger: false },
      { text: 'שורות ב-2 ביקורים (הסיכומים נשארים)', danger: false },
      { text: 'החזרה אחת', danger: false },
      { text: '4 התראות', danger: false },
    ]);
  });
  it('a cert that references the item is listed but never marked dangerous — it is never touched', () => {
    const lines = deleteSummaryLines({
      product: 'x', exists: 1, movements: 0, orders_deleted: [], orders_trimmed: [],
      certs_referencing: [10, 11], certs_referencing_active: [10],
      visits_trimmed: 0, requirements_trimmed: 0, requirements_deleted: 0,
      returns: 0, recounts: 0, alerts: 0, parse_examples: 0, fingerprint: 'x',
    });
    expect(lines).toEqual([{ text: '2 תעודות מזכירות פריט זה — לא ישתנו (תעודה שהופקה היא רשומה סופית)', danger: false }]);
  });
  it('RULING (24.9): a locked visit is trimmed like any other — no separate "kept" line', () => {
    const lines = deleteSummaryLines({
      product: 'x', exists: 1, movements: 0, orders_deleted: [], orders_trimmed: [],
      certs_referencing: [], certs_referencing_active: [],
      visits_trimmed: 3,
      requirements_trimmed: 0, requirements_deleted: 0,
      returns: 0, recounts: 0, alerts: 0, parse_examples: 0, fingerprint: 'x',
    });
    expect(lines).toEqual([
      { text: 'שורות ב-3 ביקורים (הסיכומים נשארים)', danger: false },
    ]);
  });
  it('everything zero → no lines at all', () => {
    expect(deleteSummaryLines({
      product: 'x', exists: 1, movements: 0, orders_deleted: [], orders_trimmed: [],
      certs_referencing: [], certs_referencing_active: [],
      visits_trimmed: 0, requirements_trimmed: 0, requirements_deleted: 0,
      returns: 0, recounts: 0, alerts: 0, parse_examples: 0, fingerprint: 'x',
    })).toEqual([]);
  });
});
