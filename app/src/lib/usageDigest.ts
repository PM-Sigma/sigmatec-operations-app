// Who may ask push-send for the weekly usage digest (spec §7j, review fix round 1).
//
// WHY THIS EXISTS. The first version of the `usageDigest` mode had no request-level auth at
// all: anyone holding the PUBLIC anon key could POST `{"mode":"usageDigest","force":true}`,
// bypass the Sunday gate AND the idempotency tag, spam עידן's phone, and read every employee's
// weekly narrative straight out of the JSON response. The mode now answers only two callers:
//
//   1. **pg_cron** — proves itself with the `X-Cron-Key` header (Supabase secret `CRON_SECRET`).
//      It may run the SCHEDULED digest and nothing else: a cron key can never force, because a
//      forced send is exactly the thing an attacker wants and the key travels in a SQL job body.
//   2. **עידן, from the app** — a valid EMS login (`emsValid`) AND `actor === 'עידן'`. Only he
//      may `force` (skip the Sunday gate) and only he may `force:'resend'` (also skip the
//      already-sent tag), which is the release-smoke path.
//
// Everything here is PURE so the four cases are tested (usageDigest.test.ts). Deno cannot
// import from app/src, so `supabase/functions/push-send/usageDigest.ts` is a BYTE-IDENTICAL
// copy — test-usage-track.mjs fails the build on any drift. Keep this module import-free.
//
// KNOWN LIMITATION, deferred to Task 18: `actor` is a string the client sends. The app has ONE
// shared `authenticated` pass minted from the EMS gate, so nothing in the request can prove
// WHICH logged-in person is calling. `emsValid` proves a genuine EMS session exists; the actor
// check then stops every ordinary path and makes abuse require deliberately forging a name
// while already holding a real EMS login. That is defence in depth, not authentication.

/** `force` as it may arrive on the wire. */
export type DigestForce = true | 'resend' | false | null | undefined | unknown;

export interface DigestAuthInput {
  /** the `X-Cron-Key` request header, if any */
  cronKey?: string | null;
  /** the configured `CRON_SECRET`; absent/empty ⇒ no cron caller can authenticate */
  cronSecret?: string | null;
  /** did `emsValid(token)` say the EMS session is genuine? */
  emsValid?: boolean;
  /** the name the client claims to be (see the limitation note above) */
  actor?: string | null;
  force?: DigestForce;
}

export interface DigestAuthResult {
  ok: boolean;
  /** HTTP status to answer with when `ok` is false */
  status: number;
  error?: string;
  /** skip the Sunday-08:00 gate */
  bypassGate: boolean;
  /** skip the "already sent this week" tag — only ever for עידן's explicit resend */
  bypassTag: boolean;
  via: 'cron' | 'ems' | 'none';
}

/** The one person §7j puts this screen (and this push) in the hands of. */
export const DIGEST_OWNER = 'עידן';

const deny = (status: number, error: string): DigestAuthResult =>
  ({ ok: false, status, error, bypassGate: false, bypassTag: false, via: 'none' });

/**
 * Constant-time-ish comparison. Not a real HMAC, but it does not leak the secret's length
 * through an early return, which a plain `===` on strings of different lengths would.
 */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function usageDigestAuth(input: DigestAuthInput): DigestAuthResult {
  const force = input.force === true || input.force === 'resend';
  const resend = input.force === 'resend';
  const cronOk = sameSecret(String(input.cronSecret ?? ''), String(input.cronKey ?? ''));
  const emsOk = input.emsValid === true;
  const owner = (input.actor ?? '') === DIGEST_OWNER;

  if (!cronOk && !emsOk) {
    return deny(401, 'unauthorized: cron key or valid EMS login required');
  }
  // A forced send is the dangerous one (it skips the gate, and `resend` skips the tag too), so
  // it is never available to the cron key — only to עידן with a live EMS session.
  if (force && !(emsOk && owner)) {
    return deny(403, 'forbidden: only עידן may force the usage digest');
  }
  return {
    ok: true,
    status: 200,
    bypassGate: force,
    bypassTag: resend,
    via: cronOk && !force ? 'cron' : 'ems',
  };
}
