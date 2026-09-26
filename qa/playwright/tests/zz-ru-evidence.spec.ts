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
  }
});
