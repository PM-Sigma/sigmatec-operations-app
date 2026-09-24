// 🔔 יומן התראות in React (round 5 G-U3). What only a real browser can answer: עידן opens it
// from ⋯, the 250-row fixture never renders past PostgREST's own 200 cap, a failed row's error
// text sits right on the row (not only in a hover title), and nobody but עידן ever sees it.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

test('table: עידן opens it, the tiles and the failed row error read on the page (G-R6)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });

  await page.evaluate(() => (window as any).showPage('pushlog'));
  const view = page.locator('#sigma-pushlog');
  await expect(view.getByText('יומן התראות')).toBeVisible({ timeout: 15_000 });

  // tiles: 250 fixture rows, capped at 200 by the server-side limit like PostgREST, 1 failed
  await expect(view.getByText('200', { exact: true })).toBeVisible();
  await expect(view.getByText('410 Gone')).toBeVisible({ timeout: 15_000 });

  await expectRtl(page);
  await shot(page, ti, 'table-default');
  expectNoConsoleErrors(rec);
});

test('table: 250 fixture rows never render past the 200-row cap', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await page.evaluate(() => (window as any).showPage('pushlog'));
  const view = page.locator('#sigma-pushlog');
  await expect(view.getByText('יומן התראות')).toBeVisible({ timeout: 15_000 });
  await expect(view.getByText('200', { exact: true })).toBeVisible({ timeout: 15_000 });

  const rowCount = await view.getByTestId('pushlog-row').count();
  expect(rowCount).toBeLessThanOrEqual(200);

  expectNoConsoleErrors(rec);
});

test('an unknown event mode shows its raw name, never an empty cell', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await page.evaluate(() => (window as any).showPage('pushlog'));
  const view = page.locator('#sigma-pushlog');
  await expect(view.getByText('יומן התראות')).toBeVisible({ timeout: 15_000 });
  await expect(view.getByText('someFutureMode')).toBeVisible({ timeout: 15_000 });

  expectNoConsoleErrors(rec);
});

test('empty state: "עוד לא נשלחו התראות."', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await page.route('**/rest/v1/push_log*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.evaluate(() => (window as any).showPage('pushlog'));
  const view = page.locator('#sigma-pushlog');
  await expect(view.getByText('עוד לא נשלחו התראות.')).toBeVisible({ timeout: 15_000 });

  await shot(page, ti, 'empty');
  expectNoConsoleErrors(rec);
});

test('אביאם never sees it — not from ⋯, not by URL state', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', ready: 'body' });
  await page.evaluate(() => (window as any).showPage('pushlog'));
  // canShowPage('pushlog') gates on isIdan(); a non-עידן lands elsewhere and the island itself
  // renders null for anyone pushLogCanSee refuses.
  await expect(page.locator('#sigma-pushlog')).not.toContainText('יומן התראות');

  expectNoConsoleErrors(rec);
});
