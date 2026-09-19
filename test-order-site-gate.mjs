// Self-check: customer-order approval is blocked when the kibbutz has no EMS site (unless drop-ship).
// ponytail: source-contract test — a full behavioral harness for approveCustomerOrder needs ~15 injected
// deps; the contract check + the Task-9 manual smoke cover this path proportionally. Upgrade if it regresses.
// Run: node test-order-site-gate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/07-orders.js'), 'utf8');

let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };
const guardIdx = src.indexOf('kibbutzHasSite(kibbutz)');
const enqueueIdx = src.indexOf("kind: 'createTask'");
t('approveCustomerOrder references kibbutzHasSite', guardIdx !== -1);
t('the site gate precedes the createTask enqueue', guardIdx !== -1 && enqueueIdx !== -1 && guardIdx < enqueueIdx);
t('drop-ship path is exempt (isDirectSupply checked in the guard)',
  /isDirectSupply\(o\)[\s\S]{0,120}kibbutzHasSite\(kibbutz\)/.test(src));
console.log(failures ? `\n${failures} FAILED` : '\norder-gate checks passed');
process.exit(failures ? 1 : 0);
