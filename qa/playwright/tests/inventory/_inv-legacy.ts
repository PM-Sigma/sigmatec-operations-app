// The OLD inventory UI (js/src/06-products.js, 07-orders.js, 08-inventory.js, 20-delivery-cert.js),
// driven through today's real selectors — every one confirmed against the live markup
// (index.html:337-459, 987-1148) and the live source, not guessed from the spec.
import type { Page } from '@playwright/test';
import type { InvDriver, InvTab, NewOrder } from './_inv-driver';

const row = (page: Page, id: string) =>
  page.locator('#invOrdersList tr').filter({ has: page.locator('[onclick*="' + id + '"]') });

async function fill(page: Page, sel: string, value: string) {
  await page.locator(sel).fill(value);
}

/**
 * `invOrderItems` (js/src/07-orders.js) is a top-level `let` in the concatenated bundle: reachable
 * by bare identifier from any same-realm script (page.evaluate included), but NOT as a `window`
 * property — and `window.invOrderItems` is actively wrong, since `<div id="invOrderItems">`
 * (the items wrapper) is DOM-id-reflected onto `window` under that exact name. String-eval'd so
 * TypeScript never "helpfully" rewrites the bare identifier into a `window.` property access.
 */
async function setItems(page: Page, items: Array<{ name: string; qty: number }>) {
  await page.evaluate(
    'invOrderItems = ' + JSON.stringify(items) + '; renderOrderItems(); invToggleDistribution();',
  );
}
async function readItems(page: Page): Promise<Array<{ name: string; qty: number }>> {
  return page.evaluate('(invOrderItems || []).map(function (it) { return { name: it.name, qty: it.qty }; })') as any;
}

/** cert number (shown, possibly struck through if cancelled) → its uuid, read off the row's
 * own action buttons (`onclick="certView('<id>')"` etc — the registry carries no data-id). */
async function certIdByNumber(page: Page, n: number): Promise<string> {
  const trs = page.locator('#invCertsList table tbody tr');
  const count = await trs.count();
  for (let i = 0; i < count; i++) {
    const tr = trs.nth(i);
    const numTxt = (await tr.locator('td').first().innerText()).replace(/\D+.*$/s, '').trim();
    if (numTxt === String(n)) {
      const onclick = await tr.locator('button[onclick^="certView("]').getAttribute('onclick');
      const m = onclick && onclick.match(/certView\('([^']+)'\)/);
      if (m) return m[1];
    }
  }
  throw new Error('cert ' + n + ' not found in the registry');
}

