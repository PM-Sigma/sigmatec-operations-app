// One-click EMS close from inside the meeting (package M, M-R8): who may close, the exact close
// comment, and a 5 s deferred-commit queue so a click can still be undone before anything
// reaches EMS. The send path goes through the SAME queue-aware write every other EMS write in
// this app uses (`sigma.emsWrite`, `bridge.ts:91` → `emsWriteOrQueue`, `13-ems.js:293`) — no new
// write path, no direct fetch, nothing here talks to EMS except through that one door.
import { sigma } from '@/bridge';
import { emsGateway } from '@/lib/ems/gateway';
import { EMS_CLOSED } from '@/lib/emsTasks';
import { dm, israelParts } from '@/lib/field';

/** Who may close an EMS task with one click during the meeting (M-R8). */
export const CLOSERS = ['עידן', 'עמיחי'];

export function canCloseInMeeting(user: string, isViewer: boolean): boolean {
  return !isViewer && CLOSERS.includes(user);
}

/** `'נסגר בישיבת צוות 23.9 · עמיחי'` — the Israel date of the click, no leading zeros. */
export function closeComment(name: string, at: Date): string {
  return `נסגר בישיבת צוות ${dm(israelParts(at).date)} · ${name}`;
}

export type CloseStatus = 'done' | 'cancelled';
export interface PendingClose { taskId: string; status: CloseStatus; by: string; at: Date }

export interface SendResult { sent: boolean; queued?: boolean; error?: string; skipped?: 'already-closed' }

export interface CloseQueue {
  /** Commits in `delayMs` (default 5000). Returns the undo — call it inside the window to cancel. */
  schedule(p: PendingClose): () => void;
  /** Commit everything still pending, right now (pagehide / leaving the kibbutz / exit). */
  flush(): Promise<void>;
  /** What is still waiting to commit. */
  pending(): PendingClose[];
}

/**
 * The 5 s deferred-commit queue (review focus #1): nothing reaches EMS until the delay elapses
 * OR `flush()` is called. Re-scheduling the same `taskId` (בוצע then בוטל before either fires)
 * replaces the pending write rather than sending both.
 */
export function createCloseQueue(deps: {
  send: (p: PendingClose) => Promise<SendResult>;
  delayMs?: number;
  onSettled?: (p: PendingClose, r: SendResult) => void;
}): CloseQueue {
  const delayMs = deps.delayMs ?? 5000;
  const queue = new Map<string, { p: PendingClose; timer: ReturnType<typeof setTimeout> }>();

  async function commit(taskId: string): Promise<void> {
    const entry = queue.get(taskId);
    if (!entry) return;
    queue.delete(taskId);
    const r = await deps.send(entry.p);
    deps.onSettled?.(entry.p, r);
  }

  function schedule(p: PendingClose): () => void {
    const existing = queue.get(p.taskId);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => { void commit(p.taskId); }, delayMs);
    queue.set(p.taskId, { p, timer });
    return () => {
      const e = queue.get(p.taskId);
      if (e && e.p === p) { clearTimeout(e.timer); queue.delete(p.taskId); }
    };
  }

  async function flush(): Promise<void> {
    const ids = [...queue.keys()];
    for (const id of ids) { const e = queue.get(id); if (e) clearTimeout(e.timer); }
    for (const id of ids) await commit(id);
  }

  function pending(): PendingClose[] {
    return [...queue.values()].map(e => e.p);
  }

  return { schedule, flush, pending };
}

async function write(item: Record<string, unknown>): Promise<SendResult> {
  const res = await sigma.emsWrite?.(item);
  return res || { sent: false, error: 'EMS write unavailable' };
}

/**
 * The actual send, behind the existing gateway and bridge (never called from a test with real
 * EMS reachable — see meetingClose.test.ts). Re-reads the task first: a second presenter's
 * click on an already-closed task is a no-op, not a duplicate comment (review focus #4). The
 * comment goes out before the status, same order `pushVisitToEms` uses (`14-calendar.js:294`);
 * a real rejection on the comment stops before the status write, so a task is never left with a
 * status change but no explanatory comment.
 */
export async function sendClose(p: PendingClose): Promise<SendResult> {
  const task = await emsGateway().getTask(p.taskId);
  if (task && EMS_CLOSED.includes(task.status)) return { sent: false, skipped: 'already-closed' };

  const commentRes = await write({ kind: 'comment', taskId: p.taskId, message: closeComment(p.by, p.at) });
  if (commentRes.error) return { sent: false, error: commentRes.error };

  const statusRes = await write({ kind: 'status', taskId: p.taskId, status: p.status });
  if (statusRes.error) return { sent: false, error: statusRes.error };

  return { sent: !!(commentRes.sent && statusRes.sent), queued: !!(commentRes.queued || statusRes.queued) };
}
