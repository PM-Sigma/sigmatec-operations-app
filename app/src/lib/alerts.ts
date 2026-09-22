// 🔔 התראות מלאי — the pure half (inventory spec §5).
//
// Everything alerts: every movement row raises an `inventory_alerts` row in the database
// (db/inventory_pool.sql), and this file turns those rows into the two things a person ever
// sees — the line in the bell, and the 12:00 / 17:00 digest עמיחי gets on his phone.
//
// Why a pure module: the digest is built TWICE, once in the browser (so the bell and the
// push never disagree) and once inside the Edge Function, which cannot import out of
// app/src. `supabase/functions/push-send/alerts.ts` is a BYTE-IDENTICAL copy, pinned by
// test-inventory-alerts.mjs — treat that copy as generated and copy this file over it.
//
// Dependency-free on purpose: no '@/…' imports, so the copy evaluates unchanged in Deno.
//
// Copy rules (master spec §6): a line says what happened, never what the app did.

export const POOL = 'חברה';
export const RECOUNT_LOC = 'ספירה';

export type AlertKind = 'movement' | 'low_stock' | 'digest' | 'ems_unlinked';

export interface AlertRow {
  id?: string;
  kind: AlertKind;
  product?: string | null;
  qty?: number | string | null;
  from_location?: string | null;
  to_location?: string | null;
  reason?: string | null;
  ref_id?: string | null;
  actor?: string | null;
  created_at?: string | null;
  seen_by?: string[] | null;
}

/** What a movement was FOR, in the words people use — never the enum. */
export const REASON_TEXT: Record<string, string> = {
  visit_supply: 'סיכום ביקור',
  customer_supply: 'הזמנת לקוח',
  order_delivery: 'קבלת הזמנה',
  recount: 'ספירה',
  pool_migration: 'איחוד מלאי',
  manual: 'עדכון ידני',
  min_qty: 'מתחת למינימום',
};

// ───────────────────────────── Israel time, without a dependency ─────────────────────────────
// The digest windows and the bell's clock are Israel local, and the Edge Function runs in UTC.
// `Intl` knows the DST rules; a fixed +3 would be an hour wrong for half the year.
export function israelParts(at: Date | string | number): { y: number; m: number; d: number; hh: number; mm: number; date: string } {
  const d = at instanceof Date ? at : new Date(at);
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(f.find(p => p.type === t)?.value ?? 0);
  const y = get('year'), m = get('month'), day = get('day');
  const pad = (n: number) => String(n).padStart(2, '0');
  return { y, m, d: day, hh: get('hour') % 24, mm: get('minute'), date: `${y}-${pad(m)}-${pad(day)}` };
}

