// Pure logic for the kibbutz card home (spec §7b). Everything here is a plain function over
// plain rows — no React, no DOM, no network — so the whole surface is covered by vitest
// goldens (kibbutzim.test.ts) and the island stays a thin rendering shell.

export type Section = 'new' | 'active';
export type Energy = 'electric' | 'water' | 'gas';
export type Kind = 'kibbutz' | 'subsite';

export interface KibbutzRow {
  id?: string;
  name: string;
  display_name?: string | null;
  section?: string | null;
  energy?: Energy[] | null;
  marketing?: boolean | null;
  region?: string | null;
  kind?: Kind | null;
  parent?: string | null;
  ems_params?: EmsParams | null;
  ems_site_ids?: string[] | null;
  archived_at?: string | null;
  created_by?: string | null;
}

export interface RegionGroup {
  region: string;
  rows: KibbutzRow[];
}

// North → south. Mirrors js/src/24-kibbutzim.js so the island and the legacy fallback agree;
// at runtime the legacy global wins (see regionOrder()), this is the offline default.
/**
 * The FIVE regions the `kibbutzim` table actually holds, north → south (עידן, spec §2). The
 * long tail of old sub-region names ('גליל תחתון', 'עמק הירדן', 'שער הנגב'…) is gone: the data
 * was consolidated in prod, so offering them again would only let someone re-create the mess.
 * The datalist offers exactly these; `NO_REGION_LABEL` is a defensive fallback for a row that
 * somehow arrives empty, not a choice.
 */
export const REGION_ORDER = [
  'גליל וגולן', 'העמקים', 'מישור החוף והשרון', 'שפלה ומרכז', 'דרום, עוטף עזה והנגב',
];

export const NO_REGION_LABEL = 'ללא איזור';

export const ENERGY_LABEL: Record<Energy, string> = {
  electric: '⚡ חשמל',
  water: '💧 מים',
  gas: '🔥 גז',
};

/** The region order the page actually uses — legacy global first so both renderers agree. */
export function regionOrder(): string[] {
  const g = (globalThis as any).REGION_ORDER_KIB;
  return Array.isArray(g) && g.length ? g : REGION_ORDER;
}

export const labelOf = (row: KibbutzRow): string => String(row?.display_name || row?.name || '');

export const energyOf = (row: KibbutzRow): Energy[] =>
  (row?.energy && row.energy.length ? row.energy : ['electric']) as Energy[];

export const energyText = (row: KibbutzRow): string =>
  energyOf(row).map(e => ENERGY_LABEL[e] || ENERGY_LABEL.electric).join(' + ');

export const sectionOf = (row: KibbutzRow): Section => (row?.section === 'new' ? 'new' : 'active');

export const isSubsite = (row: KibbutzRow): boolean => row?.kind === 'subsite' && !!row.parent;

// ───────────────────────────── grouping ─────────────────────────────

/**
 * rows → { new: [{region, rows}], active: [...] }.
 * Regions ordered by REGION_ORDER, unknown regions after them (alphabetical he), '' last.
 * Inside a region: alphabetical he-IL by display name, with a sub-site pinned right after
 * its parent (it borrows the parent's sort key, then loses the kind tiebreak).
 * Ported verbatim from js/src/24-kibbutzim.js — same goldens on both sides.
 */
export function groupBySection(rows: KibbutzRow[] | null | undefined): Record<Section, RegionGroup[]> {
  const out: Record<Section, RegionGroup[]> = { new: [], active: [] };
  const list = rows || [];
  const byLabel: Record<string, string> = {};
  list.forEach(r => { byLabel[r.name] = labelOf(r); });

  const sortKey = (r: KibbutzRow) => (isSubsite(r) ? (byLabel[r.parent!] || r.parent!) : labelOf(r));
  const cmp = (a: KibbutzRow, b: KibbutzRow) =>
    sortKey(a).localeCompare(sortKey(b), 'he') ||
    ((isSubsite(a) ? 1 : 0) - (isSubsite(b) ? 1 : 0)) ||
    labelOf(a).localeCompare(labelOf(b), 'he');

  const order = regionOrder();
  (['new', 'active'] as Section[]).forEach(section => {
    const mine = list.filter(r => sectionOf(r) === section);
    const byRegion: Record<string, KibbutzRow[]> = {};
    mine.forEach(r => {
      const reg = String(r.region || '');
      (byRegion[reg] = byRegion[reg] || []).push(r);
    });
    const known = order.filter(r => byRegion[r]);
    const unknown = Object.keys(byRegion)
      .filter(r => r && order.indexOf(r) === -1)
      .sort((a, b) => a.localeCompare(b, 'he'));
    const ordered = known.concat(unknown);
    if (byRegion['']) ordered.push('');
    out[section] = ordered.map(reg => ({ region: reg, rows: byRegion[reg].slice().sort(cmp) }));
  });
  return out;
}

