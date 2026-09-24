// The React data layer over the pure plans (L3/L4/L5/L7): every write the inventory islands make
// goes through here, over supabase-js directly (never the legacy WRITE_ROUTER_URL fetch intercept
// — that is js/src/01-data.js's own mock/real router for the LEGACY bundle). Mapper parity with
// 01-data.js's writers (orderUpdateRow/writeOrder) is the safety gate: inventoryApi.test.ts lifts
// the legacy source and compares column-for-column, so the two can never quietly drift.
//
// P13 fix, on purpose: setProductActive sends `update({active})` ONLY. The legacy
// invToggleProductActive path goes through W.product's FULL-ROW upsert with no `name` in the
// body, which blanks the product's name to '' — that is the empty-item bug the delete cascade
// (L7, db/inventory_delete_product.sql) exists to clean up. The new path never repeats it.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { getSupabase, sbWrite, SB_URL, SB_ANON } from './supabase';
import { notifySessionExpired } from './session';
import { sigma } from '@/bridge';
import { track } from './track';
import { queryClient } from './query';
import { CERT_LOGO } from './certLogo';
import {
  type Movement, type OrderLike, type ProductRow, type ReqLike, type Ctx, type SaveCtx,
  type OrderDraft, type StatusPlan, type ApprovalPlan, type ReturnLike, type DeletePreview,
  type ParsedItem, type CertRow, type CertLike, type CertPrefillResult, type CertContact,
  POOL, SUPPLIER_LOC, approvalPlan, orderSavePlan, orderStatusPlan, restockPlan,
  parseLocalToItems, certCollect, certDocHtml, certIssueErrors, certViewUrl,
} from './inventory';

// ───────────────────────────── read ─────────────────────────────

export interface ReturnRow extends ReturnLike {
  visitId?: string; date?: string; visitor?: string; reason?: string;
}
export interface MovementRow extends Movement { id: string; date: string }
export interface InvData {
  products: ProductRow[]; orders: OrderLike[]; movements: MovementRow[];
  requirements: ReqLike[]; returns: ReturnRow[];
}

export const INV_KEYS = {
  all: ['inv'] as const,
  certs: (from: string, to: string) => ['inv', 'certs', from, to] as const,
  contacts: (kibbutz: string) => ['inv', 'contacts', kibbutz] as const,
  kibbutzDetails: ['inv', 'kibbutzDetails'] as const,
};

/** fetchInventory: the five tables the inventory screens read, mapped exactly like
 * 01-data.js `readSnapshot` (camelCase, same defaults). */
export async function fetchInventory(): Promise<InvData> {
  const sb = await getSupabase();
  const [p, o, m, r, ret] = await Promise.all([
    sb.from('products').select('*'),
    sb.from('orders').select('*'),
    sb.from('movements').select('*'),
    sb.from('requirements').select('*'),
    sb.from('returns').select('*'),
  ]);
  for (const res of [p, o, m, r, ret]) if (res.error) throw new Error(res.error.message);
  return {
    products: (p.data || []).map((x: any) => ({
      id: String(x.id), name: x.name || '', category: x.category || '', active: !!x.active,
      display_name: x.display_name ?? null, min_qty: x.min_qty ?? null, unit: x.unit ?? null,
    })),
    orders: (o.data || []).map((x: any) => ({
      id: String(x.id), createdAt: x.created_at || '', createdBy: x.created_by || '', supplier: x.supplier || '',
      status: x.status || 'pending', items: x.items || [], expectedDate: x.expected_date || '', notes: x.notes || '',
      deliveredAt: x.delivered_at || '', distribution: x.distribution || {}, orderType: x.order_type || '',
      kibbutz: x.kibbutz || '', assignee: x.assignee || '', lastUpdated: x.last_updated ? String(x.last_updated) : '',
    } as OrderLike & Record<string, unknown>)),
    movements: (m.data || []).map((x: any) => ({
      id: String(x.id), date: x.date || '', product: x.product || '', fromLocation: x.from_location || '',
      toLocation: x.to_location || '', quantity: parseFloat(x.quantity) || 0, reason: x.reason || '',
      refId: x.ref_id || '', createdBy: x.created_by || '',
    })),
    requirements: (r.data || []).map((x: any) => ({
      id: String(x.id), createdAt: x.created_at || '', createdBy: x.created_by || '', kibbutz: x.kibbutz || '',
      contactName: x.contact_name || '', items: x.items || [], notes: x.notes || '', status: x.status || 'open',
      linkedOrderId: x.linked_order_id || '', fulfilledAt: x.fulfilled_at || '',
      lastUpdated: x.last_updated ? String(x.last_updated) : '',
    } as ReqLike & Record<string, unknown>)),
    returns: (ret.data || []).map((x: any) => ({
      id: String(x.id), visitId: x.visit_id || '', date: x.date || '', kibbutz: x.kibbutz || '',
      visitor: x.visitor || '', product: x.product || '', qty: parseInt(x.qty) || 0, reason: x.reason || '',
      status: x.status || 'open',
    })),
  };
}

