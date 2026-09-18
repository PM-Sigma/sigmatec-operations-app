// Meeting-summary parser + note grouping (spec §3 Part B). PURE — no DOM, no network, no
// React — so the whole surface is covered by vitest goldens against the three REAL company
// summaries (`__fixtures__/summary_*.md`). The island (components/home/MeetingNotes.tsx,
// islands/ImportNotes.tsx) is a thin rendering shell over these functions.
//
// The input is the markdown עידן pastes from `Sigmatec Management/Company Meeting/<date>/`:
//   **סיכום ישיבת חברה — 17.9.26**            ← date + kind
//   …preamble (הנחיות רוחביות, הכרעות table)…  ← NOT parsed: it is not per-kibbutz
//   **6. גבים**                                ← a section = one kibbutz (or several, ` · `-joined)
//   <paragraph>. <paragraph>. **אחריות אביאם (מאזן), עידן (כופלים).**
// One bullet per SENTENCE (spec D4); the trailing אחריות clause is removed from the text and
// becomes `owners[]` on every bullet of that paragraph.

export type MeetingKind = 'company' | 'dev' | 'client';

export interface MeetingBullet {
  /** 1-based, per kibbutz section (the table's unique key together with date+kind+kibbutz). */
  seq: number;
  text: string;
  owners: string[];
  /** "ללא פערים" / "אין חדש" — kept so the timeline shows the kibbutz WAS reviewed, but muted. */
  quiet: boolean;
}

export interface MeetingSection {
  /** The raw name part of the section line, suffix included: `דפנה — ✅ 5 משימות`. */
  heading: string;
  /** Resolved card names (`kibbutzim.name`). Empty when nothing matched. */
  kibbutzim: string[];
  /** Names from the heading that have no card — the import preview flags these in red. */
  unmatched: string[];
  bullets: MeetingBullet[];
}

export interface ParsedMeeting {
  meeting_date: string;      // YYYY-MM-DD
  meeting_kind: MeetingKind;
  sections: MeetingSection[];
}

/** A row of `kibbutz_meeting_notes`. */
export interface NoteRow {
  id?: string;
  kibbutz: string;
  meeting_date: string;
  meeting_kind: MeetingKind | string;
  seq: number;
  text: string;
  owners?: string[] | null;
  ems_task_id?: string | null;
  done_at?: string | null;
  created_by?: string | null;
}

export interface MeetingGroup {
  meeting_date: string;
  meeting_kind: string;
  bullets: NoteRow[];
}

/** The staff whose names may appear in an "אחריות …" clause (js/src/02-init-attendance.js ATT_PEOPLE). */
export const MEETING_PEOPLE = ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'מתניה', 'אבצן', 'אליה'] as const;

/**
 * Summary name → card name(s). The summaries are written by hand, the cards come from the
 * `kibbutzim` table, and the two drifted: `דגניה א` is the card `דגניה`'s display_name,
 * `אור הנר` is TWO cards (חשמל + גז), and `גת`/`ניצנים` are filed as `קיבוץ …`.
 * `גשר השלום` is deliberately absent — it has no card, and the import preview must say so.
 */
export const KIBBUTZ_ALIASES: Record<string, string | string[]> = {
  'דגניה א': 'דגניה',
  "דגניה א'": 'דגניה',
  'דגניה א׳': 'דגניה',
  "דגניה ב'": 'דגניה ב',
  'דגניה ב׳': 'דגניה ב',
  'אור הנר': ['אור הנר חשמל', 'אור הנר גז'],
  'אור הנר — חשמל': 'אור הנר חשמל',
  'אור הנר — גז': 'אור הנר גז',
  'אור הנר חשמל': 'אור הנר חשמל',
  'אור הנר גז': 'אור הנר גז',
  'גת': 'קיבוץ גת',
  'ניצנים': 'קיבוץ ניצנים',
  'שער הנגב': 'מתחם חינוך שער הנגב',
  'מתחם חינוך': 'מתחם חינוך שער הנגב',
};

export type KnownKibbutz = string | { name: string; display_name?: string | null };

