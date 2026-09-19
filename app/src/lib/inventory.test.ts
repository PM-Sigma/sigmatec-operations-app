// Goldens for the unified pool (inventory spec §7). The legacy half of the same rules is
// covered by test-inventory-pool.mjs, which evaluates js/src/07-orders.js, 08-inventory.js and
// 09-visits.js against these very numbers.
import { describe, expect, it } from 'vitest';
import {
  LEGACY_PERSON_LOCATIONS, NON_KIBBUTZ_LOCATIONS, POOL, RECOUNT_LOC, SUPPLIER_LOC,
  alreadyPosted, isDropShip, orderApprovalRows, orderDeliveryRows, poolMigrationRows, poolStock,
  receivableOrders, stockByLocation, visitMovementRows,
} from './inventory';

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
