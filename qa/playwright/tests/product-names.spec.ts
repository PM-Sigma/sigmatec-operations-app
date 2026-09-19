// 🏷️ Product display names (inventory spec §3, Task 9) — the products page + export wiring.
//
// What only a real browser can answer: the modal's display-name field is really disabled for
// a non-עידן user (not just "the code has an isIdan() check somewhere"), and the export
// builders — loaded straight out of js/app.js, not re-implemented here — really substitute
// the display name for the technical name once one is set. The role×forReport matrix itself
// is a golden (app/src/lib/productLabel.test.ts) and the no-leak contract is test-exports.mjs;
// this file is the live proof those wires are actually connected in the running app.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

async function openProducts(page: any) {
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.locator('[data-inv-tab="products"]').click();
  await expect(page.locator('#invProductsList table')).toBeVisible({ timeout: 15_000 });
}

test('עידן can edit the display name', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openProducts(page);

  // 🔗 wiring status is visible on the page (spec §3 "make the wiring visible").
  await expect(page.locator('#invProductsList')).toContainText('מחובר למחולל הדוחות');

  await page.locator('#invProductsList .inv-btn.small').first().click();   // ✏️ ערוך on the first row
  await expect(page.locator('#invProductModal')).toHaveClass(/open/);

  const dn = page.locator('#invProductDisplayName');
  await expect(dn).toBeEnabled();
  await dn.fill('מונה חשמל תלת-פאזי');
  await expect(dn).toHaveValue('מונה חשמל תלת-פאזי');

  await expectRtl(page);
  await shot(page, ti, 'idan-editable');
  await expectNoConsoleErrors(rec);
});

test('אביאם cannot edit the display name', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openProducts(page);

  await page.locator('#invProductsList .inv-btn.small').first().click();   // ✏️ ערוך
  await expect(page.locator('#invProductModal')).toHaveClass(/open/);

  const dn = page.locator('#invProductDisplayName');
  await expect(dn).toBeDisabled();

  // The technical-name field stays open to staff, unlike display_name (spec §3).
  await expect(page.locator('#invProductName')).toBeEnabled();

  await expectRtl(page);
  await shot(page, ti, 'aviam-locked');
  await expectNoConsoleErrors(rec);
});

test('an export substitutes the display name for the technical name once one is set', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  const spec = await page.evaluate(() => {
    const w = window as any;
    const products = (w.SHEET_DATA && w.SHEET_DATA.products) || [];
    const meter = products.find((p: any) => p.name === 'מונה Landis+Gyr E360PP');
    meter.display_name = 'מונה חשמל תלת-פאזי';
    const map = w.xlProductMapFromSheet();
    return w.xlBuildVisits(
      [{ date: '2026-09-01', kibbutz: 'דפנה', products: [{ name: meter.name, qty: 1 }] }],
      map,
    );
  });

  const text = JSON.stringify(spec.rows);
  expect(text).toContain('מונה חשמל תלת-פאזי');
  expect(text).not.toContain('מונה Landis+Gyr E360PP');

  await expectNoConsoleErrors(rec);
});
