// Self-check for attendance-report EDITING (js/src/04-attendance-daily.js).
// Run: node test-attendance-edit.mjs
//
// Following the house style (test-attendance-toggle.mjs): the render path touches dozens of DOM ids, so
// instead of stubbing it end-to-end we lift the load-bearing PURE pieces out of the source and eval them
// against fixtures — the permission rule, the local-date formatter, and the update payload — plus regex
// guards on the two id-threading spots whose regression would silently remove every ✏️ button.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/04-attendance-daily.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}
function lift(name) {                     // pull `function name(...) { ... }` out of the source
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, 'could not find function ' + name + ' in the source');
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces reading ' + name);
}

// ---------- 1. permission matrix ----------
const canEditSrc = lift('canEditAttendanceOf');
function canEditWith({ me, viewer = false, idan = false }) {
  const f = new Function('isViewer', 'getCurrentUser', 'isIdan',
    canEditSrc + '; return canEditAttendanceOf;')(() => viewer, () => me, () => idan);
  return f;
}
check('a worker CAN edit their own entry', () => {
  assert.equal(canEditWith({ me: 'אביאם' })('אביאם'), true);
});
check("a worker CANNOT edit someone else's entry", () => {
  assert.equal(canEditWith({ me: 'אביאם' })('ניתאי'), false);
  assert.equal(canEditWith({ me: 'ניתאי' })('אביאם'), false);
});
check('עידן can edit ANYONE (admin)', () => {
  const f = canEditWith({ me: 'עידן', idan: true });
  ['אביאם', 'ניתאי', 'עמיחי', 'עידן'].forEach(p => assert.equal(f(p), true, 'עידן should edit ' + p));
});
check('עמיחי (CEO) can edit ANYONE', () => {
  const f = canEditWith({ me: 'עמיחי' });
  ['אביאם', 'ניתאי', 'עידן'].forEach(p => assert.equal(f(p), true, 'עמיחי should edit ' + p));
});
check('a viewer can edit NOTHING — not even an entry in their own name', () => {
  assert.equal(canEditWith({ me: 'אביאם', viewer: true })('אביאם'), false);
  assert.equal(canEditWith({ me: 'עידן', viewer: true, idan: true })('אביאם'), false, 'viewer must beat the idan check');
});
check('nobody logged in / no person on the row → no edit', () => {
  assert.equal(canEditWith({ me: '' })('אביאם'), false);
  assert.equal(canEditWith({ me: 'אביאם' })(''), false);
  assert.equal(canEditWith({ me: 'אביאם' })(undefined), false);
});
check('a plain team member who is NOT עמיחי/עידן cannot edit others', () => {
  assert.equal(canEditWith({ me: 'מתניה' })('אביאם'), false);
});

// ---------- 2. attYmd must use LOCAL parts (toISOString would shift the day) ----------
const attYmd = new Function(lift('attYmd') + '; return attYmd;')();
check('attYmd formats a date as yyyy-mm-dd with zero padding', () => {
  assert.equal(attYmd(new Date(2026, 0, 5, 10, 0)), '2026-01-05');
  assert.equal(attYmd(new Date(2026, 10, 30, 23, 30)), '2026-11-30');
});
check('attYmd does NOT shift the day near midnight (the toISOString bug)', () => {
  // 00:30 local: toISOString() in a positive-offset zone (Israel) would report the PREVIOUS day.
  const d = new Date(2026, 7, 2, 0, 30);
  assert.equal(attYmd(d), '2026-08-02', 'must stay on the local calendar day');
});
check('attYmd is round-trip stable through the noon anchor the save uses', () => {
  const iso = new Date('2026-08-02' + 'T12:00:00').toISOString();
  assert.equal(attYmd(iso), '2026-08-02', 'reopening an edited row must show the same date back');
});
check('attYmd on a bad date returns empty, not "NaN-NaN-NaN"', () => {
  assert.equal(attYmd('not-a-date'), '');
});

// ---------- 3. the update payload ----------
const bodyExpr = src.match(/body: JSON\.stringify\((\{ type: 'attendance', id: st\.id[^)]*\})\)/);
check('saveAttEdit still builds an id-carrying attendance body', () => {
  assert.ok(bodyExpr, 'could not locate the update payload in saveAttEdit');
});
if (bodyExpr) {
  const build = new Function('st', 'dayType', 'note', 'isoDate', 'return ' + bodyExpr[1] + ';');
  const st = { id: 'att-123', person: 'אביאם', type: 'vacation' };
  const p = build(st, 'vacation', '', '2026-08-02T09:00:00.000Z');

  check('payload carries the id → an UPDATE, not a new row', () => {
    assert.equal(p.id, 'att-123', 'without the id the router would insert a duplicate');
    assert.equal(p.type, 'attendance');
  });
  check('payload keeps the ORIGINAL person (an edit never reassigns whose day it is)', () => {
    assert.equal(p.person, 'אביאם');
    // the upsert writes the whole row, so a missing person would blank the column
    assert.ok('person' in p && p.person, 'person must be present and non-empty');
  });
  check('payload carries the edited date + day type', () => {
    assert.equal(p.date, '2026-08-02T09:00:00.000Z');
    assert.equal(p.dayType, 'vacation');
  });
  check('an "אחר" edit carries its note', () => {
    assert.equal(build(st, 'other', 'יום עיון', 'x').note, 'יום עיון');
  });
}

