// 🔥 צריבות — the temporary meter-burn project, inside 2.00 (Task 23).
//
// The project itself is a few months of field work: drive to a kibbutz, connect a PROBE to
// every Landis E360 generation meter, burn it onto the closed APN network. It is NOT a
// permanent part of the app, so it gets NO nav tab — it lives where the work happens (the
// kibbutz card, the card modal, the briefing, the landing strip), and one flag takes all of
// it off the screen when the project ends.
//
// Everything in this file is a plain function over plain rows — no React, no DOM, no
// network — so every rule is covered by goldens (burns.test.ts) and the components stay
// rendering shells. The legacy full-table screen (js/src/24-meter-burns.js) keeps its own
// copy of the same rules in its PURE block; `test-meter-burns.mjs` covers that half.

/** The one flag. `BURNS_PROJECT_ACTIVE = false` (js/src/24-meter-burns.js) hides every
 *  surface — chip, modal section, briefing rows, strip and the full table — while the data
 *  stays in `meter_burns` for the report. Undefined (island loaded without the legacy
 *  bundle, e.g. under vitest) reads as ACTIVE, so a test has to opt out explicitly. */
export function burnsProjectActive(): boolean {
  return (globalThis as any).BURNS_PROJECT_ACTIVE !== false;
}

/** Who the project is for (spec's original audience, restored by עידן's 18.9 ruling). */
export const BURN_WRITERS = ['אביאם', 'ניתאי', 'עידן', 'עמיחי'];
/** Explicitly out: the two dev people have nothing to do with meters in the field. */
export const BURN_HIDDEN = ['מתניה', 'אליה'];

/**
 * May this person SEE any צריבות surface? A viewer reads everything (that is what צופה is
 * for); מתניה/אליה see nothing; everyone else must be in the project's audience. An unknown
 * name sees nothing — a temporary project does not widen itself by accident.
 */
export function canSeeBurns(user: string, isViewer: boolean): boolean {
  if (!burnsProjectActive()) return false;
  const name = String(user ?? '').trim();
  if (isViewer) return true;
  if (BURN_HIDDEN.includes(name)) return false;
  return BURN_WRITERS.includes(name);
}

/** May this person MARK a meter (נצרב / בעיה / גנרטור)? Read-only for the viewer. */
export function canWriteBurns(user: string, isViewer: boolean): boolean {
  if (!canSeeBurns(user, isViewer)) return false;
  if (isViewer) return false;
  return BURN_WRITERS.includes(String(user ?? '').trim());
}

// ───────────────────────────── rows ─────────────────────────────

export type BurnStatus = 'pending' | 'burned' | 'issue';
/** `burned-ct` is a COLOUR, not a fourth status: a burned CT meter is done in the field and
 *  only marked 🟣 so everyone knows it is now reachable for the remote software update. */
export type BurnVisual = 'pending' | 'burned' | 'burned-ct' | 'issue';

export interface BurnRow {
  meter_id: string;
  serial: string;
  /** The EMS site name — the same string the kibbutz card is named by, where they are linked. */
  site: string;
  meter_type: string;              // 'E360PP' | 'E360SP' | 'E360CT'
  address?: string | null;
  ct_ratio?: number | null;
  parent_serial?: string | null;
  solar_names?: string | null;
  status?: BurnStatus | string | null;
  burned_by?: string | null;
  burned_at?: string | null;
  generator_id?: string | null;
  note?: string | null;
}

export interface GeneratorRow { id: string; site: string; name: string; device_serial?: string | null }

export const isCT = (r: BurnRow): boolean => r?.meter_type === 'E360CT';

export function burnVisual(r: BurnRow): BurnVisual {
  if (r?.status === 'issue') return 'issue';
  if (r?.status === 'burned') return isCT(r) ? 'burned-ct' : 'burned';
  return 'pending';
}

export const BURN_VISUAL_LABEL: Record<BurnVisual, string> = {
  pending: '⬜ ממתין',
  burned: '✅ נצרב',
  'burned-ct': '🟣 נצרב',
  issue: '⚠ בעיה',
};

