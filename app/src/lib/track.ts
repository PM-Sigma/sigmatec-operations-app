// Usage tracking (spec §7j). The rules, all of them load-bearing:
//   • PII-light — person name, page, action, target, timestamp. NEVER free text a user typed.
//     The ONE exception is the failed kibbutz search term, which §7j asks for by name
//     ("לא נמצאו: 'גשר'") and which is a kibbutz name, not personal content. Capped at 40 chars.
//   • Buffered, flushed every 10 s and on pagehide / visibilitychange, as ONE bulk insert.
//   • DROPPED SILENTLY when offline or unauthenticated. Analytics must never block the UI,
//     never retry in a loop, never warn at the user, and never hold a page unload open.
//
// ONE queue, two writers. Legacy modules push into `window.__sigmaTrack` through the bridge
// (js/src/00-bridge.js — it stamps person/page/at and knows nothing about Supabase); this
// module drains that array into its own buffer and owns the only insert. If ui/sigma.js never
// loads, the array simply caps out and the events are lost — the intended failure mode.
import { type UsageEvent } from './usageNarrative';

export const FLUSH_MS = 10_000;
/** Buffer size that forces a flush before the timer comes round. */
export const FLUSH_AT = 40;
/** Hard cap; over it the OLDEST event is dropped (a stuck tab must not grow without bound). */
export const MAX_BUFFER = 200;
/** Longest field we ever store — a target is a name or an id, never prose. */
export const MAX_TARGET = 40;

export type FlushReason = 'timer' | 'pagehide' | 'queued';
export type FlushVerdict = 'flush' | 'wait' | 'drop';

export interface FlushState {
  buffered: number;
  msSinceOldest: number;
  online: boolean;
  authenticated: boolean;
  reason: FlushReason;
}

/**
 * The whole flush decision, as a pure function (goldens in track.test.ts).
 * 'drop' means "throw the buffer away" — offline or unauthenticated analytics is not worth a
 * retry queue, and keeping it would leak a person's activity into the next session's insert.
 */
export function flushPolicy(s: FlushState): FlushVerdict {
  if (s.buffered <= 0) return 'wait';
  if (!s.online || !s.authenticated) return 'drop';
  if (s.reason === 'pagehide') return 'flush';
  if (s.buffered >= FLUSH_AT) return 'flush';
  if (s.msSinceOldest >= FLUSH_MS) return 'flush';
  return 'wait';
}

export interface TrackerDeps {
  insert: (rows: UsageEvent[]) => Promise<void>;
  now: () => number;
  online: () => boolean;
  authenticated: () => boolean;
  /** stamped onto every row at flush time — constant for the life of the tab */
  session: () => string;
  device: () => string;
}

export interface Tracker {
  push: (e: UsageEvent) => void;
  /** Drain + decide + (maybe) insert. Returns what the policy said, for tests and for tick(). */
  tick: (reason: FlushReason) => Promise<FlushVerdict>;
  readonly size: number;
  readonly dropped: number;
}

/** The buffer + the policy, with every side effect injected. The real wiring is below. */
export function createTracker(deps: TrackerDeps): Tracker {
  let buffer: UsageEvent[] = [];
  let oldest = 0;
  let dropped = 0;

  const push = (e: UsageEvent) => {
    if (!e || !e.action) return;
    if (!buffer.length) oldest = deps.now();
    if (buffer.length >= MAX_BUFFER) { buffer.shift(); dropped++; }
    buffer.push(e);
  };

  const tick = async (reason: FlushReason): Promise<FlushVerdict> => {
    const verdict = flushPolicy({
      buffered: buffer.length,
      msSinceOldest: buffer.length ? deps.now() - oldest : 0,
      online: deps.online(),
      authenticated: deps.authenticated(),
      reason,
    });
    if (verdict === 'wait') return verdict;
    const rows = buffer;
    buffer = [];
    if (verdict === 'drop') { dropped += rows.length; return verdict; }
    const session = deps.session(), device = deps.device();
    try {
      await deps.insert(rows.map(r => ({ ...r, session_id: r.session_id || session, device: r.device || device })));
    } catch {
      // A failed insert is a dropped insert. Re-buffering would retry forever on a 401 and
      // would eventually push the same rows twice — analytics is not worth either.
      dropped += rows.length;
    }
    return verdict;
  };

  return { push, tick, get size() { return buffer.length; }, get dropped() { return dropped; } };
}

