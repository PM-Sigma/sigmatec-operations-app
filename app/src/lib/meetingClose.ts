// One-click EMS close from inside the meeting (package M, M-R8): who may close, the exact close
// comment, and a 5 s deferred-commit queue so a click can still be undone before anything
// reaches EMS. The send path goes through the typed gateway ONLY (`emsGateway().addComment` /
// `.updateTask`) — never `sigma`'s queue-aware write method directly, which is adapter-only
// (spec §7o; enforced by `test-integration.mjs`'s EMS-call-site contract, `emsCallSites()` in
// scripts/integration-map.mjs). The gateway's REST adapter still goes through that same
// queue-aware write underneath (`bridge.ts:91` → `emsWriteOrQueue`, `13-ems.js:293`) — no new
// write path, just the typed door in front of it.
import { emsGateway } from '@/lib/ems/gateway';
import { EMS_CLOSED } from '@/lib/emsTasks';
import { dm, israelParts } from '@/lib/field';

/**
 * Who may close an EMS task with one click during the meeting (M-R8). This is a CLIENT-SIDE
 * convenience gate only — it decides who sees the two bubbles, nothing more. The real
 * permission gate is EMS itself: the write this button fires is exactly the request that
 * person's own EMS session is already allowed to make (`addComment` / `updateTask` under
 * their own auth), so a name here with no matching EMS permission simply gets EMS's own
 * rejection back through the normal `queued`/`error` path — no new server-side check is
 * needed or added by this list (Opus round-5 audit, M-U: "CLOSERS client-only").
 */
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
  /** Commits in `delayMs` (default 5000). Returns the undo — call it inside the window to
   *  cancel. The undo itself returns whether it actually cancelled anything: `false` means the
   *  write already committed (a `flush()` beat it, or the timer already fired) and undoing is
   *  no longer possible — the caller must not tell the person it worked when it didn't
   *  (Opus round-5 audit, M-U item 1: "undo lies after flush"). */
  schedule(p: PendingClose): () => boolean;
  /**
   * Commit everything still pending, right now (pagehide / leaving the kibbutz / exit) —
   * SYNCHRONOUSLY. Opus round-6 audit (data-loss item): this used to `await send(...)`, the
   * SAME network path a normal 5 s settle uses — on a real `pagehide` the tab can die before
   * that promise ever resolves, and both the comment and the status write (and every OTHER
   * still-pending close) are lost with it. `flush()` now pushes the comment + status as two
   * independent entries straight into the existing EMS offline queue (13-ems.js's
   * `emsQueueLocalPush`, drained on the next connect/load) before returning — no `await`
   * anywhere in this function, so every entry is written before the calling code (or the page)
   * can go away. The worst case (a task someone else already closed) replays one harmless extra
   * "נסגר בישיבת צוות" comment, not a lost close. A normal (non-flush) settle is unaffected —
   * it still goes out live through `send`/the typed gateway. */
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
  send: (p: PendingClose, opts?: { skipReread?: boolean }) => Promise<SendResult>;
  /** Synchronous, network-free enqueue — used ONLY by `flush()`. See `queueCloseOffline`
   *  below (the real implementation, behind the typed gateway) and the note on `flush()`. */
  queueOffline: (p: PendingClose) => void;
  delayMs?: number;
  onSettled?: (p: PendingClose, r: SendResult) => void;
}): CloseQueue {
  const delayMs = deps.delayMs ?? 5000;
  const queue = new Map<string, { p: PendingClose; timer: ReturnType<typeof setTimeout> }>();

  async function commit(taskId: string, opts?: { skipReread?: boolean }): Promise<void> {
    const entry = queue.get(taskId);
    if (!entry) return;
    queue.delete(taskId);
    const r = await deps.send(entry.p, opts);
    deps.onSettled?.(entry.p, r);
  }

  function schedule(p: PendingClose): () => boolean {
    const existing = queue.get(p.taskId);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => { void commit(p.taskId); }, delayMs);
    queue.set(p.taskId, { p, timer });
    return () => {
      const e = queue.get(p.taskId);
      if (e && e.p === p) { clearTimeout(e.timer); queue.delete(p.taskId); return true; }
      return false;
    };
  }

  // NOT `async` on purpose (Opus round-6 audit): an `async function` still returns a Promise
  // and still lets its body suspend at an `await` — the whole point here is that the body
  // below contains NONE, so every `queueOffline` call has already run, synchronously, by the
  // time this function returns (verified by the unit test: 3 pending → 6 entries written
  // "before any promise resolves"). `Promise.resolve()` at the end keeps the same `Promise<void>`
  // signature the interface (and every existing caller's `await closeQueue.flush()`) expects.
  function flush(): Promise<void> {
    const ids = [...queue.keys()];
    for (const id of ids) {
      const e = queue.get(id);
      if (!e) continue;
      clearTimeout(e.timer);
      queue.delete(id);
      deps.queueOffline(e.p);
      deps.onSettled?.(e.p, { sent: false, queued: true });
    }
    return Promise.resolve();
  }

  function pending(): PendingClose[] {
    return [...queue.values()].map(e => e.p);
  }

  return { schedule, flush, pending };
}

/**
 * The actual send, behind the typed gateway ONLY (never called from a test with real EMS
 * reachable — see meetingClose.test.ts). Re-reads the task first: a second presenter's click on
 * an already-closed task is a no-op, not a duplicate comment (review focus #4). `getTask` itself
 * can throw when offline (a network error, not a "not found") — that must NOT abort the close;
 * it falls through to the writes below exactly as a null/not-found task does, and `addComment` /
 * `updateTask` queue it for the next connect (review focus #2). The comment goes out before the
 * status, same order `pushVisitToEms` uses (`14-calendar.js:294`); a real rejection on the
 * comment stops before the status write, so a task is never left with a status change but no
 * explanatory comment.
 */
/**
 * The real `queueOffline` dependency `createCloseQueue`'s `flush()` uses — behind the typed
 * gateway ONLY (`emsGateway().queueOffline`, never `sigma.emsQueueLocalPush` directly), same
 * rule as `sendClose` below. Pushes the comment and the status as TWO INDEPENDENT entries (not
 * one combined item): `emsQueueFlush` (13-ems.js, drains on the next connect) replays each queue
 * entry as its own EMS call, exactly how `sendClose` fires them as two separate gateway writes,
 * so a queued close replays byte-identically to a live one.
 */
export function queueCloseOffline(p: PendingClose): void {
  const gw = emsGateway();
  gw.queueOffline({ kind: 'comment', taskId: p.taskId, message: closeComment(p.by, p.at) });
  gw.queueOffline({ kind: 'status', taskId: p.taskId, status: p.status });
}

export async function sendClose(p: PendingClose, opts: { skipReread?: boolean } = {}): Promise<SendResult> {
  let task: { status: string } | null = null;
  if (!opts.skipReread) {
    try { task = await emsGateway().getTask(p.taskId); } catch { /* offline — proceed to the queued writes */ }
  }
  if (task && EMS_CLOSED.includes(task.status)) return { sent: false, skipped: 'already-closed' };

  const commentRes = await emsGateway().addComment(p.taskId, closeComment(p.by, p.at));
  if (commentRes.error) return { sent: false, error: commentRes.error };

  const statusRes = await emsGateway().updateTask(p.taskId, { status: p.status });
  if (statusRes.error) return { sent: false, error: statusRes.error };

  return { sent: !!(commentRes.sent && statusRes.sent), queued: !!(commentRes.queued || statusRes.queued) };
}
