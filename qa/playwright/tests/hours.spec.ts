// ⏱ שעות (round 5 R-U1) — the longest real row at 360 clamps with no page scroll, the three
// filters live in chips that open a sheet instead of native `<select>`s, and the viewer gets
// no add/edit affordance at all.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';

const openHours = async (page: any) => {
  await page.waitForSelector('#sigma-hours[data-sigma-mounted="1"]', { state: 'attached' });
  await page.evaluate(() => (window as any).showPage?.('hours'));
  await expect(page.getByTestId('hours-page')).toBeVisible();
};

test('hours: a long row clamps at 360 and the page never scrolls sideways', async ({ page }, ti) => {
  test.skip(!String(ti.project.name).startsWith('mobile-360'), '360');
  const { rec } = await boot(page, ti);
  await page.route(`${SB_ORIGIN}/rest/v1/work_sessions*`, r => r.fulfill({ json: [{
    id: 'w1', person: 'עידן', kibbutz: 'קיבוץ גבעת חיים איחוד', started_at: new Date().toISOString(),
    ended_at: new Date(Date.now() + 9e6).toISOString(), tags: ['התקנה', 'בדיקת מונים', 'הדרכה', 'נוסף'],
    attendees: ['ניתאי'], billable: true, note: 'הערה ארוכה מאוד '.repeat(6), clockify_id: null,
  }] }));
  await openHours(page);

  await expect(page.getByTestId('hours-row').first()).toBeVisible();
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByTestId('hours-row').first()).toContainText('+1');

  await expectRtl(page);
  await shot(page, ti);
  expectNoConsoleErrors(rec);
});

test('hours: filters live in chips that open a sheet', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openHours(page);

  await expect(page.locator('#sigma-hours select')).toHaveCount(0);
  await page.getByRole('button', { name: /כל העובדים/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('hours: viewer — no add, no edit', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await openHours(page);

  await expect(page.getByRole('button', { name: 'הוספה ידנית' })).toHaveCount(0);
  await expect(page.getByTestId('hours-row').first().locator('svg.lucide-chevron-left')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});
