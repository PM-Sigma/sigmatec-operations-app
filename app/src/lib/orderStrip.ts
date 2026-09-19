// 🧾 הזמנות על דף המלאי — the compact strip (inventory spec §4a).
//
// The order module keeps its whole flow. This page shows only what a person standing in front
// of the shelf needs: which orders are open, which stage each one reached, and the ONE thing
// that is true about it right now. The note is computed from the data, never typed — a free
// note would be someone's memory of last week, and the shelf is about today.
//
// Pure, tested in orderStrip.test.ts. The island (islands/InventoryStrip.tsx) only renders it.

/** The four decisive stages (§4a). A drop-ship order shows `ספק ישיר` instead. */
export const STRIP_STAGES = ['ממתין לאישור', 'הוזמן', 'הגיע', 'סופק'] as const;
export type StripStage = typeof STRIP_STAGES[number];

export interface OrderLike {
  id?: string | number;
  status?: string;
  supplier?: string;
  kibbutz?: string;
  orderType?: string;
  order_type?: string;
  items?: Array<{ name?: string; qty?: number | string }>;
  notes?: string;
  createdAt?: string;
  created_at?: string;
  expectedDate?: string;
  expected_date?: string;
  dropShip?: boolean;
  drop_ship?: boolean;
  emsTaskId?: string;
  orders_ems_task_id?: string;
}

export type NoteLevel = 'late' | 'action' | 'waiting' | 'transit' | 'done';

export interface StripNote { icon: string; text: string; level: NoteLevel }

export interface StripRow {
  id: string;
  title: string;
  /** index of the stage reached, 0..3; -1 for a drop-ship (no stages) */
  stage: number;
  dropShip: boolean;
  note: StripNote;
  qty: number;
}

const s = (v: unknown) => String(v ?? '').trim();
const ymd = (v: unknown) => s(v).slice(0, 10);
const isDrop = (o: OrderLike) => !!(o.dropShip ?? o.drop_ship);
export const orderKind = (o: OrderLike) =>
  s(o.orderType || o.order_type) || (/בקשת לקוח/.test(s(o.notes)) ? 'customer' : 'supplier');

/** Days between two yyyy-mm-dd dates (b − a), 0 when either is missing. */
export function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.round((+new Date(b + 'T00:00:00Z') - +new Date(a + 'T00:00:00Z')) / 86400000);
}

/** Which of the four dots is lit (§4a). Unknown status → ממתין לאישור. */
export function orderStage(o: OrderLike): number {
  const st = s(o.status);
  if (/סופק|delivered/i.test(st)) return 3;
  if (/הגיע|arrived/i.test(st)) return 2;
  if (/הוזמן|ordered/i.test(st)) return 1;
  return 0;
}

/** An order that has left the strip: delivered, cancelled, closed (§4a "closed are not here"). */
export function isOpenOrder(o: OrderLike): boolean {
  const st = s(o.status);
  if (/בוטל|cancel/i.test(st)) return false;
  return !/סופק|delivered/i.test(st);
}

/** Does every item exist in the catalog? A name nobody stocks is the strip's loudest note. */
function unknownItem(o: OrderLike, catalog: string[]): string {
  if (!catalog || !catalog.length) return '';
  for (const it of o.items ?? []) {
    const n = s(it?.name);
    if (n && catalog.indexOf(n) === -1) return n;
  }
  return '';
}

export function orderQty(o: OrderLike): number {
  return (o.items ?? []).reduce((t, i) => t + (parseInt(String(i?.qty ?? ''), 10) || 0), 0);
}

/**
 * The ONE active note (§4a). Order of precedence is the order of urgency: a wrong item first
 * (nothing else can happen until it is fixed), then late, then what someone has to do next.
 */
export function orderNote(o: OrderLike, today: string, catalog: string[] = []): StripNote {
  const bad = unknownItem(o, catalog);
  if (bad) return { icon: '⚠️', text: `פריט לא בקטלוג: ${bad}`, level: 'late' };

  const stage = orderStage(o);
  const expected = ymd(o.expectedDate || o.expected_date);
  const created = ymd(o.createdAt || o.created_at);

  if (stage === 3) return { icon: '✅', text: 'סופק', level: 'done' };

  if (stage === 2) {
    return { icon: '📦', text: 'הגיע — לסמן סופק כדי שייכנס למלאי', level: 'action' };
  }

  if (stage === 1) {
    if (expected && daysBetween(expected, today) > 0) {
      return { icon: '⚠️', text: `באיחור ${daysBetween(expected, today)} ימים מהתאריך הצפוי`, level: 'late' };
    }
    if (expected) return { icon: '🚚', text: `הוזמן, צפוי ${heDate(expected)}`, level: 'transit' };
    return { icon: '🚚', text: 'הוזמן', level: 'transit' };
  }

  // stage 0 — waiting for an approval. Whose, and for how long.
  if (orderKind(o) === 'customer' && s(o.emsTaskId || o.orders_ems_task_id)) {
    return { icon: '🔗', text: 'לקוח: משימת EMS פתוחה', level: 'waiting' };
  }
  const days = created ? daysBetween(created, today) : 0;
  const who = orderKind(o) === 'customer' ? 'ממתין לאישור' : 'ממתין לאישור עמיחי';
  return { icon: '⏳', text: days > 0 ? `${who} ${days} ימים` : who, level: 'waiting' };
}

/** `24.9` — the way a date is said out loud here. */
export function heDate(iso: string): string {
  const p = ymd(iso).split('-');
  if (p.length !== 3) return iso;
  return `${Number(p[2])}.${Number(p[1])}`;
}

const LEVEL_ORDER: Record<NoteLevel, number> = { late: 0, action: 1, waiting: 2, transit: 3, done: 4 };

/** The strip: open orders only, most urgent first (§4a). */
export function orderStripRows(orders: OrderLike[], today: string, catalog: string[] = []): StripRow[] {
  return (orders ?? [])
    .filter(isOpenOrder)
    .map(o => {
      const drop = isDrop(o);
      const where = orderKind(o) === 'customer' ? s(o.kibbutz) : s(o.supplier);
      return {
        id: s(o.id),
        title: where || 'הזמנה',
        stage: drop ? -1 : orderStage(o),
        dropShip: drop,
        note: orderNote(o, today, catalog),
        qty: orderQty(o),
      };
    })
    .sort((a, b) =>
      LEVEL_ORDER[a.note.level] - LEVEL_ORDER[b.note.level]
      || a.title.localeCompare(b.title, 'he')
      || a.id.localeCompare(b.id));
}

/** Who may set a product's red line (`min_qty`) — the two who buy (§5, decision I3). */
export function canSetMinQty(user: string, isViewer: boolean): boolean {
  if (isViewer) return false;
  return ['עידן', 'עמיחי'].indexOf(s(user)) !== -1;
}
