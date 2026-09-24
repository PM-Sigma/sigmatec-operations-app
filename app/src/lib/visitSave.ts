// Round 5, package V: one orchestrator for "save a visit" that both the chapters sheet and the day
// log call — saveVisitFromData (the pipeline) THEN the attendance plan it implies (rules 1-3,
// app/src/lib/visitAttendance.ts), applied ONLY when the save itself succeeded (S4: an offline save
// must run no attendance op and show no success toast).
import {
  DAY_LABEL_PLAIN, planVisitAttendance, resolveConflict,
  type AttAsk, type AttOp, type AttPlan, type AttRow, type VisitLite,
} from './visitAttendance';
import { sigma } from '@/bridge';

export interface VisitInput {
  id?: string; kibbutz: string; visitor: string; date: string; duration?: number | string;
  workday?: boolean; via?: string; [k: string]: unknown;
}

export interface SaveDeps {
  save: (input: VisitInput) => Promise<{ ok: boolean; id?: string; error?: string; needsCert?: boolean; edited?: boolean; locked?: boolean }>;
  visits: () => VisitLite[];
  rows: () => AttRow[];
  apply: (ops: AttOp[]) => Promise<{ ok: boolean; failed: number }>;
  me: string;
}

const defaultDeps: SaveDeps = {
  save: (v) => (sigma.saveVisitFromData ? sigma.saveVisitFromData(v as Record<string, unknown>) : Promise.resolve({ ok: false, error: 'שמירת ביקור אינה זמינה' })),
  visits: () => (sigma.loadAllVisitsCombined ? sigma.loadAllVisitsCombined() : []),
  rows: () => (sigma.attRowsRaw ? sigma.attRowsRaw() : []),
  apply: (ops) => (sigma.attApply ? sigma.attApply(ops) : Promise.resolve({ ok: false, failed: ops.length })),
  me: '',
};

export type SaveResult =
  | { ok: false; error: string; needsCert?: boolean; locked?: boolean }
  | { ok: true; id: string; edited: boolean; plan: AttPlan; toast: string; popups: string[]; asks: AttAsk[]; attendanceOk: boolean };

const dm = (ymd: string): string => {
  const [, m, d] = String(ymd || '').split('-');
  return `${parseInt(d, 10)}.${parseInt(m, 10)}`;
};

/**
 * Rule 4 ("Attendance rules (exact)"): the toast + the "needs entry" popups. `plan.autoDays` share
 * the visit's own day, so the toast names it once; a popup names the person only when it is not
 * the saver (a second filer's day was cleared by this save).
 */
export function saveMessages(plan: AttPlan, saver: string): { toast: string; popups: string[] } {
  const toast = plan.autoDays.length ? `הסיכום נשמר · הוזנה נוכחות שטח אוטומטית ל-${dm(plan.autoDays[0].ymd)}` : 'הסיכום נשמר';
  const seen = new Set<string>();
  const popups: string[] = [];
  for (const n of plan.notices) {
    const key = n.person + '|' + n.ymd;
    if (seen.has(key)) continue;
    seen.add(key);
    popups.push(`נדרשת הזנת נוכחות ל-${dm(n.ymd)}${n.person === saver ? '' : ' · ' + n.person}`);
  }
  return { toast, popups };
}

/** "הוזן X, לשנות לשטח?" — X is the day-type label without emoji. */
export function conflictQuestion(ask: AttAsk): string {
  return `הוזן ${DAY_LABEL_PLAIN[ask.existingType] ?? ask.existingType}, לשנות לשטח?`;
}

/**
 * Save order: read `before` (the filed visit with this id, if any) → saveVisitFromData → ONLY IF OK →
 * plan the attendance rules → apply the plan's ops → build the toast/popups. `asks` come back for the
 * caller to show (the sheet asks; the day log leaves manual rows alone, per rule 2, and shows nothing
 * extra for them).
 */
export async function saveVisit(input: VisitInput, deps: Partial<SaveDeps> = {}): Promise<SaveResult> {
  const d: SaveDeps = { ...defaultDeps, ...deps };

  const allVisits = d.visits();
  const beforeLive = input.id ? allVisits.find(v => v && v.id === input.id) ?? null : null;
  // The real save (js/src/09-visits.js saveVisitFromData) patches the SAME visit object IN PLACE on an
  // edit — snapshot it now, or "before" would silently become "after" by the time it is read below.
  const before: VisitLite | null = beforeLive ? { id: beforeLive.id, date: beforeLive.date, visitor: beforeLive.visitor } : null;

  const res = await d.save(input);
  if (!res.ok) return { ok: false, error: res.error || 'השמירה נכשלה', needsCert: res.needsCert, locked: (res as { locked?: boolean }).locked };

  const id = String(res.id ?? input.id ?? '');
  const after: VisitLite = { id, date: String(input.date || ''), visitor: String(input.visitor || '') };

  // planVisitAttendance is already a no-op (empty ops/asks/notices) when neither before nor after
  // involves a filer — no need to pre-check that here (it would just repeat the same filtering).
  const plan = planVisitAttendance({ before, after, rows: d.rows(), visits: allVisits });

  // Honour the write: an attendance op that failed must not be reported as if it had succeeded —
  // the visit itself is still `ok` (it saved), but the auto-filed toast and the "needs entry"
  // popups are about attendance rows that, in this branch, were never actually written.
  let attendanceOk = true;
  if (plan.ops.length) {
    const applied = await d.apply(plan.ops);
    attendanceOk = applied.ok;
  }
  if (!attendanceOk) {
    return { ok: true, id, edited: !!res.edited, plan, asks: plan.asks, toast: 'הסיכום נשמר', popups: [], attendanceOk: false };
  }

  const { toast, popups } = saveMessages(plan, d.me);
  return { ok: true, id, edited: !!res.edited, plan, toast, popups, asks: plan.asks, attendanceOk: true };
}

export { resolveConflict };
