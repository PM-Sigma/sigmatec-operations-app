// Spec §7n — session length ≥ 3 h. The write pass the sign-in mints is good for 180 min and
// is re-minted every 50 min while the EMS session lives, plus whenever the tab comes back to
// the foreground inside the safety margin. The timer itself runs in the legacy bundle
// (js/src/15-login-gate.js, which owns the minting); these are the NUMBERS, kept here so they
// are pinned by a test and so both sides read the same constants.
export const PASS_TTL_MS = 180 * 60_000;
export const REMINT_EVERY_MS = 50 * 60_000;
/** Closer than this to the expiry, a pass is re-minted instead of waited on. */
export const REMINT_MARGIN_MS = 10 * 60_000;

export interface PassLike { exp?: number | null }

/** How long to wait before the next re-mint. Never past the pass's own safety margin. */
export function remintDelay(pass: PassLike | null | undefined, now: number): number {
  const exp = (pass && pass.exp) || 0;
  if (!exp) return 0;
  const untilMargin = exp - REMINT_MARGIN_MS - now;
  if (untilMargin <= 0) return 0;
  return Math.min(REMINT_EVERY_MS, untilMargin);
}

/** On `visibilitychange`: is this pass close enough to its end to re-mint right away? */
export function shouldRemintNow(pass: PassLike | null | undefined, now: number): boolean {
  const exp = (pass && pass.exp) || 0;
  return exp - now <= REMINT_MARGIN_MS;
}
