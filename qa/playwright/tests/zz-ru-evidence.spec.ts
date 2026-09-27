// Round 5 · R-U (Hours/Gaps/Usage redesign) — evidence captures at 360/412, light+dark, for
// docs/superpowers/specs/2026-09-23-r5-R-other-screens.md. Not part of the correctness gate
// (hours.spec.ts/gaps.spec.ts/usage.spec.ts and no-overlap.spec.ts own that) — this file only
// produces qa/evidence/R-U/*.png. Same pattern as zz-cu-evidence.spec.ts: run under
// mobile-390-light/mobile-390-dark (the only two projects with a real storage `theme`), each
// test resizing into 360/412 after boot so the same theme/localStorage setup produces both.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { boot, expect, test } from './_helpers';
import { bootInv, driverFor } from './inventory/_inv-driver';

const invDriver = driverFor();

const OUT = path.resolve(__dirname, '..', '..', 'evidence', 'R-U');
mkdirSync(OUT, { recursive: true });

const WIDTHS: Array<{ w: number; h: number }> = [{ w: 360, h: 780 }, { w: 412, h: 915 }];

async function openHours(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.evaluate(() => (window as any).showPage?.('hours'));
  await page.waitForSelector('#sigma-hours[data-sigma-mounted="1"]', { state: 'attached', timeout: 30_000 });
  await expect(page.getByTestId('hours-page')).toBeVisible();
}

async function openGaps(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.waitForSelector('#sigma-gaps[data-sigma-mounted="1"]', { state: 'attached', timeout: 30_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-gaps')));
  await expect(page.getByTestId('gaps-sheet')).toBeVisible();
}

async function openMyTasks(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.getByTestId('header-my-tasks').click();
  await expect(page.getByTestId('my-tasks')).toBeVisible();
}

async function openAlerts(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.getByTestId('alerts-bell').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function openFeedback(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('dialog').filter({ hasText: 'רעיון או באג' })).toBeVisible();
}

async function openHolidays(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-holidays-open')));
  await expect(page.getByTestId('holidays-sheet')).toBeVisible();
}

async function openDayLog(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-daylog')));
  await expect(page.getByTestId('daylog-sheet')).toBeVisible();
}

// U10 retired the legacy #inventoryLegacy tabbed screen (window.showPage/invShowTab,
// #invReportChange, [data-inv-tab]) for the React inventory island — driven the same way
// inventory-pool.spec.ts is, through the data-testid driver contract (_inv-driver.ts), not boot().
async function openInventoryStrip(page: Page): Promise<void> {
  await invDriver.openTab(page, 'stock');
  await expect(page.getByTestId('inv-panel-stock')).toBeVisible({ timeout: 15_000 });
}

async function openStockChange(page: Page): Promise<void> {
  await openInventoryStrip(page);
  await page.getByTestId('inv-report-change').click();
  await expect(page.getByTestId('stock-change-sheet')).toBeVisible();
}

async function openWorkTimerStop(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  const card = page.locator('#sigma-home .kibbutz[data-name="חוקוק"]');
  await card.getByTestId('work-timer-start').click();
  await expect(card.getByTestId('work-timer-stop')).toBeVisible();
  await card.getByTestId('work-timer-stop').click();
  await page.getByTestId('work-timer-edit').getByTestId('work-timer-finish').click();
  await expect(page.getByTestId('work-timer-sheet')).toBeVisible();
}

test.describe('R-U evidence captures', () => {
  test.beforeEach(({}, ti) => {
    test.skip(!['mobile-390-light', 'mobile-390-dark'].includes(ti.project.name), 'one run per theme is enough');
  });

  for (const { w, h } of WIDTHS) {
    test(`hours @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openHours(page);
      await page.screenshot({ path: path.join(OUT, `hours__${w}__${theme}.png`) });
    });

    test(`gaps @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'אביאם' });
      await page.setViewportSize({ width: w, height: h });
      await openGaps(page);
      await page.screenshot({ path: path.join(OUT, `gaps__${w}__${theme}.png`) });
    });

    test(`usage @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן', query: 'x=1#usage' });
      await page.setViewportSize({ width: w, height: h });
      const dlg = page.getByRole('dialog').filter({ hasText: 'שימוש' });
      await expect(dlg).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `usage__${w}__${theme}.png`) });
    });

    test(`my-tasks @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openMyTasks(page);
      await page.screenshot({ path: path.join(OUT, `my-tasks__${w}__${theme}.png`) });
    });

    test(`alerts @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openAlerts(page);
      await page.screenshot({ path: path.join(OUT, `alerts__${w}__${theme}.png`) });
    });

    test(`feedback @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openFeedback(page);
      await page.screenshot({ path: path.join(OUT, `feedback__${w}__${theme}.png`) });
    });

    test(`feedback-inbox @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן', query: 'x=1#feedback-inbox' });
      await page.setViewportSize({ width: w, height: h });
      await expect(page.getByTestId('feedback-inbox')).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `feedback-inbox__${w}__${theme}.png`) });
    });

    test(`holidays @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openHolidays(page);
      await page.screenshot({ path: path.join(OUT, `holidays__${w}__${theme}.png`) });
    });

    test(`daylog @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'אביאם' });
      await page.setViewportSize({ width: w, height: h });
      await openDayLog(page);
      await page.screenshot({ path: path.join(OUT, `daylog__${w}__${theme}.png`) });
    });

    test(`inventory-strip @ ${w}`, async ({ page }, ti) => {
      const { theme } = await bootInv(page, ti, 'עידן', invDriver);
      await page.setViewportSize({ width: w, height: h });
      await openInventoryStrip(page);
      await page.screenshot({ path: path.join(OUT, `inventory-strip__${w}__${theme}.png`) });
    });

    test(`stock-change @ ${w}`, async ({ page }, ti) => {
      const { theme } = await bootInv(page, ti, 'עידן', invDriver);
      await page.setViewportSize({ width: w, height: h });
      await openStockChange(page);
      await page.screenshot({ path: path.join(OUT, `stock-change__${w}__${theme}.png`) });
    });

    test(`home @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
      await page.screenshot({ path: path.join(OUT, `home__${w}__${theme}.png`) });
    });

    test(`onboarding @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await page.waitForSelector('.kibbutz[data-name="גבת"]', { state: 'attached', timeout: 30_000 });
      await page.evaluate(() => (window as any).sigma.openKibbutzModal('גבת'));
      await expect(page.locator('[data-testid="kibbutz-detail"] [data-testid="onboarding-strip"]')).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `onboarding__${w}__${theme}.png`) });
    });

    test(`work-timer @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openWorkTimerStop(page);
      await page.screenshot({ path: path.join(OUT, `work-timer__${w}__${theme}.png`) });
    });
  }
});
