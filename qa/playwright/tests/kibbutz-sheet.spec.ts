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

test('kibbutz sheet: edit mode opens from inside the card (עידן only, 22.9) with the row and offers ארכוב', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // 22.9 (D2/D10): no ✏️ on the home card; it sits beside the name INSIDE the kibbutz card.
  await expect(page.locator('#sigma-home .kibbutz[data-name="כפר עזה"] button[title="פרטי קיבוץ"]')).toHaveCount(0);
  await page.locator('#sigma-home .kibbutz[data-name="כפר עזה"] .kibbutz-name').click();
  await expect(page.locator('#modalBackdrop')).toHaveClass(/open/);
  await page.locator('#modalTitle .modal-edit-kibbutz').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  await expect(page.locator('#kibName')).toHaveValue('כפר עזה');
  await expect(page.locator('#kibRegion')).toHaveValue('דרום, עוטף עזה והנגב');
  await expect(page.getByRole('radio', { name: '✅ פעיל' })).toHaveAttribute('data-state', 'on');
  // editing never offers the kind toggle — a kibbutz does not become a sub-site here
  await expect(page.getByRole('radio', { name: '↳ תת-אתר של קיבוץ קיים' })).toHaveCount(0);
  // 🗄 ארכב — deletion is archiving, and it asks for the NAME TYPED (22.9 N1: two kibbutzim
  // were archived by a second tap landing on the confirm button).
  await page.getByRole('button', { name: '🗄 ארכב קיבוץ' }).click();
  const confirmBtn = page.getByRole('button', { name: /כן, ארכב את/ });
  await expect(confirmBtn).toBeVisible();
  await expect(confirmBtn).toBeDisabled();
  // a wrong name keeps it locked
  await page.locator('#kibArchiveConfirm').fill('כפר');
  await expect(confirmBtn).toBeDisabled();
  await page.locator('#kibArchiveConfirm').fill('כפר עזה');
  await expect(confirmBtn).toBeEnabled();
  await page.getByRole('button', { name: 'ביטול' }).click();
  await expect(page.getByRole('button', { name: '🗄 ארכב קיבוץ' })).toBeVisible();

  await shot(page, ti, 'edit');
  expectNoConsoleErrors(rec);
});

test('kibbutz sheet: סוגי אנרגיה is disabled for an admin who is not עידן', async ({ page }, ti) => {
  // עמיחי IS a kibbutz admin (KIBBUTZ_ADMINS) but energy types are עידן's alone (§7b).
  const { rec } = await boot(page, ti, { who: 'עמיחי' });

  // 22.9: the ✏️ inside the card is עידן's alone; עמיחי still reaches the sheet through the one api
  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .kibbutz-name').click();
  await expect(page.locator('#modalTitle .modal-edit-kibbutz')).toHaveCount(0);
  await page.evaluate(() => (window as any).sigmaHome.openSheet('חוקוק'));
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

  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .kibbutz-name').click();
  await page.locator('#modalTitle .modal-edit-kibbutz').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  await expect(page.getByText('רק עידן משנה סוגי אנרגיה')).toHaveCount(0);
  const gas = page.getByRole('button', { name: '🔥 גז' });
  await expect(gas).toBeEnabled();
  await gas.click();   // toggles on, no write attempted yet

  expectNoConsoleErrors(rec);
});

test('kibbutz sheet: ✏️ opens ABOVE the kibbutz modal (22.9 N1 — the accidental-archive path)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await page.locator('#sigma-home .kibbutz[data-name="כפר עזה"] .kibbutz-name').click();
  await expect(page.locator('#modalBackdrop')).toHaveClass(/open/);
  await page.locator('#modalTitle .modal-edit-kibbutz').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  // The sheet is the element the finger actually reaches: the legacy .modal-backdrop is
  // z-index 1000, so anything below it was invisible AND untappable — the 22.9 root cause.
  const modalZ = await page.locator('#modalBackdrop').evaluate(el => +getComputedStyle(el).zIndex || 0);
  const sheet = page.getByRole('heading', { name: '✏️ פרטי קיבוץ' }).locator('xpath=ancestor::*[contains(@class,"fixed")][1]');
  const sheetZ = await sheet.evaluate(el => +getComputedStyle(el).zIndex || 0);
  expect(sheetZ).toBeGreaterThan(modalZ);

  // and the archive button really is under the finger, so it must be name-gated
  await page.getByRole('button', { name: '🗄 ארכב קיבוץ' }).click();
  await expect(page.getByRole('button', { name: /כן, ארכב את/ })).toBeDisabled();
  expectNoConsoleErrors(rec);
});

// ───────────── QA round 3 (D2): קוד לקוח · תתי-אתרים · קטגוריה ─────────────

