// L1b: order flows characterized on the OLD screen (js/src/07-orders.js) — F01–F09c, F21, F22.
// Every test asserts the visible outcome AND the write ledger. Run on the legacy driver first
// (INV_DRIVER=legacy, the default): a failure here means the characterization is wrong, never
// the app — the app is what today's ledger says it is.
import { test, expect } from '../_helpers';
import { bootInv, driverFor, DELTAS } from './_inv-driver';
import { ledger } from './_inv-ledger';

const d = driverFor();
const mov = (l: Awaited<ReturnType<typeof ledger>>) => l.filter(r => r.table === 'movements');

test('F01 default filter is open-only; "all" and a status filter both work', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'orders');
  let ids = await d.orderIds(page);
  expect(ids).toEqual(expect.arrayContaining(['ord-3', 'ord-s-small', 'ord-s-big', 'ord-c', 'ord-d']));
  expect(ids).not.toEqual(expect.arrayContaining(['ord-1', 'ord-2', 'ord-old']));   // delivered → closed → hidden

  await d.setOrdersFilter(page, 'all');
  ids = await d.orderIds(page);
  expect(ids).toEqual(expect.arrayContaining(['ord-1', 'ord-2', 'ord-old', 'ord-3', 'ord-s-small', 'ord-s-big', 'ord-c', 'ord-d']));

  // a per-status filter — the select only offers the SUPPLIER pipeline statuses (no
  // pending_approval option: those orders surface through the default "open" filter instead).
  await d.setOrdersFilter(page, 'arrived');
  ids = await d.orderIds(page);
  expect(ids).toEqual(['ord-3']);
});

test('F02 a new supplier order saves pending_approval and pushes', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d);
  await d.openTab(page, 'orders');
  await d.newOrder(page, { type: 'supplier', supplier: 'ספק בדיקה', createdBy: 'עמיחי', items: [{ name: 'בקר 504', qty: 3 }] });
  const l = await ledger(page);
  expect(l).toContainEqual(expect.objectContaining({
    table: 'orders', op: 'insert',
    row: expect.objectContaining({
      status: 'pending_approval', order_type: 'supplier', supplier: 'ספק בדיקה',
      items: [{ name: 'בקר 504', qty: 3 }], created_by: 'עמיחי',
    }),
  }));
  expect(mov(l)).toEqual([]);   // a new order posts no stock — only approval/delivery do
});

test('F03 customer order + offline parse ("2 סאטק"): ambiguous-Satec question, then accessory questions', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);   // bootInv stubs parse-order 503 — see its own comment
  await d.openTab(page, 'orders');
  await page.evaluate(() => (window as any).invNewOrder());
  await page.locator('#invOrderModal.open').waitFor({ state: 'visible' });
  await page.locator('.inv-ordtype-btn[data-t="customer"]').click();
  await page.locator('#invOrderKibbutz').selectOption({ label: 'חוקוק' }).catch(() => page.locator('#invOrderKibbutz').selectOption('חוקוק'));
  const items = await d.parseRaw(page, '2 סאטק', ['PM135', 'Robustel', 'שקע']);
  // the ambiguous-Satec resolver rewrote the base line to whichever the test picked (PM135),
  // and the accessory step added exactly one controller + one antenna + one power supply.
  expect(items.find(i => i.name === 'מונה PM135')?.qty).toBe(2);
  expect(items.some(i => i.name === 'Robustel Controller')).toBe(true);
  expect(items.some(i => i.name === 'אנטנה')).toBe(true);
  expect(items.some(i => i.name === 'ספק כוח שקע')).toBe(true);
});

test('F04 a non-catalog line offers add-to-catalog / remove; removing it leaves the catalog line and saves', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d);
  await d.openTab(page, 'orders');
  await page.evaluate(() => (window as any).invNewOrder());
  await page.locator('#invOrderModal.open').waitFor({ state: 'visible' });
  await page.locator('.inv-ordtype-btn[data-t="supplier"]').click();
  // A mix: if the ONLY line were non-catalog, removing it empties the order and invSaveOrder
  // aborts with "לא נותרו פריטים בהזמנה" instead of saving — that is its own (correct) behaviour,
  // not this one's. invOrderItems is a bare top-level `let` in the bundle, not a window property
  // — see the note in _inv-legacy.ts's setItems().
  await page.evaluate('invOrderItems = [{ name: "בקר 504", qty: 2 }, { name: "פריט לא בקטלוג", qty: 1 }]; renderOrderItems();');
  await page.locator('#invOrderCreatedBy').selectOption('עמיחי');
  const clickWhenAsked = (async () => {
    await page.locator('#orderQModal.open').waitFor({ state: 'visible', timeout: 10_000 });
    const optTexts = await page.locator('#orderQOptions button').allInnerTexts();
    expect(optTexts.join(' ')).toContain('הוסף לקטלוג');   // DELTAS.O27: this path is removed in react
    await page.locator('#orderQOptions button', { hasText: 'הסר מההזמנה' }).click();
  })();
  await Promise.all([clickWhenAsked, page.locator('#invOrderModal button[onclick="invSaveOrder(this)"]').click()]);
  await page.locator('#invOrderModal.open').waitFor({ state: 'hidden', timeout: 15_000 });
  const l = await ledger(page);
  expect(l).toContainEqual(expect.objectContaining({ table: 'orders', op: 'insert', row: expect.objectContaining({ items: [{ name: 'בקר 504', qty: 2 }] }) }));
});