/** useInventory(): the one cache entry every inventory screen reads (§7c policy in query.ts). */
export function useInventory() {
  return useQuery({ queryKey: INV_KEYS.all, queryFn: fetchInventory });
}

/** afterWrite: every mutation below ends with this — the legacy snapshot, the bus and the
 * cache all agree a write happened, so nothing stays stale twice. */
export function afterWrite(source: string): void {
  try { (window as any).sigmaEmit?.('stock-changed', { source }); } catch { /* no bus */ }
  try { sigma?.refreshData?.(); } catch { /* legacy not up */ }
  void queryClient.invalidateQueries({ queryKey: INV_KEYS.all });
}

/** Server re-check (risk 12): a stale local cache must never double-post a movement. */
async function postedOnServer(sb: SupabaseClient, refId: string, reason: string): Promise<boolean> {
  if (!refId) return false;
  try {
    const { data } = await sb.from('movements').select('id').eq('ref_id', refId).eq('reason', reason).limit(1);
    return !!(data && data.length);
  } catch { return false; }
}

const genId = (p: string): string => p + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
const nowISO = (): string => new Date().toISOString();

// ───────────────────────────── mappers (parity with 01-data.js) ─────────────────────────────

/** movementRow: W.movement, ported. */
export function movementRow(m: Partial<Movement> & { id?: string; date?: string }): Record<string, unknown> {
  return {
    id: m.id || genId('mov'), date: m.date || nowISO(), product: m.product || '',
    from_location: m.fromLocation || '', to_location: m.toLocation || '', quantity: m.quantity || 0,
    reason: m.reason || 'manual', ref_id: m.refId || '', created_by: m.createdBy || '',
  };
}

/** orderInsertRow: writeOrder's no-id (INSERT) branch, ported. */
export function orderInsertRow(body: Record<string, unknown>, id: string, now: string): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id, created_at: body.createdAt ?? now, created_by: body.createdBy ?? '', supplier: body.supplier ?? '',
    status: body.status ?? 'pending', items: body.items ?? [], expected_date: body.expectedDate ?? '',
    notes: body.notes ?? '',
    delivered_at: body.status === 'delivered' ? (body.deliveredAt ?? now) : (body.deliveredAt ?? ''),
    distribution: body.distribution ?? {}, order_type: body.orderType ?? '', kibbutz: body.kibbutz ?? '',
    last_updated: now,
  };
  if (body.assignee) row.assignee = body.assignee;
  return row;
}

/** orderPatchRow: writeOrder's id-present branch (`orderUpdateRow`), ported byte-for-byte —
 * present-keys only, so a status-only PATCH never wipes items/supplier/notes/distribution. */
export function orderPatchRow(body: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (body.status !== undefined) row.status = body.status;
  if (body.items !== undefined) row.items = body.items;
  if (body.supplier !== undefined) row.supplier = body.supplier;
  if (body.expectedDate !== undefined) row.expected_date = body.expectedDate;
  if (body.notes !== undefined) row.notes = body.notes;
  if (body.distribution !== undefined) row.distribution = body.distribution;
  if (body.createdBy !== undefined) row.created_by = body.createdBy;
  if (body.deliveredAt !== undefined) row.delivered_at = body.deliveredAt;
  if (body.orderType !== undefined) row.order_type = body.orderType;
  if (body.kibbutz !== undefined) row.kibbutz = body.kibbutz;
  if (body.assignee !== undefined) row.assignee = body.assignee;
  return row;
}

// ───────────────────────────── orders ─────────────────────────────

async function insertMovements(rows: ReadonlyArray<Partial<Movement>>): Promise<void> {
  if (!rows.length) return;
  await sbWrite(async s => await s.from('movements').insert(rows.map(m => movementRow(m))));
}
async function fulfilRequirements(ids: ReadonlyArray<string>): Promise<void> {
  for (const id of ids) {
    try { await sbWrite(async s => await s.from('requirements').update({ status: 'fulfilled' }).eq('id', id)); }
    catch { /* best-effort, mirrors the legacy .catch(()=>{}) fan-out */ }
  }
}

