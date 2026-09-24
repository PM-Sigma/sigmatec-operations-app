// Role matrix golden for the ONE page gate (js/src/00-bridge.js `canShowPage`).
// Run: node test-can-show-page.mjs
//
// app/src/lib/canShowPage.ts only forwards to the bridge, so the permission RULE lives in the
// legacy bundle. This runner lifts the REAL functions out of the sources (never re-typed here):
// the bridge's canShowPage + canManageStaff, the login helpers (getCurrentUser / getRole /
// isIdan / isViewer / canSeeAttendance) and canSeeDevTasks, evaluates them together over a
// fake localStorage, and asserts the full identity × page matrix. The burns audience (round 5
// G-L4) is now INLINE in canShowPage's own 'burns' case, sourced from 00-bridge.js like every
// other page — no separate burns file to load any more.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = f => fs.readFileSync(path.join(root, 'js/src', f), 'utf8');

/** The full text of `function <name>(…) { … }` in `text`, by brace matching. */
function fnSource(text, name) {
  const at = text.search(new RegExp('function ' + name + '\\s*\\('));
  if (at < 0) throw new Error('function not found: ' + name);
  let i = text.indexOf('{', at), depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}
function lineMatching(text, re) {
  const m = text.split('\n').find(l => re.test(l));
  if (!m) throw new Error('line not found: ' + re);
  return m.trim();
}

const login = src('11-search-login.js');
const bridge = src('00-bridge.js');
const dev = src('18-dev-tasks.js');
const consts = src('00-consts.js');

const program = [
  "var USER_KEY = 'dashboard_user_v1';",
  lineMatching(login, /const ROLE_KEY\s*=/),
  lineMatching(login, /const ATT_PEOPLE\s*=/),
  fnSource(login, 'getCurrentUser'), fnSource(login, 'getRole'),
  fnSource(login, 'isIdan'), fnSource(login, 'isViewer'), fnSource(login, 'canSeeAttendance'),
  fnSource(bridge, 'canManageStaff'),
  fnSource(dev, 'canSeeDevTasks'),
  // the removal flag's REAL declaration (G-L4) — lifted from 00-consts.js, not retyped, so a
  // change to its default there is a change here too.
  lineMatching(consts, /window\.BURNS_PROJECT_ACTIVE\s*=/),
  // the bridge's private `call` helper, exactly as canShowPage uses it
  "var call = function (name, args, fallback) { var f = { canSeeAttendance: canSeeAttendance, canSeeDevTasks: canSeeDevTasks, isIdan: isIdan, getCurrentUser: getCurrentUser, isViewer: isViewer }[name]; return f ? f.apply(null, args || []) : fallback; };",
  fnSource(bridge, 'canShowPage'),
  'return canShowPage;',
].join('\n');

function gateFor(user, role, { burnsActive = true } = {}) {
  const store = new Map([['dashboard_user_v1', user], ['dashboard_role_v1', role]]);
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null) };
  const window = {};
  const make = new Function('localStorage', 'window', program);
  const gate = make(localStorage, window);
  if (!burnsActive) window.BURNS_PROJECT_ACTIVE = false;
  return gate;
}

const PAGES = ['kibbutz', 'calendar', 'inventory', 'attendance', 'dev', 'pushlog', 'burns', 'hours', 'ems', 'mytasks', 'staff'];
// 1 = may open, 0 = refused. Retired pages (ems / mytasks / staff) are refused for everyone.
const MATRIX = {
  //                 kib cal inv att dev push burn hrs ems my staff
  'עידן|idan':      [1,  1,  1,  1,  1,  1,   1,   1,  0,  0, 0],
  'עידן|team':      [1,  1,  1,  0,  0,  0,   1,   1,  0,  0, 0], // the name without the PIN is not the admin
  'עמיחי|team':     [1,  1,  1,  1,  1,  0,   1,   1,  0,  0, 0],
  'אביאם|team':     [1,  1,  1,  1,  0,  0,   1,   0,  0,  0, 0],
  'ניתאי|team':     [1,  1,  1,  1,  0,  0,   1,   0,  0,  0, 0],
  'מתניה|team':     [1,  1,  0,  0,  1,  0,   0,   1,  0,  0, 0],
  'אליה|team':      [1,  1,  1,  0,  1,  0,   0,   0,  0,  0, 0],
  'אבצן|team':      [1,  1,  1,  0,  0,  0,   0,   0,  0,  0, 0],
  'צופה|viewer':    [1,  1,  1,  1,  0,  0,   1,   1,  0,  0, 0], // reads reports; writes are refused elsewhere
  '|':              [1,  1,  1,  0,  0,  0,   0,   0,  0,  0, 0], // signed out
};

let failures = 0;
for (const [who, row] of Object.entries(MATRIX)) {
  const [user, role] = who.split('|');
  const gate = gateFor(user, role);
  PAGES.forEach((page, i) => {
    const got = gate(page) ? 1 : 0;
    if (got !== row[i]) { failures++; console.log(`  FAIL - ${who} × ${page}: expected ${row[i]}, got ${got}`); }
  });
}
console.log(`  ok - role matrix: ${Object.keys(MATRIX).length} identities × ${PAGES.length} pages`);

// The burns page closes for EVERYONE once the temporary project ends.
for (const who of Object.keys(MATRIX)) {
  const [user, role] = who.split('|');
  try { assert.strictEqual(gateFor(user, role, { burnsActive: false })('burns'), false); }
  catch { failures++; console.log(`  FAIL - burns must close for ${who} when the project ends`); }
}
console.log('  ok - burns closed for all when BURNS_PROJECT_ACTIVE = false');

// G-L4: the flag now lives in 00-consts.js, and the gate is read from 00-bridge.js alone — no
// separate burns file loaded by this runner or referenced by canShowPage any more.
try {
  assert.equal(gateFor('עידן', 'idan', { burnsActive: false })('burns'), false, 'flag off → nobody, now read from 00-consts');
  console.log('  ok - burns flag off refuses עידן too (00-consts, not the retiring file)');
} catch (e) { failures++; console.log(`  FAIL - ${e.message}`); }
// A SECOND `window.BURNS_PROJECT_ACTIVE = true` in the retiring file would silently override
// an operator's `false` in 00-consts.js on every load — the ONE-flag promise broken by exactly
// the file this task moved the declaration off of. This is the check that would have caught it.
try {
  const burnsCode = src('24-meter-burns.js').split('\n').filter(l => !l.trim().startsWith('//'));
  assert.ok(!burnsCode.some(l => /window\.BURNS_PROJECT_ACTIVE\s*=\s*(true|false)\s*;/.test(l)),
    '24-meter-burns.js must not redeclare the flag — 00-consts.js is the only place it is set');
  console.log('  ok - the removal flag is declared in exactly one place (00-consts.js)');
} catch (e) { failures++; console.log(`  FAIL - ${e.message}`); }

// An unknown page is never open.
try { assert.strictEqual(gateFor('עידן', 'idan')('nope'), false); console.log('  ok - unknown page refused'); }
catch { failures++; console.log('  FAIL - unknown page must be refused'); }

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall can-show-page checks passed');
