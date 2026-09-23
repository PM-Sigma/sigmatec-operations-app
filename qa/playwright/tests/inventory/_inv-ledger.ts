// The write ledger every inventory flow spec asserts against (L1a).
//
// EVERY inventory write — legacy or React — ultimately reaches the app's real Supabase tables
// (movements/orders/products/requirements/returns/delivery_certs) or the EMS queue. The legacy
// bundle gets there through ONE client-side pseudo-endpoint, `fetch('sigma:write-router', {body})`
// (js/src/01-data.js), whose body shape (`{type:'order', ...}`) is stable regardless of whether
// the page booted `sb=0` (in-memory mock) or `sb=1` (real Supabase intercepted by installRoutes).
// `fromRouterBody` turns that body into the SAME canonical row shape a direct Supabase write
// would produce, so a flow spec can assert one shape no matter which path wrote it.
import type { Page } from '@playwright/test';

export interface LedgerRow {
  table: string;
  op: 'insert' | 'patch' | 'upsert' | 'rpc' | 'ems';
  match?: string;
  row: Record<string, unknown>;
}

// Volatile / server-stamped fields a golden must not pin down.
const DROP = new Set(['id', 'date', 'created_at', 'last_updated', 'delivered_at', 'fulfilled_at', 'at']);
const clean = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o || {}).filter(([k]) => !DROP.has(k)));

function snakeOrder(b: Record<string, any>): Record<string, unknown> {
  const map: Record<string, string> = {
    status: 'status', items: 'items', supplier: 'supplier', expectedDate: 'expected_date',
    notes: 'notes', createdBy: 'created_by', orderType: 'order_type', kibbutz: 'kibbutz', assignee: 'assignee',
  };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(map)) if (b[k] !== undefined) out[map[k]] = b[k];
  return out;
}

/** Legacy `sigma:write-router` body → the canonical row a direct write would produce. */
export function fromRouterBody(b: any): LedgerRow | null {
  if (!b || !b.type) return null;
  if (b.type === 'movement') {
    return { table: 'movements', op: 'insert', row: clean({
      product: b.product, from_location: b.fromLocation, to_location: b.toLocation,
      quantity: Number(b.quantity), reason: b.reason || 'manual', ref_id: b.refId || '', created_by: b.createdBy || '',
    }) };
  }
  if (b.type === 'order') {
    return b.id
      ? { table: 'orders', op: 'patch', match: String(b.id), row: clean(snakeOrder(b)) }
      : { table: 'orders', op: 'insert', row: clean(snakeOrder(b)) };
  }
  if (b.type === 'requirement') {
    return { table: 'requirements', op: b.id ? 'patch' : 'insert', match: b.id ? String(b.id) : undefined,
      row: clean({ status: b.status, linked_order_id: b.linkedOrderId }) };
  }
  if (b.type === 'return') {
    return { table: 'returns', op: 'patch', match: String(b.id), row: { status: b.status } };
  }
  if (b.type === 'product') {
    // The row W.product ACTUALLY upserts (js/src/01-data.js) — a full-row upsert, on purpose:
    // this is what makes the P13 toggle bug ({type:'product',id,active} blanking name/category)
    // a golden instead of an assumption.
    return { table: 'products', op: 'upsert', match: b.id ? String(b.id) : undefined, row: clean({
      name: b.name ?? '', category: b.category ?? '', active: b.active !== false,
      ...(b.display_name !== undefined ? { display_name: b.display_name } : {}),
    }) };
  }
  if (b.type === 'deliveryCert') {
    return { table: 'delivery_certs', op: 'insert', row: clean({
      kibbutz: b.cert?.kibbutz, items: b.cert?.items, source: b.cert?.source, ref_id: b.cert?.refId,
      notes: b.cert?.notes, customer: b.cert?.customer,
    }) };
  }
  if (b.type === 'deliveryCertCancel') {
    return { table: 'delivery_certs', op: 'patch', match: String(b.id), row: clean({
      status: 'cancelled', ...(b.replacedBy ? { replaced_by: b.replacedBy } : {}),
    }) };
  }
  if (b.type === 'deliveryCertDoc') {
    return { table: 'delivery_certs', op: 'patch', match: String(b.id), row: { doc_html: '<html>' } };
  }
  if (b.type === 'parseCorrection') {
    return { table: 'parse_corrections', op: 'insert', row: { raw_text: b.rawText, items: b.items } };
  }
  // emsQueueAdd (js/src/13-ems.js emsQueueAdd) is how every EMS write actually leaves the app —
  // isEmsConnected() is false in this harness (no token stubbed, EMS stays offline on purpose:
  // "no production writes"), so createTask/comment items always take this path, never the live one.
  if (b.type === 'emsQueueAdd') {
    return { table: 'ems', op: 'ems', row: clean(b.item || {}) };
  }
  return null;
}

/** Installed AFTER boot: wraps the page's fetch so every `sigma:write-router` body is captured. */
export async function recordLegacyWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__invWrites = w.__invWrites || [];
    if (w.__invWritesWrapped) return;
    w.__invWritesWrapped = true;
    const inner = w.fetch;
    w.fetch = function (url: any, opts: any) {
      if (typeof url === 'string' && url.indexOf('sigma:write-router') === 0 && opts && opts.body) {
        try { w.__invWrites.push(JSON.parse(opts.body)); } catch { /* not JSON */ }
      }
      return inner.apply(this, arguments as any);
    };
  });
}

/**
 * The write ledger so far: legacy `sigma:write-router` bodies (translated to canonical rows) +
 * anything a direct Supabase-route write recorded into `window.__invRouteWrites` (the REST-level
 * recorder `installRoutes({inventory:true})` exposes for a future React driver — empty for the
 * legacy driver today, since every legacy write already goes through `sigma:write-router`).
 * Sorted so array-equality assertions don't depend on network/microtask ordering.
 */
export async function ledger(page: Page): Promise<LedgerRow[]> {
  const { legacy, routes } = await page.evaluate(() => ({
    legacy: (window as any).__invWrites || [],
    routes: (window as any).__invRouteWrites || [],
  }));
  const rows = [
    ...legacy.map(fromRouterBody).filter(Boolean) as LedgerRow[],
    ...routes.map((r: LedgerRow) => ({ ...r, row: clean(r.row) })),
  ];
  return rows.sort((a, b) =>
    (a.table + a.op + (a.match || '') + JSON.stringify(a.row))
      .localeCompare(b.table + b.op + (b.match || '') + JSON.stringify(b.row)));
}
