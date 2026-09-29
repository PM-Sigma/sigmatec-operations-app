// Q7-D (8.2) — full colour-contrast audit of every screen, in the theme of the running project.
//
// Two independent checks per screen, both must be at ZERO violations:
//   1. axe-core `color-contrast` (the engine עידן's own tools use);
//   2. a custom walk: every visible text node vs its effective background >= 4.5:1 (>= 3:1 for
//      large text >=24px / >=18.66px bold, and for DISABLED controls, which WCAG exempts but
//      the round-7 QA asked us to keep legible), placeholders vs the field, icon-only control
//      glyphs >= 3:1, and form-field borders >= 3:1 against what is behind them.
//
// Run (dark + light, phone widths only):
//   npx playwright test qa/playwright/tests/dark-contrast.spec.ts \
//     --project=mobile-360-dark --project=mobile-412-dark --project=mobile-360-light --project=mobile-412-light
// AUDIT_LABEL=before|after names the JSON summary written to qa/evidence/q7-dark/.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { boot, expect, test } from './_helpers';
import { driverFor } from './inventory/_inv-driver';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AXE_PATH: string = require.resolve('axe-core/axe.min.js');
const EVIDENCE = path.resolve(__dirname, '..', '..', 'evidence', 'q7-dark');
const LABEL = process.env.AUDIT_LABEL || 'run';
const inv = driverFor();

test.beforeEach(({}, ti) => {
  test.skip(!/^mobile-(360|412)-(dark|light)$/.test(ti.project.name), 'audit runs at the two phone widths, both themes');
});

interface Finding { kind: string; sel: string; text: string; ratio: number; need: number; fg: string; bg: string }

