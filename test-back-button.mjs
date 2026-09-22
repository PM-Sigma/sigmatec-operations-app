// The phone's Back button (round 2, Package B items 1–3).
//   node test-back-button.mjs
//
// One pure rule owns every Back: `backAction({ openDialog, dirty, historyDepth, page })` in
// js/src/00-guard.js. It is lifted out of the source and run here, so the four answers are
// pinned without a browser:
//
//   'ask-unsaved'   dialog open and holding typed input  → the §7p question
//   'close-dialog'  dialog open, untouched               → closes, page stays (round 1)
//   'prev-page'     nothing open, app entries left       → previous page (round 1)
//   'confirm-exit'  nothing open, pop landed on sentinel → "לצאת מהאפליקציה?" (item 1)
//
// Beyond the rule, three source contracts are pinned, because the rule is only as good as
// the history it reads: the boot seeds a SENTINEL entry under 🏘 קיבוצים, the popstate owner
// re-arms an entry on every non-navigating answer, and [יציאה] goes back TWICE.
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

// ───────────────────── lift the rule out of js/src/00-guard.js ─────────────────────
const guardSrc = read(path.join('js', 'src', '00-guard.js'));

function liftFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + '() not found in js/src/00-guard.js');
  // Brace-match from the first "{" after the signature — no regex can do this correctly.
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// eslint-disable-next-line no-new-func
const backAction = new Function(liftFn(guardSrc, 'backAction') + '; return backAction;')();

const back = o => backAction(o);

console.log('\n── the rule: backAction(state)');

check('dirty dialog → the §7p question, never a navigation', () => {
  assert.strictEqual(back({ openDialog: true, dirty: true, historyDepth: 1, page: 'kibbutz' }), 'ask-unsaved');
  // Depth is irrelevant while something dirty is open — even at the sentinel.
  assert.strictEqual(back({ openDialog: true, dirty: true, historyDepth: 0, page: 'kibbutz' }), 'ask-unsaved');
});

check('untouched dialog → closes, round-1 behaviour', () => {
  assert.strictEqual(back({ openDialog: true, dirty: false, historyDepth: 1, page: 'kibbutz' }), 'close-dialog');
  assert.strictEqual(back({ openDialog: true, dirty: false, historyDepth: 0, page: 'inventory' }), 'close-dialog');
});

check('inner page, nothing open → the previous page', () => {
  assert.strictEqual(back({ openDialog: false, dirty: false, historyDepth: 1, page: 'inventory' }), 'prev-page');
  assert.strictEqual(back({ openDialog: false, dirty: false, historyDepth: 3, page: 'burns' }), 'prev-page');
});

check('the sentinel pop → "לצאת מהאפליקציה?", not a silent exit (item 1)', () => {
  assert.strictEqual(back({ openDialog: false, dirty: false, historyDepth: 0, page: 'kibbutz' }), 'confirm-exit');
});

check('a missing historyDepth is treated as the sentinel, never as an exit', () => {
  // Defensive: an unknown state object must still land on the question, not outside the app.
  assert.strictEqual(back({}), 'confirm-exit');
  assert.strictEqual(back(), 'confirm-exit');
  assert.strictEqual(back(null), 'confirm-exit');
});

check('dirty without a dialog is not a thing — nothing open still navigates', () => {
  assert.strictEqual(back({ openDialog: false, dirty: true, historyDepth: 1 }), 'prev-page');
});

check('the answer is always one of the four', () => {
  const ALL = ['ask-unsaved', 'close-dialog', 'prev-page', 'confirm-exit'];
  for (const openDialog of [true, false]) {
    for (const dirty of [true, false]) {
      for (const historyDepth of [0, 1, 2]) {
        const a = back({ openDialog, dirty, historyDepth, page: 'kibbutz' });
        assert.ok(ALL.indexOf(a) !== -1, 'unexpected action ' + a);
      }
    }
  }
});

// ───────────────────── the history the rule reads ─────────────────────
console.log('\n── the source contracts behind it');

const initSrc = read(path.join('js', 'src', '02-init-attendance.js'));

