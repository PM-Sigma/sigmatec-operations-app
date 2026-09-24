// 📦 מלאי אחוד — the one company pool (inventory spec §1, §2, §4).
//
// עידן, 17.9.26: "עוברים לניהול מלאי אחוד לחברה ללא שיוך לעובד לאור פער ביכולת דיווח".
// Until 2.00 the `movements` ledger used PEOPLE as locations (אביאם / ניתאי / עמיחי / משרד),
// so "the stock" was four bags nobody could reconcile. From 2.01 there is exactly ONE internal
// location — `חברה` — and the people are back to being what they always were on a movement
// row: `created_by`, the person who did it. Kibbutzim stay as destinations, `ספק` as the
// outside-in source, `ספירה` as the counterparty of a recount, `תקול` as the defective bucket.
//
// The ledger is append-only and nothing here rewrites it: the migration (§2.1) posts ONE
// `<person> → חברה` row per non-zero balance, so "who held what before" stays queryable.
//
// Everything in this file is a plain function over plain rows — no React, no DOM, no network.
// The legacy modules (js/src/07-orders.js, 08-inventory.js, 09-visits.js) hold the same rules
// in their own vanilla code; test-inventory-pool.mjs evaluates THOSE against the same goldens,
// so the two halves cannot drift apart silently.
//
// Split out for size only (tasks L4/L5) — this is still the ONE import path (`export *`):
export * from './orderParse';
export * from './certDoc';
export * from './certSend';
export { productLabel, reportWiringOk, reportPreview, canEditDisplayName } from './productLabel';

/** The one internal stock location. Everything the company holds is here. */
export const POOL = 'חברה';
/** The counterparty of a 🔢 recount — a delta leaves to (or arrives from) here, never nowhere. */
export const RECOUNT_LOC = 'ספירה';
/** Outside-in: a supplier delivery credits the pool from here. */
export const SUPPLIER_LOC = 'ספק';
/** Returns that came back broken land here and stay out of available stock (unchanged). */
export const DEFECTIVE_LOC = 'תקול';

/** Locations that are NOT a kibbutz — excluded from the "what was supplied where" view. */
export const NON_KIBBUTZ_LOCATIONS = [POOL, RECOUNT_LOC, SUPPLIER_LOC, DEFECTIVE_LOC];

/**
 * The person-locations 2.00 and earlier wrote into the ledger. They are no longer locations;
 * this list exists ONLY so the migration knows whose balance to sweep into the pool, and so
 * the kibbutz view can keep ignoring them for the rows already on disk.
 */
export const LEGACY_PERSON_LOCATIONS = ['עמיחי', 'אביאם', 'ניתאי', 'משרד'];

/** The reasons the UI may write (spec §4b). Legacy rows carry other strings and stay readable. */
export const MOVEMENT_REASONS = [
  'visit_supply', 'customer_supply', 'order_delivery', 'recount', 'pool_migration',
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** A movement row, in the shape the legacy `POST {type:'movement'}` body already uses. */
export interface Movement {
  product: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  reason: string;
  refId: string;
  createdBy: string;
}

const qty = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

// ───────────────────────────── §1 the pool ─────────────────────────────

/**
 * Net quantity per product AT THE POOL. `from = חברה` subtracts, `to = חברה` adds; every other
 * location is somebody else's problem (a kibbutz holds what was supplied to it).
 *
 * Products that net to exactly 0 are dropped: a catalog rename or a fully-countered demo row
 * is not "0 in stock", it is nothing at all, and printing it made the matrix unreadable.
 */
export function poolStock(movements: ReadonlyArray<Partial<Movement>> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of movements || []) {
    // S1 (aligned to js/src/08-inventory.js computeStock — it never trims): the KEY keeps
    // whatever whitespace the row carries. A blank/whitespace-only name is still skipped.
    const product = String(m?.product ?? '');
    if (!product.trim()) continue;
    const q = qty(m?.quantity);
    if (m?.fromLocation === POOL) out[product] = (out[product] || 0) - q;
    if (m?.toLocation === POOL) out[product] = (out[product] || 0) + q;
  }
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}

/** The same net, per location — what `computeStock()` returns in the legacy bundle. */
export function stockByLocation(
  movements: ReadonlyArray<Partial<Movement>> | null | undefined,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const add = (loc: string, product: string, q: number) => {
    if (!loc) return;
    (out[loc] ||= {})[product] = (out[loc][product] || 0) + q;
  };
  for (const m of movements || []) {
    const product = String(m?.product ?? '');   // S1: untrimmed, aligned to legacy
    if (!product.trim()) continue;
    const q = qty(m?.quantity);
    add(String(m?.fromLocation ?? ''), product, -q);
    add(String(m?.toLocation ?? ''), product, q);
  }
  return out;
}

// ───────────────────────────── §2.1 the migration ─────────────────────────────

