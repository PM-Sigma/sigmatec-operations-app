// supabase-js for the React islands. The anon key is PUBLIC (RLS is on for every table) and
// is the same pair the legacy bundle uses — js/src/01-data.js. No secret here.
//
// The library itself (~120 kB) is loaded on FIRST USE, not at boot: the nav and the toaster
// never touch Supabase, and a field phone should not pay for it before a data island mounts.
import type { SupabaseClient } from '@supabase/supabase-js';

export const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
export const SB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';

let clientPromise: Promise<SupabaseClient> | null = null;

/** The shared client. Imports supabase-js on the first call and adopts the legacy write pass. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(async ({ createClient }) => {
      const client = createClient(SB_URL, SB_ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Legacy mints an "authenticated" bridge pass (window._sbToken) for writes; with one in
      // hand, island writes are authenticated exactly like legacy ones. Reads work anon.
      const token = (window as any)._sbToken as string | undefined;
      const exp = (window as any)._sbTokenExp as number | undefined;
      if (token && exp && exp > Date.now()) {
        try { await client.auth.setSession({ access_token: token, refresh_token: '' } as any); } catch { /* anon */ }
      }
      return client;
    });
  }
  return clientPromise;
}

/** A 401 / 42501 / RLS rejection — the bridge pass lapsed and the write went out as anon. */
export function isAuthError(e: unknown): boolean {
  return /row-level security|42501|401|JWT/i.test(String((e as any)?.message ?? e ?? ''));
}

/** The shared client with a FRESH authenticated bridge pass on it (anon is read-only). */
export async function authedSupabase(force = false): Promise<SupabaseClient> {
  const client = await getSupabase();
  try {
    const pass = await (window as any).sigma?.sbAuthPass?.(force);
    if (pass && pass.token) {
      await client.auth.setSession({ access_token: pass.token, refresh_token: '' } as any);
    }
  } catch { /* no EMS session — the write will fail with a clear message below */ }
  return client;
}

export const EMS_LOGIN_REQUIRED = 'יש להתחבר ל-EMS כדי לשמור';

/**
 * Run a write with the legacy retry contract: one forced re-mint of the pass on an RLS/401
 * rejection, then a clear "log in to EMS" message instead of the raw Postgres error.
 */
export async function sbWrite<T>(
  run: (sb: SupabaseClient) => PromiseLike<{ data: T | null; error: any }>,
): Promise<T | null> {
  let res = await run(await authedSupabase());
  if (res.error && isAuthError(res.error)) res = await run(await authedSupabase(true));
  if (res.error) throw new Error(isAuthError(res.error) ? EMS_LOGIN_REQUIRED : (res.error.message || String(res.error)));
  return res.data;
}
