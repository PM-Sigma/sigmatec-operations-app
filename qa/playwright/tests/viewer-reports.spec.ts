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
