// Round 5 · X-U designer evidence (docs/superpowers/specs/2026-09-23-r5-X-security-copy.md,
// task X-U1: "the message sheet on the design system"). Not part of the correctness gate
// (no-overlap.spec.ts + MessageSheet.test.tsx own that) — this file only produces
// qa/evidence/X-U/*.png for the designer's PASS. Run under mobile-390-light and mobile-390-dark
// (the only two projects with BOTH a real storage `theme` and enough headroom to resize into);
// each test resizes into the two widths the designer asked for (360 and 412) after boot so the
// SAME theme/localStorage setup produces both sizes — same pattern as zz-cu-evidence.spec.ts.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { boot, expect, test } from './_helpers';

const OUT = path.resolve(__dirname, '..', '..', 'evidence', 'X-U');
mkdirSync(OUT, { recursive: true });

/** rgb()/rgba() string → relative luminance, 0 (black) .. 1 (white) — same check zz-cu-evidence
    uses to prove a "dark" capture is actually dark, not just labeled that way. */
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

async function openMessageSheet(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-message')));
  await expect(page.getByTestId('cmd-message')).toBeVisible();
}

const WIDTHS: Array<{ w: number; h: number }> = [{ w: 360, h: 780 }, { w: 412, h: 915 }];

test.describe('X-U evidence captures', () => {
  test.beforeEach(({}, ti) => {
    test.skip(!['mobile-390-light', 'mobile-390-dark'].includes(ti.project.name), 'one run per theme is enough');
  });

  for (const { w, h } of WIDTHS) {
    test(`compose sheet — empty @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openMessageSheet(page);
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `compose-empty__${w}__${theme}.png`) });
    });

    test(`compose sheet — filled @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openMessageSheet(page);
      const to = page.getByTestId('cmd-message-to').getByRole('button').first();
      await to.click();
      await page.getByTestId('cmd-message-text').fill('אפשר לעדכן אותי כשמגיעים לדפנה?');
      await expect(page.getByTestId('cmd-message-send')).toBeEnabled();
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `compose-filled__${w}__${theme}.png`) });
    });

    // The 42501 write-policy toast (X-U1, spec §"Task X-U1"): the default write-route fallback
    // in installRoutes() already 401s any table with no special-case (`messages` has none), so
    // sending for real reproduces the exact server response the toast branches on — no extra
    // route stub needed.
    test(`send — 42501 error toast @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openMessageSheet(page);
      await page.getByTestId('cmd-message-to').getByRole('button').first().click();
      await page.getByTestId('cmd-message-text').fill('בדיקת שגיאת הרשאה');
      await page.getByTestId('cmd-message-send').click();
      await expect(page.getByText('אין הרשאה לשלוח כרגע. כדאי להתחבר מחדש ולנסות שוב.')).toBeVisible();
      // The sheet itself stays open on a failed send (only setOpen(false) on the success path).
      await expect(page.getByTestId('cmd-message')).toBeVisible();
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `send-error-toast__${w}__${theme}.png`) });
    });

    // The unread popup on load (js/src/17-messages.js `staffCheckMessages`, spec: "belongs to
    // package R, not X") — captured anyway as the receiving side of the same feature, for the
    // designer's context. `?sb=0`'s default GET on `messages` is `[]`; this test overrides just
    // that one route with a real unread row, then re-runs the same check the boot flow already
    // fired once (against the empty default) so it actually finds something this time.
    test(`inbox with unread @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await page.route('**/rest/v1/messages*', route => {
        if (route.request().method() !== 'GET') return route.continue();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, to_person: 'עידן', from_person: 'אביאם', text: 'אפשר לתאם שיחה על דפנה?', created_at: new Date().toISOString(), read_at: null },
          ]),
        });
      });
      await page.evaluate(() => {
        (window as any)._msgsChecked = false;
        return (window as any).staffCheckMessages?.();
      });
      await expect(page.locator('#msgPopup')).toBeVisible();
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `inbox-unread__${w}__${theme}.png`) });
    });
  }
});
