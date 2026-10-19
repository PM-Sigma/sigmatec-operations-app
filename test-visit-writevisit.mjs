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
  let captured = null, taken = {}, gets = 0;
  const wv = new Function('genId', 'nowISO', 'sbUpsert', 'sbInsert', 'sbGet', m[0] + '\nreturn writeVisit;')(
    p => p + '_gen', () => 'NOW_ISO',
    async (t, k, row) => { captured = row; },
    async (t, rows) => { if (taken[rows[0].id]) throw new Error('supabase insert visits 409 duplicate key 23505'); captured = rows[0]; },
    async () => { gets++; return [taken[Object.keys(taken)[0]]]; }
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
    // 19.10 overwrite guard: a NEW visit never overwrites a filed one.
    taken = { v_old: { kibbutz: 'גבת', visitor: 'ניתאי', date: '2026-09-17T09:00:00.000Z' } };
    const r5 = await wv({ id: 'v_old', isNew: true, kibbutz: 'דפנה', visitor: 'ניתאי', date: '2026-09-23T09:00:00.000Z' });
    check('C5 isNew on a taken id of ANOTHER report → filed under a fresh id', () => {
      assert.equal(r5.id, 'v_gen'); assert.equal(captured.id, 'v_gen'); assert.equal(captured.kibbutz, 'דפנה');
    });
    const r6 = await wv({ id: 'v_old', isNew: true, kibbutz: 'גבת', visitor: 'ניתאי', date: '2026-09-17T09:00:00.000Z' });
    check('C6 isNew retry of the SAME report → upsert on its own id, no duplicate', () => {
      assert.equal(r6.id, 'v_old'); assert.equal(captured.id, 'v_old'); assert.ok(!('created_at' in captured));
    });
  })();
}

console.log(failures === 0 ? '\nPASS — all writeVisit checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
