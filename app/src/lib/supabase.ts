// supabase-js client for the React islands. The anon key is PUBLIC (RLS is on for every
// table) and is the same pair the legacy bundle uses — js/src/01-data.js. No secret here.
import { createClient } from '@supabase/supabase-js';

export const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
export const SB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';

export const supabase = createClient(SB_URL, SB_ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Legacy mints an "authenticated" bridge pass (window._sbToken) for writes. When one is
 * present, hand it to supabase-js so island writes are authenticated exactly like legacy ones.
 */
export function adoptLegacyBridgePass(): void {
  const token = (window as any)._sbToken as string | undefined;
  const exp = (window as any)._sbTokenExp as number | undefined;
  if (!token || !exp || exp <= Date.now()) return;
  supabase.auth.setSession({ access_token: token, refresh_token: '' } as any).catch(() => { /* anon is fine for reads */ });
}
