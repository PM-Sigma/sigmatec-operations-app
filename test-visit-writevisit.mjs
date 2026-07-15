// Self-check for writeVisit's created_at stamping (js/src/01-data.js) — pre-minted visit ids
// (the cert-gate flow) must still stamp created_at on INSERT (isNew), while edits preserve it.
// Extract-eval of the REAL function, test-attendance-toggle style. Run: node test-visit-writevisit.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/01-data.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

const m = src.match(/async function writeVisit\(b\)[\s\S]*?\n    \}/);
check('writeVisit extracted from source', () => assert.ok(m, 'regex did not match writeVisit'));
check('created_at guard covers pre-minted ids (isNew)', () =>
  assert.ok(/if \(!b\.id \|\| b\.isNew\) row\.created_at/.test(m[0]), 'guard line changed — update gate flow'));

if (m) {
  let captured = null;
  const wv = new Function('genId', 'nowISO', 'sbUpsert', 'sbInsert', m[0] + '\nreturn writeVisit;')(
    p => p + '_gen', () => 'NOW_ISO', async (t, k, row) => { captured = row; }, async () => {}
  );
  await (async () => {
    await wv({ id: 'v_pre', isNew: true, kibbutz: 'K', products: [{ name: 'x', qty: 1 }] });
    check('C1 insert with pre-minted id + isNew stamps created_at', () => {
      assert.equal(captured.id, 'v_pre'); assert.equal(captured.created_at, 'NOW_ISO');
    });
    await wv({ kibbutz: 'K' });
    check('C2 insert without id generates one and stamps created_at', () => {
      assert.equal(captured.id, 'v_gen'); assert.ok('created_at' in captured);
    });
    await wv({ id: 'v_pre', kibbutz: 'K' });
    check('C3 edit (id, no isNew) does NOT touch created_at', () => assert.ok(!('created_at' in captured)));
    await wv({ id: 'v', isNew: true, createdAt: '2020-01-01' });
    check('C4 explicit createdAt honored on insert', () => assert.equal(captured.created_at, '2020-01-01'));
  })();
}

console.log(failures === 0 ? '\nPASS — all writeVisit checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
