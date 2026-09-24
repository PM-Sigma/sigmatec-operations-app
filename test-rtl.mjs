// RTL is a RELEASE GATE (spec §6 — עידן 17.9: "שאין עיצוב שבור בעברית").
//   node test-rtl.mjs
//
// What it enforces, and why each rule exists:
//  1. LOGICAL properties only in the CSS this redesign owns. `margin-left` is a promise about
//     pixels; `margin-inline-start` is a promise about READING ORDER, and Hebrew reads the
//     other way. A line that genuinely needs a physical side annotates itself `/* rtl-ok */`
//     with the reason — that is the escape hatch, and it is visible in review.
//  2. `dir="rtl"` on <html> and on every island root, because a portalled Sheet/Dialog renders
//     at <body> and inherits nothing from the island it was opened from.
//  3. Numbers, dates and codes wrapped in <bdi>. A bare "3 שעות · 17.9" inside a Hebrew line
//     re-orders itself in ways nobody predicts; `unicode-bidi: isolate` (which <bdi> carries)
//     is what stops it.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

/** Every .ts/.tsx/.css under app/src. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(__dirname, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(rel);
  }
  return out;
}

// A physical direction, in CSS or in a Tailwind class. `left-`/`right-` as Tailwind utilities
// are caught too (`ml-2`, `pr-3`, `text-left`, `left-[50%]`), since those are the same bug
// wearing a shorter name.
const PHYSICAL = [
  /(?:^|[^-\w])margin-(?:left|right)\s*:/,
  /(?:^|[^-\w])padding-(?:left|right)\s*:/,
  /(?:^|[^-\w])border-(?:left|right)(?:-\w+)?\s*:/,
  /(?:^|[^-\w])(?:left|right)\s*:/,
  /text-align\s*:\s*(?:left|right)/,
  /\b(?:ml|mr|pl|pr)-(?:\d|\[)/,
  /\btext-(?:left|right)\b/,
  /\b(?:left|right)-\[/,
];

/**
 * Lines that opt out on purpose. The marker may sit ON the line, or anywhere in the comment
 * block immediately ABOVE it — which is where a real REASON fits, and a 300-character
 * Tailwind class string has no room for one inline.
 */
const ALLOW = /rtl-ok/;

/** Is the line (or the comment block just above it) annotated? */
function annotated(lines, i) {
  if (ALLOW.test(lines[i])) return true;
  for (let j = i - 1; j >= 0; j--) {
    const t = lines[j].trim();
    // walk up only while we are still inside a comment block touching this line
    if (!(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('{/*'))) return false;
    if (ALLOW.test(t)) return true;
  }
  return false;
}

