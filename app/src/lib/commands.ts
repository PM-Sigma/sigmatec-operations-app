// Ctrl+K command bar — the ranking and the sources (spec §7k.1, decision #12).
//
// "One input, one list, keyboard first." Everything here is PURE except the two recents
// helpers, so the ranking can be pinned by tests instead of by eyeballing a dialog:
//   exact prefix  >  word prefix  >  fuzzy (subsequence)  — recent items first inside a tier.
//
// Typed prefixes narrow the list the way §7k.1 specifies: `>` actions only, `#` tasks only
// (`@` people is future work and is accepted-but-empty rather than silently ignored).
export type CommandKind = 'kibbutz' | 'task' | 'page' | 'action' | 'person';

export interface Command {
  id: string;
  /** What the person reads. */
  label: string;
  /** Extra searchable text (a display name, a region, the task's site) — never rendered alone. */
  keywords?: string;
  /** A short right-hand hint: the section, the site, the status. */
  hint?: string;
  kind: CommandKind;
  run: () => void;
  /** §7k.1: "role-filtered". Omitted = everyone. */
  roles?: string[];
}

export const RECENTS_KEY = 'sigma_cmd_recents_v1';
const RECENTS_MAX = 8;

/** The ids the person picked last, newest first. */
export function readRecents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(x => typeof x === 'string').slice(0, RECENTS_MAX) : [];
  } catch { return []; }
}

/** Pure: the new recents list after picking `id` (newest first, de-duplicated, capped). */
export function withRecent(recents: string[], id: string): string[] {
  return [id, ...recents.filter(r => r !== id)].slice(0, RECENTS_MAX);
}

export function pushRecent(id: string): string[] {
  const next = withRecent(readRecents(), id);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

/** A typed prefix and the query with it removed. */
export interface ParsedQuery { kinds: CommandKind[] | null; text: string }

export function parseQuery(raw: string): ParsedQuery {
  const q = String(raw ?? '');
  if (q.startsWith('>')) return { kinds: ['action'], text: q.slice(1).trim() };
  if (q.startsWith('#')) return { kinds: ['task'], text: q.slice(1).trim() };
  if (q.startsWith('@')) return { kinds: ['person'], text: q.slice(1).trim() };
  return { kinds: null, text: q.trim() };
}

const norm = (s: string) => String(s ?? '').toLowerCase().trim();

/** Does every character of `q` appear in order inside `text`? (the loosest tier) */
function subsequence(text: string, q: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return q.length === 0;
}

/**
 * How well one command matches. Higher is better; 0 = no match at all.
 *   4 = the whole label starts with the query (exact prefix)
 *   3 = some WORD of the label starts with it
 *   2 = a keyword starts with it (prefix, in the extra searchable text)
 *   1 = fuzzy: the letters appear in order
 * The tiers are deliberately coarse — §7k.1 names three, and a fine-grained score would make
 * the order impossible to predict, which is the one thing a command bar must never be.
 */
export function scoreCommand(cmd: Command, query: string): number {
  const q = norm(query);
  if (!q) return 1;                                     // an empty query lists everything
  const label = norm(cmd.label);
  const keys = norm(cmd.keywords || '');
  if (label.startsWith(q)) return 4;
  if (label.split(/\s+/).some(w => w.startsWith(q))) return 3;
  if (keys && (keys.startsWith(q) || keys.split(/\s+/).some(w => w.startsWith(q)))) return 2;
  if (subsequence(label, q) || (keys && subsequence(keys, q))) return 1;
  return 0;
}

export interface RankOptions {
  /** The person's role, matched against each command's `roles`. */
  role?: string;
  /** Ids picked recently, newest first — they win inside their tier. */
  recents?: string[];
  /** Cap the list; the dialog scrolls, but an unbounded list is not a list. */
  limit?: number;
}

/**
 * THE ranking. Role filter → prefix filter → score → recents → stable original order.
 * Stable on purpose: two commands that tie must not swap places between keystrokes.
 */
export function rankCommands(commands: Command[], query: string, opts: RankOptions = {}): Command[] {
  const { role, recents = [], limit = 40 } = opts;
  const { kinds, text } = parseQuery(query);
  const recentAt = (id: string) => {
    const i = recents.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  return (commands || [])
    .map((cmd, order) => ({ cmd, order, score: 0 }))
    .filter(({ cmd }) => !cmd.roles || !role || cmd.roles.includes(role))
    .filter(({ cmd }) => !kinds || kinds.includes(cmd.kind))
    .map(e => ({ ...e, score: scoreCommand(e.cmd, text) }))
    .filter(e => e.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || recentAt(a.cmd.id) - recentAt(b.cmd.id)
      || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map(e => e.cmd);
}

export const KIND_HEADING: Record<CommandKind, string> = {
  action: 'פעולות',
  kibbutz: 'קיבוצים',
  task: 'משימות',
  page: 'מסכים',
  person: 'אנשים',
};

/** The order the groups appear in the dialog — actions first, they are what a shortcut is for. */
export const KIND_ORDER: CommandKind[] = ['action', 'kibbutz', 'task', 'page', 'person'];

/** Group a ranked list for rendering, keeping each group's ranked order. */
export function groupCommands(ranked: Command[]): Array<{ kind: CommandKind; items: Command[] }> {
  return KIND_ORDER
    .map(kind => ({ kind, items: ranked.filter(c => c.kind === kind) }))
    .filter(g => g.items.length > 0);
}

/**
 * ONE FLAT LIST in the global ranked order, each row told whether it OPENS a run of its kind
 * (review fix 4).
 *
 * Why not real groups: cmdk selects the FIRST ITEM IN DOM ORDER, so grouping meant Enter ran
 * the first ACTION rather than the top-ranked result — the top hit could be three groups down
 * and Enter would ignore it.
 *
 * Why not full-width dividers either: the ranking INTERLEAVES kinds by design (an exact-prefix
 * kibbutz, then a task matched on its site, then a fuzzy kibbutz), so a divider on every change
 * repeats "קיבוצים" every other row. The kind is an inline label on the row that starts the
 * run instead — same information, where a divider would have been, and it never repeats
 * itself into noise.
 */
export interface CommandRow {
  cmd: Command;
  /** First row of a run of this kind → render its kind label. */
  startsKind: boolean;
  key: string;
}

export function rankedRows(ranked: Command[] | null | undefined): CommandRow[] {
  let last: CommandKind | null = null;
  return (ranked || []).map(cmd => {
    const startsKind = cmd.kind !== last;
    last = cmd.kind;
    return { cmd, startsKind, key: cmd.id };
  });
}

/** The command Enter runs: the globally top-ranked one, whatever kind it is. */
export function topCommand(ranked: Command[] | null | undefined): Command | null {
  return (ranked && ranked[0]) || null;
}
