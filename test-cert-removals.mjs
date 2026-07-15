// Guard: delivery certs may be created ONLY from the visit flow or the certs registry page.
// The order-row and EMS-task-detail 🚚 triggers were removed (build 1.40) — these checks fail
// loudly if anyone re-wires them. The functions themselves stay exported (harmless, unit-tested).
// Run: node test-cert-removals.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

check('D1 orders table no longer wires certFromOrder', () =>
  assert.ok(!read('js/src/07-orders.js').includes('certFromOrder(')));
check('D2 EMS task detail no longer wires certFromEmsTask/certFromOrder', () => {
  const s = read('js/src/14-calendar.js');
  assert.ok(!s.includes('certFromEmsTask(') && !s.includes('certFromOrder('));
});
check('D3 index.html has no certFromOrder/certFromEmsTask onclick', () =>
  assert.ok(!/certFrom(Order|EmsTask)\s*\(/.test(read('index.html'))));
check('D4 the functions remain exported (unwired, still unit-tested)', () => {
  const s = read('js/src/20-delivery-cert.js');
  assert.ok(s.includes('window.certFromOrder = certFromOrder') && s.includes('window.certFromEmsTask = certFromEmsTask'));
});
check('D5 the standalone-issue button exists ONLY in the certs registry', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('invCertsNew'), 'registry + button missing');
  assert.equal((idx.match(/openDeliveryCert\(\{source:'manual'\}\)/g) || []).length, 1, 'exactly one standalone-issue entry point');
});

console.log(failures === 0 ? '\nPASS — all removal-guard checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
