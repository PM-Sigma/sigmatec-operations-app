// KibbutzDetail — the open card (round 5, package K-U1). Replaces the legacy kibbutz modal:
// one sheet, two tabs, opened through the ONE door (sigma.openKibbutzModal, K-L3).
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';

const detail = (page: any) => page.locator('[data-testid="kibbutz-detail"]');

test('kibbutz detail: the door opens the React sheet on מצב הקיבוץ, not the legacy modal', async ({ page }, ti) => {
  // The card's own onClick still calls the legacy opener until the closed card is rewired
  // (K-U3/K-U5); this test exercises the door itself, which is K-U1's scope.
  const { rec } = await boot(page, ti);
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).getByRole('heading', { name: 'חוקוק' })).toBeVisible();
  await expect(detail(page).getByRole('radio', { name: 'מצב הקיבוץ' })).toBeChecked();
  await expect(page.locator('#modalBackdrop')).not.toHaveClass(/open/);
  await expectNoConsoleErrors(rec);
});

test('kibbutz detail: the door opens ביקורים from a legacy tab name', async ({ page }, ti) => {
  await boot(page, ti);
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('יגור', 'visit'));
  await expect(detail(page).getByRole('radio', { name: 'ביקורים' })).toBeChecked();
});

test('kibbutz detail: an open before the chunk lands is replayed', async ({ page }, ti) => {
  await page.addInitScript(() => {
    const t = setInterval(() => {
      const s = (window as any).sigma;
      if (s?.openKibbutzModal) { clearInterval(t); s.openKibbutzModal('כפר עזה'); }
    }, 5);
  });
  await boot(page, ti);
  await expect(detail(page).getByRole('heading', { name: 'כפר עזה' })).toBeVisible();
});

test('kibbutz detail: A then B shows B only', async ({ page }, ti) => {
  await boot(page, ti);
  await page.evaluate(() => { const s = (window as any).sigma; s.openKibbutzModal('חוקוק'); s.openKibbutzModal('יגור'); });
  await expect(detail(page).getByRole('heading', { name: 'יגור' })).toBeVisible();
  await expect(detail(page).getByText('חוקוק', { exact: true })).toHaveCount(0);
});

test('kibbutz detail: marketing tag beside ✕, ✏️ for עידן only, closes by ✕ / Esc', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('כפר עזה'));
  const header = detail(page).locator('[data-testid="kibbutz-detail-header"]');
  await expect(header.getByText('בתהליך שיווקי')).toBeVisible();
  await expect(header.getByRole('button', { name: 'פרטי קיבוץ' })).toBeVisible();
  await header.getByRole('button', { name: 'סגירה' }).click();
  await expect(detail(page)).toBeHidden();
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('כפר עזה'));
  await page.keyboard.press('Escape');
  await expect(detail(page)).toBeHidden();
});

test('kibbutz detail: a team member and the viewer get no ✏️', async ({ page }, ti) => {
  for (const who of ['אביאם', 'צפייה'] as const) {
    await boot(page, ti, { who });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
    await expect(detail(page).getByRole('button', { name: 'פרטי קיבוץ' })).toHaveCount(0);
  }
});

test('kibbutz detail: presenter strip is still published', async ({ page }, ti) => {
  await boot(page, ti);
  await page.waitForFunction(() => typeof (window as any).sigma?.presenterStrip === 'function');
});
