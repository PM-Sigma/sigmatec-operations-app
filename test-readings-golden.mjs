// test-readings-golden.mjs — LOCAL-ONLY golden: logic.js vs the reference files produced by the Python script.
// Real customer data lives outside the repo (Kibbutzim\חולדה\שאיבה יומית\fixtures); without it this test skips.
// Run: node test-readings-golden.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { buildRun } from './supabase/functions/readings-fetch/logic.js';

const DIR = 'C:\\Users\\idann\\Projects\\Kibbutzim\\חולדה\\שאיבה יומית\\fixtures';
if (!fs.existsSync(DIR)) { console.log('skip (no local fixtures)'); process.exit(0); }
const rj = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

const DATES = ['2026-08-31', '2026-09-27', '2026-09-28'];
const table = [];
const fails = [];
const check = (date, name, ok, detail = '') => { table.push([date, name, ok ? 'PASS' : 'FAIL', detail]); if (!ok) fails.push(`${date} ${name} ${detail}`); };

const same = (a, b) => (a == null && b == null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9) || String(a) === String(b);
const keyed = (rows) => new Map(rows.map((r) => [String(r[0]), r]));
// refNewerOk (28.9 only): the reference xlsx was rebuilt from a NEWER SpeedNet pull (rolling "D+1 ~00:30" export, 00:38)
// than the local raw fixture (~00:27), so 138 SpeedNet rows carry a later cumulative value in the reference. A value that
// is <= the reference (same null pattern) is counted in `later.n` instead of being a diff.
const later = { n: 0 };
function diffUpload(ours, ref, refNewerOk = false) {
  const A = keyed(ours), B = keyed(ref), out = [];
  for (const [s, r] of A) {
    if (!B.has(s)) { out.push('extra in ours: ' + s); continue; }
    const q = B.get(s);
    let newer = false;
    for (let i = 0; i < 12; i++) {
      if (same(r[i], q[i])) continue;
      if (refNewerOk && i >= 4 && i <= 7 && typeof r[i] === 'number' && typeof q[i] === 'number' && r[i] < q[i]) { newer = true; continue; }
      out.push(`${s} col${i}: ours=${r[i]} ref=${q[i]}`);
    }
    if (newer) later.n++;
  }
  for (const s of B.keys()) if (!A.has(s)) out.push('missing in ours: ' + s);
  return out;
}

