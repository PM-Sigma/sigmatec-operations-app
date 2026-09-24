// The NEW React inventory UI (app/src/islands/Inventory.tsx + InventoryOrders*.tsx, …), driven
// through data-testid only (task U1's contract). Each U task fills in the methods it needs;
// methods for tabs not yet built (U3-U6) throw until that task lands.
import type { Page } from '@playwright/test';
import type { InvDriver, InvTab, NewOrder } from './_inv-driver';

async function gotoInventory(page: Page) {
  try { await page.evaluate("localStorage.setItem('sigma-inv-react','1')"); } catch { /* ignore */ }
  await page.evaluate("window.invShowTab && invShowTab('orders')");
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
  },

  async quick(page, id) {
    await page.locator(`[data-testid="inv-order-quick-${id}"]`).click();
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
  },

  parseRaw: notBuilt('parseRaw (component-level in U2, no PW hook yet)'),

  async editOrder(page, id, patch) {
    await page.locator(`[data-testid="inv-order-row-${id}"]`).click();
    if (patch?.status) await page.locator('[data-testid="os-status"]').selectOption(patch.status);
    await page.locator('[data-testid="os-save"]').click();
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
