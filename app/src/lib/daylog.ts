// 📝 יומן היום — the pure half of Part L (spec §7i).
//
// The AI writes a day into rough JSON; NOTHING here trusts it. Every kibbutz name and every
// product name is resolved against the catalog the app already has, so a hallucinated name
// can never reach a visit record — it lands as "לא זוהה" and the person picks from a list.
//
// Three exports carry the feature, and all three are decidable without a browser:
//   normalizeDayLog(json, catalog)  raw model output → the cards the island renders
//   matchEmsTask(sentence, tasks)   one sentence → the open EMS task it is about, or null
//   emsCommentText(person, text)    עידן's exact wording for a task comment
//
// The matcher is deliberately conservative: below the threshold we return nothing rather than
// a guess, because a wrong task gets a comment posted on somebody else's work.

// ───────────────────────────── types ─────────────────────────────

export interface DayLogItem {
  /** The catalog string when we resolved it, otherwise whatever the model said. */
  product: string;
  qty: number;
  /** false → the name is not in the catalog; the card shows a picker instead of a checkbox. */
  resolved: boolean;
}

export interface DayLogTaskMatch {
  task_id: string;
  /** The sentence from the day log that this task is about — the body of the comment. */
  text: string;
  title?: string;
  score?: number;
}

export interface DayLogVisit {
  kibbutz: string;
  /** false → the name did not resolve confidently; the card opens with the picker. */
  kibbutzConfident: boolean;
  /** yyyy-mm-dd. Absent in the model output → the island fills today's date. */
  date?: string;
  workday?: boolean;
  duration_hours?: number;
  summary: string;
  open_items: string;
  items: DayLogItem[];
  task_matches: DayLogTaskMatch[];
}

export interface DayLogResult {
  visits: DayLogVisit[];
  /** Sentences the model could not place at any kibbutz. Shown, never saved silently. */
  unmatched: string[];
}

export interface GroundingTask {
  id: string;
  title: string;
  kibbutz?: string;
}

export interface DayLogCatalog {
  kibbutzim: string[];
  products: string[];
  tasks?: GroundingTask[];
}

// ───────────────────────────── Hebrew normalisation ─────────────────────────────

/**
 * Fold a Hebrew name to something comparable: no niqqud, no geresh/gershayim variants, one
 * kind of space, no punctuation. `משנ"ז` and `משנז` and `משנ׳׳ז` all land on the same string,
 * which is what makes the product matcher survive how people actually type.
 */