/** The custom pass — runs in the page. Returns every element under threshold. */
async function customAudit(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true })!;
    type RGBA = [number, number, number, number];
    const parse = (s: string): RGBA => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000'; cx.fillStyle = s;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (top: RGBA, bot: RGBA): RGBA => {
      const a = top[3] + bot[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const c = (i: number) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a;
      return [c(0), c(1), c(2), a];
    };
    const lum = ([r, g, b]: RGBA) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const l1 = lum(a), l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const hex = (c: RGBA) => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const pageBg = (): RGBA => {
      const b = parse(getComputedStyle(document.body).backgroundColor);
      const h = parse(getComputedStyle(document.documentElement).backgroundColor);
      return over(b, over(h, [255, 255, 255, 1]));
    };
    /** Candidate backgrounds behind `el` (>1 when a gradient is involved: worst case wins). */
    const backdrops = (el: Element): RGBA[] => {
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
      let acc: RGBA[] = [[0, 0, 0, 0]];
      // Walk from the root down so each layer composites over what is beneath it.
      for (const e of chain.reverse()) {
        const cs = getComputedStyle(e);
        const layers: RGBA[] = [];
        const bg = parse(cs.backgroundColor);
        const img = cs.backgroundImage;
        if (img && img !== 'none' && /gradient/.test(img)) {
          const stops = img.match(/(rgba?\([^)]*\)|color\([^)]*\))/g) || [];
          stops.forEach(s => layers.push(parse(s)));
        }
        const op = parseFloat(cs.opacity);
        const next: RGBA[] = [];
        const set = layers.length ? layers : [bg];
        for (const under of acc) for (const l of set) {
          const withA: RGBA = [l[0], l[1], l[2], l[3] * (isNaN(op) ? 1 : op)];
          next.push(withA[3] === 0 ? under : over(withA, under));
        }
        acc = next.length ? next : acc;
      }
      const base = pageBg();
      return acc.map(c => over(c, base));
    };
    const hidden = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        if (e.getAttribute('aria-hidden') === 'true' || e.hasAttribute('inert')) return true;
      }
      return !(el as HTMLElement).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true });
    };
    const opacityOf = (el: Element) => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity) || 0;
      return o;
    };
    const sel = (el: Element) => {
      const t = el.getAttribute('data-testid');
      const c = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
      return el.tagName.toLowerCase() + (t ? '[' + t + ']' : '') + (c ? '.' + c : '');
    };
    const out: Finding[] = [];
    const push = (kind: string, el: Element, text: string, r: number, need: number, fg: RGBA, bg: RGBA) => {
      if (out.length > 60) return;
      out.push({ kind, sel: sel(el), text: text.slice(0, 40), ratio: Math.round(r * 100) / 100, need, fg: hex(fg), bg: hex(bg) });
    };
    const isDisabled = (el: Element) => !!el.closest('[disabled],[aria-disabled="true"],[data-disabled]');

    // ---- text ----
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent || '').trim()) continue;
      if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
      seen.add(el);
      if (hidden(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = px >= 24 || (px >= 18.66 && bold);
      const dis = isDisabled(el);
      const need = large || dis ? 3 : 4.5;
      const fgRaw = parse(cs.color);
      const fgA = fgRaw[3] * opacityOf(el);
      let worst = Infinity; let worstBg: RGBA = [0, 0, 0, 1]; let worstFg: RGBA = fgRaw;
      for (const bg of backdrops(el)) {
        const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgA / (parseFloat(cs.opacity) || 1) * (parseFloat(cs.opacity) || 1)], bg);
        const rr = ratio(fg, bg);
        if (rr < worst) { worst = rr; worstBg = bg; worstFg = fg; }
      }
      if (worst < need) push(dis ? 'text-disabled' : 'text', el, n.textContent!.trim(), worst, need, worstFg, worstBg);
    }

    // ---- placeholders ----
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]').forEach(el => {
      if (hidden(el) || el.value) return;
      const ph = getComputedStyle(el, '::placeholder');
      const fgRaw = parse(ph.color);
      const bgs = backdrops(el);
      let worst = Infinity; let wb = bgs[0]; let wf = fgRaw;
      for (const bg of bgs) {
        const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * (parseFloat(ph.opacity) || 1)], bg);
        const rr = ratio(fg, bg);
        if (rr < worst) { worst = rr; wb = bg; wf = fg; }
      }
      if (worst < 4.5) push('placeholder', el, el.placeholder, worst, 4.5, wf, wb);
    });

    // ---- icon-only controls: glyph vs its backdrop ----
    document.querySelectorAll('button, [role="button"], a').forEach(b => {
      if (hidden(b) || (b.textContent || '').trim()) return;
      if (isDisabled(b)) return;
      b.querySelectorAll('svg').forEach(svg => {
        const cs = getComputedStyle(svg);
        const paint = cs.stroke !== 'none' ? cs.stroke : cs.fill !== 'none' ? cs.fill : '';
        if (!paint) return;
        const fgRaw = parse(paint === 'currentcolor' ? cs.color : paint);
        let worst = Infinity; let wb = pageBg(); let wf = fgRaw;
        for (const bg of backdrops(svg)) {
          const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacityOf(svg)], bg);
          const rr = ratio(fg, bg);
          if (rr < worst) { worst = rr; wb = bg; wf = fg; }
        }
        if (worst < 3) push('icon', svg, b.getAttribute('aria-label') || '', worst, 3, wf, wb);
      });
    });

    // ---- form-field borders (WCAG 1.4.11): the field's edge vs what surrounds it ----
    document.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select').forEach(el => {
      if (hidden(el) || isDisabled(el)) return;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopWidth) < 1 || cs.borderTopStyle === 'none') return;
      const edge = parse(cs.borderTopColor);
      const parentBgs = backdrops(el.parentElement || el);
      let worst = Infinity; let wb = parentBgs[0]; let wf = edge;
      for (const bg of parentBgs) {
        const fg = over(edge, bg);
        const rr = ratio(fg, bg);
        if (rr < worst) { worst = rr; wb = bg; wf = fg; }
      }
      if (worst < 3) push('field-border', el, el.getAttribute('placeholder') || el.getAttribute('aria-label') || '', worst, 3, wf, wb);
    });
    return out;
  });
}