test('kibbutz sheet: קוד לקוח, תתי-אתרים and the one קטגוריה group', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // יגור is the fixture kibbutz that HAS a sub-site (יגור — רפת) and a code in the legacy map.
  await page.locator('#sigma-home .kibbutz[data-name="יגור"] .kibbutz-name').click();
  await page.locator('#modalTitle .modal-edit-kibbutz').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  // קוד לקוח — prefilled from the row, or from the legacy CUSTOMER_CODES map while the
  // column is not applied yet. It is editable, and digits only.
  const code = page.locator('#kibCode');
  await expect(code).toBeVisible();
  await expect(code).toHaveValue('940');
  await code.fill('');
  await code.type('12a3');
  await expect(code).toHaveValue('123');

  // קטגוריה — מדור and 🤝 שיווקי under ONE heading, not two loose controls.
  await expect(page.getByText('קטגוריה', { exact: true })).toBeVisible();
  const cat = page.locator('#kibCategory');
  await expect(cat.getByRole('radio', { name: '✅ פעיל' })).toHaveAttribute('data-state', 'on');
  await expect(cat.getByText('🤝 בתהליך שיווקי')).toBeVisible();

  // תתי-אתרים — the rows filed under this kibbutz, and a ➕ that re-opens the sheet in
  // sub-site mode with יגור already picked as the parent.
  await expect(page.locator('#kibSubsites [data-subsite="יגור — רפת"]')).toBeVisible();
  await shot(page, ti, 'details');

  await page.getByTestId('kib-add-subsite').click();
  await expect(page.getByRole('heading', { name: '➕ קיבוץ חדש' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '↳ תת-אתר של קיבוץ קיים' })).toHaveAttribute('data-state', 'on');
  await expect(page.locator('#kibParent')).toHaveValue('יגור');
  await expect(page.locator('#kibName')).toHaveValue('');

  expectNoConsoleErrors(rec);
});

test('kibbutz sheet: a kibbutz with no sub-sites says so, and the code may be left empty', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await page.locator('#sigma-home .kibbutz[data-name="כפר עזה"] .kibbutz-name').click();
  await page.locator('#modalTitle .modal-edit-kibbutz').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  await expect(page.locator('#kibSubsites')).toContainText('אין תתי-אתרים');
  // כפר עזה is not in the legacy map → the field starts empty, which is allowed
  await expect(page.locator('#kibCode')).toHaveValue('');
  // 🤝 שיווקי is on for this fixture row, and it lives inside the קטגוריה group
  await expect(page.locator('#kibCategory #kibMkt')).toHaveAttribute('data-state', 'checked');

  expectNoConsoleErrors(rec);
});

// ───────────── QA round 4 Package Y (22.9): the EMS chain is gone ─────────────
// עידן: "להעיף את השרשרת בדיקה מול ה-EMS." The sheet writes the row as typed — no "בדוק מול
// EMS" button, no live step panel, no "שמור בלי קישור" gate on a sub-site. `ems_site_ids`
// shows read-only instead.

test('kibbutz sheet: no EMS chain — a sub-site saves straight away, no gate', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await openCreate(page);
  await page.getByRole('radio', { name: '↳ תת-אתר של קיבוץ קיים' }).click();
  await page.locator('#kibParent').selectOption('חוקוק');
  await page.locator('#kibName').fill('חוקוק — מחסן');

  // none of the old chain UI exists any more
  await expect(page.getByText('שרשרת בדיקה מול EMS')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'בדוק מול EMS' })).toHaveCount(0);
  await expect(page.getByText('שמור בלי קישור')).toHaveCount(0);

  // saving hits the write endpoint directly — no chain step stands in the way. The harness
  // answers 401 (no EMS pass in mock mode); that IS the write being attempted.
  await page.getByRole('button', { name: 'שמור תת-אתר' }).click();
  await expect(page.getByText(/שמירה נכשלה|יש להתחבר ל-EMS כדי לשמור/)).toBeVisible();

  await expectNoConsoleErrors(rec);
});

test('kibbutz sheet: אתר EMS is read-only — ✓ מקושר / ⚠️ לא מקושר, no verify button', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // חוקוק ships linked in the fixture (ems_site_ids: ['ems-k1']).
  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .kibbutz-name').click();
  await page.locator('#modalTitle .modal-edit-kibbutz').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  const link = page.getByTestId('kib-ems-link');
  await expect(link).toContainText('✓ מקושר');

  await shot(page, ti, 'ems-link-status');
  expectNoConsoleErrors(rec);
});

test('kibbutz sheet: סוגי אנרגיה is a real multi-select — more than one type at once', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);   // עידן — may edit energy

  await page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .kibbutz-name').click();
  await page.locator('#modalTitle .modal-edit-kibbutz').click();
  await expect(page.getByRole('heading', { name: '✏️ פרטי קיבוץ' })).toBeVisible();

  // חוקוק starts ⚡ חשמל only (fixture). Turning on 💧 מים must not turn ⚡ off.
  const electric = page.getByRole('button', { name: '⚡ חשמל' });
  const water = page.getByRole('button', { name: '💧 מים' });
  await expect(electric).toHaveAttribute('data-state', 'on');
  await expect(water).toHaveAttribute('data-state', 'off');

  await water.click();
  await expect(electric).toHaveAttribute('data-state', 'on');
  await expect(water).toHaveAttribute('data-state', 'on');

  expectNoConsoleErrors(rec);
});
