// KibbutzSheet — the create/edit bottom sheet (spec §2 + §7b).
// Covers: both modes (➕ קיבוץ חדש and ✏️ פרטי קיבוץ), the two kinds (קיבוץ / תת-אתר), איזור is
// required on save, and סוגי אנרגיה is עידן's call alone (disabled for every other admin).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

const openCreate = async (page: any) => {
  // Desktop has the header "קיבוץ חדש" button; the phone reaches the same sheet through the
  // ⋯ עוד row that Home registers. `sigmaHome.openSheet()` is the ONE api both go through
  // (Home.tsx), so driving it directly tests the sheet on both viewports.
  await page.evaluate(() => (window as any).sigmaHome.openSheet());
  await expect(page.getByRole('heading', { name: '➕ קיבוץ חדש' })).toBeVisible();
};

test('kibbutz sheet: create mode, both kinds, איזור required', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await openCreate(page);
  await expectRtl(page);

  // ── kind toggle: קיבוץ (default) shows איזור + מדור; תת-אתר replaces them with קיבוץ-אב
  await expect(page.locator('#kibRegion')).toBeVisible();
  await expect(page.getByRole('radio', { name: '🆕 לקוח חדש' })).toBeVisible();

  await page.getByRole('radio', { name: '↳ תת-אתר של קיבוץ קיים' }).click();
  await expect(page.locator('#kibParent')).toBeVisible();
  await expect(page.locator('#kibRegion')).toHaveCount(0);
  // the parent picker offers the fixture kibbutzim (never the sub-site itself)
  await expect(page.locator('#kibParent option')).toContainText(['-- בחר קיבוץ --', 'חוקוק']);

  await page.getByRole('radio', { name: '🏘 קיבוץ חדש' }).click();
  await expect(page.locator('#kibRegion')).toBeVisible();

  await shot(page, ti, 'create');

  // ── איזור is required: a name + energy but no region must NOT save
  await page.locator('#kibName').fill('בית זרע');
  await page.getByRole('button', { name: 'שמור קיבוץ' }).click();
  await expect(page.getByText('חובה לבחור איזור')).toBeVisible();
  // the sheet stays open — the person keeps what he typed
  await expect(page.locator('#kibName')).toHaveValue('בית זרע');

  // with a region the save is attempted; the harness answers the write 401 (no EMS pass in
  // mock mode), which is the "יש להתחבר" path — never a silent success.
  await page.locator('#kibRegion').fill('גליל וגולן');
  await page.getByRole('button', { name: 'שמור קיבוץ' }).click();
  await expect(page.getByText(/שמירה נכשלה|יש להתחבר ל-EMS כדי לשמור/)).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('kibbutz sheet: edit mode opens with the row and offers ארכוב', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await page.locator('#sigma-home .kibbutz[data-name="כפר עזה"] button[title="פרטי קיבוץ"]').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  await expect(page.locator('#kibName')).toHaveValue('כפר עזה');
  await expect(page.locator('#kibRegion')).toHaveValue('דרום, עוטף עזה והנגב');
  await expect(page.getByRole('radio', { name: '✅ פעיל' })).toHaveAttribute('data-state', 'on');
  // editing never offers the kind toggle — a kibbutz does not become a sub-site here
  await expect(page.getByRole('radio', { name: '↳ תת-אתר של קיבוץ קיים' })).toHaveCount(0);
  // 🗄 ארכב — deletion is archiving, and it asks first
  await page.getByRole('button', { name: '🗄 ארכב קיבוץ' }).click();
  await expect(page.getByRole('button', { name: /כן, ארכב את/ })).toBeVisible();
  await page.getByRole('button', { name: 'ביטול' }).click();
  await expect(page.getByRole('button', { name: '🗄 ארכב קיבוץ' })).toBeVisible();

  await shot(page, ti, 'edit');
  expectNoConsoleErrors(rec);
});

test('kibbutz sheet: סוגי אנרגיה is disabled for an admin who is not עידן', async ({ page }, ti) => {
  // עמיחי IS a kibbutz admin (KIBBUTZ_ADMINS) but energy types are עידן's alone (§7b).
  const { rec } = await boot(page, ti, { who: 'עמיחי' });

  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] button[title="פרטי קיבוץ"]').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  await expect(page.getByText('רק עידן משנה סוגי אנרגיה')).toBeVisible();
  for (const label of ['⚡ חשמל', '💧 מים', '🔥 גז']) {
    await expect(page.getByRole('button', { name: label })).toBeDisabled();
  }
  // the rest of the sheet is still his to edit
  await expect(page.locator('#kibName')).toBeEditable();
  await expect(page.locator('#kibRegion')).toBeEditable();

  await shot(page, ti, 'energy-locked');
  expectNoConsoleErrors(rec);
});

test('kibbutz sheet: עידן may change the energy types', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] button[title="פרטי קיבוץ"]').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  await expect(page.getByText('רק עידן משנה סוגי אנרגיה')).toHaveCount(0);
  const gas = page.getByRole('button', { name: '🔥 גז' });
  await expect(gas).toBeEnabled();
  await gas.click();   // toggles on, no write attempted yet

  expectNoConsoleErrors(rec);
});
