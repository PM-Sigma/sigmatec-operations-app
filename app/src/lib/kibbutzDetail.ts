// Package K (round 5): the pure half of the kibbutz card and KibbutzDetail. Order rulings: QA קיבוצים 3 (closed)
// and 4 (open). lastVisitLine is the TS port of js/src/10-activity.js LASTVISIT-PURE (deleted in K-U5), with the
// round-5 copy rules: no emoji, no "!", d.m dates.
export type CardSection = 'ems' | 'internal' | 'lastVisit' | 'meetings';
export type DetailSection = 'ems' | 'internal' | 'lastVisitReport' | 'meetings' | 'status';
export type DetailTab = 'status' | 'visits';

export const CLOSED_CARD_SECTIONS: readonly CardSection[] = ['ems', 'internal', 'lastVisit', 'meetings'];
export const OPEN_CARD_SECTIONS: readonly DetailSection[] = ['ems', 'internal', 'lastVisitReport', 'meetings', 'status'];

export function detailTabKey(tab?: string): DetailTab {
  return tab === 'visit' || tab === 'visits' ? 'visits' : 'status';
}

export interface VisitRow {
  id: string; kibbutz: string; date: string; visitor: string;
  duration?: number; workday?: boolean; contact?: string;
  products?: Array<{ name: string; qty?: number } | string>;
  productsOther?: string; summary?: string; openItems?: string; open_items?: string; createdAt?: string;
}

const CLOSED = new Set(['done', 'rejected', 'not_relevant', 'cancelled']);

function dayOf(s?: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(String(s || ''));
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
// Visit dates are stored as noon-local ISO (e.g. 09:00Z); the calendar day is the LOCAL day of that instant.
function localDay(iso?: string): Date | null {
  const d = new Date(String(iso || ''));
  return isNaN(d.getTime()) ? dayOf(iso) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function fmtDay(d: Date, now: Date): string {
  const base = d.getDate() + '.' + (d.getMonth() + 1);
  return d.getFullYear() === now.getFullYear() ? base : base + '.' + String(d.getFullYear()).slice(2);
}

export function latestVisitFor(visits: VisitRow[], kibbutz: string): VisitRow | null {
  let best: VisitRow | null = null;
  for (const v of visits || []) {
    if (!v || v.kibbutz !== kibbutz || !v.date) continue;
    if (!best || new Date(v.date) > new Date(best.date)) best = v;
  }
  return best;
}

export interface LastVisitLine { label: 'ביקור אחרון'; date: string; late: boolean; note?: 'ללא סיכום ביקור' }

export function lastVisitLine(
  visit: VisitRow | null,
  tasks: Array<{ status?: string; expectedCompletionDate?: string }>,
  now: Date,
): LastVisitLine | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const visitDay = visit?.date ? localDay(visit.date) : null;
  let oldestDue: Date | null = null;
  for (const t of tasks || []) {
    if (!t || CLOSED.has(String(t.status))) continue;
    const due = dayOf(t.expectedCompletionDate);
    if (!due || !(due < today)) continue;
    if (!oldestDue || due < oldestDue) oldestDue = due;
  }
  if (oldestDue && (!visitDay || visitDay < oldestDue)) {
    return { label: 'ביקור אחרון', date: fmtDay(oldestDue, now), late: true, note: 'ללא סיכום ביקור' };
  }
  return visitDay ? { label: 'ביקור אחרון', date: fmtDay(visitDay, now), late: false } : null;
}

export interface LastVisitReport {
  date: string; hours: string; visitors: string; contact?: string;
  products: string[]; productsOther?: string; summary?: string; openItems?: string;
}

export function lastVisitReport(v: VisitRow, now: Date): LastVisitReport {
  const d = localDay(v.date);
  const products = (v.products || []).map(p =>
    typeof p === 'string' ? p : (p.qty && p.qty > 1 ? `${p.name} ×${p.qty}` : p.name));
  const out: LastVisitReport = {
    date: d ? fmtDay(d, now) : '',
    hours: v.workday ? 'יום עבודה' : `${v.duration ?? 0} ש׳`,
    visitors: v.visitor || '',
    products,
  };
  if (v.contact) out.contact = v.contact;
  if (v.productsOther) out.productsOther = v.productsOther;
  if (v.summary) out.summary = v.summary;
  const open = v.openItems || v.open_items;
  if (open) out.openItems = open;
  return out;
}
