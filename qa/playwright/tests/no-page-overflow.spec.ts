// P0 hard gate (24.9, S-merge regression): the header's page-action button (round 5 L1,
// #sigma-header-actions) made attendance/inventory 73px wider than the viewport on every
// phone width, because css/app.css's mobile .header-meta rule was `flex: 0 0 auto; flex-wrap:
// nowrap` — safe when the cluster was just a bell + user chip, not once it also carries a real
// text button. Fixed by letting .header-meta shrink and wrap onto a second line instead of
// forcing the page to scroll horizontally (css/app.css ~line 2067).
//
// This check is NOT part of any allow-list/baseline system and takes no waiver: a page that
// scrolls sideways on a phone, or two header controls whose hit areas overlap, is a hard fail,
// full stop — no snapshot to update, no threshold to raise.
import { boot, test, expect, type Who } from './_helpers';

const WIDTHS = [360, 390, 412, 430] as const;

async function assertNoOverflow(page: import('@playwright/test').Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  // +1: subpixel layout rounding, never a real allowance for overflow.
  expect(scrollWidth, `document.documentElement.scrollWidth (${scrollWidth}) must not exceed innerWidth (${innerWidth})`)
    .toBeLessThanOrEqual(innerWidth + 1);
}

/** No two of the header's own controls may occupy overlapping screen space. */
async function assertHeaderItemsDontCollide(page: import('@playwright/test').Page) {
  const boxes = await page.evaluate(() => {
    const sels = [
      '#sigma-header-actions [data-testid="header-my-tasks"]',
      '#sigma-header-actions [data-testid="alerts-bell"]',
      '.header .brand-wrap',
    ];
    return sels.map(sel => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;   // not rendered (e.g. hidden on this role)
      return { sel, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }).filter((b): b is NonNullable<typeof b> => b !== null);
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `${a.sel} and ${b.sel} collide: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(false);
    }
  }
}

async function openAttendance(page: import('@playwright/test').Page) {
  await expect.poll(async () => page.evaluate(() => {
    (window as any).sigma?.showPage?.('attendance');
    const el = document.getElementById('attendance-view');
    return !!el && el.style.display !== 'none';
  }), { timeout: 20_000 }).toBe(true);
  await page.waitForSelector('[data-testid="att-grid"]', { state: 'visible', timeout: 20_000 });
}

async function openInventory(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.locator('[data-inv-tab="stock"]').click();
  await page.waitForSelector('[data-testid="inv-pool"]', { state: 'visible', timeout: 20_000 });
}

for (const width of WIDTHS) {
  test.describe(`no page overflow @ ${width}`, () => {
    test(`home (${width})`, async ({ page }, ti) => {
      await page.setViewportSize({ width, height: 780 });
      await boot(page, ti, { who: 'עידן' as Who });
      await assertNoOverflow(page);
      await assertHeaderItemsDontCollide(page);
    });

    test(`attendance (${width})`, async ({ page }, ti) => {
      await page.setViewportSize({ width, height: 780 });
      await boot(page, ti, { who: 'אביאם' as Who });
      await openAttendance(page);
      await assertNoOverflow(page);
      await assertHeaderItemsDontCollide(page);
    });

    test(`inventory (${width})`, async ({ page }, ti) => {
      await page.setViewportSize({ width, height: 780 });
      await boot(page, ti, { who: 'עידן' as Who });
      await openInventory(page);
      await assertNoOverflow(page);
      await assertHeaderItemsDontCollide(page);
    });

    test(`calendar (${width})`, async ({ page }, ti) => {
      await page.setViewportSize({ width, height: 780 });
      await boot(page, ti, { who: 'עידן' as Who });
      await page.evaluate(() => (window as any).showPage('calendar'));
      await page.waitForTimeout(500);
      await assertNoOverflow(page);
      await assertHeaderItemsDontCollide(page);
    });
  });
}