/** The status in words (עידן 22.9, I2): burned is 'נצרב'; burned with no generator yet says so. */
export function burnStateLabel(r: BurnRow): string {
  const v = burnVisual(r);
  if (v === 'pending' || v === 'issue') return BURN_VISUAL_LABEL[v];
  return r.generator_id ? '✅ נצרב' : '✅ נצרב · ממתין לשיבוץ גנרטור';
}

/**
 * The EMS fault task a reported problem opens (22.9, I3): the problem, the meter, its kind, its
 * address, its system and its generator — everything the office needs. Mirrors
 * `B.issueTask` in js/src/24-meter-burns.js.
 */
export function burnIssueTask(r: BurnRow, note: string, gen?: GeneratorRow | null): {
  kibbutz: string; title: string; description: string; type: string; priority: string;
} {
  const kind = burnKindLabel(r).replace(/^[^\s]+\s/, '');
  const lines = [note, 'מונה: ' + r.serial, 'סוג: ' + kind];
  if (r.address) lines.push('כתובת: ' + r.address);
  if (r.solar_names) lines.push('מערכת: ' + r.solar_names);
  if (gen?.name) lines.push('גנרטור: ' + gen.name + (gen.device_serial ? ' (' + gen.device_serial + ')' : ''));
  return {
    kibbutz: r.site, title: 'תקלה במונה ' + r.serial + (r.address ? ' · ' + r.address : ''),
    description: lines.join('\n'), type: 'fixing_fault', priority: 'high',
  };
}

/** The kind in words a technician uses (I4): PP = תלת-פאזי, CT = משנה זרם (with its ratio). */
export function burnKindLabel(r: BurnRow): string {
  if (isCT(r)) return '🔁 משנה זרם' + (r.ct_ratio && Number(r.ct_ratio) !== 1 ? ' ×' + Number(r.ct_ratio) : '');
  return String(r.meter_type || '') === 'E360SP' ? '⚡ חד-פאזי' : '⚡ תלת-פאזי';
}

/** Card names and EMS site names are the same string where they are linked; compare them
 *  trimmed so one stray space in the sheet does not hide a whole kibbutz's meters. */
export const sameSite = (a: string | null | undefined, b: string | null | undefined): boolean =>
  String(a ?? '').trim() === String(b ?? '').trim() && String(a ?? '').trim() !== '';

export interface BurnCounts { total: number; pending: number; burned: number; issue: number; ct: number; pp: number }

export function burnCounts(rows: BurnRow[] | null | undefined): BurnCounts {
  const c: BurnCounts = { total: 0, pending: 0, burned: 0, issue: 0, ct: 0, pp: 0 };
  for (const r of rows || []) {
    if (!r) continue;
    c.total++;
    if (r.status === 'burned') c.burned++;
    else if (r.status === 'issue') c.issue++;
    else c.pending++;
    if (isCT(r)) c.ct++; else c.pp++;
  }
  return c;
}

/** One kibbutz's meters, in the order the field wants them: not-done first, CT before PP
 *  (a CT needs the ratio checked), then by serial so the list never reshuffles under a tap. */
export function burnsForSite(rows: BurnRow[] | null | undefined, site: string): BurnRow[] {
  const ORDER: Record<string, number> = { pending: 0, issue: 1, burned: 2 };
  return (rows || [])
    .filter(r => r && sameSite(r.site, site))
    .slice()
    .sort((a, b) =>
      (ORDER[String(a.status || 'pending')] ?? 0) - (ORDER[String(b.status || 'pending')] ?? 0)
      || (isCT(a) ? 0 : 1) - (isCT(b) ? 0 : 1)
      || String(a.serial).localeCompare(String(b.serial)));
}

// ───────────────────────── the card chip ─────────────────────────

export interface BurnChip { remaining: number; total: number; text: string }

/**
 * `🔥 נותרו X/Y` for one kibbutz card — and **null the moment X is 0**, which is the whole
 * point: a temporary project must disappear from a card it is finished with instead of
 * leaving a stale "0/30" behind. Also null when the kibbutz has no meters at all, and null
 * when the project flag is off.
 */
export function burnChip(rows: BurnRow[] | null | undefined, site: string): BurnChip | null {
  if (!burnsProjectActive()) return null;
  const mine = (rows || []).filter(r => r && sameSite(r.site, site));
  if (!mine.length) return null;
  const c = burnCounts(mine);
  const remaining = c.pending + c.issue;     // a meter with a problem is still not burned
  if (remaining <= 0) return null;
  return { remaining, total: c.total, text: `🔥 נותרו ${remaining}/${c.total}` };
}

