// Round 5 · I-U designer evidence — package I (inventory rewrite). Not part of the correctness
// gate (the qa/playwright/tests/inventory/*.spec.ts suite + no-overlap.spec.ts own that) — this
// file only produces qa/evidence/I-U/*.png for the designer's PASS.
//
// Round 1 (26.9) captures were ALL invalid: an ad-hoc capture script (never committed — this is
// the first version of this file in the repo) resized the viewport with `page.setViewportSize`
// BEFORE `boot()`'s own navigation, which raced the very first layout against a resize event
// still in flight — the app painted at its OLD (default project) size into the top third of the
// frame and the rest of the PNG was the untouched background. Every other package's evidence
// file (zz-cu-evidence.spec.ts, zz-xu-evidence.spec.ts, …) resizes AFTER boot(), never before —
// this file follows that same, already-proven order.
//
// Designer round-1 fixes captured here (round 1 was NOT PASS): (2) cert-sheet customer fields
// now labelled like the order sheet (InventoryCert.tsx); (3) ListRow wraps `title` in `<bdi>` so
// a mixed Hebrew/Latin/digit product name never reorders; (4) a cancelled cert row is a "בוטלה"
// Tag + its own "הוחלפה ב-…" line, no "→" chain; (5) the stock tab's three KPI tiles are pinned
// to `grid-cols-3` and the items tile no longer shows a selected-looking ring by default; (6) the
// orders row moves the ספק/לקוח tag inline with the title (was a crowding `leading` slot) and
// gives the item count its own meta line; (7) a single-kibbutz stock card opens by default.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './_helpers';
import { bootInv, driverFor } from './inventory/_inv-driver';
import { INVENTORY } from './inventory/_inv-fixtures';

const OUT = path.resolve(__dirname, '..', '..', 'evidence', 'I-U');
mkdirSync(OUT, { recursive: true });

const d = driverFor();
const WIDTHS: Array<{ w: number; h: number }> = [{ w: 360, h: 780 }, { w: 412, h: 915 }];

/** rgb()/rgba() string → relative luminance, 0 (black) .. 1 (white) — same check every other
    package's evidence file uses to prove a "dark" capture is actually dark pixels. */
function luminance(rgb: string): number {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(rgb);
  if (!m) return 1;
  const [r, g, b] = [m[1], m[2], m[3]].map(v => Number(v) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function assertThemePixels(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (theme === 'dark') expect(luminance(bg)).toBeLessThan(0.3);
  else expect(luminance(bg)).toBeGreaterThan(0.7);
}

/** A plausible inventory_delete_preview() row for the delete-confirm capture — the one RPC
    nothing else in this suite stubs (nothing else exercises the delete flow over the network). */
function deletePreviewFixture(name: string) {
  return {
    product: name, exists: 1, movements: 2,
    orders_deleted: [], orders_trimmed: ['ord-3'],
    certs_referencing: [1041], certs_referencing_active: [1041],
    visits_trimmed: 1, requirements_trimmed: 0, requirements_deleted: 0,
    returns: 0, recounts: 0, alerts: 1, parse_examples: 0,
    fingerprint: 'evidence-fp',
  };
}

test.describe('I-U evidence captures', () => {
  test.beforeEach(({}, ti) => {
    test.skip(!['mobile-390-light', 'mobile-390-dark'].includes(ti.project.name), 'one run per theme is enough');
  });

  for (const { w, h } of WIDTHS) {
    const TABS: Array<{ tab: 'orders' | 'stock' | 'certs' | 'kibbutz' | 'returns' | 'products'; name: string }> = [
      { tab: 'orders', name: 'orders' },
      { tab: 'stock', name: 'stock' },
      { tab: 'certs', name: 'certs' },
      { tab: 'kibbutz', name: 'kibbutz' },
      { tab: 'returns', name: 'returns' },
      { tab: 'products', name: 'products' },
    ];
    for (const { tab, name } of TABS) {
      test(`tab: ${name} @ ${w}`, async ({ page }, ti) => {
        const { theme } = await bootInv(page, ti, 'עידן', d);
        await page.setViewportSize({ width: w, height: h });
        await d.openTab(page, tab);
        await assertThemePixels(page, theme);
        // Designer round-3, item 1: cert 1042 (cancelled, replaced_by 1043) must read as ONE
        // inline run — no nbsp, no flex/gap sibling splitting the number into its own box.
        if (tab === 'certs') {
          const text = await page.locator('[data-testid="inv-cert-row-1042"] :text("הוחלפה")').innerText();
          expect(text).toBe('הוחלפה ב־1043');
        }
        // Designer round-3, item 2: the scroll-fade is a real gradient overlay div now (not a
        // mask-image on the scroll container, which never showed up in a real capture) —
        // assert it exists in the DOM at every width this tab strip renders at.
        await expect(page.getByTestId('inv-tabstrip-fade')).toBeAttached();
        await page.screenshot({ path: path.join(OUT, `${w}-${theme}-tab-${name}.png`) });
      });
    }

    test(`order sheet @ ${w}`, async ({ page }, ti) => {
      const { theme } = await bootInv(page, ti, 'עידן', d);
      await page.setViewportSize({ width: w, height: h });
      await d.openTab(page, 'orders');
      await page.locator('[data-testid="inv-order-row-ord-3"]').click();
      await expect(page.getByTestId('order-sheet')).toBeVisible();
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `${w}-${theme}-order-sheet.png`) });
    });

    test(`cert sheet @ ${w}`, async ({ page }, ti) => {
      const { theme } = await bootInv(page, ti, 'עידן', d);
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-inv-open', { detail: { kind: 'cert', pre: {} } })));
      await expect(page.getByTestId('cert-sheet')).toBeVisible();
      // Designer round-1 item 2: the two customer fields (name/contact) both default from the
      // kibbutz name — assert the labels this fix added are actually there, not just placeholders.
      await expect(page.locator('label[for="certCustName"]')).toHaveText('שם לקוח');
      await expect(page.locator('label[for="certCustContact"]')).toHaveText('איש קשר');
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `${w}-${theme}-cert-sheet.png`) });
    });

    test(`product sheet @ ${w}`, async ({ page }, ti) => {
      const { theme } = await bootInv(page, ti, 'עידן', d);
      await page.setViewportSize({ width: w, height: h });
      await d.openTab(page, 'products');
      await page.locator('[data-testid^="inv-product-row-"]').first().click();
      await expect(page.getByTestId('ps-save')).toBeVisible();
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `${w}-${theme}-product-sheet.png`) });
    });

    test(`delete-confirm preview @ ${w}`, async ({ page }, ti) => {
      const { theme } = await bootInv(page, ti, 'עידן', d);
      await page.setViewportSize({ width: w, height: h });
      const productName = INVENTORY.products[0].name;
      await page.route('**/rest/v1/rpc/inventory_delete_preview', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deletePreviewFixture(productName)) }));
      await d.openTab(page, 'products');
      await page.locator(`[data-testid^="inv-product-row-"]`).first().click();
      await page.getByTestId('ps-more').click();
      await page.getByTestId('ps-delete').click();
      await expect(page.getByText(productName, { exact: false }).first()).toBeVisible();
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `${w}-${theme}-delete-preview.png`) });
    });
  }
});
