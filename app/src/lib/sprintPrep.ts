// ישיבת פיתוח — the pure core (company-process spec §7, master spec §7d). No React, no DOM,
// no network: every judgement the dev-meeting screen and the prep card make is a function here
// with a golden in sprintPrep.test.ts, and the island is only a rendering shell.
//
// Two rules shape this file:
//   · The Git Ticket System owns the board. A card is a CHILD under an existing "Main Fields"
//     parent, titled `[מודול] | [תת-תחום] | [תיאור]`. Nothing here ever proposes, ranks or
//     creates a parent — `proposeSprint` filters them out rather than trusting the caller.
//   · One object drives both surfaces. `devPrep()` is what the presenter walks AND what the
//     📋 prep card lists; there is no second derivation and therefore no way for the screen
//     and the prep sheet to disagree in front of the room.
//
// The stage regexes are the SAME ones the dev board already classifies with
// (js/src/18-dev-tasks.js `devStage`). They are copied deliberately and pinned by a golden:
// that module is a legacy IIFE with no export, so importing it is not an option, and a board
// that sorted a card into one column while the meeting walked it in another would be worse.

// ───────────────────────────── shapes ─────────────────────────────

/** One card, exactly as the `github` Edge Function's read mode returns it. */
export interface DevCard {
  number: number;
  title: string;
  body?: string | null;
  state?: string;
  status?: string;
  priority?: string;
  parent?: number | null;
  assignee?: string;
  labels?: string[];
  url?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** The board's own item order, as the project returns it. */
  pos?: number;
  /** Issue comments, when the caller has them. Absent is normal, never an error. */
  comments?: DevComment[];
}

export interface DevComment {
  id?: string | number;
  issue_number?: number;
  author?: string;
  body?: string | null;
  createdAt?: string | null;
}

export type DevStage = 'fields' | 'backlog' | 'scope' | 'ready' | 'prog' | 'review' | 'committed';

/** The three columns §7 walks, in the order it walks them. */
export const WALK_STAGES: Array<{ key: DevStage; label: string }> = [
  { key: 'prog', label: 'בפיתוח עכשיו' },
  { key: 'review', label: 'שלבי בדיקות' },
  { key: 'ready', label: 'ספרינט הקרוב' },
];

export const STAGE_LABEL: Record<DevStage, string> = {
  fields: 'תחומים ראשיים',
  backlog: 'ממתין לפיתוח',
  scope: 'חזר לאפיון מחדש',
  ready: 'ספרינט הקרוב',
  prog: 'בפיתוח עכשיו',
  review: 'שלבי בדיקות',
  committed: 'עלה לאוויר',
};

// ───────────────────────────── stage ─────────────────────────────

/**
 * A card's column. Most-specific match first, exactly as the board does it; a closed card with
 * no Status shipped, and anything else is backlog (todo / new / empty all land there).
 */
export function stageOf(card: DevCard | null | undefined): DevStage {
  const s = String(card?.status || '').toLowerCase();
  if (/^main fields$|תחומים ראשי/.test(s)) return 'fields';
  if (/scope refinement|אפיון מחדש/.test(s)) return 'scope';
  if (/commit|deployed|\blive\b|released|production|פרוד|עלה לאוויר|אונליין|^done$|בוצע|הושלם|complete|merged|נסגר/.test(s)) return 'committed';
  if (/review|בדיק|qa/.test(s)) return 'review';
  if (/progress|בעבודה|doing|פיתוח|wip|בתהליך|active/.test(s)) return 'prog';
  if (/ready|מוכן|ספרינט|next|planned/.test(s)) return 'ready';
  if (String(card?.state || '') === 'closed') return 'committed';
  return 'backlog';
}

/** A Main Fields parent — never walked as a card, never proposed for a sprint. */
export function isParentCard(card: DevCard | null | undefined): boolean {
  return stageOf(card) === 'fields';
}

const live = (cards: DevCard[] | null | undefined): DevCard[] =>
  (cards || []).filter(c => c && Number.isFinite(Number(c.number)));

/** Board order inside a column, then issue number — total and stable, so a re-run never reshuffles. */
function byBoard(a: DevCard, b: DevCard): number {
  const pa = Number.isFinite(Number(a.pos)) ? Number(a.pos) : 1e9;
  const pb = Number.isFinite(Number(b.pos)) ? Number(b.pos) : 1e9;
  return pa !== pb ? pa - pb : Number(a.number) - Number(b.number);
}

