// Session & access rule (spec §7n): nothing is rendered without a live EMS login, and an
// expiry is ONE experience for the whole app instead of a per-page error.
//
// Three pieces, all pure at the core so they are testable without a browser:
//   gateState()            what an island should render right now
//   shouldEmitExpiry()     the debounce rule — many concurrent 401s are ONE expiry
//   notifySessionExpired() the single funnel both React and legacy 401 handlers call
//
// The canonical debouncer lives in the legacy bundle (js/src/00-bridge.js
// `window.sigmaSessionExpired`), which is always loaded before this module, so a legacy 401
// and an island 401 arriving together still produce one event. The local debounce here is the
// fallback for a page without the legacy bundle (and for the unit tests).
import { useEffect, useState } from 'react';
import { useCurrentUser, useEmsConnected } from '@/bridge';

/**
 * The bus, read LIVE rather than captured at import time: js/src/00-bridge.js creates it
 * before this bundle loads, but a test (and a page that reloads the legacy bundle) replaces
 * the object, and a captured reference would then dispatch into nothing.
 */
function bus(): EventTarget | undefined {
  return (window as any).sigmaBus as EventTarget | undefined;
}

/** The one bus event for "the session is gone" (docs/integration-map.md). */
export const SESSION_EXPIRED = 'session-expired';

/** Inside this window every further 401 belongs to the same expiry. */
export const EXPIRY_DEBOUNCE_MS = 4000;

/** The one key js/src/11-search-login.js stores a completed sign-in under. */
export const AUTH_KEY = 'dashboard_auth_v4';

/**
 * Where `?login=0` (mock data, no sign-in) may be honoured: a developer machine and the
 * githack branch previews. The live origin (pm-sigma.github.io) ignores it — a query
 * parameter must never be able to open the app's data on the real site.
 */
export function mockHostAllowed(hostname: string): boolean {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
  if (h.endsWith('.localhost')) return true;
  return h === 'githack.com' || h.endsWith('.githack.com');
}

/** `?login=0` asked for, AND this host is allowed to grant it. */
export function mockModeAllowed(hostname: string, search: string): boolean {
  const asked = /(^|[?&])login=0(&|$)/.test(String(search || ''));
  return asked && mockHostAllowed(hostname);
}

export type GateState =
  /** a live EMS session — render the content */
  | 'open'
  /** `?login=0` on a host allowed to mock — render the content against fixtures */
  | 'mock'
  /** view-only entry (no EMS account by design) — render the content read-only */
  | 'viewer'
  /** signed in earlier, the session is gone — render the sign-in card */
  | 'expired'
  /** never signed in on this device — render the sign-in card */
  | 'locked';

export interface GateInput {
  emsConnected: boolean;
  /** A completed sign-in is remembered on the device, which is what separates expired from never. */
  everSignedIn: boolean;
  role: string;
  hostname: string;
  search: string;
}

/** What an island should render. Pure — the hook below feeds it the live values. */
export function gateState(i: GateInput): GateState {
  if (mockModeAllowed(i.hostname, i.search)) return 'mock';
  if (i.emsConnected) return 'open';
  if (i.role === 'viewer') return 'viewer';
  return i.everSignedIn ? 'expired' : 'locked';
}

/** Content, or the sign-in card. */
export function isGateOpen(state: GateState): boolean {
  return state === 'open' || state === 'mock' || state === 'viewer';
}

/** True when this 401 starts a NEW expiry rather than joining the one in flight. */
export function shouldEmitExpiry(
  lastAt: number | null | undefined,
  now: number,
  windowMs: number = EXPIRY_DEBOUNCE_MS,
): boolean {
  if (!lastAt) return true;
  return now - lastAt >= windowMs;
}

// ───────────────────────── the funnel ─────────────────────────

let localLastAt: number | null = null;

/** Test seam: forget the local debounce state. */
export function resetExpiryDebounce(): void {
  localLastAt = null;
}

/**
 * One 401 anywhere → at most one `session-expired`. Called by lib/supabase.ts, by the
 * legacy `emsApi` (through the bridge) and by the legacy REST reads.
 */
export function notifySessionExpired(reason = 'unknown'): boolean {
  const bridged = (window as any).sigmaSessionExpired as undefined | ((r?: string) => boolean);
  if (typeof bridged === 'function') {
    try { return !!bridged(reason); } catch { /* fall through to the local path */ }
  }
  const now = Date.now();
  if (!shouldEmitExpiry(localLastAt, now)) return false;
  localLastAt = now;
  try {
    bus()?.dispatchEvent(new CustomEvent(SESSION_EXPIRED, { detail: { reason } }));
  } catch { /* no bus on this page */ }
  return true;
}

// ───────────────────────── the hooks ─────────────────────────

function everSignedIn(): boolean {
  try { return localStorage.getItem(AUTH_KEY) === 'ok'; } catch { return false; }
}

/** The live gate state, re-read whenever the connection or the person changes. */
export function useEmsGate(): GateState {
  const connected = useEmsConnected();
  const { role } = useCurrentUser();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const b = bus();
    if (!b) return;
    const fn = () => setTick(t => t + 1);
    b.addEventListener(SESSION_EXPIRED, fn);
    return () => b.removeEventListener(SESSION_EXPIRED, fn);
  }, []);
  void tick;
  return gateState({
    emsConnected: connected,
    everSignedIn: everSignedIn(),
    role: String(role || ''),
    hostname: location.hostname,
    search: location.search,
  });
}

/** Ask the legacy gate to sign in again, keeping the page, the scroll and any open draft. */
export function beginReLogin(): void {
  const fn = (window as any).sigmaBeginReLogin as undefined | (() => void);
  if (typeof fn === 'function') { fn(); return; }
  try { (window as any).sigma?.toast?.('פתח את המסך מחדש כדי להתחבר'); } catch { /* no bridge */ }
}
