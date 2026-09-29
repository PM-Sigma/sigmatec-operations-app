// פעולות שטח — the field hub (spec 2026-09-29-field-ops-hub-design.md §1–§4, step C).
//
// ONE page for the field world: היום שלי → נוכחות → קריאות IP → צריבות, with a sticky jump nav.
// What only a real browser can answer, at the two phone widths that matter (360 · 412), light
// and dark: the sections come in that order, the nav jumps to each and never leaves the screen,
// every old entry point (showPage('attendance'|'burns'), a restored sigma_page_v1) lands on the
// hub scrolled to its section, each role sees exactly its sections, the kibbutz card's burns row
// arrives at the burns section filtered to that kibbutz — on a production-shaped fixture (60
// kibbutzim, hundreds of burn rows) — and nothing overlaps or scrolls sideways.
// Evidence screenshots are taken INSIDE the asserting tests into qa/evidence/field-hub/.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { boot, expect, expectNoConsoleErrors, expectRtl, test, type Who } from './_helpers';
import { scanOverlap } from './_overlap';

const EVIDENCE = path.resolve(__dirname, '..', '..', 'evidence', 'field-hub');

test.beforeEach(({}, ti) => {
  test.skip(!/^mobile-(360|412)-(dark|light)$/.test(ti.project.name), 'the hub is verified at the two phone widths, both themes');
});

// ── the real-size fixture ───────────────────────────────────────────────────────────────

const N = 60;
const LONG = ['מעגן מיכאל — בית ספר שדה ומרכז מבקרים אזורי', 'קיבוץ כפר מסריק (אתר מרכזי + מפעל + רפת)', 'נווה אור — מתחם תעשייה ומלונאות'];
const REGIONS = ['גליל וגולן', 'העמקים', 'דרום, עוטף עזה והנגב', 'שרון ומרכז', 'ערבה וים המלח'];
const STATUS = ['pending', 'burned', 'issue', 'burned', 'pending'];

function kibbutzim(): Array<Record<string, unknown>> {
  return Array.from({ length: N }, (_, i) => ({
    id: 'fh' + i,
    name: i < LONG.length ? LONG[i] : 'קיבוץ בדיקה ' + (i + 1),
    display_name: null,
    section: i % 9 === 0 ? 'new' : 'active',
    region: REGIONS[i % REGIONS.length],
    energy: ['electric'],
    kind: 'kibbutz',
    parent: null,
    marketing: false,
    archived_at: null,
    ems_site_ids: ['00000000-0000-4000-8000-' + String(i).padStart(12, '0')],
  }));
}

/** Three of every four kibbutzim have 3–9 burn rows (~250 rows in all). */
function burns(): Array<Record<string, unknown>> {
  const ks = kibbutzim();
  const out: Array<Record<string, unknown>> = [];
  ks.forEach((k, i) => {
    if (i % 4 === 3) return;
    const n = 3 + (i % 7);
    for (let j = 0; j < n; j++) {
      const status = STATUS[(i + j) % STATUS.length];
      out.push({
        meter_id: `fb-${i}-${j}`, serial: String(60000000 + i * 100 + j), site: k.name, site_id: null,
        meter_type: j % 3 === 0 ? 'E360CT' : 'E360PP', address: 'מבנה ' + (j + 1), role_code: 20,
        ct_ratio: j % 3 === 0 ? 50 : 1, parent_serial: String(70000000 + i), solar_names: null,
        status, burned_by: status === 'burned' ? 'אביאם' : null,
        burned_at: status === 'burned' ? new Date(Date.now() - 3 * 86_400_000).toISOString() : null,
        generator_id: null, note: status === 'issue' ? 'אין גישה לארון' : null,
      });
    }
  });
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────

type Sec = 'today' | 'attendance' | 'ip' | 'burns';
const SEC_ID: Record<Sec, string> = { today: 'sigma-fieldhub-today', attendance: 'attendance-view', ip: 'fieldops-ip', burns: 'burns-view' };
const SEC_LABEL: Record<Sec, string> = { today: 'היום שלי', attendance: 'נוכחות', ip: 'קריאות IP', burns: 'צריבות' };
/** What each section's island paints once it is really there. */
const SEC_READY: Record<Sec, string> = {
  today: '[data-testid="fieldhub-today-visit"]',
  attendance: '[data-testid="att-grid"]',
  ip: '[data-testid="fieldops-page"]',
  burns: '[data-testid="burns-page"]',
};

async function shotEv(page: Page, ti: TestInfo, name: string): Promise<void> {
  const vp = (ti.project.metadata as any).viewport as string;
  const theme = (ti.project.metadata as any).theme as string;
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE, `${vp}-${theme}-${name}.png`) });
}

