// Round 5 · X-U designer evidence (docs/superpowers/specs/2026-09-23-r5-X-security-copy.md,
// task X-U1: "the message sheet on the design system"). Not part of the correctness gate
// (no-overlap.spec.ts + MessageSheet.test.tsx own that) — this file only produces
// qa/evidence/X-U/*.png for the designer's PASS. Run under mobile-390-light and mobile-390-dark
// (the only two projects with BOTH a real storage `theme` and enough headroom to resize into);
// each test resizes into the two widths the designer asked for (360 and 412) after boot so the
// SAME theme/localStorage setup produces both sizes — same pattern as zz-cu-evidence.spec.ts.
//
// Designer round 2 fixes captured here (round 1 NOT PASS): the inbox is now the same bottom
// Sheet as compose (`cmd-inbox`, MessageSheet.tsx `MessageInboxPanel`) instead of the legacy
// centered `#msgPopup`; the send error renders inline above "שליחה", never a toast; the
// empty-compose capture blurs focus first so no ring shows in the still.
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
      // Designer round 2, item 7: no focus ring in the empty capture — the sheet's own open()
      // leaves nothing focused by default, but `boot()`'s own setup can leave a stray focus on
      // the page body's last-tapped control; blur it explicitly before the still.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
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

    // The 42501 write-policy error (X-U1, spec §"Task X-U1"): the default write-route fallback
    // in installRoutes() already 401s any table with no special-case (`messages` has none), so
    // sending for real reproduces the exact server response the inline error branches on — no
    // extra route stub needed. Designer round 2, item 4: inline above "שליחה", not a toast.
    test(`send — 42501 inline error @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openMessageSheet(page);
      await page.getByTestId('cmd-message-to').getByRole('button').first().click();
      await page.getByTestId('cmd-message-text').fill('בדיקת שגיאת הרשאה');
      await page.getByTestId('cmd-message-send').click();
      const err = page.getByTestId('cmd-message-error');
      await expect(err).toBeVisible();
      await expect(err).toContainText('אין הרשאה לשלוח כרגע. כדאי להתחבר מחדש ולנסות שוב.');
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);   // never a toast (item 4)
      // The sheet itself stays open on a failed send (only setOpen(false) on the success path).
      await expect(page.getByTestId('cmd-message')).toBeVisible();
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `send-error-toast__${w}__${theme}.png`) });
    });

    // The unread popup on load (js/src/17-messages.js `staffCheckMessages`) — designer round 2,
    // item 1: it now hands its rows to `MessageInboxPanel` (`cmd-inbox`, the SAME bottom Sheet
    // component as compose) instead of building the legacy centered `#msgPopup` div, once this
    // chunk is loaded (`window.__sigmaStaffMessagesReady`, set the moment MessageSheet.tsx
    // evaluates). `openMessageSheet` above already loaded it; close compose, then re-run the
    // same unread check the boot flow already fired once (against `?sb=0`'s empty default) with
    // a real row stubbed in, so it actually finds something this time.
    test(`inbox with unread @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'עידן' });
      await page.setViewportSize({ width: w, height: h });
      await openMessageSheet(page);   // loads the chunk → __sigmaStaffMessagesReady = true
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('cmd-message')).toBeHidden();
      await page.route('**/rest/v1/messages*', route => {
        if (route.request().method() !== 'GET') return route.continue();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, to_person: 'עידן', from_person: 'אביאם', text: 'אפשר לתאם שיחה על דפנה?', created_at: '2026-09-26T22:48:00' },
          ]),
        });
      });
      await page.evaluate(() => {
        (window as any)._msgsChecked = false;
        return (window as any).staffCheckMessages?.();
      });
      const inbox = page.getByTestId('cmd-inbox');
      await expect(inbox).toBeVisible();
      await expect(page.locator('#msgPopup')).toHaveCount(0);   // never the legacy centered modal (item 1)
      await expect(inbox).toContainText('הודעה חדשה אחת');       // item 2: singular wording
      await expect(inbox).toContainText('26.9 · 22:48');          // item 3: no seconds
      await assertThemePixels(page, theme);
      await page.screenshot({ path: path.join(OUT, `inbox-unread__${w}__${theme}.png`) });
    });
  }
});
