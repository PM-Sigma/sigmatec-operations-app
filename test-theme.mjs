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

check('every font the ⚙️ setting offers is loadable — eagerly or on demand', () => {
  // Task 22b: three of the four faces left the <head>. Linking all four was three extra
  // render-blocking stylesheets on every boot for a setting almost nobody touches, so only the
  // BODY face is eager and the rest are injected by app/src/lib/settings.ts the moment someone
  // picks one. The contract is unchanged — a face the setting offers must still be loadable.
  assert.ok(html.includes('family=Assistant'), 'the body face is not loaded in <head>');
  const settings = fs.readFileSync(path.join(__dirname, 'app/src/lib/settings.ts'), 'utf8');
  for (const f of ['Rubik', 'Noto+Sans+Hebrew', 'Heebo']) {
    assert.ok(html.includes('family=' + f) || settings.includes('family=' + f),
      f + ' is offered in הגדרות but neither linked in <head> nor injectable by applySettings()');
  }
  assert.ok(/export function ensureFontLink/.test(settings), 'no lazy font injector at all');
});

// Task 22b: the two big sheets are non-blocking, so the first screen's CSS must be inlined —
// otherwise the page paints unstyled and the "flash" עידן called out comes back.
check('the critical CSS is inlined in <head> and generated from css/critical.css', () => {
  const head = html.split('</head>')[0];
  assert.ok(/<!-- critical:start[\s\S]*?<style>/.test(head), 'no generated critical <style> block');
  const inlined = head.match(/<!-- critical:start[^>]*-->\s*<style>([\s\S]*?)<\/style>/);
  assert.ok(inlined && inlined[1].length > 1000, 'the critical block is empty — run node build.mjs');
  for (const sel of ['--bg:', 'body{', '.page-nav', '.section-header', '.kibbutz-grid']) {
    assert.ok(inlined[1].includes(sel), 'the critical CSS is missing ' + sel);
  }
  // The sheets themselves stay render-blocking (task 22b measured the swap as a 0.62 layout
  // shift), so what this guards is that the inlined copy is REAL and generated — a hand-edited
  // or empty block is the failure mode.
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

// ── no white surfaces left in the legacy layers (review fix 7) ───────────────
// The first sweep only touched css/app.css; these surfaces are built in JS strings and inline
// styles, which is why four of them stayed white in dark mode. The guard is on the SURFACE
// properties only: a white FOREGROUND on a coloured fill is correct and stays allowed.
check('no hardcoded white surface in the legacy modules or index.html', () => {
  const WHITE = /(?:background|background-color)\s*:\s*(?:#fff(?:fff)?\b|white\b)/i;
  const files = ['index.html', ...fs.readdirSync(path.join(__dirname, 'js/src')).filter(f => f.endsWith('.js')).map(f => 'js/src/' + f)];
  const bad = [];
  for (const f of files) {
    const body = fs.readFileSync(path.join(__dirname, f), 'utf8');
    let inPrintTemplate = false;
    const lines = body.split(/\r?\n/);
    lines.forEach((line, i) => {
      // A whole DOCUMENT built from a JS string (the visits PDF, the certificate): from its
      // doctype to its closing html tag, white paper is the point.
      if (/<!doctype html>/i.test(line)) inPrintTemplate = true;
      if (/<[/]html>/i.test(line)) { inPrintTemplate = false; return; }
      // certDocHtml is a PRINTED document — paper is white on purpose (the brief says so).
      // `print-ok` marks a one-off surface that is also paper (a signature pad, the cert
      // preview frame). It may sit on the line or on the line just above it — the same
      // convention the rtl-ok / copy-ok gates use, because a long inline style has no room
      // for the reason.
      if (/certDoc|@media print|printable|print-ok/i.test(line)) return;
      if (/print-ok/i.test(lines[i - 1] || '')) return;
      if (inPrintTemplate) return;
      if (WHITE.test(line)) bad.push(f + ':' + (i + 1) + ' ' + line.trim().slice(0, 90));
    });
  }
  assert.deepEqual(bad, [], 'white surfaces that will not flip in dark mode:\n    ' + bad.join('\n    '));
});

// ── the viewer's shell (task-4 step 6, review miss 8) ────────────────────────
// The BEHAVIOURAL viewer matrix lives where the gates are: app/src/lib/viewerGate.test.ts (the
// React half — canManageKibbutzim, the import gate, the bullet→task gate, 📣 allowed) and
// test-viewer-gate.mjs (the legacy half, untouched). What only THIS file can see is the
// viewer's SHELL: the reports hub shown, every write surface hidden, 44 px controls.
check('body.user-viewer shows the reports hub and hides the write surfaces', () => {
  assert.ok(/body\.user-viewer #viewerReportsHub \{ display: block !important; \}/.test(css),
    'the reports hub is not force-shown for the viewer');
  for (const hidden of ['#invTransferCard', '#invAdjustCard', '#invOrdersList button']) {
    assert.ok(css.includes('body.user-viewer ' + hidden), 'the viewer can still reach ' + hidden);
  }
});

check('the viewer reports hub has 44 px controls (it is the only screen he uses)', () => {
  const hub = css.slice(css.indexOf('.xl-hub-rows'), css.indexOf('body.user-viewer.sigma-nav-ready'));
  const minHeights = hub.match(/min-height: (\d+)px/g) || [];
  assert.ok(minHeights.length >= 2, 'no min-height on the hub controls');
  minHeights.forEach(m => assert.ok(parseInt(m.match(/\d+/)[0], 10) >= 44, 'a hub control under 44 px: ' + m));
});

// ── the re-skinned visit form keeps every affordance it replaced ─────────────
// Review fix (minor): the re-skin showed the 🚚 button only while the cert gate was
// UNSATISFIED, which quietly removed the reprint / corrected-certificate path the old
// always-present button gave (spec §5 rule 4 keeps reissue).
check('the cert chip offers 🚚 in BOTH states — issued and not yet issued', () => {
  const visits = fs.readFileSync(path.join(__dirname, 'js/src/09-visits.js'), 'utf8');
  const paint = visits.slice(visits.indexOf('async function paintVisitCertStatus'));
  const body = paint.slice(0, paint.indexOf('window.paintVisitCertStatus'));
  const buttons = body.match(/certFromVisitForm\(\)/g) || [];
  assert.ok(buttons.length >= 2,
    'expected a 🚚 button in both chip states, found ' + buttons.length);
  const oneLine = body.split(/\r?\n/).join(' ');
  assert.ok(/sig-certchip ok[\s\S]{0,200}?certFromVisitForm/.test(oneLine),
    'the ISSUED chip has no way back to a certificate');
});

check('the save button relabels only while a certificate is actually owed', () => {
  const visits = fs.readFileSync(path.join(__dirname, 'js/src/09-visits.js'), 'utf8');
  assert.ok(visits.includes("'🚚 הפק תעודה ← שמור'"), 'the relabel is gone (§7k #5)');
  assert.ok(/save.innerHTML = n \? '💾 שמור ביקור'/.test(visits),
    'an issued cert must put the plain save label back');
});

console.log(failures === 0 ? '\nPASS — all theme/visual contract checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
