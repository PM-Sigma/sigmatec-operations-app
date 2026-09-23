// L1a acceptance: the characterization harness itself — fixtures, route stores, write ledger,
// legacy driver. Every later inventory spec (L1b–L1d) is built on exactly this.
import { test, expect } from '../_helpers';
import { bootInv, driverFor } from './_inv-driver';
import { ledger } from './_inv-ledger';

test('harness: pool reads the mock ledger and no write happens on open', async ({ page }, ti) => {
  const d = driverFor();
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');
  expect(await d.poolQty(page, 'מונה Landis+Gyr E360PP')).toBe(37);
  expect(await d.poolQty(page, 'בקר 504')).toBe(12);
  expect(await d.poolQty(page, 'סים 1NCE')).toBe(4);
  expect(await d.poolQty(page, 'מונה PM135')).toBe(2);
  expect(await ledger(page)).toEqual([]);
});

test('harness: the ruled tab list is present, orders open by default', async ({ page }, ti) => {
  const d = driverFor();
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'orders');
  const ids = await d.orderIds(page);
  expect(ids).toEqual(expect.arrayContaining(['ord-s-small', 'ord-s-big', 'ord-c', 'ord-d', 'ord-3']));
  // F01 default filter: open only — ord-old (delivered) and ord-1/ord-2 (delivered) are hidden.
  expect(ids).not.toContain('ord-old');
});
