// 🏷️ Product display names (inventory spec §3, Task 9).
//
// Two names per product: `name` (שם טכני — what staff see everywhere, what a field-issued
// cert prints, what the recipient signs for) and `display_name` (שם לדוחות — what a viewer
// report/export/monthly-cert-summary prints instead, edited once by עידן and never touched
// by the day-to-day flow). `productLabel` is the single place that decides which one wins;
// every export builder (legacy js/src/21-excel-export.js, js/src/20-delivery-cert.js's
// reports-hub cert preview, js/src/12-reports.js) and every React surface must go through it
// (or its legacy mirror) so a technical name never leaks into a report that has a display name.
export interface ProductLike {
  name: string;
  display_name?: string | null;
}

export interface ProductLabelOpts {
  /** The viewer's role/name — a viewer always sees the report-facing name. */
  role?: string;
  /** True inside a report/export builder — technical name is never shown there. */
  forReport?: boolean;
}

const VIEWER_TOKENS = new Set(['viewer', 'צופה']);

export function isViewerRole(role?: string): boolean {
  return !!role && VIEWER_TOKENS.has(role);
}

/**
 * `name` for the day-to-day app (visit checkboxes, order pickers, EMS task text, staff
 * inventory tables) — everyone, always. `display_name` when it is set AND either
 * `opts.forReport` (an export/report builder) or the caller is a viewer role.
 * Falls back to `name` when `display_name` is empty/missing, so an unset display name
 * never prints as blank.
 */
export function productLabel(product: ProductLike | string, opts: ProductLabelOpts = {}): string {
  const name = typeof product === 'string' ? product : (product.name || '');
  const display = typeof product === 'string' ? undefined : product.display_name;
  const wantsDisplay = !!opts.forReport || isViewerRole(opts.role);
  if (wantsDisplay && display && display.trim()) return display.trim();
  return name;
}

/** Only עידן may edit `display_name` (spec §3) — the technical name stays open to staff. */
export function canEditDisplayName(isIdan: boolean): boolean {
  return !!isIdan;
}

/**
 * The products-page "🔗 מחובר למחולל הדוחות" status: red the moment any ACTIVE product would
 * print its technical name in a viewer export today — i.e. it has no display_name set. Once
 * every active product has one, the wiring is green.
 */
export function reportWiringOk(products: ProductLike[]): boolean {
  return (products || []).every(p => !!p.display_name && p.display_name.trim());
}

/** "תצוגה בדוח" preview — exactly what the next viewer PDF/Excel prints for this product line. */
export function reportPreview(product: ProductLike): string {
  return productLabel(product, { forReport: true });
}
