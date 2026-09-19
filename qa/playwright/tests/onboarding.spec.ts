// 🆕 onboarding checklist (Task 27, company-process spec §4). End to end over the real
// `onboarding_steps` store (_helpers.ts) seeded for the fixture 🆕 קליטה קיבוצים: a card
// shows 0/9, tapping the first (non-waits) step marks it done and the bar reads 1/9; the
// Settings ordered-list editor is visible to עידן only.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

const openSettings = async (page: any) => {
  await page.waitForSelector('#sigma-settings[data-sigma-mounted="1"]', { state: 'attached' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-settings')));
  const dlg = page.getByRole('dialog').filter({ hasText: 'הגדרות' });
  await expect(dlg).toBeVisible();
  return dlg;
};

test('onboarding: 🆕 card shows 0/9 → tap step → done → 1/9', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  const card = page.locator('.kibbutz[data-name="גבת"]');
  await expect(card).toBeVisible();
  const strip = card.locator('[data-testid="onboarding-strip"]');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('0/9');
  await shot(page, ti, 'card-0-9');

  await strip.locator('.onboarding-next-step').click();
  await expect(strip).toContainText('1/9');
  await shot(page, ti, 'card-1-9');

  // an active (✅) card never shows the strip at all
  const activeCard = page.locator('.kibbutz[data-name="חוקוק"]');
  await expect(activeCard.locator('[data-testid="onboarding-strip"]')).toHaveCount(0);

  await expectRtl(page);
  await expectNoConsoleErrors(rec);
});

test('onboarding: a waits step goes to waiting before done', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  const card = page.locator('.kibbutz[data-name="שדה אליהו"]');
  const strip = card.locator('[data-testid="onboarding-strip"]');
  await expect(strip).toBeVisible();

  // step 1 (ems_site, non-waits) → done; the new next step (customer_list, waits) starts
  // open, not waiting, until it is itself tapped.
  await strip.locator('.onboarding-next-step').click();
  await expect(strip).toContainText('1/9');
  await expect(strip.locator('.onboarding-next-step')).toContainText('קבלת רשימת לקוחות');
  await expect(strip.locator('.onboarding-next-step')).not.toContainText('⏳');

  // tapping it now sends it to waiting (not done) — the progress count does not move
  await strip.locator('.onboarding-next-step').click();
  await expect(strip).toContainText('1/9');
  await expect(strip.locator('.onboarding-next-step')).toContainText('⏳');

  await expectNoConsoleErrors(rec);
});

test('onboarding: template editor — עידן only', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  const dlg = await openSettings(page);
  await expect(dlg.getByTestId('onboarding-template-editor')).toBeVisible();
  await shot(page, ti, 'template-editor-idan');
  await expectNoConsoleErrors(rec);
});

test('onboarding: template editor hidden for a non-עידן admin', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עמיחי' });
  const dlg = await openSettings(page);
  await expect(dlg.getByTestId('onboarding-template-editor')).toHaveCount(0);
  await expectNoConsoleErrors(rec);
});
