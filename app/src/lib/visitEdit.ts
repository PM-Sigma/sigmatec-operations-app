// Round 5, package V: editing a filed visit — the inventory breakpoint consequence and the
// filed-visit → sheet-draft mapping. Pure: no React, no DOM, no network, no imports besides
// ./editLock (the general edit-lock rule) and ./field (VISIT_REASONS, visitorsOf).
//
// עידן's grill round 5 answers (round-5-design.md, "Consequence for the inventory breakpoint")
// REPLACE V-L4a's original design ("equipment of a pre-breakpoint visit is read-only"): a
// September visit dated before the breakpoint (1-23.9) stays editable, equipment included. What
// changes is which ledger an edit's stock DELTA is computed against — see isArchivedVisit() below.
// Whether the visit may be edited AT ALL is the separate, general rule in ./editLock.
import { visitorsOf, VISIT_REASONS, type VisitReason } from './field';
import { isLocked } from './editLock';

/** 2.29 Phase 1: the instant 159 pre-breakpoint movements were archived, replaced by 81 opening_balance rows. */
export const INVENTORY_BREAKPOINT_AT = '2026-09-23T14:05:47.625Z';

const ymd = (iso: string | undefined): string => String(iso || '').slice(0, 10);

/**
 * True when this visit's ORIGINAL supply movement was folded into the archive (2.29): dated before
 * 23.9.2026, or dated 23.9 but filed before the breakpoint instant. NOT a lock — an archived visit is
 * still fully editable (round 5). It only tells the caller which ledger to diff equipment edits against
 * (see equipmentDeltaSource): `archive_visit_products()` (db/archive_pre_breakpoint_rpc.sql) instead of
 * the visit's own previously-filed `products`.
 */
export function isArchivedVisit(visit: { date?: string; createdAt?: string; created_at?: string }): boolean {
  const day = ymd(visit?.date);
  const createdAt = String(visit?.createdAt || visit?.created_at || '');
  return (!!day && day < '2026-09-23') || (!!createdAt && createdAt < INVENTORY_BREAKPOINT_AT);
}

/** Whether the whole visit may be edited at all (round 5 general edit lock, app/src/lib/editLock.ts). */
export function visitEditLocked(visit: { date?: string }, today: string | Date = new Date()): boolean {
  return isLocked(visit?.date || '', today);
}

/** Which ledger an equipment edit's delta must be computed against. */
export function equipmentDeltaSource(visit: { date?: string; createdAt?: string; created_at?: string }): 'archive' | 'live' {
  return isArchivedVisit(visit) ? 'archive' : 'live';
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
 * new - old per product (0 skipped), sorted for a stable golden. `oldQty` is whichever ledger
 * `equipmentDeltaSource` named: for an archived visit it MUST be `archive_visit_products()`'s result,
 * never {} and never a live-movements-by-ref_id lookup — both would treat the visit's entire current
 * quantity as a fresh addition on top of what opening_balance already counts (the double-deduct the
 * ruling exists to prevent). A brand-new visit has no old row at all: pass {}.
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
