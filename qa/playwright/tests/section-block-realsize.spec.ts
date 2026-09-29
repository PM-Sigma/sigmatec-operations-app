// SectionBlock body geometry (round 9, w2-sectionblock). 2c09a0da fixed the non-flush body
// clipping ~16-30px off every row's inline-start edge, but shipped with only a gallery test and
// was reverted (21fe1734) when the home looked broken on real data. This spec guards BOTH sides:
//  1. real-size home (60 kibbutzim, 480 visits, long names): every card renders fully, a tap
//     opens KibbutzDetail, and no <section> body clips its own rows — passes before AND after the
//     fix, so it proves the fix did not break the home;
//  2. gallery ListRow SectionBlock: a row spans the section's outer edges (fails before the fix).
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { boot, expect, expectNoConsoleErrors, test, type Who } from './_helpers';

const EVIDENCE_DIR = path.resolve(__dirname, '..', '..', 'evidence', 'w2-sectionblock');
const N = 60;
const LONG = ['מעגן מיכאל — בית ספר שדה ומרכז מבקרים אזורי', 'קיבוץ כפר מסריק (אתר מרכזי + מפעל + רפת)', 'נווה אור — מתחם תעשייה ומלונאות'];
const REGIONS = ['גליל וגולן', 'העמקים', 'דרום, עוטף עזה והנגב', 'שרון ומרכז', 'ערבה וים המלח'];
const ENERGY = [['electric'], ['electric', 'water'], ['gas'], ['electric', 'gas'], ['water']];
/** Same production-shaped fixture as home-realsize.spec.ts (60 kibbutzim, long names). */
function bigKibbutzim(): Array<Record<string, unknown>> {
  return Array.from({ length: N }, (_, i) => ({
    id: 'big' + i, name: i < LONG.length ? LONG[i] : 'קיבוץ בדיקה ' + (i + 1), display_name: null,
    section: i % 9 === 0 ? 'new' : 'active', region: REGIONS[i % REGIONS.length], energy: ENERGY[i % ENERGY.length],
    kind: i % 11 === 5 ? 'subsite' : 'kibbutz', parent: i % 11 === 5 ? 'קיבוץ בדיקה ' + i : null,
    marketing: i % 7 === 0, archived_at: null,
    ems_site_ids: i % 13 === 4 ? [] : ['00000000-0000-4000-8000-' + String(i).padStart(12, '0')],
  }));
}