// ───────────────────────── the live tracker ─────────────────────────

/** The shared legacy→React queue. The bridge creates it; we tolerate being first. */
function queue(): UsageEvent[] {
  const w = window as any;
  if (!Array.isArray(w.__sigmaTrack)) w.__sigmaTrack = [];
  return w.__sigmaTrack as UsageEvent[];
}

/** Per-tab id. sessionStorage so a reload starts a new session, which is what a "session" means here. */
function sessionId(): string {
  try {
    const k = 'sigma_usage_session';
    let v = sessionStorage.getItem(k);
    if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem(k, v); }
    return v;
  } catch { return 'no-storage'; }
}

/** 'phone' | 'desktop' — a form-factor bucket, never a user agent string. */
function device(): string {
  try { return window.innerWidth < 768 ? 'phone' : 'desktop'; } catch { return ''; }
}

let live: Tracker | null = null;
let timer: number | null = null;

function tracker(): Tracker {
  if (live) return live;
  live = createTracker({
    insert: async rows => {
      // Imported HERE, not at module scope: this module is in the boot bundle (islands.tsx
      // tracks every mount), and the boot bundle must not carry supabase-js — the contract
      // test-sigma-shell.mjs enforces. The first flush is the first time we need it.
      const { getSupabase } = await import('./supabase');
      const sb = await getSupabase();
      const { error } = await sb.from('usage_events').insert(rows as any);
      if (error) throw error;
    },
    now: () => Date.now(),
    online: () => { try { return navigator.onLine !== false; } catch { return true; } },
    // The EMS-minted pass, as it stands. We never MINT for analytics — minting is a network
    // round trip a background flush has no business triggering.
    authenticated: () => { try { return !!(window as any).sigma?.sbPass?.(); } catch { return false; } },
    session: sessionId,
    device,
  });
  return live;
}

function drain(): void {
  const q = queue();
  if (!q.length) return;
  const t = tracker();
  for (const e of q.splice(0, q.length)) t.push(e);
}

/** Flush now (fire and forget — nothing awaits analytics). */
export function flushNow(reason: FlushReason = 'timer'): void {
  drain();
  void tracker().tick(reason).catch(() => { /* analytics never surfaces an error */ });
}

/**
 * The React-side `track()`. Same shape as the bridge's, so an island can call either; both
 * land in the one queue. `page` defaults to the page legacy says is on screen.
 */
export function track(action: string, target?: string | null, page?: string | null): void {
  try {
    if (!action) return;
    const w = window as any;
    // The bridge is the single stamping point when it is there — one definition of "who/where".
    if (typeof w.sigmaTrack === 'function') { w.sigmaTrack(action, target, page); return; }
    queue().push({
      person: (w.sigma?.getCurrentUser?.() || '') || null,
      page: page ?? (w._currentPage || null),
      action,
      target: target == null ? null : String(target).slice(0, MAX_TARGET),
      at: new Date().toISOString(),
    });
  } catch { /* tracking never throws at the caller */ }
}

/** Track once when an island mounts (spec §7j: "island mounts" are instrumented). */
export function trackMount(island: string): void {
  track('mount', island);
}

/** Install the flush loop. Called once from main.tsx boot. Idempotent. */
export function startTracking(): void {
  const w = window as any;
  if (w.__sigmaTrackStarted) return;
  w.__sigmaTrackStarted = true;
  timer = window.setInterval(() => flushNow('timer'), FLUSH_MS);
  // pagehide is the only reliable "the tab is going away" on iOS Safari; visibilitychange
  // covers the PWA being backgrounded, which on a field phone is the common case.
  window.addEventListener('pagehide', () => flushNow('pagehide'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow('pagehide');
  });
}

/** Test-only: forget the live tracker and the flush loop. */
export function _resetTracking(): void {
  if (timer != null) { clearInterval(timer); timer = null; }
  live = null;
  try { delete (window as any).__sigmaTrackStarted; } catch { /* noop */ }
}