/** saveOrder (O16-O19, O27-O28): 💾 שמור הזמנה. Throws with the Hebrew error list on a bad draft. */
export async function saveOrder(draft: OrderDraft, data: InvData, me: string): Promise<{ id: string }> {
  const ctx: SaveCtx = {
    catalog: data.products.filter(p => p.active).map(p => p.name),
    movements: data.movements, requirements: data.requirements, me,
  };
  const plan = orderSavePlan(draft, ctx);
  if (plan.errors.length) throw new Error(plan.errors.join('\n'));

  const sb = await getSupabase();
  const now = nowISO();
  const id = draft.id || genId('ord');
  if (!draft.id) {
    await sbWrite(async s => await s.from('orders').insert(orderInsertRow(plan.body, id, now)).select().single());
    if (plan.pushPending && plan.body.status === 'pending_approval') { try { sigma?.pushNotify?.('pending', id, draft.createdBy || me); } catch { /* no bridge */ } }
  } else {
    await sbWrite(async s => await s.from('orders').update({ ...orderPatchRow(plan.body), last_updated: now }).eq('id', id));
  }

  if (plan.learn) {
    try { await sbWrite(async s => await s.from('parse_corrections').insert({ raw_text: plan.learn!.rawText, items: plan.learn!.items, created_by: me })); }
    catch { /* non-blocking, mirrors legacy */ }
  }

  if (plan.delivery) {
    const already = await postedOnServer(sb, id, 'order_delivery');
    if (!already) {
      const rows = (plan.body.items as Array<{ name: string; qty: number }>).filter(it => it.name && (it.qty || 0) > 0)
        .map(it => ({ product: it.name, fromLocation: SUPPLIER_LOC, toLocation: POOL, quantity: it.qty, reason: 'order_delivery', refId: id, createdBy: me }));
      await insertMovements(rows);
    }
  }

  for (const link of plan.reqLinks) {
    try { await sbWrite(async s => await s.from('requirements').update({ status: link.status, linked_order_id: link.linkedOrderId }).eq('id', link.id)); }
    catch { /* non-blocking, mirrors legacy */ }
  }
  await fulfilRequirements(plan.fulfil);

  afterWrite('order-save');
  return { id };
}

/** approveOrder (O10-O13): אישור/אישור ואספקה. Returns the plan kind for the caller's toast text
 * and whether the EMS task was queued (offline) instead of sent live. */
export async function approveOrder(id: string, data: InvData, me: string): Promise<{ kind: ApprovalPlan['kind']; queued: boolean }> {
  const o = data.orders.find(x => x.id === id);
  if (!o) throw new Error('הזמנה לא נמצאה');
  const ctx: Ctx = { me, movements: data.movements, requirements: data.requirements, hasSite: (sigma as any)?.kibbutzHasSite };
  const plan = approvalPlan(o as any, ctx);
  if (plan.error) throw new Error(plan.error);

  const sb = await getSupabase();
  if (plan.movements.length) {
    const already = await postedOnServer(sb, id, plan.movements[0].reason);
    if (!already) await insertMovements(plan.movements);
  }

  let queued = false;
  if (plan.ems) {
    try {
      const res = await sigma?.emsWrite?.(plan.ems as unknown as Record<string, unknown>);
      queued = !!res?.queued;
      if (res?.sent) { try { await sigma?.emsAfterWrite?.(); } catch { /* refresh best-effort */ } }
    } catch { /* queued or failed — the order still closes below, exactly like today */ }
  }

  await sbWrite(async s => await s.from('orders').update({ ...plan.patch, last_updated: nowISO() }).eq('id', id));
  await fulfilRequirements(plan.fulfil);

  try { sigma?.pushNotify?.('approved', id, me); } catch { /* no bridge */ }
  // sigmaTrack('order-approved') fires for supplier + drop-ship only — the legacy customer-with-
  // EMS-task branch (approveCustomerOrder, non-dropship) never called it either.
  if (plan.kind === 'supplier' || plan.kind === 'dropship') track('order-approved', id);

  afterWrite('order-approve');
  return { kind: plan.kind, queued };
}