/** `14:02` in Israel local time — the clock on a bell row. */
export function israelClock(at: Date | string | number): string {
  const p = israelParts(at);
  return String(p.hh).padStart(2, '0') + ':' + String(p.mm).padStart(2, '0');
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** ↗ into the pool · ↘ out of it · ⚠️ a shortage. Nothing else has an arrow. */
export function alertArrow(row: AlertRow): '↗' | '↘' | '⚠️' | '•' {
  if (row.kind === 'low_stock') return '⚠️';
  if (row.to_location === POOL) return '↗';
  if (row.from_location === POOL) return '↘';
  return '•';
}

/**
 * One bell line (§5.1): `↘ 3 × מונה E360CT · חברה → גבים · אביאם · 14:02 · סיכום ביקור`.
 * A low-stock line says the shortage and nothing else: `⚠️ מלאי נמוך: סים 1NCE · 4 יח׳ · 14:02`.
 */
export function alertText(row: AlertRow): string {
  const when = row.created_at ? israelClock(row.created_at) : '';
  const product = String(row.product ?? '').trim();
  if (row.kind === 'ems_unlinked') return `⚠️ ${product} לא מקושר ל-EMS`;
  if (row.kind === 'low_stock') {
    const parts = [`⚠️ מלאי נמוך: ${product}`, `${num(row.qty)} יח׳`];
    if (when) parts.push(when);
    return parts.join(' · ');
  }
  const move = `${String(row.from_location ?? '—')} → ${String(row.to_location ?? '—')}`;
  const parts = [`${alertArrow(row)} ${num(row.qty)} × ${product}`, move];
  if (row.actor) parts.push(String(row.actor));
  if (when) parts.push(when);
  const reason = REASON_TEXT[String(row.reason ?? '')];
  if (reason) parts.push(reason);
  return parts.join(' · ');
}

/** Where a bell row leads (§5.1 "tap → opens the source"). */
export function alertTarget(row: AlertRow): { kind: 'visit' | 'order' | 'recount' | 'product'; id: string } {
  const id = String(row.ref_id ?? '').trim();
  const reason = String(row.reason ?? '');
  if (reason === 'visit_supply' && id) return { kind: 'visit', id };
  if ((reason === 'order_delivery' || reason === 'customer_supply') && id) return { kind: 'order', id };
  if (reason === 'recount' && id) return { kind: 'recount', id };
  return { kind: 'product', id: String(row.product ?? '') };
}

/** Has this person already seen the row? `seen_by` is an array of names (§5.1 "mark seen per user"). */
export function isSeen(row: AlertRow, user: string): boolean {
  return (row.seen_by ?? []).indexOf(String(user ?? '')) !== -1;
}

/**
 * The optimistic half of "סמן כנקרא" (round 3, Q): the rows the bell holds, with `user` added
 * to `seen_by` of exactly `ids`. Pure, so the island never hand-rolls the same map twice.
 */
export function markRowsSeen(rows: AlertRow[], ids: Iterable<string>, user: string): AlertRow[] {
  const set = new Set<string>(Array.from(ids, id => String(id)));
  const who = String(user ?? '');
  return (rows ?? []).map(r => (set.has(String(r.id)) && !isSeen(r, who)
    ? { ...r, seen_by: [...(r.seen_by ?? []), who] }
    : r));
}

/**
 * The undo of the above. The RPC can fail (a stale pass, a missing migration), and a row that
 * only LOOKS read is the whole bug this package exists for: what did not reach the database is
 * put back, and the person is told.
 */
export function unmarkRowsSeen(rows: AlertRow[], ids: Iterable<string>, user: string): AlertRow[] {
  const set = new Set<string>(Array.from(ids, id => String(id)));
  const who = String(user ?? '');
  return (rows ?? []).map(r => (set.has(String(r.id))
    ? { ...r, seen_by: (r.seen_by ?? []).filter(n => String(n) !== who) }
    : r));
}

// ───────────────────────────── groups (22.9, G1) ─────────────────────────────
// One visit summary that moved three products is ONE thing to read, not three lines; the
// low-stock rows of one day are one line. Rows are grouped by what caused them and the
// Israel-local day they happened on; the group's clock is its latest row's.

export interface AlertGroup {
  key: string;
  kind: AlertKind;
  rows: AlertRow[];
  /** The one line the bell shows for the group. */
  title: string;
  /** Latest `created_at` in the group — the sort key. */
  at: string;
  /** Every row in the group is seen by this person. */
  seen: boolean;
}

/** The location that is NOT the pool — the kibbutz, the supplier, the recount. */
function counterpart(row: AlertRow): string {
  const from = String(row.from_location ?? ''), to = String(row.to_location ?? '');
  if (to && to !== POOL) return to;
  if (from && from !== POOL) return from;
  return to || from || '';
}

export function groupKey(row: AlertRow): string {
  const day = row.created_at ? israelParts(row.created_at).date : '';
  if (row.kind === 'low_stock') return `low|${day}`;
  const cause = String(row.ref_id ?? '').trim() || `${String(row.reason ?? '')}|${String(row.actor ?? '')}|${counterpart(row)}`;
  return `${String(row.kind)}|${String(row.reason ?? '')}|${cause}|${day}`;
}

/** `סיכום ביקור גבים · 3 פריטים · אביאם · 14:02` — a single row keeps its own line. */
export function groupTitle(rows: AlertRow[]): string {
  if (rows.length === 1) return alertText(rows[0]);
  const head = rows[0];
  const when = head.created_at ? israelClock(head.created_at) : '';
  if (head.kind === 'low_stock') {
    const parts = [`⚠️ מלאי נמוך · ${rows.length} פריטים`];
    if (when) parts.push(when);
    return parts.join(' · ');
  }
  const reason = REASON_TEXT[String(head.reason ?? '')] || 'תנועות מלאי';
  const where = counterpart(head);
  const parts = [`${alertArrow(head)} ${reason}${where ? ' ' + where : ''}`, `${rows.length} פריטים`];
  if (head.actor) parts.push(String(head.actor));
  if (when) parts.push(when);
  return parts.join(' · ');
}

/** Rows (any order) → groups, newest first. */
export function groupAlerts(rows: AlertRow[], user: string): AlertGroup[] {
  const by = new Map<string, AlertRow[]>();
  for (const r of rows || []) {
    const k = groupKey(r);
    const list = by.get(k);
    if (list) list.push(r); else by.set(k, [r]);
  }
  const out: AlertGroup[] = [];
  by.forEach((list, key) => {
    list.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    out.push({
      key,
      kind: list[0].kind,
      rows: list,
      title: groupTitle(list),
      at: String(list[0].created_at ?? ''),
      seen: list.every(r => isSeen(r, user)),
    });
  });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** The badge on the bell: how many rows this person has not marked seen. */
export function unseenCount(rows: AlertRow[], user: string): number {
  return rows.filter(r => !isSeen(r, user)).length;
}

/** Only the inventory actors get a bell; the viewer reads reports (§5.1). */
export function canSeeAlerts(user: string, isViewer: boolean): boolean {
  if (isViewer) return false;
  return ['עידן', 'עמיחי', 'אביאם', 'ניתאי'].indexOf(String(user ?? '').trim()) !== -1;
}

// ───────────────────────────── EMS-unlinked sites (22.9, QA round 4 Package Y) ─────────────────────────────
// עידן: "אני רוצה לקבל שגיאה אם יש אתר שלא מחובר ל-EMS — זה הדבר הכי לא תקין במערכת." Not a
// database table: the group is built straight from the `kibbutzim` rows the bell already has
// to read for other reasons (Alerts.tsx), using `isUnlinked` from lib/kibbutzim.ts — one rule,
// asked in three places (the card chip, here, and health.ts).

/** עידן/עמיחי only — never אביאם/ניתאי, unlike the rest of the inventory bell. */
export function canSeeEmsUnlinkedAlert(user: string): boolean {
  return ['עידן', 'עמיחי'].indexOf(String(user ?? '').trim()) !== -1;
}

/**
 * The unlinked names → the one group the bell shows. A standing problem, not a moment-in-time
 * event, so it always sorts to the top of the list (`at` = now) instead of drifting down as
 * older rows arrive; `seen` is always `false` — it never actually clears until the site really
 * gets linked, unlike an inventory movement nobody can "read again" once acted on.
 */
export function emsUnlinkedGroup(names: string[], now = new Date().toISOString()): AlertGroup | null {
  const list = (names ?? []).filter(Boolean);
  if (!list.length) return null;
  const title = list.length === 1
    ? `⚠️ ${list[0]} לא מקושר ל-EMS`
    : `⚠️ ${list.length} אתרים לא מקושרים ל-EMS`;
  return {
    key: 'ems-unlinked',
    kind: 'ems_unlinked',
    rows: list.map(name => ({ kind: 'ems_unlinked' as const, product: name })),
    title,
    at: now,
    seen: false,
  };
}

// ───────────────────────────── the digest (§5.2) ─────────────────────────────

export interface DigestWindow {
  /** 12 or 17 — the Israel-local hour this digest belongs to. */
  hh: 12 | 17;
  /** ISO instant the window opens (the previous digest's hour). */
  from: string;
  /** ISO instant it closes (now). */
  to: string;
  /** `inv-digest-<date>-<hh>` — the idempotency tag in push_log. */
  tag: string;
}

function israelInstant(p: { y: number; m: number; d: number }, hh: number, ref: Date): number {
  // Walk back from `ref` to the instant that reads as <date> <hh>:00 in Israel. Brute-force by
  // hours (≤ 36 of them) rather than arithmetic, so a DST jump can never land an hour off.
  const pad = (n: number) => String(n).padStart(2, '0');
  const want = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  for (let back = 0; back <= 48; back++) {
    const t = ref.getTime() - back * 3600_000;
    const q = israelParts(t);
    if (q.date === want && q.hh === hh) return new Date(t).setMinutes(0, 0, 0);
  }
  return ref.getTime() - 24 * 3600_000;
}

/**
 * The window a digest covers (§5.2): 12:00 → since yesterday 17:00; 17:00 → since today 12:00.
 * Any other hour → `null`, which is how the hourly cron decides to do nothing.
 */
export function digestWindow(now: Date | string | number): DigestWindow | null {
  const ref = now instanceof Date ? now : new Date(now);
  const p = israelParts(ref);
  if (p.hh !== 12 && p.hh !== 17) return null;
  const hh = p.hh as 12 | 17;
  let from: number;
  if (hh === 17) {
    from = israelInstant(p, 12, ref);
  } else {
    const y = new Date(israelInstant(p, 0, ref) - 12 * 3600_000);   // safely inside yesterday
    from = israelInstant(israelParts(y), 17, ref);
  }
  return { hh, from: new Date(from).toISOString(), to: ref.toISOString(), tag: digestTag(p.date, hh) };
}

/** `inv-digest-2026-09-19-12` — one tag per day per hour, so a retry never pushes twice. */
export function digestTag(date: string, hh: number): string {
  return `inv-digest-${date}-${String(hh).padStart(2, '0')}`;
}

/** `📦 תנועות מלאי 12:00 · 7 תנועות` */
export function digestTitle(rows: AlertRow[], hh: number): string {
  const moves = rows.filter(r => r.kind === 'movement').length;
  return `📦 תנועות מלאי ${String(hh).padStart(2, '0')}:00 · ${moves} תנועות`;
}

/**
 * The body (§5.2): one line per movement, then the shortages.
 *   `↗ +20 בקר 504 (ספק → חברה, קבלת הזמנה)`
 *   `↘ −3 מונה E360CT → גבים (אביאם, סיכום ביקור)`
 *   `⚠️ מלאי נמוך: סים 1NCE 4 יח׳`
 * Capped at 8 lines plus a "+N נוספות" tail — a push body nobody can read is not a report.
 */
export function digestBody(rows: AlertRow[], max = 8): string {
  const lines: string[] = [];
  for (const r of rows) {
    const product = String(r.product ?? '').trim();
    if (r.kind === 'low_stock') { lines.push(`⚠️ מלאי נמוך: ${product} ${num(r.qty)} יח׳`); continue; }
    const reason = REASON_TEXT[String(r.reason ?? '')] || '';
    const who = String(r.actor ?? '').trim();
    const tail = [who, reason].filter(Boolean).join(', ');
    if (r.to_location === POOL) {
      lines.push(`↗ +${num(r.qty)} ${product} (${String(r.from_location ?? '—')} → ${POOL}${tail ? ', ' + tail : ''})`);
    } else {
      lines.push(`↘ −${num(r.qty)} ${product} → ${String(r.to_location ?? '—')}${tail ? ` (${tail})` : ''}`);
    }
  }
  if (lines.length <= max) return lines.join('\n');
  return lines.slice(0, max).concat(`+${lines.length - max} נוספות`).join('\n');
}

export interface ProductLike { name?: string; min_qty?: number | string | null; active?: boolean }

/**
 * Which products are under their own red line right now (§5, §2): pool quantity < `min_qty`.
 * A product with no `min_qty` has no red line and can never be "low" — that is decision I3.
 */
export function lowStockRows(
  pool: Record<string, number>,
  products: ProductLike[],
): Array<{ product: string; qty: number; min: number }> {
  const out: Array<{ product: string; qty: number; min: number }> = [];
  for (const p of products ?? []) {
    const name = String(p?.name ?? '').trim();
    if (!name || p?.active === false) continue;
    if (p?.min_qty === null || p?.min_qty === undefined || String(p.min_qty).trim() === '') continue;
    const min = num(p.min_qty);
    if (!(min > 0)) continue;
    const qty = num(pool?.[name]);
    if (qty < min) out.push({ product: name, qty, min });
  }
  return out.sort((a, b) => (a.qty - a.min) - (b.qty - b.min) || a.product.localeCompare(b.product, 'he'));
}

/** One low-stock push per product per day (§5.2). The key push_log carries in `where_txt`. */
export function lowStockTag(product: string, date: string): string {
  return `inv-low-${date}-${String(product ?? '').trim()}`;
}