// ───────────────────────────── home ordering (QA round 2, Package A §4) ─────────────────────────────

/**
 * A kibbutz with an open visit draft (or an in-progress EMS-task creation — the caller's
 * `hasOpenWork` decides what counts) sorts to the TOP of the home list, ahead of the normal
 * region grouping. Pure and order-preserving within each bucket, so the goldens can assert it
 * without touching React or the bridge: the caller (Home.tsx) supplies `hasOpenWork` from
 * `useVisitDraft`/whatever else has an open-work signal for that kibbutz.
 */
export function draftsAtTop(
  rows: KibbutzRow[],
  hasOpenWork: (name: string) => boolean,
): { top: KibbutzRow[]; rest: KibbutzRow[] } {
  const top: KibbutzRow[] = [];
  const rest: KibbutzRow[] = [];
  (rows || []).forEach(r => { (r && hasOpenWork(r.name) ? top : rest).push(r); });
  return { top, rest };
}

// ───────────────────────────── filters ─────────────────────────────

export type CardFilter = 'all' | 'new' | 'active' | 'marketing';

/** Search matches name, display_name and region (spec §7b: "the search box already matches region text"). */
export function matchesQuery(row: KibbutzRow, q: string): boolean {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = [row.name, row.display_name, row.region, row.parent]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(needle);
}

export function filterRows(rows: KibbutzRow[], filter: CardFilter, q: string): KibbutzRow[] {
  return (rows || []).filter(r => {
    if (!matchesQuery(r, q)) return false;
    if (filter === 'all') return true;
    if (filter === 'marketing') return !!r.marketing;
    return sectionOf(r) === filter;
  });
}

export interface Counts { all: number; new: number; active: number; marketing: number }

export function countRows(rows: KibbutzRow[]): Counts {
  const live = (rows || []).filter(r => r && r.name && !r.archived_at);
  return {
    all: live.length,
    new: live.filter(r => sectionOf(r) === 'new').length,
    active: live.filter(r => sectionOf(r) === 'active').length,
    marketing: live.filter(r => !!r.marketing).length,
  };
}

// ───────────────────────────── roles ─────────────────────────────

export const KIBBUTZ_ADMINS = ['עידן', 'עמיחי'];

/** Who may create / edit / archive a kibbutz row (brief: עידן + עמיחי, never a viewer). */
export function canManageKibbutzim(user: string, isViewer = false): boolean {
  return KIBBUTZ_ADMINS.indexOf(String(user || '')) !== -1 && !isViewer;
}

/** Energy types are עידן's call alone (spec §7b). */
export function canEditEnergy(user: string): boolean {
  return String(user || '') === 'עידן';
}

export const ENERGY_LOCK_TITLE = 'רק עידן משנה סוגי אנרגיה';

export type CardAction = 'visit';

/** Card quick-action row: 📍 סיכום ביקור and nothing else (עידן 22.9 — 🚚 lives inside the visit
 *  summary, 🗓 only re-opened the card). The viewer, who cannot write, gets no row at all. */
export function cardActionsFor(role: string): CardAction[] {
  return role === 'viewer' ? [] : ['visit'];
}

// ───────────────────────────── validation ─────────────────────────────

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** The normalized row that should be saved (trimmed name; a sub-site inherits section+region). */
  row: KibbutzRow;
}