/** setOrderStatus: quickOrderStatus / the status picker, over orderStatusPlan (D6 fix). */
export async function setOrderStatus(id: string, next: string, data: InvData, me: string): Promise<StatusPlan> {
  const o = data.orders.find(x => x.id === id);
  const ctx: Ctx = { me, movements: data.movements, requirements: data.requirements };
  const plan = orderStatusPlan(o as any, next, ctx);
  if (plan.error) throw new Error(plan.error);

  const sb = await getSupabase();
  if (plan.movements.length) {
    const already = await postedOnServer(sb, id, 'order_delivery');
    if (!already) await insertMovements(plan.movements);
  }
  await sbWrite(async s => await s.from('orders').update({ ...plan.patch, last_updated: nowISO() }).eq('id', id));
  await fulfilRequirements(plan.fulfil);

  afterWrite('order-status');
  return plan;
}

// ───────────────────────────── returns (S18) ─────────────────────────────

export async function restockReturn(id: string, data: InvData, me: string): Promise<void> {
  const r = data.returns.find(x => x.id === id);
  if (!r) throw new Error('פריט החזרה לא נמצא');
  const plan = restockPlan(r as ReturnLike, { me, movements: data.movements });
  if (plan.error) throw new Error(plan.error);

  const sb = await getSupabase();
  const already = await postedOnServer(sb, id, 'return_restock');
  if (!already) await insertMovements(plan.movements);
  const patch = plan.patch;
  if (patch) await sbWrite(async s => await s.from('returns').update(patch).eq('id', id));

  afterWrite('return-restock');
}

export async function markDefective(id: string): Promise<void> {
  await sbWrite(async s => await s.from('returns').update({ status: 'defective' }).eq('id', id));
  afterWrite('return-defective');
}

// ───────────────────────────── products (P12-P15) ─────────────────────────────

export interface ProductDraft { id?: string; name: string; category?: string; active?: boolean; displayName?: string }

/** saveProduct: invSaveProduct, ported — a non-עידן save never sends display_name at all. */
export async function saveProduct(draft: ProductDraft, isIdan: boolean): Promise<{ id: string }> {
  const name = draft.name.trim();
  if (!name) throw new Error('נא להזין שם פריט');
  const row: Record<string, unknown> = { name, category: draft.category || '', active: draft.active !== false };
  if (isIdan) row.display_name = (draft.displayName || '').trim() || name;
  const id = draft.id || genId('prod');
  if (!draft.id) row.created_at = nowISO();
  await sbWrite(async s => await s.from('products').upsert({ id, ...row }));
  afterWrite('product-save');
  return { id };
}

/** setProductActive (P13 fix): a targeted `{active}` patch — never touches name/category. */
export async function setProductActive(id: string, active: boolean): Promise<void> {
  await sbWrite(async s => await s.from('products').update({ active }).eq('id', id));
  afterWrite('product-active');
}

// ───────────────────────────── delete cascade (L7) ─────────────────────────────

export async function deletePreview(name: string): Promise<DeletePreview> {
  const r = await sbWrite<DeletePreview>(async s => await s.rpc('inventory_delete_preview', { p_name: name }));
  if (!r) throw new Error('התצוגה המקדימה נכשלה');
  return r;
}

export async function deleteProduct(name: string, fp: string): Promise<DeletePreview> {
  const r = await sbWrite<DeletePreview>(async s => await s.rpc('inventory_delete_product', { p_name: name, p_fingerprint: fp }));
  if (!r) throw new Error('המחיקה נכשלה');
  afterWrite('product-delete');
  return r;
}

// ───────────────────────────── order text parser ─────────────────────────────

/** parseOrderText: 07-orders.js `parseRawToItems`, ported. AI-first via the `parse-order` edge
 * function (15 s abort, 401 → the one re-login funnel), deterministic local fallback offline. */
export async function parseOrderText(
  raw: string, orderType: 'customer' | 'supplier', catalog: ReadonlyArray<string>,
): Promise<{ items: ParsedItem[]; source: string }> {
  try {
    let token = '';
    try { token = sigma?.emsToken?.() || ''; } catch { /* no bridge */ }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);
    let r: Response;
    try {
      r = await fetch(SB_URL + '/functions/v1/parse-order', {
        method: 'POST', signal: ac.signal,
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, text: raw, catalog, orderType }),
      });
    } finally { clearTimeout(timer); }
    const res = await r.json().catch(() => ({}) as any);
    if (r.status === 401) notifySessionExpired('parse-order-401');
    if (r.ok && Array.isArray(res.items) && res.items.length) {
      const items: ParsedItem[] = res.items
        .filter((it: any) => it.name && (parseInt(it.qty) || 0) > 0)
        .map((it: any) => ({ name: it.name, qty: parseInt(it.qty) || 1, uncertain: false }));
      if (items.length) return { items, source: res.provider || 'ai' };
    }
  } catch { /* function not deployed / no key / offline → the deterministic fallback below */ }
  return { items: parseLocalToItems(raw, catalog), source: 'local' };
}

