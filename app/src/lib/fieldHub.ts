// פעולות שטח — the field hub's pure bits (spec 2026-09-29-field-ops-hub-design.md §2/§3).
// Which sections a person sees, and how a page name (a redirect from showPage) maps to a section.
// The gates themselves live in js/src/00-bridge.js canShowPage — this only orders and labels them.

export type HubSection = 'today' | 'attendance' | 'ip' | 'burns';

/** The DOM id each section scrolls to (index.html, inside #fieldops-view). */
export const HUB_SECTION_ID: Record<HubSection, string> = {
  today: 'sigma-fieldhub-today',
  attendance: 'attendance-view',
  ip: 'fieldops-ip',
  burns: 'burns-view',
};

export const HUB_SECTION_LABEL: Record<HubSection, string> = {
  today: 'היום שלי',
  attendance: 'נוכחות',
  ip: 'קריאות IP',
  burns: 'צריבות',
};

/** The old page names that are sections now (showPage redirects them to fieldops#<section>). */
export function sectionForPage(page: string): HubSection | null {
  if (page === 'attendance') return 'attendance';
  if (page === 'burns') return 'burns';
  return null;
}

/**
 * The sections this person sees, top → bottom. `can` is canShowPage: 'attendance' | 'modbus' | 'burns'.
 * היום שלי is staff-only (never the viewer).
 */
export function hubSections(isViewer: boolean, can: (gate: 'attendance' | 'modbus' | 'burns') => boolean): HubSection[] {
  const out: HubSection[] = [];
  if (!isViewer) out.push('today');
  if (can('attendance')) out.push('attendance');
  if (can('modbus')) out.push('ip');
  if (can('burns')) out.push('burns');
  return out;
}