function offenders(file, body) {
  const bad = [];
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    if (annotated(lines, i)) return;
    // a comment line is prose, and prose may name a physical property while explaining why
    // it is NOT used (several of ours do exactly that)
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (!code.trim()) return;
    if (PHYSICAL.some(re => re.test(code))) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 110)}`);
  });
  return bad;
}

// ── 1. the CSS this redesign owns (the marked regions) ────────────────────────
check('no physical-direction property in the tokens-only CSS regions', () => {
  const css = read('css/app.css');
  const regions = [...css.matchAll(/\/\* @tokens-only \*\/([\s\S]*?)\/\* @end \*\//g)];
  assert.ok(regions.length, 'no tokens-only region to check');
  const bad = regions.flatMap((m, ri) => offenders('css/app.css#region' + (ri + 1), m[1]));
  assert.deepEqual(bad, [], 'physical directions:\n    ' + bad.join('\n    '));
});

// css/critical.css is inlined into <head> on every build and is therefore the FIRST CSS the
// phone applies — a physical direction there is a broken first paint in Hebrew, which is exactly
// what this gate exists to stop. It is small and hand-written, so the whole file is swept (no
// marked regions needed).
check('no physical-direction property in css/critical.css', () => {
  const bad = offenders('css/critical.css', read('css/critical.css'));
  assert.deepEqual(bad, [], 'physical directions in css/critical.css: ' + bad.join(' | '));
});

// ── 2. every island source ────────────────────────────────────────────────────
// app/src/lib/certDoc.ts (package I, task L5) is the one deliberate exception: certDocHtml /
// certRangeReportHtml build a STANDALONE printed document (an A4 page, `document.write`/iframe
// srcdoc'd into its OWN <html dir="rtl">) that is never part of the app's own DOM and never
// inherits or affects its bidi rendering — it is a byte-identical port of js/src/20-delivery-
// cert.js's certDocHtml, which lives entirely OUTSIDE app/src and was therefore never subject to
// this rule either. A printed cert's watermark/signature-line/circle positions are fixed points
// on paper, not reading-order-relative UI, and marking each of the ~15 physical declarations
// individually (this check's normal escape hatch) would mean inserting a CSS comment mid-template
// on every one — bytes the customer's already-signed document does not have today. Annotating
// the FILE here, once, keeps that document unchanged and keeps the reason visible in review.
const RTL_EXEMPT_FILES = ['app/src/lib/certDoc.ts'];
check('no physical-direction property anywhere in app/src', () => {
  const bad = walk('app/src').filter(f => !RTL_EXEMPT_FILES.includes(f)).flatMap(f => offenders(f, read(f)));
  assert.deepEqual(bad, [], 'physical directions:\n    ' + bad.join('\n    '));
});

// ── 3. dir="rtl" where it is load-bearing ─────────────────────────────────────
check('<html> declares dir="rtl"', () => {
  assert.match(read('index.html'), /<html[^>]*\bdir="rtl"/);
});

check('every island root declares dir="rtl" (a portalled layer inherits nothing)', () => {
  const islands = read('app/src/islands.tsx');
  assert.match(islands, /setAttribute\('dir', 'rtl'\)/, 'mount() does not set dir on the island root');
});

check('the shadcn portals are scoped RTL too', () => {
  const styles = read('app/src/styles.css');
  assert.match(styles, /\[data-sigma-portal\][\s\S]*?direction:\s*rtl/, 'portalled layers have no direction');
});

// ── 4. <bdi> around numbers, dates and codes ──────────────────────────────────
check('components that render a number/date/code isolate it in <bdi>', () => {
  // The rule is checked where it MATTERS: a component that interpolates a count, a date or a
  // code into a Hebrew sentence. The heuristic is deliberately narrow — a false positive here
  // would train people to ignore the gate. `(?<!\$)` excludes a `${...}` template-literal
  // interpolation (e.g. SegmentedControl's `calc(${options.length})` thumb-width math, a CSS
  // value string that never renders as Hebrew text at all) so only a bare JSX `{...}` child —
  // an actual rendered number — trips it; a JSX `{\`...${n}...\`}` still matches on the OUTER
  // brace, so real interpolated Hebrew sentences are unaffected.
  const NUMERIC_HINT = /(?<!\$)\{(?:\w+\.)*(?:count|total|n|num|qty|hidden|orphans|len(?:gth)?|fresh)\}|chipDate\(|dueText\(|formatQty|formatDate/;
  const bad = [];
  for (const f of walk('app/src').filter(f => f.endsWith('.tsx') && !f.includes('.test.'))) {
    const body = read(f);
    if (!NUMERIC_HINT.test(body)) continue;
    if (!/<bdi>/.test(body)) bad.push(f);
  }
  assert.deepEqual(bad, [], 'renders numbers/dates with no <bdi>: ' + bad.join(', '));
});

check('direction-implying icons are not hand-mirrored (the RTL container does it)', () => {
  // A `transform: scaleX(-1)` or a `rotate-180` on a chevron is someone fixing RTL twice —
  // the container already flips it, and the double flip points the wrong way again.
  const bad = [];
  for (const f of walk('app/src').filter(f => f.endsWith('.tsx'))) {
    const body = read(f);
    body.split('\n').forEach((line, i) => {
      if (ALLOW.test(line)) return;
      if (/scaleX\(-1\)/.test(line) && /Chevron|Arrow/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], 'hand-mirrored direction icons: ' + bad.join(', '));
});

console.log(failures === 0 ? '\nPASS — RTL gate clean' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
