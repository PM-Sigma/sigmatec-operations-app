// Self-check for the customer-order accessories rule (mirrors applyCustomerAutoAdd in js/src/07-orders.js).
// Run: node test-autoadd.mjs   — asserts the comm-point SIM + per-controller antenna arithmetic.
// Uses the REAL catalog names so it also guards the PUSR/Partner spelling mismatch.
import assert from 'node:assert';

const CATALOG = [
  'מונה EM133','מונה PM135','מונה E360PP','מונה E360SP','מונה E360CT','מונה E570',
  'מונה Carlo Gavachi E341',
  'בקר Robustel','בקר PUSR',
  'סים Partner','סים Cellcom','כרטיס תקשורת צרוב','אנטנה',
  'משנ"ז 250','משנ"ז 400',
];

function applyCustomerAutoAdd(items, catalog) {
  const sumQty = (pred) => items.filter(it => pred(it.name)).reduce((s, it) => s + (parseInt(it.qty) || 0), 0);
  const isCtrl = (n) => /robustel|pusr|purs/i.test(n);
  const addOrBump = (matchFn, need, finder) => {
    if (need <= 0) return;
    const ex = items.find(it => matchFn(it.name));
    if (ex) { if (ex.qty < need) ex.qty = need; }
    else { const p = catalog.find(finder); if (p) items.push({ name: p, qty: need }); }
  };
  const satecQty = sumQty(n => /em133|pm135/i.test(n));
  addOrBump(n => /robustel/i.test(n), satecQty, n => /robustel/i.test(n));
  const directQty = sumQty(n => /e360|carlo|e341/i.test(n));
  const ctrlQty = sumQty(isCtrl);
  addOrBump(n => /סים|\bsim\b/i.test(n), directQty + ctrlQty, n => /סים|sim/i.test(n) && !/cellcom/i.test(n));
  addOrBump(n => /אנטנה|antenna/i.test(n), ctrlQty, n => /אנטנה|antenna/i.test(n));
  return items;
}

const q = (items, re) => items.filter(it => re.test(it.name)).reduce((s, it) => s + it.qty, 0);

// Case A — Landis only: 3 E360PP + 5 E360CT → 8 SIM, 0 controllers → 0 antenna.
{
  const r = applyCustomerAutoAdd([{ name: 'מונה E360PP', qty: 3 }, { name: 'מונה E360CT', qty: 5 }], CATALOG);
  assert.equal(q(r, /סים/), 8, 'A: 8 SIMs for 8 Landis meters');
  assert.equal(q(r, /אנטנה/), 0, 'A: no antenna (no controllers)');
  assert.equal(q(r, /robustel/i), 0, 'A: no robustel');
}
// Case B — 10 PUSR (ASIC) + 4 EM133 (SATEC): +4 Robustel → 14 controllers → 14 SIM, 14 antenna.
{
  const r = applyCustomerAutoAdd([{ name: 'בקר PUSR', qty: 10 }, { name: 'מונה EM133', qty: 4 }], CATALOG);
  assert.equal(q(r, /robustel/i), 4, 'B: 4 robustel for 4 SATEC');
  assert.equal(q(r, /סים/), 14, 'B: 14 SIMs (10 PUSR + 4 robustel)');
  assert.equal(q(r, /אנטנה/), 14, 'B: 14 antennas (per controller)');
}
// Case C — user pre-listed accessories: 2 PM135 + 2 Robustel + 2 SIM → no double-count.
{
  const r = applyCustomerAutoAdd([{ name: 'מונה PM135', qty: 2 }, { name: 'בקר Robustel', qty: 2 }, { name: 'סים Partner', qty: 2 }], CATALOG);
  assert.equal(q(r, /robustel/i), 2, 'C: stays 2 robustel');
  assert.equal(q(r, /סים/), 2, 'C: stays 2 SIM');
  assert.equal(q(r, /אנטנה/), 2, 'C: 2 antennas added');
}
// Case D — standalone Robustel (more than SATEC meters) still each gets SIM + antenna.
{
  const r = applyCustomerAutoAdd([{ name: 'בקר Robustel', qty: 5 }], CATALOG);
  assert.equal(q(r, /robustel/i), 5, 'D: 5 robustel kept');
  assert.equal(q(r, /סים/), 5, 'D: 5 SIMs');
  assert.equal(q(r, /אנטנה/), 5, 'D: 5 antennas');
}
// Case E — physical משנ"ז (no "מונה"): electrical gear, no accessories.
{
  const r = applyCustomerAutoAdd([{ name: 'משנ"ז 250', qty: 5 }], CATALOG);
  assert.equal(q(r, /סים/), 0, 'E: no SIM');
  assert.equal(q(r, /אנטנה/), 0, 'E: no antenna');
}

console.log('✅ all auto-add cases pass');
