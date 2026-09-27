// The app shell (spec §6 header, §7k #3 the ⋯ sheet, §7h הגדרות).
// Covers: the bottom tab bar (phone only — `md:hidden`; desktop gets #sigma-desktop-nav's
// sticky top-tab row, U6), the labelled ⋯ עוד sheet and its ניהול block, the ● user chip
// menu, and the ⚙️ הגדרות island the menu opens.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, skipKnownMobile360, test } from './_helpers';

// mobile-360-known.json ratchet (Opus audit round 4 item 3) — see _helpers.ts.
test.beforeEach(({}, testInfo) => skipKnownMobile360(testInfo));

test('shell: the bottom nav is the phone\'s, the legacy nav is the desktop\'s', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);
  await expectRtl(page);

  const nav = page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]');
  await expect(nav).toBeAttached();
  // The island always mounts; `body.sigma-nav-ready` is what css/app.css keys the legacy
  // nav's phone-only hiding off (so a bundle that never loads keeps the old nav).
  await expect(page.locator('body')).toHaveClass(/sigma-nav-ready/);

  // Every mobile project (390/360/412) is a phone concern — only desktop-1440 gets the
  // top-tab row (U6: mobile-360/412 used to fall into the "else" desktop branch below, which
  // asserted a desktop nav that never renders under 768px).
  if (viewport.startsWith('mobile')) {
    await expect(nav).toBeVisible();
    // other roles (עידן here): קיבוצים · יומן · [ביקור] · מלאי · עוד — 22.9 QA round 2 Package A
    // §3: 🗓 יומן took the "רעיון / באג" slot, feedback moved into ⋯ עוד only.
    for (const label of ['קיבוצים', 'יומן', 'מלאי', 'עוד']) {
      await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('button', { name: 'רעיון / באג', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'תיעוד ביקור' })).toBeVisible();
    // the tab you are on is announced, not only coloured
    await expect(nav.getByRole('button', { name: 'קיבוצים', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.page-nav')).toHaveCount(0);
  } else {
    await expect(nav).toBeHidden();
    await expect(page.locator('.page-nav')).toHaveCount(0);
    await expect(page.locator('#visitFab')).toHaveCount(0);
    const desktopNav = page.locator('#sigma-desktop-nav nav[aria-label="ניווט ראשי"]');
    await expect(desktopNav).toBeVisible();
    await expect(desktopNav.getByRole('button', { name: 'קיבוצים', exact: true })).toHaveAttribute('aria-current', 'page');
  }

  await shot(page, ti);
  expectNoConsoleErrors(rec);
});

test('shell: אביאם/ניתאי get נוכחות · יומן · [ביקור] · קיבוצים · עוד, מלאי moves into ⋯', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'אביאם' });
  test.skip(viewport !== 'mobile-390', 'the bar order is a phone concern');

  const nav = page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]');
  await expect(nav).toBeVisible();
  // The raised 📍 button carries its label via `aria-label`, not visible text (an icon-only
  // button), so its accessible NAME is asserted instead of allInnerTexts() for that one slot.
  const order = ['נוכחות', 'יומן', 'תיעוד ביקור', 'קיבוצים', 'עוד'];
  const names = await nav.getByRole('button').evaluateAll(
    els => els.map(el => el.getAttribute('aria-label') || el.textContent || ''),
  );
  order.forEach((label, i) => expect(names[i]).toContain(label));
  await expect(nav.getByRole('button', { name: 'מלאי', exact: true })).toHaveCount(0);

  // מלאי moved into ⋯ עוד and leads the everyday block there (Package A §3).
  await nav.getByRole('button', { name: 'עוד', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'מלאי', exact: true })).toBeVisible();

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
  // 22.9 (F4): מלאי is a tab on the bar, so the sheet does not list it again.
  for (const label of ['יומן', 'הגדרות']) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  // U6: both field-journal registrations (main.tsx AND DayLog.tsx, packages G and R) now carry
  // `tag: 'ניסיוני'` — a re-registration replaces the row, so the tag shows either way, and
  // the row's accessible name is "יומן היום ניסיוני" now, not an exact "יומן היום".
  await expect(sheet.getByRole('button', { name: /^יומן היום/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^יומן היום/ })).toContainText('ניסיוני');
  for (const label of ['מלאי']) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  for (const label of [] as string[]) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  for (const gone of ['משימות', 'משימות EMS', 'עובדים']) {
    await expect(sheet.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
  }
  // …and the management block is behind its own rule, for עידן
  await expect(sheet.getByText('ניהול', { exact: true })).toBeVisible();
  // S-U round 1: registerMoreItem labels dropped their baked-in emoji (the row already carries
  // a lucide icon) — "📈 שימוש" → "שימוש".
  for (const label of ['התראות', 'פיתוח', 'שימוש']) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  // the identity chip is in the sheet on the phone (the header has no room for it) — S-U round 2:
  // a static IdentityRow (avatar/name/role), not a button with its own dropdown menu.
  await expect(sheet.getByText('עידן', { exact: true })).toBeVisible();

  await shot(page, ti, 'more-sheet');

  // A row navigates and closes the sheet.
  await sheet.getByRole('button', { name: 'יומן', exact: true }).click();
  await expect(page.locator('#calendar-view')).toBeVisible();
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

test('shell: the ⚙️ gear bubble opens GearSheet (identity/role, settings, feedback, האזור האישי, user switch)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { ready: '#sigma-header-actions [aria-label="הגדרות"]' });

  // Round 5, U1–U2 (designer must-fix "no absolute positioning in the header"): the name chip
  // is gone from the header cluster — ⚙️ is an icon-only bubble that opens a real Sheet, not a
  // position:absolute dropdown.
  const gear = page.locator('#sigma-header-actions').getByRole('button', { name: 'הגדרות' });
  await expect(gear).toBeVisible();

  await gear.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('עידן');
  await expect(sheet.getByRole('button', { name: 'הגדרות' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'האזור האישי' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'רעיון או באג' })).toBeVisible();
  // spec 2026-09-23 ems-session: staff are signed in WITH EMS, so the sheet never offers a
  // connect / disconnect row (not even in mock mode, where there is no EMS token)
  await expect(sheet.getByRole('button', { name: /EMS/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'החלפת משתמש' })).toBeVisible();
  await shot(page, ti, 'gear-sheet');

  // ⚙️ הגדרות — the island, with the four settings Task 4 ships
  await sheet.getByRole('button', { name: 'הגדרות' }).click();
  const dlg = page.getByRole('dialog').filter({ hasText: 'הגדרות' });
  // round 5 G-L5/G-U (Settings rewrite): מסך פתיחה is no longer a native <select> — it is a
  // ListRow that pushes a sub-pane of radio-styled rows (Settings.tsx LandingPane), like every
  // other "opens a sub-sheet" row in this dialog.
  await dlg.getByRole('button', { name: 'מסך פתיחה' }).click();
  await expect(dlg.getByTestId('landing-options').getByRole('button')).not.toHaveCount(0);
  await dlg.getByRole('button', { name: 'חזרה להגדרות' }).click();
  await expect(dlg.getByRole('radiogroup', { name: 'תיאור משימות בכרטיס' })).toBeVisible();
  // round 5 G-L5: the font picker is gone
  await expect(dlg.getByRole('radiogroup', { name: 'פונט' })).toHaveCount(0);
  await expect(dlg.getByRole('radiogroup', { name: 'מצב תצוגה' })).toBeVisible();
  await shot(page, ti, 'settings');

  // A change lands locally even though the remote write is refused (mock mode has no pass).
  await dlg.getByRole('radio', { name: 'מלא' }).click();
  await expect(dlg.getByRole('radio', { name: 'מלא' })).toHaveAttribute('aria-checked', 'true');

  expectNoConsoleErrors(rec);
});

test('shell: the identity row shows the first name on the phone, not just the initial', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);
  test.skip(viewport !== 'mobile-390', 'Package O §1 — the phone used to shrink to "ע"');

  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  // S-U round 2: IdentityRow is a static row (avatar/name/role), not a button.
  const chip = page.getByRole('dialog').getByText('עידן', { exact: true }).first();
  await expect(chip).toBeVisible();
  // The whole first name, not the single-letter initial the phone chip used to fall back to.
  await expect(chip).toHaveText(/עידן/);
  await expect(chip).not.toHaveText(/^ע$/);

  expectNoConsoleErrors(rec);
});
