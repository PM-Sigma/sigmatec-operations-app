// Self-check for the 🔥 צריבות pure logic. Executes the REAL code between the PURE-START/PURE-END markers of
// js/src/24-meter-burns.js in a vm sandbox (no DOM, no fetch) — no mirrored copy to drift.
// Run: node test-meter-burns.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('./js/src/24-meter-burns.js', import.meta.url), 'utf8');
const m = src.match(/\/\/ PURE-START([\s\S]*?)\/\/ PURE-END/);
assert.ok(m, 'PURE-START/PURE-END markers must exist');
const B = vm.runInNewContext('var B = {};' + m[1] + '; B', {});

const rows = [
  { meter_id: 'a', serial: '68369287', site: 'אור הנר', meter_type: 'E360CT', address: 'רפת 7 מונה ייצור', ct_ratio: 50, solar_names: 'סולארי רפת 7', status: 'pending', generator_id: null },
  { meter_id: 'b', serial: '59965612', site: 'אור הנר', meter_type: 'E360PP', address: 'סולארי דיר', ct_ratio: 1, solar_names: null, status: 'burned', burned_by: 'אביאם', generator_id: 'g1' },
  { meter_id: 'c', serial: '11111111', site: 'מעוז חיים', meter_type: 'E360CT', address: 'לול 4', ct_ratio: 40, solar_names: 'סולארי לולים', status: 'burned', generator_id: null },
  { meter_id: 'd', serial: '22222222', site: 'מעוז חיים', meter_type: 'E360SP', address: 'בית 12', ct_ratio: 1, solar_names: null, status: 'issue', note: 'אין גישה', generator_id: null },
  { meter_id: 'e', serial: '33333333', site: 'מעוז חיים', meter_type: 'E360PP', address: 'מוסך', ct_ratio: 1, solar_names: 'סולארי מוסך', status: 'pending', generator_id: null },
];
const gens = [{ id: 'g1', site: 'אור הנר', name: 'גנרטור רפת', device_serial: '999' }];

// --- state / kind ---
assert.equal(B.isCT(rows[0]), true); assert.equal(B.isCT(rows[1]), false); assert.equal(B.isCT(rows[3]), false, 'SP is not CT');
assert.equal(B.rowState(rows[0]), 'pending');
assert.equal(B.rowState(rows[1]), 'burned', 'burned PP → plain burned');
assert.equal(B.rowState(rows[2]), 'burned-ct', 'burned CT → purple colour (a colour, never a status word — 22.9)');
assert.equal(B.rowState(rows[3]), 'issue');

// --- search: partial serial, address, solar name, site, generator name; Hebrew spacing/case tolerant ---
assert.equal(B.matches(rows[0], '287'), true, 'partial serial suffix');
assert.equal(B.matches(rows[0], 'רפת'), true, 'address');
assert.equal(B.matches(rows[2], 'לולים'), true, 'solar name');
assert.equal(B.matches(rows[0], 'אור  הנר'), true, 'double space normalized');
assert.equal(B.matches(rows[1], 'גנרטור רפת', gens), true, 'generator name via lookup');
assert.equal(B.matches(rows[0], 'xyz'), false);
assert.equal(B.matches(rows[0], ''), true, 'empty query matches all');

// --- filterRows ---
assert.deepEqual(B.filterRows(rows, { q: '', status: 'pending', kind: 'all', site: '' }).map(r => r.meter_id), ['a', 'e']);
assert.deepEqual(B.filterRows(rows, { q: '', status: 'all', kind: 'CT', site: '' }).map(r => r.meter_id), ['a', 'c']);
assert.deepEqual(B.filterRows(rows, { q: '', status: 'all', kind: 'PP', site: '' }).map(r => r.meter_id), ['b', 'd', 'e'], 'PP filter includes SP');
assert.deepEqual(B.filterRows(rows, { q: '', status: 'all', kind: 'all', site: 'מעוז חיים' }).map(r => r.meter_id), ['c', 'd', 'e']);
assert.deepEqual(B.filterRows(rows, { q: 'סולארי', status: 'all', kind: 'all', site: '' }).map(r => r.meter_id), ['a', 'b', 'c', 'e']);
assert.deepEqual(B.filterRows(rows, { q: 'גנרטור רפת', status: 'all', kind: 'all', site: '' }, gens).map(r => r.meter_id), ['b'], 'filterRows threads gens into matches');