/**
 * How much of a kibbutz's ROUTINE OPEN WORK is צריבות (עידן 18.9 21:50: they count as open
 * work everywhere, not only in the field flow). Same number the chip shows; exported on its
 * own so the card's open-work count and Task 28's health signals can add it without
 * re-deriving the rule.
 */
export function burnOpenWork(rows: BurnRow[] | null | undefined, site: string): number {
  return burnChip(rows, site)?.remaining ?? 0;
}

// ───────────────────────── the progress strip ─────────────────────────

export interface SiteProgress { site: string; total: number; done: number; remaining: number; pct: number }
export interface BurnProgress {
  total: number; done: number; remaining: number; pct: number;
  /** How many kibbutzim still have something open — the "ב-M קיבוצים" half of the strip. */
  sitesLeft: number;
  /** Per kibbutz, most-remaining first then alphabetical (he) — the work pushes itself forward. */
  sites: SiteProgress[];
}

export function burnProgress(rows: BurnRow[] | null | undefined): BurnProgress {
  const by = new Map<string, SiteProgress>();
  for (const r of rows || []) {
    if (!r || !String(r.site || '').trim()) continue;
    const site = String(r.site).trim();
    const p = by.get(site) || { site, total: 0, done: 0, remaining: 0, pct: 0 };
    p.total++;
    if (r.status === 'burned') p.done++; else p.remaining++;
    by.set(site, p);
  }
  const sites = [...by.values()].map(p => ({ ...p, pct: p.total ? Math.round((100 * p.done) / p.total) : 0 }))
    .sort((a, b) => b.remaining - a.remaining || a.site.localeCompare(b.site, 'he'));
  const total = sites.reduce((n, p) => n + p.total, 0);
  const done = sites.reduce((n, p) => n + p.done, 0);
  return {
    total, done, remaining: total - done,
    pct: total ? Math.round((100 * done) / total) : 0,
    sitesLeft: sites.filter(p => p.remaining > 0).length,
    sites,
  };
}

/** The kibbutz names the strip filters the cards down to when it is tapped. */
export const burnSitesWithPending = (rows: BurnRow[] | null | undefined): string[] =>
  burnProgress(rows).sites.filter(p => p.remaining > 0).map(p => p.site);

/**
 * The strip's one line. The field team is told what is LEFT (that is their day); everyone
 * else is told how far the project has got (עידן's 21:50 ruling — on עמיחי's סקירה it is a
 * progress summary, not a to-do list). Empty string at zero remaining, which is the hide signal.
 */
export function burnStripText(p: BurnProgress, role: 'field' | 'other'): string {
  if (!p.total || p.remaining <= 0) return '';
  if (role === 'field') {
    return `🔥 צריבות · נותרו ${p.remaining} ב-${p.sitesLeft} ${p.sitesLeft === 1 ? 'קיבוץ' : 'קיבוצים'}`;
  }
  return `🔥 צריבות · בוצעו ${p.done} מתוך ${p.total} · ${p.pct}%`;
}

export interface BurnProjectLine { title: 'פרויקט צריבות מונים'; progress: string; link: 'לפירוט' }

/** The home strip (round 5 K1): one row, one tap to the burns page. No per-role variant, no filter. */
export function burnProjectLine(p: BurnProgress): BurnProjectLine | null {
  if (!p.total) return null;
  return { title: 'פרויקט צריבות מונים', progress: `בוצעו ${p.done} מתוך ${p.total}`, link: 'לפירוט' };
}

// ───────────────────────── the briefing rows ─────────────────────────

/** Mirrors `LeaveItem` in lib/field.ts, plus the meter the row writes back to. */
export interface BurnLeaveItem {
  id: string;
  text: string;
  sub: string;
  kind: 'burn';
  meterId: string;
}

/**
 * The pending meters of one kibbutz as "לפני שיוצאים" rows (plan point 2). Ticking one is
 * NOT a checkbox — it marks the meter ✅ נצרב — so only meters that are still open are
 * offered; an already-burned one has nothing left to tick.
 */
