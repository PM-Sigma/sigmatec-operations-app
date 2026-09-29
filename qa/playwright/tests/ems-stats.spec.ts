// סטטיסטיקת משימות EMS (H5). The page reads ems_task_state and is for עידן and עמיחי only.
// What only a real browser answers: it renders for the right two people at phone width in both
// themes without horizontal scroll, the empty and not-yet-migrated states read as sentences, and
// for everyone else the page is unreachable AND no request for its table is ever made.
// The formulas are goldens (app/src/lib/emsLifecycle.test.ts); the gate matrix is test-can-show-page.mjs.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, type Who } from './_helpers';

const open = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).showPage('emsstats'));

async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'the page scrolls sideways by ' + over + 'px').toBeLessThanOrEqual(1);
}

for (const who of ['עידן', 'עמיחי'] as Who[]) {
  test(`ems stats: ${who} sees the page with real-size data`, async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { who });
    expect(await page.evaluate(() => (window as any).sigma.canShowPage('emsstats'))).toBe(true);
    await open(page);

    const root = page.getByTestId('emsstats-page');
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(root).toContainText('סטטיסטיקת משימות EMS');
    await expect(root).toContainText('חציון עד שיבוץ');
    await expect(root).toContainText('נסגרו בזמן');
    await expect(root).toContainText('פתוחות עכשיו');
    await expect(root).toContainText('גיל הצבר הפתוח');
    await expect(root).toContainText('נסגרו לפי חודש');
    await expect(root).toContainText('נפתחו · ');
    // the on-time tile is a percentage, not the em dash: the fixture has closed tasks with due dates
    await expect(root.getByText('נסגרו בזמן').locator('..')).toContainText('%');
    for (const site of ['דפנה', 'חוקוק', 'כפר עזה', 'אור הנר']) await expect(root).toContainText(site);

    await expectRtl(page);
    await expectNoHorizontalScroll(page);
    if (who === 'עידן') await shot(page, ti, 'ems-stats', { fullPage: true });
    expectNoConsoleErrors(rec);
  });
}

for (const who of ['אביאם', 'ניתאי', 'מתניה', 'צפייה'] as Who[]) {
  test(`ems stats: ${who} cannot reach it, and its table is never requested`, async ({ page }, ti) => {
    const requested: string[] = [];
    page.on('request', r => { if (/\/rest\/v1\/ems_task_(state|events)/.test(r.url())) requested.push(r.url()); });
    // מתניה lands on the dev page and צפייה is read-only: neither needs the card home.
    const { rec } = await boot(page, ti, { who, ready: 'body' });
    expect(await page.evaluate(() => (window as any).sigma.canShowPage('emsstats'))).toBe(false);
    await open(page);
    await page.waitForTimeout(600);
    await expect(page.locator('#emsstats-view')).toBeHidden();
    await expect(page.getByTestId('emsstats-page')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any)._currentPage)).not.toBe('emsstats');
    expect(requested).toEqual([]);
    expectNoConsoleErrors(rec);
  });
}

test('ems stats: nothing collected yet reads as a sentence, not a broken page', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await page.route(/\/rest\/v1\/ems_task_state/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await open(page);
  const empty = page.getByTestId('emsstats-empty');
  await expect(empty).toBeVisible({ timeout: 20_000 });
  await expect(empty).toContainText('עוד אין נתונים.');
  await expectNoHorizontalScroll(page);
  await shot(page, ti, 'ems-stats-empty');
  expectNoConsoleErrors(rec);
});

test('ems stats: before the migration is applied the page says tracking is not active yet', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await page.route(/\/rest\/v1\/ems_task_state/, r => r.fulfill({
    status: 404, contentType: 'application/json',
    body: JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }),
  }));
  await open(page);
  const err = page.getByTestId('emsstats-error');
  await expect(err).toBeVisible({ timeout: 20_000 });
  await expect(err).toContainText('המעקב עוד לא פעיל.');
  await expectNoHorizontalScroll(page);
  // the failed table read is the ONE expected failure here; anything else in the console is a bug
  expect(rec.errors.filter(e => !/ems_task_state|404|PGRST205|Failed to load resource/.test(e))).toEqual([]);
});
