// 🔥 צריבות (round 5, K-U4). Burns never render on a kibbutz card, closed or open (K2); the
// landing strip is ONE row — "פרויקט צריבות מונים · בוצעו X מתוך Y · לפירוט" — and a tap always
// opens the burns page, with no per-role text and no card filter (K1).
// The rules themselves are goldens (app/src/lib/burns.test.ts + components/home/Burns.test.tsx).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

test('burns strip: one row, "בוצעו X מתוך Y", a tap opens the burns page and filters nothing', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  const strip = page.getByTestId('burns-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText('פרויקט צריבות מונים');
  await expect(strip).toContainText(/בוצעו \d+ מתוך \d+/);
  await expect(strip).toContainText('לפירוט');

  await shot(page, ti, 'landing-strip');
  await strip.click();
  await expect(page.locator('#burns-view')).toBeVisible();
  await expect(page.locator('.kibbutz.burn-filtered-out')).toHaveCount(0);

  await expectRtl(page);
  expectNoConsoleErrors(rec);
});

test('burns strip: same text for עמיחי — no per-role variant any more (עידן 18.9 21:50, round 5 K1)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עמיחי' });

  const strip = page.getByTestId('burns-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText(/בוצעו \d+ מתוך \d+/);

  expectNoConsoleErrors(rec);
});

test('burns: nothing about burns inside a kibbutz card or its open detail (K2)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  const card = page.locator('#sigma-home .kibbutz[data-name="חוקוק"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByTestId('burn-chip')).toHaveCount(0);
  await expect(card.getByText(/צריבות|לצרוב/)).toHaveCount(0);

  await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
  await expect(page.locator('[data-testid="kibbutz-detail"]')).toBeVisible();
  await expect(page.locator('[data-testid="kibbutz-detail"]').getByText(/צריבות|לצרוב/)).toHaveCount(0);
  // #sigma-burns-modal is still a DOM node until K-U5 deletes the legacy modal markup, but
  // K-U4 stops mounting a React root into it (islands/Burns.tsx no longer has a BurnsModal).
  await expect(page.locator('#sigma-burns-modal[data-sigma-mounted="1"]')).toHaveCount(0);
  await expect(page.getByTestId('burns-panel')).toHaveCount(0);

  await expectRtl(page);
  expectNoConsoleErrors(rec);
});

test('burns strip: hidden for מתניה (outside the project audience)', async ({ page }, ti) => {
  // מתניה lands on the dev page, not on the card home, so this spec has to walk to the cards.
  const { rec } = await boot(page, ti, { who: 'מתניה', ready: 'body' });
  await page.evaluate(() => (window as any).showPage('kibbutz'));

  await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('burns-strip')).toHaveCount(0);

  await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
  await expect(page.locator('[data-testid="kibbutz-detail"]')).toBeVisible();
  await expect(page.getByTestId('burns-panel')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('briefing: the pending meters still arrive as "לפני שיוצאים" rows (unchanged by K-U4)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();

  const brief = page.locator('[data-mode="briefing"]');
  await expect(brief).toBeVisible();
  await expect(brief.getByText('לפני שיוצאים')).toBeVisible();
  await expect(brief.getByTestId('brief-burns-summary')).toContainText('2 מונים ממתינים לצריבה');
  await brief.getByTestId('brief-burns-toggle').click();
  await expect(brief.locator('[data-leave-item="burn:mb1"]')).toBeVisible();
  await expect(brief.locator('[data-leave-item="burn:mb2"]')).toBeVisible();
  await expect(brief.locator('[data-leave-item="burn:mb3"]')).toHaveCount(0);
  await expect(brief.getByText('לצרוב מונה 68369287 · רפת 7 מונה ייצור')).toBeVisible();

  await shot(page, ti, 'briefing-burns');
  expectNoConsoleErrors(rec);
});
