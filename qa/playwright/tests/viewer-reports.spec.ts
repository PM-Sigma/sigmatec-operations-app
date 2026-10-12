// The VIEWER (user "צפייה", reports-only) must be able to do his whole job comfortably:
// reach every field person's attendance in one tap, switch person / month, export attendance
// (PDF = print window, Excel = download), reach the delivery-certificates registry in one tap,
// filter it, open a certificate and print/save it as PDF, and pull the range reports from the
// hub. Desktop 1440 and phone 390 (the bottom bar). Read-only: no write control may appear.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';
import { bootInvCerts, driverFor } from './inventory/_inv-driver';
import type { Page } from '@playwright/test';

const isPhone = (viewport: string) => viewport.startsWith('mobile');

/** One tap on the viewer's own nav: the phone bottom bar, or the desktop top tab row. */
async function tapNav(page: Page, viewport: string, label: string) {
  const nav = isPhone(viewport)
    ? page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]')
    : page.locator('#sigma-desktop-nav nav[aria-label="ניווט ראשי"]');
  await nav.getByRole('button', { name: label, exact: true }).click();
}

test('viewer: attendance — one tap, every field person, month navigation, PDF + Excel', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'צפייה' });
  await tapNav(page, viewport, 'נוכחות');
  await expect(page.locator('#attendance-view')).toBeVisible();
  await expect(page.locator('[data-testid="att-grid"]')).toBeVisible();

  // the person toggle: both field people, switchable (the viewer is not one of them)
  const person = page.locator('[data-testid="att-person"]');
  await expect(person.getByRole('button')).toHaveCount(2);
  await person.getByRole('button', { name: 'ניתאי', exact: true }).click();
  await expect(page.getByText('נוכחות · ניתאי')).toBeVisible();
  await person.getByRole('button', { name: 'אביאם', exact: true }).click();
  await expect(page.getByText('נוכחות · אביאם')).toBeVisible();

  // month navigation moves the label (previous month, then back)
  const month = page.locator('[data-testid="att-month"]');
  const before = (await month.textContent()) || '';
  const monthBtns = month.locator('xpath=preceding-sibling::button | following-sibling::button');
  await monthBtns.first().click();
  await expect(month).not.toHaveText(before);
  await shot(page, ti, 'attendance');

  // the export pair is on the page; both work for the viewer. Excel = a download, PDF = the
  // print window (window.open) — step back to the month that has rows first.
  await monthBtns.last().click();
  await expect(month).toHaveText(before);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid="att-excel"] button').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-testid="att-pdf"] button').click()]);
  await expect(pop.locator('h1')).toContainText('דוח נוכחות');
  await pop.close();

  // read-only: no day editor, no save
  await expect(page.locator('[data-testid="att-save"]')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});