export interface ParseOptions {
  /** Card catalog — `kibbutzim` rows (or plain names). Omitted ⇒ nothing resolves. */
  known?: KnownKibbutz[];
  /** Overrides / extends KIBBUTZ_ALIASES. */
  aliases?: Record<string, string | string[]>;
  /** Fallback when the first line carries no date (the import sheet's date picker). */
  date?: string;
  kind?: MeetingKind;
}

// ───────────────────────────── small helpers ─────────────────────────────

/** Collapse whitespace + drop bidi/zero-width marks, so hand-typed names compare equal. */
export function normalizeName(s: string): string {
  return String(s ?? '')
    .replace(/[‎‏‪-‮​-‍﻿]/g, '')
    .replace(/["'`׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripEmphasis = (s: string): string => s.replace(/\*\*/g, '').replace(/(^|\s)\*(?=\S)/g, '$1');

const SECTION_RE = /^\*\*(\d+)\.\s+(.+?)\*\*\s*$/;
/** A `**…**`-only line that is NOT a section and NOT an owner clause ⇒ end of the sections' body. */
const HEADING_RE = /^\*\*(?!\d+\.)(?!אחריות)[^*]+\*\*\s*$/;
const OWNERS_BOLD_RE = /\*\*אחריות\s+([^*]+?)\.?\*\*\s*$/;
/** 6.9 has unbolded owner clauses ("אחריות עמיחי ומתניה") — same meaning, so same treatment. */
const OWNERS_PLAIN_RE = /(?:^|[.\s])אחריות\s+([^.]+?)\.?\s*$/;

// ───────────────────────────── date + kind ─────────────────────────────

/**
 * `**סיכום ישיבת חברה — 17.9.26**` → `2026-09-17`. Two-digit years are 20xx (the app was
 * written in 2026 and the summaries only ever go forward).
 */
export function parseMeetingDate(md: string): string | null {
  const head = String(md ?? '').split(/\r?\n/).slice(0, 6).join('\n');
  const m = head.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 4 ? Number(y) : 2000 + Number(y);
  const pad = (n: string) => String(Number(n)).padStart(2, '0');
  return `${year}-${pad(mo)}-${pad(d)}`;
}

/** `ישיבת חברה` → company · `ישיבת פיתוח` → dev · `פגישה … קיבוץ X` → client. */
export function parseMeetingKind(md: string): MeetingKind {
  const head = String(md ?? '').split(/\r?\n/).slice(0, 6).join('\n');
  if (/ישיבת\s+פיתוח|סיכום\s+פיתוח/.test(head)) return 'dev';
  if (/ישיבת\s+חברה/.test(head)) return 'company';
  if (/פגישה/.test(head)) return 'client';
  return 'company';
}

/** `2026-09-17` → `17.9.26` — the form עידן writes, used in the task description's מקור line. */
export function dmy(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso ?? '');
  return `${Number(m[3])}.${Number(m[2])}.${String(Number(m[1]) % 100).padStart(2, '0')}`;
}

/** Who may import a summary (spec §3.2: "Admin-only (עידן, עמיחי)"). A viewer never can. */
export const canImportNotes = (isAdmin: boolean, isViewer: boolean): boolean => isAdmin && !isViewer;

export const KIND_LABEL: Record<MeetingKind, string> = {
  company: 'ישיבת חברה',
  dev: 'ישיבת פיתוח',
  client: 'פגישה',
};

// ───────────────────────────── name resolution ─────────────────────────────

interface Catalog { byName: Map<string, string>; }

function buildCatalog(known: KnownKibbutz[] | undefined): Catalog {
  const byName = new Map<string, string>();
  (known || []).forEach(k => {
    const name = typeof k === 'string' ? k : k?.name;
    if (!name) return;
    byName.set(normalizeName(name), name);
    const disp = typeof k === 'string' ? null : k?.display_name;
    // A card's display_name is a legitimate way to write it in a summary (`דגניה א` → `דגניה`),
    // but it must never overwrite a real card name (`דגניה ב`'s display is `דגניה ב'`).
    if (disp) { const key = normalizeName(disp); if (!byName.has(key)) byName.set(key, name); }
  });
  return { byName };
}

/**
 * One heading name → the card name(s) it means. `[]` = no card (the preview flags it).
 * Alias table first (it is the curated answer), then the catalog by name / display_name.
 */
export function resolveKibbutzName(
  raw: string,
  known?: KnownKibbutz[],
  aliases: Record<string, string | string[]> = KIBBUTZ_ALIASES,
): string[] {
  const cat = buildCatalog(known);
  return resolveWith(raw, cat, aliases);
}

function resolveWith(raw: string, cat: Catalog, aliases: Record<string, string | string[]>): string[] {
  const key = normalizeName(raw);
  if (!key) return [];
  const alias = aliases[key] ?? aliases[raw];
  if (alias) {
    const list = Array.isArray(alias) ? alias : [alias];
    // An alias only counts when the card it points at EXISTS: a stale alias must never
    // invent a kibbutz that was archived (and with no catalog at all, nothing resolves).
    const hits = list.map(n => cat.byName.get(normalizeName(n)) || '').filter(Boolean);
    if (hits.length) return hits;
  }
  const hit = cat.byName.get(key);
  return hit ? [hit] : [];
}

/** Heading `כפר עזה · יסעור` → names. The ` — …` status suffix is dropped (em/en dash only:
 *  `שדה אליהו - חקלאות` is a NAME, not a suffix). */
export function headingNames(heading: string): string[] {
  const base = String(heading ?? '').replace(/\s+[—–]\s*.*$/, '').trim();
  return base.split(/\s*[·•]\s*/).map(s => normalizeName(s)).filter(Boolean);
}

// ───────────────────────────── owners ─────────────────────────────

/**
 * `אביאם (מאזן), עידן (כופלים)` → `['אביאם','עידן']` · `ניתאי ואביאם` → `['ניתאי','אביאם']` ·
 * `עידן עמיחי ומתניה` → three (6.9 writes some clauses with no comma at all) ·
 * `אביאם בשטח` → `['אביאם']`. A token with no known name at all is kept verbatim, so an
 * external owner ("ויקטוריה") is never silently dropped.
 */
export function parseOwners(clause: string): string[] {
  const people = new Set<string>(MEETING_PEOPLE as readonly string[]);
  const out: string[] = [];
  // ` ו` is a conjunction only when a KNOWN name follows it: splitting on it blindly turns
  // `עידן, ויקטוריה` into `עידן` + `יקטוריה` (the ו of a name is not a conjunction).
  const vav = (part: string): string[] =>
    part.split(/(?<=\S)\s+ו(?=[א-ת])/).reduce<string[]>((acc, piece, i) => {
      if (i === 0) return [piece];
      const head = piece.replace(/\s*\([^)]*\)/g, '').trim().split(/\s+/)[0];
      if (people.has(head)) acc.push(piece); else acc[acc.length - 1] += ' ו' + piece;
      return acc;
    }, []);

  String(clause ?? '')
    .split(/[,،]/)
    .flatMap(vav)
    .forEach(part => {
      const t = part.replace(/\s*\([^)]*\)/g, '').replace(/[.\s]+$/, '').trim();
      if (!t) return;
      const words = t.split(/\s+/);
      const knownWords = words.filter(w => people.has(w));
      // "אביאם בשטח" / "עידן עמיחי ומתניה" — take the names, drop the prose around them.
      (knownWords.length ? knownWords : [t]).forEach(n => { if (!out.includes(n)) out.push(n); });
    });
  return out;
}

