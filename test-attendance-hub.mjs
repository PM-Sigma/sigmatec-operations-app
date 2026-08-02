// Self-check for the "נוכחות is the hub" work (1.60):
//   • field days editable from נוכחות (visit editor, global lookup)
//   • visit↔EMS link persisted (visits.ems_task_id) and an edit pushes a COMMENT (never a PATCH)
//   • the standalone דוח ביקורים is gone; cert/Excel tools survive
//   • the visit date no longer defaults to today and can't silently become today
// Run: node test-attendance-hub.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const R = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const att = R('js/src/04-attendance-daily.js');
const visits = R('js/src/09-visits.js');
const activity = R('js/src/10-activity.js');
const cal = R('js/src/14-calendar.js');
const data = R('js/src/01-data.js');
const html = R('index.html');
const bundle = R('js/app.js');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}
function lift(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, 'could not find function ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

console.log('\n— visit date: no default, no silent fallback —');
check('openEditModal clears the visit date instead of stamping today', () => {
  const f = lift(activity, 'openEditModal');
  assert.ok(/getElementById\('visitDate'\)\.value = ''/.test(f), 'visitDate must open empty');
  assert.ok(!/visitDate'\)\.value =\s*\n?\s*today\.getFullYear/.test(f), 'the today-default must be gone');
});
check('saveVisit REFUSES an empty date (no silent "today" fallback)', () => {
  assert.ok(/if \(!document\.getElementById\('visitDate'\)\.value\) \{ alert\('נא לבחור את תאריך הביקור'\); return; \}/.test(visits),
    'an empty date must be rejected up front');
  assert.ok(!/dateInput \? new Date\(dateInput \+ 'T12:00:00'\)\.toISOString\(\) : new Date\(\)\.toISOString\(\)/.test(visits),
    'the silent today-fallback must be gone — it is what mis-dated visits in the first place');
  assert.ok(/const visitDate = new Date\(dateInput \+ 'T12:00:00'\)\.toISOString\(\)/.test(visits), 'date still noon-anchored');
});
check('the date validation runs BEFORE any save work begins', () => {
  const f = lift(visits, 'saveVisit');
  assert.ok(f.indexOf("alert('נא לבחור את תאריך הביקור')") < f.indexOf('setBtnLoading'),
    'validate before showing the saving state / collecting products');
});
check('the label tells the user to pick a date (date inputs have no placeholder)', () => {
  assert.ok(/<label for="visitDate">[^<]*בחר תאריך[^<]*<\/label>/.test(html), 'label should carry the בחר תאריך hint');
});
check('the FAB path still injects its explicitly chosen date AFTER the clear', () => {
  const init = R('js/src/02-init-attendance.js');
  const openIdx = init.indexOf('openEditModal(card)');
  const setIdx = init.indexOf("getElementById('visitDate'); if (vd) vd.value = dateVal");
  assert.ok(openIdx !== -1 && setIdx !== -1 && setIdx > openIdx,
    'the quick-FAB must set its date after openEditModal clears it, or the wizard date is lost');
});

console.log('\n— visit ↔ EMS link is persisted —');
check('the visit READ maps ems_task_id → emsTaskId', () => {
  assert.ok(/emsTaskId: v\.ems_task_id \|\| ''/.test(data), 'read mapping missing');
});
check('writeVisit only writes ems_task_id when one was actually sent (partial-safe)', () => {
  const f = lift(data, 'writeVisit');
  assert.ok(/if \(b\.emsTaskId !== undefined\) row\.ems_task_id = b\.emsTaskId \|\| ''/.test(f),
    'an edit that touches no EMS task must not blank an existing link');
  assert.ok(!/ems_task_id: b\.emsTaskId \|\| ''\s*[,}]/.test(f.split('if (b.emsTaskId')[0]),
    'ems_task_id must not be unconditionally part of the row literal');
});
check('saveVisit persists the chosen task id when an EMS intent exists', () => {
  assert.ok(/if \(emsIntent && emsIntent\.taskId\) reqBody\.emsTaskId = emsIntent\.taskId/.test(visits));
});
check('the migration file exists and is additive + re-runnable', () => {
  const sql = R('db/visits_ems_task_id.sql');
  assert.ok(/alter table public\.visits add column if not exists ems_task_id text default ''/.test(sql));
});

console.log('\n— editing a linked visit pushes a COMMENT, never a task PATCH —');
const noteFn = new Function(lift(cal, 'buildVisitEditNote') + '; return buildVisitEditNote;')();
const base = { date: '2026-07-07T09:00:00.000Z', visitor: 'אביאם', duration: 2, workday: false, contact: 'דני', products: [{ name: 'מונה', qty: 2 }], summary: 'הוחלף בקר' };
check('a date change produces a comment naming old → new', () => {
  const msg = noteFn(base, { ...base, date: '2026-07-09T09:00:00.000Z' });
  assert.ok(msg.includes('תאריך הביקור תוקן'), 'must call out the date correction');
  assert.ok(msg.includes('7.7.2026') && msg.includes('9.7.2026'), 'must show both dates, got: ' + msg);
});
check('an unchanged save produces NO comment (never spam the task)', () => {
  assert.equal(noteFn(base, { ...base }), '', 'a no-op edit must produce no message');
});
check('other field changes are reported too', () => {
  assert.ok(noteFn(base, { ...base, visitor: 'ניתאי' }).includes('מבצע הביקור'));
  assert.ok(noteFn(base, { ...base, workday: true }).includes('משך'));
  assert.ok(noteFn(base, { ...base, contact: 'רותם' }).includes('איש קשר'));
  assert.ok(noteFn(base, { ...base, products: [{ name: 'מונה', qty: 5 }] }).includes('מוצרים'));
  assert.ok(noteFn(base, { ...base, summary: 'אחר' }).includes('הסיכום עודכן'));
});
check('product order does not create a phantom change', () => {
  const a = { ...base, products: [{ name: 'א', qty: 1 }, { name: 'ב', qty: 2 }] };
  const b = { ...base, products: [{ name: 'ב', qty: 2 }, { name: 'א', qty: 1 }] };
  assert.equal(noteFn(a, b), '', 'reordered products are not a change');
});
check('the updated summary is appended for context', () => {
  const msg = noteFn(base, { ...base, date: '2026-07-09T09:00:00.000Z' });
  assert.ok(msg.includes('הסיכום המעודכן'), 'the comment should carry the current summary');
});
check('pushVisitEditToEms sends a COMMENT and never PATCHes the task', () => {
  const f = lift(cal, 'pushVisitEditToEms');
  assert.ok(/emsWriteOrQueue\(\{ kind: 'comment'/.test(f), 'must post a comment');
  assert.ok(!/kind: 'status'/.test(f) && !/PATCH/.test(f) && !/expectedCompletionDate/.test(f),
    'must NOT change task status or due date — that would move EMS planning');
  assert.ok(/if \(!taskId \|\| !msg\) return/.test(f), 'no task or no change → no push');
});
check('the edit push fires only for a linked EDIT with no in-form intent (no double comment)', () => {
  assert.ok(/if \(isEditing && linkedEmsTaskId && !emsIntent && prevVisit/.test(visits),
    'guard must require: editing + a stored link + no emsIntent');
});
check('the pre-edit snapshot is captured before the new visit object is built', () => {
  assert.ok(visits.indexOf('const prevVisit = window.editingVisitId') < visits.indexOf('const visit = {'),
    'prevVisit must be read before `visit` is constructed');
  assert.ok(/const linkedEmsTaskId = \(prevVisit && prevVisit\.emsTaskId\) \|\| ''/.test(visits));
});

console.log('\n— field days are editable from נוכחות —');
check('field visits carry their visitId through the merge', () => {
  assert.ok(/visitId: f\.id \|\| ''/.test(att), 'merged field visits need visitId');
});
check('a single-visit day opens the visit editor directly; a multi-visit day expands to pick', () => {
  assert.ok(/const single = editableVisits\.length === 1/.test(att));
  assert.ok(/single \? `openVisitFromAttendance\('\$\{attJsStr\(editableVisits\[0\]\.visitId\)\}'\)` : `toggleAttDetail\(\$\{i\}\)`/.test(att),
    'one visit → open it; several → expand so the user picks which');
});
check('a multi-visit day is expandable even when no visit has a summary', () => {
  assert.ok(/fieldDetail\.length \|\| \(canEd && editableVisits\.length > 1\)/.test(att),
    'otherwise a 2-kibbutz day with no summaries could never be picked apart');
});
check('each visit line in the detail has its own edit control', () => {
  assert.ok(/openVisitFromAttendance\('\$\{attJsStr\(v\.visitId\)\}'\)/.test(att), 'per-visit ✏️ missing');
});
check('openVisitFromAttendance resolves the visit GLOBALLY, not just the open kibbutz', () => {
  const f = lift(att, 'openVisitFromAttendance');
  assert.ok(/loadAllVisitsCombined/.test(f), 'must look the visit up across all visits');
  assert.ok(/openEditModal\(card\)/.test(f) && /editVisit\(String\(visitId\)\)/.test(f),
    'must open the kibbutz card (fills currentKibbutzVisits) before handing to editVisit');
  assert.ok(f.indexOf('openEditModal(card)') < f.indexOf('editVisit(String(visitId))'),
    'editVisit reads currentKibbutzVisits, so the card must be opened first');
});
check('openVisitFromAttendance enforces the same permission rule as attendance edits', () => {
  const f = lift(att, 'openVisitFromAttendance');
  assert.ok(/canEditAttendanceOf\(v\.visitor\)/.test(f), 'must gate on the visit OWNER');
});
check('openVisitFromAttendance fails safely on a missing visit or missing kibbutz card', () => {
  const f = lift(att, 'openVisitFromAttendance');
  assert.ok(/if \(!v\) \{ alert/.test(f), 'unknown visit must alert, not throw');
  assert.ok(/if \(!card\) \{ alert/.test(f), 'missing kibbutz card must alert, not throw');
});
check('saving a visit patches the snapshot so נוכחות shows the new date immediately', () => {
  assert.ok(/SHEET_DATA\.visits\.find\(x => String\(x\.id\) === String\(savedId\)\)/.test(visits));
  assert.ok(/renderAttendanceReport\(\)/.test(visits), 'attendance must re-render after a visit save');
});

console.log('\n— the standalone visits report is gone, its tools survive —');
check('generateVisitsReport / buildVisitsReport are removed from the BUNDLE (not just unreferenced)', () => {
  assert.ok(!/function generateVisitsReport/.test(bundle), 'generateVisitsReport must be deleted');
  assert.ok(!/function buildVisitsReport/.test(bundle), 'buildVisitsReport must be deleted');
});
check('no markup still calls the removed report', () => {
  assert.ok(!/generateVisitsReport/.test(html) && !/openVisitsReportModal/.test(html),
    'index.html must not reference removed functions');
  assert.ok(!/דוח ביקורים<\/button>/.test(html), 'the my-tasks דוח ביקורים button must be gone');
});
check('the surviving tools are still wired and reachable', () => {
  ['openVisitCertPicker()', 'certRangeReport()', 'xlExportVisitsFromModal()'].forEach(fn =>
    assert.ok(html.includes(fn), 'lost tool: ' + fn));
  assert.ok(/onclick="openVisitsToolsModal\(\)"/.test(html), 'נוכחות needs the entry point to those tools');
  assert.ok(/function openVisitsToolsModal/.test(bundle), 'the opener must exist');
});
check('the tools keep the date-range inputs they read', () => {
  ['visitsReportFrom', 'visitsReportTo', 'visitsReportVisitor'].forEach(id =>
    assert.ok(html.includes('id="' + id + '"'), 'cert/Excel tools still read #' + id));
});
check('openVisitsReportHTMLView is KEPT (the Excel hub still uses it)', () => {
  assert.ok(/function openVisitsReportHTMLView/.test(bundle), 'must not be deleted — xlHub calls it');
});

console.log('\n— the monthly PDF is the one unified report —');
check('the PDF carries full visit detail (contact + products, not just the summary)', () => {
  const f = lift(att, 'downloadAttendancePDF');
  assert.ok(/🤝/.test(f), 'contact missing from the PDF');
  assert.ok(/📦/.test(f), 'products missing from the PDF');
  assert.ok(/v\.workday \? 'יום עבודה'/.test(f), 'work-day marking missing');
});
check('the PDF reports visit totals the old report used to give', () => {
  const f = lift(att, 'downloadAttendancePDF');
  assert.ok(/ביקורים ב-\$\{visitKibs\.length\} קיבוצים/.test(f), 'visit + kibbutz counts missing');
});
check('contact/products are actually carried into the row data the PDF reads', () => {
  assert.ok(/contact: v\.contact \|\| '', products: v\.products \|\| \[\]/.test(att), 'fieldRows must carry them');
  assert.ok(/contact: f\.contact \|\| '', products: f\.products \|\| \[\]/.test(att), 'the merge must carry them');
});
check('PDF escapes visit text (summary/contact/products are user input)', () => {
  const f = lift(att, 'downloadAttendancePDF');
  assert.ok(/const esc = s =>[\s\S]*?replace\(\/</.test(f), 'visit fields must be HTML-escaped');
  assert.ok(/esc\(v\.summary\)/.test(f) && /esc\(v\.contact\)/.test(f) && /esc\(extra\)/.test(f),
    'summary, contact and products must all go through esc()');
});

console.log(failures === 0 ? '\nPASS — all attendance-hub checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
