// ⚙️ הגדרות (spec §7h) — the rows Task 15 adds on top of Task 4's four: the end-of-day
// reminder hour, 📲 התקנה, 🔔 התראות and 👤 האזור האישי.
//
// What this spec is really about is PERSISTENCE without a server: mock mode has no EMS pass,
// so every write to `user_settings` is refused — and the person's choices still have to
// survive a reload, because the localStorage mirror is what the app reads first on every
// boot. A regression there is invisible in a unit test and obvious to a user.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

const SETTINGS_KEY = 'sigma_settings_v1';

const openSettings = async (page: any) => {
  // The island is a lazy chunk: dispatching before it mounted opens nothing at all, and the
  // failure reads as "the dialog does not exist" rather than as a race.
  await page.waitForSelector('#sigma-settings[data-sigma-mounted="1"]', { state: 'attached' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-settings')));
  const dlg = page.getByRole('dialog').filter({ hasText: 'הגדרות' });
  await expect(dlg).toBeVisible();
  return dlg;
};

const mirror = (page: any) => page.evaluate((k: string) => {
  try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
}, SETTINGS_KEY);

test('settings: the theme choice is the one on the document, and it persists', async ({ page }, ti) => {
  const { rec, theme } = await boot(page, ti, { who: 'אביאם' });
  const other = theme === 'dark' ? 'light' : 'dark';
  const label = other === 'dark' ? 'כהה' : 'בהיר';

  const dlg = await openSettings(page);
  await dlg.getByRole('radio', { name: label }).click();
  // The document, not just the panel — the theme is one token the legacy pages read too.
  await expect(page.locator('html')).toHaveAttribute('data-theme', other);
  await expect(dlg.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true');
  // …and it is stored, which is what the <head> snippet reads before the next first paint.
  // (A reload cannot be asserted here: the harness re-seeds `theme` on every navigation so
  // each project starts in its own theme — that seeding would overwrite the choice.)
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(other);

  expectNoConsoleErrors(rec);
});

test('settings: the end-of-day hour is a field-team row, and it sticks', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });

  const dlg = await openSettings(page);
  const hours = dlg.getByRole('radiogroup', { name: 'תזכורת סוף יום' });
  await expect(hours).toBeVisible();
  // 19:00 until he says otherwise (§7h).
  await expect(dlg.getByRole('radio', { name: '19:00' })).toHaveAttribute('aria-checked', 'true');

  await dlg.getByRole('radio', { name: '18:00' }).click();
  await expect(dlg.getByRole('radio', { name: '18:00' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await mirror(page)).eod_hour).toBe(18);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const again = await openSettings(page);
  await expect(again.getByRole('radio', { name: '18:00' })).toHaveAttribute('aria-checked', 'true');

  await shot(page, ti, 'eod');
  expectNoConsoleErrors(rec);
});

test('settings: nobody outside the field team is offered an end-of-day hour', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  const dlg = await openSettings(page);
  await expect(dlg.getByRole('radiogroup', { name: 'תיאור משימות בכרטיס' })).toBeVisible();
  await expect(dlg.getByRole('radiogroup', { name: 'תזכורת סוף יום' })).toHaveCount(0);
  expectNoConsoleErrors(rec);
});

test('settings: install, notifications and the personal area all say where they stand', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  const dlg = await openSettings(page);

  // 📲 התקנה — headless Chromium fires no `beforeinstallprompt`, so the honest button is the
  // one that explains where the browser menu is. It must still be there and still be usable.
  const install = dlg.getByTestId('settings-install');
  await expect(install).toBeVisible();
  await expect(install).toBeEnabled();

  // 🔔 התראות — permission is 'default' in this harness, so the row offers to turn them on
  // and says, in one short state line, that they are not on yet.
  await expect(dlg.getByTestId('settings-push-enable')).toBeVisible();
  // The exact state depends on the browser: a headless Chromium may report 'default' or
  // 'denied', and neither is a bug. What must be true is that the row SAYS which it is.
  await expect(dlg.getByText(/לא פעיל|חסום|לא נתמך/)).toBeVisible();

  // 👤 האזור האישי — who he is, and the one button that leads to what is still open on him.
  const personal = dlg.getByTestId('settings-personal');
  await expect(personal).toBeVisible();
  await expect(personal).toContainText('אביאם');
  await expect(dlg.getByTestId('settings-open-gaps')).toBeVisible();

  await expectRtl(page);
  await shot(page, ti, 'personal');
  expectNoConsoleErrors(rec);
});

test('settings: no sentence explains the app to the user, or who else sees him (§7h)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  const dlg = await openSettings(page);
  const text = (await dlg.innerText()).replace(/\s+/g, ' ');
  expect(text).not.toMatch(/Supabase|RLS|בדיקה אוטומטית|מחושב|מקושר ל-/);
  expect(text).not.toMatch(/(עמיחי|עידן)[^.]{0,12}(ראה|רואה|יראה)/);
  expectNoConsoleErrors(rec);
});

test('settings r5 · C2: only אביאם sees "לראות גם את המשימות של ניתאי"', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  const dlg = await openSettings(page);
  await expect(dlg.getByTestId('set-cal-peer')).toBeVisible();
  await dlg.getByTestId('set-cal-peer').click();
  await expect.poll(async () => (await mirror(page)).cal_peer_tasks).toBe(true);
  expectNoConsoleErrors(rec);
});

test('settings r5 · C2: ניתאי has no such row', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  const dlg = await openSettings(page);
  await expect(dlg.getByTestId('set-cal-peer')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});
