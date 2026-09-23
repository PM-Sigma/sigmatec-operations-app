// Round 5 grill answers (עידן 23.9 evening), binding for I, V, K — "Edit lock for past data":
// everything dated August 2026 or earlier is read-only everywhere (visits, attendance, inventory,
// certificates, orders); September onward stays editable until it locks on the 10th of the following
// month (a September record locks on 10.10). One pure rule, used by every editor and mirrored by a
// DB trigger (db/visit_edit_lock_trigger.sql) so a stale or crafted client call can't bypass it.
//
// Pure: no React, no DOM, no network, no imports. Dates are `yyyy-mm-dd` or an ISO string/Date; only
// the first 10 characters are read (the app's `left(date, 10)` convention).

/** Everything dated before this is locked outright, regardless of the 10th-of-next-month rule. */
export const ROUND5_LOCK_FLOOR = '2026-09-01';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** First 10 chars of an ISO string, or a `yyyy-mm-dd` built from a Date's LOCAL day (matches the rest of the app). */
export function ymd(d: string | Date): string {
  if (d instanceof Date) return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return String(d || '').slice(0, 10);
}

/** The 10th of the month after `date`'s month, as `yyyy-mm-dd`. */
export function editableUntil(date: string | Date): string {
  const d = ymd(date);
  const y = parseInt(d.slice(0, 4), 10);
  const m = parseInt(d.slice(5, 7), 10);
  const nextY = m >= 12 ? y + 1 : y;
  const nextM = m >= 12 ? 1 : m + 1;
  return `${nextY}-${pad2(nextM)}-10`;
}

/** `locked = today > editableUntil(date) || date < 2026-09-01`. `today` defaults to now. */
export function isLocked(date: string | Date, today: string | Date = new Date()): boolean {
  const d = ymd(date);
  if (d < ROUND5_LOCK_FLOOR) return true;
  return ymd(today) > editableUntil(d);
}
