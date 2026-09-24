// Round 5, package V: the attendance rules, exactly as ruled (round-5-design.md "Attendance rules (exact)").
// Pure: the caller hands in the visit before/after the save, the attendance rows and the visits; it gets back the
// writes to make, the question to ask and the popup to show. js/src/04-attendance-daily.js attApplyOps() writes them.
//
// Filename note (binding, docs/superpowers/specs/2026-09-23-r5-A-attendance.md §3 "Boundary with V on
// attendance.ts"): package A owns app/src/lib/attendance.ts; V's own pure logic lives in this file instead
// (the spec's suggested name), importing only ./field, never attendance.ts.
import { visitorsOf } from './field';

export type AttSource = 'manual' | 'visit_auto' | 'calendar';
export interface AttRow { id: string; person: string; date: string; dayType: string; note?: string; source?: string }
export interface VisitLite { id: string; date: string; visitor: string }
export type AttOp = { kind: 'upsert'; row: AttRow } | { kind: 'delete'; id: string };
export interface AttAsk { kind: 'conflict'; person: string; ymd: string; rowId: string; rowDate: string; existingType: string }
export interface AttNotice { kind: 'needsEntry'; person: string; ymd: string }
export interface AttPlan { ops: AttOp[]; asks: AttAsk[]; notices: AttNotice[]; autoDays: Array<{ person: string; ymd: string }> }

export const AUTO_PEOPLE: readonly string[] = ['אביאם', 'ניתאי'];
export const DAY_LABEL_PLAIN: Record<string, string> = {
  field: 'שטח', office: 'משרד', wfh: 'מהבית', reserve: 'מילואים', vacation: 'חופש', off: 'לא בעבודה', other: 'אחר',
};

export const ymdOf = (iso: string): string => String(iso || '').slice(0, 10);
export const autoRowId = (person: string, ymd: string): string => `att_v_${ymd.replace(/-/g, '')}_${person}`;
const noonIso = (ymd: string): string => new Date(ymd + 'T12:00:00').toISOString();
const isAuto = (r: AttRow) => r.source === 'visit_auto';
const filers = (v: { visitor: string } | null) => (v ? visitorsOf(v).filter(p => AUTO_PEOPLE.includes(p)) : []);

/**
 * Rules 1-3 ("Attendance rules (exact)"): what a visit save must write to attendance.
 *   1. save → each filer in `after`'s מי ביקר gets a שטח `visit_auto` row on the visit's day.
 *   2. that day already has a row: same type (or already visit_auto) → nothing; a different type → ask.
 *   3. the date moved (or a filer was dropped): the ORIGINAL day's row is reconsidered — another visit of
 *      his that day keeps it שטח, his own visit_auto row is deleted with a "needs entry" notice, a manual
 *      row is left untouched.
 */
export function planVisitAttendance(i: { before: VisitLite | null; after: VisitLite; rows: AttRow[]; visits: VisitLite[] }): AttPlan {
  const plan: AttPlan = { ops: [], asks: [], notices: [], autoDays: [] };
  const rowsOf = (p: string, d: string) => (i.rows || []).filter(r => r && r.person === p && ymdOf(r.date) === d);
  const day = ymdOf(i.after.date);
  const now = filers(i.after);

  for (const p of now) {
    const r = rowsOf(p, day);
    if (!r.length) {
      plan.ops.push({ kind: 'upsert', row: { id: autoRowId(p, day), person: p, date: noonIso(day), dayType: 'field', note: '', source: 'visit_auto' } });
      plan.autoDays.push({ person: p, ymd: day });
    } else if (r.some(isAuto) || r.some(x => x.dayType === 'field')) {
      // rule 1 idempotent / rule 2 same type: nothing
    } else {
      const x = r[0];
      plan.asks.push({ kind: 'conflict', person: p, ymd: day, rowId: x.id, rowDate: x.date, existingType: x.dayType });
    }
  }

  if (i.before) {
    const d0 = ymdOf(i.before.date);
    for (const p of filers(i.before)) {
      if (d0 === day && now.includes(p)) continue;                         // still covered by this visit
      // Opus audit: only a REAL visit counts as "another visit that day" — a row with no id (a
      // draft that never saved, a malformed entry) must not keep a filer's auto row alive.
      const other = (i.visits || []).some(v => v && v.id && v.id !== i.after.id && ymdOf(v.date) === d0 && visitorsOf(v).includes(p));
      if (other) continue;                                                 // rule 3a
      const auto = rowsOf(p, d0).find(isAuto);
      if (auto) {                                                          // rule 3b
        plan.ops.push({ kind: 'delete', id: auto.id });
        plan.notices.push({ kind: 'needsEntry', person: p, ymd: d0 });
      }                                                                    // rule 3c: manual stays
    }
  }
  return plan;
}

/** The answer to an `AttAsk`: accept turns the row שטח (visit_auto); decline writes nothing. */
export function resolveConflict(ask: AttAsk, accept: boolean): AttOp[] {
  if (!accept) return [];
  return [{ kind: 'upsert', row: { id: ask.rowId, person: ask.person, date: ask.rowDate, dayType: 'field', note: '', source: 'visit_auto' } }];
}
