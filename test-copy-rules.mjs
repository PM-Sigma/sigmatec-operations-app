// The two COPY RULES (spec, the paragraphs before §7i) plus the §2 deletion of the
// data-flow / procedure vocabulary. All three are עידן's, all three are binding.
//   node test-copy-rules.mjs
//
//  1. NO SYSTEM TALK. The interface never explains its own mechanics ("נשמר אוטומטית
//     ל-Supabase", "בדיקה אוטומטית", "מחושב מאותה פונקציה", "RLS"). Every visible sentence is
//     addressed to the user about HIS situation and next step. Engineering guarantees live in
//     tests and docs — which is what this file is.
//  2. NEVER TELL A USER WHO ELSE SEES HIS DATA. Management visibility is a fact of the roles,
//     not a message to the employee.
//  3. The pipeline vocabulary is DELETED, not hidden (spec §2): no זרימת נתונים, פרוצדורה,
//     צינור or "שלב N" anywhere in the UI.
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

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(__dirname, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) out.push(rel);
  }
  return out;
}

/**
 * Comments are notes to US, not copy — and several of ours quote a banned word precisely to
 * say "never write this on screen". Blanked, with the line count preserved.
 *
 * The carriage-return normalisation is load-bearing on Windows: with CRLF endings a `$` anchor
 * sits before the CR, so the `//` stripper matched nothing and every explanatory comment was
 * reported as an offending sentence. (Found while writing this file.)
 */
