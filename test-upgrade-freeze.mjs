// Upgrade freeze (round 5, Phase 0) — the LEGACY golden.
//   node test-upgrade-freeze.mjs
//
// upgradeFreezeDecision (js/src/00-consts.js) is the pure core: name/viewer/cert/mock →
// frozen or not, no DOM, no localStorage. The DOM half (upgradeFrozen/showUpgradeFreeze in
// js/src/15-login-gate.js, wired into onAuthed, reconcileIdentity and the boot branch) is
// covered by qa/playwright/tests/upgrade-freeze.spec.ts instead — it needs a real gate.
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

const src = read('js/src/00-consts.js');
// eslint-disable-next-line no-new-func
const fn = new Function('window', '(function(){' + src + '})();');
const window_ = {};
fn(window_);
const decide = window_.upgradeFreezeDecision;

console.log('\n── upgradeFreezeDecision: name/viewer/cert/mock → frozen or not');

check('is a real function, attached to window (the DOM half reads it off window)', () => {
  assert.strictEqual(typeof decide, 'function');
});

const ALLOW = ['עידן', 'עמיחי'];

const rows = [
  // [label, name, isViewer, isCertView, isMock, expectFrozen]
  ['עידן, plain session → allowed, not frozen', 'עידן', false, false, false, false],
  ['עמיחי, plain session → allowed, not frozen', 'עמיחי', false, false, false, false],
  ['אביאם, plain session → not on the allow-list, frozen', 'אביאם', false, false, false, true],
  ['ניתאי, plain session → frozen', 'ניתאי', false, false, false, true],
  ['viewer PIN, even with no name → always frozen', '', true, false, false, true],
  ['viewer PIN, even if the stored name happened to collide with an allowed name → still frozen (viewer wins)', 'עידן', true, false, false, true],
  ['cert link → exempt regardless of who is holding the phone', 'אביאם', false, true, false, false],
  ['cert link, viewer session → still exempt (cert wins over viewer)', '', true, true, false, false],
  ['mock mode (?sb=0) → exempt so tests keep running', 'אביאם', false, false, true, false],
  ['mock mode, viewer → still exempt (mock wins over viewer)', '', true, false, true, false],
];

for (const [label, name, isViewer, isCertView, isMock, expectFrozen] of rows) {
  check(label, () => {
    assert.strictEqual(decide(name, isViewer, isCertView, isMock, ALLOW), expectFrozen);
  });
}

check('an empty allow-list freezes everyone who is not exempt', () => {
  assert.strictEqual(decide('עידן', false, false, false, []), true);
});

check('the one switch is here, on, and the allow-list is the two named people (file 00 — readable before file 15 runs)', () => {
  assert.match(src, /const UPGRADE_FREEZE = true;/);
  assert.match(src, /const UPGRADE_ALLOW = \['עידן', 'עמיחי'\];/);
});

console.log('\n' + (failures ? failures + ' FAILURES' : 'all green') + '\n');
process.exit(failures ? 1 : 0);
