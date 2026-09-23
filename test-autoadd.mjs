// Self-check for the customer-order accessory MODEL (mirrors accessoryPlan in js/src/07-orders.js).
// Run: node test-autoadd.mjs
// Model: Landis meters need no controller. Every non-Landis meter → 1 controller. Every controller
// (added + explicit) → 1 antenna + 1 power-supply.
// round 5 Phase 1 (עידן 23.9): SIM is retired — no longer part of this model (was: Landis meters →
// 1 SIM each direct, every controller → +1 SIM too).
import assert from 'node:assert';

function accessoryPlan(items) {
  const sumQty = (pred) => items.filter(it => pred(it.name)).reduce((s, it) => s + (parseInt(it.qty) || 0), 0);
  const isLandis = n => /landis|e360|e570/i.test(n);
  const isMeter = n => isLandis(n) || /satec|em133|pm135|carlo|e341/i.test(n);
  const isCtrl = n => /robustel|pusr|purs/i.test(n);
  const landisQty = sumQty(isLandis);
  const nonLandisMeterQty = sumQty(n => isMeter(n) && !isLandis(n));
  const explicitControllers = sumQty(isCtrl);
  const controllersToAdd = nonLandisMeterQty;
  const totalControllers = explicitControllers + controllersToAdd;
  return {
    landisQty, nonLandisMeterQty, controllersToAdd, totalControllers,
    antennaQty: totalControllers, psQty: totalControllers,
  };
}

function check(label, items, exp) {
  const p = accessoryPlan(items);
  for (const k of Object.keys(exp)) assert.equal(p[k], exp[k], `${label}: ${k} expected ${exp[k]}, got ${p[k]}`);
  assert.ok(!('simQty' in p), `${label}: SIM is retired — accessoryPlan must not return simQty`);
}

// A — all Landis: no controller, no accessories.
check('A', [{ name: 'Landis+Gyr E360PP', qty: 3 }, { name: 'Landis+Gyr E360CT', qty: 5 }],
  { landisQty: 8, totalControllers: 0, antennaQty: 0, psQty: 0 });
// B — 10 explicit PUSR (for ASIC, off-order) + 4 Satec → +4 controllers → 14 ctrl → 14 antenna/PS.
check('B', [{ name: 'PUSR Controller', qty: 10 }, { name: 'Satec EM133', qty: 4 }],
  { controllersToAdd: 4, totalControllers: 14, antennaQty: 14, psQty: 14 });
// C — 2 Satec, no explicit controller (new flow) → 2 controllers → 2 of each.
check('C', [{ name: 'Satec PM135', qty: 2 }],
  { controllersToAdd: 2, totalControllers: 2, antennaQty: 2, psQty: 2 });
// D — Landis E570 needs no controller.
check('D', [{ name: 'Landis+Gyr E570', qty: 5 }],
  { landisQty: 5, totalControllers: 0, antennaQty: 0 });
// E — physical משנ"ז is not a meter → no accessories.
check('E', [{ name: 'משנ"ז 400', qty: 5 }],
  { totalControllers: 0, antennaQty: 0 });
// F — Carlo (non-Landis) needs a controller each + 2 EM133 → 7 controllers → 7 antenna/PS.
check('F', [{ name: 'Carlo Gavazzi E341', qty: 5 }, { name: 'Satec EM133', qty: 2 }],
  { controllersToAdd: 7, totalControllers: 7, antennaQty: 7, psQty: 7 });
// G — full mixed order: 5 Landis + 2 EM133 + 1 physical CT + 5 Carlo.
check('G', [{ name: 'Landis+Gyr E360PP', qty: 5 }, { name: 'Satec EM133', qty: 2 }, { name: 'משנ"ז 400', qty: 1 }, { name: 'Carlo Gavazzi E341', qty: 5 }],
  { landisQty: 5, nonLandisMeterQty: 7, totalControllers: 7, antennaQty: 7, psQty: 7 });

console.log('✅ all accessoryPlan cases pass (round 5 Phase 1 model: no SIM, Landis→no controller, non-Landis→controller)');
