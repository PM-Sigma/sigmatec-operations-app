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
  /** קוד לקוח — the internal customer number (db/kibbutzim_code.sql). */
  customer_code?: number | null;
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

// ───────────────────────────── קוד לקוח (QA round 3, D2) ─────────────────────────────

/**
 * The code shown in ✏️ פרטי קיבוץ. The ROW wins: `customer_code` is the editable truth
 * (db/kibbutzim_code.sql). The hard-coded `CUSTOMER_CODES` map in js/src/01-data.js stays
 * only as the fallback for a row that has no code yet (or a client talking to a database
 * where the column was not applied), which the caller passes in as `fallback`.
 */
export function customerCodeOf(row: KibbutzRow | null | undefined, fallback?: number | string | null): string {
  const own = row?.customer_code;
  if (own !== null && own !== undefined && String(own).trim() !== '') return String(own);
  return fallback === null || fallback === undefined ? '' : String(fallback).trim();
}

/** The sub-site rows filed under `name`, alphabetical he. Pure — the sheet only renders it. */
export function subsitesOf(rows: KibbutzRow[] | null | undefined, name: string): KibbutzRow[] {
  const parent = String(name || '').trim();
  if (!parent) return [];
  return (rows || [])
    .filter(r => r && !r.archived_at && r.kind === 'subsite' && String(r.parent || '').trim() === parent)
    .slice()
    .sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'he'));
}

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
 * `hasOpenWork` decides what counts) OR a running/paused ▶/■ work timer sorts to the TOP of the
 * home list, ahead of the normal region grouping. Pure and order-preserving within each bucket,
 * so the goldens can assert it without touching React or the bridge: the caller (Home.tsx)
 * supplies `hasOpenWork` from `useVisitDraft`/whatever else has an open-work signal for that
 * kibbutz, and `activeTimerKibbutz` from `loadRunning(user)` (עידן 22.9 — the top section is
 * about visible open work on the card, not EMS-task drafts).
 */
export function draftsAtTop(
  rows: KibbutzRow[],
  hasOpenWork: (name: string) => boolean,
  activeTimerKibbutz: string | null = null,
): { top: KibbutzRow[]; rest: KibbutzRow[] } {
  const top: KibbutzRow[] = [];
  const rest: KibbutzRow[] = [];
  (rows || []).forEach(r => {
    const timerHere = !!activeTimerKibbutz && !!r && r.name === activeTimerKibbutz;
    ((r && hasOpenWork(r.name)) || timerHere ? top : rest).push(r);
  });
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

  // קוד לקוח is OPTIONAL (a brand-new customer has no number yet) but when it is typed it is
  // a whole positive number, and it may not collide with another live kibbutz's code — two
  // rows sharing a code is exactly the ambiguity the map used to make impossible.
  const rawCode = row?.customer_code;
  if (rawCode === null || rawCode === undefined || String(rawCode).trim() === '') {
    out.customer_code = null;
  } else {
    const code = Number(String(rawCode).trim());
    if (!Number.isInteger(code) || code <= 0) errors.push('קוד לקוח חייב להיות מספר שלם חיובי');
    else {
      out.customer_code = code;
      const codeClash = (allRows || []).find(r =>
        r && !r.archived_at && Number(r.customer_code) === code
        && !(row.id && r.id === row.id) && r.name !== name);
      if (codeClash) errors.push('קוד הלקוח הזה כבר משויך ל' + labelOf(codeClash));
    }
  }

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
  // A row with no code sends an explicit null, so clearing a wrong code actually clears it.
  body.customer_code = row.customer_code === null || row.customer_code === undefined
    ? null : Number(row.customer_code);
  if (row.id) body.id = row.id;
  if (row.ems_site_ids) body.ems_site_ids = row.ems_site_ids;
  if (row.ems_params) body.ems_params = row.ems_params;
  if (row.created_by) body.created_by = row.created_by;
  if (canEditEnergy(user)) body.energy = energyOf(row);
  return body;
}

// ───────────────────────────── EMS link status ─────────────────────────────
// The 5-step verification chain is gone (22.9, QA round 4 Package Y — עידן: "להעיף את
// השרשרת בדיקה מול ה-EMS"). The sheet saves the row as typed; `ems_site_ids` is whatever the
// row already carries, shown read-only. What matters is a clear error when a live site has
// none — see `isUnlinked` below and app/src/lib/alerts.ts / health.ts for where that surfaces.

export interface EmsParams {
  site: { id: string; name: string };
  meters: { electric: number; water: number; gas: number; total: number };
  openTasks: number;
  contacts: Array<{ name?: string; phone?: string }>;
  checkedAt: string;
}

/** `✓ מקושר` vs `⚠️ לא מקושר` — the read-only line the sheet shows in place of the old chain. */
export function emsLinkedLabel(row: KibbutzRow | null): string {
  return row && siteIdsOf(row).length ? '✓ מקושר' : '⚠️ לא מקושר';
}

/**
 * The thing עידן called "הכי לא תקין במערכת": a live (non-archived) kibbutz or sub-site with
 * no EMS site at all. Used by the card chip, the alerts bell and health.ts — one rule, three
 * places it shows up.
 */
export function isUnlinked(row: KibbutzRow): boolean {
  if (!row || row.archived_at) return false;
  return !siteIdsOf(row).length;
}

/**
 * The row's EMS site ids, cleaned. Mirrors js/src/01-data.js `emsIdsUnlinked` (the card chip):
 * a JSON-string column and blank entries are tolerated the same way on both sides, so the card
 * and the bell can never disagree (spec 2026-09-23 ems-session §4).
 */
export function siteIdsOf(row: KibbutzRow): string[] {
  let ids: unknown = row?.ems_site_ids;
  if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch { ids = ids ? [ids] : []; } }
  return Array.isArray(ids) ? (ids as unknown[]).filter(Boolean).map(String) : [];
}

// ───────────────────────── tolerating a database without the column ─────────────────────────

/**
 * `db/kibbutzim_code.sql` may not have been applied yet on the database this client is
 * talking to. PostgREST answers such a write with PGRST204 ("Could not find the
 * 'customer_code' column") — that is a MISSING MIGRATION, not a bad save, so the sheet
 * retries the same body without the key instead of showing the person an error he cannot act on.
 */
export function isMissingCustomerCodeColumn(err: unknown): boolean {
  const e = err as any;
  const code = String(e?.code || '');
  const msg = String(e?.message || e || '');
  if (!/customer_code/.test(msg)) return false;
  return code === 'PGRST204' || code === '42703' || /could not find|does not exist/i.test(msg);
}

/** The same save body minus `customer_code` — what the retry above sends. */
export function withoutCustomerCode(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  delete out.customer_code;
  return out;
}
