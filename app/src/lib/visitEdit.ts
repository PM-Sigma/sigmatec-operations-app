// Round 5, package V: editing a filed visit — the filed-visit → sheet-draft mapping and the
// equipment-edit stock delta. Pure: no React, no DOM, no network, no imports besides ./editLock
// (the general edit-lock rule) and ./field (VISIT_REASONS, visitorsOf).
//
// עידן's grill round 5 answers (round-5-design.md, "Consequence for the inventory breakpoint")
// REPLACE V-L4a's original design ("equipment of a pre-breakpoint visit is read-only"): a
// September visit dated before the breakpoint (1-23.9) stays editable, equipment included, and
// its stock delta is computed the SAME way as any other edit — see equipmentDelta below.
//
// Opus audit (round 5): the original plan diffed a pre-breakpoint edit against
// `archive_visit_products()` (a SECURITY DEFINER RPC over archive.movements_pre_breakpoint),
// reasoning that the archived ledger was the ground truth. It was wrong: in the real archived
// data every `visit_supply` movement runs PERSONAL BAG → kibbutz (the pre-2.0 per-person model),
// never from `חברה` — so a from/to-location diff against `חברה` always nets to 0, and the delta
// code then posted the visit's WHOLE new quantity as a fresh addition, double-charging live
// production stock (real visits affected: v_1788936358654_5i9hmx, v_1788935530124_mnv4lx). The
// archive never changes either, so a second edit of the same visit would repeat the same bug.
// `priorSnap.products` — the visit's own filed row — already matches the archive exactly (it was
// never touched by the movement archival) and needs no RPC at all: it is now the ONLY old-quantity
// source, archived or not. `db/archive_pre_breakpoint_rpc.sql` is deleted; nothing reads the
// archive schema from the client any more.
import { visitorsOf, VISIT_REASONS, type VisitReason } from './field';
import { isLocked } from './editLock';

/** 2.29 Phase 1: 159 pre-breakpoint movements were archived, replaced by 81 opening_balance rows.
 *  Kept for reference / reporting only — no code branches on it any more (see the audit note above). */
export const INVENTORY_BREAKPOINT_AT = '2026-09-23T14:05:47.625Z';

const ymd = (iso: string | undefined): string => String(iso || '').slice(0, 10);

/** Whether the whole visit may be edited at all (round 5 general edit lock, app/src/lib/editLock.ts). */
export function visitEditLocked(visit: { date?: string }, today: string | Date = new Date()): boolean {
  return isLocked(visit?.date || '', today);
}

export type ProductQty = { name: string; qty: number };
export type ProductInput = ProductQty | string;

/** A product list (mixed strings/objects, as the legacy form and the sheet both produce) → {name: totalQty}. */
export function qtyMap(products: ReadonlyArray<ProductInput> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of products || []) {
    const name = (typeof p === 'string' ? p : String(p?.name || '')).trim();
    if (!name) continue;
    const q = typeof p === 'string' ? 1 : Number(p?.qty) || 0;
    out[name] = (out[name] || 0) + q;
  }
  return out;
}

export interface EquipmentDelta { product: string; delta: number }

/**
 * new - old per product (0 skipped), sorted for a stable golden. `oldQty` is always
 * `priorSnap.products` (qtyMap'd) — the visit's own previously-filed row, whether or not it
 * predates the inventory breakpoint (see the module note above). A brand-new visit has no old
 * row at all: pass {}.
 */
export function equipmentDelta(oldQty: Record<string, number>, newProducts: ReadonlyArray<ProductInput>): EquipmentDelta[] {
  const now = qtyMap(newProducts);
  const names = new Set([...Object.keys(oldQty || {}), ...Object.keys(now)]);
  const out: EquipmentDelta[] = [];
  names.forEach(name => {
    const delta = (now[name] || 0) - (oldQty?.[name] || 0);
    if (delta !== 0) out.push({ product: name, delta });
  });
  return out.sort((a, b) => a.product.localeCompare(b.product));
}

// ───────────────────────────── visitToChapters ─────────────────────────────

const WORKDAY_HOURS = 8;   // mirrors js/src/09-visits.js:16

export interface VisitRowLike {
  id?: string; kibbutz?: string; date?: string; visitor?: string; duration?: number; workday?: boolean;
  contact?: string; products?: ReadonlyArray<ProductInput> | null; productsOther?: string; summary?: string;
  openItems?: string; reason?: string; emsTaskId?: string;
}
export interface ReturnLite { visitId: string; product: string; qty: number }

export interface ChapterDraftFromVisit {
  kibbutz: string; date: string; visitor: string; visitors: string[]; duration: string; workday: boolean;
  contact: string; products: ProductQty[]; productsOther: string; summary: string; openItems: string;
  reasonId: string; reasonOther: string; emsTaskIds: string[]; returned: ProductQty[];
}

/** Maps a filed visit onto the chapters sheet's draft shape (edit / cert mode). */
export function visitToChapters(
  visit: VisitRowLike,
  returns: ReadonlyArray<ReturnLite> | null | undefined,
  reasons: ReadonlyArray<VisitReason> = VISIT_REASONS,
): ChapterDraftFromVisit {
  const isWorkday = visit.duration === WORKDAY_HOURS && !!visit.workday;
  const reasonText = String(visit.reason || '').trim();
  const known = reasons.find(r => r.label === reasonText);
  const products = (visit.products || []).map(p =>
    typeof p === 'string' ? { name: p, qty: 1 } : { name: String(p?.name || ''), qty: Number(p?.qty) || 1 });
  const returned = (returns || [])
    .filter(r => r && r.visitId === visit.id)
    .map(r => ({ name: r.product, qty: r.qty }));
  return {
    kibbutz: String(visit.kibbutz || ''),
    date: ymd(visit.date),
    visitor: String(visit.visitor || ''),
    visitors: visitorsOf(visit.visitor || ''),
    duration: isWorkday ? '' : String(visit.duration ?? ''),
    workday: isWorkday,
    contact: String(visit.contact || ''),
    products,
    productsOther: String(visit.productsOther || ''),
    summary: String(visit.summary || ''),
    openItems: String(visit.openItems || ''),
    reasonId: known ? known.id : (reasonText ? 'other' : ''),
    reasonOther: known ? '' : reasonText,
    emsTaskIds: visit.emsTaskId ? [visit.emsTaskId] : [],
    returned,
  };
}
