// Golden test for the round-5 design system (spec docs/superpowers/specs/2026-09-23-design-
// system-design.md §2 "Color roles", design-review.md §2): every ink/fill role pair — and
// text/text-2 on the page background — clears WCAG AA 4.5:1 for body text, in BOTH themes.
//
// app/src/tokens.css is the ONE source of truth (עידן 23.9: "one tokens.css on :root with an
// --s- prefix"). This reads the hex literals straight out of THAT file, not a hardcoded copy of
// the spec table, so a value that drifts from what actually ships fails here. css/app.css and
// app/src/styles.css no longer hold their own literals for these roles — they alias var(--s-*)
// — so this file also asserts that alias chain hasn't quietly reverted to a hardcoded duplicate.
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
  const start = m.index + m[0].length;
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

const tokensCss = read('app/src/tokens.css');
const sLight = blockOf(tokensCss, /^:root\s*\{/m);
const sDark = blockOf(tokensCss, /:root\[data-theme="dark"\]\s*\{/);

/** The ink/fill role pairs every surface in §2's table must satisfy. */
const FILL_PAIRS = [
  ['s-ok-ink', 's-ok-fill'], ['s-warn-ink', 's-warn-fill'], ['s-danger-ink', 's-danger-fill'],
  ['s-info-ink', 's-info-fill'], ['s-holiday-ink', 's-holiday-fill'], ['s-neutral-ink', 's-neutral-fill'],
];

for (const theme of ['light', 'dark']) {
  const block = theme === 'light' ? sLight : sDark;
  for (const [inkName, fillName] of FILL_PAIRS) {
    check(`tokens.css ${theme}: ${inkName}/${fillName} clears 4.5:1`, () => {
      const ink = tokenIn(block, inkName);
      const fill = tokenIn(block, fillName);
      const r = ratio(ink, fill);
      assert.ok(r >= 4.5, `${ink} on ${fill} = ${r.toFixed(2)}:1, need 4.5:1`);
    });
  }
  check(`tokens.css ${theme}: text/text-2 clear 4.5:1 on bg`, () => {
    const bg = tokenIn(block, 's-bg');
    for (const t of ['s-text', 's-text-2']) {
      const r = ratio(tokenIn(block, t), bg);
      assert.ok(r >= 4.5, `${t} on bg = ${r.toFixed(2)}:1, need 4.5:1`);
    }
  });
}

check('tokens.css: --s-on-brand text clears 4.5:1 on both --s-brand-1 and --s-brand-2', () => {
  const onBrand = tokenIn(sLight, 's-on-brand');
  for (const b of ['s-brand-1', 's-brand-2']) {
    const r = ratio(onBrand, tokenIn(sLight, b));
    assert.ok(r >= 4.5, `on-brand on ${b} = ${r.toFixed(2)}:1, need 4.5:1`);
  }
});

// ── alias integrity: css/app.css and app/src/styles.css must not have quietly reverted to a
// hardcoded hex for a role tokens.css already owns (that's exactly how the mid-pass regression
// this file's history documents happened — a value drifted in one place, not the other). ──
const ROLE_ALIASES = [
  'ok-ink', 'ok-fill', 'warn-ink', 'warn-fill', 'danger-ink', 'danger-fill',
  'info-ink', 'info-fill', 'holiday-ink', 'holiday-fill', 'neutral-ink', 'neutral-fill',
];
function assertAliased(label, css, name) {
  check(`${label}: --${name} is aliased to var(--s-${name})`, () => {
    const m = new RegExp('--' + name + ':\\s*([^;]+);').exec(css);
    assert.ok(m, `--${name} not found in ${label}`);
    assert.match(m[1].trim(), new RegExp('^var\\(--s-' + name + '\\)$'),
      `--${name} is "${m[1].trim()}", expected var(--s-${name})`);
  });
}

{
  const css = read('app/src/styles.css');
  const light = blockOf(css, /\.sigma-root,\n\[data-sigma-portal\]\s*\{/);
  for (const name of ROLE_ALIASES) assertAliased('app/src/styles.css (light)', light, name);

  check('app/src/styles.css: --primary-foreground is the on-brand ink, not white, in both themes', () => {
    const dark = blockOf(css, /:root\[data-theme='dark'\] \.sigma-root,/);
    const fgLight = /--primary-foreground:\s*([\d.]+ [\d.]+% [\d.]+%);/.exec(light);
    assert.ok(fgLight, '--primary-foreground missing in the light block');
    assert.ok(!/^0 0% 100%$/.test(fgLight[1].trim()), '--primary-foreground is still white');
    const fgDark = /--primary-foreground:\s*([\d.]+ [\d.]+% [\d.]+%);/.exec(dark);
    assert.ok(fgDark, '--primary-foreground missing in the dark block');
    assert.ok(!/^0 0% 100%$/.test(fgDark[1].trim()), '--primary-foreground is still white (dark)');
  });
}

{
  const css = read('css/app.css');
  const light = blockOf(css, /:root\s*\{\s*\n\s*\/\* Design system/);
  const names = {
    'ok-ink': 'success', 'ok-fill': 'success-light',
    'warn-ink': 'warning', 'warn-fill': 'warning-light',
    'danger-ink': 'danger', 'danger-fill': 'danger-light',
    'info-ink': 'info', 'info-fill': 'info-light',
    'holiday-ink': 'holiday', 'holiday-fill': 'holiday-light',
    'neutral-ink': 'neutral', 'neutral-fill': 'neutral-light',
  };
  for (const [role, legacyName] of Object.entries(names)) {
    check(`css/app.css: --${legacyName} is aliased to var(--s-${role})`, () => {
      const m = new RegExp('--' + legacyName + ':\\s*([^;]+);').exec(light);
      assert.ok(m, `--${legacyName} not found`);
      assert.match(m[1].trim(), new RegExp('^var\\(--s-' + role + '\\)$'),
        `--${legacyName} is "${m[1].trim()}", expected var(--s-${role})`);
    });
  }
  check('css/app.css: --on-brand is aliased to var(--s-on-brand)', () => {
    const brandBlock = blockOf(css, /:root\s*\{[\s\S]*?(?=--brand-1:)/);
    const m = /--on-brand:\s*([^;]+);/.exec(brandBlock);
    assert.match(m[1].trim(), /^var\(--s-on-brand\)$/);
  });
}

// ── real legacy fill/ink CONSUMER pairs (Opus audit, round 4 item 1) ──────────────────────
// The checks above verify tokens.css's role pairs in the abstract. That is not the same as
// verifying the SELECTORS that actually shipped the regression: an "ink" role (tuned bright for
// TEXT on a dark surface) used as a solid FILL under white text (.toast, .urgent-flag,
// .inv-btn.success/.danger, .sigma-crash button.p — dark mode flips --success/--danger brighter
// and white-on-bright fails), or a hardcoded LIGHT-only text color paired with a fill that now
// correctly flips per theme (.dev-error, .current-step-label(.complete), .ready-live-flag,
// index.html's #editLastVisitBox). Read the actual rule text and resolve its var() chain to a
// real hex per theme, so a future edit that points one of these selectors back at the wrong
// token — even though both tokens individually still clear 4.5:1 in isolation — fails HERE.
function parseVarMap(blockText) {
  const map = {};
  const re = /--([\w-]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(blockText))) map[m[1]] = m[2].trim();
  return map;
}
function normalizeHex(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) return '#' + [...h].map(c => c + c).join('').toLowerCase();
  return ('#' + h).toLowerCase();
}
function resolveColor(value, map, seen = new Set()) {
  value = value.trim();
  if (/^white$/i.test(value)) return '#ffffff';
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return normalizeHex(value);
  const vm = /^var\(\s*--([\w-]+)\s*\)$/.exec(value);
  assert.ok(vm, `cannot resolve color value: "${value}"`);
  const name = vm[1];
  assert.ok(!seen.has(name), `circular var() reference at --${name}`);
  const next = map[name];
  assert.ok(next, `no definition found for --${name}`);
  return resolveColor(next, map, new Set(seen).add(name));
}
function legacyVarMap(theme) {
  const css = read('css/app.css');
  // The dark :root block only redeclares what actually changes per theme (e.g. --success-solid
  // is fixed on purpose — declared once). Anything it doesn't override still cascades from the
  // light :root block declaring it, same as in the browser, so seed with light first.
  const map = parseVarMap(blockOf(css, /:root\s*\{\s*\n\s*\/\* Design system/));
  if (theme === 'dark') Object.assign(map, parseVarMap(blockOf(css, /:root\[data-theme="dark"\]\s*\{/)));
  Object.assign(map, parseVarMap(theme === 'light' ? sLight : sDark)); // --s-* hex leaves
  return map;
}
function ruleBody(css, re) {
  const m = re.exec(css);
  assert.ok(m, 'rule not found: ' + re);
  return m[1];
}
function declValue(body, prop) {
  const m = new RegExp(prop + ':\\s*([^;]+);').exec(body);
  assert.ok(m, `${prop} not found in rule`);
  return m[1].trim();
}

const appCss = read('css/app.css');
const CSS_CONSUMERS = [
  { label: '.toast', re: /\.toast\s*\{([^}]*)\}/ },
  { label: '.urgent-flag', re: /\.urgent-flag\s*\{([^}]*)\}/ },
  { label: '.inv-btn.success', re: /\.inv-btn\.success\s*\{([^}]*)\}/ },
  { label: '.inv-btn.danger', re: /\.inv-btn\.danger\s*\{([^}]*)\}/ },
  { label: '.sigma-crash button.p', re: /\.sigma-crash button\.p\s*\{([^}]*)\}/ },
  { label: '.dev-error', re: /\.dev-error\s*\{([^}]*)\}/ },
  { label: '.current-step-label', re: /\.current-step-label\s*\{([^}]*)\}/ },
  { label: '.current-step-label.complete', re: /\.current-step-label\.complete\s*\{([^}]*)\}/ },
  { label: '.ready-live-flag', re: /\.ready-live-flag\s*\{([^}]*)\}/ },
];