/** showPage is RETRIED: the legacy bundle defines it a beat after the island chunks land. */
async function gotoHub(page: Page, via: 'fieldops' | 'attendance' | 'burns' = 'fieldops'): Promise<void> {
  await expect.poll(() => page.evaluate(v => {
    const w = window as any;
    if (w._currentPage !== 'fieldops') { w.sigma?.showPage?.(v); w.showPage?.(v); return false; }
    return true;
  }, via), { timeout: 30_000 }).toBe(true);
  // useCurrentPage re-reads on a real click/hashchange only (see shell.spec.ts) — a real tap follows.
  await page.evaluate(() => document.body.click());
  await expect(page.getByTestId('fieldhub-nav')).toBeVisible({ timeout: 20_000 });
}

async function waitSections(page: Page, secs: Sec[]): Promise<void> {
  for (const s of secs) await page.waitForSelector(`#${SEC_ID[s]} ${SEC_READY[s]}`, { state: 'visible', timeout: 25_000 });
  await page.waitForTimeout(500); // entrance motion + late layout shifts
}

/** The section containers that are on screen (display) and the labels the jump nav offers. */
async function visibleSections(page: Page): Promise<{ boxes: Sec[]; nav: string[] }> {
  return page.evaluate(ids => {
    const boxes = (Object.keys(ids) as Sec[]).filter(k => {
      const el = document.getElementById(ids[k]);
      return !!el && el.style.display !== 'none' && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().height > 0;
    });
    const nav = Array.from(document.querySelectorAll('[data-testid="fieldhub-nav"] [role="radio"]')).map(e => (e.textContent || '').trim());
    return { boxes, nav };
  }, SEC_ID as any) as any;
}

/** Geometry the jump/scroll assertions share: nav box, section top, its first heading's top. */
async function geometry(page: Page, id: string) {
  return page.evaluate(id => {
    const nav = document.querySelector('[data-testid="fieldhub-nav"]')!.getBoundingClientRect();
    const sec = document.getElementById(id)!;
    const r = sec.getBoundingClientRect();
    const h = sec.querySelector('h1,h2,h3,[role="heading"]');
    const doc = document.scrollingElement || document.documentElement;
    return {
      navTop: nav.top, navBottom: nav.bottom, secTop: r.top, secBottom: r.bottom,
      headTop: h ? h.getBoundingClientRect().top : r.top,
      vh: window.innerHeight,
      atBottom: doc.scrollTop + window.innerHeight >= doc.scrollHeight - 2,
    };
  }, id);
}

/** Scroll has settled (two equal reads) — smooth scrolling + island layout shifts included. */
async function settle(page: Page): Promise<void> {
  let last = -1;
  await expect.poll(async () => {
    const y = await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop);
    const same = y === last; last = y; return same;
  }, { timeout: 8_000, intervals: [250, 250, 250, 250] }).toBe(true);
}

async function expectSectionInView(page: Page, id: string, label: string): Promise<void> {
  await settle(page);
  const g = await geometry(page, id);
  expect(g.navTop, `${label}: the sticky nav must stay on screen`).toBeGreaterThanOrEqual(-1);
  expect(g.navBottom, `${label}: the sticky nav must stay on screen`).toBeLessThan(140);
  expect(g.headTop, `${label}: the section heading must not hide under the sticky nav`).toBeGreaterThanOrEqual(g.navBottom - 1);
  expect(g.secTop, `${label}: the section starts inside the viewport`).toBeLessThan(g.vh - 60);
  if (!g.atBottom) expect(g.secTop, `${label}: the section was scrolled to`).toBeLessThanOrEqual(g.navBottom + 140);
}

// ── tests ───────────────────────────────────────────────────────────────────────────────

