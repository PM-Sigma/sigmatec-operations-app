// L1c (part 1): stock/kibbutz/returns flows characterized on the OLD screen — F10–F13, F24.
// F10's pool/recount round trip is already covered end-to-end by qa/playwright/tests/
// inventory-pool.spec.ts (same fixture numbers); this file adds only what that one doesn't:
// the KPI tap-filter values and the low-stock banner/task-line split (F24).
import { test, expect } from '../_helpers';
import { bootInv, driverFor } from './_inv-driver';
import { ledger } from './_inv-ledger';

const d = driverFor();

test('F10 pool KPIs: 4 items, 55 units, 1 low; tapping low leaves only PM135', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');
  expect(await d.kpi(page, 'items')).toBe(4);
  expect(await d.kpi(page, 'units')).toBe(55);
  expect(await d.kpi(page, 'low')).toBe(1);
  await d.tapKpi(page, 'low');
  const names = await d.poolNames(page);
  expect(names).toEqual(['מונה PM135']);
});

test('F11 CSVs are byte-identical to today', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');
  expect(await d.download(page, 'pool-csv')).toBe(
    '﻿"פריט","חברה"\n"בקר 504","12"\n"מונה Landis+Gyr E360PP","37"\n"מונה PM135","2"\n"סים 1NCE","4"',
  );
  await d.openTab(page, 'kibbutz');
  expect(await d.download(page, 'kibbutz-csv')).toBe(
    '﻿"קיבוץ","מונה Landis+Gyr E360PP","סה""כ"\n"חוקוק","3","3"',
  );
});

test('F12 kibbutz view: חוקוק holds 3 of the E360PP', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'kibbutz');
  expect(await d.kibbutzQty(page, 'חוקוק', 'מונה Landis+Gyr E360PP')).toBe(3);
});

test('F13 restock credits קיבוץ → חברה once; תקול only patches the row', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'returns');
  await d.restock(page, 'ret-1');
  let l = await ledger(page);
  expect(l).toContainEqual(expect.objectContaining({
    table: 'movements',
    row: { product: 'מונה Landis+Gyr E360PP', from_location: 'חוקוק', to_location: 'חברה', quantity: 1, reason: 'return_restock', ref_id: 'ret-1', created_by: 'עידן' },
  }));
  expect(l).toContainEqual(expect.objectContaining({ table: 'returns', match: 'ret-1', row: { status: 'restocked' } }));

  await d.defective(page, 'ret-2');
  l = await ledger(page);
  expect(l).toContainEqual(expect.objectContaining({ table: 'returns', match: 'ret-2', row: { status: 'defective' } }));
  // no movement was posted for the תקול decision
  expect(l.filter(r => r.table === 'movements' && r.row.ref_id === 'ret-2')).toEqual([]);
});

test('F24 the low-stock banner (אביאם/עמיחי) vs the company-task line (everyone else)', async ({ page }, ti) => {
  await bootInv(page, ti, 'אביאם', d);
  await expect(page.locator('#lowStockBanner')).toContainText('מונה PM135: נותרו 2');
  await expect(page.locator('#lowStockBanner')).toContainText('קו אדום 5');
});

// GAP found while characterizing (not a bug this package owns): renderLowStockAlert()'s "everyone
// else" branch (js/src/08-inventory.js:69) targets `.company-task-group.orders ol`, but no element
// with that class exists anywhere in index.html or any renderer — `document.querySelector` returns
// null and the whole branch is a silent no-op. So today, for anyone but אביאם/עמיחי, the red-line
// meter shortage has NO visible surface at all (D11 in the spec says "keep both systems", which
// assumes the task-line one actually renders). Reported in the L-task summary; not fixed here.
test('F24b עידן: the "everyone else" task-line target does not exist — no banner, no crash', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await expect(page.locator('#lowStockBanner')).toHaveCount(0);
  expect(await page.locator('.company-task-group').count()).toBe(0);
});
