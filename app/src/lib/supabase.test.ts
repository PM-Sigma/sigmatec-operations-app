// The Authorization bearer rule for island requests. Getting this wrong is invisible at
// runtime — the request simply goes out anon and RLS answers "row violates row-level
// security policy", which reads like a permissions bug rather than an auth one.
import { describe, it, expect } from 'vitest';
import { sbBearer, isAuthError, isWriteBlocked, SB_ANON } from './supabase';

const NOW = 1_700_000_000_000;
const JWT = 'eyJhbGciOi.MINTED-BY-EMS.sig';

describe('sbBearer', () => {
  it('uses the EMS-minted pass while it is valid', () => {
    expect(sbBearer({ token: JWT, exp: NOW + 60_000 }, NOW)).toBe(JWT);
  });

  it('falls back to the anon key when there is no pass', () => {
    expect(sbBearer(null, NOW)).toBe(SB_ANON);
    expect(sbBearer(undefined, NOW)).toBe(SB_ANON);
    expect(sbBearer({}, NOW)).toBe(SB_ANON);
    expect(sbBearer({ token: '', exp: NOW + 60_000 }, NOW)).toBe(SB_ANON);
  });

  it('falls back to the anon key once the pass has expired', () => {
    expect(sbBearer({ token: JWT, exp: NOW - 1 }, NOW)).toBe(SB_ANON);
    expect(sbBearer({ token: JWT, exp: NOW }, NOW)).toBe(SB_ANON);   // exp === now is spent
    expect(sbBearer({ token: JWT, exp: 0 }, NOW)).toBe(SB_ANON);
    expect(sbBearer({ token: JWT }, NOW)).toBe(SB_ANON);
  });
});

describe('isAuthError', () => {
  it('recognises the shapes an anon write comes back as', () => {
    expect(isAuthError(new Error('new row violates row-level security policy for table "kibbutzim"'))).toBe(true);
    expect(isAuthError({ message: 'permission denied', code: '42501' })).toBe(true);
    expect(isAuthError('supabase upsert kibbutzim 401')).toBe(true);
    expect(isAuthError(new Error('JWT expired'))).toBe(true);
    expect(isAuthError({ message: 'JWSError', code: 'PGRST301' })).toBe(true);
    // a corrupt / foreign pass actually reaching the server — seen in the browser smoke
    expect(isAuthError({ message: 'No suitable key or wrong key type' })).toBe(true);
  });

  it('leaves a real schema error alone, so it is not retried as an auth problem', () => {
    expect(isAuthError({ message: "Could not find the 'ems_params' column", code: 'PGRST204' })).toBe(false);
    expect(isAuthError(new Error('duplicate key value violates unique constraint'))).toBe(false);
  });
});

describe('isWriteBlocked', () => {
  it('counts the silent RLS no-op — an UPDATE that touched zero rows', () => {
    // What an unauthorised .update().select().single() actually comes back as: not an error
    // about permissions, just "nothing to coerce". Seen verbatim in the browser smoke.
    const noop = { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' };
    expect(isAuthError(noop)).toBe(false);        // the raw auth test does not see it
    expect(isWriteBlocked(noop)).toBe(true);      // the WRITE path must retry + re-mint
  });

  it('still covers the plain auth rejections', () => {
    expect(isWriteBlocked(new Error('new row violates row-level security policy'))).toBe(true);
    expect(isWriteBlocked({ code: '42501' })).toBe(true);
  });

  it('does not swallow a real schema or constraint error', () => {
    expect(isWriteBlocked({ code: 'PGRST204', message: "Could not find the 'ems_params' column" })).toBe(false);
    expect(isWriteBlocked(new Error('duplicate key value violates unique constraint'))).toBe(false);
  });
});