async function axeAudit(page: Page): Promise<Array<{ sel: string; ratio: string; fg: string; bg: string }>> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const res = await (window as any).axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    const out: Array<{ sel: string; ratio: string; fg: string; bg: string }> = [];
    for (const v of res.violations) for (const n of v.nodes) {
      const d = (n.any[0] && n.any[0].data) || {};
      out.push({ sel: String(n.target[0]).slice(0, 80), ratio: String(d.contrastRatio), fg: d.fgColor, bg: d.bgColor });
    }
    return out;
  });
}

const results: Record<string, { axe: number; custom: number; detail: unknown }> = {};

async function audit(page: Page, ti: TestInfo, screen: string): Promise<void> {
  await page.waitForTimeout(400); // let entrance animations settle so opacity < 1 frames are not measured
  const custom = await customAudit(page);
  const axe = await axeAudit(page);
  const key = ti.project.name + '__' + screen;
  results[key] = { axe: axe.length, custom: custom.length, detail: { axe, custom } };
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, `audit-${LABEL}-${key}.json`), JSON.stringify(results[key], null, 1));
  // Light is the regression baseline, not the target: it carries pre-existing findings (brand-cyan
  // page title 1.9:1, 30/31 out-of-month day numerals, borderless fields) that are out of Q7-D's
  // scope. Its counts are recorded to the JSON for a before/after diff; only DARK must be at zero.
  if (/dark/.test(ti.project.name)) expect.soft({ axe, custom }, `${screen} @ ${ti.project.name}`).toEqual({ axe: [], custom: [] });
}

async function keyShot(page: Page, ti: TestInfo, name: string): Promise<void> {
  if (!/dark/.test(ti.project.name) || !/-360-/.test(ti.project.name)) return;
  const dir = path.join(EVIDENCE, LABEL);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

const openCard = (page: Page, name = 'חוקוק') => page.evaluate((n: string) => (window as any).sigma.openKibbutzModal(n), name);
const detail = (page: Page) => page.getByTestId('kibbutz-detail');

async function openCalendar(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    const el = document.getElementById('calendar-view');
    if (!el || el.style.display === 'none') { (window as any).sigma?.showPage?.('calendar'); return false; }
    const g = document.querySelector('[data-testid="cal-grid"]') as HTMLElement | null;
    return !!g && g.offsetParent !== null;
  }), { timeout: 30_000 }).toBe(true);
}

test('home', async ({ page }, ti) => {
  await boot(page, ti);
  await audit(page, ti, 'home');
  await keyShot(page, ti, 'home');
});

test('kibbutz card — state tab', async ({ page }, ti) => {
  await boot(page, ti);
  await openCard(page);
  await expect(detail(page)).toBeVisible();
  await audit(page, ti, 'card-state');
  await keyShot(page, ti, 'card-state');
});

test('kibbutz card — visits tab + meeting notes', async ({ page }, ti) => {
  await boot(page, ti);
  await openCard(page);
  await expect(detail(page)).toBeVisible();
  await detail(page).getByRole('radio', { name: 'ביקורים' }).click();
  await audit(page, ti, 'card-visits');
});

test('kibbutz card — meeting notes on the home card (history open)', async ({ page }, ti) => {
  await boot(page, ti);
  const section = page.locator('[data-section="meetings"]').first();
  await section.scrollIntoViewIfNeeded().catch(() => {});
  const hist = page.getByRole('button', { name: /היסטוריה/ }).first();
  if (await hist.count()) await hist.click().catch(() => {});
  await audit(page, ti, 'meeting-notes');
});

test('calendar + day sheet', async ({ page }, ti) => {
  await boot(page, ti);
  await openCalendar(page);
  await audit(page, ti, 'calendar');
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' }));
  const cell = page.locator(`[data-day="${today}"]`).first();
  if (await cell.count()) await cell.click();
  else await page.locator('[data-day]').first().click();
  await expect(page.locator('[data-testid="cal-day"]:visible')).toBeVisible();
  await audit(page, ti, 'calendar-day-sheet');
  await keyShot(page, ti, 'calendar-day-sheet');
});

test('my tasks', async ({ page }, ti) => {
  await boot(page, ti);
  await page.getByTestId('header-my-tasks').click();
  await page.waitForTimeout(300);
  await audit(page, ti, 'my-tasks');
});

