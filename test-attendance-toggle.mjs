// Self-check for the attendance person-toggle people list (js/src/04-attendance-daily.js).
// Run: node test-attendance-toggle.mjs
// renderAttendanceReport() reads dozens of DOM ids + SHEET_DATA + helpers (attPerson / isIdan /
// isViewer / mergeAttendanceByDate / WORKDAY_HOURS ...), so stubbing it end-to-end is heavy.
// Instead we extract the ONE load-bearing expression under test — the toggle's people list, now
// built from ATT_PEOPLE ∪ distinct SHEET_DATA.attendance persons, he-sorted — straight from the
// source with a regex and eval it against a fixture. That pins union + dedup + filter + he-sort
// without dragging in the rest of the render.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/04-attendance-daily.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// pull the `const people = Array.from(new Set(ATT_PEOPLE.concat(...))).sort(...);` statement
const m = src.match(/const people = (Array\.from[\s\S]*?);/);
check('source still defines the people-list expression (Array.from(new Set(ATT_PEOPLE.concat(...))))', () => {
  assert.ok(m, 'could not locate the `const people = Array.from(...)` expression in the source');
  assert.ok(/ATT_PEOPLE\.concat/.test(m[1]), 'expression should union ATT_PEOPLE with the attendance persons');
  assert.ok(/localeCompare\([^)]*'he'\)/.test(m[1]), 'expression should he-sort');
});

if (m) {
  const evalPeople = new Function('ATT_PEOPLE', 'window', 'return (' + m[1] + ');');

  // fixture: two seed people + an attendance log with a duplicate, two NEW persons, and junk
  const ATT_PEOPLE = ['ניתאי', 'אביאם'];
  const window_ = { SHEET_DATA: { attendance: [
    { person: 'עידן' }, { person: 'אביאם' }, { person: '' }, { person: null }, { person: 'מתניה' }, { person: 'עידן' }
  ] } };
  const people = evalPeople(ATT_PEOPLE, window_);

  check('people = union of ATT_PEOPLE and distinct attendance persons', () => {
    ['ניתאי', 'אביאם', 'עידן', 'מתניה'].forEach(p => assert.ok(people.includes(p), 'expected ' + p + ' in the list'));
  });
  check('people is de-duplicated (אביאם and עידן appear once each)', () => {
    assert.equal(people.filter(p => p === 'אביאם').length, 1, 'אביאם should appear once');
    assert.equal(people.filter(p => p === 'עידן').length, 1, 'עידן should appear once');
    assert.equal(people.length, 4, 'expected exactly 4 unique people, got ' + JSON.stringify(people));
  });
  check('people drops empty/nullish persons (filter(Boolean))', () => {
    assert.ok(!people.some(p => !p), 'no empty/null person should survive');
  });
  check('people is Hebrew-sorted (every adjacent pair in he-collation order)', () => {
    for (let i = 1; i < people.length; i++) {
      assert.ok(people[i - 1].localeCompare(people[i], 'he') <= 0,
        'out of he-order: "' + people[i - 1] + '" before "' + people[i] + '"');
    }
  });
  check('empty attendance log → people is exactly ATT_PEOPLE (he-sorted, no extras)', () => {
    const only = evalPeople(['ניתאי', 'אביאם'], { SHEET_DATA: { attendance: [] } });
    assert.deepEqual(only, ['אביאם', 'ניתאי'].sort((a, b) => a.localeCompare(b, 'he')));
    assert.equal(only.length, 2);
  });
}

console.log(failures === 0 ? '\nPASS — all attendance-toggle checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
