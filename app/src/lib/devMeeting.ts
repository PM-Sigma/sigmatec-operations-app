// D-L2 — ישיבת פיתוח: group the board by GitHub parent domain → priority, with filters and a
// "new this week" block (round-5 ruling, D-R1/D-R2/D-R3). Pure, no React, no network: every
// judgement here has a golden in devMeeting.test.ts over the shared fixture (__fixtures__/github_board.json).
//
// Domain = the card's TOP ancestor (`parentChain.at(-1)`, D-L1) — a card with no chain (or an
// undeployed function) falls back to `parent` resolved against the card list; no match → null
// ("ללא אפיון"). A Main Fields card (stageOf === 'fields') is a domain HEADER, never a row.
import { stageOf, type DevCard } from './sprintPrep';

export type PrioTier = 'crit' | 'high' | 'med' | 'low' | 'none';

export const PRIO_LABEL: Record<PrioTier, string> = {
  crit: 'קריטי', high: 'גבוהה', med: 'בינונית', low: 'נמוכה', none: 'ללא עדיפות',
};

const TIER_ORDER: PrioTier[] = ['crit', 'high', 'med', 'low', 'none'];

// The tier keyword families, verbatim from 18-dev-tasks.js (devPriorityRank / devPriority).
// [כך] covers both the standalone word "נמוך" (final kaf) and "נמוכה" (regular kaf + ה) — the
// board's actual Priority option text — since they diverge only in which kaf form they use.
const PRIO_TEXT_RE: Array<{ tier: PrioTier; re: RegExp }> = [
  { tier: 'crit', re: /קריטי|דחוף|critical|urgent/i },
  { tier: 'high', re: /גבוה|high/i },
  { tier: 'med', re: /בינוני|medium|normal/i },
  { tier: 'low', re: /נמו[כך]|low/i },
];
const PRIO_LABEL_RE: Array<{ tier: PrioTier; re: RegExp }> = [
  { tier: 'crit', re: /קריטי|דחוף|critical|urgent/i },
  { tier: 'high', re: /גבוה|high|🔴/i },
  { tier: 'med', re: /בינוני|medium|normal|🟡/i },
  { tier: 'low', re: /נמו[כך]|low|🟢/i },
];

/** A card's priority tier: the free-form "## עדיפות" / project field text first, then labels. */
export function priorityTier(c: DevCard): PrioTier {
  const p = String(c?.priority || '').trim();
  if (p) return (PRIO_TEXT_RE.find(x => x.re.test(p)) || { tier: 'none' as PrioTier }).tier;
  for (const L of c?.labels || []) {
    const hit = PRIO_LABEL_RE.find(x => x.re.test(String(L)));
    if (hit) return hit.tier;
  }
  return 'none';
}

/** The card's own domain: `{number, title}` of its top ancestor, or null ("ללא אפיון"). */
function domainOf(c: DevCard, byNumber: Map<number, DevCard>): { number: number; title: string } | null {
  const chain = c.parentChain;
  if (chain && chain.length) {
    const top = chain[chain.length - 1];
    return { number: top.number, title: top.title };
  }
  const p = byNumber.get(Number(c.parent));
  return p ? { number: Number(p.number), title: String(p.title || '') } : null;
}

/** The direct parent's title, shown as row meta only when it differs from the domain. */
export function directParentLabel(c: DevCard): string | null {
  const chain = c.parentChain || [];
  if (!chain.length) return null;
  const direct = chain[0], top = chain[chain.length - 1];
  return direct.number === top.number ? null : direct.title;
}

/** Board order inside a tier, then issue number — stable across re-runs. */
function byBoard(a: DevCard, b: DevCard): number {
  const pa = Number.isFinite(Number(a.pos)) ? Number(a.pos) : 1e9;
  const pb = Number.isFinite(Number(b.pos)) ? Number(b.pos) : 1e9;
  return pa !== pb ? pa - pb : Number(a.number) - Number(b.number);
}

function tiersOf(cards: DevCard[]): Array<{ tier: PrioTier; cards: DevCard[] }> {
  const byTier = new Map<PrioTier, DevCard[]>();
  for (const c of cards) {
    const t = priorityTier(c);
    (byTier.get(t) || byTier.set(t, []).get(t)!).push(c);
  }
  return TIER_ORDER.filter(t => byTier.has(t)).map(t => ({ tier: t, cards: byTier.get(t)!.sort(byBoard) }));
}

export interface DomainGroup {
  domain: { number: number; title: string } | null;
  count: number;
  tiers: Array<{ tier: PrioTier; cards: DevCard[] }>;
}

const live = (cards: DevCard[] | null | undefined): DevCard[] =>
  (cards || []).filter(c => c && Number.isFinite(Number(c.number)));

/** Parent → priority. Sorted by open count descending, then Hebrew title; "ללא אפיון" last. */
export function groupByDomain(cards: DevCard[]): DomainGroup[] {
  const all = live(cards);
  const byNumber = new Map(all.map(c => [Number(c.number), c]));
  const rows = all.filter(c => stageOf(c) !== 'fields');   // parents are headers, never rows

  const buckets = new Map<string, { domain: { number: number; title: string } | null; cards: DevCard[] }>();
  for (const c of rows) {
    const d = domainOf(c, byNumber);
    const key = d ? String(d.number) : '';
    if (!buckets.has(key)) buckets.set(key, { domain: d, cards: [] });
    buckets.get(key)!.cards.push(c);
  }

  return Array.from(buckets.values())
    .sort((a, b) => {
      if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
      if (!a.domain) return 1;
      if (!b.domain) return -1;
      return a.domain.title.localeCompare(b.domain.title, 'he');
    })
    .map(g => ({ domain: g.domain, count: g.cards.length, tiers: tiersOf(g.cards) }));
}

export interface DevFilters {
  q?: string; assignee?: string; stage?: string; tier?: PrioTier;
  updatedThisWeek?: boolean; hideDone?: boolean;
}

const DAY = 86400000;

/** The filters the filters sheet exposes, composed with AND. Parent (domain-header) cards never match. */
export function applyDevFilters(cards: DevCard[], f: DevFilters, now: number): DevCard[] {
  return live(cards)
    .filter(c => stageOf(c) !== 'fields')
    .filter(c => {
      if (f.hideDone && stageOf(c) === 'committed') return false;
      if (f.tier && priorityTier(c) !== f.tier) return false;
      if (f.stage && stageOf(c) !== f.stage) return false;
      if (f.assignee && String(c.assignee || '') !== f.assignee) return false;
      if (f.updatedThisWeek) {
        const t = c.updatedAt ? new Date(c.updatedAt).getTime() : NaN;
        if (!Number.isFinite(t) || now - t > 7 * DAY) return false;
      }
      if (f.q) {
        const hay = (String(c.title || '') + ' #' + c.number + ' ' + (c.assignee || '') + ' ' + (c.status || '')).toLowerCase();
        if (!hay.includes(String(f.q).toLowerCase())) return false;
      }
      return true;
    });
}

/** Cards created in the last 7 days — the meeting's own block, newest first. Parents excluded. */
export function newThisWeek(cards: DevCard[], now: number): DevCard[] {
  return live(cards)
    .filter(c => stageOf(c) !== 'fields')
    .filter(c => {
      const t = c.createdAt ? new Date(c.createdAt).getTime() : NaN;
      return Number.isFinite(t) && now - t >= 0 && now - t <= 7 * DAY;
    })
    .sort((a, b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));
}