test('bell', async ({ page }, ti) => {
  await boot(page, ti);
  await page.getByTestId('alerts-bell').click();
  await page.waitForTimeout(300);
  await audit(page, ti, 'bell');
});

test('settings', async ({ page }, ti) => {
  await boot(page, ti);
  await page.waitForSelector('#sigma-settings[data-sigma-mounted="1"]', { state: 'attached' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-settings')));
  await expect(page.getByRole('dialog').filter({ hasText: 'הגדרות' })).toBeVisible();
  await audit(page, ti, 'settings');
  await keyShot(page, ti, 'settings');
});

for (const tab of ['orders', 'stock', 'certs', 'kibbutz', 'returns', 'products'] as const) {
  test(`inventory — ${tab}`, async ({ page }, ti) => {
    await boot(page, ti, { inventory: true });
    await inv.openTab(page, tab);
    await audit(page, ti, 'inventory-' + tab);
    if (tab === 'stock') await keyShot(page, ti, 'inventory-stock');
  });
}

test('presenter', async ({ page }, ti) => {
  await boot(page, ti);
  await page.waitForSelector('#sigma-presenter', { state: 'attached' });
  await page.evaluate(() => (window as any).sigmaOpenPresenter?.() ?? window.dispatchEvent(new CustomEvent('sigma-open-presenter')));
  await expect(page.getByTestId('presenter')).toBeVisible();
  await audit(page, ti, 'presenter');
  await keyShot(page, ti, 'presenter');
});

test('field-ops', async ({ page }, ti) => {
  await boot(page, ti);
  await page.evaluate(() => (window as any).showPage('fieldops'));
  await expect(page.getByTestId('fieldops-page')).toBeVisible({ timeout: 20_000 });
  await audit(page, ti, 'field-ops');
});

test('feedback sheet (+ disabled submit, input + placeholder)', async ({ page }, ti) => {
  await boot(page, ti);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('heading', { name: 'רעיון או באג' })).toBeVisible();
  await audit(page, ti, 'feedback-sheet');
  await keyShot(page, ti, 'feedback-sheet');
});

test('error toast over the internal-task sheet (+ inputs)', async ({ page }, ti) => {
  await boot(page, ti);
  const card = page.locator('#sigma-home .kibbutz[data-name="חוקוק"]');
  await card.getByTestId('add-internal-task').click();
  const sheet = page.getByTestId('internal-task-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
  await audit(page, ti, 'error-toast');
  await keyShot(page, ti, 'error-toast');
});

test('empty states + loading skeleton probe', async ({ page }, ti) => {
  await boot(page, ti, { inventory: true });
  await inv.openTab(page, 'returns'); // fixture tab that is empty/near-empty
  // Loading skeleton: the real component's class list, mounted next to real text so the
  // skeleton fill is measured against the same surface (it is decorative — must merely be visible).
  await page.evaluate(() => {
    const host = document.querySelector('[data-testid="inv-panel-returns"]') || document.body;
    const sk = document.createElement('div');
    sk.setAttribute('data-testid', 'q7-skeleton');
    sk.className = 'animate-pulse rounded-md bg-muted';
    sk.style.cssText = 'height:24px;width:200px;margin:8px;';
    host.appendChild(sk);
  });
  const ratioSk = await page.evaluate(() => {
    const sk = document.querySelector('[data-testid="q7-skeleton"]') as HTMLElement;
    const c = (s: string) => { const m = s.match(/[\d.]+/g)!.map(Number); return m; };
    const lum = (rgb: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const bg = c(getComputedStyle(sk).backgroundColor); let p: Element | null = sk.parentElement; let pb = [0, 0, 0, 0];
    for (; p; p = p.parentElement) { pb = c(getComputedStyle(p).backgroundColor); if ((pb[3] ?? 1) > 0.9) break; }
    const a = lum(bg), b = lum(pb);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  if (/dark/.test(ti.project.name)) expect(ratioSk, 'skeleton must be distinguishable from its surface').toBeGreaterThanOrEqual(1.15);
  await audit(page, ti, 'empty-and-skeleton');
});
