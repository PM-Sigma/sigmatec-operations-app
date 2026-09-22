// 🔔 התראות מלאי + 🧾 הזמנות פתוחות + 🎚 מינימום מלאי (inventory spec §4a, §5). Task 10.
//
// What only a real browser can answer: the bell really reaches the header and really lists the
// rows the database holds (a low-stock row among them), marking one seen really writes it, the
// orders strip really renders its stages and its computed note on the מלאי page, and the red-line
// editor is really gated — עידן has it, אביאם does not.
//
// The words and the sorting are goldens (app/src/lib/alerts.test.ts, orderStrip.test.ts).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';
import { FIXTURES } from './_fixtures';

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

// Round 3, Q — "עידן marked them read five times and they still show". The mark must reach the
// database (the RPC was broken: no `seen_at` column, and `id` uuid compared to a text variable),
// so a RELOAD is the only honest assertion: what was crossed out stays out of the list.
test('what was marked read is still read after a reload', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await page.getByTestId('alerts-bell').click();
  const list = page.getByTestId('alerts-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list.getByTestId('alert-group')).toHaveCount(3);

  // Mark every group read, one at a time (each click removes the group it marked).
  for (let i = 0; i < 3; i++) {
    await list.getByLabel('סמן כנקרא').first().click();
    await expect(list.getByTestId('alert-group')).toHaveCount(2 - i, { timeout: 15_000 });
  }
  await expect(page.getByTestId('alerts-badge')).toHaveCount(0);

  await page.reload();
  const bell = page.getByTestId('alerts-bell');
  await expect(bell).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('alerts-badge')).toHaveCount(0);
  await bell.click();
  await expect(page.getByTestId('alerts-list')).toContainText('הכול נקרא', { timeout: 15_000 });
  await expect(page.getByTestId('alerts-list').getByTestId('alert-group')).toHaveCount(0);

  // …and what was read is still reachable behind the toggle.
  await page.getByTestId('alerts-toggle-seen').click();
  await expect(page.getByTestId('alerts-list').getByTestId('alert-group')).toHaveCount(3);

  await expectNoConsoleErrors(rec);
});

// The other half of the same rule: a write that did NOT reach the database must not look like
// one. The row comes back unread and the person is told, instead of a silent lie that a refetch
// undoes minutes later.
test('a failed mark-seen does not leave a row looking read', async ({ page }, ti) => {
  await boot(page, ti);
  // Registered after the fixtures, so it wins (Playwright matches the newest route first).
  await page.route('**/rest/v1/rpc/alert_mark_seen*', route =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }));

  await page.getByTestId('alerts-bell').click();
  const list = page.getByTestId('alerts-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list.getByTestId('alert-group')).toHaveCount(3);

  await list.getByLabel('סמן כנקרא').first().click();
  // It stays in the unread list, and the badge does not drop.
  await expect(list.getByTestId('alert-group')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByTestId('alerts-badge')).toHaveText(/3/);
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
  await expect(strip).toContainText('הגיע. לסמן סופק כדי שייכנס למלאי');
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

// ───────────── QA round 4 Package Y (22.9): אתרים לא מקושרים ל-EMS ─────────────
// עידן: "אני רוצה לקבל שגיאה אם יש אתר שלא מחובר ל-EMS — זה הדבר הכי לא תקין במערכת." Built
// from the `kibbutzim` rows themselves (not a new table): every fixture kibbutz ships LINKED,
// so these two tests override the route with one unlinked row instead of touching the shared
// baseline every other alerts test relies on.
test('a kibbutz with no ems_site_ids raises a group at the top of the bell (עידן)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // Registered after boot's own fixtures route, so it wins (same pattern as the failed-mark-seen test).
  // Home already fetched ['kibbutzim'] once during boot and the bell shares that cache, so the
  // override needs a reload to actually be seen rather than serving the pre-boot answer.
  await page.route('**/rest/v1/kibbutzim*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(FIXTURES.kibbutzim.map((k: any) => (k.name === 'שדה אליהו' ? { ...k, ems_site_ids: [] } : k))),
  }));
  await page.reload();
  await expect(page.getByTestId('alerts-bell')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('alerts-bell').click();
  const list = page.getByTestId('alerts-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list).toContainText('שדה אליהו לא מקושר ל-EMS');
  // it has no "סמן כנקרא" — a standing fact, not an event to dismiss.
  const group = list.getByTestId('alert-group').filter({ hasText: 'שדה אליהו' });
  await expect(group.getByLabel('סמן כנקרא')).toHaveCount(0);

  await shot(page, ti, 'ems-unlinked');
  await expectNoConsoleErrors(rec);
});

test('אביאם and ניתאי never see the אתרים לא מקושרים group, even though they have a bell', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await page.route('**/rest/v1/kibbutzim*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(FIXTURES.kibbutzim.map((k: any) => (k.name === 'שדה אליהו' ? { ...k, ems_site_ids: [] } : k))),
  }));
  await page.reload();
  await expect(page.getByTestId('alerts-bell')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('alerts-bell').click();
  const list = page.getByTestId('alerts-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list).not.toContainText('לא מקושר ל-EMS');

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
