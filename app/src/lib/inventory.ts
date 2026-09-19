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
    const product = String(m?.product ?? '').trim();
    if (!product) continue;
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
    const product = String(m?.product ?? '').trim();
    if (!product) continue;
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
