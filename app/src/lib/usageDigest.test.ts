// The four cases the review demanded for `push-send` mode `usageDigest` (fix round 1):
//   no auth → 401 · cron key → ok (scheduled only) · EMS JWT + non-עידן actor + force → 403
//   · and the response contract: never the sentences themselves.
import { describe, expect, it } from 'vitest';
import { DIGEST_OWNER, usageDigestAuth } from './usageDigest';

const SECRET = 'sekrit-cron-key-0123456789';

describe('usageDigestAuth', () => {
  it('401s a caller holding nothing but the public anon key', () => {
    const r = usageDigestAuth({ cronSecret: SECRET });
    expect(r).toMatchObject({ ok: false, status: 401, via: 'none' });
    expect(r.error).toMatch(/unauthorized/);
  });

  it('401s a wrong or empty cron key, and never trusts an unset CRON_SECRET', () => {
    expect(usageDigestAuth({ cronSecret: SECRET, cronKey: 'nope' }).status).toBe(401);
    expect(usageDigestAuth({ cronSecret: SECRET, cronKey: '' }).status).toBe(401);
    // the secret is not configured → an empty header must NOT match an empty secret
    expect(usageDigestAuth({ cronSecret: '', cronKey: '' }).status).toBe(401);
    expect(usageDigestAuth({ cronKey: 'anything' }).status).toBe(401);
  });

  it('lets the cron key run the SCHEDULED digest', () => {
    const r = usageDigestAuth({ cronSecret: SECRET, cronKey: SECRET });
    expect(r).toMatchObject({ ok: true, via: 'cron', bypassGate: false, bypassTag: false });
  });

  it('never lets the cron key force — the key travels in a SQL job body', () => {
    expect(usageDigestAuth({ cronSecret: SECRET, cronKey: SECRET, force: true }))
      .toMatchObject({ ok: false, status: 403 });
    expect(usageDigestAuth({ cronSecret: SECRET, cronKey: SECRET, force: 'resend' }))
      .toMatchObject({ ok: false, status: 403 });
  });

  it('403s a forced send from a valid EMS login that is not עידן', () => {
    const r = usageDigestAuth({ emsValid: true, actor: 'ניתאי', force: true });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(r.error).toContain(DIGEST_OWNER);
    // …and even an admin who is not him
    expect(usageDigestAuth({ emsValid: true, actor: 'עמיחי', force: true }).status).toBe(403);
    expect(usageDigestAuth({ emsValid: true, actor: '', force: true }).status).toBe(403);
  });

  it('lets a non-עידן EMS session run the scheduled digest but grants it no bypass', () => {
    expect(usageDigestAuth({ emsValid: true, actor: 'ניתאי' }))
      .toMatchObject({ ok: true, via: 'ems', bypassGate: false, bypassTag: false });
  });

  it('lets עידן force the gate, and skip the week tag ONLY with force:"resend"', () => {
    expect(usageDigestAuth({ emsValid: true, actor: DIGEST_OWNER, force: true }))
      .toMatchObject({ ok: true, bypassGate: true, bypassTag: false });
    expect(usageDigestAuth({ emsValid: true, actor: DIGEST_OWNER, force: 'resend' }))
      .toMatchObject({ ok: true, bypassGate: true, bypassTag: true });
  });

  it('treats any other `force` value as no force at all', () => {
    for (const force of ['true', 1, {}, [], 'yes', null, undefined] as unknown[]) {
      const r = usageDigestAuth({ cronSecret: SECRET, cronKey: SECRET, force });
      expect(r).toMatchObject({ ok: true, bypassGate: false, bypassTag: false });
    }
  });
});