/**
 * One `<person> → חברה` row per non-zero balance held by a person-location (spec §2.1).
 *
 * Rules the goldens pin:
 *   · only the locations handed in (`personLocations`) are swept — kibbutzim, `ספק`, `תקול`
 *     and `חברה` itself are never touched;
 *   · a zero net is skipped (no empty rows in the ledger);
 *   · a NEGATIVE net is swept too, as a `חברה → <person>` row of the absolute quantity, so the
 *     person really lands on 0 and the pool absorbs the known error instead of hiding it;
 *   · order is stable: location by location in the order given, product by product in Hebrew
 *     collation, so a dry run printed twice is the same list twice.
 */
export function poolMigrationRows(
  stock: Record<string, Record<string, number>> | null | undefined,
  personLocations: ReadonlyArray<string>,
  date: string,
  actor = 'עידן',
): Movement[] {
  const rows: Movement[] = [];
  for (const loc of personLocations || []) {
    if (loc === POOL) continue;
    const held = (stock || {})[loc] || {};
    for (const product of Object.keys(held).sort((a, b) => a.localeCompare(b, 'he'))) {
      const net = qty(held[product]);
      if (net === 0) continue;
      rows.push({
        product,
        fromLocation: net > 0 ? loc : POOL,
        toLocation: net > 0 ? POOL : loc,
        quantity: Math.abs(net),
        reason: 'pool_migration',
        refId: date,
        createdBy: actor,
      });
    }
  }
  return rows;
}

// ───────────────────────────── §4 the movement paths ─────────────────────────────

export interface VisitProduct { name?: string; qty?: number | string }
export interface VisitLike {
  id?: string;
  kibbutz?: string;
  visitor?: string;
  products?: ReadonlyArray<VisitProduct> | null;
}

/**
 * A visit supplies FROM THE POOL (§1): `חברה → <kibbutz>`, `created_by` = the visitor, which is
 * the whole point — who did it stays on the row, his bag does not.
 * Same-named products in the list are merged, blanks and non-positive quantities dropped.
 */
export function visitMovementRows(visit: VisitLike | null | undefined): Movement[] {
  const kibbutz = String(visit?.kibbutz ?? '').trim();
  const visitor = String(visit?.visitor ?? '').trim();
  const refId = String(visit?.id ?? '');
  if (!kibbutz) return [];
  const merged = new Map<string, number>();
  for (const p of visit?.products || []) {
    const name = String(p?.name ?? '').trim();
    const q = qty(p?.qty);
    if (!name || q <= 0) continue;
    merged.set(name, (merged.get(name) || 0) + q);
  }
  return [...merged].map(([product, quantity]) => ({
    product, fromLocation: POOL, toLocation: kibbutz, quantity,
    reason: 'visit_supply', refId, createdBy: visitor,
  }));
}

export interface OrderItem { name?: string; qty?: number | string }
export interface OrderLike {
  id?: string;
  kibbutz?: string;
  status?: string;
  supplier?: string;
  assignee?: string;
  expectedDate?: string;
  createdAt?: string;
  orderType?: string;
  items?: ReadonlyArray<OrderItem> | null;
}

/** Drop-ship: the supplier ships straight to the customer, so nothing ever enters our pool. */
export function isDropShip(order: OrderLike | null | undefined): boolean {
  return String(order?.assignee ?? '').trim() === 'ספק ישיר';
}

/** Merge an order's items by name, dropping blanks and non-positive quantities. */
function orderItems(order: OrderLike | null | undefined): Array<[string, number]> {
  const merged = new Map<string, number>();
  for (const it of order?.items || []) {
    const name = String(it?.name ?? '').trim();
    const q = qty(it?.qty);
    if (!name || q <= 0) continue;
    merged.set(name, (merged.get(name) || 0) + q);
  }
  return [...merged];
}

/**
 * Customer-order approval (§4): `חברה → <kibbutz>`, reason `customer_supply`, `ref_id` = the
 * order id — the idempotency key the legacy re-approve guard already checks. Drop-ship and an
 * order with no kibbutz produce nothing.
 */
export function orderApprovalRows(order: OrderLike | null | undefined, actor: string): Movement[] {
  const kibbutz = String(order?.kibbutz ?? '').trim();
  if (!kibbutz || isDropShip(order)) return [];
  return orderItems(order).map(([product, quantity]) => ({
    product, fromLocation: POOL, toLocation: kibbutz, quantity,
    reason: 'customer_supply', refId: String(order?.id ?? ''), createdBy: String(actor ?? ''),
  }));
}

/**
 * Supplier delivery (§4): ONE line per item, `ספק → חברה`, reason `order_delivery`. This is
 * what replaces the per-person distribution step — there is nobody to distribute to any more,
 * the quantity received simply lands in the pool.
 */
export function orderDeliveryRows(order: OrderLike | null | undefined, actor: string): Movement[] {
  return orderItems(order).map(([product, quantity]) => ({
    product, fromLocation: SUPPLIER_LOC, toLocation: POOL, quantity,
    reason: 'order_delivery', refId: String(order?.id ?? ''), createdBy: String(actor ?? ''),
  }));
}

