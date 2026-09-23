// Round 5, package V: one orchestrator for "save a visit" that both the chapters sheet and the day
// log call — saveVisitFromData (the pipeline) THEN the attendance plan it implies (rules 1-3,
// app/src/lib/visitAttendance.ts), applied ONLY when the save itself succeeded (S4: an offline save
// must run no attendance op and show no success toast).
import { visitorsOf } from './field';
import {
  AUTO_PEOPLE, DAY_LABEL_PLAIN, planVisitAttendance, resolveConflict,
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
  now?: () => Date;
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
  | { ok: true; id: string; edited: boolean; equipmentLocked?: boolean; plan: AttPlan; toast: string; popups: string[]; asks: AttAsk[] };

const dm = (ymd: string): string => {
  const [, m, d] = String(ymd || '').split('-');
  return `${parseInt(d, 10)}.${parseInt(m, 10)}`;
};

/**
 * Rule 4 ("Attendance rules (exact)"): the toast + the "needs entry" popups. `plan.autoDays` share
 * the visit's own day, so the toast names it once; a popup names the person only when it is not
 * the saver (a second filer's day was cleared by this save).
 */
export function saveMessages(plan: AttPlan, now: Date, saver: string): { toast: string; popups: string[] } {
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
  const now = (d.now ?? (() => new Date()))();

  const allVisits = d.visits();
  const beforeLive = input.id ? allVisits.find(v => v && v.id === input.id) ?? null : null;
  // The real save (js/src/09-visits.js saveVisitFromData) patches the SAME visit object IN PLACE on an
  // edit — snapshot it now, or "before" would silently become "after" by the time it is read below.
  const before: VisitLite | null = beforeLive ? { id: beforeLive.id, date: beforeLive.date, visitor: beforeLive.visitor } : null;

  const res = await d.save(input);
  if (!res.ok) return { ok: false, error: res.error || 'השמירה נכשלה', needsCert: res.needsCert, locked: (res as { locked?: boolean }).locked };

  const id = String(res.id ?? input.id ?? '');
  const after: VisitLite = { id, date: String(input.date || ''), visitor: String(input.visitor || '') };

  const filers = AUTO_PEOPLE.some(p => visitorsOf(after).includes(p)) || (before ? AUTO_PEOPLE.some(p => visitorsOf(before).includes(p)) : false);
  let plan: AttPlan = { ops: [], asks: [], notices: [], autoDays: [] };
  if (filers) {
    plan = planVisitAttendance({ before, after, rows: d.rows(), visits: allVisits });
    if (plan.ops.length) await d.apply(plan.ops);
  }

  const { toast, popups } = saveMessages(plan, now, d.me);
  return { ok: true, id, edited: !!res.edited, equipmentLocked: (res as { archived?: boolean }).archived, plan, toast, popups, asks: plan.asks };
}

export { resolveConflict };