/** The cards of one column, in board order. */
export function cardsInStage(cards: DevCard[] | null | undefined, stage: DevStage): DevCard[] {
  return live(cards).filter(c => stageOf(c) === stage).sort(byBoard);
}

/** The walk: בפיתוח עכשיו → שלבי בדיקות → ספרינט הקרוב, one flat list of screens. */
export function walkOrder(cards: DevCard[] | null | undefined): DevCard[] {
  return WALK_STAGES.flatMap(s => cardsInStage(cards, s.key));
}

// ───────────────────────────── the title ─────────────────────────────

export interface TitleParts { module: string; sub: string; desc: string }

/** `[מודול] | [תת-תחום] | [תיאור]` — the Git Ticket System's title contract. */
export function parseTitle(title: string | null | undefined): TitleParts {
  const parts = String(title || '').split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3) return { module: parts[0], sub: parts[1], desc: parts.slice(2).join(' · ') };
  if (parts.length === 2) return { module: parts[0], sub: '', desc: parts[1] };
  return { module: 'אחר', sub: '', desc: parts[0] || String(title || '') };
}

/** The parent card's title (or its number) — what the prep list prints under "אב". */
export function parentLabel(card: DevCard, cards: DevCard[] | null | undefined): string {
  const p = Number(card?.parent);
  if (!Number.isFinite(p)) return parseTitle(card?.title).module;
  const hit = live(cards).find(c => Number(c.number) === p);
  return hit ? parseTitle(hit.title).module || hit.title : '#' + p;
}

// ───────────────────────────── the selectors ─────────────────────────────

/**
 * Cards with no spec — the "Scope Refinement" candidates: an empty body, or a body with no
 * `## ` section in it. A one-line body is a note, not an spec; the `## ` heading is what the
 * ticket template puts every section behind.
 *
 * Parents are excluded: a Main Fields card is a folder and is not supposed to carry a spec.
 */
export function cardsWithoutSpec(cards: DevCard[] | null | undefined): DevCard[] {
  return live(cards)
    .filter(c => !isParentCard(c) && stageOf(c) !== 'committed')
    .filter(c => {
      const body = String(c.body || '').trim();
      if (!body) return true;
      return !/^##\s+\S/m.test(body);
    })
    .sort(byBoard);
}

const DAY = 86400000;

/** Whole days between an ISO instant and `now`, or null when the instant is unusable. */
export function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(String(iso)).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

/**
 * Stuck cards: sitting in a WORKING column (בפיתוח / בדיקות / ספרינט) with no state change for
 * more than `days`. Backlog is not "blocked" — nobody started it — and a shipped card cannot be.
 * Oldest first: the meeting should open on the one that has waited longest.
 */
export function blockedOver(
  cards: DevCard[] | null | undefined,
  days = 7,
  now: number | Date = Date.now(),
): DevCard[] {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const limit = Math.max(0, Number(days) || 0);
  const working = new Set<DevStage>(['prog', 'review', 'ready']);
  return live(cards)
    .filter(c => working.has(stageOf(c)))
    .filter(c => {
      const age = daysSince(c.updatedAt, t);
      return age !== null && age > limit;
    })
    .sort((a, b) => {
      const da = daysSince(a.updatedAt, t) ?? 0;
      const db = daysSince(b.updatedAt, t) ?? 0;
      return db !== da ? db - da : Number(a.number) - Number(b.number);
    });
}

const IDAN = /עידן|@idan|\bidan\b/i;

/**
 * The lead dev's open questions: comments that mention עידן, newest first. A comment עידן wrote
 * himself is not a question FOR him, so his own are dropped.
 */
export function questionsForIdan(comments: DevComment[] | null | undefined): DevComment[] {
  return (comments || [])
    .filter(c => c && String(c.body || '').trim())
    .filter(c => !IDAN.test(String(c.author || '')))
    .filter(c => IDAN.test(String(c.body || '')))
    .slice()
    .sort((a, b) => {
      const ta = new Date(String(a.createdAt || 0)).getTime() || 0;
      const tb = new Date(String(b.createdAt || 0)).getTime() || 0;
      if (tb !== ta) return tb - ta;
      return Number(a.issue_number || 0) - Number(b.issue_number || 0);
    });
}

