// Excel-export suite — builders (golden + contract + edges), file round-trip, gating matrix.
// Run: node test-exports.mjs   (methodology: docs/testing-methodology.md — loop full suite until green)
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 06-products.js supplies the `productLabel` legacy mirror (Task 9, spec §3) that
// xlLabel()/xlProductMapFromSheet() in 21-excel-export.js call.
const src = fs.readFileSync(path.join(__dirname, 'js/src/06-products.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, 'js/src/21-excel-export.js'), 'utf8');

let failures = 0, passes = 0;
function check(name, fn) {
  try { fn(); passes++; console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ---- load the module with stubbed globals; capture window exposure ----
function loadModule(role) {
  const window_ = {};
  const fn = new Function('window', 'document', 'alert', 'isIdan', 'isViewer',
    src + '\nreturn { canExportExcel, xlStr, xlNum, xlDate, xlBuildVisits, xlBuildAttendance, xlBuildCerts, xlBuildCertSummary, xlBuildStockByLocation, xlBuildStockByKibbutz, xlSpecToWorkbook, xlMonthRange, xlLabel, xlProductMapFromSheet, productLabel };');
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
// The 'נשאר פתוח' column (visits.open_items) arrived in Task 4 per spec §5.1b — the visit
// summary is two fields now, and the export carries both. The goldens below include it.
const VISITS = [
  { date: '2026-07-02', kibbutz: 'שדה אליהו', visitor: 'אביאם', duration: 3.5, contact: 'יוסי כהן',
    summary: 'החלפת מונה\nוגם הדרכה', openItems: 'CT חלופי\nלמונה 133',
    products: [{ name: 'מונה Landis+Gyr E360PP', qty: 2 }, 'סים Cellcom'] },
  { date: '2026-07-09', kibbutz: 'אפיק', visitor: 'ניתאי', duration: '2', contact: null, summary: '', products: [], productsOther: 'כבל 3מ' },
];
check('golden rows (explode, repeat parent fields)', () => {
  const s = M.xlBuildVisits(VISITS);
  assert.strictEqual(s.rows.length, 3);
  assert.deepStrictEqual(s.rows[0].slice(2), ['שדה אליהו', 'אביאם', 3.5, 'יוסי כהן', 'החלפת מונה; וגם הדרכה', 'CT חלופי; למונה 133', 'מונה Landis+Gyr E360PP', 2]);
  assert.deepStrictEqual(s.rows[1].slice(2), ['שדה אליהו', 'אביאם', 3.5, 'יוסי כהן', 'החלפת מונה; וגם הדרכה', 'CT חלופי; למונה 133', 'סים Cellcom', 1]);
  // a visit with nothing left open → an empty cell, never a placeholder
  assert.deepStrictEqual(s.rows[2].slice(2), ['אפיק', 'ניתאי', 2, '', '', '', 'כבל 3מ', 1]);
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
  // …, ימי עבודה, שעות, 🕎 חג, פירוט — the חג cell is empty here: neither day is a holiday
  // (and this harness has no holiday list at all, which is the no-legacy-page case).
  assert.deepStrictEqual(s.rows[0].slice(2), ['אביאם', 'יום שטח', 'שדה אליהו, אפיק', 1, 2, '', 'שדה אליהו: סיכום; רב שורות | אפיק:']);   // xlStr trims — empty summary leaves no trailing space
  assert.deepStrictEqual(s.rows[1].slice(2), ['אביאם', 'אחר', '', 0, 0, '', 'יום עיון']);
});
check('🕎 a day worked on a holiday is marked in the sheet (spec §7e)', () => {
  // The builder asks the legacy helpers, which only exist on the attendance page; the test
  // stands them up the same way the page would.
  globalThis.attYmd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  globalThis.attHolidayOn = key => (key === '2026-07-01' ? { date: key, name: 'חג לדוגמה', kind: 'holiday', required: false } : null);
  try {
    const s = M.xlBuildAttendance(ATT, 'אביאם', ATT_LABELS);
    assert.strictEqual(s.rows[0][7], '🕎 חג לדוגמה');
    assert.strictEqual(s.rows[1][7], '');
  } finally {
    delete globalThis.attYmd;
    delete globalThis.attHolidayOn;
  }
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

// ── the visits PDF table (js/src/10-activity.js) ────────────────────────────
// Review fix 3: the PDF was the ONE reader that dropped "נשאר פתוח" (open_items) — the Excel
// and the WhatsApp report both carry it. The builder needs a live DOM, so this is a source
// contract, and it guards the failure that actually bites in a rowspan table: a header with
// more columns than the rows fill, which renders as a silently shifted table, not an error.
console.log('== 5. visits PDF table contract ==');
const ACT = fs.readFileSync(path.join(__dirname, 'js/src/10-activity.js'), 'utf8');

check('the PDF header carries נשאר פתוח right after the summary', () => {
  assert.match(ACT, /<th>סיכום ביקור<\/th>\s*<th>נשאר פתוח<\/th>/, 'the column is missing or out of order');
});

check('both row shapes fill it (the no-products row AND the per-product visit block)', () => {
  const cells = ACT.match(/openItemsCell\(v\)/g) || [];
  assert.strictEqual(cells.length, 2, 'expected the cell in both row shapes, found ' + cells.length);
});

check('header column count === the cells a full visit row emits', () => {
  const head = ACT.slice(ACT.indexOf('<th class="day">יום</th>'));
  const headCells = (head.slice(0, head.indexOf('</tr>')).match(/<th/g) || []).length;
  const dayDate = 2, visitCells = 6, productCells = 2;   // visitCells includes נשאר פתוח
  assert.strictEqual(headCells, dayDate + visitCells + productCells,
    'the header has ' + headCells + ' columns but a row fills ' + (dayDate + visitCells + productCells));
});

check('the cell escapes markup and turns newlines into <br>', () => {
  assert.ok(/replace\(\/&\/g, '&amp;'\)/.test(ACT), 'no &-escaping in openItemsCell');
  assert.ok(ACT.includes("'<br>'"), 'newlines are not turned into <br>');
});

// ── §3 product display names (Task 9) ────────────────────────────────────────
// No export cell may print a technical name that has a different display_name (spec §3
// contract). Fixture per the spec: name:'E360CT-3P', display_name:'מונה חשמל תלת-פאזי'.
console.log('== §3 product display names — no technical-name leak ==');
const METER = 'E360CT-3P', METER_DISPLAY = 'מונה חשמל תלת-פאזי', PLAIN = 'SIM-XYZ';
const PRODUCT_MAP = { [METER]: { name: METER, display_name: METER_DISPLAY }, [PLAIN]: { name: PLAIN } };

function cellsContain(spec, needle) { return spec.rows.some(r => r.some(c => typeof c === 'string' && c.includes(needle))); }

check('productLabel: technical in-app, display for forReport/viewer, fallback when unset', () => {
  assert.strictEqual(M.productLabel({ name: METER, display_name: METER_DISPLAY }), METER);
  assert.strictEqual(M.productLabel({ name: METER, display_name: METER_DISPLAY }, { forReport: true }), METER_DISPLAY);
  assert.strictEqual(M.productLabel({ name: METER, display_name: METER_DISPLAY }, { role: 'viewer' }), METER_DISPLAY);
  assert.strictEqual(M.productLabel({ name: PLAIN }, { forReport: true }), PLAIN);
});

check('visits export: display name in the cell, technical name absent', () => {
  const spec = M.xlBuildVisits([{ date: '2026-09-01', kibbutz: 'דפנה', products: [{ name: METER, qty: 2 }] }], PRODUCT_MAP);
  assert.ok(cellsContain(spec, METER_DISPLAY));
  assert.ok(!cellsContain(spec, METER));
});
check('visits export, no productMap (legacy call site) → falls back to technical, no throw', () => {
  const spec = M.xlBuildVisits([{ date: '2026-09-01', kibbutz: 'דפנה', products: [{ name: METER, qty: 1 }] }]);
  assert.ok(cellsContain(spec, METER));
});
check('cert summary: display name in the cell, technical name absent', () => {
  const spec = M.xlBuildCertSummary([{ status: 'active', cert_number: 1, kibbutz: 'דפנה', items: [{ name: METER, qty: 3 }] }], PRODUCT_MAP);
  assert.ok(cellsContain(spec, METER_DISPLAY));
  assert.ok(!cellsContain(spec, METER));
});
check('stock by location: display name in the פריט cell', () => {
  const spec = M.xlBuildStockByLocation({ 'חברה': { [METER]: 5 } }, ['חברה'], {}, PRODUCT_MAP);
  assert.ok(cellsContain(spec, METER_DISPLAY));
  assert.ok(!cellsContain(spec, METER));
});
check('stock by kibbutz: display name in the column header', () => {
  const spec = M.xlBuildStockByKibbutz({ 'דפנה': { [METER]: 2 } }, ['דפנה'], PRODUCT_MAP);
  assert.ok(spec.columns.some(c => c.header === METER_DISPLAY));
  assert.ok(!spec.columns.some(c => c.header === METER));
});
check('no display_name set anywhere → technical name prints (nothing to leak)', () => {
  const spec = M.xlBuildVisits([{ date: '2026-09-01', kibbutz: 'דפנה', products: [{ name: PLAIN, qty: 1 }] }], PRODUCT_MAP);
  assert.ok(cellsContain(spec, PLAIN));
});

// ════════════════════════════════════════════════════════════════════════════════
// AUDIT B · F-06 / F-07 / F-08 / F-09 / F-10 / F-11 — the PDF and the Excel of the
// SAME report must agree, and neither may leak a technical product name.
// ════════════════════════════════════════════════════════════════════════════════
console.log('== the two media of one report ==');

const CERT_LEAK = [{
  status: 'issued', cert_number: 7, cert_date: '2026-09-01', kibbutz: 'חוקוק',
  customer: { name: 'קיבוץ חוקוק' }, created_by: 'אביאם', source: 'visit',
  items: [{ name: METER, qty: 3 }],
}];

check('F-06 — דוח תעודות משלוח (Excel) prints the DISPLAY name', () => {
  const spec = M.xlBuildCerts(CERT_LEAK, PRODUCT_MAP);
  assert.ok(cellsContain(spec, METER_DISPLAY), 'display name missing from the cert export');
  assert.ok(!cellsContain(spec, METER), 'technical name leaked into a report');
});
check('F-06 — no productMap (a legacy call site) still falls back, never throws', () => {
  assert.ok(cellsContain(M.xlBuildCerts(CERT_LEAK), METER));
});
check('F-08 — the Excel groups by customer.name, falling back to kibbutz', () => {
  assert.strictEqual(M.xlBuildCerts(CERT_LEAK, PRODUCT_MAP).rows[0][2], 'קיבוץ חוקוק');
  const noCustomer = [{ ...CERT_LEAK[0], customer: null }];
  assert.strictEqual(M.xlBuildCerts(noCustomer, PRODUCT_MAP).rows[0][2], 'חוקוק');
});

// ---- the printed cert report (js/src/20-delivery-cert.js) ----
const certSrc = fs.readFileSync(path.join(__dirname, 'js/src/20-delivery-cert.js'), 'utf8');
function liftFrom(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, 'could not find function ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces reading ' + name);
}
const certHelpers = new Function('window', 'productLabel',
  liftFrom(certSrc, 'certGroupName') + '\n' + liftFrom(certSrc, 'certReportLabel')
  + '\nreturn { certGroupName, certReportLabel };')(
  { SHEET_DATA: { products: [{ name: METER, display_name: METER_DISPLAY }] } }, M.productLabel);

check('F-08 — the PDF groups by the SAME key as the Excel', () => {
  assert.strictEqual(certHelpers.certGroupName(CERT_LEAK[0]), 'קיבוץ חוקוק');
  assert.strictEqual(certHelpers.certGroupName({ kibbutz: 'חוקוק', customer: null }), 'חוקוק');
  assert.match(certSrc, /certs\.forEach\(cr => \{ const k = certGroupName\(cr\) \|\| '—';/);
});
check('F-07 — the printed cert REPORT prints display names (the field cert does not)', () => {
  assert.strictEqual(certHelpers.certReportLabel(METER), METER_DISPLAY);
  assert.strictEqual(certHelpers.certReportLabel(PLAIN), PLAIN);
  assert.match(certSrc, /certEsc\(certReportLabel\(i\.name\)\) \+ ' ×'/);
  assert.match(certSrc, /certEsc\(certReportLabel\(n\)\)/);
  assert.ok(certSrc.includes("certEsc(i.name)"),
    'the field certificate must keep the technical name');
});

// ---- the attendance PDF (js/src/04-attendance-daily.js) ----
const attSrc = fs.readFileSync(path.join(__dirname, 'js/src/04-attendance-daily.js'), 'utf8');
function attPdfHtml(rows, monthLabel) {
  let html = '';
  const w = { document: { write(h) { html += h; }, close() {} } };
  const fn = new Function(
    'window', 'document', 'alert', 'attPerson', 'attHolidayOn', 'attYmd', 'ATT_LABELS',
    'WORKDAY_HOURS', 'ATT_HOLIDAY_MARK',
    liftFrom(attSrc, 'attEsc') + '\n' + liftFrom(attSrc, 'downloadAttendancePDF')
    + '\nreturn downloadAttendancePDF;');
  fn({ _attendanceRows: rows, open: () => w },
     { getElementById: id => (id === 'attendanceMonthLabel' && monthLabel !== null
       ? { textContent: monthLabel } : null) },
     () => {}, () => 'אביאם',
     d => (d === '2026-09-15' ? { name: 'סוכות', required: false } : null),
     d => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d)),
     { field: 'שטח', office: 'משרד', other: 'אחר' }, 9, '🕎')();
  return html;
}
const ATT_PDF_ROWS = [
  { date: new Date('2026-09-15T09:00:00Z'), type: 'field', workdays: 1, hourHours: 0, visits: [{ kibbutz: 'דפנה', summary: 'התקנה', workday: true }] },
  { date: new Date('2026-09-16T09:00:00Z'), type: 'office', duration: 8, note: 'טיפול בתעריפים' },
];

check('F-09 — ONE holiday glyph in the whole document', () => {
  const html = attPdfHtml(ATT_PDF_ROWS, 'ספטמבר 2026');
  assert.ok(html.includes('🕎'), 'the 🕎 marker is missing');
  assert.ok(!html.includes('🕯️'), 'two glyphs for one concept (🕯️ in the summary line)');
  assert.ok(/🕎 1 ימי עבודה בחג/.test(html), 'the summary line must use the same marker');
});
check('F-10 — an office day KEEPS its note, exactly like the Excel', () => {
  const html = attPdfHtml(ATT_PDF_ROWS, 'ספטמבר 2026');
  assert.ok(html.includes('טיפול בתעריפים'), 'the PDF dropped a note the Excel prints');
  const xl = M.xlBuildAttendance(ATT_PDF_ROWS, 'אביאם', { field: 'שטח', office: 'משרד' });
  assert.ok(xl.rows.some(r => r.some(c => typeof c === 'string' && c.includes('טיפול בתעריפים'))));
});
check('F-11 — no month label → no dangling separator in the title or the sub-line', () => {
  const html = attPdfHtml(ATT_PDF_ROWS, null);
  const title = /<title>([^<]*)<\/title>/.exec(html)[1];
  assert.strictEqual(title, 'נוכחות אביאם', 'the title IS the default PDF filename: ' + title);
  const sub = /<div class="sub">([^<]*)</.exec(html)[1];
  assert.ok(!sub.trimStart().startsWith('·'), 'sub-line opens with a stray separator: ' + sub);
  const full = attPdfHtml(ATT_PDF_ROWS, 'ספטמבר 2026');
  assert.strictEqual(/<title>([^<]*)<\/title>/.exec(full)[1], 'נוכחות אביאם — ספטמבר 2026');
});

check('F-23 — an empty range writes the same "no data" row the printed report shows', () => {

  const wb = M.xlSpecToWorkbook(XLSX, M.xlBuildCerts([]));
  const ws = wb.Sheets['תעודות משלוח'];
  assert.strictEqual(ws.A2 && ws.A2.v, 'אין נתונים בטווח שנבחר');
  // …and a non-empty export is untouched by it.
  const full = M.xlSpecToWorkbook(XLSX, M.xlBuildCerts(CERTS)).Sheets['תעודות משלוח'];
  assert.notStrictEqual(full.A2 && full.A2.v, 'אין נתונים בטווח שנבחר');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