check('boot seeds a sentinel UNDER 🏘 קיבוצים (replaceState + pushState)', () => {
  const i = initSrc.indexOf('function restorePage()');
  assert.ok(i !== -1, 'restorePage() is gone');
  const body = initSrc.slice(i, i + 700);
  assert.ok(/history\.replaceState\(\s*\{\s*sigmaExit:\s*1\s*\}/.test(body), 'the sentinel entry is not seeded');
  assert.ok(/history\.pushState\(\s*\{\s*sigmaPage:\s*'kibbutz'\s*\}/.test(body), 'קיבוצים is not pushed on top of it');
  assert.ok(body.indexOf('replaceState') < body.indexOf('pushState'), 'the sentinel must come FIRST');
});

check('the popstate owner reads the sentinel as depth 0', () => {
  assert.ok(/historyDepth:\s*st\.sigmaExit\s*\?\s*0\s*:\s*1/.test(guardSrc), 'sigmaExit is not mapped to depth 0');
});

check('every non-navigating answer re-arms a history entry', () => {
  const i = guardSrc.indexOf("window.addEventListener('popstate'");
  assert.ok(i !== -1, 'the popstate listener is gone');
  const body = guardSrc.slice(i);
  for (const act of ['ask-unsaved', 'close-dialog', 'confirm-exit']) {
    const j = body.indexOf("=== '" + act + "'");
    assert.ok(j !== -1, act + ' has no branch');
    assert.ok(body.slice(j, j + 400).indexOf('backRearm()') !== -1, act + ' does not re-arm the entry');
  }
  // …and 'prev-page' must NOT re-arm: that one really is a navigation.
  assert.ok(/showPage\(st\.sigmaPage \|\| 'kibbutz', \{ fromHistory: true \}\)/.test(body), 'prev-page does not navigate');
});

check('[יציאה] goes back twice — the re-pushed entry AND the sentinel', () => {
  const i = guardSrc.indexOf("'exit-leave'");
  assert.ok(i !== -1, 'the יציאה button is gone');
  assert.ok(guardSrc.slice(i, i + 400).indexOf('history.go(-2)') !== -1, 'יציאה does not go(-2)');
});

check('the exit question offers exactly [חזרה לדף הבית] and [יציאה]', () => {
  assert.ok(guardSrc.indexOf("EXIT_TITLE = 'לצאת מהאפליקציה?'") !== -1);
  assert.ok(guardSrc.indexOf("EXIT_HOME = 'חזרה לדף הבית'") !== -1);
  assert.ok(guardSrc.indexOf("EXIT_LEAVE = 'יציאה'") !== -1);
  assert.ok(guardSrc.indexOf("'exit-confirm'") !== -1, 'no data-testid on the dialog');
});

// ───────────────────── item 2: the two halves say the same thing ─────────────────────
console.log('\n── the §7p copy is one copy (legacy + React)');

const reactSrc = read(path.join('app', 'src', 'lib', 'useUnsavedGuard.tsx'));
const COPY = {
  UNSAVED_BODY: 'אפשר לשמור טיוטה, לצאת בלי לשמור, או להמשיך לערוך.',
  UNSAVED_SAVE: 'שמור טיוטה',
  UNSAVED_DISCARD: 'לצאת בלי לשמור',
  UNSAVED_KEEP: 'להמשיך',
};

check('both halves carry the same three answers', () => {
  for (const [k, v] of Object.entries(COPY)) {
    assert.ok(reactSrc.indexOf("export const " + k + " = '" + v + "'") !== -1, 'React copy differs for ' + k);
    assert.ok(guardSrc.indexOf('var ' + k + " = '" + v + "'") !== -1, 'legacy copy differs for ' + k);
  }
});

check('no " — " in the question (humanizer)', () => {
  for (const v of Object.values(COPY)) assert.ok(v.indexOf(' — ') === -1, 'em-dash in: ' + v);
});

// ───────────────────── item 3: a tap outside never navigates ─────────────────────
console.log('\n── item 3: tap outside');

check('the outside-tap path ends in modalDismiss, never in history', () => {
  // The delegated backdrop listener and the ✕ both go through modalDismiss(), which only
  // ever closes or asks. If either ever learned to touch `history`, this fails.
  const i = guardSrc.indexOf('function modalDismiss(');
  const body = guardSrc.slice(i, guardSrc.indexOf('window.modalDismiss'));
  assert.ok(!/history\./.test(body), 'modalDismiss touches history');
  const fc = guardSrc.indexOf('function modalForceClose(');
  assert.ok(!/history\./.test(guardSrc.slice(fc, guardSrc.indexOf('window.modalForceClose'))), 'modalForceClose touches history');
});

check('the React guard never navigates on an outside tap either', () => {
  assert.ok(!/history\.|location\s*=/.test(reactSrc), 'useUnsavedGuard touches history/location');
  // The outside tap is still prevented while dirty — that is what keeps the sheet open.
  assert.ok(/onPointerDownOutside: block/.test(reactSrc) && /onInteractOutside: block/.test(reactSrc));
});

console.log('');
if (failures) { console.log('FAILED ' + failures); process.exit(1); }
console.log('PASSED  back-button rule + history contracts');