test('F05 approval rights: אביאם approves ≤10, not >10; ניתאי only customer; עמיחי approves anything', async ({ page }, ti) => {
  await bootInv(page, ti, 'אביאם', d);
  await d.openTab(page, 'orders');
  expect(await d.hasApprove(page, 'ord-s-small')).toBe(true);
  expect(await d.hasApprove(page, 'ord-s-big')).toBe(false);
  expect(await d.orderRowText(page, 'ord-s-big')).toContain('מעל 10 פריטים');
  expect(await d.hasApprove(page, 'ord-c')).toBe(true);
});

test('F05b עידן sees no approve button on any kind', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'orders');
  for (const id of ['ord-s-small', 'ord-s-big', 'ord-c', 'ord-d']) {
    expect(await d.hasApprove(page, id)).toBe(false);
  }
});

test('F06 customer approval moves חברה → kibbutz once, opens an EMS task, supplies, fulfils the requirement', async ({ page }, ti) => {
  await bootInv(page, ti, 'ניתאי', d);
  await d.openTab(page, 'orders');
  await d.approve(page, 'ord-c');
  const l = await ledger(page);
  expect(mov(l).map(r => r.row)).toEqual([
    { product: 'בקר 504', from_location: 'חברה', to_location: 'חוקוק', quantity: 1, reason: 'customer_supply', ref_id: 'ord-c', created_by: 'ניתאי' },
    { product: 'מונה Landis+Gyr E360PP', from_location: 'חברה', to_location: 'חוקוק', quantity: 2, reason: 'customer_supply', ref_id: 'ord-c', created_by: 'ניתאי' },
  ]);
  expect(l).toContainEqual(expect.objectContaining({ table: 'orders', op: 'patch', match: 'ord-c', row: { status: 'supplied' } }));
  expect(l).toContainEqual(expect.objectContaining({ table: 'requirements', op: 'patch', match: 'req-1', row: { status: 'fulfilled' } }));
  const ems = l.filter(r => r.table === 'ems');
  expect(ems.length).toBeGreaterThan(0);
  expect(JSON.stringify(ems)).toContain('אספקת ציוד: חוקוק');
  expect(JSON.stringify(ems)).toContain('מונה Landis+Gyr E360PP ×2');
});

test('F07 drop-ship approval (ord-d) writes no movement and no EMS task', async ({ page }, ti) => {
  await bootInv(page, ti, 'אביאם', d);
  await d.openTab(page, 'orders');
  await d.approve(page, 'ord-d');
  const l = await ledger(page);
  expect(mov(l)).toEqual([]);
  expect(l.filter(r => r.table === 'ems')).toEqual([]);
  expect(l).toContainEqual(expect.objectContaining({ table: 'orders', match: 'ord-d', row: { status: 'supplied' } }));
});

test('F08 quick action on ord-3 (arrived→delivered) posts NO stock today — ' + DELTAS.O4, async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d);
  await d.openTab(page, 'orders');
  await d.quick(page, 'ord-3');
  const l = await ledger(page);
  expect(mov(l)).toEqual([]);
  expect(l).toContainEqual(expect.objectContaining({ table: 'orders', match: 'ord-3', row: { status: 'delivered' } }));
});

test('F09 the edit-sheet delivery guard reads a snapshot the mock never updates: two saves post twice', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d);
  await d.openTab(page, 'orders');
  await d.editOrder(page, 'ord-3', { status: 'delivered' });
  await page.waitForTimeout(1700);   // let the post-save refreshData() cycle run
  await d.editOrder(page, 'ord-3', null);
  const m = mov(await ledger(page));
  expect(m).toHaveLength(2);
  for (const row of m) expect(row.row).toMatchObject({ product: 'מונה Landis+Gyr E360PP', from_location: 'ספק', to_location: 'חברה', quantity: 20, reason: 'order_delivery', ref_id: 'ord-3' });
});

test('F09b ' + DELTAS.O18a + ' is a bug today: opening ord-3 shows "delivered", saving unchanged delivers it', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d);
  await d.openTab(page, 'orders');
  await d.editOrder(page, 'ord-3', null);
  const m = mov(await ledger(page));
  expect(m).toHaveLength(1);
  expect(m[0].row).toMatchObject({ reason: 'order_delivery', ref_id: 'ord-3' });
});

test('F09c ' + DELTAS.O18b + ' is a bug today: no matching <option>, status is written empty', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'orders');
  await d.editOrder(page, 'ord-s-small', null);
  const l = await ledger(page);
  const patch = l.find(r => r.table === 'orders' && r.match === 'ord-s-small');
  expect(patch?.row.status).toBe('');
});

test('F21 a push deep link (?pushact=approve&oid=…) reaches and runs approveOrder', async ({ page }, ti) => {
  // ready: '' — this deep link never opens the inventory page (act==='approve' calls approveOrder
  // directly, no showPage), so there's no reason to wait on the home cards specifically.
  await bootInv(page, ti, 'אביאם', d, { query: 'pushact=approve&oid=ord-s-small', ready: '' });
  await expect.poll(async () => (await ledger(page)).some(r => r.table === 'orders' && r.match === 'ord-s-small'), { timeout: 10_000 }).toBe(true);
  const l = await ledger(page);
  expect(l).toContainEqual(expect.objectContaining({ table: 'orders', match: 'ord-s-small', row: { status: 'pending' } }));
});

test('F22 sigma.openOrder opens the edit sheet for that order', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d);
  await page.evaluate(() => (window as any).sigma.openOrder('ord-3'));
  await page.locator('#invOrderModal.open').waitFor({ state: 'visible' });
  await expect(page.locator('#invOrderSupplier')).toHaveValue('לנדיס');
});