// --- groupBySite: most pending first; counts ---
const g = B.groupBySite(rows);
assert.equal(g[0].pending, g[1].pending, 'both have 1 pending → tie broken by he-IL name');
assert.deepEqual(g.map(x => x.site), ['אור הנר', 'מעוז חיים']);
const mh = g.find(x => x.site === 'מעוז חיים');
assert.deepEqual({ total: mh.total, pending: mh.pending, burned: mh.burned, issue: mh.issue, ct: mh.ct, pp: mh.pp }, { total: 3, pending: 1, burned: 1, issue: 1, ct: 1, pp: 2 });
// a site with more pending rises to the top
const g2 = B.groupBySite(rows.concat([{ meter_id: 'f', serial: '4', site: 'מעוז חיים', meter_type: 'E360PP', status: 'pending' }]));
assert.equal(g2[0].site, 'מעוז חיים');

// --- sortRows: pending → issue → burned; CT before PP; then serial ---
assert.deepEqual(B.sortRows(rows.filter(r => r.site === 'מעוז חיים')).map(r => r.meter_id), ['e', 'd', 'c']);
assert.deepEqual(B.sortRows([rows[1], rows[0]]).map(r => r.meter_id), ['a', 'b'], 'pending CT before burned PP');

// --- groupByGenerator: unassigned last ---
const gg = B.groupByGenerator(rows.filter(r => r.site === 'אור הנר'), gens);
assert.deepEqual(gg.map(x => x.gen && x.gen.name), ['גנרטור רפת', null]);
assert.deepEqual(gg[1].rows.map(r => r.meter_id), ['a']);

// --- totals ---
assert.deepEqual(B.totals(rows), { total: 5, pending: 2, burned: 2, issue: 1 });

// --- patches (exact payloads sent to PostgREST) ---
const t = '2026-09-07T10:00:00.000Z';
assert.deepEqual(B.burnPatch('ניתאי', t), { status: 'burned', burned_by: 'ניתאי', burned_at: t, updated_at: t });
assert.deepEqual(B.unburnPatch(t), { status: 'pending', burned_by: null, burned_at: null, updated_at: t });
assert.deepEqual(B.issuePatch('אין גישה', t), { status: 'issue', note: 'אין גישה', updated_at: t });
assert.deepEqual(B.assignPatch('g1', t), { generator_id: 'g1', updated_at: t });
assert.deepEqual(B.assignPatch(null, t), { generator_id: null, updated_at: t });
assert.deepEqual(B.clearIssuePatch(t), { status: 'pending', note: null, updated_at: t });

// --- Excel sanitizing: strip RTL/LTR marks + newlines from free text ---
assert.equal(B.xs('שורה1\nשורה2‏'), 'שורה1 שורה2');

// --- Excel spec: one row per meter, grouped by site (groupKeys = site index) ---
const spec = B.xlsxSpec(rows, gens);
// 22.9 (I5): one sheet per kibbutz, the columns עידן asked for, every meter of the kibbutz
assert.deepEqual(spec.columns.map(c => c.header), ["מס' מונה", 'סוג מונה', 'כתובת', 'שם המערכת', 'גנרטור', 'סטטוס', 'נצרב ע"י', 'תאריך צריבה', 'הערה']);
assert.deepEqual(spec.sheets.map(sh => sh.sheet), ['אור הנר', 'מעוז חיים'], 'a sheet per kibbutz, in the site-group order');
assert.equal(spec.sheets[1].rows.length, 3, 'every meter of the kibbutz is on its sheet');
assert.equal(spec.rows.length, 5, 'the flat list still carries every row');
const issueRow = spec.rows.find(r => r[0] === '22222222');
assert.equal(issueRow[5], 'בעיה'); assert.equal(issueRow[8], 'אין גישה');
const ctBurned = spec.rows.find(r => r[0] === '11111111');
assert.equal(ctBurned[5], 'נצרב · ממתין לשיבוץ גנרטור', 'burned with no generator says so (22.9, I2)');
assert.equal(ctBurned[1], 'משנה זרם ×40', 'the kind in words, without the icon');
const genRow = spec.rows.find(r => r[0] === '59965612');
assert.equal(genRow[5], 'נצרב', 'burned + generator = plain נצרב');
assert.equal(genRow[4], 'גנרטור רפת');
assert.equal(B.kindLabel(rows[0]), '🔁 משנה זרם ×50'); assert.equal(B.kindLabel(rows[1]), '⚡ תלת-פאזי'); assert.equal(B.kindLabel(rows[3]), '⚡ חד-פאזי', 'SP is single-phase (22.9, I4)');
// I3: the EMS task a problem opens carries the meter, the address, the system and the generator
const task = B.issueTask(rows[1], 'המונה לא נצרב', gens[0]);
assert.equal(task.title, 'תקלה במונה 59965612 · סולארי דיר');
assert.ok(task.description.startsWith('המונה לא נצרב\nמונה: 59965612\nסוג: תלת-פאזי\nכתובת: סולארי דיר'), task.description);
assert.ok(task.description.includes('גנרטור: גנרטור רפת'), task.description);
assert.equal(task.kibbutz, 'אור הנר'); assert.equal(task.type, 'fixing_fault');

