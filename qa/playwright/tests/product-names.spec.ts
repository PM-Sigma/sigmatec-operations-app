// 🏷️ Product display names (inventory spec §3, Task 9) — the products page + export wiring.
//
// What only a real browser can answer: the modal's display-name field is really disabled for
// a non-עידן user (not just "the code has an isIdan() check somewhere"), and the export
// builders — loaded straight out of js/app.js, not re-implemented here — really substitute
// the display name for the technical name once one is set. The role×forReport matrix itself
// is a golden (app/src/lib/productLabel.test.ts) and the no-leak contract is test-exports.mjs;
// this file is the live proof those wires are actually connected in the running app.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

// The two "עידן can edit / אביאם cannot edit the display name" UI tests drove the LEGACY
// inventory DOM (#invProductsList, [data-inv-tab]) that U10 deleted. Both are covered on the
// React screen by inventory/products.spec.ts F14 (עידן saves a display name) and F14b (אביאם's
// field is disabled), so only the export-substitution wire is kept here.

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
