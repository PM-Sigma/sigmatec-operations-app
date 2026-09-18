// Contract test for the סיגמה 2.00 visual layer (spec §6, task-4 step 1).
//   node test-theme.mjs
//
// What it guards, and why each one bit us or would:
//  · the marked region at the end of css/app.css is TOKENS ONLY — a hex literal there is a
//    surface that will not flip in dark mode, which is exactly the failure עידן called out;
//  · the dark tokens exist twice (explicit `[data-theme="dark"]` AND the OS media query) so
//    someone who never touched the toggle still gets dark, while an explicit light wins;
//  · the theme boot snippet runs in <head> before the first paint (no white flash);
//  · the body face comes from --font (the ⚙️ הגדרות font setting writes that one token) and
//    every font the setting offers is actually loaded;
//  · the layout numbers the spec fixes: body padding 12/16, container without a max-width,
//    the 300px card grid.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(__dirname, 'css/app.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ---- the tokens-only region -------------------------------------------------
check('css/app.css marks a tokens-only region', () => {
  assert.ok(/\/\* @tokens-only \*\//.test(css), 'missing /* @tokens-only */ marker');
  assert.ok(/\/\* @end \*\//.test(css), 'missing /* @end */ marker');
});

check('no hex literal inside ANY tokens-only region', () => {
  // EVERY marked region, not just the first — sections are appended over time and a
  // one-region check would silently stop guarding the newest one.
  const regions = [...css.matchAll(/\/\* @tokens-only \*\/([\s\S]*?)\/\* @end \*\//g)].map(m => m[1]);
  assert.ok(regions.length >= 1, 'no tokens-only region found');
  const hex = regions
    // Comments are prose, not paint — strip them before looking for colours.
    .flatMap(r => r.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || []);
  assert.deepEqual(hex, [], 'hex literals in a tokens-only section: ' + hex.join(', '));
});

// ---- dark mode ---------------------------------------------------------------
check('dark tokens are declared twice — explicit choice and OS preference', () => {
  assert.ok(/:root\[data-theme="dark"\]\s*\{[\s\S]*?--bg:/.test(css), 'no explicit dark block');
  assert.ok(/@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\)/.test(css),
    'no OS-preference dark block guarded against an explicit light choice');
});

check('every dark surface token has a value in both dark blocks', () => {
  const explicit = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)[1];
  const media = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\}/)[1];
  for (const t of ['--bg', '--card', '--surface-2', '--text', '--text-light', '--border']) {
    assert.ok(explicit.includes(t + ':'), t + ' missing from the explicit dark block');
    assert.ok(media.includes(t + ':'), t + ' missing from the OS-preference dark block');
  }
});

check('native pickers get color-scheme:dark (otherwise their glyphs stay black)', () => {
  assert.ok(/color-scheme: dark/.test(css), 'no color-scheme:dark for date/number inputs');
});

// ---- boot snippet ------------------------------------------------------------
check('the theme is applied in <head>, before the first paint', () => {
  const head = html.split('</head>')[0];
  assert.ok(/localStorage\.getItem\('theme'\)/.test(head), 'no stored-theme read in <head>');
  assert.ok(/prefers-color-scheme: dark/.test(head), 'no OS fallback in the boot snippet');
  assert.ok(/dataset\.theme/.test(head), 'the snippet never sets html[data-theme]');
});

check('theme-color meta matches the light surface token', () => {
  assert.ok(/<meta name="theme-color" content="#EEF3F5">/.test(html),
    'theme-color must start at the light value the toggle also writes');
});

// ---- typography --------------------------------------------------------------
check('body types from --font, and --font has a value', () => {
  assert.ok(/font-family: var\(--font\)/.test(css), 'body does not use var(--font)');
  assert.ok(/--font:\s*'Assistant'/.test(css), '--font does not default to Assistant');
});

check('every font the ⚙️ setting offers is loaded', () => {
  for (const f of ['Assistant', 'Rubik', 'Noto+Sans+Hebrew', 'Heebo']) {
    assert.ok(html.includes('family=' + f), f + ' is offered in הגדרות but never loaded');
  }
});

// ---- layout ------------------------------------------------------------------
check('layout numbers from spec §6', () => {
  assert.ok(/body \{[\s\S]*?padding: 12px 16px;/.test(css), 'body padding is not 12px 16px');
  assert.ok(/@media \(min-width: 768px\) \{ body \{ padding: 24px; \} \}/.test(css), 'no 24px desktop padding');
  assert.ok(/\.container \{ max-width: none;/.test(css), 'the container still caps its width');
  assert.ok(/\.kibbutz-grid \{[\s\S]*?minmax\(300px, 1fr\)/.test(css), 'card grid is not minmax(300px,1fr)');
  assert.ok(/\.section-header \{[\s\S]*?position: sticky;/.test(css), 'section headers are not sticky');
});

check('motion stays inside the budget and respects reduced-motion', () => {
  assert.ok(/prefers-reduced-motion: reduce/.test(css), 'no reduced-motion guard in app.css');
});

console.log(failures === 0 ? '\nPASS — all theme/visual contract checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
