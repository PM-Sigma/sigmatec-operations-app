// The view-only sign-in is a short code behind a PUBLIC function, so the function is the rate
// limit (Task 21, fix round 2). The RULES live here — pure, unit-tested, and mirrored in
// `supabase/functions/ems-auth/index.ts`, which is the side that actually enforces them
// against the `auth_attempts` table (service role, deny-all for every client role).
//
// Nothing in the app imports this at runtime; it is the shared, testable definition of the
// numbers and the sentence, exactly like app/src/lib/remint.ts is for the re-mint schedule.

/** Failures from one address inside the window before it is refused. */
export const THROTTLE_MAX_FAILURES = 5;
/** How far back failures are counted. */
export const THROTTLE_WINDOW_MS = 15 * 60_000;
/**
 * A constant pause on EVERY failure. Constant, not growing: it costs an attacker the same on
 * each try and tells a person who mistyped nothing about how close the code was.
 */
export const THROTTLE_FAIL_DELAY_MS = 300;

/** What the person reads when the address is refused. One sentence, and what to do next. */
export const THROTTLE_MESSAGE = 'יותר מדי ניסיונות. נסה שוב בעוד 15 דקות';

/**
 * The caller's address: the FIRST hop of `X-Forwarded-For`. The later hops are the proxies and
 * can be forged by the client, so only the first one is used — and an absent header becomes a
 * single shared bucket rather than "no limit at all".
 */
export function firstHop(xff: string | null | undefined, fallback = 'unknown'): string {
  const first = String(xff || '').split(',')[0].trim();
  return first || fallback;
}

/** Is this address out of attempts? `times` are the recorded failures (ms or ISO). */
export function tooManyAttempts(
  times: Array<number | string>,
  now: number,
  max: number = THROTTLE_MAX_FAILURES,
  windowMs: number = THROTTLE_WINDOW_MS,
): boolean {
  return recentAttempts(times, now, windowMs) >= max;
}

/** How many of those failures are still inside the window. */
export function recentAttempts(
  times: Array<number | string>,
  now: number,
  windowMs: number = THROTTLE_WINDOW_MS,
): number {
  const from = now - windowMs;
  let n = 0;
  for (const t of times) {
    const ms = typeof t === 'number' ? t : Date.parse(String(t));
    if (Number.isFinite(ms) && ms >= from && ms <= now) n++;
  }
  return n;
}

/** The ISO timestamp the count starts from — what the function sends as its `at=gte.` filter. */
export function windowStartIso(now: number, windowMs: number = THROTTLE_WINDOW_MS): string {
  return new Date(now - windowMs).toISOString();
}