export const legacyDriver: InvDriver = {
  name: 'legacy',

  async openTab(page, tab: InvTab) {
    await page.evaluate(() => (window as any).showPage('inventory'));
    await page.locator('[data-inv-tab="' + tab + '"]').click();
    const ready: Record<InvTab, string> = {
      orders: '#invOrdersList', stock: '[data-testid="inv-pool"], .inv-pool-kpis',
      certs: '#invCertsList', kibbutz: '#invKibbutzMatrix', returns: '#invReturnsList',
      products: '#invProductsList',
    };
    await page.waitForSelector(ready[tab], { timeout: 15_000 });
  },

  async tabOrder(page) {
    return page.locator('.inv-tab-btn').allInnerTexts();
  },

  async poolQty(page, product) {
    const row_ = page.getByTestId('inv-pool').locator('.item-row', { hasText: product });
    if (await row_.count() === 0) return null;
    const txt = await row_.first().locator('.qty').innerText();
    return parseFloat(txt.replace(/[^\d.-]/g, ''));
  },

  async kpi(page, key) {
    // "items" and "units" both render data-kpi="all" (two different numbers, same filter
    // action) — the first .inv-kpi[data-kpi=all] is פריטים במאגר, the second is יחידות.
    const loc = key === 'low' ? page.locator('.inv-kpi[data-kpi="low"]')
      : page.locator('.inv-kpi[data-kpi="all"]').nth(key === 'items' ? 0 : 1);
    const txt = await loc.locator('.inv-kpi-n bdi').innerText();
    return parseFloat(txt.replace(/[^\d.-]/g, ''));
  },
  async tapKpi(page, key) {
    const loc = key === 'low' ? page.locator('.inv-kpi[data-kpi="low"]')
      : page.locator('.inv-kpi[data-kpi="all"]').first();
    await loc.click();
  },
  async poolNames(page) {
    return page.getByTestId('inv-pool').locator('.item-row span').evaluateAll(
      spans => spans.filter((_, i) => i % 2 === 0).map(s => (s.textContent || '').replace(/^🔴\s*/, '').trim()),
    );
  },

  async setOrdersFilter(page, f) { await page.locator('#invOrdersFilter').selectOption(f); },
  async orderIds(page) {
    // every row's ✏️ ערוך button carries invEditOrder('<id>') — the one action every row has.
    return page.locator('#invOrdersList button[onclick^="invEditOrder("]').evaluateAll(
      btns => btns.map(b => (b.getAttribute('onclick') || '').match(/invEditOrder\('([^']+)'\)/)?.[1] || ''),
    );
  },
  async orderRowText(page, id) { return (await row(page, id).innerText()); },
  async hasApprove(page, id) { return (await row(page, id).locator('button[onclick^="approveOrder("]').count()) > 0; },
  async approve(page, id) {
    // bootInv()/bootInvCerts() already install a persistent page.on('dialog', accept) handler.
    await row(page, id).locator('button[onclick^="approveOrder("]').click();
    await page.waitForTimeout(300);   // the approval writes settle before the caller reads the ledger
  },
  async quick(page, id) {
    // NOT :not([title]) by accident — the 🟠 "סמן כתקוע" button also matches the
    // quickOrderStatus( prefix (it calls the same function with a different status).
    await row(page, id).locator('button[onclick^="quickOrderStatus("]:not([title])').click();
    await page.waitForTimeout(300);
  },
  async stuck(page, id) {
    await row(page, id).locator('button[onclick*="\'stuck\'"]').click();
    await page.waitForTimeout(300);
  },

  async newOrder(page, o: NewOrder) {
    await page.evaluate(() => (window as any).invNewOrder());
    await page.locator('#invOrderModal.open').waitFor({ state: 'visible' });
    await page.locator('.inv-ordtype-btn[data-t="' + o.type + '"]').click();
    if (o.type === 'supplier' && o.supplier) await fill(page, '#invOrderSupplier', o.supplier);
    if (o.type === 'customer' && o.kibbutz) await page.locator('#invOrderKibbutz').selectOption({ label: o.kibbutz }).catch(() => page.locator('#invOrderKibbutz').selectOption(o.kibbutz));
    if (o.createdBy) await page.locator('#invOrderCreatedBy').selectOption(o.createdBy);
    if (o.raw) await fill(page, '#invOrderRaw', o.raw);
    // clear the auto-seeded first row, then set exactly the requested items directly. `invOrderItems`
    // is a top-level `let` in the concatenated bundle — NOT a window property (a DOM element with
    // id="invOrderItems" IS window.invOrderItems, which is a trap) — reach it by bare identifier,
    // which resolves through the page's shared script-scope like any other same-realm script does.
    await setItems(page, o.items);
    await page.locator('#invOrderModal button[onclick="invSaveOrder(this)"]').click();
    await page.locator('#invOrderModal.open').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  },

  async parseRaw(page, raw, answers) {
    await fill(page, '#invOrderRaw', raw);
    let ai = 0;
    // Each askChoice() in the chain (ambiguous Satec → controller → power supply) opens the SAME
    // modal in turn, awaited sequentially by the app — so this must WAIT for each one to appear
    // rather than checking `.count()` once (which races the async orderParseRaw() click handler
    // and, seeing nothing open yet, would exit before the first question ever renders).
    const answerEach = async () => {
      for (;;) {
        const opened = await page.locator('#orderQModal.open').waitFor({ state: 'visible', timeout: 4_000 })
          .then(() => true).catch(() => false);
        if (!opened) return;
        const opts = page.locator('#orderQOptions button');
        const wantLabel = answers[ai++];
        const target = wantLabel ? opts.filter({ hasText: wantLabel }).first() : opts.first();
        await target.click();
        await page.locator('#orderQModal.open').waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => {});
      }
    };
    await Promise.all([answerEach(), page.locator('#invOrderModal button[onclick="orderParseRaw(this)"]').click()]);
    return readItems(page);
  },

  async editOrder(page, id, patch) {
    await page.evaluate(oid => (window as any).invEditOrder(oid), id);
    await page.locator('#invOrderModal.open').waitFor({ state: 'visible' });
    if (patch && patch.status) await page.locator('#invOrderStatus').selectOption(patch.status).catch(() => {});
    await page.locator('#invOrderModal button[onclick="invSaveOrder(this)"]').click();
    await page.locator('#invOrderModal.open').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  },

  async kibbutzQty(page, kibbutz, product) {
    const matrix = page.locator('#invKibbutzMatrix');
    const table = matrix.locator('table.matrix-table');
    if (await table.count()) {
      const headers = await table.locator('thead th').allInnerTexts();
      const col = headers.indexOf(product);
      if (col === -1) return null;
      const rowLoc = table.locator('tbody tr').filter({ hasText: kibbutz });
      if (await rowLoc.count() === 0) return null;
      const cells = await rowLoc.first().locator('td').allInnerTexts();
      return cells[col] === undefined ? null : parseFloat(cells[col]) || 0;
    }
    // mobile accordion — a closed <details> hides its content (the UA stylesheet), so
    // innerText() on anything inside returns '' until it's opened.
    const card = matrix.locator('details.inv-loc-card').filter({ hasText: kibbutz });
    if (await card.count() === 0) return null;
    await card.first().evaluate(el => { (el as HTMLDetailsElement).open = true; });
    const line = card.locator('.item-row', { hasText: product });
    if (await line.count() === 0) return null;
    const txt = await line.first().locator('.qty').innerText();
    return parseFloat(txt);
  },

  async download(page, which) {
    const btnText = '📊 ייצוא';
    const section = which === 'pool-csv' ? '#inv-section-stock' : '#inv-section-kibbutz';
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator(section).getByText(btnText).click(),
    ]);
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream!.on('data', c => chunks.push(c as Buffer));
      stream!.on('end', () => resolve());
      stream!.on('error', reject);
    });
    return Buffer.concat(chunks).toString('utf8');
  },

  async restock(page, returnId) {
    await page.locator('#invReturnsList button[onclick^="returnToStock(\'' + returnId + '\'"]').click();
    await page.waitForTimeout(300);
  },
  async defective(page, returnId) {
    await page.locator('#invReturnsList button[onclick^="markReturnDefective(\'' + returnId + '\'"]').click();
    await page.waitForTimeout(300);
  },

  async saveProduct(page, p) {
    if (p.id) await page.evaluate(id => (window as any).invEditProduct(id), p.id);
    else await page.evaluate(() => (window as any).invNewProduct());
    await page.locator('#invProductModal.open').waitFor({ state: 'visible' });
    await fill(page, '#invProductName', p.name);
    if (p.category !== undefined) await page.locator('#invProductCategory').selectOption(p.category);
    if (p.active !== undefined) {
      const cur = await page.locator('#invProductActive').isChecked();
      if (cur !== p.active) await page.locator('#invProductActive').click();
    }
    if (p.display_name !== undefined) await fill(page, '#invProductDisplayName', p.display_name);
    await page.locator('#invProductModal button[onclick="invSaveProduct(this)"]').click();
    await page.locator('#invProductModal.open').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  },
  async toggleProduct(page, id) {
    await page.evaluate(pid => {
      const btn = document.querySelector('button[onclick*="invToggleProductActive(\'' + pid + '\'"]') as HTMLElement | null;
      if (btn) btn.click();
    }, id);
    await page.waitForTimeout(300);
  },
  async displayNameEditable(page, id) {
    await page.evaluate(pid => (window as any).invEditProduct(pid), id);
    await page.locator('#invProductModal.open').waitFor({ state: 'visible' });
    return !(await page.locator('#invProductDisplayName').isDisabled());
  },
  async wiringOk(page) {
    const txt = await page.locator('#invProductsList').innerText();
    return txt.includes('מחובר למחולל הדוחות ✓');
  },

  async certRange(page, r) { await page.evaluate(range => (window as any).certRangeTap(range), r); await page.waitForTimeout(200); },
  async certSearch(page, q) { await fill(page, '#invCertsSearch', q); await page.waitForTimeout(200); },
  async certNumbers(page) {
    // A cancelled row's cell also carries the replacement number ("1042 🚫 מבוטלת → 1043") —
    // take the LEADING digit run only, not every digit in the cell.
    const cells = await page.locator('#invCertsList table tbody tr td:first-child').allInnerTexts();
    return cells.map(c => parseInt((c.match(/^\s*(\d+)/) || [])[1] || '', 10)).filter(n => !Number.isNaN(n));
  },
  async certCancel(page, n) {
    const id = await certIdByNumber(page, n);
    await page.locator('button[onclick^="certCancel(\'' + id + '\'"]').click();
    await page.waitForTimeout(300);
  },
  async certReissue(page, n) {
    const id = await certIdByNumber(page, n);
    await page.evaluate(cid => (window as any).certReissue(cid), id);
    await page.locator('#certModal.open').waitFor({ state: 'visible' });
    await page.locator('#certModal button[onclick="issueDeliveryCert(this)"]').click();
    await page.waitForTimeout(400);
  },
  async certViewText(page, n) {
    const id = await certIdByNumber(page, n);
    await page.evaluate(cid => (window as any).certView(cid), id);
    await page.locator('#certViewOverlay').waitFor({ state: 'visible' });
    return (await page.locator('#certOvFrame').getAttribute('srcdoc')) || '';
  },
  async certSendRows(page, n) {
    const id = await certIdByNumber(page, n);
    await page.evaluate(cid => (window as any).certSendOpen(cid), id);
    await page.locator('#certSendModal.open').waitFor({ state: 'visible' });
    return page.locator('#certSendModal .cert-send-chk').evaluateAll(
      chks => chks.map(c => (c.closest('div')?.textContent || '').trim()),
    );
  },
};
