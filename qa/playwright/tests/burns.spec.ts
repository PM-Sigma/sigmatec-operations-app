// 🔥 צריבות inside 2.00 (Task 23). What only a real browser can answer: the chip is on the
// card that still has work and NOT on the one that is finished, the card modal's section
// lists that kibbutz's meters with the right buttons per role, the briefing carries the
// meters as "לפני שיוצאים" rows, and the landing strip filters the cards when it is tapped.
// The rules themselves are goldens (app/src/lib/burns.test.ts + components/home/Burns.test.tsx).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

test('card: no 🔥 chip on the home card any more (22.9, D1) — the summary lives inside the card', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  const hukok = page.locator('#sigma-home .kibbutz[data-name="חוקוק"]');
  await expect(hukok).toBeVisible({ timeout: 15_000 });
  await expect(hukok.getByTestId('burn-chip')).toHaveCount(0);
  await expect(page.locator('#sigma-home .kibbutz[data-name="יגור"] [data-testid="burn-chip"]')).toHaveCount(0);
  // the strip above the cards still carries the project's progress
  await expect(page.getByTestId('burns-strip')).toBeVisible({ timeout: 15_000 });

  await expectRtl(page);
  await shot(page, ti, 'card-chip');
  expectNoConsoleErrors(rec);
});

test('card modal: the 🔥 צריבות section lists this kibbutz only', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .kibbutz-name').click();
  const panel = page.getByTestId('burns-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByTestId('burns-panel-count')).toHaveText('נותרו 2/3');
  await expect(panel.getByText('פרויקט זמני')).toHaveCount(0);   // 22.9: the label is gone
  // 22.9 (D1): the section is a summary row until tapped
  await expect(panel.getByTestId('burn-row')).toHaveCount(0);
  await panel.getByTestId('burns-panel-toggle').click();

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
  await panel.getByTestId('burns-panel-toggle').click();
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
  // Round 2 · G6: 🔥 is a COLLAPSED category now — the line counts what is left, and the
  // rows themselves are one tap away rather than thirty lines down the checklist.
  await expect(brief.getByTestId('brief-burns-summary')).toContainText('2 מונים ממתינים לצריבה');
  await brief.getByTestId('brief-burns-toggle').click();
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
  await expect(strip).toContainText('צריבות · נותרו 2 ב-1 קיבוץ');

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
  await expect(strip).toContainText('צריבות · בוצעו 3 מתוך 5 · 60%');

  expectNoConsoleErrors(rec);
});

// ───────────────────────── the full table (round 5 G-U2) ─────────────────────────

test('table: no prompt()/confirm() anywhere on the page (G-R4)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  page.on('dialog', d => { throw new Error('unexpected native dialog: ' + d.message()); });

  await page.evaluate(() => (window as any).showPage('burns'));
  const view = page.locator('#sigma-burns-page');
  await expect(view.getByText('צריבות: מוני ייצור E360')).toBeVisible({ timeout: 15_000 });

  await expectRtl(page);
  await shot(page, ti, 'table-default');
  expectNoConsoleErrors(rec);
});

test('table: Excel export and גנרטורים sit in one action row (G-R2)', async ({ page }, ti) => {
  // אביאם gets only the Excel bubble (not a generator manager) — עידן/עמיחי get both, and both
  // sit in PageActionRow's own actions row, never a second row of their own.
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await page.evaluate(() => (window as any).showPage('burns'));
  const view = page.locator('#sigma-burns-page');
  await expect(view.getByText('צריבות: מוני ייצור E360')).toBeVisible({ timeout: 15_000 });

  const exportBtn = view.getByLabel('ייצוא לאקסל');
  const gensBtn = view.getByLabel('גנרטורים');
  await expect(exportBtn).toBeVisible();
  await expect(gensBtn).toBeVisible();
  const exportBox = await exportBtn.boundingBox();
  const gensBox = await gensBtn.boundingBox();
  expect(exportBox && gensBox && Math.abs(exportBox.y - gensBox.y) < 4).toBe(true);

  await shot(page, ti, 'action-bar');
  expectNoConsoleErrors(rec);
});

test('table: search "287" then Enter opens the single meter it matches', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await page.evaluate(() => (window as any).showPage('burns'));
  const view = page.locator('#sigma-burns-page');
  await expect(view.getByText('צריבות: מוני ייצור E360')).toBeVisible({ timeout: 15_000 });
  // wait for the fixture rows (not just the shell) before typing a search
  await expect(view.getByText('68369287')).toBeVisible({ timeout: 15_000 });

  await view.getByLabel('חיפוש').fill('287');
  // Let the filtered list settle to the one match before Enter.
  await expect(view.getByText('59965612')).toHaveCount(0);
  await view.getByLabel('חיפוש').press('Enter');
  await expect(page.getByRole('dialog').filter({ hasText: '68369287' })).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('table: the viewer reads every kibbutz’s meters with no write control', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await page.evaluate(() => (window as any).showPage('burns'));
  const view = page.locator('#sigma-burns-page');
  await expect(view.getByText('צריבות: מוני ייצור E360')).toBeVisible({ timeout: 15_000 });
  await expect(view.getByLabel('גנרטורים')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});
