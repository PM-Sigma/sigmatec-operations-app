// Q7-C (עידן 29.9): the gear sheet's first screen (identity + "מה נשאר לי לסגור", עידן's
// "מצב הצוות"), the install sheet, and the ניהול block being עידן's alone.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

const READY = '#sigma-header-actions [aria-label="העדפות משתמש"]';
const openGear = async (page: any) => {
  await page.locator('#sigma-header-actions').getByRole('button', { name: 'העדפות משתמש' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  return sheet;
};

test('gear: first screen shows "מה נשאר לי לסגור" and, for עידן only, the team status', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן', ready: READY });
  const sheet = await openGear(page);
  await expect(sheet.getByTestId('gear-open-gaps')).toBeVisible();
  const team = sheet.getByTestId('team-status');
  await expect(team).toBeVisible();
  // one row per staff member, and the two states are always stated (never blank)
  await expect(team.getByText('אביאם', { exact: true })).toBeVisible();
  await expect(team).toContainText(/התראות (פעילות|כבויות)/);
  await expect(team).toContainText(/לא פעיל עדיין|מותקנת|לא מותקנת/);
  await shot(page, ti, 'gear-first-screen-idan');
  expectNoConsoleErrors(rec);
});

test('gear: a team member sees the gaps row but not the team status', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי', ready: READY });
  const sheet = await openGear(page);
  await expect(sheet.getByTestId('gear-open-gaps')).toBeVisible();
  await expect(sheet.getByTestId('team-status')).toHaveCount(0);
  await expect(sheet.getByText('מצב הצוות')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});

test('gear: "התקנת אפליקציה" opens a small sheet with install + notifications', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', ready: READY });
  const sheet = await openGear(page);
  await sheet.getByRole('button', { name: 'התקנת אפליקציה' }).click();
  const inst = page.getByTestId('install-sheet');
  await expect(inst).toBeVisible();
  await expect(inst.getByText('התקנת האפליקציה')).toBeVisible();
  await expect(inst.getByText('אפשור התראות במכשיר')).toBeVisible();
  // not installed / not granted in a headless browser → both offer their button
  await expect(inst.getByTestId('install-sheet-install')).toBeVisible();
  await expect(inst.getByTestId('install-sheet-push')).toBeVisible();
  await shot(page, ti, 'install-sheet');
  expectNoConsoleErrors(rec);
});

test('preferences: no install row, no "רעיון או באג", named "העדפות משתמש"', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', ready: READY });
  const sheet = await openGear(page);
  await sheet.getByRole('button', { name: 'העדפות משתמש' }).click();
  const dlg = page.getByRole('dialog').filter({ hasText: 'העדפות משתמש' }).last();
  await expect(dlg.getByRole('heading', { name: 'העדפות משתמש' })).toBeVisible();
  await expect(dlg.getByText('רעיון או באג')).toHaveCount(0);
  await expect(dlg.getByText('התקנה על המכשיר')).toHaveCount(0);
  await expect(dlg.getByTestId('settings-personal')).toBeVisible();
  await expect(dlg.getByTestId('settings-open-gaps')).toBeVisible();
  await shot(page, ti, 'preferences');
  expectNoConsoleErrors(rec);
});

for (const who of ['עמיחי', 'אביאם', 'ניתאי'] as const) {
  test(`⋯ עוד: the ניהול block is not offered to ${who}`, async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { who });
    await page.locator('#sigma-nav, #sigma-desktop-nav').getByRole('button', { name: 'עוד', exact: true }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('עוד', { exact: true })).toBeVisible();
    await expect(sheet.getByText('ניהול', { exact: true })).toHaveCount(0);
    for (const label of ['פיתוח', 'שימוש']) {
      await expect(sheet.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }
    expectNoConsoleErrors(rec);
  });
}