export function burnLeaveItems(rows: BurnRow[] | null | undefined, site: string): BurnLeaveItem[] {
  if (!burnsProjectActive()) return [];
  return burnsForSite(rows, site)
    .filter(r => r.status !== 'burned')
    .map(r => ({
      id: 'burn:' + r.meter_id,
      text: `לצרוב מונה ${r.serial}` + (r.address ? ` · ${r.address}` : ''),
      sub: burnKindLabel(r) + (r.status === 'issue' ? ' · ⚠ ' + (r.note || 'בעיה מדווחת') : ' · צריבה'),
      kind: 'burn' as const,
      meterId: r.meter_id,
    }));
}

// ───────────────────────── the writes ─────────────────────────

export interface BurnPatch {
  status?: BurnStatus;
  burned_by?: string | null;
  burned_at?: string | null;
  note?: string | null;
  generator_id?: string | null;
  updated_at: string;
}

export const burnedPatch = (user: string, now: string): BurnPatch =>
  ({ status: 'burned', burned_by: user, burned_at: now, updated_at: now });
export const unburnedPatch = (now: string): BurnPatch =>
  ({ status: 'pending', burned_by: null, burned_at: null, updated_at: now });
export const issuePatch = (note: string, now: string): BurnPatch =>
  ({ status: 'issue', note, updated_at: now });
export const clearIssuePatch = (now: string): BurnPatch =>
  ({ status: 'pending', note: null, updated_at: now });
export const generatorPatch = (generatorId: string | null, now: string): BurnPatch =>
  ({ generator_id: generatorId || null, updated_at: now });

/** The generators of ONE kibbutz — assignment never crosses a site (spec §6א). */
export const generatorsForSite = (gens: GeneratorRow[] | null | undefined, site: string): GeneratorRow[] =>
  (gens || []).filter(g => g && sameSite(g.site, site)).slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));

/** The ⚠️ lines a row earns: an EMS data problem the field has to fix before burning. */
export function burnWarnings(r: BurnRow): string[] {
  const w: string[] = [];
  if (!r?.parent_serial) w.push('⚠️ אין מונה אב');
  if (isCT(r) && (!r.ct_ratio || Number(r.ct_ratio) === 1)) w.push('🔴 יחס CT חסר ב-EMS');
  return w;
}

// ───────────────────────── the full table (G-L1: ported from 24-meter-burns.js) ─────────────────────────
//
// The table page's own filter / sort / group / xlsx rules, line-for-line translated from the
// legacy PURE block (24-meter-burns.js:15-155) so `burnsParity.test.ts` can pin them against the
// unchanged legacy file before it is deleted (G-U4).

export interface BurnFilter { site?: string; status?: 'all' | 'pending' | 'burned' | 'issue'; kind?: 'all' | 'CT' | 'PP'; q?: string }
export interface BurnSiteGroup { site: string; rows: BurnRow[]; total: number; pending: number; burned: number; issue: number; ct: number; pp: number }
export interface XlsxColumn { header: string; type: 's' | 'd'; width: number }
export interface XlsxSheet { sheet: string; columns: XlsxColumn[]; rows: unknown[][]; groupKeys: string[] }
export interface XlsxSpec { sheet: string; sheets: XlsxSheet[]; columns: XlsxColumn[]; rows: unknown[][]; groupKeys: number[] }

/** The legacy `B.xs`: strip bidi marks, collapse newlines, trim. */
export function burnStripMarks(v: unknown): string {
  return String(v == null ? '' : v).replace(/[‎‏‪-‮]/g, '').replace(/\r?\n/g, ' ').trim();
}

const norm = (s: unknown) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
const STATE_ORDER: Record<string, number> = { pending: 0, issue: 1, burned: 2 };

export function burnMatches(r: BurnRow, q: string, gens: GeneratorRow[] = []): boolean {
  const nq = norm(q); if (!nq) return true;
  const gen = gens.find(g => g.id === r.generator_id);
  return norm([r.site, r.serial, r.address, r.solar_names, gen && gen.name].join(' ')).includes(nq);
}

