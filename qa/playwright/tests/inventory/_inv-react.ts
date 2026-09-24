// The NEW React inventory UI (app/src/islands/Inventory.tsx + InventoryOrders*.tsx, …), driven
// through data-testid only (task U1's contract). Each U task fills in the methods it needs;
// methods for tabs not yet built (U3-U6) throw until that task lands.
import type { Page } from '@playwright/test';
import type { InvDriver, InvTab, NewOrder } from './_inv-driver';

async function gotoInventory(page: Page) {
  try { await page.evaluate("localStorage.setItem('sigma-inv-react','1')"); } catch { /* ignore */ }
  // showPage('inventory') un-hides #inventory-view (the page router, separate from invShowTab's
  // own tab switch) — the same first step the legacy driver takes (_inv-legacy.ts openTab).
  await page.evaluate("window.showPage && showPage('inventory')");
  await page.evaluate("window.invShowTab && invShowTab('orders')");
  await page.locator('[data-testid="inv-tab-orders"]').waitFor({ state: 'visible', timeout: 15_000 });
}

const notBuilt = (what: string) => async () => { throw new Error(`react driver: ${what} is not built yet`); };

export const reactDriver: InvDriver = {
  name: 'react',

  async openTab(page, tab: InvTab) {
    await gotoInventory(page);
    await page.locator(`[data-testid="inv-tab-${tab}"]`).click();
    await page.locator(`[data-testid="inv-panel-${tab}"]`).waitFor({ state: 'visible' });
  },

  async tabOrder(page) {
    await gotoInventory(page);
    const nodes = page.locator('[data-testid^="inv-tab-"]');
    const count = await nodes.count();
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push((await nodes.nth(i).innerText()).trim());
    return out;
  },

  poolQty: notBuilt('poolQty (U3)'),
  kpi: notBuilt('kpi (U3)'),
  tapKpi: notBuilt('tapKpi (U3)'),
  poolNames: notBuilt('poolNames (U3)'),

  async setOrdersFilter(page, f) {
    await page.locator(`[data-testid="inv-orders-filter-${f || 'open'}"] button`).click();
  },

  async orderIds(page) {
    const nodes = page.locator('[data-testid^="inv-order-row-"]');
    const count = await nodes.count();
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const tid = await nodes.nth(i).getAttribute('data-testid');
      if (tid) out.push(tid.replace('inv-order-row-', ''));
    }
    return out;
  },

  async orderRowText(page, id) {
    return (await page.locator(`[data-testid="inv-order-row-${id}"]`).innerText()).trim();
  },

  async hasApprove(page, id) {
    return (await page.locator(`[data-testid="inv-order-approve-${id}"]`).count()) > 0;
  },

  async approve(page, id) {
    await page.locator(`[data-testid="inv-order-approve-${id}"]`).click();
    await page.locator('[data-testid="os-approve"]').click();
    await page.locator('[data-testid="confirm-yes"]').click();
    // approveOrder() awaits its writes before the sheet closes (onOpenChange(false)) — wait for
    // that instead of a fixed sleep, so the caller's ledger read never races the insert.
    await page.locator('[data-testid="order-sheet"]').waitFor({ state: 'hidden', timeout: 15_000 });
  },

  async quick(page, id) {
    await page.locator(`[data-testid="inv-order-quick-${id}"]`).click();
    // doQuick() (InventoryOrders.tsx) is fire-and-forget from the click handler's point of view;
    // wait for its own success toast so a caller's ledger read never races the write.
    await page.getByText('הסטטוס עודכן').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  },

  async stuck(page, id) {
    await page.locator(`[data-testid="inv-order-more-${id}"]`).click();
    await page.locator(`[data-testid="inv-order-stuck-${id}"]`).click();
  },

  async newOrder(page, o: NewOrder) {
    await page.locator('[data-testid="inv-new-order"]').click();
    await page.locator(`[data-testid="os-type-${o.type}"]`).click();
    if (o.supplier) await page.locator('[data-testid="os-supplier"]').fill(o.supplier);
    if (o.kibbutz) await page.locator('[data-testid="os-kibbutz"]').fill(o.kibbutz);
    if (o.createdBy) await page.locator('[data-testid="os-created-by"]').fill(o.createdBy);
    for (let i = 0; i < o.items.length; i++) {
      if (i > 0) await page.locator('[data-testid="os-add-row"]').click();
      await page.locator(`[data-testid="os-item-${i}-name"]`).selectOption({ label: o.items[i].name });
      await page.locator(`[data-testid="os-item-${i}-qty"]`).fill(String(o.items[i].qty));
    }
    await page.locator('[data-testid="os-save"]').click();
    await page.locator('[data-testid="order-sheet"]').waitFor({ state: 'hidden', timeout: 15_000 });
  },

  async parseRaw(page, raw, answers) {
    await page.locator('[data-testid="inv-new-order"]').click();
    await page.locator('[data-testid="os-type-customer"]').click();
    await page.locator('[data-testid="os-kibbutz"]').fill('חוקוק');
    await page.locator('[data-testid="os-raw"]').fill(raw);
    await page.locator('[data-testid="os-parse"]').click();
    for (const answer of answers) {
      const opt = page.locator('[data-testid^="os-q-option-"]').filter({ hasText: new RegExp(answer) }).first();
      // No more questions left for this answer (the flow can resolve with fewer than offered) —
      // the caller's own assertions on the final item list still catch a real mismatch.
      if (await opt.count().catch(() => 0)) await opt.click();
    }
    await page.locator('[data-testid="os-back"]').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    const items: Array<{ name: string; qty: number }> = [];
    const names = page.locator('[data-testid^="os-item-"][data-testid$="-name"]');
    const count = await names.count();
    for (let i = 0; i < count; i++) {
      const name = await page.locator(`[data-testid="os-item-${i}-name"]`).inputValue();
      const qty = await page.locator(`[data-testid="os-item-${i}-qty"]`).inputValue();
      if (name) items.push({ name, qty: Number(qty) || 0 });
    }
    return items;
  },

  async editOrder(page, id, patch) {
    // "all" first: an order this call itself just closed out (e.g. → delivered) drops out of
    // the default open-only filter, and a second edit on the SAME id has to still find it — the
    // legacy driver never has this problem (invEditOrder(id) opens it directly, bypassing the
    // filtered list), so the react driver switches filters to match, not the app under test.
    await page.locator('[data-testid="inv-orders-filter-all"] button').click();
    await page.locator(`[data-testid="inv-order-row-${id}"]`).click();
    if (patch?.status) await page.locator('[data-testid="os-status"]').selectOption(patch.status);
    await page.locator('[data-testid="os-save"]').click();
    await page.locator('[data-testid="order-sheet"]').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  },

  kibbutzQty: notBuilt('kibbutzQty (U3)'),
  download: notBuilt('download (U3)'),

  restock: notBuilt('restock (U5)'),
  defective: notBuilt('defective (U5)'),

  saveProduct: notBuilt('saveProduct (U6)'),
  toggleProduct: notBuilt('toggleProduct (U6)'),
  displayNameEditable: notBuilt('displayNameEditable (U6)'),
  wiringOk: notBuilt('wiringOk (U6)'),

  certRange: notBuilt('certRange (U4)'),
  certSearch: notBuilt('certSearch (U4)'),
  certNumbers: notBuilt('certNumbers (U4)'),
  certCancel: notBuilt('certCancel (U4)'),
  certReissue: notBuilt('certReissue (U4)'),
  certViewText: notBuilt('certViewText (U4)'),
  certSendRows: notBuilt('certSendRows (U4)'),
};
