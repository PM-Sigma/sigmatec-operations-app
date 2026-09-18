// Session & access hardening (spec §7n) in a real browser, on all four projects
// (desktop 1440 + mobile 390, light + dark).
//
// Three journeys:
//   1. the token dies on the inventory page → ONE sheet, whatever else was in flight;
//   2. the hand-over keeps the page, the scroll position and the draft, and a fresh sign-in
//      lands back on the same page with the draft still there;
//   3. no sign-in at all → the cards are replaced by the sign-in card (no data on screen).
import { boot, expect, expectNoConsoleErrors, expectRtl, installRoutes, shot, test } from './_helpers';

const DRAFT = {
  'עידן|גבים|2026-09-18': {
    id: 'draft-task21', person: 'עידן', kibbutz: 'גבים', date: '2026-09-18',
    updated_at: '2026-09-18T14:02:00.000Z', payload: { summary: 'לא נשלח עדיין' },
  },
};

test('an expired session raises ONE sheet and keeps the page + the draft', async ({ page }, testInfo) => {
  const { rec } = await boot(page, testInfo, {
    storage: { visitDrafts_v2: JSON.stringify(DRAFT) },
  });
  await expectRtl(page);

  // …on the inventory page, with something typed and a scroll position.
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.evaluate(() => window.scrollTo(0, 320));

  // The pass dies, and five requests come back 401 at once (the real shape of a screen that
  // refreshed everything it shows).
  const raised = await page.evaluate(() => {
    (window as any)._sbTokenExp = 0;
    (window as any)._sbToken = null;
    return [1, 2, 3, 4, 5].map(() => (window as any).sigmaSessionExpired('sb-401')).filter(Boolean).length;
  });
  expect(raised, 'five concurrent 401s must announce one expiry').toBe(1);

  const sheet = page.locator('[data-sigma-relogin]');
  await expect(sheet).toHaveCount(1);
  await expect(sheet).toContainText('נדרשת התחברות מחדש');
  // the draft is mentioned, so the person knows nothing was lost
  await expect(sheet).toContainText('14:02');
  // and no page has thrown its own error at the user
  await expect(page.locator('#toast.show')).toHaveCount(0);
  await shot(page, testInfo, 'sheet');

  // Hand over to the sign-in: the place is remembered and the gate is up.
  await sheet.getByRole('button', { name: /התחבר מחדש/ }).click();
  await expect(page.locator('#emsLoginGate')).toBeVisible();
  const kept = await page.evaluate(() => ({
    page: sessionStorage.getItem('ems_return_page_v1'),
    scroll: Number(sessionStorage.getItem('ems_return_scroll_v1') || '0'),
    draft: !!localStorage.getItem('visitDrafts_v2'),
  }));
  expect(kept.page).toBe('inventory');
  expect(kept.scroll).toBeGreaterThan(0);
  expect(kept.draft, 'the draft must survive the hand-over').toBe(true);

  expectNoConsoleErrors(rec);
});

test('after signing in again the person lands back on the same page', async ({ page }, testInfo) => {
  await installRoutes(page);
  // The state a successful sign-in leaves behind: an EMS session, and the page to return to.
  await page.addInitScript(() => {
    localStorage.setItem('dashboard_user_v1', 'עידן');
    localStorage.setItem('dashboard_role_v1', 'idan');
    localStorage.setItem('dashboard_auth_v4', 'ok');
    localStorage.setItem('ems_token_v1', 'mock-ems-token');
    localStorage.setItem('ems_token_at_v1', String(Date.now()));
    localStorage.setItem('visitDrafts_v2', JSON.stringify({
      'עידן|גבים|2026-09-18': {
        id: 'draft-task21', person: 'עידן', kibbutz: 'גבים', date: '2026-09-18',
        updated_at: '2026-09-18T14:02:00.000Z', payload: { summary: 'לא נשלח עדיין' },
      },
    }));
    sessionStorage.setItem('ems_return_page_v1', 'inventory');
    sessionStorage.setItem('ems_return_scroll_v1', '320');
    (window as any)._pushPromptShown = true;
    (window as any)._attReminderShown = true;
  });

  // `?sb=0` only: the sign-in mode is ON (no ?login=0), which is how the live app runs.
  await page.goto('/index.html?sb=0', { waitUntil: 'domcontentloaded' });

  // The gate restores the page it was left on.
  await expect
    .poll(() => page.evaluate(() => (window as any)._currentPage), { timeout: 15_000 })
    .toBe('inventory');
  const draft = await page.evaluate(() => localStorage.getItem('visitDrafts_v2'));
  expect(draft, 'the draft is still there after the round trip').toContain('draft-task21');
});

test('no sign-in → no data, just the one step to take', async ({ page }, testInfo) => {
  await installRoutes(page);
  await page.addInitScript(() => {
    // Signed in on this device before, but the EMS session is gone.
    localStorage.setItem('dashboard_user_v1', 'עידן');
    localStorage.setItem('dashboard_role_v1', 'idan');
    localStorage.setItem('dashboard_auth_v4', 'ok');
    localStorage.removeItem('ems_token_v1');
    (window as any)._pushPromptShown = true;
    (window as any)._attReminderShown = true;
  });
  await page.goto('/index.html?sb=0', { waitUntil: 'domcontentloaded' });

  const card = page.locator('#sigma-home [data-sigma-login-required]');
  await expect(card).toHaveCount(1, { timeout: 20_000 });
  await expect(card).toContainText('להתחבר');
  // the cards themselves are NOT on screen
  await expect(page.locator('#sigma-home .kibbutz')).toHaveCount(0);
  await shot(page, testInfo, 'locked');
});