// Excel export sanitizes free text (RTL marks / newlines) in the note column
const dirtyRows = rows.map(r => r.meter_id === 'd' ? Object.assign({}, r, { note: 'שורה1\nשורה2‏' }) : r);
const dirtySpec = B.xlsxSpec(dirtyRows, gens);
const dirtyRow = dirtySpec.rows.find(r => r[0] === '22222222');
assert.equal(dirtyRow[8], 'שורה1 שורה2');

// --- generators helper summary ---
const gs = B.genSummary(gens.concat([{ id: 'g2', site: 'אור הנר', name: 'גנרטור לול', device_serial: null }]), rows);
assert.deepEqual(gs.map(x => [x.name, x.count]), [['גנרטור לול', 0], ['גנרטור רפת', 1]]);

// --- EMS live refresh: raw /meters + /solars payloads → meter_burns EMS columns (spec §7) ---
const emsMeters = [
  { id: 'm1', serialNumber: 68369287, address: 'רפת 7 מונה ייצור', currentMultiplier: '50.0000', site: { id: 's1', name: ' אור הנר ' },
    role: { code: 20, name: 'Solar production' }, type: { code: 8, key: 'landis_e360ct', name: 'Landis E360CT' }, parent: { id: 'p1', serialNumber: 68369290 } },
  { id: 'm2', serialNumber: '59965612', address: 'סולארי דיר', currentMultiplier: null, site: { id: 's1', name: 'אור הנר' },
    role: { code: 24 }, type: { code: 6, name: 'Landis E360 PP' }, parent: null },                       // key missing → name normalized
  { id: 'm3', serialNumber: '77777777', address: 'סאטק', site: { id: 's2', name: 'מעוז חיים' }, role: { code: 20 }, type: { code: 3, key: 'satec_em133', name: 'Satec EM133' } },  // not E360 → skipped
  { id: 'm4', serialNumber: '88888888', address: 'ללא אתר', site: null, role: { code: 21 }, type: { key: 'landis_e360sp' } },                                                         // no site → skipped
  { id: 'm5', serialNumber: '99999999', address: 'בית 12', currentMultiplier: 1, site: { id: 's2', name: 'מעוז חיים' }, role: { code: 22 }, type: { key: 'landis_e360sp' } },
];
const emsSolars = [
  { id: 'so1', name: 'סולארי רפת 7', solarMeters: [{ meter: { id: 'm1' } }, { meter: { id: 'p1' } }] },
  { id: 'so2', name: 'סולארי גג', solarMeters: [{ meter: { id: 'm1' } }, { meter: null }] },
  { id: 'so3', name: 'סולארי גג', solarMeters: [{ meter: { id: 'm1' } }] },   // duplicate name → deduped
  { id: 'so4', name: '', solarMeters: [{ meter: { id: 'm5' } }] },            // empty name → ignored
];
assert.equal(B.emsMeterType(emsMeters[0]), 'E360CT'); assert.equal(B.emsMeterType(emsMeters[1]), 'E360PP', 'name fallback, space tolerant');
assert.equal(B.emsMeterType(emsMeters[2]), null); assert.equal(B.emsMeterType({}), null); assert.equal(B.emsMeterType(emsMeters[3]), 'E360SP');
assert.deepEqual(B.emsSolarNames(emsSolars), { m1: 'סולארי גג · סולארי רפת 7', p1: 'סולארי רפת 7' });
const conv = B.emsToBurnRows(emsMeters, emsSolars);
assert.equal(conv.skipped, 2, 'Satec + site-less rows skipped');
assert.deepEqual(conv.rows.map(r => r.meter_id), ['m1', 'm2', 'm5']);
assert.deepEqual(conv.rows[0], { meter_id: 'm1', serial: '68369287', site: 'אור הנר', site_id: 's1', meter_type: 'E360CT', address: 'רפת 7 מונה ייצור',
  role_code: 20, ct_ratio: 50, parent_serial: '68369290', solar_names: 'סולארי גג · סולארי רפת 7' }, 'exact upsert payload: EMS columns only, trimmed site, numeric ct');