/** Has this order's movements already been posted? (`ref_id` + `reason`, unchanged from 2.00.) */
export function alreadyPosted(
  movements: ReadonlyArray<Partial<Movement>> | null | undefined, refId: string, reason: string,
): boolean {
  return (movements || []).some(m => String(m?.refId ?? '') === String(refId) && m?.reason === reason);
}

// ───────────────────────────── §4b the order picker's states ─────────────────────────────

/** Supplier statuses an "increase via order" may be attached to (§4b). */
export const RECEIVABLE_STATUSES = ['ordered', 'pending', 'in_transit', 'stuck', 'at_port', 'arrived'];

/** Supplier orders a 🧾 increase can be booked against, most-advanced first. */
export function receivableOrders(orders: ReadonlyArray<OrderLike> | null | undefined): OrderLike[] {
  return (orders || [])
    .filter(o => !!o && RECEIVABLE_STATUSES.includes(String(o.status ?? '')) && orderItems(o).length > 0)
    .sort((a, b) => RECEIVABLE_STATUSES.indexOf(String(b.status)) - RECEIVABLE_STATUSES.indexOf(String(a.status)));
}

// ───────────────────────────── §5 products, low stock, the pool view (task L2) ─────────────────────────────
// Ported 1:1 from js/src/06-products.js `getActiveProducts` and 08-inventory.js
// `STOCK_CATEGORY_ORDER/productCategoryMap/sortByCategoryThenName/METER_RULES/lowStockReport/
// renderLowStockAlert/invRenderStock`. Goldens recorded from THAT file, never re-recorded after
// L6 (scripts/inventory-goldens-record.mjs, __fixtures__/inventory/legacy-goldens.json).

export interface ProductRow {
  id?: string; name: string; category?: string | null; active?: boolean | null;
  display_name?: string | null; min_qty?: number | string | null; unit?: string | null;
}

/** getActiveProducts(): active catalog rows, or the built-in fallback list when the catalog is
 * empty (P1). A blank catalog is the "nothing imported yet" state, not "nothing is active". */
export function activeProducts(
  products: ReadonlyArray<ProductRow> | null | undefined,
  fallback: ReadonlyArray<string> = [],
): ProductRow[] {
  const all = products || [];
  if (all.length === 0) return fallback.map(name => ({ name, active: true, category: '' }));
  return all.filter(p => !!p && !!p.active);
}

export const STOCK_CATEGORY_ORDER = ['מונה', 'בקר', 'סים', 'משנ"ז', 'אנטנה', 'ספק כוח', 'כרטיס תקשורת'];
// P15 fix: the product modal's category <option value> is גershayim (״, U+05F4) but this order
// array spells the same category with an ASCII quote (", U+0022) — a category picked from the
// modal never matched this list and sorted into the "unknown" (999) bucket. Both spellings key
// to the same bucket here; the LEGACY GOLDEN (recorded from the unfixed code) is asserted
// separately, so the fix is its own named test, not a silent change to what the goldens check.
const catKey = (c: string) => c.replace(/״/g, '"');

/** productCategoryMap(): name → category (default `אחר`), covering every product handed in. */
export function productCategoryMap(products: ReadonlyArray<ProductRow> | null | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of products || []) if (p && p.name) m[p.name] = p.category || 'אחר';
  return m;
}

/** sortByCategoryThenName(): STOCK_CATEGORY_ORDER first, then Hebrew collation within a category. */
export function sortByCategoryThenName(names: ReadonlyArray<string>, catMap: Record<string, string>): string[] {
  return names.slice().sort((a, b) => {
    const ca = catMap[a] || 'אחר', cb = catMap[b] || 'אחר';
    if (ca !== cb) {
      const ia = STOCK_CATEGORY_ORDER.indexOf(ca), ib = STOCK_CATEGORY_ORDER.indexOf(cb);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || ca.localeCompare(cb, 'he');
    }
    return a.localeCompare(b, 'he');
  });
}

/** sortByCategoryThenName with the P15 fix applied: משנ״ז and משנ"ז share one bucket. */
export function sortByCategoryThenNameFixed(names: ReadonlyArray<string>, catMap: Record<string, string>): string[] {
  return names.slice().sort((a, b) => {
    const ca = catKey(catMap[a] || 'אחר'), cb = catKey(catMap[b] || 'אחר');
    if (ca !== cb) {
      const ia = STOCK_CATEGORY_ORDER.indexOf(ca), ib = STOCK_CATEGORY_ORDER.indexOf(cb);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || ca.localeCompare(cb, 'he');
    }
    return a.localeCompare(b, 'he');
  });
}

/** Company-wide meter red lines (S3). SIM has none any more (round 5 Phase 1). */
export const METER_RULES = [
  { label: 'מונה Landis+Gyr E360PP', match: '360PP', min: 15 },
  { label: 'מונה Landis+Gyr E360SP', match: '360SP', min: 15 },
  { label: 'מונה E360CT', match: '360CT', min: 15 },
  { label: 'מונה E570', match: 'E570', min: 10 },
  { label: 'מונה PM135', match: 'PM135', min: 5 },
] as const;
export interface LowMeter { label: string; match: string; total: number; min: number; found: boolean }

