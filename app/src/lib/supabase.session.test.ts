// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:8124/index.html" }
// The ONE interceptor's rules (spec §7n + review fixes 1 and 3):
//   • 401 / PGRST301  → one forced re-mint + retry, and only then the expiry funnel
//   • 42501 / 403     → NOT an expiry (a permission answer to someone who IS signed in)
//   • mock mode       → never an expiry (the QA harness 401s writes on purpose)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionAwareFetch } from './supabase';
import { resetExpiryDebounce } from './session';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let expiries: string[];

function setup(responses: Response[], opts: { remint?: boolean } = {}) {
  const queue = responses.slice();
  const calls = { fetch: 0, remint: 0 };
  (globalThis as any).fetch = vi.fn(async () => { calls.fetch++; return queue.shift() ?? json({}, 200); });
  (window as any).sigma = {
    remintOnce: async () => { calls.remint++; return !!opts.remint; },
  };
  (window as any).sigmaSessionExpired = (reason?: string) => { expiries.push(String(reason)); return true; };
  return calls;
}

beforeEach(() => {
  resetExpiryDebounce();
  expiries = [];
  (window as any).sigmaBus = new EventTarget();
  // The host is a dev one here (jsdom cannot change origin), so mock mode hinges on the flag:
  // no `?login=0` → the funnel is armed, exactly as on the live origin.
  history.replaceState({}, '', '/index.html');
});

describe('what counts as an expired session', () => {
  it('a 401 buys one re-mint + retry, and stays quiet when the retry works', async () => {
    const calls = setup([json({ code: 'PGRST301' }, 401), json([{ id: 1 }], 200)], { remint: true });
    const res = await sessionAwareFetch('https://x/rest/v1/kibbutzim');
    expect(res.status).toBe(200);
    expect(calls.remint).toBe(1);
    expect(expiries).toEqual([]);
  });

  it('…and raises the expiry when the retry is refused too', async () => {
    setup([json({ code: 'PGRST301' }, 401), json({ code: 'PGRST301' }, 401)], { remint: true });
    const res = await sessionAwareFetch('https://x/rest/v1/kibbutzim');
    expect(res.status).toBe(401);
    expect(expiries).toHaveLength(1);
  });

  it('a 42501 is a permission answer, not an expiry (review fix 3)', async () => {
    const calls = setup([json({ code: '42501', message: 'row violates row-level security policy' }, 401)]);
    const res = await sessionAwareFetch('https://x/rest/v1/visits', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(expiries).toEqual([]);
    expect(calls.remint, 'no silent re-mint either — the pass is fine').toBe(0);
  });

  it('a plain 403 is not an expiry', async () => {
    setup([json({ message: 'forbidden' }, 403)]);
    await sessionAwareFetch('https://x/rest/v1/visits', { method: 'POST' });
    expect(expiries).toEqual([]);
  });

  it('a 200 is left completely alone', async () => {
    const calls = setup([json([{ id: 1 }], 200)]);
    const res = await sessionAwareFetch('https://x/rest/v1/kibbutzim');
    expect(res.status).toBe(200);
    expect(calls.fetch).toBe(1);
    expect(expiries).toEqual([]);
  });

  it('mock mode on a dev host never raises an expiry (the harness 401s on purpose)', async () => {
    setup([json({ code: '42501' }, 401)]);
    history.replaceState({}, '', '/index.html?login=0&sb=0');
    await sessionAwareFetch('https://x/rest/v1/visits', { method: 'POST' });
    expect(expiries).toEqual([]);
  });

  it('the body is still readable by the caller after the interceptor looked at it', async () => {
    setup([json({ code: '42501', message: 'nope' }, 401)]);
    const res = await sessionAwareFetch('https://x/rest/v1/visits', { method: 'POST' });
    await expect(res.json()).resolves.toEqual({ code: '42501', message: 'nope' });
  });
});
