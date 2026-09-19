// 🔔 התראות מלאי + 🧾 הזמנות פתוחות + 🎚 מינימום מלאי (inventory spec §4a, §5). Task 10.
//
// What only a real browser can answer: the bell really reaches the header and really lists the
// rows the database holds (a low-stock row among them), marking one seen really writes it, the
// orders strip really renders its stages and its computed note on the מלאי page, and the red-line
// editor is really gated — עידן has it, אביאם does not.
//
// The words and the sorting are goldens (app/src/lib/alerts.test.ts, orderStrip.test.ts).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';

async function rows(page: any, table: string): Promise<any[]> {
  return await page.evaluate(async ([origin, t]: string[]) => {
    const r = await fetch(origin + '/rest/v1/' + t + '?select=*', { headers: { apikey: 'anon' } });
    return await r.json();
  }, [SB_ORIGIN, table]);
}

async function openInventory(page: any) {
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.locator('[data-inv-tab="stock"]').click();
  await expect(page.getByTestId('inv-pool')).toBeVisible({ timeout: 15_000 });
}

test('the bell lists what moved — low stock included — and marking one seen sticks', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  const bell = page.getByTestId('alerts-bell');
  await expect(bell).toBeVisible({ timeout: 15_000 });
  // Two of the three fixture rows are unseen for עידן (the third was seen by עמיחי only → 3).
  await expect(page.getByTestId('alerts-badge')).toHaveText(/3/);

  await bell.click();
  const list = page.getByTestId('alerts-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list).toContainText('מלאי נמוך: סים 1NCE');
  await expect(list).toContainText('חברה → חוקוק');
  await expect(list).toContainText('סיכום ביקור');

  await expectRtl(page);
  await shot(page, ti, 'bell');

  await list.getByLabel('סמן כנקרא').first().click();
  await expect(page.getByTestId('alerts-badge')).toHaveText(/2/, { timeout: 15_000 });
  const alerts = await rows(page, 'inventory_alerts');
  expect(alerts.find(a => a.id === 'ia-1').seen_by).toContain('עידן');

  await expectNoConsoleErrors(rec);
});

test('the viewer has no bell', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await expect(page.getByTestId('alerts-bell')).toHaveCount(0);
  await expectNoConsoleErrors(rec);
});

test('the מלאי page shows the open orders as a strip with its stages and one note', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openInventory(page);

  const strip = page.getByTestId('order-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  // The mock ledger has one open supplier order: arrived, from לנדיס (js/src/01-data.js).
  await expect(strip).toContainText('לנדיס');
  await expect(strip).toContainText('הגיע — לסמן סופק כדי שייכנס למלאי');
  await expect(strip.locator('[data-order-row]')).toHaveCount(1);

  await expectRtl(page);
  await shot(page, ti, 'order-strip');
  await expectNoConsoleErrors(rec);
});

test('🎚 the red line is עידן and עמיחי only, and an edit is written', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openInventory(page);

  await page.getByTestId('minqty-open').click();
  const list = page.getByTestId('minqty-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list).toContainText('בקר 504');

  await list.locator('[data-minqty="בקר 504"]').fill('8');
  await list.locator('[data-minqty="בקר 504"]').blur();
  await expect.poll(async () => (await rows(page, 'products')).find(p => p.name === 'בקר 504').min_qty)
    .toBe(8);

  await shot(page, ti, 'min-qty');
  await expectNoConsoleErrors(rec);
});

test('אביאם cannot set a red line', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openInventory(page);
  await expect(page.getByTestId('order-strip')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('minqty-open')).toHaveCount(0);
  await expectNoConsoleErrors(rec);
});

// A2 — the bell is app chrome, not card-home chrome. It used to live inside `#kibbutz-view`
// (index.html), so `showPage('inventory')` hid it: on the very screen it belongs to it
// measured 0×0 and this click timed out. The four projects run this at 390 and at 1440.
test('the bell is visible and clickable on the מלאי page too', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openInventory(page);

  const bell = page.getByTestId('alerts-bell');
  await expect(bell).toBeVisible({ timeout: 15_000 });
  const box = await bell.boundingBox();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  await bell.click();
  await expect(page.getByTestId('alerts-list')).toBeVisible({ timeout: 15_000 });

  // …and the rest of the header cluster came along. The legacy #userBadge / #emsBubble are
  // hidden by `body.sigma-header-ready` once the island replaces them, so the thing to assert
  // is the island itself — the Ctrl+K trigger, the context add and the user chip.
  await expect(page.locator('#sigma-header-actions')).toBeVisible();
  await expect(page.locator('#sigma-header-actions')).not.toBeEmpty();

  await expectNoConsoleErrors(rec);
});
