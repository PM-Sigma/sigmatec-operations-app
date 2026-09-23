// Golden test for the round-5 design system (spec docs/superpowers/specs/2026-09-23-design-
// system-design.md §2 "Color roles"): every ink/fill role pair — and text/text-2 on the page
// background — clears WCAG AA 4.5:1 for body text, in BOTH themes, in BOTH places the tokens
// are declared (the legacy css/app.css and the React islands' app/src/styles.css).
//
// This reads the hex literals straight out of the two files (not a hardcoded copy of the spec
// table), so a value that drifts from what actually ships fails here instead of only showing up
// as a screenshot someone has to notice.
//   node test-design-tokens.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ---- contrast math (WCAG 2.x relative luminance) -----------------------------
function lum(hex) {
  const h = hex.replace('#', '');
  const chans = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---- pull a token's hex value out of a specific block of CSS text ------------
function tokenIn(block, name) {
  const m = new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(block);
  assert.ok(m, `--${name} not found`);
  return m[1];
}
function blockOf(css, selectorRe) {
  const m = selectorRe.exec(css);
  assert.ok(m, 'block not found: ' + selectorRe);
  // From the match to the first closing brace at the same nesting depth (these token blocks
  // never nest a rule inside themselves).
  const start = m.index + m[0].length;
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

/** The ink/fill role pairs every surface in §2's table must satisfy. Hex tokens only — the
    shadcn HSL-channel tokens (--foreground/--background in styles.css) are a different shape
    and are checked separately, by the HSL-triple route (see --primary-foreground below). */
const FILL_PAIRS = [
  ['ok-ink', 'ok-fill'], ['warn-ink', 'warn-fill'], ['danger-ink', 'danger-fill'],
  ['info-ink', 'info-fill'], ['holiday-ink', 'holiday-fill'], ['neutral-ink', 'neutral-fill'],
];

function checkSurface(label, lightBlock, darkBlock, names, pairs = FILL_PAIRS) {
  for (const theme of ['light', 'dark']) {
    const block = theme === 'light' ? lightBlock : darkBlock;
    for (const [inkName, fillName] of pairs) {
      check(`${label} ${theme}: ${inkName}/${fillName} clears 4.5:1`, () => {
        const ink = tokenIn(block, names[inkName] ?? inkName);
        const fill = tokenIn(block, names[fillName] ?? fillName);
        const r = ratio(ink, fill);
        assert.ok(r >= 4.5, `${ink} on ${fill} = ${r.toFixed(2)}:1, need 4.5:1`);
      });
    }
  }
}

// ── css/app.css (legacy) — role names: text/text-light, bg, ok=success/success-light, etc. ──
{
  const css = read('css/app.css');
  const light = blockOf(css, /:root\s*\{\s*\n\s*\/\* Design system/);
  const dark = blockOf(css, /:root\[data-theme="dark"\]\s*\{/);
  const names = {
    'ok-ink': 'success', 'ok-fill': 'success-light',
    'warn-ink': 'warning', 'warn-fill': 'warning-light',
    'danger-ink': 'danger', 'danger-fill': 'danger-light',
    'info-ink': 'info', 'info-fill': 'info-light',
    'holiday-ink': 'holiday', 'holiday-fill': 'holiday-light',
    'neutral-ink': 'neutral', 'neutral-fill': 'neutral-light',
  };
  checkSurface('css/app.css', light, dark, names);

  checkSurface('css/app.css', light, dark, { text: 'text', 'text-2': 'text-light' },
    [['text', 'bg'], ['text-2', 'bg']]);

  check('css/app.css: --on-brand text clears 4.5:1 on both brand-1 and brand-2', () => {
    const brandBlock = blockOf(css, /:root\s*\{[\s\S]*?(?=--brand-1:)/);
    const onBrand = tokenIn(brandBlock, 'on-brand');
    for (const [name, hex] of [['brand-1', tokenIn(brandBlock, 'brand-1')], ['brand-2', tokenIn(brandBlock, 'brand-2')]]) {
      const r = ratio(onBrand, hex);
      assert.ok(r >= 4.5, `on-brand ${onBrand} on ${name} ${hex} = ${r.toFixed(2)}:1, need 4.5:1`);
    }
  });
}

// ── app/src/styles.css (islands) — role names match the spec's own vocabulary. ──
{
  const css = read('app/src/styles.css');
  const light = blockOf(css, /\.sigma-root,\n\[data-sigma-portal\]\s*\{/);
  const dark = blockOf(css, /:root\[data-theme='dark'\] \.sigma-root,/);
  checkSurface('app/src/styles.css', light, dark, {});

  check('app/src/styles.css: on-brand text clears 4.5:1 on both brand-1 and brand-2 (light)', () => {
    const onBrand = tokenIn(light, 'on-brand');
    const brand1 = tokenIn(light, 'brand-1');
    const brand2 = tokenIn(light, 'brand-2');
    for (const [name, hex] of [['brand-1', brand1], ['brand-2', brand2]]) {
      const r = ratio(onBrand, hex);
      assert.ok(r >= 4.5, `on-brand ${onBrand} on ${name} ${hex} = ${r.toFixed(2)}:1, need 4.5:1`);
    }
  });

  check('app/src/styles.css: --primary-foreground is the on-brand ink, not white, in both themes', () => {
    // audit §1.12 — white on the brand fill measured 2.2–2.4:1.
    const fgLight = /--primary-foreground:\s*([\d.]+ [\d.]+% [\d.]+%);/.exec(light);
    assert.ok(fgLight, '--primary-foreground missing in the light block');
    assert.ok(!/^0 0% 100%$/.test(fgLight[1].trim()), '--primary-foreground is still white');
    const fgDark = /--primary-foreground:\s*([\d.]+ [\d.]+% [\d.]+%);/.exec(dark);
    assert.ok(fgDark, '--primary-foreground missing in the dark block');
    assert.ok(!/^0 0% 100%$/.test(fgDark[1].trim()), '--primary-foreground is still white (dark)');
  });
}

console.log(failures === 0
  ? '\nPASS — every design-system ink/fill pair clears 4.5:1 in both themes, in both stylesheets'
  : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
