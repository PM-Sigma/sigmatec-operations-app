// Self-check: customer-order approval is blocked when the kibbutz has no EMS site (unless drop-ship).
// js/src/07-orders.js is gone (U10) — the rule lives in app/src/lib/inventory.ts `approvalPlan`
// (ctx.hasSite), run by app/src/lib/inventoryApi.ts for the React order sheet.
// Run: node test-order-site-gate.mjs
import { loadSigmaInv } from './scripts/sigma-inv.mjs';

const SigmaInv = loadSigmaInv();
let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };

const baseOrder = { id: 'o1', orderType: 'customer', items: [{ name: 'מונה A', qty: 1 }], kibbutz: 'גבים' };
const ctx = (hasSite) => ({ me: 'עמיחי', movements: [], requirements: [], hasSite });

t('a customer order for a kibbutz with no EMS site is blocked before the createTask plan',
  (() => {
    const plan = SigmaInv.approvalPlan(baseOrder, ctx(() => false));
    return !!plan.error && !plan.ems;
  })());

t('the same order approves and plans an EMS createTask once the site exists',
  (() => {
    const plan = SigmaInv.approvalPlan(baseOrder, ctx(() => true));
    return !plan.error && plan.ems && plan.ems.kind === 'createTask';
  })());

t('drop-ship path is exempt from the site gate (isDirectSupply checked first)',
  (() => {
    const plan = SigmaInv.approvalPlan({ ...baseOrder, assignee: 'ספק ישיר' }, ctx(() => false));
    return !plan.error && plan.kind === 'dropship';
  })());

console.log(failures ? `\n${failures} FAILED` : '\norder-gate checks passed');
process.exit(failures ? 1 : 0);
