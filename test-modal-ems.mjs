// The EMS section INSIDE the kibbutz card (QA round 3, D4). Run: node test-modal-ems.mjs
//
// WHY THIS EXISTS. עידן's note: an open EMS task read from inside the card must show the whole
// story — title, status, the FULL description, 👤 who, 📅 when — and close with two small
// bubbles at the bottom-left: priority and type. `emsModalTaskRow` (js/src/14-calendar.js) is
// the pure builder that decides all of it; this runner lifts it out of the real source text
// and asserts on its output, so a later edit that drops a field fails here rather than in QA.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./js/src/14-calendar.js', import.meta.url), 'utf8');

/** The text of one top-level function from the bundle source, by brace balance. */
function liftFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + ' must exist in js/src/14-calendar.js');
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces reading ' + name);
}

const emsModalTaskRow = new Function(
  liftFn(SRC, 'emsModalTaskRow') + '\n' + liftFn(SRC, 'emsModalDueText') + '\nreturn emsModalTaskRow;',
)();

// The exact label maps the caller passes in (js/src/14-calendar.js).
const L = {
  status:   { new: '🆕 חדשה', in_progress: '🔄 בטיפול' },
  priority: { low: '🔵 נמוכה', normal: '🟡 רגילה', high: '🟠 גבוהה', urgent: '🔴 דחופה' },
  type:     { supplying_meters: '📦 אספקת מונים', fixing_fault: '🔧 תיקון תקלה', other: '📌 אחר' },
  dot:      { urgent: '#dc2626', high: '#ea580c', normal: '#64748b', low: '#94a3b8' },
};
const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let failures = 0, passes = 0;
const check = (name, fn) => {
  try { fn(); passes++; console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
};

const FULL = {
  id: 'task-1',
  title: 'תקלת תקשורת בבקר',
  status: 'in_progress',
  priority: 'high',
  type: 'fixing_fault',
  description: 'הבקר במשק הבקר לא מדווח מאז שלישי. לבדוק אנטנה וכבל.',
  assignee: { firstName: 'ניתאי', lastName: 'כהן' },
  expectedCompletionDate: '2026-09-30T12:00:00.000Z',
};

check('the row carries title + status + the FULL description', () => {
  const h = emsModalTaskRow(FULL, L, esc);
  assert.ok(h.includes('תקלת תקשורת בבקר'), 'title');
  assert.ok(h.includes('🔄 בטיפול'), 'status label');
  // the whole text, never clamped or cut
  assert.ok(h.includes(FULL.description), 'the full description');
  assert.ok(h.includes('class="t-desc"'), 't-desc wrapper');
});

check('👤 assignee and 📅 due are on the row', () => {
  const h = emsModalTaskRow(FULL, L, esc);
  assert.ok(h.includes('👤 ניתאי כהן'), 'assignee full name');
  assert.ok(h.includes('📅 30.9'), 'due as d.M, got: ' + h);
});

check('the two bottom bubbles are priority and type, in that order', () => {
  const h = emsModalTaskRow(FULL, L, esc);
  const bubbles = h.slice(h.indexOf('t-bubbles'));
  const p = bubbles.indexOf('🟠 גבוהה');
  const t = bubbles.indexOf('🔧 תיקון תקלה');
  assert.ok(p !== -1 && t !== -1, 'both bubbles render');
  assert.ok(p < t, 'priority comes before type');
});

check('an empty task degrades: no description, no meta, still two bubbles', () => {
  const h = emsModalTaskRow({ id: 'x', title: 'בלי כלום', status: 'new' }, L, esc);
  assert.ok(!h.includes('t-desc'), 'no empty description block');
  assert.ok(!h.includes('t-meta'), 'no empty meta row');
  assert.ok(h.includes('t-bubbles'), 'the bubble row still exists');
  assert.ok(h.includes('🆕 חדשה'), 'status label');
});

check('an unknown priority/type falls back to the raw value, never "undefined"', () => {
  const h = emsModalTaskRow({ id: 'y', title: 'ז', status: 'new', priority: 'zzz', type: 'qqq' }, L, esc);
  assert.ok(!h.includes('undefined'), 'no undefined leaks into the HTML');
  assert.ok(h.includes('zzz') && h.includes('qqq'), 'raw values shown');
});

check('a bad due date is dropped rather than rendered as Invalid Date', () => {
  const h = emsModalTaskRow({ id: 'z', title: 'ז', status: 'new', expectedCompletionDate: 'nope' }, L, esc);
  assert.ok(!h.includes('📅'), 'no due chip');
  assert.ok(!h.includes('Invalid'), 'no Invalid Date');
});

check('every rendered value goes through the escaper', () => {
  const h = emsModalTaskRow(
    { id: 'a', title: '<script>x</script>', status: 'new', description: '<b>d</b>' }, L, esc);
  assert.ok(!h.includes('<script>'), 'title escaped');
  assert.ok(h.includes('&lt;b&gt;d&lt;/b&gt;'), 'description escaped');
});

check('the row is clickable and identifies its task', () => {
  const h = emsModalTaskRow(FULL, L, esc);
  assert.ok(h.includes('emsModalTaskClick('), 'opens the task');
  assert.ok(h.includes('data-task="task-1"'), 'carries its id');
});

// The caller must actually USE the builder — a row hand-rolled beside it would drift.
check('prepModalEmsSection renders through emsModalTaskRow', () => {
  assert.ok(/h \+= emsModalTaskRow\(t, labels, emsEsc\)/.test(SRC), 'the section calls the builder');
  assert.ok(/dot: EMS_PRIORITY_DOT/.test(SRC) && /type: EMS_TYPE/.test(SRC),
    'the label bundle carries EMS_TYPE and the priority dots');
});

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
