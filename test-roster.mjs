// ONE roster, ONE viewer spelling (audit A · A4 / A5 / A12).
//   node test-roster.mjs
//
// Four person lists used to disagree (index.html's login buttons, EMS_USERS, MEETING_PEOPLE,
// STAFF_PEOPLE) and two Hebrew names stood for one identity ('צפייה' is what the login gate
// STORES; 'צופה' is what three by-name checks compared against, so they could never fire).
// This file is the guard: every copy is derived from, or asserted against, the one roster.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
};

// ---- the one roster, lifted out of the bridge (no DOM, no bundle) ----
const bridge = read('js/src/00-bridge.js');
const APP_PEOPLE = JSON.parse(
  /window\.APP_PEOPLE = (\[[^\]]*\]);/.exec(bridge)[1].replace(/'/g, '"'),
);
const VIEWER_NAME = /window\.VIEWER_NAME = '([^']+)';/.exec(bridge)[1];

check('the roster is a real, non-trivial list', () => {
  assert.ok(APP_PEOPLE.length >= 7, 'expected the whole company, got ' + APP_PEOPLE.length);
  assert.strictEqual(new Set(APP_PEOPLE).size, APP_PEOPLE.length, 'duplicate name in APP_PEOPLE');
});

check('the login screen offers exactly the roster, in the same order', () => {
  const html = read('index.html');
  const modal = /id="loginModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(html)[0];
  const names = [...modal.matchAll(/setLoggedInUser\('([^']+)'\)/g)].map(m => m[1]);
  assert.deepStrictEqual(names, APP_PEOPLE);
});

check('STAFF_PEOPLE (Ctrl+K ✉️ recipients) covers everyone who can log in', () => {
  // A4: אליה and אבצן were unreachable, and עמיחי was excluded by a code comment.
  assert.match(bridge, /window\.STAFF_PEOPLE = window\.APP_PEOPLE\.slice\(\);/,
    'STAFF_PEOPLE must be derived from APP_PEOPLE, not re-typed');
});

check('MEETING_PEOPLE is derived from the roster, not re-typed', () => {
  assert.match(read('app/src/lib/meetingNotes.ts'), /export const MEETING_PEOPLE = APP_PEOPLE;/);
});

check('EMS_USERS is a declared SUBSET of the roster', () => {
  const src = read('js/src/11-search-login.js');
  const list = JSON.parse(/const EMS_USERS = (\[[^\]]*\]);/.exec(src)[1].replace(/'/g, '"'));
  const stray = list.filter(n => !APP_PEOPLE.includes(n));
  assert.deepStrictEqual(stray, [], 'EMS_USERS names nobody can log in as: ' + stray.join(', '));
});

check('app/src/lib/people.ts mirrors the bridge exactly', () => {
  const ts = read('app/src/lib/people.ts');
  const tsPeople = JSON.parse(/export const APP_PEOPLE = (\[[^\]]*\])/.exec(ts)[1].replace(/'/g, '"'));
  assert.deepStrictEqual(tsPeople, APP_PEOPLE);
  assert.strictEqual(/export const VIEWER_NAME = '([^']+)';/.exec(ts)[1], VIEWER_NAME);
});

check('the viewer has ONE name, and it is the one the login gate stores', () => {
  assert.strictEqual(VIEWER_NAME, 'צפייה');
  assert.match(read('js/src/15-login-gate.js'), /localStorage\.setItem\(USER_KEY, window\.VIEWER_NAME\)/);
});

check("no source compares against the dead spelling 'צופה'", () => {
  // Tests may still exercise it as an INPUT (a name the app must not mistake for the viewer);
  // production sources must not branch on it.
  const files = [
    ...fs.readdirSync(path.join(__dirname, 'js/src')).map(f => 'js/src/' + f),
    ...walk('app/src').filter(f => !/\.test\.(ts|tsx)$/.test(f)),
  ];
  const bad = [];
  for (const f of files) {
    read(f).split(/\r?\n/).forEach((l, i) => {
      if (l.trim().startsWith('//') || l.trim().startsWith('*')) return;
      if (/'צופה'|"צופה"/.test(l)) bad.push(`${f}:${i + 1} ${l.trim().slice(0, 80)}`);
    });
  }
  assert.deepStrictEqual(bad, [], 'dead viewer spelling still branched on:\n    ' + bad.join('\n    '));
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(__dirname, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

console.log(failures === 0 ? '\nPASS — one roster, one viewer name' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
