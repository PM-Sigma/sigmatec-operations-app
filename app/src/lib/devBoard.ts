// The dev board's ONE data path for React (Task 30). Everything that talks to the `github`
// Edge Function from an island goes through here, so the ▶ ישיבת פיתוח walk and the 📋 prep
// card share a single fetch under a single react-query key instead of racing each other.
//
// No new Edge-Function action exists for this task: the read is the function's DEFAULT mode
// (the same call js/src/18-dev-tasks.js makes for the 💻 לוח פיתוח page), and the only write is
// `setStatus` — the existing "העבר לספרינט הקרוב" action. This module never creates an issue.
import { SB_ANON, SB_URL } from './supabase';
import { sigma } from '@/bridge';
import { sessionLost } from '@/lib/session';
import { canShowPage } from './canShowPage';
import { SPRINT_STATUS_TARGET, stageOf, type DevCard, type DevStage } from './sprintPrep';

/** The shared key. One entry per board state, so the walk and the prep card are one fetch. */
export const DEV_BOARD_QUERY_KEY = (state: 'open' | 'all' = 'open') => ['gh', 'board', state] as const;

/** The `github` function gates every mode on a valid EMS login. */
function emsToken(): string {
  try { return sigma?.emsToken?.() || ''; } catch { return ''; }
}

export async function ghCall(payload: Record<string, unknown>): Promise<any> {
  const token = emsToken();
  if (!token) throw sessionLost('gh-no-token');
  // X-L8: the write gate (setStatus / setPriority / createIssue) reads WHO from this pass —
  // the same Supabase-minted JWT every authenticated table read already uses, verified
  // server-side against JWT_SECRET, never from a body field a caller could set. A missing/
  // stale pass still reaches the function (reads stay open to any EMS login); a write without
  // one 401s there, same as any other authenticated call would.
  const pass = (() => { try { return sigma?.sbPass?.()?.token || ''; } catch { return ''; } })();
  const r = await fetch(SB_URL + '/functions/v1/github', {
    method: 'POST',
    headers: {
      apikey: SB_ANON,
      Authorization: 'Bearer ' + (pass || SB_ANON),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, ...payload }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('github ' + r.status));
  return d;
}

/**
 * The board, as the function's read mode returns it.
 *
 * `comments` costs one extra paginated GraphQL query server-side, so only the caller that
 * needs them asks: ▶ ישיבת פיתוח builds "שאלות פתוחות לעידן" and the per-card comment list
 * out of them, and 💻 פיתוח does not show comments at all. Until the Task 18 sweep the read
 * never returned comments in any case, so both of those surfaces rendered permanently empty.
 * A function that has not been redeployed yet simply omits them — `card.comments` is optional
 * and every consumer already treats "absent" as "none".
 */
export async function fetchDevBoard(state: 'open' | 'all' = 'open', opts?: { comments?: boolean }): Promise<DevCard[]> {
  const d = await ghCall(opts?.comments ? { state, comments: true } : { state });
  return (d?.tasks || []) as DevCard[];
}

/**
 * Accept one proposed card: the EXISTING "העבר לספרינט הקרוב" write (`setStatus` → Ready) and
 * nothing else. A dev meeting never creates a ticket — the Git Ticket System's rule is that
 * every card is a child under an existing Main Fields parent, and inventing one live in a
 * meeting is exactly how that rule gets broken.
 */
export async function moveToSprint(numbers: number[]): Promise<{ updated: number[] }> {
  const ns = (numbers || []).map(Number).filter(Number.isFinite);
  if (!ns.length) return { updated: [] };
  const d = await ghCall({ mode: 'setStatus', numbers: ns, status: SPRINT_STATUS_TARGET });
  if (!d || !('updated' in d)) throw new Error('צריך לפרוס מחדש את פונקציית github (אין עדיין כתיבה)');
  return { updated: (d.updated || []) as number[] };
}

/** The Status the board's "העברה לשלב" action targets per column — port of DEV_STAGE_TARGET. */
export const STAGE_TARGET: Record<DevStage, string> = {
  fields: 'Main Fields', backlog: 'Backlog', scope: 'Scope Refinement',
  ready: 'Sprint Ready', prog: 'In Progress', review: 'In Review', committed: 'Committed',
};

/** Move cards to a target Status (the sheet's "העברה לשלב", and the selection footer's push). */
export async function setStatus(numbers: number[], target: string): Promise<{ updated: number[] }> {
  const ns = (numbers || []).map(Number).filter(Number.isFinite);
  if (!ns.length) return { updated: [] };
  const d = await ghCall({ mode: 'setStatus', numbers: ns, status: target });
  if (!d || !('updated' in d)) throw new Error('צריך לפרוס מחדש את פונקציית github (אין עדיין כתיבה)');
  return { updated: (d.updated || []) as number[] };
}

/** Set (or clear, with an empty string) the Priority field for the selected cards. */
export async function setPriority(numbers: number[], p: string): Promise<{ updated: number[] }> {
  const ns = (numbers || []).map(Number).filter(Number.isFinite);
  if (!ns.length) return { updated: [] };
  const d = await ghCall({ mode: 'setPriority', numbers: ns, priority: p });
  if (!d || !('updated' in d)) throw new Error('צריך לפרוס מחדש את פונקציית github (אין עדיין כתיבה)');
  return { updated: (d.updated || []) as number[] };
}

/** "🚀 עלתה גרסה" — every card currently in review (שלבי בדיקות) moves to Committed. */
export async function releaseReview(cards: DevCard[]): Promise<{ updated: number[] }> {
  const numbers = (cards || []).filter(c => stageOf(c) === 'review').map(c => Number(c.number));
  if (!numbers.length) return { updated: [] };
  return setStatus(numbers, STAGE_TARGET.committed);
}

/**
 * Who may open 💻 פיתוח. A pure forward to `canShowPage('dev')` — the ONE source of truth
 * (00-bridge.js `canShowPage`, D-L5) — never a second copy of the מתניה/אליה/admin rule, which
 * is exactly how the audience for the page and the audience for this data layer could drift.
 */
export function canSeeDevBoard(): boolean {
  return canShowPage('dev');
}

/** Who may drag a card / use "העברה לשלב" — עידן only, as today. */
export function canDragOrMove(user: string | null | undefined): boolean {
  return String(user || '').trim() === 'עידן';
}