test('hub: sections in order (היום שלי → נוכחות → קריאות IP → צריבות), jump nav scrolls to each and stays put', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', kibbutzim: kibbutzim(), burns: burns() });
  await gotoHub(page);
  await waitSections(page, ['today', 'attendance', 'ip', 'burns']);

  const { boxes, nav } = await visibleSections(page);
  expect(boxes).toEqual(['today', 'attendance', 'ip', 'burns']);
  expect(nav).toEqual(['היום שלי', 'נוכחות', 'קריאות IP', 'צריבות']);

  const tops = await page.evaluate(ids => Object.values(ids).map(id => document.getElementById(id)!.getBoundingClientRect().top + window.scrollY), SEC_ID);
  expect(tops, 'DOM order top → bottom').toEqual([...tops].sort((a, b) => a - b));

  // the page's own heading, once, plus one heading per section (no double headers)
  await expect(page.locator('#sigma-fieldhub').getByRole('heading', { name: 'פעולות שטח' })).toHaveCount(1);
  await expect(page.locator('#sigma-fieldhub').getByRole('button', { name: 'חזרה' })).toBeVisible();

  await expectRtl(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shotEv(page, ti, 'top');

  for (const s of ['today', 'attendance', 'ip', 'burns'] as Sec[]) {
    await page.getByTestId('fieldhub-nav').getByRole('radio', { name: SEC_LABEL[s], exact: true }).click();
    await settle(page);
    await shotEv(page, ti, s);
    await expectSectionInView(page, SEC_ID[s], SEC_LABEL[s]);
    await expect(page.getByTestId('fieldhub-nav').getByRole('radio', { name: SEC_LABEL[s], exact: true })).toHaveAttribute('aria-checked', 'true');
  }

  // scrolling by hand moves the active item (the nav follows the page)
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId('fieldhub-nav').getByRole('radio', { name: 'היום שלי', exact: true })).toHaveAttribute('aria-checked', 'true');

  expectNoConsoleErrors(rec);
});

test('hub: showPage("attendance") and showPage("burns") land on fieldops scrolled to the section', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', kibbutzim: kibbutzim(), burns: burns() });

  await gotoHub(page, 'attendance');
  await waitSections(page, ['attendance']);
  expect(await page.evaluate(() => (window as any)._currentPage)).toBe('fieldops');
  await expect(page.locator('#fieldops-view')).toBeVisible();
  await expectSectionInView(page, 'attendance-view', 'attendance redirect');

  // …and burns from there (a push/gap/home-strip caller while already on the hub)
  await page.evaluate(() => { (window as any).sigma.showPage('burns'); document.body.click(); });
  await waitSections(page, ['burns']);
  expect(await page.evaluate(() => (window as any)._currentPage)).toBe('fieldops');
  await expectSectionInView(page, 'burns-view', 'burns redirect');
  await shotEv(page, ti, 'redirect-burns');

  expectNoConsoleErrors(rec);
});

for (const stored of ['attendance', 'burns'] as const) {
  test(`hub: a stored sigma_page_v1 of ${stored} restores onto the hub`, async ({ page }, ti) => {
    await page.addInitScript(p => { try { sessionStorage.setItem('sigma_page_v1', p); } catch { /* */ } }, stored);
    const { rec } = await boot(page, ti, { who: 'אביאם', ready: '', kibbutzim: kibbutzim(), burns: burns() });
    await expect.poll(() => page.evaluate(() => (window as any)._currentPage), { timeout: 30_000 }).toBe('fieldops');
    await expect(page.getByTestId('fieldhub-nav')).toBeVisible({ timeout: 20_000 });
    await waitSections(page, [stored]);
    // a restore lands on the hub and the section is on the page (visible, gated); the jump nav
    // takes the person to it in one tap — the section is never missing.
    await page.getByTestId('fieldhub-nav').getByRole('radio', { name: SEC_LABEL[stored], exact: true }).click();
    await expectSectionInView(page, SEC_ID[stored], 'restored ' + stored);
    expectNoConsoleErrors(rec);
  });
}

const ROLES: Array<{ who: Who; must: Sec[]; never: Sec[] }> = [
  { who: 'צפייה', must: ['attendance', 'burns'], never: ['today', 'ip'] },
  { who: 'מתניה', must: ['today', 'ip'], never: ['burns'] },
  { who: 'אביאם', must: ['today', 'attendance', 'ip', 'burns'], never: [] },
  { who: 'ניתאי', must: ['today', 'attendance', 'ip', 'burns'], never: [] },
  { who: 'עמיחי', must: ['today', 'ip', 'burns'], never: [] },
  { who: 'עידן', must: ['today', 'ip', 'burns'], never: [] },
];
for (const r of ROLES) {
  test(`hub: role matrix — ${r.who} sees exactly his sections`, async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { who: r.who, ready: '' });
    await expect.poll(() => page.evaluate(() => typeof (window as any).sigma?.showPage === 'function'), { timeout: 30_000 }).toBe(true);
    await gotoHub(page);
    await page.waitForTimeout(700);
    const { boxes, nav } = await visibleSections(page);
    for (const s of r.must) {
      expect(boxes, `${r.who} sees ${s}`).toContain(s);
      expect(nav, `${r.who} nav offers ${SEC_LABEL[s]}`).toContain(SEC_LABEL[s]);
    }
    for (const s of r.never) {
      expect(boxes, `${r.who} must not see ${s}`).not.toContain(s);
      expect(nav, `${r.who} nav must not offer ${SEC_LABEL[s]}`).not.toContain(SEC_LABEL[s]);
    }
    // the nav offers exactly the sections that are on screen, in order
    expect(nav, `${r.who} nav == visible sections`).toEqual(boxes.map(b => SEC_LABEL[b]));
    // the gate agrees with the DOM: attendance box iff canShowPage('attendance')
    const att = await page.evaluate(() => (window as any).sigma.canShowPage('attendance'));
    expect(boxes.includes('attendance'), `${r.who} attendance box vs canShowPage`).toBe(att);
    await shotEv(page, ti, 'role-' + r.who);
    expectNoConsoleErrors(rec);
  });
}

