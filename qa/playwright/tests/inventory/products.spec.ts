// L1c (part 2): products flow characterized on the OLD screen — F14.
import { test, expect } from '../_helpers';
import { bootInv, driverFor, DELTAS } from './_inv-driver';
import { ledger } from './_inv-ledger';

const d = driverFor();

test('F14 עידן can save a display name; the write carries it', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'products');
  await d.saveProduct(page, { name: 'פריט חדש לבדיקה', category: 'אחר', active: true, display_name: 'שם לדוח' });
  const l = await ledger(page);
  expect(l).toContainEqual(expect.objectContaining({
    table: 'products', op: 'upsert',
    row: expect.objectContaining({ name: 'פריט חדש לבדיקה', category: 'אחר', active: true, display_name: 'שם לדוח' }),
  }));
});

test('F14b אביאם cannot edit the display name field', async ({ page }, ti) => {
  await bootInv(page, ti, 'אביאם', d);
  await d.openTab(page, 'products');
  expect(await d.displayNameEditable(page, 'p-1')).toBe(false);
});

test('F14c the wiring line is red — no active product carries a display_name in this fixture', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'products');
  expect(await d.wiringOk(page)).toBe(false);
});

test('F14d ' + DELTAS.P13 + ' (legacy blanks name/category; react patches {active} only)', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'products');
  await d.toggleProduct(page, 'p-2');   // בקר 504, currently active → will be set inactive
  const l = await ledger(page);
  expect(l).toContainEqual(
    d.name === 'react'
      ? { table: 'products', op: 'patch', match: 'p-2', row: { active: false } }
      : { table: 'products', op: 'upsert', match: 'p-2', row: { name: '', category: '', active: false } },
  );
});
