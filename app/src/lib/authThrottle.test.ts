// The rate limit on the view-only sign-in (Task 21, fix round 2). The function enforces it;
// these are the rules it enforces, and the numbers both sides have to agree on.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  THROTTLE_FAIL_DELAY_MS, THROTTLE_MAX_FAILURES, THROTTLE_MESSAGE, THROTTLE_WINDOW_MS,
  firstHop, recentAttempts, tooManyAttempts, windowStartIso,
} from './authThrottle';

const NOW = Date.parse('2026-09-18T12:00:00.000Z');
const minsAgo = (m: number) => NOW - m * 60_000;

describe('which address an attempt is counted against', () => {
  it('is the FIRST hop of X-Forwarded-For — the later hops are forgeable', () => {
    expect(firstHop('203.0.113.7, 70.41.3.18, 150.172.238.178')).toBe('203.0.113.7');
    expect(firstHop('  203.0.113.7  ')).toBe('203.0.113.7');
  });

  it('falls back to one shared bucket rather than to "no limit"', () => {
    expect(firstHop(null)).toBe('unknown');
    expect(firstHop('')).toBe('unknown');
    expect(firstHop(' , 70.41.3.18')).toBe('unknown');
  });
});

describe('five failures in fifteen minutes', () => {
  it('lets the first four through and refuses the fifth', () => {
    const four = [minsAgo(1), minsAgo(3), minsAgo(7), minsAgo(14)];
    expect(tooManyAttempts(four, NOW)).toBe(false);
    expect(tooManyAttempts([...four, minsAgo(0)], NOW)).toBe(true);
  });

  it('forgets failures older than the window', () => {
    const old = [minsAgo(16), minsAgo(20), minsAgo(60), minsAgo(15.5)];
    expect(recentAttempts(old, NOW)).toBe(0);
    expect(tooManyAttempts([...old, minsAgo(2), minsAgo(3)], NOW)).toBe(false);
  });

  it('counts a timestamp exactly on the boundary as inside the window', () => {
    expect(recentAttempts([NOW - THROTTLE_WINDOW_MS], NOW)).toBe(1);
    expect(recentAttempts([NOW - THROTTLE_WINDOW_MS - 1], NOW)).toBe(0);
  });

  it('reads the ISO timestamps the table actually stores', () => {
    const rows = ['2026-09-18T11:59:00.000Z', '2026-09-18T11:50:00.000Z', '2026-09-18T11:30:00.000Z'];
    expect(recentAttempts(rows, NOW)).toBe(2);       // 11:30 is 30 min old
    expect(recentAttempts(['not a date', ''], NOW)).toBe(0);
  });

  it('asks the table for exactly the window', () => {
    expect(windowStartIso(NOW)).toBe('2026-09-18T11:45:00.000Z');
  });

  it('the numbers are the agreed ones', () => {
    expect(THROTTLE_MAX_FAILURES).toBe(5);
    expect(THROTTLE_WINDOW_MS).toBe(15 * 60_000);
    expect(THROTTLE_FAIL_DELAY_MS).toBe(300);
  });
});

describe('the function enforces these same rules', () => {
  const fn = readFileSync(
    resolve(__dirname, '../../../supabase/functions/ems-auth/index.ts'), 'utf8',
  );

  it('uses the first hop, the same window, the same cap and the same pause', () => {
    expect(fn).toMatch(/x-forwarded-for/i);
    expect(fn).toMatch(/THROTTLE_MAX_FAILURES = 5/);
    expect(fn).toMatch(/THROTTLE_WINDOW_MS = 15 \* 60_?000/);
    expect(fn).toMatch(/THROTTLE_FAIL_DELAY_MS = 300/);
  });

  it('answers 429 with the same sentence', () => {
    expect(fn).toContain(THROTTLE_MESSAGE);
    expect(fn).toMatch(/\}, 429\)/);
  });

  it('records every failure and clears the address on success', () => {
    expect(fn).toMatch(/recordFailure/);
    expect(fn).toMatch(/clearAttempts/);
    expect(fn).toMatch(/\?ip=eq\.\$\{encodeURIComponent\(ip\)\}/);
    expect(fn).toMatch(/method: "DELETE"/);
    expect(fn).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('says nothing about the mechanics to the person', () => {
    // the copy rules: the refusal is about HIS next step, not about tables or limits
    expect(THROTTLE_MESSAGE).not.toMatch(/Supabase|RLS|IP|טבלה|API/);
  });
});
