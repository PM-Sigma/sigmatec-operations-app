// Self-check for the customer-order accessories rule (mirrors applyCustomerAutoAdd in js/src/07-orders.js).
// Run: node test-autoadd.mjs   — asserts the comm-point SIM + per-controller antenna arithmetic.
// Uses the REAL catalog names (confirmed live 2026-06-24) so it guards the actual name matching.
import assert from 'node:assert';

const CATALOG = [
  'אנטנה', 'כרטיס תקשורת צרוב(E350)', 'משנ"ז 250', 'משנ"ז 400',
  'ספק כוח פס-דין', 'ספק כוח שקע', 'Cellcom Sim',
  'Landis+Gyr E360CT', 'Landis+Gyr E360PP', 'Landis+Gyr E360SP', 'Landis+Gyr E570',
  'Partner Sim', 'PUSR Controller', 'Robustel Controller', 'Satec EM133', 'Satec PM135',
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

// A — Landis only: 3 E360PP + 5 E360CT → 8 SIM (Partner, not Cellcom), 0 controllers → 0 antenna.
{
  const r = applyCustomerAutoAdd([{ name: 'Landis+Gyr E360PP', qty: 3 }, { name: 'Landis+Gyr E360CT', qty: 5 }], CATALOG);
  assert.equal(q(r, /Partner Sim/), 8, 'A: 8 Partner SIMs');
  assert.equal(q(r, /Cellcom/), 0, 'A: no Cellcom');
  assert.equal(q(r, /אנטנה/), 0, 'A: no antenna');
  assert.equal(q(r, /Robustel/), 0, 'A: no robustel');
}
// B — 10 PUSR + 4 Satec EM133: +4 Robustel → 14 controllers → 14 SIM, 14 antenna.
{
  const r = applyCustomerAutoAdd([{ name: 'PUSR Controller', qty: 10 }, { name: 'Satec EM133', qty: 4 }], CATALOG);
  assert.equal(q(r, /Robustel/), 4, 'B: 4 robustel for 4 SATEC');
  assert.equal(q(r, /Sim/i), 14, 'B: 14 SIMs (10 PUSR + 4 robustel)');
  assert.equal(q(r, /אנטנה/), 14, 'B: 14 antennas');
}
// C — user pre-listed accessories: 2 PM135 + 2 Robustel + 2 Partner Sim → no double-count.
{
  const r = applyCustomerAutoAdd([{ name: 'Satec PM135', qty: 2 }, { name: 'Robustel Controller', qty: 2 }, { name: 'Partner Sim', qty: 2 }], CATALOG);
  assert.equal(q(r, /Robustel/), 2, 'C: stays 2 robustel');
  assert.equal(q(r, /Sim/i), 2, 'C: stays 2 SIM');
  assert.equal(q(r, /אנטנה/), 2, 'C: 2 antennas added');
}
// D — standalone Robustel still each gets SIM + antenna.
{
  const r = applyCustomerAutoAdd([{ name: 'Robustel Controller', qty: 5 }], CATALOG);
  assert.equal(q(r, /Sim/i), 5, 'D: 5 SIMs');
  assert.equal(q(r, /אנטנה/), 5, 'D: 5 antennas');
}
// E — physical משנ"ז (no "מונה"): electrical gear, no accessories.
{
  const r = applyCustomerAutoAdd([{ name: 'משנ"ז 400', qty: 5 }], CATALOG);
  assert.equal(q(r, /Sim/i), 0, 'E: no SIM');
  assert.equal(q(r, /אנטנה/), 0, 'E: no antenna');
}
// F — Carlo (NOT in catalog) still counts as a direct-comm meter → gets a SIM each; +2 robustel for EM133.
{
  const r = applyCustomerAutoAdd([{ name: 'Carlo Gavazzi E341', qty: 5 }, { name: 'Satec EM133', qty: 2 }], CATALOG);
  assert.equal(q(r, /Robustel/), 2, 'F: 2 robustel for 2 EM133');
  assert.equal(q(r, /Sim/i), 7, 'F: 7 SIMs (5 Carlo + 2 robustel)');
  assert.equal(q(r, /אנטנה/), 2, 'F: 2 antennas (per controller)');
}

console.log('✅ all auto-add cases pass (real catalog names)');
