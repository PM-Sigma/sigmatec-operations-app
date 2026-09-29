// H3: editing a kibbutz's region/section from the meeting presenter. Pure builders (goldens in
// kibbutzRegionSection.test.ts) + one thin RPC call. The server function
// `set_kibbutz_region_section` (db/kibbutz_region_section_rpc.sql) re-checks the caller; the
// client gate here only decides who SEES the editable chips.
import { getSupabase } from '@/lib/supabase';
import { regionOrder, sectionOf, type KibbutzRow, type Section } from '@/lib/kibbutzim';

export const REGION_EDITORS = ['עידן', 'עמיחי'];

export function canEditRegionSection(user: string, isViewer: boolean): boolean {
  return !isViewer && REGION_EDITORS.includes(user);
}

export const SECTION_LABEL: Record<Section, string> = { new: '🆕 לקוח חדש', active: '✅ פעיל' };

/** The picker's region list: the known regions, plus the row's own if it is off-list. */
export function regionChoices(row: KibbutzRow): string[] {
  const list = regionOrder().slice();
  const cur = String(row.region || '');
  if (cur && !list.includes(cur)) list.push(cur);
  return list;
}

export interface RegionSectionEdit { name: string; region: string; section: Section }

/** The edit to send, or null when nothing changed / nothing valid was picked. */
export function buildRegionSectionEdit(
  row: KibbutzRow, region: string, section: Section,
): RegionSectionEdit | null {
  const r = String(region || '').trim();
  if (!row?.name || !r || (section !== 'new' && section !== 'active')) return null;
  if (r === String(row.region || '') && section === sectionOf(row)) return null;
  return { name: row.name, region: r, section };
}

/** The same edit that puts the row back how it was (for the undo). */
export function buildUndoEdit(row: KibbutzRow): RegionSectionEdit {
  return { name: row.name, region: String(row.region || ''), section: sectionOf(row) };
}

/** Optimistic patch of a cached row list. */
export function applyEdit(rows: KibbutzRow[], e: RegionSectionEdit): KibbutzRow[] {
  return rows.map(r => (r.name === e.name ? { ...r, region: e.region, section: e.section } : r));
}

export const RPC_MISSING_MSG = 'שינוי איזור/מדור עדיין לא זמין';

export function regionErrorMessage(e: any): string {
  const msg = String(e?.message || '');
  if (e?.code === 'PGRST202' || e?.code === '42883' || /could not find the function|does not exist/i.test(msg)) {
    return RPC_MISSING_MSG;
  }
  if (e?.code === '42501' || /not allowed|viewer/i.test(msg)) return 'אין הרשאה לשנות איזור/מדור';
  return 'לא הצלחתי לשמור, נסה שוב';
}

/** Calls the RPC; throws a Hebrew-message Error on any failure. */
export async function saveRegionSection(e: RegionSectionEdit): Promise<void> {
  try {
    const sb = await getSupabase();
    const { error } = await sb.rpc('set_kibbutz_region_section', {
      p_kibbutz: e.name, p_region: e.region, p_section: e.section,
    });
    if (error) throw error;
  } catch (err) {
    throw new Error(regionErrorMessage(err));
  }
}