function stripComments(body) {
  return body
    .split(/\r?\n/)
    .map(l => l.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
}

// ── rule 1: no system talk ────────────────────────────────────────────────────
// `API` is deliberately NOT here: it lives in identifiers (WRITE_ROUTER_URL, emsApi) far more often
// than in copy, and the spec's own contract sentence lists the words that matter.
const SYSTEM_TALK = [
  ['Supabase', /Supabase/i],
  ['RLS', /\bRLS\b/],
  ['בדיקה אוטומטית', /בדיקה אוטומטית/],
  ['מחושב', /מחושב/],
  ['פונקציה', /פונקציה/],
  // שרת / מודל / API / cold start — audit B · F-14 found five such sentences on screen.
  // Safe to ban despite living in identifiers too: copyStrings only yields strings that
  // CONTAIN HEBREW, so `emsApi` never reaches here and "השרת מתעורר (cold start)" does.
  ['שרת', /(?<![א-ת])[הלמבכשו]{0,2}שרת(?![א-ת])/],
  ['cold start', /cold\s*start/i],
  ['מודל', /(?<![א-ת])[הו]?מודל/],
  ['API', /\bAPI\b/i],
];

// ── rule 2: who sees what ─────────────────────────────────────────────────────
const WHO_SEES = [
  ['עמיחי רואה / יראה', /עמיחי\s+(?:רואה|ראה|יראה)/],
  ['עידן רואה / יראה', /עידן\s+(?:רואה|ראה|יראה)/],
  ['מנהל רואה / יראה', /מנהל\s+(?:רואה|ראה|יראה)/],
];

// ── rule 3: the deleted pipeline vocabulary (spec §2) ─────────────────────────
const PIPELINE = [
  ['זרימת נתונים', /זרימת נתונים/],
  ['פרוצדורה', /פרוצדורה/],
  ['צינור', /צינור/],
  ['שלב N', /שלב [0-9]/],
];

/** index.html + the island sources are the redesign's own surfaces. */
const NEW_UI = ['index.html', ...walk('app/src')];
/** The legacy modules carry copy too — rules 2 and 3 apply across the whole app. */
const LEGACY = fs.readdirSync(path.join(__dirname, 'js/src')).filter(f => f.endsWith('.js')).map(f => 'js/src/' + f);

/**
 * A line may declare itself DATA rather than copy with `copy-ok` — on the line, or in the
 * comment block immediately above it. The only use today is the `?sb=0` mock rows: a task
 * title is whatever somebody typed in EMS, and spec §2 keeps them.
 */
function exempt(rawLines, i) {
  if (/copy-ok/.test(rawLines[i] || '')) return true;
  for (let j = i - 1; j >= 0; j--) {
    const t = (rawLines[j] || '').trim();
    if (!(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('{/*'))) return false;
    if (/copy-ok/.test(t)) return true;
  }
  return false;
}

/**
 * The COPY a person reads — and nothing else. The rules are about SENTENCES, not identifiers:
 * `getSupabase()` is a function name; `'נשמר ל-Supabase'` is a promise made to the user. Every
 * user-facing string in this app is Hebrew, so "contains a Hebrew letter" is the precise
 * filter: quoted literals with Hebrew in them, and JSX / HTML text nodes with Hebrew in them.
 */
const HEBREW = /[֐-׿]/;
const QUOTED = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g;

function copyStrings(file) {
  const raw = read(file).split(/\r?\n/);
  const out = [];                                   // [{ line, text }]
  stripComments(read(file)).split('\n').forEach((line, i) => {
    if (exempt(raw, i)) return;
    const push = t => { if (t && HEBREW.test(t)) out.push({ line: i + 1, text: t }); };
    for (const m of line.matchAll(QUOTED)) push(m[1] ?? m[2] ?? m[3]);
    for (const m of line.matchAll(/>([^<>{}]+)</g)) push(m[1]);
    // a JSX text node that spans lines — the line carries no tags or quotes at all
    if (!/[<>{}'"`]/.test(line)) push(line);
  });
  return out;
}

function hits(files, rules) {
  const bad = [];
  for (const f of files) {
    for (const { line, text } of copyStrings(f)) {
      for (const [label, re] of rules) {
        if (re.test(text)) bad.push(`${f}:${line} [${label}] ${text.trim().slice(0, 90)}`);
      }
    }
  }
  return bad;
}

check('rule 1 — the UI never explains its own mechanics', () => {
  // NEW_UI *and* LEGACY: a toast thrown from js/src is copy the user reads exactly like a
  // React string is, and F-14's offenders all lived there.
  const bad = hits([...NEW_UI, ...LEGACY], SYSTEM_TALK);
  assert.deepEqual(bad, [], 'system talk in UI strings:\n    ' + bad.join('\n    '));
});

check('rule 2 — no sentence tells a user who else sees his data', () => {
  const bad = hits([...NEW_UI, ...LEGACY], WHO_SEES);
  assert.deepEqual(bad, [], 'visibility talk:\n    ' + bad.join('\n    '));
});

check('rule 3 — the data-flow / procedure vocabulary is gone from the UI (spec §2)', () => {
  const bad = hits([...NEW_UI, ...LEGACY], PIPELINE);
  assert.deepEqual(bad, [], 'deleted vocabulary still on screen:\n    ' + bad.join('\n    '));
});

check('rule 1 still BITES — the four words added after F-14 match real sentences', () => {
  // A word list is worthless if it silently stops matching. These are the exact sentences the
  // audit found on screen, plus the false positives that forced the Hebrew boundaries.
  const must = [
    'מתמלל בשרת…',
    'תם הזמן — השרת לא הגיב (20 שניות)',
    'השרת מתעורר (cold start) — נסה שוב בעוד רגע',
    'לא נשמע כלום — עוברים להקלטה ותמלול בשרת',
    'המודל לא החזיר תשובה',
    'שגיאת API — נסה שוב',
  ];
  const mustNot = ['ללא מערכת מקושרת', 'התעודה נשלחה ללקוח', 'הרשימה מסודרת'];
  const fires = t => SYSTEM_TALK.some(([, re]) => re.test(t));
  must.forEach(t => assert.ok(fires(t), 'should have been caught as system talk: ' + t));
  mustNot.forEach(t => assert.ok(!fires(t), 'false positive: ' + t));
});

// ── round 5 phase 2: the designer's copy rules (tools-and-motion.md §1 "Copy"), עידן's ruling
// 23.9 — as a RATCHET, not a sweep. The app has plenty of pre-existing "!", emoji-as-icon and
// imperative-form buttons; fixing all of it now is each page package's job as it rewrites that
// page, not this token/component pass. This only stops the count climbing back up, the same
// shape test-impeccable.mjs uses. ──────────────────────────────────────────────────────────
const COPY_BASELINE_PATH = path.join(__dirname, 'qa', 'copy-rules-baseline.json');
const copyBaseline = JSON.parse(fs.readFileSync(COPY_BASELINE_PATH, 'utf8'));

/** Masculine-imperative button verbs the noun form replaces (שמור→שמירה, שלח→שליחה…). Matched
    as a whole word so it doesn't fire on "לשמור" or "ששלח". */
const IMPERATIVE_BUTTON_VERBS = /(?<![א-ת])(שמור|שלח|סגור|בטל|מחק|ערוך|הוסף|בחר|אשר|פתח|העלה)(?![א-ת])/;
/** Any of the emoji this app uses as an icon-substitute (audit: "🆕 · 🔴 · ⚠️ · 📋 · ⏰" and
    friends) — a broad emoji-range match, not a fixed list, since the point is "any emoji in
    chrome", not a specific set. Surrogate-pair aware. */
const EMOJI = /\p{Extended_Pictographic}/u;

function ratchet(name, files, re) {
  const hits = [];
  for (const f of files) {
    for (const { line, text } of copyStrings(f)) {
      if (re.test(text)) hits.push(`${f}:${line} ${text.trim().slice(0, 90)}`);
    }
  }
  const was = copyBaseline[name] ?? 0;
  check(`copy ratchet — ${name} (${hits.length}, baseline ${was})`, () => {
    assert.ok(hits.length <= was,
      `${name} rose from ${was} to ${hits.length}:\n    ` + hits.slice(0, 20).join('\n    '));
  });
}

ratchet('no-bang', NEW_UI, /!/);
ratchet('no-emoji-in-chrome', NEW_UI, EMOJI);
ratchet('imperative-buttons', NEW_UI, IMPERATIVE_BUTTON_VERBS);

check('the sweep is actually looking at copy (not passing on an empty scan)', () => {
  assert.ok(NEW_UI.length > 20, 'expected the island sources + index.html, found ' + NEW_UI.length);
  assert.ok(LEGACY.length > 20, 'expected the legacy modules, found ' + LEGACY.length);
  assert.match(read('index.html'), /לקוחות פעילים/, 'index.html has no Hebrew copy — the scan is pointed at the wrong thing');   // 22.9: the brand reads "Sigmatec Operations" now, so the sentinel is a section title
  // and it can still SEE a sentence: the copy extractor must find plenty in index.html
  assert.ok(copyStrings('index.html').length > 50, 'the extractor found almost no Hebrew copy in index.html');
});

console.log(failures === 0 ? '\nPASS — copy rules clean' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
