// Layout guards (audit A · A3 / A6, audit B · F-12).
//
//  A6 — at 390 px the page must not scroll sideways IN ANY STATE. `FilterChips` carried a
//       `-mx-1`, which widened a full-width block by 8 px; while nothing was open the
//       scrollbar gutter hid it, and the moment a Radix sheet locked the body the document
//       measured 394 > 390 and the page slid behind the sheet. The assertion is exact
//       (`scrollWidth === innerWidth`), with each sheet OPEN — a "no horizontal scroll" test
//       that only runs on the idle page is the test that missed this.
//  F-12 — at 1440 px the kibbutz grid is a real multi-column grid, not one column against the
//       right edge. Tailwind's `container` COMPONENT class (unprefixed by `important`) was
//       capping the legacy shell at 1280 px; spec §6 says full width on desktop.
//  A3 — a page the person may not open is not offered as a tab.
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';

const widths = (page: import('@playwright/test').Page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  inner: window.innerWidth,
  clientWidth: document.documentElement.clientWidth,
}));

test('A6 — no horizontal scroll at 390, with every sheet open', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);
  test.skip(viewport !== 'mobile-390', 'this is the 390 px guard');

  const nav = page.locator('#sigma-nav');
  const bad: string[] = [];
  const measure = async (state: string) => {
    const w = await widths(page);
    if (w.scrollWidth !== w.inner) bad.push(`${state}: scrollWidth ${w.scrollWidth} ≠ ${w.inner}`);
  };

  await measure('idle');

  // ⋯ עוד — and from inside it, the sheets that lock the body.
  const openMore = async () => {
    await nav.getByRole('button', { name: 'עוד', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  };
  await openMore();
  await measure('⋯ עוד');

  for (const row of ['הגדרות', 'יומן היום']) {
    await page.getByRole('dialog').getByRole('button', { name: row, exact: true }).click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await measure(row);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await openMore();
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // Ctrl+K removed round 5 (X-L7): the shortcut now does nothing at all — no dialog, no
  // listener left behind to catch it by accident.
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(250);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await measure('Ctrl+K (no-op)');
  await measure('after everything closed');

  expect(bad.join('\n    '), 'horizontal scroll at 390 px:\n    ' + bad.join('\n    ')).toBe('');
  expectNoConsoleErrors(rec);
});

test('F-12 — the kibbutz grid is multi-column at 1440', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);
  test.skip(viewport !== 'desktop-1440', 'this is the desktop-width guard');

  const m = await page.evaluate(() => {
    const home = document.getElementById('sigma-home')!;
    const grids = Array.from(home.querySelectorAll('section > div[class*="grid-template-columns"]'));
    let best = 0;
    for (const g of grids) {
      const cards = Array.from(g.children)
        .filter(c => c.classList.contains('kibbutz'))
        .map(c => Math.round(c.getBoundingClientRect().top));
      for (const t of new Set(cards)) best = Math.max(best, cards.filter(x => x === t).length);
    }
    return {
      perRow: best,
      tracks: grids.length ? getComputedStyle(grids[0]).gridTemplateColumns.split(' ').length : 0,
      homeWidth: Math.round(home.getBoundingClientRect().width),
      inner: window.innerWidth,
    };
  });

  // ≥2 cards share a row (the fixture's largest region has two).
  expect(m.perRow, 'the cards are stacked one per row on a 1440 screen').toBeGreaterThanOrEqual(2);
  expect(m.tracks, 'the grid has fewer than two columns').toBeGreaterThanOrEqual(2);
  // …and the home really uses the width it is given (spec §6 "full width desktop"): body
  // padding is 24 px a side, so anything much under that is a cap someone re-introduced.
  expect(m.homeWidth).toBeGreaterThan(m.inner - 80);

  expectNoConsoleErrors(rec);
});

test('A3 — a page the person may not open is not offered as a tab', async ({ page }, ti) => {
  // מתניה's landing is 💻 פיתוח (§7l), so the card home is hidden — wait on the nav instead.
  const { rec, viewport } = await boot(page, ti, { who: 'מתניה', ready: '' });
  test.skip(viewport !== 'mobile-390', 'the tab bar is the phone\'s');

  const nav = page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]');
  // canShowPage('inventory') is false for מתניה (js/src/00-bridge.js) and showPage() sends
  // her back to קיבוצים — the tab was a dead control.
  expect(await page.evaluate(() => (window as any).sigma.canShowPage('inventory'))).toBe(false);
  await expect(nav.getByRole('button', { name: 'מלאי', exact: true })).toHaveCount(0);
  // …and the tabs she IS allowed are still there.
  await expect(nav.getByRole('button', { name: 'קיבוצים', exact: true })).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('A3 — the tab IS offered to someone the gate allows', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'אביאם' });
  test.skip(viewport !== 'mobile-390', 'the tab bar is the phone\'s');

  const nav = page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]');
  expect(await page.evaluate(() => (window as any).sigma.canShowPage('inventory'))).toBe(true);
  // 22.9 round 2 (Package A): for אביאם/ניתאי the bar is נוכחות · יומן · 📍 · קיבוצים · עוד, and
  // מלאי is the FIRST row of ⋯ — offered, just not on the bar.
  await expect(nav.getByRole('button', { name: 'מלאי', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'נוכחות', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'עוד', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'מלאי', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expectNoConsoleErrors(rec);
});
