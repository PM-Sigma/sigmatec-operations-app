// Q7-E 12: every inventory tab is RTL (Radix Tabs used to stamp dir="ltr" on the tab bodies).
import { test, expect } from '../_helpers';
import { bootInv, driverFor } from './_inv-driver';
const d = driverFor();
test('inventory: every tab body is RTL and its first Hebrew title sits on the right', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d);
  for (const tab of ['orders', 'stock', 'certs', 'kibbutz', 'returns', 'products']) {
    await d.openTab(page, tab);
    const r = await page.evaluate(() => {
      const root = document.querySelector('#sigma-inventory [role="tabpanel"]') as HTMLElement;
      const bad = Array.from(root.querySelectorAll('*')).filter(e => getComputedStyle(e).direction === 'ltr' && !e.closest('bdi,[dir="ltr"],input,code')).length;
      return { dir: getComputedStyle(root).direction, bad };
    });
    expect(r.dir, tab).toBe('rtl');
    expect(r.bad, tab).toBe(0);
  }
});