// ---------- 4. the noon anchor in the save path ----------
check('saveAttEdit anchors the chosen date at T12:00:00 before toISOString', () => {
  assert.ok(/new Date\(dateVal \+ 'T12:00:00'\)\.toISOString\(\)/.test(src),
    'without the noon anchor a timezone offset can roll the saved day backwards');
});
check('the note is dropped for every non-"other" type', () => {
  assert.ok(/const note = \(dayType === 'other'\) \? \(document\.getElementById\('attEditNote'\)\.value \|\| ''\)\.trim\(\) : ''/.test(src),
    'a leftover note must not survive a switch away from "אחר"');
});
check('an "other" edit with an empty note is rejected', () => {
  assert.ok(/dayType === 'other' && !note/.test(src), 'must refuse to save "אחר" with no detail');
});
check('the day type is validated against ATT_EDIT_TYPES before saving', () => {
  assert.ok(/ATT_EDIT_TYPES\.indexOf\(dayType\) === -1/.test(src), 'an unknown day type must be refused');
});

// ---------- 5. id threading — regress either spot and every ✏️ silently vanishes ----------
check('renderAttendanceReport keeps the attendance row id', () => {
  assert.ok(/\.map\(a => \(\{ id: a\.id, date: new Date\(a\.date\)/.test(src),
    'the attendance→row mapping must carry id, else no row is ever editable');
});
check('mergeAttendanceByDate carries the id on the NON-field branch', () => {
  assert.ok(/note: o\.note \|\| '', id: o\.id \}/.test(src), 'merged non-field row must keep o.id');
});
check('the FIELD branch carries NO id (a field day is a VISIT, not an attendance row)', () => {
  const fieldBranch = src.slice(src.indexOf('if (d.fields.length)'), src.indexOf('const o = d.others[0]'));
  assert.ok(!/\bid:/.test(fieldBranch), 'field rows must not expose an attendance id: ' + fieldBranch.slice(0, 200));
});
check('the ✏️ renders only when the row has an id AND the user may edit that person', () => {
  assert.ok(/r\.id && canEditAttendanceOf\(who\)/.test(src), 'edit button must be gated on both');
});
check("the ✏️ sits INSIDE the existing last cell, so the detail row's colspan=5 stays valid", () => {
  assert.ok(/\$\{expandCell\}\$\{editCell\}<\/td>/.test(src), 'edit button must share the expand cell, not add a column');
  // the detail row must span exactly as many columns as the header declares
  const headerRow = src.match(/<thead><tr>(.*?)<\/tr><\/thead>/);
  assert.ok(headerRow, 'could not find the attendance table header');
  const headerCols = (headerRow[1].match(/<th>/g) || []).length;
  const colspan = Number((src.match(/colspan="(\d+)"/) || [])[1]);
  assert.equal(headerCols, 5, 'expected 4 titled columns + 1 blank action column, got ' + headerCols);
  assert.equal(colspan, headerCols, 'detail-row colspan (' + colspan + ') must match the column count (' + headerCols + ')');
  // and the body row must emit that same number of <td>
  const bodyRow = src.match(/const mainRow = `<tr>([\s\S]*?)<\/tr>`/);
  assert.ok(bodyRow, 'could not find the attendance main row template');
  assert.equal((bodyRow[1].match(/<td/g) || []).length, headerCols, 'main row must emit one <td> per column');
});

// ---------- 6. markup contract ----------
check('index.html has the edit modal and all ids the code drives', () => {
  ['attEditModal', 'attEditDate', 'attEditTypes', 'attEditOtherWrap', 'attEditNote', 'attEditWho']
    .forEach(id => assert.ok(html.includes('id="' + id + '"'), 'missing #' + id + ' in index.html'));
});
check('the modal offers exactly the six non-field day types (no יום שטח)', () => {
  const block = html.slice(html.indexOf('id="attEditTypes"'), html.indexOf('id="attEditOtherWrap"'));
  ['office', 'wfh', 'reserve', 'vacation', 'off', 'other']
    .forEach(t => assert.ok(block.includes('data-type="' + t + '"'), 'missing day type ' + t));
  assert.ok(!block.includes('data-type="field"'), 'יום שטח must NOT be offered — a field day is a visit');
  assert.equal((block.match(/data-type=/g) || []).length, 6, 'expected exactly 6 day-type buttons');
});
check('the modal wires save/cancel to the edit handlers', () => {
  const modal = html.slice(html.indexOf('id="attEditModal"'), html.indexOf('id="kibbutz-view"'));
  assert.ok(/onclick="saveAttEdit\(this\)"/.test(modal), 'save must call saveAttEdit(this)');
  assert.ok(/onclick="closeAttEdit\(\)"/.test(modal), 'cancel must call closeAttEdit()');
});

console.log(failures === 0 ? '\nPASS — all attendance-edit checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