// ───────────────────────────── sentences ─────────────────────────────

const PROTECT = '';

/**
 * One bullet per sentence. `2.9` / `11.06` must not split (a decimal point is not a full
 * stop) and neither must `in_progress`, so both are masked before the split and restored
 * after. Fragments of ≤ 3 chars are noise, not sentences.
 */
export function splitSentences(text: string): string[] {
  const masks: string[] = [];
  const mask = (s: string) => { masks.push(s); return PROTECT + (masks.length - 1) + PROTECT; };
  const masked = String(text ?? '')
    .replace(/\d+\.\d+/g, m => mask(m))
    .replace(/\bin_progress\b/g, m => mask(m));
  return masked
    .split(/(?<=[.!?])\s+(?=[^\s])/)
    .map(s => s.replace(new RegExp(PROTECT + '(\\d+)' + PROTECT, 'g'), (_, i) => masks[Number(i)]).trim())
    .filter(s => s.length > 3);
}

const QUIET_RE = /^(ללא פערים|אין חדש|עדיין לא|ללא משימות)/;

export const isQuiet = (text: string): boolean => QUIET_RE.test(String(text ?? '').trim());

// ───────────────────────────── the parser ─────────────────────────────

/** A section's raw body lines → paragraphs (blank line separated; a table/list line is skipped). */
function paragraphsOf(lines: string[]): string[] {
  const paras: string[] = [];
  let buf: string[] = [];
  const flush = () => { if (buf.length) { paras.push(buf.join(' ').trim()); buf = []; } };
  lines.forEach(line => {
    const t = line.trim();
    if (!t) { flush(); return; }
    if (t.startsWith('|')) { flush(); return; }          // הכרעות table — not per-kibbutz prose
    buf.push(t.replace(/^[*\-•]\s+/, ''));
  });
  flush();
  return paras.filter(Boolean);
}

