// Excel-export suite — builders (golden + contract + edges), file round-trip, gating matrix.
// Run: node test-exports.mjs   (methodology: docs/testing-methodology.md — loop full suite until green)
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/21-excel-export.js'), 'utf8');

let failures = 0, passes = 0;
function check(name, fn) {
  try { fn(); passes++; console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ---- load the module with stubbed globals; capture window exposure ----
function loadModule(role) {
  const window_ = {};
  const fn = new Function('window', 'document', 'alert', 'isIdan', 'isViewer',
    src + '\nreturn { canExportExcel, xlStr, xlNum, xlDate, xlBuildVisits, xlBuildAttendance, xlBuildCerts, xlBuildCertSummary, xlBuildStockByLocation, xlBuildStockByKibbutz, xlSpecToWorkbook, xlMonthRange };');
  return fn(window_, { createElement: () => ({}), head: { appendChild() {} }, getElementById: () => ({ value: '', textContent: '' }) },
    () => {}, () => role === 'idan', () => role === 'viewer');
}
const M = loadModule('viewer');

// ---- contract sweep: every spec obeys the column contract ----
function assertContract(spec, name) {
  assert.ok(spec.sheet, name + ': sheet name');
  assert.ok(spec.columns.length >= 2, name + ': columns');
  spec.rows.forEach((r, ri) => {
    assert.strictEqual(r.length, spec.columns.length, name + ` row ${ri}: arity ${r.length}≠${spec.columns.length}`);
    r.forEach((v, ci) => {
      const t = spec.columns[ci].type;
      if (typeof v === 'string') {
        assert.ok(!/[\r\n]/.test(v), name + `: newline in cell [${ri},${ci}]`);
        assert.ok(!/[‎‏‪-‮]/.test(v), name + `: bidi mark in cell [${ri},${ci}]`);
        assert.ok(v !== 'undefined' && v !== 'null', name + `: literal undefined/null [${ri},${ci}]`);
      }
      if (v !== '' && v !== null) {
        if (t === 'n') assert.strictEqual(typeof v, 'number', name + `: [${ri},${ci}] type n got ${typeof v} (${v})`);
        if (t === 'd') assert.ok(v instanceof Date, name + `: [${ri},${ci}] type d not a Date`);
        if (t === 's') assert.strictEqual(typeof v, 'string', name + `: [${ri},${ci}] type s got ${typeof v}`);
      }
    });
  });
}

console.log('== sanitizers ==');
check('xlStr flattens newlines to "; "', () => assert.strictEqual(M.xlStr('שורה א\nשורה ב\r\nשורה ג'), 'שורה א; שורה ב; שורה ג'));
check('xlStr strips bidi marks', () => assert.strictEqual(M.xlStr('‏שלום‎'), 'שלום'));
check('xlStr null/undefined → empty', () => { assert.strictEqual(M.xlStr(null), ''); assert.strictEqual(M.xlStr(undefined), ''); });
check('xlNum coerces "42" → 42', () => assert.strictEqual(M.xlNum('42'), 42));
check('xlNum garbage → empty', () => assert.strictEqual(M.xlNum('n/a'), ''));
check('xlDate no timezone slide', () => {
  const d = M.xlDate('2026-07-01T00:30:00Z');
  assert.strictEqual(d.getFullYear(), 2026); assert.strictEqual(d.getMonth(), 6); assert.strictEqual(d.getDate(), 1);
});
check('xlMonthRange 2026-02', () => assert.deepStrictEqual(M.xlMonthRange('2026-02'), ['2026-02-01', '2026-02-28']));

console.log('== 1. visits builder ==');
const VISITS = [
  { date: '2026-07-02', kibbutz: 'שדה אליהו', visitor: 'אביאם', duration: 3.5, contact: 'יוסי כהן',
    summary: 'החלפת מונה\nוגם הדרכה', products: [{ name: 'מונה Landis+Gyr E360PP', qty: 2 }, 'סים Cellcom'] },
  { date: '2026-07-09', kibbutz: 'אפיק', visitor: 'ניתאי', duration: '2', contact: null, summary: '', products: [], productsOther: 'כבל 3מ' },
];
check('golden rows (explode, repeat parent fields)', () => {
  const s = M.xlBuildVisits(VISITS);
  assert.strictEqual(s.rows.length, 3);
  assert.deepStrictEqual(s.rows[0].slice(2), ['שדה אליהו', 'אביאם', 3.5, 'יוסי כהן', 'החלפת מונה; וגם הדרכה', 'מונה Landis+Gyr E360PP', 2]);
  assert.deepStrictEqual(s.rows[1].slice(2), ['שדה אליהו', 'אביאם', 3.5, 'יוסי כהן', 'החלפת מונה; וגם הדרכה', 'סים Cellcom', 1]);
  assert.deepStrictEqual(s.rows[2].slice(2), ['אפיק', 'ניתאי', 2, '', '', 'כבל 3מ', 1]);
  assert.ok(s.rows[0][0] instanceof Date && s.rows[0][1] === 'ה');
});
check('visits contract', () => assertContract(M.xlBuildVisits(VISITS), 'visits'));
check('visits empty input', () => { const s = M.xlBuildVisits([]); assert.strictEqual(s.rows.length, 0); assertContract(s, 'visits-empty'); });

console.log('== 2. attendance builder ==');
const ATT_LABELS = { field: 'יום שטח', office: 'משרד', other: 'אחר' };
const ATT = [
  { date: new Date(2026, 6, 1), type: 'field', kibbutz: 'שדה אליהו, אפיק', workdays: 1, hourHours: 2,
    visits: [{ kibbutz: 'שדה אליהו', summary: 'סיכום\nרב שורות' }, { kibbutz: 'אפיק', summary: '' }] },
  { date: new Date(2026, 6, 2), type: 'other', kibbutz: '', duration: 0, visits: [], note: 'יום עיון' },
];
check('golden rows', () => {
  const s = M.xlBuildAttendance(ATT, 'אביאם', ATT_LABELS);
  assert.deepStrictEqual(s.rows[0].slice(2), ['אביאם', 'יום שטח', 'שדה אליהו, אפיק', 1, 2, 'שדה אליהו: סיכום; רב שורות | אפיק:']);   // xlStr trims — empty summary leaves no trailing space
  assert.deepStrictEqual(s.rows[1].slice(2), ['אביאם', 'אחר', '', 0, 0, 'יום עיון']);
});
check('attendance contract', () => assertContract(M.xlBuildAttendance(ATT, 'אביאם', ATT_LABELS), 'att'));

console.log('== 3+4. certs builders ==');
const CERTS = [
  { cert_number: 1001, cert_date: '2026-07-03', kibbutz: 'שדה אליהו', customer: { name: 'קיבוץ שדה אליהו' },
    items: [{ name: 'מונה Landis+Gyr E360PP', qty: 2 }, { name: 'סים Partner', qty: '3' }], created_by: 'אביאם', source: 'visit', status: 'issued' },
  { cert_number: 1002, cert_date: '2026-07-08', kibbutz: 'אפיק', customer: {}, items: [{ name: 'בקר 504', qty: 1 }],
    created_by: 'ניתאי', source: 'order', status: 'cancelled', replaced_by: 1003 },
  { cert_number: 1003, cert_date: '2026-07-08', kibbutz: 'אפיק', customer: null, items: [{ name: 'בקר 504', qty: 1 }],
    created_by: 'ניתאי', source: 'manual', status: 'issued' },
];
check('certs golden (explode + status)', () => {
  const s = M.xlBuildCerts(CERTS);
  assert.strictEqual(s.rows.length, 4);
  assert.deepStrictEqual(s.rows[0], [1001, M.xlDate('2026-07-03'), 'קיבוץ שדה אליהו', 'מונה Landis+Gyr E360PP', 2, 'אביאם', 'ביקור', 'הופקה']);
  assert.strictEqual(s.rows[1][4], 3);           // "3" coerced
  assert.strictEqual(s.rows[2][7], 'מבוטלת');
});
check('certs contract', () => assertContract(M.xlBuildCerts(CERTS), 'certs'));
check('summary excludes cancelled + hand-computed totals', () => {
  const s = M.xlBuildCertSummary(CERTS);
  // active: 1001 (2 PP + 3 Partner ל'קיבוץ שדה אליהו'), 1003 (1 בקר לאפיק). 1002 excluded.
  assert.deepStrictEqual(s.rows, [
    ['אפיק', 'בקר 504', 1, 1],
    ['קיבוץ שדה אליהו', 'מונה Landis+Gyr E360PP', 2, 1],
    ['קיבוץ שדה אליהו', 'סים Partner', 3, 1],
  ]);
  assertContract(s, 'summary');
});

console.log('== 5+6. stock builders ==');
const STOCK = { 'מחסן': { 'מונה A': 10, 'בקר B': 0 }, 'אביאם': { 'מונה A': 2, 'בקר B': 3 }, 'שדה אליהו': { 'מונה A': 5 } };
check('by-location golden (zero-net product dropped? kept: בקר B nonzero at אביאם)', () => {
  const s = M.xlBuildStockByLocation(STOCK, ['מחסן', 'אביאם'], { 'מונה A': 'מונה', 'בקר B': 'בקר' });
  assert.deepStrictEqual(s.rows, [['בקר', 'בקר B', 0, 3, 3], ['מונה', 'מונה A', 10, 2, 12]]);
  assertContract(s, 'stock-loc');
});
check('by-kibbutz golden', () => {
  const s = M.xlBuildStockByKibbutz(STOCK, ['שדה אליהו']);
  assert.deepStrictEqual(s.columns.map(c => c.header), ['קיבוץ', 'מונה A', 'סה"כ']);
  assert.deepStrictEqual(s.rows, [['שדה אליהו', 5, 5]]);
  assertContract(s, 'stock-kib');
});
check('stock empty input', () => { const s = M.xlBuildStockByLocation({}, [], {}); assert.strictEqual(s.rows.length, 0); });

console.log('== gating matrix ==');
check('viewer ✅ / idan ✅ / team ❌ / none ❌', () => {
  assert.strictEqual(loadModule('viewer').canExportExcel(), true);
  assert.strictEqual(loadModule('idan').canExportExcel(), true);
  assert.strictEqual(loadModule('team').canExportExcel(), false);
  assert.strictEqual(loadModule('').canExportExcel(), false);
});

console.log('== file round-trip (SheetJS in Node) ==');
const XLSX = await (async () => {
  const lib = fs.readFileSync(path.join(__dirname, 'js/vendor/xlsx.min.js'), 'utf8');
  const g = {}; new Function('var window=this;' + lib + ';this.XLSX=XLSX;').call(g); return g.XLSX;
})();
check('write→parse: values, types, Hebrew, dates', () => {
  const spec = M.xlBuildCerts(CERTS);
  const wb = M.xlSpecToWorkbook(XLSX, spec);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
  const back = XLSX.read(buf, { cellDates: true });
  assert.strictEqual(back.SheetNames[0], 'תעודות משלוח');
  const ws = back.Sheets['תעודות משלוח'];
  assert.strictEqual(ws['A1'].v, "מס' תעודה");
  assert.strictEqual(ws['A2'].v, 1001); assert.strictEqual(ws['A2'].t, 'n');
  assert.strictEqual(ws['B2'].t, 'd');
  const d = ws['B2'].v; assert.strictEqual(d.getDate(), 3); assert.strictEqual(d.getMonth(), 6);
  assert.strictEqual(ws['C2'].v, 'קיבוץ שדה אליהו');
  assert.strictEqual(ws['E3'].v, 3); assert.strictEqual(ws['E3'].t, 'n');   // coerced "3"
  assert.strictEqual(ws['H4'].v, 'מבוטלת');
  // mojibake canary
  for (const addr of ['C2', 'D2', 'H4']) {
    assert.ok(!/�/.test(ws[addr].v), 'replacement char in ' + addr);
    assert.ok(!/[À-ÿ]{2,}/.test(ws[addr].v), 'latin junk in ' + addr);
  }
  assert.strictEqual(back.Workbook.Views[0].RTL, true);
});
check('write→parse: visits sheet spot-check', () => {
  const wb = M.xlSpecToWorkbook(XLSX, M.xlBuildVisits(VISITS));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
  const ws = XLSX.read(buf, { cellDates: true }).Sheets['ביקורי שטח'];
  assert.strictEqual(ws['G2'].v, 'החלפת מונה; וגם הדרכה');   // flattened, not multiline
  assert.strictEqual(ws['E2'].t, 'n'); assert.strictEqual(ws['E2'].v, 3.5);
});

console.log('== group banding + styles ==');
check('groupKeys parallel to rows (visits, certs)', () => {
  const v = M.xlBuildVisits(VISITS);
  assert.strictEqual(v.groupKeys.length, v.rows.length);
  assert.deepStrictEqual(v.groupKeys, [0, 0, 1]);          // visit 1 = 2 rows, visit 2 = 1 row
  const c = M.xlBuildCerts(CERTS);
  assert.deepStrictEqual(c.groupKeys, [0, 0, 1, 2]);       // cert 1001 ×2 items, 1002, 1003
});
check('same record → same fill; new record → new fill; header navy', () => {
  const spec = M.xlBuildCerts(CERTS);
  const ws = M.xlSpecToWorkbook(XLSX, spec).Sheets['תעודות משלוח'];
  assert.strictEqual(ws['A1'].s.fill.fgColor.rgb, '1B2A4A');
  assert.strictEqual(ws['A1'].s.font.bold, true);
  const f = r => ws['A' + r].s.fill.fgColor.rgb;
  assert.strictEqual(f(2), f(3), 'rows of cert 1001 share a color');
  assert.notStrictEqual(f(3), f(4), '1002 gets a new color');
  assert.notStrictEqual(f(4), f(5), '1003 gets a new color');
  const vs = M.xlSpecToWorkbook(XLSX, M.xlBuildVisits(VISITS)).Sheets['ביקורי שטח'];
  assert.ok(vs['F4'].s && vs['F4'].s.fill, 'empty contact cell still gets the band fill');
});
check('styles survive write→read round-trip (data intact)', () => {
  const wb = M.xlSpecToWorkbook(XLSX, M.xlBuildCerts(CERTS));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
  const ws = XLSX.read(buf, { cellDates: true, cellStyles: true }).Sheets['תעודות משלוח'];
  assert.strictEqual(ws['A2'].v, 1001);
  assert.strictEqual(ws['H4'].v, 'מבוטלת');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
