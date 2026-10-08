// 8.10 live crash: opening ⚙️ threw "Minified React error #321 (Invalid hook call)" in the
// header-actions island. This opens the gear sheet for every role, also right after ⋯ עוד
// (the exact sequence of the report), and fails on any console error.
import { boot, expect, expectNoConsoleErrors, test, type Who } from './_helpers';

const READY = '#sigma-header-actions [aria-label="העדפות משתמש"]';
const ROLES: Array<[string, Who]> = [['עידן', 'עידן'], ['עמיחי', 'עמיחי'], ['אביאם', 'אביאם'], ['viewer', 'צפייה']];

for (const [label, who] of ROLES) {
  test(`gear sheet opens without a console error — ${label}`, async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { who, ready: READY });
    const hdr = page.locator('#sigma-header-actions');
    await hdr.getByRole('button', { name: 'העדפות משתמש' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'העדפות משתמש' })).toBeVisible();
    if (who !== 'צפייה') await expect(sheet.getByTestId('gear-open-gaps')).toBeVisible();
    // let the lazy extras (and עידן's team status fetch) settle
    await page.waitForTimeout(600);
    expectNoConsoleErrors(rec);
  });
}

test('gear sheet opens right after ⋯ עוד was opened and closed (the reported sequence)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן', ready: READY });
  const more = page.locator('#sigma-header-actions').getByRole('button', { name: 'עוד' });
  if (await more.count()) {
    await more.first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.locator('#sigma-header-actions').getByRole('button', { name: 'העדפות משתמש' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(600);
  expectNoConsoleErrors(rec);
});