export function validateKibbutz(row: KibbutzRow, allRows: KibbutzRow[] = []): ValidationResult {
  const errors: string[] = [];
  const name = String(row?.name || '').trim();
  const out: KibbutzRow = { ...row, name };

  if (!name) errors.push('שם חובה');

  const clash = (allRows || []).find(r =>
    r && String(r.name || '').trim() === name && !(row.id && r.id === row.id) && !r.archived_at);
  if (name && clash) errors.push('קיבוץ בשם הזה כבר קיים');

  const energy = (row?.energy || []) as Energy[];
  if (!energy.length) errors.push('יש לבחור לפחות סוג אנרגיה אחד');
  else out.energy = energy;

  if (isSubsite(out) || out.kind === 'subsite') {
    out.kind = 'subsite';
    const parent = (allRows || []).find(r => r && r.name === out.parent && !r.archived_at);
    if (!parent) errors.push('קיבוץ-אב לא נמצא');
    else {
      // A sub-site is never filed on its own: it inherits the parent's section and region
      // so the pair can never drift into two different places on the page.
      out.section = sectionOf(parent);
      out.region = parent.region || '';
    }
  } else {
    out.kind = 'kibbutz';
    out.parent = null;
    if (out.section !== 'new' && out.section !== 'active') errors.push('מדור לא תקין');
    // An איזור is REQUIRED (עידן, spec §2): the cards are grouped by it, so a row without one
    // lands in a "ללא איזור" bucket that exists only because someone skipped a field. A
    // sub-site is exempt — it inherits its parent's region above.
    const region = String(out.region || '').trim();
    if (!region) errors.push('חובה לבחור איזור');
    else out.region = region;
  }

  return { ok: errors.length === 0, errors, row: out };
}

// ───────────────────────────── save body ─────────────────────────────

/**
 * The exact PATCH/POST body. For anyone but עידן the `energy` key is REMOVED (not emptied),
 * so an upsert leaves whatever the server already has instead of overwriting it.
 */
export function kibbutzimSaveBody(row: KibbutzRow, user: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: String(row.name || '').trim(),
    display_name: row.display_name || null,
    section: sectionOf(row),
    marketing: !!row.marketing,
    region: row.region || '',
    kind: row.kind === 'subsite' ? 'subsite' : 'kibbutz',
    parent: row.kind === 'subsite' ? (row.parent || null) : null,
  };
  if (row.id) body.id = row.id;
  if (row.ems_site_ids) body.ems_site_ids = row.ems_site_ids;
  if (row.ems_params) body.ems_params = row.ems_params;
  if (row.created_by) body.created_by = row.created_by;
  if (canEditEnergy(user)) body.energy = energyOf(row);
  return body;
}

// ───────────────────────────── EMS verification chain ─────────────────────────────

export type ChainStepId = 'site' | 'meters' | 'tasks' | 'contacts' | 'parent';
export type ChainState = 'pending' | 'ok' | 'warn' | 'bad' | 'skipped';

export interface ChainStep {
  id: ChainStepId;
  label: string;
  state: ChainState;
  value: string;
}

export const CHAIN_LABELS: Record<ChainStepId, string> = {
  site: 'אתר ב-EMS',
  meters: 'מונים',
  tasks: 'משימות פתוחות',
  contacts: 'אנשי קשר',
  parent: 'קיבוץ-אב',
};

export interface EmsParams {
  site: { id: string; name: string };
  meters: { electric: number; water: number; gas: number; total: number };
  openTasks: number;
  contacts: Array<{ name?: string; phone?: string }>;
  checkedAt: string;
}

export interface ChainInput {
  site?: { found: boolean; id?: string; name?: string };
  meters?: { skipped?: boolean; counts?: Record<string, number> };
  tasks?: { skipped?: boolean; count?: number; titles?: string[] };
  contacts?: { skipped?: boolean; contacts?: Array<{ name?: string; phone?: string }> };
  parent?: { row?: KibbutzRow | null; duplicateOf?: string | null };
  /** The user ticked "שמור בלי קישור" — a site-less sub-site may still be saved. */
  allowUnlinked?: boolean;
}

export interface ChainResult {
  ems_site_ids: string[];
  energy: Energy[];
  ems_params: EmsParams | null;
  canSave: boolean;
  warnings: string[];
  steps: ChainStep[];
}

/** The ordered step list for a run. The "קיבוץ-אב" step only exists for a sub-site. */
export function emsChainPlan(
  _name: string,
  parentRow: KibbutzRow | null | undefined,
  _allRows: KibbutzRow[] = [],
): ChainStep[] {
  const ids: ChainStepId[] = ['site', 'meters', 'tasks', 'contacts'];
  if (parentRow) ids.push('parent');
  return ids.map(id => ({ id, label: CHAIN_LABELS[id], state: 'pending' as ChainState, value: '' }));
}

// EMS energy_type_code → our energy key.
const METER_ENERGY: Record<string, Energy> = { 1: 'electric', 2: 'water', 3: 'gas' };
const ENERGY_SORT: Energy[] = ['electric', 'water', 'gas'];

/**
 * Chain results → what actually gets saved. Pure: every async detail is resolved by
 * emsChainRun before it reaches here, so the decision table is fully golden-tested.
 */
