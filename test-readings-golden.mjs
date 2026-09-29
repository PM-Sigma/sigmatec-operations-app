// test-readings-golden.mjs — LOCAL-ONLY golden: logic.js vs the reference files produced by the Python script.
// Real customer data lives outside the repo (Kibbutzim\חולדה\שאיבה יומית\fixtures); without it this test skips.
// Run: node test-readings-golden.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { buildRun, applyEmsValidation, expectedFrom } from './supabase/functions/readings-fetch/logic.js';

const DIR = 'C:\\Users\\idann\\Projects\\Kibbutzim\\חולדה\\שאיבה יומית\\fixtures';
if (!fs.existsSync(DIR)) { console.log('skip (no local fixtures)'); process.exit(0); }
const rj = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

const DATES = ['2026-08-31', '2026-09-27', '2026-09-28'];
const table = [];
const fails = [];
const note = (date, msg) => console.log(`NOTE  ${date}  ${msg}`);
const check = (date, name, ok, detail = '') => { table.push([date, name, ok ? 'PASS' : 'FAIL', detail]); if (!ok) fails.push(`${date} ${name} ${detail}`); };

const same = (a, b) => (a == null && b == null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9) || String(a) === String(b);
const keyed = (rows) => new Map(rows.map((r) => [String(r[0]), r]));
// laterOk (28.9 only): the local raw fixture was captured AFTER the reference file was built, so SpeedNet's rolling
// "D+1 ~00:30" export returned a newer reading (00:38 vs ~00:27) for 138 meters. A value that is >= the reference
// (a later reading of the same meter, same null pattern) is counted in `later.n` instead of being a diff.
const later = { n: 0 };
function diffUpload(ours, ref, laterOk = false) {
  const A = keyed(ours), B = keyed(ref), out = [];
  for (const [s, r] of A) {
    if (!B.has(s)) { out.push('extra in ours: ' + s); continue; }
    const q = B.get(s);
    let newer = false;
    for (let i = 0; i < 12; i++) {
      if (same(r[i], q[i])) continue;
      if (laterOk && i >= 4 && i <= 7 && typeof r[i] === 'number' && typeof q[i] === 'number' && r[i] > q[i]) { newer = true; continue; }
      out.push(`${s} col${i}: ours=${r[i]} ref=${q[i]}`);
    }
    if (newer) later.n++;
  }
  for (const s of B.keys()) if (!A.has(s)) out.push('missing in ours: ' + s);
  return out;
}

const history = [];
const seenRuns = [];
const runs = {};
for (const date of DATES) {
  const raw = rj(`raw-${date}.json`).raw;
  const ref = rj(`ref-${date}.json`);
  const sources = [
    { name: 'SpeedNet', ok: true, rows: raw.speednet },
    { name: 'DataSense', ok: true, rows: raw.datasense.flat() },
  ];
  const expected = expectedFrom(seenRuns);
  const run = buildRun({ day: date, sources, history: [...history], expected });
  runs[date] = run;
  seenRuns.push(Object.fromEntries(sources.map((s) => [s.name, s.rows.map((r) => r.meter)])));
  history.push({ date, values: run.snapshot });

  const refRows = ref.upload.slice(1);
  const refBlocked = ref.exceptions.slice(1).filter((r) => r[5] === 'חוסם');
  const blockedMeters = [...new Set(refBlocked.map((r) => String(r[1])))].sort();
  const ourBlocked = [...new Set(run.exceptions.filter((e) => e[5] === 'חוסם').map((e) => String(e[1])))].sort();

  if (date === '2026-08-31') {
    check(date, 'upload count 250', run.upload.length === 250, String(run.upload.length));
    check(date, 'blocked meters == reference (3)', JSON.stringify(ourBlocked) === JSON.stringify(blockedMeters) && ourBlocked.length === 3,
      ourBlocked.join(','));
    const d = diffUpload(run.upload, refRows);
    check(date, 'upload rows == reference cell by cell', d.length === 0, d.slice(0, 5).join('; '));
  } else {
    check(date, 'basic run upload count 250 (incl. 1715447)', run.upload.length === 250, String(run.upload.length));
    const late = date === '2026-09-28';
    const d0 = diffUpload(run.upload, refRows, late);
    check(date, 'basic run differs from reference ONLY by 1715447', d0.length === 1 && d0[0] === 'extra in ours: 1715447', d0.slice(0, 5).join('; '));
    const idx = run.upload.findIndex((r) => r[0] === '1715447');
    const ems = applyEmsValidation(run, [{ rowIndex: idx, valid: false, errors: ['UPLOAD_READINGS.ERRORS.FT_DECREASED'], warnings: [] }]);
    check(date, 'after EMS FT_DECREASED: 249 rows', ems.upload.length === 249, String(ems.upload.length));
    later.n = 0;
    const d = diffUpload(ems.upload, refRows, late);
    check(date, 'after EMS: upload == reference cell by cell' + (late ? ' (later-reading tolerance)' : ''), d.length === 0, d.slice(0, 5).join('; '));
    if (late) note(date, `${later.n} meters carry a LATER SpeedNet reading (00:38) than the reference (~00:27); same serials/null pattern`);
    const ourB = [...new Set(ems.exceptions.filter((e) => e[5] === 'חוסם').map((e) => String(e[1])))].sort();
    check(date, 'after EMS: blocked meters == reference', JSON.stringify(ourB) === JSON.stringify(blockedMeters), `${ourB.join(',')} vs ${blockedMeters.join(',')}`);
  }
  // spec §11 #5 samples, when present in this day's data
  const U = keyed(run.upload);
  const samples = [
    ['1503007 full tariffs', U.get('1503007'), (r) => r && r.slice(4, 8).every((v) => v != null)],
    ['7010384 no f2', U.get('7010384'), (r) => r && r[4] != null && r[5] != null && r[6] == null && r[7] != null],
    ['108324 ft only', U.get('108324'), (r) => r && r[4] != null && r.slice(5, 8).every((v) => v == null)],
    ['2859 ft only', U.get('2859'), (r) => r && r[4] != null && r.slice(5, 8).every((v) => v == null)],
    ['1502949 ft only', U.get('1502949'), (r) => r && r[4] != null && r.slice(5, 8).every((v) => v == null)],
  ];
  for (const [n, row, fn] of samples) check(date, 'sample ' + n, fn(row), row ? JSON.stringify(row.slice(4, 8)) : 'absent');
}

const w = Math.max(...table.map((r) => r[1].length));
for (const [d, n, st, det] of table) console.log(`${st}  ${d}  ${n.padEnd(w)}  ${st === 'FAIL' ? det : ''}`);
console.log(fails.length ? `\nGOLDEN FAIL (${fails.length})` : `\nreadings golden OK (${table.length} checks)`);
process.exit(fails.length ? 1 : 0);