/** lowStockReport(): which meter rules are under their red line, company-wide (over the pool). */
export function lowStockReport(pool: Record<string, number> | null | undefined): { meters: LowMeter[] } {
  const meters = METER_RULES.map(rule => {
    let total = 0, found = false;
    for (const [p, q] of Object.entries(pool || {})) {
      if (p.indexOf('מונה') === 0 && p.indexOf(rule.match) !== -1) { total += q; found = true; }
    }
    return { label: rule.label, match: rule.match, total, min: rule.min, found };
  }).filter(m => m.found && m.total < m.min);
  return { meters };
}

/** isLowItem(): is this product name one of the currently-low meter rules? */
export const isLowItem = (name: string, report: { meters: LowMeter[] }): boolean =>
  name.indexOf('מונה') === 0 && report.meters.some(m => name.indexOf(m.match) !== -1);

/** lowStockLines() ports renderLowStockAlert's split: a red task-line for everyone except
 * אביאם/עמיחי (who get the banner line instead — S4). */
export function lowStockLines(report: { meters: LowMeter[] }, user: string): { taskLines: string[]; bannerLines: string[] } {
  const orderers = user === 'אביאם' || user === 'עמיחי';
  return {
    taskLines: orderers ? [] : report.meters.map(m =>
      `🔴 מלאי המונים בחברה ירד מתחת לקו האדום, ישנם ${m.total} מסוג "${m.label}" (קו אדום: ${m.min})`),
    bannerLines: orderers ? report.meters.map(m => `${m.label}: נותרו ${m.total} (קו אדום ${m.min})`) : [],
  };
}

export interface PoolViewRow { name: string; qty: number; low: boolean; negative: boolean }
export interface PoolViewGroup { category: string; rows: PoolViewRow[] }
export interface PoolView { productCount: number; totalUnits: number; lowCount: number; names: string[]; groups: PoolViewGroup[] }

/** poolView(): S9/S11 — the pool list grouped by category, plus the three KPI numbers. פריטים
 * במאגר and מלאי נמוך are over the WHOLE pool (they clear/set the filter); יחידות sums only the
 * rows the current filter shows. */
export function poolView(
  pool: Record<string, number>, catMap: Record<string, string>,
  report: { meters: LowMeter[] }, filter: '' | 'low',
): PoolView {
  let names = sortByCategoryThenName(Object.keys(pool), catMap);
  if (filter === 'low') names = names.filter(n => isLowItem(n, report));
  const groups: PoolViewGroup[] = [];
  for (const n of names) {
    const category = catMap[n] || 'אחר';
    if (!groups.length || groups[groups.length - 1].category !== category) groups.push({ category, rows: [] });
    groups[groups.length - 1].rows.push({ name: n, qty: pool[n], low: isLowItem(n, report), negative: pool[n] < 0 });
  }
  return {
    productCount: Object.keys(pool).length,
    totalUnits: names.reduce((s, n) => s + pool[n], 0),
    lowCount: Object.keys(pool).filter(n => isLowItem(n, report)).length,
    names, groups,
  };
}

// ───────────────────────────── §6 kibbutz views + CSV (task L2) ─────────────────────────────

/** Locations the "what was supplied to kibbutzim" view must never show (S13). */
export const KIBBUTZ_EXCLUDED = [...NON_KIBBUTZ_LOCATIONS, ...LEGACY_PERSON_LOCATIONS];

export const kibbutzLocations = (stock: Record<string, Record<string, number>>): string[] =>
  Object.keys(stock).filter(l => l && !KIBBUTZ_EXCLUDED.includes(l)).sort((a, b) => a.localeCompare(b, 'he'));

export interface KibbutzCard { kibbutz: string; items: Array<[string, number]>; totalUnits: number }

/** kibbutzCards(): the phone accordion (S13) — non-zero items only, a kibbutz with nothing to
 * show is dropped entirely (not an empty card). */
export function kibbutzCards(stock: Record<string, Record<string, number>>): KibbutzCard[] {
  return kibbutzLocations(stock)
    .map(k => {
      const items = Object.entries(stock[k] || {})
        .filter(([, q]) => q !== 0)
        .sort((a, b) => a[0].localeCompare(b[0], 'he')) as Array<[string, number]>;
      return { kibbutz: k, items, totalUnits: items.reduce((s, [, q]) => s + q, 0) };
    })
    .filter(c => c.items.length > 0);
}

export interface KibbutzMatrix { kibbutzim: string[]; products: string[]; cells: number[][]; totals: number[] }

/** kibbutzMatrix(): the desktop matrix (S13) — every product non-zero SOMEWHERE, zero cells kept. */
export function kibbutzMatrix(stock: Record<string, Record<string, number>>): KibbutzMatrix {
  const kibbutzim = kibbutzLocations(stock);
  const all = new Set<string>();
  kibbutzim.forEach(k => Object.keys(stock[k] || {}).forEach(p => all.add(p)));
  const products = [...all]
    .filter(p => kibbutzim.some(k => (stock[k]?.[p] || 0) !== 0))
    .sort((a, b) => a.localeCompare(b, 'he'));
  const cells = kibbutzim.map(k => products.map(p => stock[k]?.[p] || 0));
  return { kibbutzim, products, cells, totals: cells.map(row => row.reduce((s, q) => s + q, 0)) };
}

