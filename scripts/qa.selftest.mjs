// Self-test for the QA RUNNER's own judgement — `node scripts/qa.selftest.mjs`.
//
// A gate that cannot fail is not a gate, and this one had two real ways of passing without
// having scanned anything (task 22b): semgrep died writing its JSON and left a 0-byte file that
// read as "0 findings, PASS", and a minified js/app.js quietly stopped producing findings. Those
// paths cannot be reached from a normal run, so they are tested against fakes here.
//
// `npm run qa` runs this before it runs semgrep, and `scripts/test-all.mjs` picks it up too.
import assert from 'node:assert';
import { judgeSemgrep } from './qa-semgrep-judge.mjs';

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

const clean = { results: [], errors: [], paths: { scanned: ['js/src/01-data.js'] } };

check('a clean scan of at least one file passes', () => {
  const v = judgeSemgrep({ code: 0, parsed: clean });
  assert.equal(v.status, 'PASS');
  assert.match(v.summary, /0 blocking · 0 accepted/);
  assert.match(v.summary, /1 file\(s\) scanned/);
});

check('semgrep exit 1 (findings were reported) is not by itself a failure', () => {
  const parsed = {
    ...clean,
    results: [{ check_id: 'x.y.detected-jwt-token', path: 'js/src/01-data.js', start: { line: 3 }, extra: { severity: 'WARNING' } }],
  };
  const v = judgeSemgrep({ code: 1, parsed, excludeRules: ['detected-jwt-token'] });
  assert.equal(v.status, 'PASS');
  assert.match(v.summary, /0 blocking · 1 accepted/);
});

check('a finding outside the allowlist blocks', () => {
  const parsed = { ...clean, results: [{ check_id: 'a.b.dangerous-exec', path: 'js/src/x.js', start: { line: 9 }, extra: { severity: 'ERROR' } }] };
  const v = judgeSemgrep({ code: 1, parsed, excludeRules: ['detected-jwt-token'] });
  assert.equal(v.status, 'FAIL');
  assert.match(v.detail, /dangerous-exec/);
});

// ── the four ways this gate must refuse to pass ──────────────────────────────
check('unreadable / missing JSON fails (the 0-byte findings.json)', () => {
  for (const parsed of [null, undefined, {}, { results: 'nope' }, 'not an object']) {
    const v = judgeSemgrep({ code: 0, parsed, out: 'UnicodeEncodeError: charmap' });
    assert.equal(v.status, 'FAIL', 'parsed=' + JSON.stringify(parsed) + ' passed');
    assert.match(v.summary, /no readable JSON/);
  }
});

check('a non-zero, non-1 exit code fails even with a readable clean JSON', () => {
  for (const code of [2, 7, -1, 130]) {
    const v = judgeSemgrep({ code, parsed: clean, out: 'boom' });
    assert.equal(v.status, 'FAIL', 'exit ' + code + ' passed');
    assert.match(v.summary, new RegExp('exited ' + code));
  }
});

check('semgrep errors[] fail the gate and are printed', () => {
  const parsed = {
    results: [],
    errors: [
      { level: 'error', type: 'Syntax error', path: 'js/src/broken.js', long_msg: 'could not parse js/src/broken.js' },
      { level: 'error', message: 'rule blew up' },
    ],
    paths: { scanned: ['js/src/01-data.js'] },
  };
  const v = judgeSemgrep({ code: 0, parsed });
  assert.equal(v.status, 'FAIL');
  assert.match(v.summary, /2 scan error\(s\)/);
  assert.match(v.detail, /could not parse js\/src\/broken\.js/);
  assert.match(v.detail, /rule blew up/);
});

check('a scan that touched 0 files fails (a wrong include/exclude hides everything)', () => {
  const v = judgeSemgrep({ code: 0, parsed: { results: [], errors: [], paths: { scanned: [] } } });
  assert.equal(v.status, 'FAIL');
  assert.match(v.summary, /scanned 0 files/);
});

check('an old semgrep with no paths.scanned still judges the findings', () => {
  const v = judgeSemgrep({ code: 0, parsed: { results: [], errors: [] } });
  assert.equal(v.status, 'PASS');
  assert.doesNotMatch(v.summary, /file\(s\) scanned/);
});

console.log(failures === 0 ? '\nPASS — the QA runner fails when it should' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
