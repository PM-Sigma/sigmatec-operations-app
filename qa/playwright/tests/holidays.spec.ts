// 🕎 חגים וסגירות (round 5 R-8/U7) — the month-grouped list, the purple holiday ink, and the
// one write a person can make here: flip a day between open and closed.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';

const openHolidays = async (page: any) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-holidays-open')));
  const sheet = page.getByTestId('holidays-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
};

const HOLIDAY = { date: '2026-10-05', name: 'ראש השנה', kind: 'holiday', required: false };

async function seedHolidays(page: any) {
  await page.route(SB_ORIGIN + '/rest/v1/company_holidays*', (route: any) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([HOLIDAY]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...HOLIDAY, required: true }]) });
  });
}

test('holidays: the month section title carries the holiday ink, and nothing here is an emoji', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await seedHolidays(page);
  const sheet = await openHolidays(page);

  await expect(sheet).toContainText('ראש השנה');
  const title = sheet.locator('h2, button[aria-expanded]').filter({ hasText: 'אוקטובר' }).first();
  await expect(title).toBeVisible();
  // The tokens live on `.sigma-root`/`[data-sigma-portal]`, not `:root` — read the custom
  // property from an element that actually inherits it (the title itself) rather than
  // `document.documentElement`, which sits outside that scope and would silently miss it.
  const [color, expected] = await title.evaluate(el => {
    const holidayInk = getComputedStyle(el).getPropertyValue('--holiday-ink').trim();
    const probe = document.createElement('span');
    probe.style.color = holidayInk;
    el.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(el).color, rgb];
  });
  expect(color).toBe(expected);

  await expect(sheet.locator('text=/\\p{Extended_Pictographic}/u')).toHaveCount(0);
  await expectRtl(page);
  await shot(page, ti, 'holidays');
  expectNoConsoleErrors(rec);
});

test('holidays: the switch toggles the day closed, and writes once', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await seedHolidays(page);
  const sheet = await openHolidays(page);

  const [req] = await Promise.all([
    page.waitForRequest((r: any) => r.url().includes('/rest/v1/company_holidays') && r.method() === 'PATCH'),
    sheet.getByRole('switch', { name: 'המשרד סגור בראש השנה' }).click(),
  ]);
  // The fixture starts required:false (a plain holiday, office closed) — the switch reads
  // "closed" as ON, so one click flips it to a workday: required:true.
  const sent = req.postDataJSON();
  expect(sent.required).toBe(true);

  expectNoConsoleErrors(rec);
});
