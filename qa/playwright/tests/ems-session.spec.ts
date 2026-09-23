// Spec 2026-09-23 ems-session (עידן's ruling, 23.9): staff sign in WITH EMS and the app is
// connected from then on. No surface offers "connect to EMS"; a lapsed session FREEZES the app
// behind one blocking re-login that cannot be dismissed, and what the person typed survives.
import { boot, expect, shot, test } from './_helpers';

const CONNECT_COPY = /התחבר ל-EMS|חבר ל-EMS|להתחבר ל-EMS|התחברות ל-EMS|אין חיבור ל-EMS|לא מחובר ל-EMS|מחובר ל-EMS/;

test('the pass expires mid-session → one blocking re-login, the draft survives', async ({ page }, testInfo) => {
  await boot(page, testInfo, {
    storage: {
      visitDrafts_v3: JSON.stringify({
        'עידן|גבים|2026-09-23': {
          id: 'draft-ems-session', person: 'עידן', kibbutz: 'גבים', date: '2026-09-23',
          updated_at: '2026-09-23T09:41:00.000Z', payload: { summary: 'חצי סיכום' },
        },
      }),
    },
  });

  // Something typed and not saved, on the page the person is on.
  await page.evaluate(() => {
    const ta = document.createElement('textarea');
    ta.id = 'unsaved-probe';
    document.body.prepend(ta);
  });
  await page.locator('#unsaved-probe').fill('טקסט שלא נשמר');

  // The session lapses: the EMS token is gone and the bridge pass is dead. Mock mode is dropped
  // so the funnel treats this like the live app does.
  await page.evaluate(() => {
    history.replaceState({}, '', location.pathname + '?sb=0');
    localStorage.removeItem('ems_token_v1');
    localStorage.removeItem('ems_token_at_v1');
    const w = window as any;
    w._sbToken = null; w._sbTokenExp = 0; w._sbPassPending = false; w._sbPassMintedAt = 0; w._sigmaExpiryAt = 0;
  });
  // The phone comes back to the tab (the watcher also runs on focus and once a minute).
  await page.evaluate(() => (window as any).sigmaCheckSession('spec'));

  const sheet = page.locator('[data-sigma-relogin]');
  await expect(sheet).toHaveCount(1);
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('נדרשת התחברות מחדש');
  await expect(sheet).toContainText('09:41');                // the draft is named
  await expect(sheet.getByRole('button', { name: /close/i })).toHaveCount(0);

  // Full screen and on top of everything.
  const box = await sheet.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.height).toBeGreaterThanOrEqual(vp.height - 2);
  const z = await sheet.evaluate(el => Number(getComputedStyle(el).zIndex));
  expect(z).toBeGreaterThan(100000);

  // Cannot be dismissed: Esc, a tap at the edge, and a second expiry do not close / duplicate it.
  await page.keyboard.press('Escape');
  await page.mouse.click(4, 4);
  await page.evaluate(() => (window as any).sigmaSessionExpired('sb-401'));
  await expect(sheet).toHaveCount(1);
  await expect(sheet).toBeVisible();
  await shot(page, testInfo, 'frozen');

  // What was typed is still there underneath, and the saved draft too.
  await expect(page.locator('#unsaved-probe')).toHaveValue('טקסט שלא נשמר');
  expect(await page.evaluate(() => localStorage.getItem('visitDrafts_v3'))).toContain('draft-ems-session');

  // The only way out is the sign-in, which remembers the place.
  await sheet.getByRole('button', { name: /התחבר מחדש/ }).click();
  await expect(page.locator('#emsLoginGate')).toBeVisible();
  await expect(page.locator('#unsaved-probe')).toHaveValue('טקסט שלא נשמר');
});

test('no "connect to EMS" copy anywhere for staff', async ({ page }, testInfo) => {
  for (const who of ['עידן', 'אביאם', 'עמיחי'] as const) {
    await boot(page, testInfo, { who });
    for (const p of ['kibbutz', 'inventory', 'attendance', 'calendar', 'burns', 'hours', 'dev']) {
      await page.evaluate(pg => { try { (window as any).showPage(pg); } catch { /* not for this role */ } }, p);
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, `${who} · ${p}`).not.toMatch(CONNECT_COPY);
    }
    // the user menu (header on desktop, inside ⋯ on the phone)
    const viewport = (testInfo.project.metadata as any).viewport as string;
    await page.evaluate(() => (window as any).showPage('kibbutz'));
    if (viewport === 'mobile-390') {
      await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
    }
    const chip = page.getByRole('button', { name: new RegExp(who) }).first();
    if (await chip.count()) {
      await chip.click();
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, `${who} · user menu`).not.toMatch(CONNECT_COPY);
    }
  }
});