/** poolCsvRows() = invExportStock's rows, before the CSV text encoding (S14). */
export const poolCsvRows = (pool: Record<string, number>): Array<Array<string | number>> =>
  [['פריט', POOL], ...Object.keys(pool).sort((a, b) => a.localeCompare(b, 'he')).map(p => [p, pool[p]])];

/** kibbutzCsvRows() = invExportKibbutzInventory's rows — EVERY product non-zero somewhere,
 * including a kibbutz's zero cell for it (unlike the matrix, which hides an all-zero column) —
 * plus a per-row total (S15). */
export function kibbutzCsvRows(stock: Record<string, Record<string, number>>): Array<Array<string | number>> {
  const ks = kibbutzLocations(stock);
  const all = new Set<string>();
  ks.forEach(k => Object.keys(stock[k] || {}).forEach(p => all.add(p)));
  const products = [...all].sort((a, b) => a.localeCompare(b, 'he'));
  return [
    ['קיבוץ', ...products, 'סה"כ'],
    ...ks.map(k => {
      const row = products.map(p => stock[k]?.[p] || 0);
      return [k, ...row, row.reduce((s: number, q) => s + (q as number), 0)];
    }),
  ];
}

/** csvText(): invDownloadCSV's byte encoding — BOM + quoted, comma-joined, `"` doubled (S14). */
export const csvText = (rows: ReadonlyArray<ReadonlyArray<string | number>>): string =>
  '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

// ───────────────────────────── §7 the order machine (task L3) ─────────────────────────────
// Ported 1:1 from js/src/07-orders.js (getOrderQuickAction, orderType/orderKibbutz/
// isDirectSupply/orderNeedsAmichai/canApproveThisOrder/approvalWaitingMsg, distinctSuppliers,
// approveSupplierOrder/approveCustomerOrder, invSaveOrder) and 05-meeting-returns.js
// (returnToStock). Copy is cleaned up per the round-5 copy gate; the RULES are the same, with
// D6/O18a/O18b FIXED (each a named test against the old value, per §10 risk 11).

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_approval: 'ממתינה לאישור',
  pending: 'ממתין להזמנה',
  in_transit: 'בדרך',
  stuck: 'תקוע',
  at_port: 'בנמל',
  arrived: 'הגיעה',
  delivered: 'סופקה',
  supplied: 'סופק ללקוח',
};
export const CLOSED_STATUSES = ['delivered', 'supplied', 'cancelled', 'deleted'];

