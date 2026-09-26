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

// K's round 5/6 redesign (K1; grill round 2 "Burns strip = home") replaced the earlier
// per-role text + card-filter-toggle strip with ONE row for every role: "פרויקט צריבות מונים
// · בוצעו X מתוך Y · לפירוט ›", the whole row a single button that opens the table directly
// (openBurnsTable) — no more card filtering from here. Both tests below assert that instead
// of the retired filter-toggle behavior G's own tests used to pin.
test('landing strip: same progress line for every role, opens the table on tap', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  const strip = page.getByTestId('burns-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText('פרויקט צריבות מונים');
  await expect(strip).toContainText('בוצעו 3 מתוך 5');
  await expect(strip).toContainText('לפירוט');

  await shot(page, ti, 'landing-strip');

  await strip.click();
  await expect(page.locator('#sigma-burns-page').getByText('צריבות: מוני ייצור E360')).toBeVisible({ timeout: 15_000 });

  expectNoConsoleErrors(rec);
});

test('landing strip: עמיחי sees the same progress line as אביאם (עידן 18.9 21:50)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עמיחי' });

  const strip = page.getByTestId('burns-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText('בוצעו 3 מתוך 5');

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
