// The viewer's shell (spec §7l + §7k #3 + viewerGate).
// Covers: the three-tab bottom nav 🏘 קיבוצים · 📊 דוחות · ⋯ עוד, that 📊 scrolls to the
// reports hub on the cards page, and that the viewer's ⋯ sheet carries no page rows and no
// ניהול block — a read-only role must not be offered a write it would be refused.
import { boot, expect, expectNoConsoleErrors, expectRtl, expectTheme, shot, test } from './_helpers';

test('viewer shell: 🏘 · 📊 · ⋯ and nothing else', async ({ page }, ti) => {
  const { rec, theme, viewport } = await boot(page, ti, { who: 'צפייה' });
  await expectRtl(page);
  await expectTheme(page, theme);

  const nav = page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]');
  await expect(nav).toBeAttached();

  await shot(page, ti);
  // The bottom nav is `md:hidden`, so its tabs are not VISIBLE on the desktop and the legacy
  // .page-nav is what the viewer uses there (covered by nav-shell.spec.ts).
  test.skip(viewport !== 'mobile-390', 'the viewer bottom nav is the phone surface');

  // Exactly three tabs, in this order (Nav.tsx: `isViewer ? קיבוצים · דוחות · עוד`).
  const tabs = nav.getByRole('button');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveText('קיבוצים');
  await expect(tabs.nth(1)).toHaveText('דוחות');
  await expect(tabs.nth(2)).toHaveText('עוד');
  // the field actions are gone — no 🚚 תעודה, no raised 📍 ביקור, no 📦 מלאי
  await expect(nav.getByRole('button', { name: 'תעודה', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'תיעוד ביקור' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'מלאי', exact: true })).toHaveCount(0);

  // 📊 דוחות → the cards page, scrolled to the hub (the one landing that is not a page)
  await page.getByRole('button', { name: 'קיבוצים', exact: true }).click();
  await expect(page.locator('#kibbutz-view')).toBeVisible();
  await page.getByRole('button', { name: 'דוחות', exact: true }).click();
  await expect(page.locator('#viewerReportsHub')).toBeVisible();
  await expect(page.locator('#viewerReportsHub')).toBeInViewport();
  await shot(page, ti, 'reports-hub');

  expectNoConsoleErrors(rec);
});

test('viewer shell: the ⋯ sheet offers no pages and no ניהול', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'צפייה' });
  test.skip(viewport !== 'mobile-390', 'the ⋯ sheet is reachable from the phone nav only');

  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();

  // MoreSheet.tsx: `pages: role === 'viewer' ? [] : …` — a viewer gets no page rows at all…
  for (const label of ['יומן', 'מלאי', 'משימות EMS', 'עובדים', 'פיתוח', 'התראות']) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(sheet.getByText('ניהול', { exact: true })).toHaveCount(0);
  // …but the everyday rows every role has are there, labelled
  await expect(sheet.getByRole('button', { name: 'הגדרות', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '📣 רעיון / באג / תלונה', exact: true })).toBeVisible();
  // and the identity chip says who he is
  await expect(sheet.getByRole('button', { name: /צפייה/ })).toBeVisible();

  await shot(page, ti, 'more-sheet');
  expectNoConsoleErrors(rec);
});