test('viewer: the reports hub — attendance PDF/Excel, certificates PDF, in the first screen', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  const hub = page.locator('#viewerReportsHub');
  await expect(hub).toBeVisible();
  await expect(hub).toBeInViewport();           // the landing screen IS the reports screen (0 taps)
  const attRow = hub.locator('.xl-hub-row', { hasText: 'דוח נוכחות חודשית' });
  await expect(attRow.locator('select option')).not.toHaveCount(0);   // every field person is selectable
  const [dl] = await Promise.all([page.waitForEvent('download'), attRow.getByRole('button', { name: /Excel/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  const [pop] = await Promise.all([page.waitForEvent('popup'), attRow.getByRole('button', { name: /PDF/ }).click()]);
  await pop.close();
  const certRow = hub.locator('.xl-hub-row', { hasText: 'דוח תעודות משלוח' });
  const [pop2] = await Promise.all([page.waitForEvent('popup'), certRow.getByRole('button', { name: /PDF/ }).click()]);
  await pop2.close();
  await shot(page, ti, 'hub');
  expectNoConsoleErrors(rec);
});

test('viewer: delivery certificates — one tap to the registry, filter, open, print as PDF, Excel', async ({ page }, ti) => {
  const viewport = (ti.project.metadata as any).viewport as string;
  const { rec } = await bootInvCerts(page, ti, 'צפייה');
  await tapNav(page, viewport, 'מלאי');
  const d = driverFor();
  await page.locator('[data-testid="inv-tab-certs"]').click();
  await page.locator('[data-testid="inv-panel-certs"]').waitFor({ state: 'visible' });
  await d.certRange(page, 'all');
  expect(await d.certNumbers(page)).toEqual([1042, 1041]);
  // filter: by kibbutz text, then by date range chips exist
  await d.certSearch(page, 'דגניה');
  expect(await d.certNumbers(page)).toEqual([1042]);
  await d.certSearch(page, '');
  await expect(page.locator('[data-testid="inv-certs-from"]')).toBeVisible();
  await expect(page.locator('[data-testid="inv-certs-to"]')).toBeVisible();
  await shot(page, ti, 'certs');
  // read-only: no new-cert button, no send / cancel / reissue in the row menu
  await expect(page.locator('[data-testid="inv-new-cert"]')).toHaveCount(0);
  await page.locator('[data-testid="inv-cert-more-1041"]').click();
  await expect(page.locator('[data-testid="inv-cert-view-1041"]')).toBeVisible();
  await expect(page.locator('[data-testid="inv-cert-send-1041"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="inv-cert-cancel-1041"]')).toHaveCount(0);
  await page.locator('[data-testid="inv-cert-more-1041"]').click();   // close the menu

  // open a cert by tapping its row, then print / save it as a PDF from the viewer
  await page.locator('[data-testid="inv-cert-row-1041"] button').first().click();
  const viewer = page.locator('[data-testid="cert-viewer"]');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('iframe')).toBeVisible();
  await page.evaluate(() => {
    const f = document.querySelector('[data-testid="cert-viewer"] iframe') as HTMLIFrameElement;
    (f.contentWindow as any).print = () => { (window as any).__certPrinted = true; };
  });
  await viewer.locator('[data-testid="cert-viewer-print"]').click();
  expect(await page.evaluate(() => (window as any).__certPrinted)).toBe(true);
  await expect(viewer.getByRole('button', { name: 'שליחה' })).toHaveCount(0);
  await shot(page, ti, 'cert-open');
  expectNoConsoleErrors(rec);
});

test('viewer: the page title and the active tab follow every page he can open', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'צפייה' });
  const phone = isPhone(viewport);
  const bar = page.locator('#sigma-page-bar');
  const nav = phone ? page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]') : page.locator('#sigma-desktop-nav nav[aria-label="ניווט ראשי"]');
  const steps: Array<[string, string | null]> = [['נוכחות', null], ['מלאי', 'מלאי'], ...(phone ? [] : [['יומן', 'יומן'] as [string, string]]), ['דוחות', 'דוחות']];
  for (const [tab, title] of steps) {
    await tapNav(page, viewport, tab);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(tab);          // the tab follows the page
    if (title) await expect(bar).toContainText(title);                           // the title follows the page
    else await expect(bar).not.toContainText('קיבוצים');                         // נוכחות draws its own header
    await expect(bar).not.toContainText('קיבוצים');                              // never the kibbutz page title
  }
  // שעות מול לקוחות — opened from the hub row
  await page.evaluate(() => (window as any).sigma.showPage('hours'));
  await expect(page.getByRole('heading', { name: /^שעות/ }).first()).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('viewer: the certificate preview fits the screen width (no sideways scroll), print untouched', async ({ page }, ti) => {
  const viewport = (ti.project.metadata as any).viewport as string;
  await bootInvCerts(page, ti, 'צפייה');
  await tapNav(page, viewport, 'מלאי');
  await page.locator('[data-testid="inv-tab-certs"]').click();
  await driverFor().certRange(page, 'all');
  await page.locator('[data-testid="inv-cert-row-1041"] button').first().click();
  const frame = page.locator('[data-testid="cert-viewer"] iframe');
  await expect(frame).toBeVisible();
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const f = document.querySelector('[data-testid="cert-viewer"] iframe') as HTMLIFrameElement;
    const box = f.getBoundingClientRect(); const d = f.contentDocument!.documentElement;
    return { right: box.right, left: box.left, vw: innerWidth, innerScroll: d.scrollWidth, boxW: (f.parentElement as HTMLElement).clientWidth, zoom: getComputedStyle(d).zoom };
  });
  expect(r.left).toBeGreaterThanOrEqual(-1);
  expect(r.right).toBeLessThanOrEqual(r.vw + 1);
  expect(r.zoom).toBe('1');                                   // the document itself is never zoomed (print = as issued)
  await shot(page, ti, 'cert-fit');
});

// ── עידן 12.10: the viewer has NO קיבוצים, and מלאי is strictly read-only ──────────────────────

