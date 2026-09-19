// Dark-mode contrast — the regression guard for audit B F-01…F-05 (Task 31 fix round 1).
//
// Every one of those five findings is the same mistake: a surface painted with a near-white
// literal (`#f8fafc`, `#f1f5f9`, `#fff`, `#fef3c7`, `#fbfefd`…) while the text on it keeps
// `color: var(--text)`. In light that is invisible; in dark `--text` is `#e6edf3` and the
// measured ratio was 1.06–1.18:1 — the text simply is not there.
//
// This spec renders each fixed surface INSIDE the real page (so it resolves the real cascade
// and the real theme tokens) and asserts WCAG AA 4.5:1 on the text over its effective
// background. It runs in all four projects; the dark ones are the ones that used to fail, but
// asserting in light too catches a "fix" that only moved the problem.
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';

/** The exact markup each fixed source emits, so the test fails when the source regresses. */
const CASES: Array<{ id: string; what: string; html: string }> = [
  {
    id: 'F-01',
    what: 'js/src/17-messages.js — ✉️ הודעות חדשות message card',
    html: `<div style="background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;">
             <div data-probe style="font-size:14px;white-space:pre-wrap;">גוף ההודעה</div>
             <div data-probe style="font-size:11px;color:var(--text-light);margin-top:4px;">מאת עידן</div>
           </div>`,
  },
  {
    id: 'F-02',
    what: 'js/src/14-calendar.js — EMS comment bubble',
    html: `<div style="background:var(--surface-2);color:var(--text);border-radius:8px;padding:6px 10px;margin:4px 0;font-size:13px;">
             <div data-probe style="font-weight:600;color:var(--accent-fg);font-size:11px;margin-bottom:2px;">עידן · 19.9</div>
             <span data-probe>גוף התגובה</span>
           </div>`,
  },
  {
    id: 'F-03a',
    what: 'js/src/07-orders.js:422 — 🎤 recognised-items list',
    html: `<div data-probe style="font-size:13px;padding:4px 8px;background:var(--surface-2);color:var(--text);border-radius:6px;margin:3px 0;">בקר 504 × 2</div>`,
  },
  {
    id: 'F-03b',
    what: 'js/src/07-orders.js:635 — order summary chip',
    html: `<div data-probe style="padding:6px 9px;background:var(--surface-2);color:var(--text);border-radius:8px;">🏭 ספק · מספק לנדיס · 3 פריטים</div>`,
  },
  {
    id: 'F-04a',
    what: 'css/app.css .burn-site + .burn-serial (🔥 צריבות card)',
    html: `<div class="burn-wrap"><div class="burn-site"><div class="burn-site-head">
             <h3 data-probe>קיבוץ חוקוק</h3>
             <span class="burn-left" data-probe>נותרו 4</span>
             <span class="burn-mini" data-probe>12 מתוך 16</span>
           </div><div class="burn-site-body">
             <div class="burn-gen" data-probe>גנרטור 1</div>
             <div class="burn-row burn-pending"><div class="burn-main">
               <span class="burn-serial" data-probe>E360-12345</span>
               <span class="burn-addr" data-probe>רח׳ הבנים 4</span>
               <div class="burn-sub" data-probe>הערה</div></div></div>
           </div></div></div>`,
  },
  {
    id: 'F-04b',
    what: 'css/app.css .burn-selbar + the three row-state fills',
    html: `<div class="burn-wrap">
             <div class="burn-selbar" data-probe>3 נבחרו</div>
             <div class="burn-site"><div class="burn-site-body">
               <div class="burn-row burn-burned"><span class="burn-serial" data-probe>נצרב</span></div>
               <div class="burn-row burn-burned-ct"><span class="burn-serial" data-probe>נצרב CT</span>
                 <span class="burn-state" data-probe>CT</span></div>
               <div class="burn-row burn-issue"><span class="burn-serial" data-probe>בעיה</span>
                 <div class="burn-warn" data-probe>לא אותר</div></div>
             </div></div>
             <span class="burn-tag burn-tag-ct" data-probe>CT</span>
             <span class="burn-tag burn-tag-pp" data-probe>PP</span>
             <a class="burn-link" href="#" data-probe>פתח ב-EMS</a>
           </div>`,
  },
  {
    id: 'F-05',
    what: 'css/app.css legacy .kibbutz state tints',
    html: `<div class="kibbutz-grid">
             ${['done', 'track', 'dev', 'priority', 'urgent', 'ready-flow', 'flow-bug', 'has-bug']
               .map(c => `<div class="kibbutz ${c}"><div class="kibbutz-name" data-probe>קיבוץ ${c}</div>
                          <div class="kibbutz-meta"><span data-probe>3 משימות</span></div></div>`).join('')}
           </div>`,
  },
];

