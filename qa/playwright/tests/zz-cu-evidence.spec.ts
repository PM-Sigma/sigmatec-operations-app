// Round 5 · C-U designer fix (25.9) — evidence captures for the four must-fix items
// (docs/superpowers/specs/2026-09-23-r5-C-calendar.md): month-full block chips, holiday/eve
// dark contrast, the 44px DayCell floor, the filters sheet and the person picker. Not part of
// the correctness gate (calendar.spec.ts/settings.spec.ts own that) — this file only produces
// qa/evidence/C-U/*.png for the designer. Run under mobile-390-light and mobile-390-dark (the
// only two projects with BOTH a real storage `theme` and enough headroom to resize into); each
// test resizes into the two widths the designer asked for (360 and 412) after boot so the
// SAME theme/localStorage setup produces both sizes.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { boot, expect, test } from './_helpers';

const OUT = path.resolve(__dirname, '..', '..', 'evidence', 'C-U');
mkdirSync(OUT, { recursive: true });

async function openCalendar(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => {
    const el = document.getElementById('calendar-view');
    if (!el || el.style.display === 'none') { (window as any).sigma?.showPage?.('calendar'); return false; }
    const grid = document.querySelector('[data-testid="cal-grid"]') as HTMLElement | null;
    return !!grid && grid.offsetParent !== null;
  }), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('[data-testid="cal-grid"][data-loaded="1"]')).toBeVisible({ timeout: 20_000 });
}

/** rgb()/rgba() string → relative luminance, 0 (black) .. 1 (white). */
function luminance(rgb: string): number {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(rgb);
  if (!m) return 1;
  const [r, g, b] = [m[1], m[2], m[3]].map(v => Number(v) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const WIDTHS: Array<{ w: number; h: number }> = [{ w: 360, h: 780 }, { w: 412, h: 915 }];

test.describe('C-U evidence captures', () => {
  test.beforeEach(({}, ti) => {
    test.skip(!['mobile-390-light', 'mobile-390-dark'].includes(ti.project.name), 'one run per theme is enough');
  });

  for (const { w, h } of WIDTHS) {
    test(`חודש מלא with week numbers @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openCalendar(page);
      const workWeekBtn = page.getByRole('button', { name: /^חודש מלא$/ });
      if (await workWeekBtn.count()) await workWeekBtn.click();
      await expect(page.getByTestId('cal-weeklabel').first()).toBeVisible();
      if (theme === 'dark') {
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(luminance(bg)).toBeLessThan(0.3);
      }
      await page.screenshot({ path: path.join(OUT, `month-full-weeknums__${w}__${theme}.png`), fullPage: true });
    });

    test(`filters sheet @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openCalendar(page);
      await page.locator('[data-view="list"]').click();
      const filterBtn = page.getByRole('button', { name: /סינון|מסננים|פילטר/ }).first();
      await filterBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      if (theme === 'dark') {
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(luminance(bg)).toBeLessThan(0.3);
      }
      await page.screenshot({ path: path.join(OUT, `filters-sheet__${w}__${theme}.png`), fullPage: true });
    });

    test(`person picker (as עידן) @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openCalendar(page);
      const picker = page.getByTestId('cal-person-picker').first();
      if (await picker.count()) await picker.click();
      if (theme === 'dark') {
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(luminance(bg)).toBeLessThan(0.3);
      }
      await page.screenshot({ path: path.join(OUT, `person-picker__${w}__${theme}.png`), fullPage: true });
    });

    test(`future-day blocks @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'אביאם' });
      await page.setViewportSize({ width: w, height: h });
      await openCalendar(page);
      const workWeekBtn = page.getByRole('button', { name: /^חודש מלא$/ });
      if (await workWeekBtn.count()) await workWeekBtn.click();
      // A future day with a block chip on it — the grid computes them for every future day.
      const chipCell = page.locator('[data-testid="cal-grid"] button[data-min-tap="44"]')
        .filter({ has: page.locator('span[title]') }).first();
      if (await chipCell.count()) await chipCell.scrollIntoViewIfNeeded();
      if (theme === 'dark') {
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(luminance(bg)).toBeLessThan(0.3);
      }
      await page.screenshot({ path: path.join(OUT, `future-day-blocks__${w}__${theme}.png`), fullPage: true });
    });
  }

  // Holiday + eve — explicitly DARK only (the designer's must-fix is the dark contrast).
  for (const { w, h } of WIDTHS) {
    test(`holiday + eve in dark @ ${w}`, async ({ page }, ti) => {
      test.skip(ti.project.name !== 'mobile-390-dark', 'dark only');
      await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openCalendar(page);
      const workWeekBtn = page.getByRole('button', { name: /^חודש מלא$/ });
      if (await workWeekBtn.count()) await workWeekBtn.click();
      await expect(page.locator('[data-testid="cal-grid"] [data-state="holiday"]').first()).toBeVisible();
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(luminance(bg)).toBeLessThan(0.3);
      await page.screenshot({ path: path.join(OUT, `holiday-eve-dark__${w}__dark.png`), fullPage: true });
    });
  }
});