export function normHe(s: unknown): string {
  return String(s ?? '')
    .replace(/[֑-ׇ]/g, '')            // niqqud + cantillation
    .replace(/[׳״'"`׳״]/g, '')        // geresh / gershayim, straight and Hebrew
    .replace(/[־–—\-_.,;:!?()[\]{}/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Hebrew glues its one-letter prepositions on: "בדפנה" is "דפנה". Only for whole tokens. */
function stripPrefix(tok: string): string {
  return tok.length > 2 && /^[בלמהוכש]/.test(tok) ? tok.slice(1) : tok;
}

function tokens(s: string): string[] {
  return normHe(s).split(' ').filter(Boolean);
}

/** Sørensen–Dice over character bigrams. 1 = identical, 0 = nothing in common. */
export function diceScore(a: string, b: string): number {
  const x = normHe(a).replace(/ /g, '');
  const y = normHe(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) {
    const g = x.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const g = y.slice(i, i + 2);
    const n = bigrams.get(g) || 0;
    if (n > 0) { bigrams.set(g, n - 1); hits++; }
  }
  return (2 * hits) / (x.length - 1 + y.length - 1);
}

/** Confidence at which a fuzzy name is accepted without asking the person. */
export const NAME_THRESHOLD = 0.8;
/** Confidence at which a sentence is attached to an open EMS task. */
export const TASK_THRESHOLD = 0.45;

export interface Resolution { name: string; score: number; confident: boolean }

/**
 * Best candidate for `raw` out of `options`. Exact (folded) match wins outright; otherwise the
 * best Dice score, and `confident` only above NAME_THRESHOLD. An empty raw resolves to nothing,
 * which the island shows as a picker rather than inventing a kibbutz.
 */
export function resolveName(raw: unknown, options: string[]): Resolution {
  const q = normHe(raw);
  if (!q || !options.length) return { name: String(raw ?? '').trim(), score: 0, confident: false };
  const qStripped = tokens(q).map(stripPrefix).join(' ');
  let best = { name: '', score: 0 };
  for (const opt of options) {
    const o = normHe(opt);
    if (o === q || o === qStripped) return { name: opt, score: 1, confident: true };
    const s = Math.max(diceScore(q, o), diceScore(qStripped, o));
    if (s > best.score) best = { name: opt, score: s };
  }
  return best.score >= NAME_THRESHOLD
    ? { name: best.name, score: best.score, confident: true }
    : { name: String(raw ?? '').trim(), score: best.score, confident: false };
}

// ───────────────────────────── normalise the model's answer ─────────────────────────────

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function asText(v: unknown): string {
  return String(v ?? '').replace(/\r/g, '').trim();
}

function asQty(v: unknown): number {
  const n = parseInt(String(v ?? '1'), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function normItems(raw: any, products: string[]): DayLogItem[] {
  const out: DayLogItem[] = [];
  for (const it of asArray(raw)) {
    const name = asText(it?.product ?? it?.name ?? it);
    if (!name) continue;
    const r = resolveName(name, products);
    const item: DayLogItem = { product: r.confident ? r.name : name, qty: asQty(it?.qty ?? it?.quantity), resolved: r.confident };
    // Same product twice in one card (the model split "2 מונים" and "עוד מונה") → one line.
    const dup = out.find(o => o.product === item.product && o.resolved === item.resolved);
    if (dup) dup.qty += item.qty;
    else out.push(item);
  }
  return out;
}

function normTaskMatches(raw: any, tasks: GroundingTask[]): DayLogTaskMatch[] {
  const byId = new Map(tasks.map(t => [String(t.id), t]));
  const out: DayLogTaskMatch[] = [];
  for (const m of asArray(raw)) {
    const id = asText(m?.task_id ?? m?.id);
    const text = asText(m?.text ?? m?.comment ?? m?.task_hint);
    // An id the grounding list never contained is a hallucination — drop it, never post to it.
    if (!id || !byId.has(id) || !text) continue;
    if (out.some(o => o.task_id === id)) continue;
    out.push({ task_id: id, text, title: byId.get(id)!.title });
  }
  return out;
}

function mergeUnmatched(raw: any): string[] {
  const src = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const s of src) {
    for (const line of asText(s).split('\n')) {
      const t = line.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

/**
 * Raw model JSON → the cards. Tolerant of every shape the two providers actually return
 * (`items`/`products`, `summary`/`did`, `unmatched`/`unmatched_text`), strict about content:
 * names are resolved, quantities are positive integers, and a task id that was not in the
 * grounding list is dropped.
 */
export function normalizeDayLog(json: any, catalog: DayLogCatalog): DayLogResult {
  const kibbutzim = (catalog?.kibbutzim || []).map(String).filter(Boolean);
  const products = (catalog?.products || []).map(String).filter(Boolean);
  const tasks = catalog?.tasks || [];
  const visits: DayLogVisit[] = [];

  for (const v of asArray(json?.visits)) {
    const rawName = asText(v?.kibbutz ?? v?.site ?? v?.name);
    const summary = asText(v?.summary ?? v?.did);
    const openItems = asText(v?.open_items ?? v?.openItems ?? v?.open);
    const items = normItems(v?.items ?? v?.products, products);
    const matches = normTaskMatches(v?.task_matches ?? v?.ems_updates, tasks);
    // Nothing at all to show → not a visit, just noise the model wrapped in an object.
    if (!rawName && !summary && !openItems && !items.length) continue;
    const r = resolveName(rawName, kibbutzim);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(asText(v?.date)) ? asText(v.date) : undefined;
    const workday = v?.workday === true || String(v?.duration ?? '') === 'workday';
    const hours = Number(v?.duration_hours ?? v?.hours);

    // Same kibbutz mentioned in two places in the text → ONE card, texts joined. Saving two
    // visits for one day at one kibbutz is a data bug the person would have to clean up.
    const existing = r.confident ? visits.find(x => x.kibbutzConfident && x.kibbutz === r.name) : undefined;
    if (existing) {
      existing.summary = [existing.summary, summary].filter(Boolean).join('\n');
      existing.open_items = [existing.open_items, openItems].filter(Boolean).join('\n');
      for (const it of items) {
        const dup = existing.items.find(o => o.product === it.product);
        if (dup) dup.qty += it.qty; else existing.items.push(it);
      }
      for (const m of matches) if (!existing.task_matches.some(o => o.task_id === m.task_id)) existing.task_matches.push(m);
      continue;
    }

    visits.push({
      kibbutz: r.name,
      kibbutzConfident: r.confident,
      date,
      workday: workday || undefined,
      duration_hours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
      summary,
      open_items: openItems,
      items,
      task_matches: matches,
    });
  }

  return { visits, unmatched: mergeUnmatched(json?.unmatched ?? json?.unmatched_text) };
}

// ───────────────────────────── task matching ─────────────────────────────

/**
 * The open EMS task one sentence is about, or null. Scored on the words the sentence and the
 * title share (a title is 3–6 words; bigram similarity over a long sentence would drown it),
 * with the Dice score as a floor so a one-word title still matches.
 *
 * `kibbutz` narrows the candidates when it is known — a sentence about דפנה must not comment
 * on an identically-worded task at חוקוק.
 */
export function matchEmsTask(
  sentence: string,
  tasks: GroundingTask[],
  opts?: { kibbutz?: string; threshold?: number },
): DayLogTaskMatch | null {
  const threshold = opts?.threshold ?? TASK_THRESHOLD;
  const text = normHe(sentence);
  if (!text || !tasks?.length) return null;
  const wanted = opts?.kibbutz ? normHe(opts.kibbutz) : '';
  const words = new Set(tokens(text).map(stripPrefix).filter(w => w.length > 1));

  let best: DayLogTaskMatch | null = null;
  for (const t of tasks) {
    if (wanted && t.kibbutz && normHe(t.kibbutz) !== wanted) continue;
    const titleWords = tokens(t.title).map(stripPrefix).filter(w => w.length > 1);
    if (!titleWords.length) continue;
    const hits = titleWords.filter(w => words.has(w)).length;
    const overlap = hits / titleWords.length;
    const score = Math.max(overlap, diceScore(text, t.title));
    if (score >= threshold && (!best || score > (best.score ?? 0))) {
      best = { task_id: String(t.id), text: String(sentence).trim(), title: t.title, score };
    }
  }
  return best;
}

// ───────────────────────────── the comment ─────────────────────────────

/** עידן's wording, to the letter. Used by the day log AND by editing a linked visit. */
export function emsCommentText(person: string, text: string): string {
  return `עדכון מ${String(person || '').trim()} על המשימה: ${String(text || '').trim()}`;
}

// ───────────────────────────── saving ─────────────────────────────

/** The shape `sigma.saveVisitFromData` takes — one card, ready to become a visit record. */
export interface VisitPayload {
  kibbutz: string;
  date: string;
  visitor: string;
  duration: number;
  workday: boolean;
  summary: string;
  openItems: string;
  products: { name: string; qty: number }[];
  source?: string;
}

/** A card the person has finished editing → the visit payload the bridge saves. */
export function visitPayload(v: DayLogVisit, visitor: string, today: string, hours = 2): VisitPayload {
  return {
    kibbutz: v.kibbutz,
    date: v.date || today,
    visitor,
    duration: v.workday ? 8 : (v.duration_hours || hours),
    workday: !!v.workday,
    summary: v.summary,
    openItems: v.open_items,
    products: v.items.filter(i => i.resolved && i.qty > 0).map(i => ({ name: i.product, qty: i.qty })),
  };
}

/** A card is savable once it names a real kibbutz and actually says something. */
export function cardReady(v: DayLogVisit): boolean {
  return !!(v.kibbutz && v.kibbutzConfident && (v.summary.trim() || v.open_items.trim() || v.items.length));
}