/**
 * Ratio of the element's own color against its EFFECTIVE background (the first ancestor whose
 * background-color is not transparent), by the WCAG 2.x relative-luminance formula. Alpha on
 * the background is composited onto what is behind it, which is what `color-mix(... , var(--card))`
 * and the low-alpha washes need.
 */
function probeFn(el: Element) {
  const parse = (s: string): any => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg: any, bg: any): any => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c: any) => {
    const ch = [c.r, c.g, c.b].map((v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  // effective background: composite every translucent layer down to the opaque one
  const layers: any[] = [];
  for (let n: any = el; n; n = n.parentElement) {
    const bg = parse(getComputedStyle(n).backgroundColor);
    if (!bg || bg.a === 0) continue;
    layers.push(bg);
    if (bg.a === 1) break;
  }
  let bg = layers.pop() || { r: 255, g: 255, b: 255, a: 1 };
  while (layers.length) bg = over(layers.pop(), bg);
  const fgRaw = parse(getComputedStyle(el as any).color) || { r: 0, g: 0, b: 0, a: 1 };
  const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;
  const [a, b] = [lum(fg), lum(bg)].sort((x: number, y: number) => y - x);
  return {
    ratio: (a + 0.05) / (b + 0.05),
    color: getComputedStyle(el as any).color,
    bg: 'rgb(' + [bg.r, bg.g, bg.b].map((v: number) => Math.round(v)).join(',') + ')',
    text: (el.textContent || '').trim().slice(0, 24),
  };
}

test('every surface fixed in F-01…F-05 clears 4.5:1 on its own text', async ({ page }, ti) => {
  const { rec, theme } = await boot(page, ti);

  const failures: string[] = [];
  for (const c of CASES) {
    await page.evaluate(([html]) => {
      document.getElementById('contrast-probe')?.remove();
      const host = document.createElement('div');
      host.id = 'contrast-probe';
      // Inside .container so it inherits exactly what the real surfaces inherit.
      host.innerHTML = html as string;
      (document.querySelector('.container') || document.body).appendChild(host);
    }, [c.html]);

    const probes = page.locator('#contrast-probe [data-probe]');
    const n = await probes.count();
    expect(n, `${c.id}: the fixture rendered no probes`).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const r = await probes.nth(i).evaluate(probeFn) as any;
      if (process.env.CONTRAST_DEBUG) console.log(c.id, i, r.ratio.toFixed(2), r.color, r.bg, r.text);
      if (r.ratio < 4.5) {
        failures.push(`${c.id} (${theme}) — ${c.what}\n      "${r.text}" ${r.color} on ${r.bg} `
          + `= ${r.ratio.toFixed(2)}:1, need 4.5:1`);
      }
    }
  }
  await page.evaluate(() => document.getElementById('contrast-probe')?.remove());

  expect(failures.join('\n    '), 'dark-mode contrast regressions:\n    ' + failures.join('\n    '))
    .toBe('');
  await expectNoConsoleErrors(rec);
});
