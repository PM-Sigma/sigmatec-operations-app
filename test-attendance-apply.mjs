// test-attendance-apply.mjs: round 5 V-L5 — attApplyOps (js/src/04-attendance-daily.js) is the one
// legacy writer for the attendance plan a visit save produces; W.attendance and the loader (01-data.js)
// carry `source`. Extract-eval of the real functions (test-visit-writevisit.mjs style).
//   node test-attendance-apply.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ── W.attendance + the loader (01-data.js) ──────────────────────────────────────────────
const dataSrc = read('js/src/01-data.js');
const wAtt = dataSrc.match(/attendance: (b => \{[\s\S]*?id\]; \}),/);
check('W.attendance extracted from source', () => assert.ok(wAtt, 'regex did not match'));
if (wAtt) {
  const built = new Function('genId', 'nowISO', 'return (' + wAtt[1] + ');')(p => p + '_gen', () => 'NOW_ISO');
  check('A4 W.attendance without source sends no source key (manual rows keep the DB default)', () => {
    const [table, key, row] = built({ person: 'אביאם', dayType: 'field', date: 'D' });
    assert.equal(table, 'attendance');
    assert.equal(key, 'id');
    assert.ok(!('source' in row), 'source key present when it should be omitted');
  });
  check('A4b W.attendance WITH a source sends it', () => {
    const [, , row] = built({ person: 'אביאם', dayType: 'field', date: 'D', source: 'visit_auto' });
    assert.equal(row.source, 'visit_auto');
  });
}

const loaderLine = dataSrc.match(/attendance: attendance\.map\(a => \(\{[^}]*\}\)\),/);
check('the loader\'s attendance mapping extracted from source', () => assert.ok(loaderLine, 'regex did not match'));
if (loaderLine) {
  const mapFn = new Function('attendance', 'return (' + loaderLine[0].replace(/^attendance: /, '').replace(/,\s*$/, '') + ');');
  check('A5 the loader maps `source` (visit_auto) and defaults a missing one to manual', () => {
    const out = mapFn([
      { id: '1', date: 'D', person: 'P', day_type: 'field', source: 'visit_auto' },
      { id: '2', date: 'D', person: 'P', day_type: 'field' },
    ]);
    assert.equal(out[0].source, 'visit_auto');
    assert.equal(out[1].source, 'manual');
  });
}

// ── attApplyOps (04-attendance-daily.js) ────────────────────────────────────────────────
const dailySrc = read('js/src/04-attendance-daily.js');
const opsFn = dailySrc.match(/function attApplyOps\(ops\) \{[\s\S]*?\n  \}\n  window\.attApplyOps = attApplyOps;/);
check('attApplyOps extracted from source', () => assert.ok(opsFn, 'regex did not match'));
if (opsFn) {
  const body = opsFn[0].replace(/\n  window\.attApplyOps = attApplyOps;$/, '');
  let posts = [], emits = [];
  const win = { SHEET_DATA: { attendance: [] }, sigmaEmit: (name, detail) => emits.push({ name, detail }) };
  const fetch_ = (u, o) => { posts.push(JSON.parse(o.body)); return Promise.resolve({ json: async () => ({ ok: true }) }); };
  const attApplyOps = new Function('window', 'fetch', 'WRITE_ROUTER_URL', body + '\nreturn attApplyOps;')(win, fetch_, 'http://x');

  await attApplyOps([{ kind: 'upsert', row: { id: 'att_v_20260910_אביאם', person: 'אביאם', dayType: 'field', date: 'D', source: 'visit_auto' } }]);
  check('A1 an upsert op posts {type:"attendance", id, source}', () => {
    assert.deepEqual(posts[0], { type: 'attendance', id: 'att_v_20260910_אביאם', person: 'אביאם', dayType: 'field', note: '', date: 'D', source: 'visit_auto' });
    assert.equal(win.SHEET_DATA.attendance.length, 1);
  });

  posts = [];
  await attApplyOps([{ kind: 'upsert', row: { id: 'att_v_20260910_אביאם', person: 'אביאם', dayType: 'field', date: 'D', source: 'visit_auto' } }]);
  check('A2 the same op posted twice leaves ONE row in SHEET_DATA.attendance', () => assert.equal(win.SHEET_DATA.attendance.length, 1));

  posts = [];
  await attApplyOps([{ kind: 'delete', id: 'att_v_20260910_אביאם' }]);
  check('A3 a delete op posts {type:"attendanceDelete", id} and removes the row', () => {
    assert.deepEqual(posts[0], { type: 'attendanceDelete', id: 'att_v_20260910_אביאם' });
    assert.equal(win.SHEET_DATA.attendance.length, 0);
  });

  emits = [];
  await attApplyOps([]);
  check('A6a an empty ops list emits nothing', () => assert.equal(emits.length, 0));

  emits = [];
  await attApplyOps([{ kind: 'upsert', row: { id: 'x', person: 'p', dayType: 'field', date: 'D' } }]);
  check('A6 one attendance-saved event per attApplyOps call', () =>
    assert.equal(emits.filter(e => e.name === 'attendance-saved').length, 1));
}

console.log(failures === 0 ? '\nPASS — all attendance-apply checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
