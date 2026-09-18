// supabase-js for the React islands. The anon key is PUBLIC (RLS is on for every table) and
// is the same pair the legacy bundle uses — js/src/01-data.js. No secret here.
//
// The library itself (~120 kB) is loaded on FIRST USE, not at boot: the nav and the toaster
// never touch Supabase, and a field phone should not pay for it before a data island mounts.
//
// AUTH. Reads work anon; every WRITE needs the `authenticated` pass the EMS session mints
// (js/src/01-data.js `baseH()` does exactly this for the legacy writes). We do NOT use
// auth.setSession for it: that pass has no refresh token, so setSession answers
// AuthSessionMissingError — returned as `{error}`, easy to swallow — and the write then goes
// out anon and RLS denies it even though the user IS logged in. Instead the client is created
// with supabase-js's `accessToken` hook, which is asked for the bearer value on EVERY
// request, so a pass minted (or re-minted, or expired) mid-session is picked up with no
// client rebuild and no listener to keep in sync.
import type { SupabaseClient } from '@supabase/supabase-js';
import { mockModeAllowed, notifySessionExpired } from './session';

export const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
export const SB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';

export interface SbPass { token?: string | null; exp?: number | null }

/**
 * The bearer value for one request: the EMS-minted JWT while it is still valid, the anon key
 * otherwise. Pure, and the same rule as `baseH()` in js/src/01-data.js.
 */
export function sbBearer(pass: SbPass | null | undefined, now: number = Date.now()): string {
  const token = pass && pass.token;
  const exp = (pass && pass.exp) || 0;
  return token && exp > now ? token : SB_ANON;
}

/** The current pass, read through the bridge. Never mints — this runs on every request. */
function currentPass(): SbPass | null {
  try { return ((window as any).sigma?.sbPass?.() as SbPass) || null; }
  catch { return null; }
}

/**
 * The bearer for one request, MINTING one first if the sign-in is live but the pass has
 * lapsed (spec §7n). Reads need it now too — the business tables are authenticated-only — and
 * `accessToken` is async, so a first paint right after boot waits for the pass instead of
 * going out anon and coming back empty. `sigma.sbAuthPass` is single-flight, so a screen that
 * fires eight reads mints once.
 */
async function bearerForRequest(): Promise<string> {
  const pass = currentPass();
  if (pass && pass.token && (pass.exp || 0) > Date.now()) return pass.token;
  const s = (window as any).sigma;
  try {
    if (s?.isEmsConnected?.()) {
      const minted = (await s.sbAuthPass?.(false)) as SbPass | null;
      if (minted && minted.token) return minted.token;
    }
  } catch { /* no EMS session — go out anon and let RLS answer */ }
  return SB_ANON;
}

/**
 * THE interceptor (spec §7n). Every supabase-js request — read, write and RPC alike — goes
 * through this fetch, so a `401` / `PGRST301` anywhere lands in the one debounced funnel that
 * raises the re-login sheet. No per-island error handling, no per-page toast.
 *
 * `?login=0` on a host allowed to mock is the exception: there the 401s are the test harness
 * (qa/playwright/tests/_helpers.ts answers every write with 42501 on purpose), not an expiry.
 */
export async function sessionAwareFetch(input: any, init?: any): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 || res.status === 403) {
    const mock = mockModeAllowed(location.hostname, location.search);
    if (!mock) {
      // The body is read from a CLONE: the caller still gets an unread stream.
      let code = '';
      try { code = String(((await res.clone().json()) as any)?.code || ''); } catch { /* not json */ }
      if (res.status === 401 || code === 'PGRST301' || code === '42501') {
        notifySessionExpired('sb-' + res.status + (code ? ':' + code : ''));
      }
    }
  }
  return res;
}

let clientPromise: Promise<SupabaseClient> | null = null;

/** The shared client. Imports supabase-js on the first call. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SB_URL, SB_ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
        accessToken: async () => await bearerForRequest(),
        global: { fetch: sessionAwareFetch as any },
      } as any),
    );
  }
  return clientPromise;
}

/**
 * A 401 / 42501 / RLS rejection — the write went out anon because there was no live pass.
 * PostgREST reports it either in the message or only in `code`, so both are checked; a
 * schema error (PGRST204) must NOT match, or a missing column would be retried as auth.
 */
export function isAuthError(e: unknown): boolean {
  const err = e as any;
  const code = String(err?.code ?? '');
  if (code === '42501' || code === '401' || code === 'PGRST301') return true;
  // "No suitable key or wrong key type" = a corrupt / foreign pass actually reached the
  // server (seen in the browser smoke); that is still auth, and a forced re-mint is the
  // right recovery.
  return /row-level security|42501|\b401\b|JWT|suitable key|wrong key type/i
    .test(String(err?.message ?? err ?? ''));
}

/**
 * An UPDATE that matched nothing. Under RLS an unauthorised update is not an error — it
 * simply touches zero rows, and `.single()` then answers PGRST116 ("Cannot coerce the result
 * to a single JSON object"). For a row the island just read and is editing, that means the
 * pass was missing, not that the row vanished — so it is retried and reported as auth.
 * Only ever consulted for writes (sbWrite); a READ of a missing row is a legitimate PGRST116.
 */
function isSilentRlsNoop(e: unknown): boolean {
  const err = e as any;
  return String(err?.code ?? '') === 'PGRST116'
    || /coerce the result to a single JSON object/i.test(String(err?.message ?? ''));
}

/** Everything that means "this write did not happen because we were not authenticated". */
export function isWriteBlocked(e: unknown): boolean {
  return isAuthError(e) || isSilentRlsNoop(e);
}

export const EMS_LOGIN_REQUIRED = 'יש להתחבר ל-EMS כדי לשמור';

/**
 * Run a write with the legacy retry contract: mint the pass first, one FORCED re-mint if the
 * write was blocked, then a clear "log in to EMS" message instead of the raw Postgres error.
 */
export async function sbWrite<T>(
  run: (sb: SupabaseClient) => PromiseLike<{ data: T | null; error: any }>,
): Promise<T | null> {
  const sb = await getSupabase();
  const mint = async (force: boolean) => {
    try { await (window as any).sigma?.sbAuthPass?.(force); } catch { /* no EMS session */ }
  };

  await mint(false);
  let res = await run(sb);
  if (res.error && isWriteBlocked(res.error)) {
    await mint(true);
    res = await run(sb);
  }
  if (res.error) {
    throw new Error(isWriteBlocked(res.error) ? EMS_LOGIN_REQUIRED : (res.error.message || String(res.error)));
  }
  return res.data;
}
