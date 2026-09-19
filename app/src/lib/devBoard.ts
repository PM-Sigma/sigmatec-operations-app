// The dev board's ONE data path for React (Task 30). Everything that talks to the `github`
// Edge Function from an island goes through here, so the ▶ ישיבת פיתוח walk and the 📋 prep
// card share a single fetch under a single react-query key instead of racing each other.
//
// No new Edge-Function action exists for this task: the read is the function's DEFAULT mode
// (the same call js/src/18-dev-tasks.js makes for the 💻 לוח פיתוח page), and the only write is
// `setStatus` — the existing "העבר לספרינט הקרוב" action. This module never creates an issue.
import { SB_ANON, SB_URL } from './supabase';
import { sigma } from '@/bridge';
import { SPRINT_STATUS_TARGET, type DevCard } from './sprintPrep';

/** The shared key. One entry per board state, so the walk and the prep card are one fetch. */
export const DEV_BOARD_QUERY_KEY = (state: 'open' | 'all' = 'open') => ['gh', 'board', state] as const;

/** The `github` function gates every mode on a valid EMS login. */
function emsToken(): string {
  try { return sigma?.emsToken?.() || ''; } catch { return ''; }
}

export async function ghCall(payload: Record<string, unknown>): Promise<any> {
  const token = emsToken();
  if (!token) throw new Error('יש להתחבר ל-EMS כדי לפתוח את לוח הפיתוח');
  const r = await fetch(SB_URL + '/functions/v1/github', {
    method: 'POST',
    headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...payload }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('github ' + r.status));
  return d;
}

/** The board, as the function's read mode returns it. */
export async function fetchDevBoard(state: 'open' | 'all' = 'open'): Promise<DevCard[]> {
  const d = await ghCall({ state });
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
