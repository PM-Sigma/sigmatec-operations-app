// Self-check for the "המשימות שלי" per-owner view filter (js/src/14-calendar.js).
// Run: node test-mytasks-filter.mjs
//
// renderMyTasks() reads a dozen DOM ids + SHEET_DATA + the EMS cache + helpers (emsUserName /
// isOwnerOf / linesForPerson / KIBBUTZ_SITE_MAP ...), so stubbing it end-to-end is heavy. Following
// test-attendance-toggle.mjs, we extract the ONE load-bearing bit under test — the `who` resolution
// (picker value, defaulting to the logged-in user) — from the source and eval it against fixtures,
// plus regex guards that the grouping predicates filter on `who` and NOT on `me` (the whole point of
// the change: without those the picker would move the title but not the task list).
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/14-calendar.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ---- isolate renderMyTasks() so guards can't be satisfied by some other function in the file ----
const fnStart = src.indexOf('function renderMyTasks()');
const fnBody = src.slice(fnStart, src.indexOf('\n  }', src.indexOf('box.innerHTML = html;', fnStart)));
check('renderMyTasks() is present in the source', () => {
  assert.ok(fnStart !== -1, 'could not find renderMyTasks() in js/src/14-calendar.js');
  assert.ok(fnBody.includes('myTasksPerson'), 'renderMyTasks should read the myTasksPerson picker');
});

// ---- 1. the `who` resolution, evaluated for real ----
const m = fnBody.match(/const pSel = document\.getElementById\('myTasksPerson'\);\s*([\s\S]*?)const who = ([^;]+);/);
check('source still defines the who-resolution (pSel default + `const who = ...`)', () => {
  assert.ok(m, 'could not locate the pSel/who resolution block');
  assert.ok(/pSel\.value = me/.test(m[1]), 'an empty picker should default to the logged-in user (me)');
  assert.ok(/\|\|\s*me/.test(m[2]), '`who` must fall back to me when the picker has no value');
});

if (m) {
  // Browser-accurate <select> stub: assigning a value that is not an option is a no-op.
  const OPTIONS = ['', 'עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'מתניה', 'אליה'];
  function makeSelect(initial) {
    let v = initial;
    return { get value() { return v; }, set value(nv) { if (OPTIONS.includes(nv)) v = nv; } };
  }
  // run the extracted block: `if (pSel && !pSel.value) pSel.value = me;  const who = (pSel && pSel.value) || me;`
  const resolve = new Function('pSel', 'me', m[1] + 'return (' + m[2] + ');');

  check('default (picker untouched) → who = the logged-in user, and the picker is set to them', () => {
    const sel = makeSelect('');
    assert.equal(resolve(sel, 'אביאם'), 'אביאם', 'אביאם should land on their own tasks');
    assert.equal(sel.value, 'אביאם', 'the picker should visibly reflect the default');
  });

  check('each person defaults to their OWN tasks (sweep over every option)', () => {
    OPTIONS.filter(Boolean).forEach(p => {
      assert.equal(resolve(makeSelect(''), p), p, p + ' should default to their own tasks');
    });
  });

  check('explicit pick wins over the default (עידן viewing אביאם)', () => {
    const sel = makeSelect('אביאם');
    assert.equal(resolve(sel, 'עידן'), 'אביאם', 'the chosen אחראי should drive the view');
    assert.equal(sel.value, 'אביאם', 'an explicit pick must not be overwritten by the default');
  });

  check('user who is not an option (e.g. viewer) → who falls back to me, no crash', () => {
    const sel = makeSelect('');
    assert.equal(resolve(sel, 'PM'), 'PM', 'unknown user still sees their own tasks');
    assert.equal(sel.value, '', 'the picker stays empty because PM is not an option');
  });

  check('no picker in the DOM at all → who = me (graceful)', () => {
    assert.equal(resolve(null, 'ניתאי'), 'ניתאי');
  });
}

// ---- 2. regression guards: the task filters must key off `who`, not `me` ----
check('EMS assignee filter uses who (not me)', () => {
  assert.ok(/emsUserName\(t\.assignee\)\.indexOf\(who\)/.test(fnBody),
    'the EMS assignee match must use who so the picker actually filters the list');
});
check('kibbutz-owner filter uses who (not me)', () => {
  assert.ok(/isOwnerOf\(sheetT,\s*who\)/.test(fnBody), 'isOwnerOf must be called with who');
});
check('status/expectedTask "- name" line filter uses who (not me)', () => {
  assert.ok(/linesForPerson\(t\.status,\s*who\)/.test(fnBody), 'linesForPerson(status) must use who');
  assert.ok(/linesForPerson\(t\.expectedTask,\s*who\)/.test(fnBody), 'linesForPerson(expectedTask) must use who');
});
check('no filter predicate still keys off the raw logged-in user `me`', () => {
  ['indexOf(me)', 'isOwnerOf(sheetT, me)', 'linesForPerson(t.status, me)', 'linesForPerson(t.expectedTask, me)']
    .forEach(bad => assert.ok(!fnBody.includes(bad), 'leftover me-based filter: ' + bad));
});
check('me is still resolved and kept (needed for the default + "שלי" wording)', () => {
  assert.ok(/const me = \(typeof getCurrentUser/.test(fnBody), 'me must still come from getCurrentUser()');
  assert.ok(/who === me/.test(fnBody), 'the title/empty-state should distinguish self from others');
});

// ---- 3. the picker must be wired to re-render, else changing it does nothing ----
check('index.html wires myTasksPerson onchange → renderMyTasks()', () => {
  const sel = html.match(/<select id="myTasksPerson"[^>]*>/);
  assert.ok(sel, 'myTasksPerson select not found in index.html');
  assert.ok(/onchange="renderMyTasks\(\)"/.test(sel[0]),
    'the picker needs onchange="renderMyTasks()" or the view will not refresh');
});
check('index.html has the myTasksTitle element the render targets', () => {
  assert.ok(/id="myTasksTitle"/.test(html), 'renderMyTasks sets #myTasksTitle; it must exist');
});

console.log(failures === 0 ? '\nPASS — all my-tasks filter checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
