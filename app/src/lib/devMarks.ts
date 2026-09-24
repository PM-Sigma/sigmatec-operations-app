// D-L3 — local ישיבת פיתוח marks (round-5 grill "Dev-meeting marks", D-R4). A mark lives ONLY in
// localStorage, keyed by the meeting DATE (Israel), and never reaches GitHub: this module has no
// dependency on the board's write path, and devMarks.test.ts pins that at compile time.
//
// The key is the date, not the session id, because the session row is lazy (M-L2) — a reopen
// the same day (phone locked, app killed) must see the same marks; a new day starts empty.
import type { DevCard } from './sprintPrep';

export type DevMark = 'sprint' | 'clarify' | 'defer';

export const MARK_LABEL: Record<DevMark, string> = {
  sprint: 'לספרינט', clarify: 'לבירור', defer: 'לדחות',
};

const MARK_ORDER: DevMark[] = ['sprint', 'clarify', 'defer'];

export interface MarkEntry { number: number; mark: DevMark; note?: string; at: string }

const PREFIX = 'dev_meeting_marks_v1:';

export function marksKey(date: string): string { return PREFIX + date; }

/** In-memory fallback for a browser that refuses to persist (private mode). */
const memory = new Map<string, Record<number, MarkEntry>>();

export function loadMarks(date: string): Record<number, MarkEntry> {
  try {
    const raw = localStorage.getItem(marksKey(date));
    if (raw) return JSON.parse(raw) as Record<number, MarkEntry>;
  } catch { /* private mode — fall through to memory */ }
  return memory.get(date) || {};
}

function persist(date: string, map: Record<number, MarkEntry>): Record<number, MarkEntry> {
  memory.set(date, map);
  try { localStorage.setItem(marksKey(date), JSON.stringify(map)); } catch { /* private mode: memory still has it */ }
  return map;
}

/** Set, replace, or (mark: null) clear one card's mark for that date. Never throws. */
export function setMark(date: string, e: MarkEntry | { number: number; mark: null }): Record<number, MarkEntry> {
  const map = { ...loadMarks(date) };
  if (e.mark === null) delete map[e.number];
  else map[e.number] = e as MarkEntry;
  return persist(date, map);
}

/** Drop every meeting-day key older than `keepDays` (default 7), so old marks don't pile up forever. */
export function pruneOldMarks(today: string, keepDays = 7): void {
  const cutoff = new Date(today).getTime() - keepDays * 86400000;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const day = key.slice(PREFIX.length);
      const t = new Date(day).getTime();
      if (!Number.isFinite(t) || t < cutoff) { localStorage.removeItem(key); memory.delete(day); }
    }
  } catch { /* private mode — nothing persisted to prune */ }
}

export interface MarkSummaryGroup { mark: DevMark; label: string; rows: Array<{ number: number; title: string; note?: string }> }

/** The end-of-meeting summary, grouped by mark in vocabulary order. Empty groups are omitted. */
export function marksSummary(marks: Record<number, MarkEntry>, cards: DevCard[]): MarkSummaryGroup[] {
  const titleOf = new Map(cards.map(c => [Number(c.number), String(c.title || '')]));
  const byMark = new Map<DevMark, MarkSummaryGroup['rows']>();
  for (const e of Object.values(marks || {})) {
    const rows = byMark.get(e.mark) || [];
    rows.push({ number: e.number, title: titleOf.get(e.number) || ('#' + e.number), note: e.note });
    byMark.set(e.mark, rows);
  }
  return MARK_ORDER
    .filter(m => byMark.has(m))
    .map(m => ({ mark: m, label: MARK_LABEL[m], rows: byMark.get(m)!.sort((a, b) => a.number - b.number) }));
}

/** `d.m` — no leading zeros, the format the meeting header already uses. */
function fmtDayMonth(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return d && m ? `${d}.${m}` : iso;
}

/** The "העתקה" clipboard payload for the end-of-meeting summary. */
export function marksText(summary: MarkSummaryGroup[], date: string): string {
  const lines = ['ישיבת פיתוח ' + fmtDayMonth(date)];
  for (const g of summary) {
    lines.push(g.label);
    for (const r of g.rows) {
      lines.push('· #' + r.number + ' ' + r.title + (r.note ? ' (' + r.note + ')' : ''));
    }
  }
  return lines.join('\n');
}