test('hub: the kibbutz card burns row → burns section, filtered to that kibbutz (60-kibbutz fixture)', async ({ page }, ti) => {
  const ks = kibbutzim();
  const rows = burns();
  const { rec } = await boot(page, ti, { who: 'אביאם', kibbutzim: ks, burns: rows });
  await expect(page.locator('#sigma-home .kibbutz')).toHaveCount(N, { timeout: 30_000 });

  // the long-named kibbutz (worst case for the chip and the row) and an ordinary one
  for (const name of [LONG[0], 'קיבוץ בדיקה 6']) {
    const mine = rows.filter(r => r.site === name);
    expect(mine.length, 'fixture has burns for ' + name).toBeGreaterThan(0);
    const left = mine.filter(r => r.status !== 'burned').length;

    await page.evaluate(n => (window as any).sigma.openKibbutzModal(n), name);
    await expect(page.getByTestId('kibbutz-detail')).toBeVisible();
    const row = page.getByTestId('kibbutz-burns-row');
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('צריבות');
    await expect(row).toContainText(`${left} נותרו מתוך ${mine.length}`);
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shotEv(page, ti, name === LONG[0] ? 'card-burns-row-long' : 'card-burns-row');

    await row.click();
    await expect.poll(() => page.evaluate(() => (window as any)._currentPage), { timeout: 15_000 }).toBe('fieldops');
    await expect(page.getByTestId('kibbutz-detail')).toBeHidden();
    const chip = page.getByTestId('burn-site-chip');
    await expect(chip).toBeVisible({ timeout: 25_000 });
    await expect(chip).toContainText('סינון:');
    await expect(chip).toContainText(name);
    await expect(chip).toContainText('✕');

    // the list is filtered: one site block, exactly this kibbutz's meters
    const page$ = page.locator('#sigma-burns-page');
    await expect(page$.locator('section')).toHaveCount(1);
    await expect(page$.locator('section button[aria-expanded]').first()).toContainText(name);
    for (const r of mine) await expect(page$.getByText(String(r.serial), { exact: true })).toHaveCount(1);
    const other = rows.find(r => r.site !== name)!;
    await expect(page$.getByText(String(other.serial), { exact: true })).toHaveCount(0);

    await expectSectionInView(page, 'burns-view', 'burns from kibbutz row');
    await shotEv(page, ti, name === LONG[0] ? 'burns-filtered-long' : 'burns-filtered');

    // ✕ clears it: the chip goes, the other kibbutzim come back
    await chip.click();
    await expect(page.getByTestId('burn-site-chip')).toHaveCount(0);
    await expect.poll(() => page$.locator('section').count()).toBeGreaterThan(5);

    await page.evaluate(() => (window as any).sigma.showPage('kibbutz'));
    await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible();
  }
  expectNoConsoleErrors(rec);
});

test('hub: no overlap, no sideways scroll — every section, real-size data', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'אביאם', kibbutzim: kibbutzim(), burns: burns() });
  await gotoHub(page);
  await waitSections(page, ['today', 'attendance', 'ip', 'burns']);

  const w = await page.evaluate(() => ({ sw: (document.scrollingElement || document.documentElement).scrollWidth, iw: window.innerWidth }));
  expect(w.sw, 'the hub never scrolls sideways').toBeLessThanOrEqual(w.iw + 1);

  const theme = (ti.project.metadata as any).theme;
  const rep = await scanOverlap(page, `field hub @ ${viewport}/${theme}`, { root: '#fieldops-view' });
  const rule1 = rep.violations.filter(v => v.startsWith('[rule1]'));
  expect(rule1, rep.label + '\n' + rule1.join('\n')).toEqual([]);
  expect(rep.violations, rep.label + '\n' + rep.violations.join('\n')).toEqual([]);

  expectNoConsoleErrors(rec);
});