const exKey = (type, meter, reason) => `${type}|${meter}|${reason.replace(/ — הגיעו רק:.*$/, '')}`;
const hist831 = [];
let hist = [];
const runs = {};
for (const date of DATES) {
  const raw = rj(`raw-${date}.json`).raw;
  const ref = rj(`ref-${date}.json`);
  const sources = [
    { name: 'SpeedNet', ok: true, rows: raw.speednet },
    { name: 'DataSense', ok: true, rows: raw.datasense.flat() },
  ];
  // the 28.9 reference was produced with the 31.8 snapshot as its ONLY history (27.9 was never saved)
  const history = date === '2026-09-28' ? [...hist831] : [...hist];
  const run = buildRun({ day: date, sources, history });
  runs[date] = run;
  hist.push({ date, values: run.snapshot });
  if (date === '2026-08-31') hist831.push({ date, values: run.snapshot });

  const refRows = ref.upload.slice(1);
  const ourBlocked = [...new Set(run.exceptions.filter((e) => e[5] === 'חוסם').map((e) => String(e[1])))].sort();
  const ourWarn = run.exceptions.filter((e) => e[5] === 'אזהרה').map((e) => String(e[1])).sort();
  const total = run.upload.length + ourBlocked.length;
  check(date, 'total meters 253', total === 253, String(total));

  if (date === '2026-08-31') {
    check(date, 'upload 251 of 253', run.upload.length === 251, String(run.upload.length));
    check(date, 'blocked == 15024949,1502859', JSON.stringify(ourBlocked) === JSON.stringify(['15024949', '1502859']), ourBlocked.join(','));
    check(date, 'warning == 18000000046 (משדר לא שידר)', JSON.stringify(ourWarn) === JSON.stringify(['18000000046'])
      && run.exceptions.some((e) => e[5] === 'אזהרה' && e[6].startsWith('משדר לא שידר')), ourWarn.join(','));
    const reasonOf = (m) => run.exceptions.find((e) => e[1] === m && e[5] === 'חוסם')[6];
    check(date, 'הגיעו רק text (שפל)', reasonOf('15024949') === 'אין קריאת סה"כ (T) — הגיעו רק: שפל 18131.826', reasonOf('15024949'));
    check(date, 'הגיעו רק text (פסגה, גבע 0)', reasonOf('1502859') === 'אין קריאת סה"כ (T) — הגיעו רק: פסגה 3704.278, גבע 0', reasonOf('1502859'));
  } else if (date === '2026-09-28') {
    check(date, 'upload 250 of 253', run.upload.length === 250, String(run.upload.length));
    check(date, 'blocked == 15024949,1502859,1715447', JSON.stringify(ourBlocked) === JSON.stringify(['15024949', '1502859', '1715447']), ourBlocked.join(','));
    const drops = run.exceptions.filter((e) => e[1] === '1715447').map((e) => e[6]).sort();
    check(date, '1715447 drops in סה"כ and שפל', JSON.stringify(drops) === JSON.stringify([
      'ירידה בשפל: 49136.157 (31/08) → 40267.708', 'ירידה בסה"כ: 86299.911 (31/08) → 78257.867'].sort()), drops.join(' ; '));
    const r28 = (m) => run.exceptions.find((e) => e[1] === m && e[5] === 'חוסם')[6];
    check(date, 'הגיעו רק texts (שפל 18204.582; the local fixture is ~00:27, spec quotes the later 00:38 פסגה 3870.376)', r28('15024949') === 'אין קריאת סה"כ (T) — הגיעו רק: שפל 18204.582'
      && /^אין קריאת סה"כ \(T\) — הגיעו רק: פסגה 3869\.\d+, גבע 0$/.test(r28('1502859')), r28('15024949') + ' ; ' + r28('1502859'));
    check(date, 'warning 18000000046', JSON.stringify(ourWarn) === JSON.stringify(['18000000046']), ourWarn.join(','));
  } else {
    // 27.9 (history = the 31.8 snapshot). The 27.9 reference xlsx predates v1.3 (old texts, stale = block), so only the
    // rows are compared to it, plus 18000000046 which the OLD reference blocks and v1.3 uploads with a warning.
    check(date, 'upload 250 of 253', run.upload.length === 250, String(run.upload.length));
    check(date, 'blocked == 15024949,1502859,1715447', JSON.stringify(ourBlocked) === JSON.stringify(['15024949', '1502859', '1715447']), ourBlocked.join(','));
  }

  // Upload Readings vs the reference file, cell by cell
  const d = diffUpload(run.upload, refRows, date === '2026-09-28');
  if (date === '2026-09-27') {
    check(date, 'upload vs reference: only 18000000046 extra (old ref blocks stale)', d.length === 1 && d[0] === 'extra in ours: 18000000046', d.slice(0, 5).join('; '));
  } else {
    check(date, 'upload rows == reference cell by cell' + (date === '2026-09-28' ? ' (refNewer tolerance)' : ''), d.length === 0, d.slice(0, 5).join('; '));
    if (date === '2026-09-28') console.log(`NOTE  ${date}  ${later.n} meters carry a LATER SpeedNet reading in the reference (00:38) than the local raw fixture; same serials/null pattern`);
    // exceptions vs reference (type|meter|reason, the 'הגיעו רק' suffix is not in the reference file)
    const A = run.exceptions.map((e) => exKey(e[5], e[1], e[6])).sort();
    const B = ref.exceptions.slice(1).map((e) => exKey(e[5], e[1], e[6])).sort();
    check(date, 'exceptions == reference', JSON.stringify(A) === JSON.stringify(B), A.filter((x) => !B.includes(x)).concat(B.filter((x) => !A.includes(x))).join(' ; '));
  }
  // spec sample meters, when present in this day's data
  const U = keyed(run.upload);
  const samples = [
    ['1503007 full משב"ים', U.get('1503007'), (r) => r && r.slice(4, 8).every((v) => v != null)],
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
