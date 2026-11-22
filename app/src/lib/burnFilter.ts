// The burns page's persisted filter (localStorage `burn_filter_v1`) — one home for the key so the
// kibbutz card can pre-set the site without importing the whole BurnsPage chunk.
import type { BurnFilter } from './burns';

export const BURN_FILTER_KEY = 'burn_filter_v1';
/** Dispatched on window after the filter is set from outside, so a mounted BurnsPage re-reads it. */
export const BURN_FILTER_EVENT = 'sigma-burn-filter';

export function readBurnFilter(): BurnFilter {
  try { return JSON.parse(localStorage.getItem(BURN_FILTER_KEY) || '{}') || {}; } catch { return {}; }
}
export function writeBurnFilter(f: BurnFilter): void {
  try { localStorage.setItem(BURN_FILTER_KEY, JSON.stringify(f)); } catch { /* private mode */ }
}

/** Filter the burns page to one kibbutz (everything else reset) and tell a mounted page. */
export function setBurnSiteFilter(site: string): void {
  writeBurnFilter({ site });
  try { window.dispatchEvent(new CustomEvent(BURN_FILTER_EVENT)); } catch { /* no DOM */ }
}