// ───────────────────────────── certificates (task L5's plans, wired) ─────────────────────────────

export async function fetchCerts(from: string, to: string): Promise<CertRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('delivery_certs').select('*')
    .gte('cert_date', from || '2000-01-01').lte('cert_date', to || '2099-12-31')
    .order('cert_number', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as CertRow[];
}

/** issueCert: issueDeliveryCert, ported. The CALLER opens `win` synchronously on the click
 * (popup-blocker rule); this only ever writes into it. An insert failure issues a numberless
 * draft instead of throwing — the technician can still print/send it, exactly like today. */
export async function issueCert(
  draft: CertPrefillResult & { recipient?: string; signature?: string; reissueOf?: { id: string; certNumber: number } },
  me: string, win: Window | null,
): Promise<{ number: number | null; id: string | null }> {
  const todayYmd = nowISO().slice(0, 10);
  const cert = certCollect(draft, todayYmd);
  const errors = certIssueErrors(cert, false);
  if (errors.length) { try { win?.close(); } catch { /* ignore */ } throw new Error(errors.join('\n')); }

  const row: Record<string, unknown> = {
    cert_date: cert.date, kibbutz: cert.kibbutz, customer: cert.customer, items: cert.items,
    notes: cert.notes, source: cert.source, ref_id: cert.refId, created_by: me,
  };
  if (cert.recipient) row.recipient = cert.recipient;
  if (cert.signature) row.signature = cert.signature;

  let number: number | null = null, id: string | null = null;
  try {
    const inserted = await sbWrite<{ id: string; cert_number: number }>(async s => await s.from('delivery_certs').insert(row).select().single());
    number = inserted?.cert_number ?? null; id = inserted?.id ?? null;
  } catch { /* persist failed — issue as a draft (non-blocking), mirrors legacy */ }

  const full: CertLike = { ...cert, number };
  const html = certDocHtml(full, { logo: CERT_LOGO });
  if (win) { try { win.document.open(); win.document.write(html); win.document.close(); } catch { /* popup gone */ } }

  if (id && number) {
    try { await sbWrite(async s => await s.from('delivery_certs').update({ doc_html: html }).eq('id', id)); }
    catch { /* Drive-archive snapshot, best-effort */ }
  }
  if (number && draft.reissueOf) {
    try { await cancelCert(draft.reissueOf.id, number); } catch { /* the old cert stays active, cancellable from the tab */ }
  }
  if (number && cert.source === 'ems' && cert.refId) {
    try {
      const res = await sigma?.emsWrite?.({
        kind: 'comment', taskId: cert.refId,
        message: '🚚 הופקה תעודת משלוח מס\' ' + number + (cert.recipient ? ' · נחתמה ע"י ' + cert.recipient : '') + (id ? '\nלצפייה: ' + certViewUrl(id) : ''),
      });
      if (res?.sent) await sigma?.emsAfterWrite?.();
    } catch { /* EMS comment, best-effort */ }
  }
  if (number) track('cert-issued', String(number));

  afterWrite('cert-issue');
  return { number, id };
}

export async function cancelCert(id: string, replacedBy?: number): Promise<void> {
  const patch: Record<string, unknown> = { status: 'cancelled' };
  if (replacedBy) patch.replaced_by = replacedBy;
  await sbWrite(async s => await s.from('delivery_certs').update(patch).eq('id', id));
  afterWrite('cert-cancel');
}

// ───────────────────────────── contacts + kibbutz details ─────────────────────────────

export async function fetchContacts(kibbutz: string): Promise<CertContact[]> {
  const sb = await getSupabase();
  const { data } = await sb.from('site_contacts').select('*').eq('kibbutz', kibbutz).eq('active', true).order('role').order('name');
  return (data || []) as CertContact[];
}

export async function addContact(row: CertContact & { kibbutz: string }): Promise<void> {
  await sbWrite(async s => await s.from('site_contacts').insert(row));
}

/** kibbutzDetails: every kibbutz_details row, keyed by kibbutz — certPrefill's `details` arg. */
export async function kibbutzDetails(): Promise<Record<string, { legal_name?: string; company_id?: string; address?: string; contact?: string }>> {
  const sb = await getSupabase();
  const { data } = await sb.from('kibbutz_details').select('*');
  const out: Record<string, { legal_name?: string; company_id?: string; address?: string; contact?: string }> = {};
  for (const row of (data || []) as any[]) out[row.kibbutz] = row;
  return out;
}
