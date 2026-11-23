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
  const upserts = [], deletes = []; let existing = [];
  const wv = new Function('genId', 'nowISO', 'sbUpsert', 'sbInsert', 'sbGet', 'sbDelete', m[0] + '\nreturn writeVisit;')(
    p => p + '_gen', () => 'NOW_ISO', async (t, k, row) => { if (t === 'returns') upserts.push(row); else captured = row; }, async () => {},
    async () => existing, async path => { deletes.push(path); }
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
    // Defect 4: returns are deterministic `<visit>|<i>` upserts; an edit diffs the list.
    await wv({ id: 'v9', isNew: true, kibbutz: 'K', returnedItems: [{ name: 'A', qty: 1, note: 'שבור' }, { name: 'B', qty: 2 }] });
    check('R1 new visit: returns upsert as <visit>|<i> (retry-safe), the note lands in reason', () => {
      assert.deepEqual(upserts.map(r => r.id), ['v9|0', 'v9|1']);
      assert.equal(upserts[0].reason, 'שבור'); assert.equal(upserts[0].status, 'open');
    });
    upserts.length = 0;
    existing = [{ id: 'v9|0', product: 'A', qty: 1, status: 'restocked' }, { id: 'v9|1', product: 'B', qty: 2, status: 'open' }, { id: 'ret_old', product: 'C', qty: 1, status: 'open' }];
    await wv({ id: 'v9', kibbutz: 'K', returnedItems: [{ name: 'A', qty: 3 }] });
    check('R2 edit: an existing row keeps its status, surplus/legacy open rows are deleted', () => {
      assert.deepEqual(upserts.map(r => r.id), ['v9|0']);
      assert.ok(!('status' in upserts[0]), 'a worked row must not be reset to open');
      assert.equal(upserts[0].qty, 3);
      assert.equal(deletes.length, 1);
      assert.ok(deletes[0].includes('v9|1') && deletes[0].includes('ret_old') && !deletes[0].includes('v9|0'), deletes[0]);
    });
  })();
}

console.log(failures === 0 ? '\nPASS — all writeVisit checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