assert.deepEqual(conv.rows[1], { meter_id: 'm2', serial: '59965612', site: 'אור הנר', site_id: 's1', meter_type: 'E360PP', address: 'סולארי דיר',
  role_code: 24, ct_ratio: null, parent_serial: null, solar_names: null });
assert.equal(conv.rows[2].solar_names, null, 'empty solar name never becomes a link');
assert.ok(!('status' in conv.rows[0]) && !('note' in conv.rows[0]) && !('generator_id' in conv.rows[0]), 'refresh must never touch tracking columns');
assert.deepEqual(B.emsToBurnRows(null, null), { rows: [], skipped: 0 });

// --- generator picker: EMS search hits → display lines ---
assert.deepEqual(B.emsHitLines({}), []);
assert.deepEqual(B.emsHitLines([{ serialNumber: 555, address: 'גנרטור רפת', site: { name: 'אור הנר' }, type: { name: 'Landis E360PP' } }, { serialNumber: null }]),
  [{ serial: '555', label: '555 · גנרטור רפת · אור הנר · Landis E360PP' }]);
assert.deepEqual(B.emsHitLines([{ serialNumber: '7' }]), [{ serial: '7', label: '7 · —' }]);

// --- Task 23 / round 5 G-L4: the ONE audience and the ONE removal flag, shared with React ---
// The router gate moved OFF this file's own burnCanSee() into js/src/00-bridge.js's
// canShowPage('burns') (G-L4) and the kill flag's declaration into js/src/00-consts.js. The
// legacy table above still opens today — it keeps its own internal burnCanSee/BURN_WRITERS
// until G-U4 deletes the file — but the contract that matters now (what the ROUTER and the
// React surfaces agree on) is 00-bridge.js vs app/src/lib/burns.ts, so that is what is pinned
// here; two lists that can drift is how a צופה ends up with a ✅ נצרב button on one screen and
// not on another.
const bridge = fs.readFileSync(new URL('./js/src/00-bridge.js', import.meta.url), 'utf8');
const consts = fs.readFileSync(new URL('./js/src/00-consts.js', import.meta.url), 'utf8');
const ts = fs.readFileSync(new URL('./app/src/lib/burns.ts', import.meta.url), 'utf8');
const listOf = (text, name) => {
  const m = new RegExp(name + "\\s*(?::[^=]*)?=\\s*\\[([^\\]]*)\\]").exec(text);
  assert.ok(m, 'could not find ' + name);
  return m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};
/** The array literal immediately before a `// <marker>` comment — how 00-bridge.js's inline
 *  `canShowPage('burns')` case spells BURN_WRITERS/BURN_HIDDEN (no named consts there). */
const arrBeforeComment = (text, marker) => {
  const m = new RegExp('\\[([^\\]]*)\\][^\\n]*' + marker).exec(text);
  assert.ok(m, 'could not find the array before // ' + marker + ' in 00-bridge.js');
  return m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};
assert.deepEqual(arrBeforeComment(bridge, 'BURN_WRITERS'), listOf(ts, 'BURN_WRITERS'),
  "the write audience must be identical in 00-bridge.js canShowPage('burns') and app/src/lib/burns.ts");
assert.deepEqual(arrBeforeComment(bridge, 'BURN_HIDDEN'), listOf(ts, 'BURN_HIDDEN'),
  "the hidden list must be identical in 00-bridge.js canShowPage('burns') and app/src/lib/burns.ts");
assert.deepEqual(listOf(ts, 'BURN_WRITERS'), ['אביאם', 'ניתאי', 'עידן', 'עמיחי'], 'the spec audience (עידן 18.9)');
assert.deepEqual(listOf(ts, 'BURN_HIDDEN'), ['מתניה', 'אליה']);
assert.ok(/window\.BURNS_PROJECT_ACTIVE\s*=\s*true/.test(consts), 'the removal flag must be declared and ON, in 00-consts.js');
assert.ok(/BURNS_PROJECT_ACTIVE\s*!==\s*false/.test(ts), 'app/src/lib/burns.ts must read the flag as absent-is-active');
assert.ok(/case 'burns':[\s\S]{0,300}if \(window\.BURNS_PROJECT_ACTIVE === false\) return false;/.test(bridge),
  "canShowPage('burns') must be false the moment the project flag is off");

console.log('✅ test-meter-burns: state/search/filter/group/sort/patch/excel/genSummary/emsRefresh + the Task 23 audience/flag verified');
