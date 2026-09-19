// 🔥 צריבות inside 2.00 (Task 23). What only a real browser can answer: the chip is on the
// card that still has work and NOT on the one that is finished, the card modal's section
// lists that kibbutz's meters with the right buttons per role, the briefing carries the
// meters as "לפני שיוצאים" rows, and the landing strip filters the cards when it is tapped.
// The rules themselves are goldens (app/src/lib/burns.test.ts + components/home/Burns.test.tsx).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

test('card: 🔥 נותרו X/Y on the kibbutz with work left, nothing on the finished one', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  const hukok = page.locator('#sigma-home .kibbutz[data-name="חוקוק"]');
  await expect(hukok).toBeVisible({ timeout: 15_000 });
  const chip = hukok.getByTestId('burn-chip');
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(chip).toHaveText('🔥 נותרו 2/3');

  // HIDE AT ZERO, on the same screen: יגור's meters are all burned, so it carries no chip.
  await expect(page.locator('#sigma-home .kibbutz[data-name="יגור"] [data-testid="burn-chip"]')).toHaveCount(0);

  await expectRtl(page);
  await shot(page, ti, 'card-chip');
  expectNoConsoleErrors(rec);
});

test('card modal: the 🔥 צריבות section lists this kibbutz only, tagged פרויקט זמני', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .kibbutz-name').click();
  const panel = page.getByTestId('burns-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByTestId('burns-panel-count')).toHaveText('נותרו 2/3');
  await expect(panel.getByText('פרויקט זמני')).toBeVisible();

  // not-done first (CT before PP), the burned one last — the order burnsForSite fixes
  const rows = panel.getByTestId('burn-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('data-meter', 'mb1');
  await expect(rows.nth(2)).toHaveAttribute('data-meter', 'mb3');
  // a writer gets the two buttons and the multi-select box on every row
  await expect(panel.getByTestId('burn-toggle')).toHaveCount(3);
  await expect(panel.locator('input[type="checkbox"]')).toHaveCount(3);

  await shot(page, ti, 'card-modal-section');
  expectNoConsoleErrors(rec);
});

test('card modal: the viewer reads the meters and is offered no button at all', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });

  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .kibbutz-name').click();
  const panel = page.getByTestId('burns-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByTestId('burn-row')).toHaveCount(3);
  await expect(panel.getByTestId('burn-toggle')).toHaveCount(0);
  await expect(panel.locator('input[type="checkbox"]')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('card: מתניה sees no chip and no section — the project is hidden from him', async ({ page }, ti) => {
  // מתניה lands on the dev page, not on the card home, so this spec has to walk to the cards.
  // It did not need to while index.html was unbalanced (audit A1): the card home stayed
  // rendered under every other page, so `#sigma-home .kibbutz` was "visible" on the dev page.
  const { rec } = await boot(page, ti, { who: 'מתניה', ready: 'body' });
  await page.evaluate(() => (window as any).showPage('kibbutz'));

  await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('burn-chip')).toHaveCount(0);
  await expect(page.getByTestId('burns-strip')).toHaveCount(0);

  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .kibbutz-name').click();
  await expect(page.getByTestId('burns-panel')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('briefing: the pending meters arrive as "לפני שיוצאים" rows', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();

  const brief = page.locator('[data-mode="briefing"]');
  await expect(brief).toBeVisible();
  await expect(brief.getByText('לפני שיוצאים')).toBeVisible();
  // one row per meter that is still open — the burned one is not offered
  await expect(brief.locator('[data-leave-item="burn:mb1"]')).toBeVisible();
  await expect(brief.locator('[data-leave-item="burn:mb2"]')).toBeVisible();
  await expect(brief.locator('[data-leave-item="burn:mb3"]')).toHaveCount(0);
  await expect(brief.getByText('לצרוב מונה 68369287 · רפת 7 מונה ייצור')).toBeVisible();

  await shot(page, ti, 'briefing-burns');
  expectNoConsoleErrors(rec);
});

test('landing strip: what is left for the field team, and a tap filters the cards', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  const strip = page.getByTestId('burns-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText('צריבות — נותרו 2 ב-1 קיבוץ');

  await strip.getByTestId('burns-strip-filter').click();
  await expect(page.locator('#sigma-home .kibbutz[data-name="יגור"]')).toHaveClass(/burn-filtered-out/);
  await expect(page.locator('#sigma-home .kibbutz[data-name="חוקוק"]')).not.toHaveClass(/burn-filtered-out/);

  await shot(page, ti, 'landing-strip');

  await strip.getByTestId('burns-strip-filter').click();          // a second tap releases it
  await expect(page.locator('#sigma-home .kibbutz[data-name="יגור"]')).not.toHaveClass(/burn-filtered-out/);

  expectNoConsoleErrors(rec);
});

test('landing strip: עמיחי is shown PROGRESS, not a to-do list (עידן 18.9 21:50)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עמיחי' });

  const strip = page.getByTestId('burns-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText('צריבות — בוצעו 3 מתוך 5 · 60%');

  expectNoConsoleErrors(rec);
});