/** Rows/buttons inside a <section> that stick out of (are clipped by) the section's box. */
function clippedInSections() {
  const bad: string[] = [];
  for (const s of Array.from(document.querySelectorAll<HTMLElement>('section'))) {
    const sr = s.getBoundingClientRect();
    if (sr.width === 0 || sr.height === 0) continue;
    const label = (s.querySelector('h2, button')?.textContent || '').trim().slice(0, 24);
    for (const el of Array.from(s.querySelectorAll<HTMLElement>('button, a, [role="button"], li'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < sr.left - 1 || r.right > sr.right + 1) bad.push(`${label}: <${el.tagName}> outside section`);
      // visually clipped by an overflow:hidden ancestor inside the section (the original bug:
      // the -mx-4 bleed wrapper sat INSIDE the collapse box's overflow-hidden)
      for (let a = el.parentElement; a && a !== s; a = a.parentElement) {
        if (getComputedStyle(a).overflowX === 'visible') continue;
        const ar = a.getBoundingClientRect();
        if (r.left < ar.left - 1 || r.right > ar.right + 1) { bad.push(`${label}: <${el.tagName}> clipped by ancestor overflow`); break; }
      }
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible')
        bad.push(`${label}: <${el.tagName}> content clipped`);
    }
  }
  return bad;
}

async function realSizeHome(page: Page, ti: TestInfo, checkClip: boolean) {
  const rows = bigKibbutzim();
  const names = rows.map(r => r.name as string);
  await page.addInitScript(n => { (window as any).__bigNames = n; }, names);
  await page.addInitScript(() => {
    const out: any[] = [];
    for (let i = 0; i < 480; i++) out.push({
      id: 'rv' + i, kibbutz: (window as any).__bigNames[i % 60], visitor: ['עידן', 'אביאם', 'ניתאי'][i % 3],
      duration: 3, summary: 'סיכום ' + i, workday: false, date: new Date(Date.now() - (i % 40) * 6 * 86_400_000).toISOString(),
    });
    let v: any;
    Object.defineProperty(window, 'SHEET_DATA', { configurable: true, get: () => v,
      set: (x: any) => { v = x; if (v && Array.isArray(v.visits)) v.visits = v.visits.concat(out); } });
  });
  const { rec, viewport, theme } = await boot(page, ti, { kibbutzim: rows });
  await expect(page.locator('#sigma-home .kibbutz')).toHaveCount(N, { timeout: 30_000 });
  await page.waitForTimeout(1500);

  const empty = await page.evaluate(() => Array.from(document.querySelectorAll('#sigma-home .kibbutz'))
    .filter(c => !(c.querySelector('.kibbutz-name')?.textContent || '').trim()).length);
  expect(empty, 'cards missing their name/info').toBe(0);
  const cut = await page.evaluate(() => {
    const vw = window.innerWidth; const bad: string[] = [];
    for (const c of Array.from(document.querySelectorAll<HTMLElement>('#sigma-home .kibbutz'))) {
      const cr = c.getBoundingClientRect();
      if (cr.height < 60 || cr.left < -0.5 || cr.right > vw + 0.5 || c.scrollWidth > c.clientWidth + 1) bad.push(c.dataset.name!);
    }
    return bad;
  });
  expect(cut, 'cards cut/overflowing').toEqual([]);
  if (checkClip) expect(await page.evaluate(clippedInSections), 'section rows clipped on home').toEqual([]);

  for (const name of [names[0], names[30], names[N - 1]]) {
    const card = page.locator(`#sigma-home .kibbutz[data-name="${name}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.locator('.kibbutz-name').click();
    await expect(page.locator('[data-testid="kibbutz-detail"]')).toBeVisible();
    if (checkClip) expect(await page.evaluate(clippedInSections), `section rows clipped in detail (${name})`).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="kibbutz-detail"]')).toHaveCount(0);
  }
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.locator(`#sigma-home .kibbutz[data-name="${names[1]}"]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${viewport}-${theme}-home${checkClip ? '-clipcheck' : ''}.png`) });
  expectNoConsoleErrors(rec);
}

// Baseline: cards render fully + tap opens detail on real-size data (green before AND after the fix).
test('real-size home: 60 cards full, tap opens detail', ({ page }, ti) => realSizeHome(page, ti, false));
// The clip guard on the same real-size data (red before the fix, green after).
test('real-size home + detail: no SectionBlock row is clipped', ({ page }, ti) => realSizeHome(page, ti, true));

test('SectionBlock non-flush row spans the section outer edges (RTL)', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' as Who, query: 'gallery=1', ready: '[data-testid="gallery-root"]' });
  await expect(page.getByTestId('gallery-root')).toBeVisible({ timeout: 20_000 });
  const rects = await page.evaluate(() => {
    const section = Array.from(document.querySelectorAll('[data-testid="gallery-root"] section'))
      .find(s => s.textContent?.includes('ListRow')) as HTMLElement | undefined;
    const row = section?.querySelector('button') as HTMLElement | null;
    if (!section || !row) return null;
    const s = section.getBoundingClientRect(), r = row.getBoundingClientRect();
    return { sl: s.left, sr: s.right, rl: r.left, rr: r.right };
  });
  expect(rects, 'gallery ListRow SectionBlock not found').not.toBeNull();
  expect(Math.abs(rects!.rl - rects!.sl), `row.left ${rects!.rl} vs ${rects!.sl}`).toBeLessThanOrEqual(1);
  expect(Math.abs(rects!.rr - rects!.sr), `row.right ${rects!.rr} vs ${rects!.sr}`).toBeLessThanOrEqual(1);
  expect(await page.evaluate(clippedInSections), 'gallery sections clipped').toEqual([]);
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const vp = ti.project.metadata as any;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${vp.viewport}-${vp.theme}-gallery.png`) });
});
