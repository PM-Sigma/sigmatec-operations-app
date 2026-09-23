// 📦 Package I (inventory rewrite) — the ONE fixture set every characterization spec (L1b–L1d)
// and every later U spec shares. Two shapes of the SAME data:
//   · INVENTORY        — DB snake_case rows, as Supabase would return them (fed to
//     installRoutes(page,{inventory:true}) for delivery_certs/kibbutz_details/site_contacts,
//     which the legacy code reads over Supabase even in `sb=0` mode — see js/src/20-delivery-cert.js
//     `_sbCertGet`).
//   · toSheet(INVENTORY) — legacy camelCase, spread into window.SHEET_DATA via the mock seam
//     (js/src/01-data.js `mockSheetData()` → `...(window.__MOCK_EXTRA || {})`) for
//     products/orders/movements/requirements/returns.
//
// The pool numbers are load-bearing and must stay exactly what js/src/01-data.js's own mock
// produces today (inventory-pool.spec.ts, product-names.spec.ts already assert them):
//   מונה Landis+Gyr E360PP 37 · בקר 504 12 · סים 1NCE 4 · מונה PM135 2 (below its red line, 5).
// Everything ADDED here (orders/requirements/returns/certs/contacts) is new surface for the
// order/cert/returns/role flows (F02–F09, F13, F16–F23) and must never change that arithmetic.

export interface InvProductRow {
  id: string; name: string; category: string; active: boolean;
  display_name?: string | null; min_qty?: number | null; unit?: string | null;
  created_at?: string; created_by?: string;
}
export interface InvOrderRow {
  id: string; created_at: string; created_by: string; supplier: string; status: string;
  items: Array<{ name: string; qty: number }>; expected_date: string; notes: string;
  delivered_at: string; distribution: Record<string, unknown>; order_type: string;
  kibbutz: string; assignee: string;
}
export interface InvMovementRow {
  id: string; date: string; product: string; from_location: string; to_location: string;
  quantity: number; reason: string; ref_id: string; created_by: string;
}
export interface InvRequirementRow {
  id: string; created_at: string; created_by: string; kibbutz: string; contact_name: string;
  items: Array<{ name: string; qty: number }>; notes: string; status: string;
  linked_order_id: string; fulfilled_at: string;
}
export interface InvReturnRow {
  id: string; visit_id: string; date: string; kibbutz: string; visitor: string;
  product: string; qty: number; reason: string; status: string;
}
export interface InvCertRow {
  id: string; cert_number: number | null; cert_date: string; kibbutz: string;
  customer: { name: string; company_id: string; address: string; contact: string };
  items: Array<{ name: string; qty: number }>; notes: string; source: string; ref_id: string;
  created_by: string; status: string; replaced_by: number; recipient: string;
  signature: string; doc_html: string; drive_url: string;
}
export interface InvContactRow {
  id: string; kibbutz: string; name: string; role: string; email: string; phone: string; active: boolean;
}
export interface InvDetailsRow {
  kibbutz: string; legal_name: string; company_id: string; address: string; contact: string;
}

export interface Inventory {
  products: InvProductRow[];
  orders: InvOrderRow[];
  movements: InvMovementRow[];
  requirements: InvRequirementRow[];
  returns: InvReturnRow[];
  delivery_certs: InvCertRow[];
  kibbutz_details: InvDetailsRow[];
  site_contacts: InvContactRow[];
}

const PRODUCTS: InvProductRow[] = [
  { id: 'p-1', name: 'מונה Landis+Gyr E360PP', category: 'מונה', active: true, min_qty: 15 },
  { id: 'p-2', name: 'בקר 504', category: 'בקר', active: true, min_qty: null },
  { id: 'p-3', name: 'סים 1NCE', category: 'סים', active: true, min_qty: null },
  { id: 'p-4', name: 'מונה PM135', category: 'מונה', active: true, min_qty: 5 },
];

