// R9 — desktop-fitted attendance + report pages (עידן 11.10). Desktop 1440 and 1024, both themes.
// Asserts no horizontal scroll and no phone chrome on desktop, and writes the screenshots to
// qa/evidence/attendance-desktop/. Phone layout is covered by the existing per-page specs.
import { boot, expect, test, type Who } from './_helpers';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(__dirname, '..', '..', 'evidence', 'attendance-desktop');
const WIDTHS = [1440, 1024];

async function open(page: Page, view: string, fn: string, ready: string) {
  await expect.poll(async () => page.evaluate(([v, f]) => {
    (window as any).sigma?.showPage?.(f);
    const el = document.getElementById(v);
    return !!el && el.style.display !== 'none';
  }, [view, fn]), { timeout: 20_000 }).toBe(true);
  await page.waitForSelector(ready, { state: 'visible', timeout: 20_000 });
  await page.evaluate(() => document.body.click()); // useCurrentPage re-reads on a click, like a real nav tap
  await page.waitForTimeout(600);
}

const PAGES: Array<{ key: string; who: Who; view: string; fn: string; ready: string }> = [
  { key: 'attendance-idan', who: 'עידן', view: 'attendance-view', fn: 'attendance', ready: '[data-testid="att-grid"]' },
  { key: 'attendance-viewer', who: 'צפייה', view: 'attendance-view', fn: 'attendance', ready: '[data-testid="att-grid"]' },
  { key: 'hours', who: 'עמיחי', view: 'hours-view', fn: 'hours', ready: '[data-testid="hours-page"]' },
  { key: 'burns', who: 'עמיחי', view: 'burns-view', fn: 'burns', ready: '#sigma-burns-page *' },
  { key: 'emsstats', who: 'עידן', view: 'emsstats-view', fn: 'emsstats', ready: '[data-testid="emsstats-page"]' },
];

for (const p of PAGES) {
  for (const w of WIDTHS) {
    test(`desktop ${p.key} @${w}`, async ({ page }, ti) => {
      test.skip(!String(ti.project.name).startsWith('desktop-1440'), 'desktop projects only');
      const theme = (ti.project.metadata as any).theme;
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page, ti, { who: p.who });
      await page.setViewportSize({ width: w, height: 900 });
      await open(page, p.view, p.fn, p.ready);
      // no horizontal scroll, no phone bottom bar
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
      const navVisible = await page.evaluate(() => {
        const n = document.querySelector('#sigma-nav nav') as HTMLElement | null;
        return !!n && n.getBoundingClientRect().height > 0 && getComputedStyle(n).display !== 'none';
      });
      expect(navVisible).toBe(false);
      await page.evaluate(() => {
        const hit = Array.from(document.querySelectorAll('body *')).filter(e => /וואטסאפ/.test(e.textContent || '') && !Array.from(e.children).some(c => /וואטסאפ/.test(c.textContent || '')));
        hit.forEach(e => (e.closest('[data-sonner-toast],li,[role="status"],[role="alert"]') || e).remove());
        document.querySelectorAll('[data-sonner-toaster]').forEach(e => e.remove());
      }); // no transient toast in evidence
      await mkdir(OUT, { recursive: true });
      await page.screenshot({ path: resolve(OUT, `${p.key}-${w}-${theme}.png`), fullPage: true });
      if (p.key.startsWith('attendance')) {
        const grid = await page.getByTestId('att-grid').boundingBox();
        const panel = await page.getByTestId('att-panel').boundingBox();
        await expect(page.getByTestId('att-today')).toHaveCount(0); // one day editor on desktop
        const miss = await page.getByTestId('att-missing').boundingBox();
        if (miss) expect(miss.y).toBeGreaterThan(grid!.y + grid!.height - 5); // shortages sit under the calendar
        expect(grid!.y).toBeLessThan(400); // two columns: the month sits beside the panel, not below it
        expect(panel!.x + panel!.width).toBeLessThanOrEqual(grid!.x + 1);
        expect(grid!.x).toBeGreaterThan(panel!.x); // RTL: main column on the right of the panel
      }
    });
  }
}