export function filterBurnRows(rows: BurnRow[], f: BurnFilter = {}, gens: GeneratorRow[] = []): BurnRow[] {
  return rows.filter(r => {
    if (f.site && r.site !== f.site) return false;
    if (f.status && f.status !== 'all' && r.status !== f.status) return false;
    if (f.kind === 'CT' && !isCT(r)) return false;
    if (f.kind === 'PP' && isCT(r)) return false;
    return burnMatches(r, f.q || '', gens);
  });
}

export function sortBurnRows(rows: BurnRow[]): BurnRow[] {
  return rows.slice().sort((a, b) =>
    ((STATE_ORDER[String(a.status || 'pending')] || 0) - (STATE_ORDER[String(b.status || 'pending')] || 0))
    || ((isCT(a) ? 0 : 1) - (isCT(b) ? 0 : 1))
    || String(a.serial).localeCompare(String(b.serial)));
}

export function groupBurnsBySite(rows: BurnRow[]): BurnSiteGroup[] {
  const by: Record<string, BurnSiteGroup> = {};
  for (const r of rows) {
    const k = r.site ?? '';
    const g = by[k] ??= { site: k, rows: [], total: 0, pending: 0, burned: 0, issue: 0, ct: 0, pp: 0 };
    g.rows.push(r); g.total++;
    if (r.status === 'pending' || r.status === 'burned' || r.status === 'issue') (g as any)[r.status]++;
    if (isCT(r)) g.ct++; else g.pp++;
  }
  return Object.values(by).map(g => ({ ...g, rows: sortBurnRows(g.rows) }))
    .sort((a, b) => (b.pending - a.pending) || a.site.localeCompare(b.site, 'he'));
}

/** Rows of ONE site, grouped by generator (unassigned last), each group's rows already sorted. */
export function groupBurnsByGenerator(rows: BurnRow[], gens: GeneratorRow[]): Array<{ gen: GeneratorRow | null; rows: BurnRow[] }> {
  const byId: Record<string, GeneratorRow> = {};
  for (const g of gens || []) byId[g.id] = g;
  const groups: Record<string, { gen: GeneratorRow | null; rows: BurnRow[] }> = {};
  const order: string[] = [];
  for (const r of sortBurnRows(rows)) {
    const key = r.generator_id && byId[r.generator_id] ? r.generator_id : '';
    if (!groups[key]) { groups[key] = { gen: key ? byId[key] : null, rows: [] }; order.push(key); }
    groups[key].rows.push(r);
  }
  return order
    .sort((a, b) => ((a === '' ? 1 : 0) - (b === '' ? 1 : 0)) || byId[a].name.localeCompare(byId[b].name, 'he'))
    .map(k => groups[k]);
}

const xlsxColumns: XlsxColumn[] = [
  { header: "מס' מונה", type: 's', width: 12 }, { header: 'סוג מונה', type: 's', width: 14 },
  { header: 'כתובת', type: 's', width: 26 }, { header: 'שם המערכת', type: 's', width: 26 },
  { header: 'גנרטור', type: 's', width: 14 }, { header: 'סטטוס', type: 's', width: 24 },
  { header: 'נצרב ע"י', type: 's', width: 10 }, { header: 'תאריך צריבה', type: 'd', width: 12 }, { header: 'הערה', type: 's', width: 24 },
];

function xlsxRow(r: BurnRow, byId: Record<string, GeneratorRow>): unknown[] {
  const gen = r.generator_id ? byId[r.generator_id] : undefined;
  return [
    burnStripMarks(r.serial), burnKindLabel(r).replace(/^[^\s]+\s/, ''), burnStripMarks(r.address), burnStripMarks(r.solar_names),
    burnStripMarks(gen ? gen.name : ''), burnStateLabel(r).replace(/^[^\s]+\s/, ''), burnStripMarks(r.burned_by),
    r.burned_at ? (d => new Date(d.getFullYear(), d.getMonth(), d.getDate()))(new Date(r.burned_at)) : null,
    burnStripMarks(r.note),
  ];
}

