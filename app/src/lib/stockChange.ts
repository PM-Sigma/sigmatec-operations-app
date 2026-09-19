// 🔢 דיווח שינוי במלאי — the pure core of the §4b sheet.
//
// עידן, 17.9.26: "חייב להיות מקושר כמו שצריך". There is no free "adjust" any more. A stock
// change is always one of three LINKED things, and this planner is what forces the link:
//
//   ירידה  → 📍 יצא בביקור   → the visit form opens with the product pre-checked; the visit's
//                              own save posts `חברה → kibbutz` (and the delivery-cert gate
//                              applies exactly as always). Nothing is written from here.
//           → 🔢 ספירה מחדש  → the person types the COUNTED quantity, never a delta; the delta
//                              is computed and one `חברה → ספירה` row is written, plus the
//                              `stock_recounts` row that makes the count itself auditable.
//   עלייה  → 🧾 הזמנה        → an open supplier order is marked delivered through the existing
//                              order flow → `ספק → חברה`. Nothing is written from here.
//           → 🔢 ספירה מחדש  → `ספירה → חברה`.
//
// The planner never talks to the network: it returns the rows to write and/or the flow to
// route into, and the island does exactly what it says.
import { POOL, RECOUNT_LOC, type Movement } from '@/lib/inventory';

export type StockDirection = 'decrease' | 'increase';
export type StockSource = 'visit' | 'order' | 'recount';

export interface StockChangeInput {
  product?: string;
  /** The pool quantity the person is looking at when he reports. */
  pool?: number;
  direction?: StockDirection;
  source?: StockSource;
  /** 🔢 the COUNTED quantity — what is physically there. Never a delta. */
  counted?: number | string | null;
  visitId?: string;
  orderId?: string;
  note?: string;
  actor?: string;
  /** The id the `stock_recounts` row will carry; also the movement's `ref_id`. */
  recountId?: string;
}

export interface RecountRow {
  id: string;
  product: string;
  counted: number;
  before: number;
  delta: number;
  note: string;
  actor: string;
}

export interface StockChangePlan {
  movements: Movement[];
  recount?: RecountRow;
  /** The flow the island must route into instead of writing. */
  requires: 'visit' | 'order' | null;
  errors: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Plan one reported stock change. Pure; the goldens in stockChange.test.ts are spec §4b's.
 *
 * Validation is deliberately ordered the way the sheet is filled in — product, then direction,
 * then source, then the source's own fields — so the first error a person sees is about the
 * thing he is currently looking at, not about a step he has not reached.
 */
export function stockChangePlan(input: StockChangeInput | null | undefined): StockChangePlan {
  const errors: string[] = [];
  const none: StockChangePlan = { movements: [], requires: null, errors };

  const product = String(input?.product ?? '').trim();
  if (!product) errors.push('בחר פריט');

  const direction = input?.direction;
  if (direction !== 'decrease' && direction !== 'increase') errors.push('בחר אם המלאי ירד או עלה');

  const source = input?.source;
  if (source !== 'visit' && source !== 'order' && source !== 'recount') errors.push('בחר מה קרה');
  else if (direction === 'decrease' && source === 'order') errors.push('הזמנה מעלה מלאי, לא מורידה');
  else if (direction === 'increase' && source === 'visit') errors.push('ביקור מוריד מלאי, לא מעלה');

  if (errors.length) return none;

  // ── routed flows: this sheet writes NOTHING, the existing flow does ────────────────────
  if (source === 'visit') {
    return { movements: [], requires: 'visit', errors };
  }
  if (source === 'order') {
    if (!String(input?.orderId ?? '').trim()) {
      return { movements: [], requires: 'order', errors: ['בחר הזמנת ספק פתוחה'] };
    }
    return { movements: [], requires: 'order', errors };
  }

  // ── 🔢 recount: the only path that writes from here ────────────────────────────────────
  const before = num(input?.pool) || 0;
  const counted = num(input?.counted);
  if (!Number.isFinite(counted)) return { movements: [], requires: null, errors: ['הזן את הכמות שנספרה'] };
  if (counted < 0) return { movements: [], requires: null, errors: ['הכמות שנספרה לא יכולה להיות שלילית'] };

  const note = String(input?.note ?? '').trim();
  if (!note) return { movements: [], requires: null, errors: ['חובה להזין הערה לספירה'] };

  const delta = counted - before;
  if (delta === 0) return { movements: [], requires: null, errors: ['הספירה זהה למלאי — אין שינוי'] };
  // A count that contradicts the direction the person chose is a mistake worth stopping on:
  // he said "less" and counted more, so one of the two is wrong and we do not guess which.
  if (direction === 'decrease' && delta > 0) {
    return { movements: [], requires: null, errors: ['בחרת ירידה אבל הספירה גבוהה מהמלאי'] };
  }
  if (direction === 'increase' && delta < 0) {
    return { movements: [], requires: null, errors: ['בחרת עלייה אבל הספירה נמוכה מהמלאי'] };
  }

  const actor = String(input?.actor ?? '').trim();
  const recountId = String(input?.recountId ?? '').trim();
  const movement: Movement = {
    product,
    fromLocation: delta < 0 ? POOL : RECOUNT_LOC,
    toLocation: delta < 0 ? RECOUNT_LOC : POOL,
    quantity: Math.abs(delta),
    reason: 'recount',
    refId: recountId,
    createdBy: actor,
  };
  return {
    movements: [movement],
    recount: { id: recountId, product, counted, before, delta, note, actor },
    requires: null,
    errors,
  };
}
