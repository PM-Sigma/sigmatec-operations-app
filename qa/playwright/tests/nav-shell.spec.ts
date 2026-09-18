// The app shell (spec §6 header, §7k #3 the ⋯ sheet, §7h הגדרות).
// Covers: the bottom tab bar (phone only — `md:hidden`, the legacy .page-nav keeps the
// desktop), the labelled ⋯ עוד sheet and its ניהול block, the ● user chip menu, and the
// ⚙️ הגדרות island the menu opens.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

test('shell: the bottom nav is the phone\'s, the legacy nav is the desktop\'s', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);
  await expectRtl(page);

  const nav = page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]');
  await expect(nav).toBeAttached();
  // The island always mounts; `body.sigma-nav-ready` is what css/app.css keys the legacy
  // nav's phone-only hiding off (so a bundle that never loads keeps the old nav).
  await expect(page.locator('body')).toHaveClass(/sigma-nav-ready/);

  if (viewport === 'mobile-390') {
    await expect(nav).toBeVisible();
    // field roles: קיבוצים · תעודה · [ביקור] · מלאי · עוד
    for (const label of ['קיבוצים', 'תעודה', 'מלאי', 'עוד']) {
      await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('button', { name: 'תיעוד ביקור' })).toBeVisible();
    // the tab you are on is announced, not only coloured
    await expect(nav.getByRole('button', { name: 'קיבוצים', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.page-nav')).toBeHidden();
  } else {
    await expect(nav).toBeHidden();
    await expect(page.locator('.page-nav')).toBeVisible();
    await expect(page.locator('#navKibbutz')).toHaveClass(/active/);
  }

  await shot(page, ti);
  expectNoConsoleErrors(rec);
});

test('shell: the ⋯ עוד sheet is labelled and role-blocked', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);
  // The sheet lives in the bottom nav, which is the phone's surface.
  test.skip(viewport !== 'mobile-390', 'the ⋯ sheet is reachable from the phone nav only');

  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('עוד', { exact: true })).toBeVisible();

  // Every row is LABELLED (§7k #3, עידן 18.9: "נוכחות never hidden without a label").
  // נוכחות is NOT here for עידן: `canSeeAttendance()` (js/src/11-search-login.js) lists
  // אביאם · ניתאי · עמיחי · viewer only, and the sheet offers exactly the pages showPage()
  // would open. The team test below asserts the labelled נוכחות row for אביאם.
  // משימות · משימות EMS · עובדים retired in Task 14 (§7m R1/R2/R5): the first two are 🗓️ יומן's
  // רשימה view and the third is gone, so the sheet no longer offers a row that opens nothing.
  for (const label of ['יומן', 'מלאי', 'הגדרות', 'יומן היום']) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  for (const gone of ['משימות', 'משימות EMS', 'עובדים']) {
    await expect(sheet.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
  }
  // …and the management block is behind its own rule, for עידן
  await expect(sheet.getByText('ניהול', { exact: true })).toBeVisible();
  for (const label of ['התראות', 'פיתוח', '📈 שימוש']) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  // the identity chip is in the sheet on the phone (the header has no room for it)
  await expect(sheet.getByRole('button', { name: /עידן/ })).toBeVisible();

  await shot(page, ti, 'more-sheet');

  // A row navigates and closes the sheet.
  await sheet.getByRole('button', { name: 'מלאי', exact: true }).click();
  await expect(page.locator('#inventory-view')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('shell: a team member gets no ניהול block', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'אביאם' });
  test.skip(viewport !== 'mobile-390', 'the ⋯ sheet is reachable from the phone nav only');

  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  const sheet = page.getByRole('dialog');
  // אביאם IS in ATT_PEOPLE → his own נוכחות report, with a label
  await expect(sheet.getByRole('button', { name: 'נוכחות', exact: true })).toBeVisible();
  // התראות / 📈 שימוש are עידן's (pushlog gate + roles:['idan'])
  await expect(sheet.getByRole('button', { name: 'התראות', exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: '📈 שימוש', exact: true })).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('shell: the user-chip menu and the ⚙️ הגדרות island', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);

  // The chip is in the header on the desktop and inside the ⋯ sheet on the phone.
  if (viewport === 'mobile-390') {
    await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  }
  const chip = page.getByRole('button', { name: /עידן/ }).first();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('aria-haspopup', 'menu');

  await chip.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'הגדרות' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'האזור האישי' })).toBeVisible();
  // not connected to EMS in mock mode → the row offers the action that changes that
  await expect(menu.getByRole('menuitem', { name: 'התחבר ל-EMS' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'החלפת משתמש' })).toBeVisible();
  await shot(page, ti, 'user-menu');

  // ⚙️ הגדרות — the island, with the four settings Task 4 ships
  await menu.getByRole('menuitem', { name: 'הגדרות' }).click();
  const dlg = page.getByRole('dialog').filter({ hasText: 'הגדרות' });
  await expect(dlg.getByRole('combobox', { name: 'מסך פתיחה' })).toBeVisible();
  await expect(dlg.getByRole('radiogroup', { name: 'תיאור משימות בכרטיס' })).toBeVisible();
  await expect(dlg.getByRole('radiogroup', { name: 'פונט' })).toBeVisible();
  await expect(dlg.getByRole('radiogroup', { name: 'מצב תצוגה' })).toBeVisible();
  await shot(page, ti, 'settings');

  // A change lands locally even though the remote write is refused (mock mode has no pass).
  await dlg.getByRole('radio', { name: 'מלא' }).click();
  await expect(dlg.getByRole('radio', { name: 'מלא' })).toHaveAttribute('aria-checked', 'true');

  expectNoConsoleErrors(rec);
});