// The pool-affecting rows are UNCHANGED from js/src/01-data.js mockMovements()/mockOrders() —
// only re-dated to fixed calendar days (the legacy mock used addDays(), which drifts with the
// clock; a characterization golden needs a fixed ledger). ord-1/ord-2 are the delivery orders
// the movements reference by ref_id, so an order lookup from a movement's refId resolves.
const ORD1: InvOrderRow = { id: 'ord-1', created_at: '2026-09-03T08:00:00Z', created_by: 'עידן', supplier: 'לנדיס', status: 'delivered', items: [{ name: 'מונה Landis+Gyr E360PP', qty: 40 }, { name: 'בקר 504', qty: 12 }], expected_date: '', notes: '', delivered_at: '2026-09-13T08:00:00Z', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' };
const ORD2: InvOrderRow = { id: 'ord-2', created_at: '2026-09-20T08:00:00Z', created_by: 'עמיחי', supplier: 'לנדיס', status: 'delivered', items: [{ name: 'סים 1NCE', qty: 4 }, { name: 'מונה PM135', qty: 2 }], expected_date: '', notes: '', delivered_at: '2026-09-22T08:00:00Z', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' };
const ORD3: InvOrderRow = { id: 'ord-3', created_at: '2026-09-17T08:00:00Z', created_by: 'עמיחי', supplier: 'לנדיס', status: 'arrived', items: [{ name: 'מונה Landis+Gyr E360PP', qty: 20 }], expected_date: '', notes: '', delivered_at: '', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' };

// New surface for the order-flow characterization (F01–F09, F21, F22): one small + one big
// (>10) supplier order awaiting approval, one customer order, one drop-ship customer order, and
// one already-closed order dated BEFORE the round-5 edit-lock breakpoint (2026-09-01) so F01's
// default "open" filter and the new lock rule both have something real to assert against.
const ORD_S_SMALL: InvOrderRow = { id: 'ord-s-small', created_at: '2026-09-20T08:00:00Z', created_by: 'ניתאי', supplier: 'לנדיס', status: 'pending_approval', items: [{ name: 'בקר 504', qty: 4 }], expected_date: '2026-09-20', notes: '', delivered_at: '', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' };
const ORD_S_BIG: InvOrderRow = { id: 'ord-s-big', created_at: '2026-09-20T09:00:00Z', created_by: 'אביאם', supplier: 'לנדיס', status: 'pending_approval', items: [{ name: 'מונה Landis+Gyr E360PP', qty: 11 }], expected_date: '', notes: '', delivered_at: '', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' };
const ORD_C: InvOrderRow = { id: 'ord-c', created_at: '2026-09-21T08:00:00Z', created_by: 'עידן', supplier: '', status: 'pending_approval', items: [{ name: 'מונה Landis+Gyr E360PP', qty: 2 }, { name: 'בקר 504', qty: 1 }], expected_date: '', notes: 'בקשת לקוח: חוקוק', delivered_at: '', distribution: {}, order_type: 'customer', kibbutz: 'חוקוק', assignee: '' };
const ORD_D: InvOrderRow = { id: 'ord-d', created_at: '2026-09-21T09:00:00Z', created_by: 'עידן', supplier: 'סאטק', status: 'pending_approval', items: [{ name: 'מונה PM135', qty: 3 }], expected_date: '', notes: '', delivered_at: '', distribution: {}, order_type: 'customer', kibbutz: 'דגניה', assignee: 'ספק ישיר' };
const ORD_OLD: InvOrderRow = { id: 'ord-old', created_at: '2026-08-01T08:00:00Z', created_by: 'עמיחי', supplier: 'לנדיס', status: 'delivered', items: [{ name: 'בקר 504', qty: 12 }], expected_date: '', notes: '', delivered_at: '2026-08-10T08:00:00Z', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' };

const MOVEMENTS: InvMovementRow[] = [
  { id: 'mov-1', date: '2026-09-03', product: 'מונה Landis+Gyr E360PP', from_location: 'ספק', to_location: 'חברה', quantity: 40, reason: 'order_delivery', ref_id: 'ord-1', created_by: 'עידן' },
  { id: 'mov-2', date: '2026-09-13', product: 'בקר 504', from_location: 'ספק', to_location: 'חברה', quantity: 12, reason: 'order_delivery', ref_id: 'ord-1', created_by: 'עידן' },
  { id: 'mov-3', date: '2026-09-19', product: 'מונה Landis+Gyr E360PP', from_location: 'חברה', to_location: 'חוקוק', quantity: 3, reason: 'visit_supply', ref_id: 'vis-אביאם', created_by: 'אביאם' },
  { id: 'mov-4', date: '2026-09-21', product: 'סים 1NCE', from_location: 'ספק', to_location: 'חברה', quantity: 4, reason: 'order_delivery', ref_id: 'ord-2', created_by: 'עמיחי' },
  { id: 'mov-5', date: '2026-09-22', product: 'מונה PM135', from_location: 'ספק', to_location: 'חברה', quantity: 2, reason: 'order_delivery', ref_id: 'ord-2', created_by: 'עמיחי' },
];

const REQUIREMENTS: InvRequirementRow[] = [
  { id: 'req-1', created_at: '2026-09-21T08:00:00Z', created_by: 'עידן', kibbutz: 'חוקוק', contact_name: '', items: [{ name: 'בקר 504', qty: 1 }], notes: '', status: 'in_progress', linked_order_id: 'ord-c', fulfilled_at: '' },
];

const RETURNS: InvReturnRow[] = [
  { id: 'ret-1', visit_id: 'vis-אביאם', date: '2026-09-19', kibbutz: 'חוקוק', visitor: 'אביאם', product: 'מונה Landis+Gyr E360PP', qty: 1, reason: 'לא מתקשר', status: 'open' },
  { id: 'ret-2', visit_id: 'vis-אביאם', date: '2026-09-19', kibbutz: 'חוקוק', visitor: 'אביאם', product: 'בקר 504', qty: 1, reason: '', status: 'open' },
];

const CERTS: InvCertRow[] = [
  { id: '00000000-0000-4000-8000-000000001041', cert_number: 1041, cert_date: '2026-09-02', kibbutz: 'חוקוק', customer: { name: 'חוקוק אגש"ח', company_id: '570000001', address: 'חוקוק', contact: 'דני' }, items: [{ name: 'מונה Landis+Gyr E360PP', qty: 3 }], notes: '', source: 'visit', ref_id: 'vis-אביאם', created_by: 'אביאם', status: 'active', replaced_by: 0, recipient: 'דני', signature: '', doc_html: '', drive_url: '' },
  { id: '00000000-0000-4000-8000-000000001042', cert_number: 1042, cert_date: '2026-09-15', kibbutz: 'דגניה', customer: { name: 'דגניה', company_id: '', address: 'דגניה', contact: '' }, items: [{ name: 'בקר 504', qty: 1 }], notes: 'לא לחיוב', source: 'manual', ref_id: '', created_by: 'עידן', status: 'cancelled', replaced_by: 1043, recipient: '', signature: '', doc_html: '', drive_url: '' },
];

const CONTACTS: InvContactRow[] = [
  { id: 'sc-1', kibbutz: 'חוקוק', name: 'דני', role: 'site_manager', email: 'dani@example.com', phone: '0501234567', active: true },
];

const DETAILS: InvDetailsRow[] = [
  { kibbutz: 'חוקוק', legal_name: 'חוקוק אגש"ח', company_id: '570000001', address: 'חוקוק', contact: 'דני' },
];

export const INVENTORY: Inventory = {
  products: PRODUCTS,
  orders: [ORD1, ORD2, ORD3, ORD_S_SMALL, ORD_S_BIG, ORD_C, ORD_D, ORD_OLD],
  movements: MOVEMENTS,
  requirements: REQUIREMENTS,
  returns: RETURNS,
  delivery_certs: CERTS,
  kibbutz_details: DETAILS,
  site_contacts: CONTACTS,
};

/** DB snake_case → the legacy SHEET_DATA camelCase shape (mirrors 01-data.js readSnapshot). */
export function toSheet(inv: Inventory) {
  return {
    products: inv.products.map(p => ({
      id: p.id, name: p.name, category: p.category, active: p.active,
      ...(p.display_name !== undefined ? { display_name: p.display_name } : {}),
    })),
    orders: inv.orders.map(o => ({
      id: o.id, createdAt: o.created_at, createdBy: o.created_by, supplier: o.supplier,
      status: o.status, items: o.items, expectedDate: o.expected_date, notes: o.notes,
      deliveredAt: o.delivered_at, distribution: o.distribution, orderType: o.order_type,
      kibbutz: o.kibbutz, assignee: o.assignee,
    })),
    movements: inv.movements.map(m => ({
      id: m.id, date: m.date, product: m.product, fromLocation: m.from_location,
      toLocation: m.to_location, quantity: m.quantity, reason: m.reason, refId: m.ref_id,
      createdBy: m.created_by,
    })),
    requirements: inv.requirements.map(r => ({
      id: r.id, createdAt: r.created_at, createdBy: r.created_by, kibbutz: r.kibbutz,
      contactName: r.contact_name, items: r.items, notes: r.notes, status: r.status,
      linkedOrderId: r.linked_order_id, fulfilledAt: r.fulfilled_at,
    })),
    returns: inv.returns.map(r => ({
      id: r.id, visitId: r.visit_id, date: r.date, kibbutz: r.kibbutz, visitor: r.visitor,
      product: r.product, qty: r.qty, reason: r.reason, status: r.status,
    })),
  };
}