export function orderType(o: Pick<OrderLike, 'orderType'> & { notes?: string } | null | undefined): 'customer' | 'supplier' {
  return (o?.orderType as 'customer' | 'supplier') || (/בקשת לקוח/.test(o?.notes || '') ? 'customer' : 'supplier');
}
export function isDirectSupply(o: OrderLike & { notes?: string } | null | undefined): boolean {
  return orderType(o) === 'customer' && String(o?.assignee ?? '') === 'ספק ישיר';
}
export function orderKibbutz(o: OrderLike | null | undefined, reqs: ReadonlyArray<ReqLike> | null | undefined): string {
  if (o?.kibbutz) return o.kibbutz;
  const m = /בקשת לקוח\s*[—-]\s*([^\n(]+)/.exec(String((o as any)?.notes || ''));
  if (m) return m[1].trim();
  const req = (reqs || []).find(r => r.linkedOrderId === o?.id && r.kibbutz);
  return req?.kibbutz || '';
}
export function orderTotalQty(o: OrderLike | null | undefined): number {
  return (o?.items || []).reduce((s, i) => s + (parseInt(String(i?.qty ?? ''), 10) || 0), 0);
}
export function orderNeedsAmichai(o: OrderLike & { notes?: string } | null | undefined): boolean {
  return orderType(o) === 'supplier' && orderTotalQty(o) > 10;
}
export function canApproveThisOrder(o: OrderLike & { notes?: string } | null | undefined, me: string): boolean {
  if (me === 'עמיחי') return true;
  if (orderType(o) === 'customer') return me === 'אביאם' || me === 'ניתאי';
  return orderTotalQty(o) <= 10 && me === 'אביאם';
}
export function approvalWaitingMsg(o: OrderLike & { notes?: string } | null | undefined): string {
  if (orderType(o) === 'customer') return 'ממתין לאישור אביאם או ניתאי';
  return orderNeedsAmichai(o) ? 'מעל 10 פריטים, ממתין לאישור עמיחי' : 'ממתין לאישור אביאם';
}
export const canApproveOrders = (me: string): boolean => me === 'אביאם' || me === 'עמיחי' || me === 'ניתאי';

/** getOrderQuickAction (O4): the one-tap advance for a supplier order. Customer orders have none. */
export function quickAction(o: OrderLike & { notes?: string } | null | undefined): { next: string; label: string } | null {
  if (orderType(o) === 'customer') return null;
  switch (o?.status) {
    case 'pending': return { next: 'in_transit', label: 'הוזמן' };
    case 'in_transit': return { next: 'at_port', label: 'בנמל' };
    case 'at_port': return { next: 'arrived', label: 'התקבל' };
    case 'stuck': return { next: 'arrived', label: 'התקבל' };
    case 'arrived': return { next: 'delivered', label: 'נכנס למלאי' };
    default: return null;
  }
}
export function canMarkStuck(o: OrderLike & { notes?: string } | null | undefined): boolean {
  if (orderType(o) === 'customer') return false;
  const blocked = ['delivered', 'supplied', 'stuck', 'pending_approval'];
  return !blocked.includes(String(o?.status ?? ''));
}

/** editStatusOptions: what the edit sheet's status picker offers. `[]` while pending_approval —
 * O18b's fix is "no picker", not "a picker with a status that doesn't exist". */
export function editStatusOptions(o: OrderLike & { notes?: string } | null | undefined): string[] {
  if (o?.status === 'pending_approval') return [];
  return orderType(o) === 'customer'
    ? ['supplied']
    : ['pending', 'in_transit', 'stuck', 'at_port', 'arrived', 'delivered'];
}

export function filterOrders(orders: ReadonlyArray<OrderLike> | null | undefined, filter: string): OrderLike[] {
  const open = (orders || []).filter(o => o.status !== 'deleted');
  if (filter === 'all') return open;
  if (filter) return open.filter(o => o.status === filter);
  return open.filter(o => !CLOSED_STATUSES.includes(String(o.status)));
}

export function distinctSuppliers(orders: ReadonlyArray<OrderLike> | null | undefined): string[] {
  const seen = new Set<string>();
  for (const o of orders || []) { const s = String(o.supplier ?? '').trim(); if (s) seen.add(s); }
  return [...seen].sort((a, b) => a.localeCompare(b, 'he'));
}

export interface DraftItem { name: string; qty: number; auto?: boolean; choose?: string[]; label?: string }
export function newItemRow(catalog: ReadonlyArray<string>): DraftItem {
  return { name: catalog[0] || 'מונה 360PP', qty: 1 };
}

export function orderFormFields(
  type: 'customer' | 'supplier', assignee: string | undefined, me: string, isNew: boolean,
): { supplier: boolean; kibbutz: boolean; assignee: boolean; raw: boolean } {
  const isCust = type === 'customer';
  const isDirect = isCust && assignee === 'ספק ישיר';
  return {
    supplier: !isCust || isDirect,
    kibbutz: isCust,
    assignee: isCust && (me === 'עידן' || me === 'עמיחי'),
    raw: isNew,
  };
}

// ── approval ──

export interface ReqLike { id: string; kibbutz?: string; linkedOrderId?: string; status?: string }
export interface Ctx { me: string; movements: ReadonlyArray<Partial<Movement>>; requirements: ReadonlyArray<ReqLike>; hasSite?: (k: string) => boolean }
export interface EmsTaskPlan { kind: 'createTask'; kibbutz: string; title: string; description: string; assigneeName: string }
export interface ApprovalPlan {
  kind: 'supplier' | 'dropship' | 'customer'; error?: string; confirm: string;
  patch: { status: 'pending' | 'supplied' }; movements: Movement[]; ems?: EmsTaskPlan; fulfil: string[];
}

/** approvalPlan (O10-O13): what אישור/אישור ואספקה does, for every order kind. */
export function approvalPlan(o: OrderLike & { notes?: string } | null | undefined, ctx: Ctx): ApprovalPlan {
  if (!canApproveThisOrder(o, ctx.me)) {
    return { kind: 'supplier', error: 'אין הרשאה לאשר את ההזמנה הזו. ' + approvalWaitingMsg(o), confirm: '', patch: { status: 'pending' }, movements: [], fulfil: [] };
  }
  if (orderType(o) === 'customer') {
    if (isDirectSupply(o)) {
      const fulfil = ctx.requirements.filter(r => r.linkedOrderId === o?.id && r.status !== 'fulfilled').map(r => r.id);
      return {
        kind: 'dropship',
        confirm: 'לאשר אספקה ישירה מהספק' + (o?.supplier ? ' (' + o.supplier + ')' : '') + '?\nלא יירד מהמלאי ולא תיפתח משימת EMS, ההזמנה תסומן "סופק ללקוח".',
        patch: { status: 'supplied' }, movements: [], fulfil,
      };
    }
    const kibbutz = orderKibbutz(o, ctx.requirements);
    if (!kibbutz) return { kind: 'customer', error: 'לא זוהה קיבוץ להזמנה, לא ניתן לאשר אספקת לקוח.', confirm: '', patch: { status: 'supplied' }, movements: [], fulfil: [] };
    if (ctx.hasSite && !ctx.hasSite(kibbutz)) {
      return { kind: 'customer', error: `לקיבוץ "${kibbutz}" אין אתר EMS מקושר. צריך לקשר או ליצור את האתר ב-EMS לפני אישור ההזמנה.`, confirm: '', patch: { status: 'supplied' }, movements: [], fulfil: [] };
    }
    const items = orderItems(o);
    if (!items.length) return { kind: 'customer', error: 'אין פריטים בהזמנה.', confirm: '', patch: { status: 'supplied' }, movements: [], fulfil: [] };
    const already = alreadyPosted(ctx.movements, String(o?.id ?? ''), 'customer_supply');
    const movements = already ? [] : orderApprovalRows(o, ctx.me);
    const responsible = o?.assignee || ctx.me;
    // The EMS description lists the RAW (unmerged) lines, in order — byte-exact with 07:564.
    const rawLines = (o?.items || []).filter(i => i?.name && (parseInt(String(i.qty ?? ''), 10) || 0) > 0);
    const description = `אספקת ציוד ל${kibbutz}: אושר ע"י ${ctx.me}` + (o?.assignee ? ` · אחראי: ${o.assignee}` : '') +
      '\n' + rawLines.map(i => `• ${i.name} ×${i.qty}`).join('\n');
    const fulfil = ctx.requirements.filter(r => r.linkedOrderId === o?.id && r.status !== 'fulfilled').map(r => r.id);
    return {
      kind: 'customer',
      confirm: `לאשר אספקת לקוח?\nירד ממלאי החברה → "${kibbutz}", ותיפתח משימת "אספקת ציוד" ב-EMS` + (o?.assignee ? ` באחריות ${o.assignee}` : '') + '.',
      patch: { status: 'supplied' }, movements,
      ems: { kind: 'createTask', kibbutz, title: 'אספקת ציוד: ' + kibbutz, description, assigneeName: responsible },
      fulfil,
    };
  }
  // supplier
  return { kind: 'supplier', confirm: 'לאשר הזמנת ספק? תעבור ל"ממתין להזמנה".', patch: { status: 'pending' }, movements: [], fulfil: [] };
}

// ── save ──

export interface OrderDraft {
  id?: string; orderType: 'supplier' | 'customer'; supplier?: string; kibbutz?: string; assignee?: string;
  expectedDate?: string; notes?: string; raw?: string; status?: string; origStatus?: string;
  createdBy?: string; items: Array<DraftItem>; importedReqIds?: string[];
}
export interface SavePlan {
  errors: string[]; unknown: string[]; body: Record<string, unknown>; delivery: boolean; fulfil: string[];
  reqLinks: Array<{ id: string; status: string; linkedOrderId: string }>;
  learn?: { rawText: string; items: Array<{ name: string; qty: number }> }; pushPending: boolean;
}
export interface SaveCtx { catalog: ReadonlyArray<string>; movements: ReadonlyArray<Partial<Movement>>; requirements: ReadonlyArray<ReqLike>; me: string }

/** orderSavePlan (O16-O19, O27-O28; D6/O18a/O18b fixed): what 💾 שמור הזמנה does. */
export function orderSavePlan(draft: OrderDraft, ctx: SaveCtx): SavePlan {
  const errors: string[] = [];
  // O27 (ruling: no add-to-catalog): a non-catalog line blocks save; the only recovery is
  // removing it, never adding it.
  const unknown = [...new Set(draft.items.filter(it => it.name && !ctx.catalog.includes(it.name)).map(it => it.name))];
  if (unknown.length) errors.push('פריטים שלא בקטלוג: ' + unknown.join(', ') + '. אפשר להסיר אותם מההזמנה');
  if (!draft.items.length) errors.unshift('צריך לפחות פריט אחד');
  const unresolvedChoice = draft.items.find(it => !it.name && it.choose && it.choose.length);
  if (unresolvedChoice) errors.unshift(`יש שורת ספק כוח בלי סוג. בחירה: ${unresolvedChoice.choose!.join(' או ')}`);
  if (!draft.createdBy) errors.push('חסר מי יצר את ההזמנה');
  if (draft.orderType === 'customer' && !draft.id && !draft.kibbutz) errors.push('חסר קיבוץ להזמנת לקוח');

  // O18b fix: an existing pending_approval order keeps that status no matter what the picker
  // shows (there is no matching option for it, so its "value" is not to be trusted).
  const status = !draft.id
    ? 'pending_approval'
    : (draft.origStatus === 'pending_approval' ? 'pending_approval' : (draft.status || draft.origStatus || 'pending'));
  // O18a fix: unchanged from arrived stays arrived — "delivered" only counts as a REAL
  // transition, not the dropdown's stale display value.
  const delivery = !!draft.id && status === 'delivered' && draft.origStatus !== 'delivered';

  const baseItems = draft.items.filter(it => !it.auto && it.name).map(it => ({ name: it.name, qty: it.qty }));
  let notes = (draft.notes || '').trim();
  if (!draft.id && draft.raw) notes = (notes ? notes + '\n' : '') + '📥 דרישת לקוח גולמית:\n' + draft.raw;

  const body: Record<string, unknown> = {
    status, items: draft.items.filter(it => it.name).map(it => ({ name: it.name, qty: it.qty })),
    supplier: draft.supplier || '', notes, createdBy: draft.createdBy, orderType: draft.orderType,
  };
  if (draft.orderType === 'customer' && draft.kibbutz) body.kibbutz = draft.kibbutz;
  if (draft.assignee) body.assignee = draft.assignee;

  const fulfil: string[] = [];
  const reqLinks: SavePlan['reqLinks'] = [];
  if (draft.importedReqIds?.length && (draft.id || true)) {
    const reqStatus = status === 'delivered' ? 'fulfilled' : 'in_progress';
    for (const rid of draft.importedReqIds) reqLinks.push({ id: rid, status: reqStatus, linkedOrderId: draft.id || '' });
  }
  if (delivery) {
    for (const r of ctx.requirements) if (r.linkedOrderId === draft.id && r.status !== 'fulfilled') fulfil.push(r.id);
  }

  return {
    errors, unknown, body, delivery, fulfil, reqLinks,
    learn: draft.raw ? { rawText: draft.raw, items: baseItems } : undefined,
    pushPending: !draft.id,
  };
}

export interface StatusPlan { error?: string; patch: { status: string }; movements: Movement[]; fulfil: string[] }

/** orderStatusPlan (D6 fix): quickAction()/quickOrderStatus's target behaviour — arrived→delivered
 * posts the ONE ספק→חברה line per item (today's quickOrderStatus posts nothing at all). */
export function orderStatusPlan(o: OrderLike & { notes?: string } | null | undefined, next: string, ctx: Ctx): StatusPlan {
  const isDelivery = next === 'delivered' && orderType(o) !== 'customer';
  if (!isDelivery) return { patch: { status: next }, movements: [], fulfil: [] };
  const already = alreadyPosted(ctx.movements, String(o?.id ?? ''), 'order_delivery');
  const items: Array<[string, number]> = [];
  for (const it of o?.items || []) {
    const name = String(it?.name ?? '').trim();
    const q = parseInt(String(it?.qty ?? ''), 10) || 0;
    if (!name || q <= 0) continue;
    const hit = items.find(([n]) => n === name);
    if (hit) hit[1] += q; else items.push([name, q]);
  }
  const movements: Movement[] = already ? [] : items.map(([product, quantity]) => ({
    product, fromLocation: SUPPLIER_LOC, toLocation: POOL, quantity, reason: 'order_delivery',
    refId: String(o?.id ?? ''), createdBy: ctx.me,
  }));
  const fulfil = ctx.requirements.filter(r => r.linkedOrderId === o?.id && r.status !== 'fulfilled').map(r => r.id);
  return { patch: { status: next }, movements, fulfil };
}

// ── notices ──

export function amichaiPending(orders: ReadonlyArray<OrderLike & { notes?: string }> | null | undefined, me: string): OrderLike[] {
  if (me !== 'עמיחי') return [];
  return (orders || []).filter(o => o.status === 'pending_approval' && orderNeedsAmichai(o));
}

export interface FreshApproved { seed: string[]; fresh: OrderLike[] }
/** freshApprovedOrders (O15): first run seeds (never floods); afterwards, approved + unseen +
 * not-mine is "fresh". */
export function freshApprovedOrders(
  orders: ReadonlyArray<OrderLike & { createdBy?: string }> | null | undefined,
  seen: ReadonlyArray<string> | null, me: string,
): FreshApproved {
  const approved = (orders || []).filter(o => o.status && !['pending_approval', 'deleted'].includes(String(o.status)));
  if (seen === null) return { seed: approved.map(o => String(o.id)), fresh: [] };
  const fresh = approved.filter(o => !seen.includes(String(o.id)) && (o as any).createdBy !== me);
  return { seed: [], fresh };
}

// ── returns (S18) ──

export interface ReturnLike { id: string; kibbutz?: string; product: string; qty: number; status?: string }
export interface RestockPlan { error?: string; movements: Movement[]; patch?: { status: 'restocked' } }

/** restockPlan (S18): ✅ החזר למלאי — <kibbutz> → חברה, once (refId+reason guard, same as every
 * other movement path). */
export function restockPlan(r: ReturnLike, ctx: { me: string; movements: ReadonlyArray<Partial<Movement>> }): RestockPlan {
  const qty = Number(r.qty) || 0;
  if (qty <= 0) return { error: 'כמות לא תקינה', movements: [] };
  const from = String(r.kibbutz ?? '').trim();
  if (!from) return { error: 'לא ידוע מאיזה קיבוץ הוחזר הפריט, אי אפשר להחזיר למלאי', movements: [] };
  if (alreadyPosted(ctx.movements, r.id, 'return_restock')) {
    return { error: 'הפריט כבר הוחזר למלאי, לא נרשמה תנועה נוספת', movements: [] };
  }
  return {
    movements: [{ product: r.product, fromLocation: from, toLocation: POOL, quantity: qty, reason: 'return_restock', refId: r.id, createdBy: ctx.me }],
    patch: { status: 'restocked' },
  };
}