export function emsChainReduce(input: ChainInput, now = new Date().toISOString()): ChainResult {
  const warnings: string[] = [];
  const steps: ChainStep[] = [];
  const site = input.site;
  const found = !!(site && site.found && site.id);

  steps.push({
    id: 'site',
    label: CHAIN_LABELS.site,
    state: found ? 'ok' : 'bad',
    value: found ? `${site!.name || ''} · נמצא`.trim() : 'לא נמצא',
  });
  if (!found) warnings.push('לא נמצא אתר ב-EMS');

  // Step 1 is the gate: with no site there is nothing to count, so the rest is reported
  // as skipped rather than failed (spec §7b: "nothing else runs").
  const skipRest = !found;

  const counts = (input.meters && input.meters.counts) || {};
  const meters = { electric: 0, water: 0, gas: 0, total: 0 };
  Object.keys(counts).forEach(code => {
    const key = METER_ENERGY[String(code)];
    const n = Number(counts[code]) || 0;
    if (key) { meters[key] += n; meters.total += n; }
  });
  const metersSkipped = skipRest || !!(input.meters && input.meters.skipped) || !input.meters;
  let energy = ENERGY_SORT.filter(e => meters[e] > 0);
  if (!energy.length) energy = ['electric'];                 // the safe default (spec §7b)
  if (metersSkipped) {
    if (!skipRest) warnings.push('לא ניתן לספור מונים');
    energy = ['electric'];
  }
  steps.push({
    id: 'meters',
    label: CHAIN_LABELS.meters,
    state: skipRest ? 'skipped' : metersSkipped ? 'warn' : 'ok',
    value: skipRest ? 'לא נבדק'
      : metersSkipped ? 'לא ניתן לספור מונים, ברירת מחדל ⚡ חשמל'
      : ENERGY_SORT.filter(e => meters[e] > 0).map(e => `${meters[e]} ${ENERGY_LABEL[e]}`).join(' · '),
  });

  const tasks = input.tasks;
  const tasksSkipped = skipRest || !tasks || !!tasks.skipped;
  const openTasks = tasksSkipped ? 0 : Number(tasks!.count) || 0;
  steps.push({
    id: 'tasks',
    label: CHAIN_LABELS.tasks,
    state: skipRest ? 'skipped' : tasksSkipped ? 'warn' : 'ok',
    value: skipRest ? 'לא נבדק'
      : tasksSkipped ? 'לא ניתן לקרוא משימות'
      : `${openTasks}${(tasks!.titles || []).length ? ' · ' + (tasks!.titles || []).join(', ') : ''}`,
  });
  if (!skipRest && tasksSkipped) warnings.push('לא ניתן לקרוא משימות');

  const contacts = (input.contacts && input.contacts.contacts) || [];
  const contactsSkipped = skipRest || !input.contacts || !!input.contacts.skipped;
  steps.push({
    id: 'contacts',
    label: CHAIN_LABELS.contacts,
    state: skipRest ? 'skipped' : contactsSkipped ? 'warn' : contacts.length ? 'ok' : 'warn',
    value: skipRest ? 'לא נבדק'
      : contactsSkipped ? 'לא ניתן לקרוא אנשי קשר'
      : contacts.length ? contacts.map(c => c.name || c.phone || '—').join(', ')
      : 'אין רשומות, להוסיף אחר כך',
  });
  if (!skipRest && !contactsSkipped && !contacts.length) warnings.push('אין אנשי קשר');

  if (input.parent) {
    const p = input.parent.row;
    const dup = input.parent.duplicateOf;
    const parentOk = !!p && !p.archived_at;
    if (!parentOk) warnings.push('קיבוץ-אב לא נמצא');
    if (dup) warnings.push('האתר כבר מקושר ל-' + dup);
    steps.push({
      id: 'parent',
      label: CHAIN_LABELS.parent,
      state: !parentOk ? 'bad' : dup ? 'warn' : 'ok',
      value: !parentOk ? 'לא נמצא'
        : dup ? 'האתר כבר מקושר ל-' + dup
        : `${labelOf(p!)} · ${sectionOf(p!) === 'new' ? 'חדש' : 'פעיל'}${p!.region ? ' · ' + p!.region : ''} (יורש מדור ואיזור)`,
    });
  }

  return {
    ems_site_ids: found ? [site!.id!] : [],
    energy,
    ems_params: found ? {
      site: { id: site!.id!, name: site!.name || '' },
      meters,
      openTasks,
      contacts,
      checkedAt: now,
    } : null,
    canSave: found || !!input.allowUnlinked,
    warnings,
    steps,
  };
}
