// The VIEWER ("צפייה") on DESKTOP (1440 and 1024): every screen he can open fits the desktop — the reports hub is a
// dashboard grid of report cards, the pages use the desktop layout, and nothing offers a write.
// Optional reviewer copies of every screen: VIEWER_SHOTS=<dir>/ (outside the repo).
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';
import { bootInvCerts, driverFor } from './inventory/_inv-driver';
import type { Page, TestInfo } from '@playwright/test';

const SHOTS = process.env.VIEWER_SHOTS || '';
async function snap(page: Page, ti: TestInfo, name: string) {
  if (!SHOTS) return;
  const w = page.viewportSize()?.width ?? 0;
  const theme = (ti.project.metadata as any).theme as string;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}${w}-${theme}-${name}.png`, fullPage: false });
}
const noHScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal overflow (px)').toBeLessThanOrEqual(0);
const nav = (page: Page) => page.locator('#sigma-desktop-nav nav[aria-label="ניווט ראשי"]');

for (const width of [1440, 1024]) {
  test.describe(`viewer desktop @${width}`, () => {
    test.beforeEach(async ({ page }, ti) => {
      test.skip(!ti.project.name.startsWith('desktop'), 'desktop only');
      await page.setViewportSize({ width, height: 900 });
    });

    test('hub, attendance + day details, calendar, hours, burns', async ({ page }, ti) => {
      const { rec } = await boot(page, ti, { who: 'צפייה' });
      await page.setViewportSize({ width, height: 900 });
      const hub = page.locator('#viewerReportsHub');
      await expect(hub).toBeVisible();
      await expect(hub).toBeInViewport();
      await noHScroll(page);
      await snap(page, ti, 'hub');

      await nav(page).getByRole('button', { name: 'נוכחות', exact: true }).click();
      await expect(page.locator('[data-testid="att-grid"]')).toBeVisible();
      const day = page.locator('[data-testid="att-grid"] [data-date]').nth(3);
      await day.click();
      await expect(page.locator('[data-testid="att-panel"] [data-testid="att-day-details"]')).toBeVisible();
      await expect(page.locator('[data-testid="att-save"]')).toHaveCount(0);
      await noHScroll(page);
      await snap(page, ti, 'attendance');

      await nav(page).getByRole('button', { name: 'יומן', exact: true }).click();
      await expect(page.locator('#calendar-view')).toBeVisible();
      await page.waitForTimeout(800);
      await noHScroll(page);
      await snap(page, ti, 'calendar');

      await page.evaluate(() => (window as any).sigma.showPage('hours'));
      await expect(page.getByRole('heading', { name: /^שעות/ }).first()).toBeVisible();
      await page.waitForTimeout(600);
      await noHScroll(page);
      await snap(page, ti, 'hours');

      const canBurns = await page.evaluate(() => !!(window as any).sigma.canShowPage('burns'));
      if (canBurns) {
        await page.evaluate(() => (window as any).sigma.showPage('burns'));
        await page.waitForTimeout(1200);
        await noHScroll(page);
        await snap(page, ti, 'burns');
      }
      expectNoConsoleErrors(rec);
    });

    test('inventory → certificates list, preview', async ({ page }, ti) => {
      const { rec } = await bootInvCerts(page, ti, 'צפייה');
      await page.setViewportSize({ width, height: 900 });
      await nav(page).getByRole('button', { name: 'מלאי', exact: true }).click();
      await page.waitForTimeout(600);
      await snap(page, ti, 'inventory');
      await page.locator('[data-testid="inv-tab-certs"]').click();
      await page.locator('[data-testid="inv-panel-certs"]').waitFor({ state: 'visible' });
      await driverFor().certRange(page, 'all');
      await expect(page.locator('[data-testid="inv-cert-row-1041"]')).toBeVisible();
      await expect(page.locator('[data-testid="inv-new-cert"]')).toHaveCount(0);
      await noHScroll(page);
      await snap(page, ti, 'certs');
      await page.locator('[data-testid="inv-cert-row-1041"] button').first().click();
      await expect(page.locator('[data-testid="cert-viewer"]')).toBeVisible();
      await page.waitForTimeout(600);
      await snap(page, ti, 'cert-preview');
      expectNoConsoleErrors(rec);
    });
  });
}