function bulletsOf(paras: string[], startSeq: number): { bullets: MeetingBullet[]; next: number } {
  const bullets: MeetingBullet[] = [];
  let seq = startSeq;
  paras.forEach(para => {
    let body = para;
    let owners: string[] = [];
    const bold = body.match(OWNERS_BOLD_RE);
    if (bold) {
      owners = parseOwners(bold[1]);
      body = body.slice(0, bold.index).trim();
    } else {
      const plain = stripEmphasis(body).match(OWNERS_PLAIN_RE);
      if (plain) { owners = parseOwners(plain[1]); body = stripEmphasis(body).slice(0, plain.index).trim(); }
    }
    splitSentences(stripEmphasis(body)).forEach(text => {
      bullets.push({ seq: seq++, text, owners: owners.slice(), quiet: isQuiet(text) });
    });
  });
  return { bullets, next: seq };
}

/**
 * The whole summary → `{meeting_date, meeting_kind, sections}`. Pure and idempotent; the
 * import sheet renders exactly what comes back and writes exactly those rows.
 */
export function parseMeetingSummary(md: string, opts: ParseOptions = {}): ParsedMeeting {
  const aliases = { ...KIBBUTZ_ALIASES, ...(opts.aliases || {}) };
  const cat = buildCatalog(opts.known);
  const lines = String(md ?? '').split(/\r?\n/);

  const sections: MeetingSection[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  const close = () => {
    if (!current) return;
    const names = headingNames(current.heading);
    const kibbutzim: string[] = [];
    const unmatched: string[] = [];
    names.forEach(n => {
      const hits = resolveWith(n, cat, aliases);
      if (hits.length) hits.forEach(h => { if (!kibbutzim.includes(h)) kibbutzim.push(h); });
      else if (!unmatched.includes(n)) unmatched.push(n);
    });
    // seq restarts at 1 per SECTION: a section's rows are copied to every kibbutz it names,
    // and (kibbutz, date, kind, seq) is the table's unique key.
    const { bullets } = bulletsOf(paragraphsOf(current.lines), 1);
    sections.push({ heading: current.heading.trim(), kibbutzim, unmatched, bullets });
    current = null;
  };

  lines.forEach(line => {
    const sec = line.match(SECTION_RE);
    if (sec) { close(); current = { heading: sec[2], lines: [] }; return; }
    if (!current) return;                                  // preamble — not per-kibbutz
    if (HEADING_RE.test(line.trim())) { close(); return; }  // "**קיבוצים שלא נתפסו כלל**" → done
    current.lines.push(line);
  });
  close();

  return {
    meeting_date: parseMeetingDate(md) || opts.date || '',
    meeting_kind: opts.kind || parseMeetingKind(md),
    sections,
  };
}

/** Parsed sections → the exact rows to insert. One row per (kibbutz × bullet). */
export function rowsFromParsed(parsed: ParsedMeeting, createdBy?: string): NoteRow[] {
  const rows: NoteRow[] = [];
  parsed.sections.forEach(sec => {
    sec.kibbutzim.forEach(kibbutz => {
      sec.bullets.forEach(b => {
        rows.push({
          kibbutz,
          meeting_date: parsed.meeting_date,
          meeting_kind: parsed.meeting_kind,
          seq: b.seq,
          text: b.text,
          owners: b.owners,
          ...(createdBy ? { created_by: createdBy } : {}),
        });
      });
    });
  });
  return rows;
}

export const countRowsToSave = (parsed: ParsedMeeting): number =>
  parsed.sections.reduce((n, s) => n + s.kibbutzim.length * s.bullets.length, 0);

// ───────────────────────────── display + EMS ─────────────────────────────

/**
 * rows → newest-first meetings for ONE kibbutz. The card shows `[0]` in full and the rest
 * under "היסטוריה"; bullets keep their `seq` order inside a meeting.
 */
export function notesForKibbutz(rows: NoteRow[] | null | undefined, name: string): MeetingGroup[] {
  const key = normalizeName(name);
  const mine = (rows || []).filter(r => r && normalizeName(r.kibbutz) === key);
  const groups = new Map<string, MeetingGroup>();
  mine.forEach(r => {
    const k = r.meeting_date + '|' + r.meeting_kind;
    if (!groups.has(k)) groups.set(k, { meeting_date: r.meeting_date, meeting_kind: String(r.meeting_kind), bullets: [] });
    groups.get(k)!.bullets.push(r);
  });
  const out = Array.from(groups.values());
  out.forEach(g => g.bullets.sort((a, b) => (a.seq || 0) - (b.seq || 0)));
  out.sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : a.meeting_date > b.meeting_date ? -1 : 0));
  return out;
}