for (const theme of ['light', 'dark']) {
  const map = legacyVarMap(theme);
  for (const { label, re } of CSS_CONSUMERS) {
    check(`css/app.css ${theme}: ${label} background/color clears 4.5:1`, () => {
      const body = ruleBody(appCss, re);
      const bg = resolveColor(declValue(body, 'background'), map);
      const fg = resolveColor(declValue(body, 'color'), map);
      const r = ratio(fg, bg);
      assert.ok(r >= 4.5, `${fg} on ${bg} = ${r.toFixed(2)}:1, need 4.5:1`);
    });
  }
}

// #editLastVisitBox's inline-style contrast check removed (round 5, K-U5): the element it
// checked was #tab-meetings markup, retired with the legacy modal's מצב הקיבוץ tab — its
// content (and its Tailwind classes, not inline styles) lives in StatusTab.tsx now (K-U2).

// ── no white text on the brand gradient, anywhere (designer confirm round, item 1 gate) ──────
// The brand fill's ink is --s-on-brand (a dark teal, spec §2 audit "white measured 2.2–2.4:1"),
// never white — but the round-2 codemod that fixed the first ~50 sites only matched ONE static
// className string containing both `bg-brand-grad` and `text-white`; it missed a `background=`
// PROP (ShimmerButton) and a className built by STRING CONCATENATION across a ternary
// (Feedback.tsx's mic button), both confirm-round finds. This scans whole JSX opening tags
// (everything between `<Name` and the next `>`, so a multi-line tag or a concatenated
// className is still read as one unit) for a brand-fill marker and `text-white` together.
// `s-brand` is exempt — that utility already sets the correct ink itself.
function walkTsx(dir, out = []) {
  for (const e of fs.readdirSync(path.join(__dirname, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walkTsx(rel, out);
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(rel);
  }
  return out;
}
const BRAND_FILL = /\bbg-brand-grad\b|bg-\[color:var\(--brand-[12]\)\]|background=["']var\(--(?:s-)?brand-grad\)["']|\btext-\[color:var\(--brand-[12]\)\]/;
const WHITE_TEXT = /\btext-white\b/;
{
  const offenders = [];
  for (const f of walkTsx('app/src')) {
    // Strip JSX/line comments first: an explanatory comment saying "not text-white" (like this
    // very check's own commit) would otherwise read as a violation of itself.
    const body = read(f).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');
    const tags = body.match(/<[A-Za-z][\w.]*\b[\s\S]*?>/g) || [];
    for (const tag of tags) {
      if (tag.includes('s-brand')) continue;
      if (BRAND_FILL.test(tag) && WHITE_TEXT.test(tag)) {
        offenders.push(f + ': ' + tag.replace(/\s+/g, ' ').slice(0, 100));
      }
    }
  }
  check('no white text on the brand gradient anywhere in app/src', () => {
    assert.deepEqual(offenders, [], 'white-on-brand found:\n  ' + offenders.join('\n  '));
  });
}

console.log(failures === 0
  ? '\nPASS — every design-system ink/fill pair clears 4.5:1 (tokens.css), both consumers still alias it, every real legacy fill/ink selector resolves to a passing pair in both themes, and no brand-gradient fill carries white text'
  : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