export interface Burndown { done: number; total: number; pct: number }

/**
 * The sprint's burndown: of everything that entered this sprint (ספרינט הקרוב + בפיתוח +
 * בדיקות + what already shipped), how much is out the door. An empty board is 0/0 at 0% —
 * never NaN, which is what a division by an empty sprint would print on the screen.
 */
export function burndown(cards: DevCard[] | null | undefined): Burndown {
  const inSprint = live(cards).filter(c => {
    const s = stageOf(c);
    return s === 'ready' || s === 'prog' || s === 'review' || s === 'committed';
  });
  const total = inSprint.length;
  const done = inSprint.filter(c => stageOf(c) === 'committed').length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ───────────────────────────── the ranking ─────────────────────────────

/** Priority tiers, as the board's Priority field words them. */
const PRIORITY_POINTS: Array<{ re: RegExp; points: number }> = [
  { re: /קריטי|critical|urgent|דחוף/i, points: 40 },
  { re: /גבוה|high/i, points: 28 },
  { re: /בינוני|medium|normal/i, points: 14 },
  { re: /נמוך|low/i, points: 4 },
];

export interface RankOpts {
  now?: number | Date;
  /**
   * Kibbutzim whose health is RED right now (Task 28). A card that names one fixes a red
   * signal and outranks an equally-urgent card that does not. NULL-SAFE by design: the health
   * island may not be on the page at all, and then this is simply absent and nothing changes.
   */
  redKibbutzim?: Iterable<string> | null;
  /** Parent-module priority, `module → points`. Absent modules contribute nothing. */
  modulePriority?: Record<string, number> | null;
}

export const RED_HEALTH_BONUS = 25;

/**
 * One card's score — the WHOLE ranking, in one exported function, so re-tuning the sprint
 * proposal is a change to four numbers here and to nothing else (spec §7).
 *
 *   priority tier · age (a card the board has ignored for a month deserves a look) ·
 *   the parent module's own weight · a red-health bonus.
 *
 * Age is capped at 30 points so an ancient nice-to-have can never outrank a critical bug, and
 * every term is finite: a card with no dates and no priority scores 0 rather than NaN.
 */
export function rankCard(card: DevCard | null | undefined, opts: RankOpts = {}): number {
  if (!card) return 0;
  const now = opts.now instanceof Date ? opts.now.getTime() : Number(opts.now ?? Date.now());

  let score = 0;

  const prio = String(card.priority || '');
  const tier = PRIORITY_POINTS.find(p => p.re.test(prio));
  if (tier) score += tier.points;

  const age = daysSince(card.createdAt, Number.isFinite(now) ? now : Date.now());
  if (age !== null) score += Math.min(30, Math.floor(age / 7) * 3);

  const mod = parseTitle(card.title).module;
  const weights = opts.modulePriority || null;
  if (weights && Number.isFinite(Number(weights[mod]))) score += Number(weights[mod]);

  // Task 28's signal, read null-safely: no health island → no list → no bonus, no crash.
  const red = opts.redKibbutzim ? Array.from(opts.redKibbutzim) : [];
  if (red.length && touchesRed(card, red)) score += RED_HEALTH_BONUS;

  return score;
}

/** Does this card name a kibbutz that is red right now? Title first, then the body. */
export function touchesRed(card: DevCard | null | undefined, redKibbutzim: Iterable<string>): boolean {
  const hay = String(card?.title || '') + '\n' + String(card?.body || '');
  for (const k of redKibbutzim) {
    const name = String(k || '').trim();
    if (name && hay.includes(name)) return true;
  }
  return false;
}

export interface ProposeOpts extends RankOpts {
  /** How many cards the proposal may hold. Default 8; 0 or less → nothing proposed. */
  cap?: number;
}

/**
 * The proposed next sprint: the highest-ranked BACKLOG children, capped.
 *
 * Only backlog — a card already in the sprint is not a candidate for it. Never a parent: the
 * Git Ticket System's rule is enforced here rather than trusted. Ties break on issue number
 * ASCENDING, so two identical cards come back in the same order on every re-run and עידן does
 * not see the list reshuffle between opening the prep card and accepting from it.
 */
export function proposeSprint(cards: DevCard[] | null | undefined, opts: ProposeOpts = {}): DevCard[] {
  const cap = opts.cap === undefined ? 8 : Math.floor(Number(opts.cap) || 0);
  if (cap <= 0) return [];
  return live(cards)
    .filter(c => !isParentCard(c) && stageOf(c) === 'backlog')
    .map(c => ({ c, score: rankCard(c, opts) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : Number(a.c.number) - Number(b.c.number)))
    .slice(0, cap)
    .map(x => x.c);
}

export interface SprintEntry {
  issue_number: number;
  title: string;
  parent: string;
  why: string;
}

/** Why this card is on the list — the one line עידן reads before he accepts it. */
function whyText(card: DevCard, opts: RankOpts): string {
  const bits: string[] = [];
  const prio = String(card.priority || '').trim();
  if (prio) bits.push('עדיפות ' + prio);
  const red = opts.redKibbutzim ? Array.from(opts.redKibbutzim) : [];
  if (red.length && touchesRed(card, red)) bits.push('קשור לקיבוץ בעייתי');
  const age = daysSince(card.createdAt, opts.now instanceof Date ? opts.now.getTime() : Number(opts.now ?? Date.now()));
  if (age !== null && age >= 14) bits.push('ממתין ' + Math.floor(age / 7) + ' שבועות');
  return bits.length ? bits.join(' · ') : 'מועמד לפי סדר הלוח';
}

/** The task's OUTPUT: the ordered list עידן accepts, one entry per card. */
export function sprintList(
  picked: DevCard[] | null | undefined,
  cards?: DevCard[] | null,
  opts: RankOpts = {},
): SprintEntry[] {
  return live(picked).map(c => ({
    issue_number: Number(c.number),
    title: String(c.title || ''),
    parent: parentLabel(c, cards && cards.length ? cards : picked),
    why: whyText(c, opts),
  }));
}

// ───────────────────────────── the one object ─────────────────────────────

export interface DevPrep {
  burndown: Burndown;
  cardsWithoutSpec: DevCard[];
  blocked: DevCard[];
  questions: DevComment[];
  proposed: DevCard[];
  sprint: SprintEntry[];
  walk: DevCard[];
}

export interface PrepOpts extends ProposeOpts {
  /** How long a card may sit in a working column before it counts as blocked. Default 7. */
  blockedDays?: number;
  /** Comments, when the caller has them. `questionsForIdan` runs over exactly these. */
  comments?: DevComment[] | null;
}

/**
 * Everything the dev meeting needs, derived ONCE. The presenter walks `walk`; the 📋 prep card
 * prints the rest. Two surfaces, one object — an empty board gives empty lists and a 0/0
 * burndown, never a crash and never a half-filled screen.
 */
export function devPrep(cards: DevCard[] | null | undefined, opts: PrepOpts = {}): DevPrep {
  const all = live(cards);
  const proposed = proposeSprint(all, opts);
  return {
    burndown: burndown(all),
    cardsWithoutSpec: cardsWithoutSpec(all),
    blocked: blockedOver(all, opts.blockedDays ?? 7, opts.now ?? Date.now()),
    questions: questionsForIdan(opts.comments || []),
    proposed,
    sprint: sprintList(proposed, all, opts),
    walk: walkOrder(all),
  };
}

// ───────────────────────────── roles ─────────────────────────────

/** The developers who sit in ישיבת פיתוח, plus whoever the app already calls an admin. */
export const DEV_MEETING_PEOPLE = ['עידן', 'מתניה', 'אליה'];

/**
 * Who may open ▶ ישיבת פיתוח: the dev-page gate (עידן + the two developers, or an admin), and
 * never a viewer — the screen writes to the meeting log and moves cards on the board, and a
 * read-only account has nothing to write with.
 */
export function canRunDevMeeting(
  user: string | null | undefined,
  opts: { isAdmin?: boolean; isViewer?: boolean } = {},
): boolean {
  if (opts.isViewer) return false;
  const me = String(user || '').trim();
  return !!opts.isAdmin || DEV_MEETING_PEOPLE.includes(me);
}

/** The Status the board's "העבר לספרינט הקרוב" action targets — the EXISTING write, by name. */
export const SPRINT_STATUS_TARGET = 'Ready';
