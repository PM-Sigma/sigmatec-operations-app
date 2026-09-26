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

/** Designer round 3 (26.9): flagged as REAL overflow, not a capture artifact — checked here
    against the live page (`scrollingElement.scrollWidth`), not a screenshot. */
async function openCalendarVisitSheet(page: import('@playwright/test').Page) {
  await expect.poll(async () => page.evaluate(() => {
    (window as any).sigma?.showPage?.('calendar');
    const grid = document.querySelector('[data-testid="cal-grid"]') as HTMLElement | null;
    return !!grid && grid.offsetParent !== null;
  }), { timeout: 20_000 }).toBe(true);
  await expect(page.locator('[data-testid="cal-grid"][data-loaded="1"]')).toBeVisible({ timeout: 20_000 });
  // חודש מלא — the state the designer's report was actually about (week numbers only show
  // here); default חודש עבודה never has a week-number gutter to check.
  const workWeekBtn = page.getByRole('button', { name: /^חודש מלא$/ });
  if (await workWeekBtn.count()) await workWeekBtn.click();
  const visitDay = await page.evaluate(() => String(((window as any).SHEET_DATA.visits || []).find((v: any) => v.visitor === 'אביאם')?.date || '').slice(0, 10));
  // The real tap path, not the test bridge: tap the DayCell itself (opens the mobile day
  // SHEET), then the visit row inside it (closes the day sheet, opens the visit sheet) — the
  // grid stays mounted BEHIND both, which is exactly the state the designer flagged.
  await page.locator(`[data-day="${visitDay}"]`).click();
  await page.locator('[data-visit-row="vis-אביאם"]:visible').first().click();
  await expect(page.getByTestId('cal-visit-sheet')).toBeVisible();
}

async function openCalendarList(page: import('@playwright/test').Page) {
  await expect.poll(async () => page.evaluate(() => {
    (window as any).sigma?.showPage?.('calendar');
    const grid = document.querySelector('[data-testid="cal-grid"]') as HTMLElement | null;
    return !!grid && grid.offsetParent !== null;
  }), { timeout: 20_000 }).toBe(true);
  await page.locator('[data-view="list"]').click();
  await page.waitForSelector('[data-testid="cal-list"]', { state: 'visible', timeout: 20_000 });
}

/** Every element's box must sit inside the viewport's own horizontal bounds — not just "the
    document doesn't scroll": an element can overflow to one side while something ELSE off
    the opposite edge keeps the document from technically scrolling. */
async function assertEveryElementInViewport(page: import('@playwright/test').Page) {
  const offenders = await page.evaluate(() => {
    const w = window.innerWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const he = el as HTMLElement;
      const cs = getComputedStyle(he);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      if (he.closest('.sr-only, [aria-hidden="true"]')) continue;
      // #sidePanel is a legacy off-canvas drawer (position:fixed, `right:-100%` until
      // `.open`) — parked off-screen by design and never contributes to document scrollWidth
      // (confirmed by assertNoOverflow passing); it is not this screen's own chrome.
      if (he.closest('#sidePanel')) continue;
      const r = he.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right > w + 1 || r.left < -1) {
        const name = he.getAttribute('data-testid') || he.getAttribute('aria-label')
          || (he.className && String(he.className).slice(0, 60)) || he.tagName.toLowerCase();
        out.push(`${name}: left ${Math.round(r.left)} right ${Math.round(r.right)} (viewport ${w})`);
      }
    }
    return out.slice(0, 10);
  });
  expect(offenders, `element(s) spill outside the ${await page.evaluate(() => window.innerWidth)}px viewport:\n${offenders.join('\n')}`).toEqual([]);
}

/** Designer round 4 (26.9): every calendar header control and week-number label must sit
    inside a real 16px page gutter on both sides at 360 — not just "not scrolling the page",
    which a control flush at x≈0 still satisfies. `left` measured against a 16px allowance for
    subpixel rounding, matching `assertNoOverflow`'s own +1 tolerance philosophy. */
async function assertCalendarGutter(page: import('@playwright/test').Page, width: number) {
  const rects = await page.evaluate(() => {
    const sels = [
      '[data-testid="cal-prev"]', '[data-testid="cal-next"]', '[data-testid="cal-today"]',
      '[data-testid="cal-work-week"]', '[data-view="month"]', '[data-view="week"]', '[data-view="list"]',
      '[data-testid="cal-weeklabel"]',
    ];
    const out: Array<{ sel: string; left: number; right: number }> = [];
    for (const sel of sels) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        out.push({ sel, left: r.left, right: r.right });
      }
    }
    return out;
  });
  const gutter = 16;
  const bad = rects.filter(r => r.left < gutter - 1 || r.right > width - gutter + 1);
  expect(bad, `header control(s)/week label(s) outside the [${gutter}, ${width - gutter}] gutter:\n${JSON.stringify(bad)}`).toEqual([]);
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

    // Designer round 3 (26.9): flagged as REAL overflow bugs, not screenshot artifacts —
    // "grid behind the visit sheet shows only 5 columns, חודש מלא clipped" and "רשימה scrolls
    // sideways (המשימות שלי / באיחור / סינון cut on the left)". Only meaningful at the 360
    // floor (the width named in the report), so it's not repeated across the wider widths.
    if (width === 360) {
      test(`calendar visit sheet open (${width})`, async ({ page }, ti) => {
        await page.setViewportSize({ width, height: 780 });
        await boot(page, ti, { who: 'אביאם' as Who });
        await openCalendarVisitSheet(page);
        await assertNoOverflow(page);
        await assertEveryElementInViewport(page);
        await assertCalendarGutter(page, width);
      });

      test(`calendar list view (${width})`, async ({ page }, ti) => {
        await page.setViewportSize({ width, height: 780 });
        await boot(page, ti, { who: 'עידן' as Who });
        await openCalendarList(page);
        await assertNoOverflow(page);
        await assertEveryElementInViewport(page);
      });
    }
  });
}
