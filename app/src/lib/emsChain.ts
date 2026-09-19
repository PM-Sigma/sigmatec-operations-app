// The async half of the EMS verification chain (spec §7b). Deliberately thin: every call is
// wrapped so a failing step degrades to "skipped" instead of killing the run ("all steps run
// even if one fails"), and the decision of what that MEANS lives in the pure emsChainReduce.
import { sigma } from '@/bridge';
import { emsGateway } from '@/lib/ems/gateway';
import { getSupabase } from '@/lib/supabase';
import type { ChainInput, KibbutzRow } from '@/lib/kibbutzim';

const norm = (s: unknown) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/** Exact normalized name match, then containment either way — same rule as emsSiteIdForKibbutz. */
export function matchSite(
  sites: Array<{ id: string; name: string }>,
  name: string,
): { id: string; name: string } | null {
  const target = norm(name);
  if (!target) return null;
  let hit = sites.find(s => norm(s.name) === target);
  if (!hit) hit = sites.find(s => { const n = norm(s.name); return !!n && (n.indexOf(target) !== -1 || target.indexOf(n) !== -1); });
  return hit || null;
}

/** Count meters per EMS energy_type_code (1 חשמל · 2 מים · 3 גז). */
export function countMeters(list: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  (list || []).forEach(m => {
    const code = String(m?.energyCode ?? m?.energy_type_code ?? m?.energyTypeCode ?? m?.energyType?.code ?? '');
    if (!code) return;
    counts[code] = (counts[code] || 0) + 1;
  });
  return counts;
}

/** Which other live row already claims this EMS site id (spec §7b step 5). */
export function duplicateLinkOf(siteId: string, allRows: KibbutzRow[], selfName: string): string | null {
  const hit = (allRows || []).find(r =>
    r && !r.archived_at && r.name !== selfName && (r.ems_site_ids || []).indexOf(siteId) !== -1);
  return hit ? hit.name : null;
}

export interface ChainProgress { (partial: ChainInput): void }

/**
 * Run the chain for `name`. `onStep` is called after every step so the panel can tick
 * ⏳ → ✓/⚠️/✗ live instead of flashing all five rows at the end.
 */
export async function emsChainRun(
  name: string,
  parentRow: KibbutzRow | null,
  allRows: KibbutzRow[],
  onStep?: ChainProgress,
): Promise<ChainInput> {
  const acc: ChainInput = {};
  const emit = () => { if (onStep) onStep({ ...acc }); };

  // 1. site
  let site: { id: string; name: string } | null = null;
  try {
    site = matchSite((await sigma.getEmsSites()) || [], name);
  } catch { site = null; }
  acc.site = site ? { found: true, id: site.id, name: site.name } : { found: false };
  emit();
  if (!site) {
    // Steps 2-4 need a site id, but step 5 is a LOCAL check (does the parent exist, is it
    // live) — it still has an answer, and hiding it would make the panel look truncated.
    if (parentRow) { acc.parent = { row: parentRow, duplicateOf: null }; emit(); }
    return acc;
  }

  // 2. meters — the API may reject the filter; that is a ⚠️, not a failure. A transport that
  // cannot list meters at all (capabilities(), spec §7o) is the same "skipped", not an error.
  const gw = emsGateway();
  const caps = gw.capabilities();
  try {
    if (!caps.listMeters) throw new Error('unsupported');
    acc.meters = { counts: countMeters(await gw.listMeters(site.id)) };
  } catch { acc.meters = { skipped: true }; }
  emit();

  // 3. open tasks
  try {
    if (!caps.listOpenTasks) throw new Error('unsupported');
    const list = await gw.listOpenTasks({ siteId: site.id, take: 100 });
    acc.tasks = { count: list.length, titles: list.slice(0, 3).map(t => String(t.title || '')).filter(Boolean) };
  } catch { acc.tasks = { skipped: true }; }
  emit();

  // 4. contacts (Supabase, not EMS)
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('site_contacts').select('*').eq('site_id', site.id);
    if (error) throw error;
    acc.contacts = { contacts: (data || []).map((c: any) => ({ name: c.name || c.full_name || '', phone: c.phone || '' })) };
  } catch { acc.contacts = { skipped: true }; }
  emit();

  // 5. parent + duplicate link
  if (parentRow) {
    acc.parent = { row: parentRow, duplicateOf: duplicateLinkOf(site.id, allRows, name) };
    emit();
  }
  return acc;
}
