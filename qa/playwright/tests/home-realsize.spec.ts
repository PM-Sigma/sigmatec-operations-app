// Real-size home page (round 9, w1-cardbtn). The 7-kibbutz fixture passed while real data
// (~60 kibbutzim, hundreds of visits, long names) broke the home page when per-card visit
// buttons shipped (36fac282, reverted 2a9c7849). This spec boots the home with a
// production-shaped fixture and asserts: every card renders its full content, a card tap opens
// KibbutzDetail, nothing is clipped or overflowing, and first render stays inside a time budget.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';

const EVIDENCE_DIR = path.resolve(__dirname, '..', '..', 'evidence', 'w1-cardbtn');
const N = 60;
const RENDER_BUDGET_MS = 15_000;

const LONG = [
  'מעגן מיכאל — בית ספר שדה ומרכז מבקרים אזורי',
  'קיבוץ כפר מסריק (אתר מרכזי + מפעל + רפת)',
  'נווה אור — מתחם תעשייה ומלונאות',
];
const REGIONS = ['גליל וגולן', 'העמקים', 'דרום, עוטף עזה והנגב', 'שרון ומרכז', 'ערבה וים המלח'];
const ENERGY = [['electric'], ['electric', 'water'], ['gas'], ['electric', 'gas'], ['water']];

export function bigKibbutzim(): Array<Record<string, unknown>> {
  return Array.from({ length: N }, (_, i) => ({
    id: 'big' + i,
    name: i < LONG.length ? LONG[i] : 'קיבוץ בדיקה ' + (i + 1),
    display_name: null,
    section: i % 9 === 0 ? 'new' : 'active',
    region: REGIONS[i % REGIONS.length],
    energy: ENERGY[i % ENERGY.length],
    kind: i % 11 === 5 ? 'subsite' : 'kibbutz',
    parent: i % 11 === 5 ? 'קיבוץ בדיקה ' + i : null,
    marketing: i % 7 === 0,
    archived_at: null,
    ems_site_ids: i % 13 === 4 ? [] : ['00000000-0000-4000-8000-' + String(i).padStart(12, '0')],
  }));
}

/** ~480 visits spread over all kibbutzim: recent (editable) and old (locked) ones. */
function visitsInit(names: string[]) {
  return () => {
    const out: any[] = [];
    const day = 86_400_000;
    for (let i = 0; i < 480; i++) {
      out.push({
        id: 'rv' + i, kibbutz: (window as any).__bigNames[i % (window as any).__bigNames.length],
        visitor: ['עידן', 'אביאם', 'ניתאי'][i % 3], duration: 3, summary: 'סיכום ' + i, workday: false,
        date: new Date(Date.now() - (i % 40) * 6 * day).toISOString(),
      });
    }
    let v: any;
    Object.defineProperty(window, 'SHEET_DATA', {
      configurable: true,
      get: () => v,
      set: (x: any) => { v = x; if (v && Array.isArray(v.visits)) v.visits = v.visits.concat(out); },
    });
  };
}

test('home real-size: 60 cards render fully, tap opens detail, no clipping, render budget', async ({ page }, ti) => {
  const rows = bigKibbutzim();
  const names = rows.map(r => r.name as string);
  await page.addInitScript(n => { (window as any).__bigNames = n; }, names);
  await page.addInitScript(visitsInit(names));
  const t0 = Date.now();
  const { rec, viewport, theme } = await boot(page, ti, { kibbutzim: rows });
  await expect(page.locator('#sigma-home .kibbutz')).toHaveCount(N, { timeout: 30_000 });
  // every card's name row painted (React-owned) — the "info missing" symptom
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.querySelectorAll('#sigma-home .kibbutz'))
      .filter(c => !(c.querySelector('.kibbutz-name')?.textContent || '').trim()).length)).toBe(0);
  const elapsed = Date.now() - t0;
  console.log(`[home-realsize ${viewport}-${theme}] boot→${N} cards: ${elapsed} ms`);
  expect(elapsed, 'first render of 60 cards over budget').toBeLessThan(RENDER_BUDGET_MS);

  await page.waitForTimeout(2000);   // let the enter/layout motion settle before measuring boxes
  const vw = page.viewportSize()!.width;
  const problems = await page.evaluate(vw => {
    const bad: string[] = [];
    const cards = Array.from(document.querySelectorAll<HTMLElement>('#sigma-home .kibbutz'));
    for (const c of cards) {
      const cr = c.getBoundingClientRect();
      const nm = c.dataset.name;
      if (cr.height < 60) bad.push(nm + ': card too short ' + cr.height);
      if (cr.left < -0.5 || cr.right > vw + 0.5) bad.push(nm + ': card outside viewport');
      if (c.scrollWidth > c.clientWidth + 1) bad.push(nm + ': card scrollWidth overflow');
      const nameEl = c.querySelector('.kibbutz-name') as HTMLElement | null;
      if (!nameEl) { bad.push(nm + ': no name'); continue; }
      if (nameEl.scrollWidth > nameEl.clientWidth + 1) bad.push(nm + ': name clipped');
      for (const el of Array.from(c.querySelectorAll<HTMLElement>('*'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < cr.left - 1 || r.right > cr.right + 1) bad.push(nm + ': <' + el.tagName + '.' + String(el.className).slice(0, 30) + '> outside card');
      }
    }
    // vertical no-overlap between cards in the same column
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i].getBoundingClientRect(), b = cards[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) bad.push(cards[i].dataset.name + ' overlaps ' + cards[j].dataset.name);
    }
    if (document.documentElement.scrollWidth > vw + 1) bad.push('page horizontal overflow');
    return bad;
  }, vw);
  expect(problems, problems.join('\n')).toEqual([]);

  // a card tap opens KibbutzDetail — first, a long-name one, a middle one, the last one
  for (const name of [names[0], names[1], names[30], names[N - 1]]) {
    const card = page.locator(`#sigma-home .kibbutz[data-name="${name}"]`);
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    // tap the padding at the top-left (not a control) and the name
    await page.mouse.click(box.x + box.width - 8, box.y + 8);
    await expect(page.locator('[data-testid="kibbutz-detail"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="kibbutz-detail"]')).toHaveCount(0);
    await card.locator('.kibbutz-name').click();
    await expect(page.locator('[data-testid="kibbutz-detail"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="kibbutz-detail"]')).toHaveCount(0);
  }

  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.locator(`#sigma-home .kibbutz[data-name="${names[1]}"]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${viewport}-${theme}-realsize-home.png`) });
  expectNoConsoleErrors(rec);
});
