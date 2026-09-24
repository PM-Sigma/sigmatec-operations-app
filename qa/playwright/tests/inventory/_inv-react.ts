// The NEW React inventory UI (app/src/islands/Inventory.tsx, …), driven through data-testid only
// (task U1's contract). Each U task fills in the methods it needs; methods for a tab not yet
// built throw until that task lands.
import type { Page } from '@playwright/test';
import type { InvDriver, InvTab } from './_inv-driver';

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

  setOrdersFilter: notBuilt('setOrdersFilter (U2)'),
  orderIds: notBuilt('orderIds (U2)'),
  orderRowText: notBuilt('orderRowText (U2)'),
  hasApprove: notBuilt('hasApprove (U2)'),
  approve: notBuilt('approve (U2)'),
  quick: notBuilt('quick (U2)'),
  stuck: notBuilt('stuck (U2)'),
  newOrder: notBuilt('newOrder (U2)'),
  parseRaw: notBuilt('parseRaw (U2)'),
  editOrder: notBuilt('editOrder (U2)'),

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
