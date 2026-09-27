// 📦 מלאי אחוד — the pool view and 🔢 דיווח שינוי במלאי (inventory spec §1, §4b, Task 8).
//
// What only a real browser can answer: the מלאי page really collapsed to ONE column (חברה) and
// the transfer / free-adjust forms are gone from the DOM; the visit form's מלאי מקור offers the
// pool and nothing else; and the 🔢 sheet's recount round trip WRITES BOTH ROWS — the auditable
// `stock_recounts` row and its `חברה → ספירה` movement — with the counted quantity and the note
// on them. The rules themselves are goldens (app/src/lib/inventory.test.ts + stockChange.test.ts).
//
// U10 deleted the legacy #inventoryLegacy tabbed screen this file used to drive directly
// (window.showPage/invShowTab, #transferFrom, #adjustLocation, #invReportChange, [data-inv-tab],
// [data-kpi]) — ported to the React inventory island (app/src/islands/Inventory.tsx and friends),
// driven the same way every other qa/playwright/tests/inventory/*.spec.ts spec is: the
// data-testid contract via _inv-driver.ts's reactDriver. `selectRadix` stays imported — the 🔢
// sheet's own product picker is still StockChange.tsx's real Radix Select, untouched by U10.
import { expect, expectNoConsoleErrors, expectRtl, installRoutes, selectRadix, shot, skipKnownMobile360, test, watchConsole } from './_helpers';
import { bootInv, driverFor } from './inventory/_inv-driver';
import { ledger } from './inventory/_inv-ledger';

const d = driverFor();

// mobile-360-known.json ratchet (Opus audit round 4 item 3) — see _helpers.ts.
test.beforeEach(({}, testInfo) => skipKnownMobile360(testInfo));

test('the מלאי page is ONE pool — and the retired forms are not in the DOM', async ({ page }, ti) => {
  const { rec } = await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');

  const panel = page.getByTestId('inv-panel-stock');
  await expect(panel).toContainText('חברה');
  // 40 delivered − 3 supplied on a visit = 37 (qa/playwright/tests/inventory/_inv-fixtures.ts).
  await expect(panel).toContainText('מונה Landis+Gyr E360PP');
  expect(await d.poolQty(page, 'מונה Landis+Gyr E360PP')).toBe(37);
  // Nobody's name is a location any more — scoped to the pool ROWS themselves, not the whole
  // stock panel: it also embeds the 🧾 open-orders strip (InventoryStrip), whose rows legitimately
  // say "ממתין לאישור עמיחי" (a created-by name, not a stock location).
  const poolText = (await page.locator('[data-testid^="inv-pool-row-"]').allInnerTexts()).join('\n');
  for (const person of ['אביאם', 'ניתאי', 'משרד', 'עמיחי']) {
    expect(poolText).not.toContain(person);
  }
  // The transfer form and the free הוספה/הפחתה card are gone (§1, §4b) — never existed in the
  // React rewrite in the first place, but assert their legacy ids anyway so a regression back to
  // reintroducing them (even accidentally, e.g. a stray legacy mount) would be caught.
  await expect(page.locator('#transferFrom')).toHaveCount(0);
  await expect(page.locator('#adjustLocation')).toHaveCount(0);
  await expect(page.getByTestId('inv-report-change')).toBeVisible();

  await expectRtl(page);
  await shot(page, ti, 'pool');
  await expectNoConsoleErrors(rec);
});

test('מלאי נמוך is a tappable filter', async ({ page }, ti) => {
  const { rec } = await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');

  await expect(page.getByTestId('inv-panel-stock')).toContainText('בקר 504');
  await d.tapKpi(page, 'low');
  // מונה PM135 is 2 in the pool, under its red line (min 5); the בקר is not a red-line item at
  // all, and SIM has no red line any more (round 5 Phase 1, עידן 23.9).
  const names = await d.poolNames(page);
  expect(names).toEqual(['מונה PM135']);
  await shot(page, ti, 'low-filter');
  await expectNoConsoleErrors(rec);
});

test('🔢 a recount writes the stock_recounts row AND its חברה → ספירה movement', async ({ page }, ti) => {
  const { rec } = await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');

  await page.getByTestId('inv-report-change').click();
  const sheet = page.getByTestId('stock-change-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });

  await selectRadix(sheet, 'sc-product', 'סים 1NCE');
  await sheet.getByRole('radio', { name: 'ירד' }).click();
  await sheet.getByRole('radio', { name: 'ספירה מחדש' }).click();
  await sheet.getByTestId('sc-counted').fill('1');
  await sheet.getByTestId('sc-note').fill('נספר במחסן');
  await expectRtl(page);
  await shot(page, ti, 'recount');
  await sheet.getByTestId('sc-submit').click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  const l = await ledger(page);
  expect(l).toContainEqual(expect.objectContaining({
    table: 'stock_recounts',
    row: expect.objectContaining({ product: 'סים 1NCE', counted: 1, before: 4, delta: -3, note: 'נספר במחסן' }),
  }));
  const mov = l.find(r => r.table === 'movements');
  expect(mov?.row).toMatchObject({ from_location: 'חברה', to_location: 'ספירה', quantity: 3, reason: 'recount' });
  expect(String((mov?.row as any)?.ref_id)).toMatch(/^rc-/);

  await expectNoConsoleErrors(rec);
});

test('🔢 a decrease that went out on a visit ROUTES to the visit form — it writes nothing', async ({ page }, ti) => {
  const { rec } = await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');

  await page.getByTestId('inv-report-change').click();
  const sheet = page.getByTestId('stock-change-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await selectRadix(sheet, 'sc-product', 'בקר 504');
  await sheet.getByRole('radio', { name: 'ירד' }).click();
  await sheet.getByRole('radio', { name: 'סיכום ביקור' }).click();
  await sheet.getByTestId('sc-submit').click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  const l = await ledger(page);
  expect(l.filter(r => r.table === 'movements' || r.table === 'stock_recounts')).toEqual([]);
  await expectNoConsoleErrors(rec);
});

test('the visit form supplies from חברה and from nowhere else', async ({ page }, ti) => {
  const { rec } = await bootInv(page, ti, 'עידן', d);
  await page.waitForSelector('#sigma-home .kibbutz');

  const values = await page.evaluate(() => {
    const sel = document.getElementById('visitSource') as HTMLSelectElement | null;
    return sel ? Array.from(sel.options).map(o => o.value) : [];
  });
  expect(values).toEqual(['חברה']);
  await expectNoConsoleErrors(rec);
});

// The legacy characterization here ("🚚 the certificates tab does not repaint on repeated
// renderInventory() calls with unchanged data") called window.invRenderCerts() directly and
// counted DOM mutations via a MutationObserver, to prove a hand-rolled diff-before-innerHTML-
// rebuild guard actually skipped the repaint. U10/U4 deleted that imperative renderer along with
// the rest of the legacy certs UI (js/src/20-delivery-cert.js is trimmed to the data pipeline
// now) — app/src/islands/InventoryCerts.tsx is a normal React component instead, so the
// no-needless-repaint guarantee it characterized is provided by React's own reconciliation
// (unchanged data → unchanged JSX output → no DOM mutation), not by app code this package owns.
// There is no `invRenderCerts()` left to call and no equivalent hand-written guard to
// characterize, so this one is deleted rather than ported.
