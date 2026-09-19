// 📦 מלאי אחוד — the pool view and 🔢 דיווח שינוי במלאי (inventory spec §1, §4b, Task 8).
//
// What only a real browser can answer: the מלאי page really collapsed to ONE column (חברה) and
// the transfer / free-adjust forms are gone from the DOM; the visit form's מלאי מקור offers the
// pool and nothing else; and the 🔢 sheet's recount round trip WRITES BOTH ROWS — the auditable
// `stock_recounts` row and its `חברה → ספירה` movement — with the counted quantity and the note
// on them. The rules themselves are goldens (app/src/lib/inventory.test.ts + stockChange.test.ts)
// and the legacy half is test-inventory-pool.mjs.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';

/** The rows the harness stored, read back through the page (the routes are page-scoped). */
async function rows(page: any, table: string): Promise<any[]> {
  return await page.evaluate(async ([origin, t]: string[]) => {
    const r = await fetch(origin + '/rest/v1/' + t + '?select=*', { headers: { apikey: 'anon' } });
    return await r.json();
  }, [SB_ORIGIN, table]);
}

async function openStockTab(page: any) {
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.locator('[data-inv-tab="stock"]').click();
  await expect(page.getByTestId('inv-pool')).toBeVisible({ timeout: 15_000 });
}

test('the מלאי page is ONE pool — and the retired forms are not in the DOM', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openStockTab(page);

  const pool = page.getByTestId('inv-pool');
  await expect(pool).toContainText('חברה');
  // 40 delivered − 3 supplied on a visit = 37 (js/src/01-data.js mock ledger).
  await expect(pool).toContainText('מונה Landis+Gyr E360PP');
  await expect(pool).toContainText('37');
  // Nobody's name is a location any more.
  for (const person of ['אביאם', 'ניתאי', 'משרד', 'עמיחי']) {
    await expect(pool).not.toContainText(person);
  }
  // The transfer form and the free הוספה/הפחתה card are gone (§1, §4b).
  await expect(page.locator('#transferFrom')).toHaveCount(0);
  await expect(page.locator('#adjustLocation')).toHaveCount(0);
  await expect(page.locator('#invReportChange')).toBeVisible();

  await expectRtl(page);
  await shot(page, ti, 'pool');
  await expectNoConsoleErrors(rec);
});

test('מלאי נמוך is a tappable filter', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openStockTab(page);

  await expect(page.getByTestId('inv-pool')).toContainText('בקר 504');
  await page.locator('[data-kpi="low"]').click();
  // סים 1NCE is 4 in the pool, under its red line; the בקר is not a red-line item at all.
  await expect(page.getByTestId('inv-pool')).toContainText('סים 1NCE');
  await expect(page.getByTestId('inv-pool')).not.toContainText('בקר 504');
  await shot(page, ti, 'low-filter');
  await expectNoConsoleErrors(rec);
});

test('🔢 a recount writes the stock_recounts row AND its חברה → ספירה movement', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openStockTab(page);

  await page.locator('#invReportChange').click();
  const sheet = page.getByTestId('stock-change-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });

  await sheet.getByTestId('sc-product').selectOption('סים 1NCE');
  await sheet.getByTestId('sc-dir-decrease').click();
  await sheet.getByTestId('sc-src-recount').click();
  await sheet.getByTestId('sc-counted').fill('1');
  await sheet.getByTestId('sc-note').fill('נספר במחסן');
  await expectRtl(page);
  await shot(page, ti, 'recount');
  await sheet.getByTestId('sc-submit').click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  const recounts = await rows(page, 'stock_recounts');
  expect(recounts).toHaveLength(1);
  expect(recounts[0].product).toBe('סים 1NCE');
  expect(recounts[0].counted).toBe(1);
  expect(recounts[0].before).toBe(4);
  expect(recounts[0].delta).toBe(-3);
  expect(recounts[0].note).toBe('נספר במחסן');

  const moves = await rows(page, 'movements');
  expect(moves).toHaveLength(1);
  expect(moves[0].from_location).toBe('חברה');
  expect(moves[0].to_location).toBe('ספירה');
  expect(moves[0].quantity).toBe(3);
  expect(moves[0].reason).toBe('recount');
  expect(String(moves[0].ref_id)).toMatch(/^rc-/);

  await expectNoConsoleErrors(rec);
});

test('🔢 a decrease that went out on a visit ROUTES to the visit form — it writes nothing', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openStockTab(page);

  await page.locator('#invReportChange').click();
  const sheet = page.getByTestId('stock-change-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await sheet.getByTestId('sc-product').selectOption('בקר 504');
  await sheet.getByTestId('sc-dir-decrease').click();
  await sheet.getByTestId('sc-src-visit').click();
  await sheet.getByTestId('sc-submit').click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  expect(await rows(page, 'movements')).toHaveLength(0);
  expect(await rows(page, 'stock_recounts')).toHaveLength(0);
  await expectNoConsoleErrors(rec);
});

test('the visit form supplies from חברה and from nowhere else', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await page.waitForSelector('#sigma-home .kibbutz');

  const values = await page.evaluate(() => {
    const sel = document.getElementById('visitSource') as HTMLSelectElement | null;
    return sel ? Array.from(sel.options).map(o => o.value) : [];
  });
  expect(values).toEqual(['חברה']);
  await expectNoConsoleErrors(rec);
});
