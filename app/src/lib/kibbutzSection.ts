// Section (קטגוריה: new/active) editing. עידן 29.9 ruling: REGION is fixed and is not editable
// anywhere in the app (only Claude, via service role/SQL). SECTION is editable ONLY by עידן and
// עמיחי, in exactly two places: the kibbutz card ✏️ sheet and the meeting presenter ✏️ next to
// the name. Both go through the ONE server function `set_kibbutz_section`
// (db/kibbutz_section_lock.sql), which re-checks the caller; a BEFORE UPDATE trigger on
// `kibbutzim` refuses any other route. The client gate here only decides who SEES the control.
import { getSupabase } from '@/lib/supabase';
import { sectionOf, type KibbutzRow, type Section } from '@/lib/kibbutzim';

export const SECTION_EDITORS = ['עידן', 'עמיחי'];

export function canEditSection(user: string, isViewer: boolean): boolean {
  return !isViewer && SECTION_EDITORS.includes(user);
}

export const SECTION_LABEL: Record<Section, string> = { new: '🆕 לקוח חדש', active: '✅ פעיל' };

export interface SectionEdit { name: string; section: Section }

/** The edit to send, or null when nothing changed / nothing valid was picked. */
export function buildSectionEdit(row: KibbutzRow, section: Section): SectionEdit | null {
  if (!row?.name || (section !== 'new' && section !== 'active')) return null;
  if (section === sectionOf(row)) return null;
  return { name: row.name, section };
}

/** The same edit that puts the row back how it was (for the undo). */
export function buildUndoEdit(row: KibbutzRow): SectionEdit {
  return { name: row.name, section: sectionOf(row) };
}

/** Optimistic patch of a cached row list. */
export function applyEdit(rows: KibbutzRow[], e: SectionEdit): KibbutzRow[] {
  return rows.map(r => (r.name === e.name ? { ...r, section: e.section } : r));
}

export const RPC_MISSING_MSG = 'שינוי קטגוריה עדיין לא זמין';

export function sectionErrorMessage(e: any): string {
  const msg = String(e?.message || '');
  if (e?.code === 'PGRST202' || e?.code === '42883' || /could not find the function|does not exist/i.test(msg)) {
    return RPC_MISSING_MSG;
  }
  if (e?.code === '42501' || /not allowed|viewer/i.test(msg)) return 'אין הרשאה לשנות קטגוריה';
  return 'לא הצלחתי לשמור, נסה שוב';
}

/** Calls the RPC; throws a Hebrew-message Error on any failure. */
export async function saveSection(e: SectionEdit): Promise<void> {
  try {
    const sb = await getSupabase();
    const { error } = await sb.rpc('set_kibbutz_section', { p_kibbutz: e.name, p_section: e.section });
    if (error) throw error;
  } catch (err) {
    throw new Error(sectionErrorMessage(err));
  }
}

/**
 * Mirror of the DB trigger `kibbutzim_lock_region_section` decision table (db/kibbutz_section_lock.sql).
 * Pure so the SQL logic is unit-testable. `role` is the DB caller role; `viaRpc` is
 * current_setting('sigma.section_rpc') = '1' (set by set_kibbutz_section, transaction-local).
 */
export type TriggerDecision = 'allow' | 'deny';
export function triggerDecision(o: {
  op: 'INSERT' | 'UPDATE'; role: string; regionChanged: boolean; sectionChanged: boolean; viaRpc: boolean;
}): TriggerDecision {
  if (o.op === 'INSERT') return 'allow';
  if (o.role === 'service_role' || o.role === 'postgres') return 'allow';
  if (o.regionChanged) return 'deny';
  if (o.sectionChanged && !o.viaRpc) return 'deny';
  return 'allow';
}
