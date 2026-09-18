// The TS-side EMS_STATUS_LABEL/EMS_PRIORITY_LABEL mirror (app/src/lib/emsTasks.ts) must stay
// byte-identical to the real backend enum labels (js/src/14-calendar.js EMS_STATUS/EMS_PRIORITY)
// — that mirror is ONLY a fallback for when `sigma.emsLabels()` isn't reachable (plain vitest),
// so a drift there would silently render a wrong/missing label the moment the live bridge is
// down. Fix round 1 (task-3 review).
// Run: node test-ems-labels.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failures = 0, passes = 0;
function check(name, fn) {
  try { fn(); passes++; console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ── the real maps, straight off js/src/14-calendar.js (same sandbox technique as the other
// test-ems-*.mjs runners: bare top-level code, free identifiers injected as params) ──────────
function loadLegacyLabels() {
  const src = fs.readFileSync(path.join(__dirname, 'js/src/14-calendar.js'), 'utf8') +
    '\nwindow.EMS_STATUS = EMS_STATUS; window.EMS_PRIORITY = EMS_PRIORITY;';
  const win = {};
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  // 14-calendar.js's OTHER free identifiers (sibling EMS functions etc.) all live inside
  // function bodies that this sandbox never calls — only the top-level `const EMS_STATUS = …`
  // declarations actually execute, so nothing else needs to be supplied.
  const params = { window: win, document: doc, console, localStorage: { getItem: () => null, setItem() {} } };
  const names = Object.keys(params);
  // eslint-disable-next-line no-new-func
  new Function(...names, src)(...names.map(n => params[n]));
  return { status: win.EMS_STATUS, priority: win.EMS_PRIORITY };
}

// ── the TS mirror, extracted as a plain object literal (no TS compiler needed — the literal
// itself is plain JS; only the surrounding `: Record<string,string>` annotation is TS) ───────
function loadTsMirror() {
  const src = fs.readFileSync(path.join(__dirname, 'app/src/lib/emsTasks.ts'), 'utf8');
  const grab = name => {
    const m = new RegExp('export const ' + name + '[^=]*=\\s*(\\{[\\s\\S]*?\\n\\};)').exec(src);
    if (!m) throw new Error(name + ' not found in emsTasks.ts');
    // eslint-disable-next-line no-new-func
    return new Function('return ' + m[1].slice(0, -1))();
  };
  return { status: grab('EMS_STATUS_LABEL'), priority: grab('EMS_PRIORITY_LABEL') };
}

const legacy = loadLegacyLabels();
const mirror = loadTsMirror();

check('legacy EMS_STATUS / EMS_PRIORITY loaded from 14-calendar.js', () => {
  assert.ok(legacy.status && Object.keys(legacy.status).length > 0, 'EMS_STATUS missing/empty');
  assert.ok(legacy.priority && Object.keys(legacy.priority).length > 0, 'EMS_PRIORITY missing/empty');
});

check('EMS_STATUS_LABEL (emsTasks.ts) is byte-identical to EMS_STATUS (14-calendar.js)', () => {
  assert.deepStrictEqual(mirror.status, legacy.status);
});

check('EMS_PRIORITY_LABEL (emsTasks.ts) is byte-identical to EMS_PRIORITY (14-calendar.js)', () => {
  assert.deepStrictEqual(mirror.priority, legacy.priority);
});

console.log('');
if (failures) { console.log('FAIL — ' + failures + ' of ' + (failures + passes) + ' checks failed'); process.exit(1); }
console.log('PASS — all ' + passes + ' EMS-label checks passed');