/** One sheet per kibbutz, every meter of it — the shape `xlDownload` expects (`lib/hours.ts:134`). */
export function burnXlsxSpec(rows: BurnRow[], gens: GeneratorRow[]): XlsxSpec {
  const byId: Record<string, GeneratorRow> = {};
  for (const g of gens || []) byId[g.id] = g;
  const sheets: XlsxSheet[] = [];
  const all: unknown[][] = [];
  const keys: number[] = [];
  groupBurnsBySite(rows).forEach((g, gi) => {
    const sorted = sortBurnRows(g.rows);
    sheets.push({ sheet: g.site || 'ללא קיבוץ', columns: xlsxColumns, rows: sorted.map(r => xlsxRow(r, byId)), groupKeys: sorted.map(burnVisual) });
    for (const r of sorted) { all.push(xlsxRow(r, byId)); keys.push(gi); }
  });
  return { sheet: 'צריבות', sheets, columns: xlsxColumns, rows: all, groupKeys: keys };
}

/** One row per generator — kibbutz, name, its serial, how many meters point at it. */
export function burnGenSummary(gens: GeneratorRow[], rows: BurnRow[]): Array<{ id: string; site: string; name: string; device_serial: string; count: number }> {
  const cnt: Record<string, number> = {};
  for (const r of rows || []) if (r.generator_id) cnt[r.generator_id] = (cnt[r.generator_id] || 0) + 1;
  return (gens || []).map(g => ({ id: g.id, site: g.site, name: g.name, device_serial: g.device_serial || '', count: cnt[g.id] || 0 }))
    .sort((a, b) => a.site.localeCompare(b.site, 'he') || a.name.localeCompare(b.name, 'he'));
}

// ── EMS live refresh (spec §7): raw EMS /meters + /solars payloads → the EMS-owned columns ──

/** `meter_types.key` looks like 'landis_e360pp' (or name 'Landis E360PP') → 'E360PP' | null. */
export function emsMeterType(m: any): 'E360PP' | 'E360SP' | 'E360CT' | null {
  const k = String((m && m.type && (m.type.key || m.type.name)) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const x = /E360(PP|SP|CT)/.exec(k);
  return x ? ('E360' + x[1]) as 'E360PP' | 'E360SP' | 'E360CT' : null;
}

/** Meter id → 'שם · שם' (deduped, he-sorted), from `solar.solarMeters[].meter.id`. */
export function emsSolarNames(solars: any[]): Record<string, string> {
  const by: Record<string, string[]> = {};
  for (const s of solars || []) {
    for (const sm of (s && s.solarMeters) || []) {
      const id = sm && sm.meter && sm.meter.id;
      if (!id || !s.name) continue;
      (by[id] = by[id] || []).push(String(s.name).trim());
    }
  }
  const out: Record<string, string> = {};
  for (const k of Object.keys(by)) {
    out[k] = by[k].filter((v, i, a) => v && a.indexOf(v) === i).sort((a, b) => a.localeCompare(b, 'he')).join(' · ');
  }
  return out;
}

export function emsToBurnRows(meters: any[], solars: any[]): { rows: Array<Partial<BurnRow> & { site_id?: string | null; role_code?: number | null }>; skipped: number } {
  const names = emsSolarNames(solars);
  const rows: Array<Partial<BurnRow> & { site_id?: string | null; role_code?: number | null }> = [];
  let skipped = 0;
  for (const m of meters || []) {
    const t = emsMeterType(m);
    if (!t || !m.id || !m.serialNumber || !(m.site && m.site.name)) { skipped++; continue; }
    rows.push({
      meter_id: m.id, serial: String(m.serialNumber), site: String(m.site.name).trim(), site_id: m.site.id || null, meter_type: t,
      address: m.address || null, role_code: m.role && m.role.code != null ? Number(m.role.code) : null,
      ct_ratio: m.currentMultiplier != null ? Number(m.currentMultiplier) : null,
      parent_serial: m.parent && m.parent.serialNumber ? String(m.parent.serialNumber) : null,
      solar_names: names[m.id] || null,
    });
  }
  return { rows, skipped };
}

/** EMS `/meters?search=` hits → `[{serial, label}]` for the generator picker. */
export function emsHitLines(items: any[]): Array<{ serial: string; label: string }> {
  return (Array.isArray(items) ? items : []).filter(m => m && m.serialNumber).map(m => ({
    serial: String(m.serialNumber),
    label: String(m.serialNumber) + ' · ' + (m.address || '—') + (m.site && m.site.name ? ' · ' + m.site.name : '') + (m.type && m.type.name ? ' · ' + m.type.name : ''),
  }));
}
