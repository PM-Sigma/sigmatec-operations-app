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
  /** a live session — an EMS sign-in, or the view-only entry: both hold a write pass */
  | 'open'
  /** `?login=0` on a host allowed to mock — render the content against fixtures */
  | 'mock'
  /** the pass is being minted (a cold boot) — render the content, the queries wait for it */
  | 'pending'
  /** signed in earlier, the session is gone — render the sign-in card */
  | 'expired'
  /** never signed in on this device — render the sign-in card */
  | 'locked';

export interface GateInput {
  emsConnected: boolean;
  /**
   * A valid write pass is in hand. Since review fix 2 the view-only entry mints one too (the
   * access code is checked by `ems-auth`), so "has a pass" is the one rule for every role —
   * a viewer used to be waved through with no pass at all and then read empty screens.
   */
  hasPass: boolean;
  /** The mint is in flight: a cold boot, not a closed gate. */
  passPending: boolean;
  /** A completed sign-in is remembered on the device, which is what separates expired from never. */
  everSignedIn: boolean;
  role: string;
  hostname: string;
  search: string;
}

/** What an island should render. Pure — the hook below feeds it the live values. */
export function gateState(i: GateInput): GateState {
  if (mockModeAllowed(i.hostname, i.search)) return 'mock';
  if (i.emsConnected || i.hasPass) return 'open';
  if (i.passPending && i.everSignedIn) return 'pending';
  return i.everSignedIn ? 'expired' : 'locked';
}

/** Content, or the sign-in card. */
export function isGateOpen(state: GateState): boolean {
  return state === 'open' || state === 'mock' || state === 'pending';
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

function passNow(): { hasPass: boolean; passPending: boolean } {
  const s = (window as any).sigma;
  let hasPass = false;
  let passPending = false;
  try { hasPass = !!s?.sbPass?.(); } catch { /* no bridge */ }
  try { passPending = !!s?.passPending?.(); } catch { /* no bridge */ }
  return { hasPass, passPending };
}

/**
 * The live gate state. Re-read on the person / connection / expiry events — and, while the
 * pass is being minted, on a short poll: the mint is a promise in the legacy bundle, not an
 * event, and a cold boot must flip to content the moment it lands (review fix 1).
 */
export function useEmsGate(): GateState {
  const connected = useEmsConnected();
  const { role } = useCurrentUser();
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);
  useEffect(() => {
    const b = bus();
    const fn = () => bump();
    b?.addEventListener(SESSION_EXPIRED, fn);
    // asking the bridge to start the mint is free once it is done (the promise is memoized)
    try { void (window as any).sigma?.ensurePass?.().then(fn).catch(fn); } catch { /* no bridge */ }
    // A safety tick ONLY while the mint is in flight — the promise above is the normal path,
    // and this covers a mint started by someone else (a legacy read) before this island mounted.
    let poll: ReturnType<typeof setInterval> | null = null;
    if (passNow().passPending) {
      poll = setInterval(() => {
        if (!passNow().passPending && poll) { clearInterval(poll); poll = null; }
        bump();
      }, 500);
    }
    return () => {
      b?.removeEventListener(SESSION_EXPIRED, fn);
      if (poll) clearInterval(poll);
    };
  }, []);
  const { hasPass, passPending } = passNow();
  return gateState({
    emsConnected: connected,
    hasPass,
    passPending,
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

// ───────────────────────── the freeze rule (spec 2026-09-23 ems-session) ─────────────────────────
// עידן, 23.9: every user except the viewer signs in WITH his EMS user and the app is connected
// from then on. There is no "connect to EMS" step anywhere. When the connection lapses the app
// freezes behind ONE blocking re-login and continues where the person was afterwards.

/** The one sentence a surface shows when a call failed because the session lapsed. */
export const SESSION_LOST_MSG = 'ההתחברות פגה. צריך להתחבר מחדש';

export interface ExpiryInput {
  role: string;
  /** `?login=0` on a host allowed to mock, or a public cert link: never freeze. */
  mock: boolean;
  certView?: boolean;
  /** A completed sign-in is remembered on the device (separates "expired" from "never"). */
  everSignedIn: boolean;
  /** The EMS session token is present (a pass can be re-minted from it). */
  emsTokenLive: boolean;
  /** Supabase bridge pass expiry, epoch ms (0 = none). */
  passExp: number;
  /** The pass mint is in flight — a cold boot, not an expiry. */
  passPending?: boolean;
  now: number;
  /** When deciding about a response: its HTTP status and PostgREST code. */
  status?: number;
  code?: string;
}

export type ExpiryDecision = 'ok' | 'remint' | 'freeze';

/**
 * Pure: is the session still good, renewable without the person, or gone (freeze the app)?
 * The viewer is out of scope (PIN entry, no EMS user) and never freezes here.
 */
export function expiryDecision(i: ExpiryInput): ExpiryDecision {
  if (i.mock || i.certView) return 'ok';
  if (String(i.role || '') === 'viewer') return 'ok';
  if (i.passPending) return 'ok';
  if (i.status !== undefined) {
    const expired = i.status === 401 ? i.code !== '42501' : (i.status === 403 && i.code === 'PGRST301');
    if (!expired) return 'ok';
    return i.emsTokenLive ? 'remint' : 'freeze';
  }
  if (!i.everSignedIn) return 'ok';            // never signed in: the login gate owns it
  if (!i.emsTokenLive) return 'freeze';        // the EMS session is gone: nothing to renew from
  if (!i.passExp || i.passExp <= i.now) return 'remint';
  return 'ok';
}

/** The gate says "expired" for a staff user → the app freezes (no per-surface sign-in card). */
export function shouldFreeze(state: GateState, role: string): boolean {
  return state === 'expired' && String(role || '') !== 'viewer';
}

/** Read the live inputs and decide. Browser-only. */
export function liveExpiryDecision(): ExpiryDecision {
  const s = (window as any).sigma;
  let role = '';
  let emsTokenLive = false;
  let passExp = 0;
  try { role = String(localStorage.getItem('dashboard_role_v1') || s?.getCurrentRole?.() || ''); } catch { /* none */ }
  try { emsTokenLive = !!s?.emsToken?.(); } catch { /* none */ }
  try { passExp = Number(s?.sbPass?.()?.exp || (window as any)._sbTokenExp || 0); } catch { /* none */ }
  return expiryDecision({
    role,
    mock: mockModeAllowed(location.hostname, location.search),
    certView: !!(window as any)._certViewMode,
    everSignedIn: everSignedIn(),
    emsTokenLive,
    passExp,
    passPending: !!(window as any)._sbPassPending,
    now: Date.now(),
  });
}

/** A surface found no session: freeze the app (one sheet) and hand back the sentence to show. */
export function sessionLost(reason = 'no-session'): Error {
  if (!mockModeAllowed(location.hostname, location.search)) notifySessionExpired(reason);
  return Object.assign(new Error(SESSION_LOST_MSG), { sessionLost: true });
}