/** `17.9` — the date chip on the card (short, no year: the year is obvious in context). */
export function chipDate(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])}.${Number(m[2])}` : String(iso ?? '');
}

const TITLE_MAX = 70;

/**
 * Bullet → EMS task title: the first clause, cut at ` — ` / `:` / `;`, hard-cut to
 * 69 chars + `…` when there is no delimiter to cut at.
 */
export function titleFromBullet(text: string): string {
  const clean = stripEmphasis(String(text ?? '')).trim();
  const m = clean.match(/\s+[—–]\s+|[:;]/);
  let title = m && m.index != null ? clean.slice(0, m.index) : clean;
  title = title.replace(/[\s.,،]+$/, '').trim();
  if (title.length > TITLE_MAX) title = title.slice(0, TITLE_MAX - 1).trim() + '…';
  return title;
}

/** Bullet → EMS task description, with the provenance line spec §3.3 asks for. */
export function descriptionFromBullet(text: string, meetingDate: string, kind: MeetingKind = 'company'): string {
  return `${String(text ?? '').trim()}\n\nמקור: ${KIND_LABEL[kind] || KIND_LABEL.company} ${dmy(meetingDate)}`;
}

/** The whole ➕ prefill for `sigma.createTask` — one place, so the island stays declarative. */
export function taskFromBullet(
  row: Pick<NoteRow, 'text' | 'owners' | 'meeting_date' | 'meeting_kind' | 'kibbutz'>,
): { kibbutz: string; title: string; description: string; assigneeName?: string; priority: string } {
  const kind = (row.meeting_kind as MeetingKind) || 'company';
  const owner = (row.owners || [])[0];
  return {
    kibbutz: row.kibbutz,
    title: titleFromBullet(row.text),
    description: descriptionFromBullet(row.text, row.meeting_date, kind),
    ...(owner ? { assigneeName: owner } : {}),
    priority: 'medium',
  };
}