test('viewer: no קיבוצים anywhere — tabs, deep link, Σ home, back, the gate', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'צפייה' });
  const navSel = isPhone(viewport) ? '#sigma-nav nav[aria-label="ניווט ראשי"]' : '#sigma-desktop-nav nav[aria-label="ניווט ראשי"]';
  await expect(page.locator(navSel).getByRole('button', { name: 'קיבוצים', exact: true })).toHaveCount(0);
  await expect(page.locator(navSel).getByRole('button', { name: 'דוחות', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).sigma.canShowPage('kibbutz'))).toBe(false);
  expect(await page.evaluate(() => (window as any)._currentPage)).toBe('reports');             // the default landing
  for (const how of ['showPage', 'home', 'back']) {
    await page.evaluate(() => (window as any).sigma.showPage('attendance'));
    if (how === 'showPage') await page.evaluate(() => (window as any).sigma.showPage('kibbutz'));   // a deep link / any caller
    if (how === 'home') await page.evaluate(() => (window as any).showPage('kibbutz'));             // the Σ / legacy home path
    if (how === 'back') await page.evaluate(() => (window as any).pageBack?.());
    await expect.poll(() => page.evaluate(() => (window as any)._currentPage), { message: how }).toBe('reports');
    await expect(page.locator('#viewerReportsHub')).toBeVisible();
    await expect(page.locator('#sigma-home')).toBeHidden();
  }
  await expect(page.locator('#sigma-page-bar')).not.toContainText('קיבוצים');
  // the card modal is a kibbutz door too: it does not open for the viewer
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});

/** Visible, ENABLED controls in the inventory page (+ an open sheet) whose label/test-id is a write. */
const WRITE = /שמירה|אישור|נכנס למלאי|סימון|מחיקה|השבתה|הפעלה|חדשה?|הוספ|העבר|דיווח|שליחה|הפקה מתוקנת|פענוח|ניתוח/;   // "סימון סופק" is caught by סימון; a "סופקה" status chip is a filter
const WRITE_ID = /^(inv-order-(quick|more|approve|stuck)-|os-(save|approve|parse)|ps-(save|more|toggle|delete)|inv-new-|inv-cert-(send|cancel|reissue)-|inv-transfer|inv-adjust)/;
async function writeControls(page: Page) {
  return page.evaluate(([w, wid]) => {
    const W = new RegExp(w), WID = new RegExp(wid);
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const roots = [document.getElementById('inventory-view'), ...document.querySelectorAll('[role="dialog"]')].filter(Boolean) as Element[];
    const out: string[] = [];
    for (const root of roots) for (const e of root.querySelectorAll('button, input, select, textarea')) {
      if (!vis(e) || (e as HTMLButtonElement).disabled || e.closest('fieldset[disabled]')) continue;
      // an open-orders strip row is a STATUS line ("ממתין לאישור …") that opens the read-only order sheet — not a control
      if (e.closest('[data-order-row]')) continue;
      const id = e.getAttribute('data-testid') || '';
      const label = (e.getAttribute('aria-label') || (e as HTMLElement).innerText || '').trim();
      const inSheet = !!e.closest('[role="dialog"]');
      if (WID.test(id) || (W.test(label) && !/^inv-tab-/.test(id)) || (inSheet && /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName))) out.push(id + ':' + label.slice(0, 30));
    }
    return out;
  }, [WRITE.source, WRITE_ID.source]);
}

test('viewer: every מלאי tab and sheet opens with ZERO write controls (UI only — RLS refuses writes anyway)', async ({ page }, ti) => {
  const viewport = (ti.project.metadata as any).viewport as string;
  const { rec } = await bootInvCerts(page, ti, 'צפייה');
  await tapNav(page, viewport, 'מלאי');
  await page.locator('[data-testid="inv-tab-orders"]').waitFor({ state: 'visible' });
  for (const tab of ['orders', 'stock', 'certs', 'kibbutz', 'returns', 'products']) {
    await page.locator(`[data-testid="inv-tab-${tab}"]`).click();
    await page.waitForTimeout(500);
    expect(await writeControls(page), `tab ${tab}`).toEqual([]);
  }
  // the sheets open read-only: an order, a product
  await page.locator('[data-testid="inv-tab-orders"]').click();
  await page.locator('[data-testid^="inv-order-row-"]').first().locator('button').first().click();
  await expect(page.locator('[data-testid="order-sheet"] fieldset[data-readonly]')).toBeVisible();
  expect(await writeControls(page), 'order sheet').toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="inv-tab-products"]').click();
  const prod = page.locator('[data-testid^="inv-product-row-"]').first();
  if (await prod.count()) {
    await prod.click();
    await expect(page.locator('[data-testid="product-sheet"] fieldset[data-readonly]')).toBeVisible();
    expect(await writeControls(page), 'product sheet').toEqual([]);
    await page.keyboard.press('Escape');
  }
  // no stock-change shortcut and no inventory nudge
  await expect(page.locator('#sigma-inventory-nudges')).toBeEmpty();
  await shot(page, ti, 'inventory-readonly');
  expectNoConsoleErrors(rec);
});
