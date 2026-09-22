// test-last-visit-line.mjs — the one line under a kibbutz card (עידן 22.9, D5):
//   · "📍 ביקור אחרון · d.m.yy" when there is a visit;
//   · when an open EMS task's due date has passed and no visit followed it, the line is the
//     DUE date, red, and says "ללא סיכום ביקור!" — the card tells the person a visit was owed.
// The rule is the pure `lastVisitLine()` in js/src/10-activity.js (LASTVISIT-PURE markers).
//   node test-last-visit-line.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./js/src/10-activity.js', import.meta.url), 'utf8');
const a = src.indexOf('// LASTVISIT-PURE-START'), b = src.indexOf('// LASTVISIT-PURE-END');
assert.ok(a > 0 && b > a, 'the LASTVISIT-PURE markers must wrap lastVisitLine()');
const lastVisitLine = new Function(src.slice(a, b) + '\nreturn lastVisitLine;')();

const today = new Date(2026, 8, 22);   // 22.9.2026
const visit = { date: '2026-09-10T12:00:00.000Z', visitor: 'אביאם' };

// no visit, no task → nothing
assert.equal(lastVisitLine(null, [], today), null);

// a visit, no overdue task → the visit date
assert.deepEqual(lastVisitLine(visit, [], today), { text: '📍 ביקור אחרון · 10.9.26', late: false });
// a visit and a task due in the future → still the visit
assert.deepEqual(lastVisitLine(visit, [{ expectedCompletionDate: '2026-10-01', status: 'new' }], today),
  { text: '📍 ביקור אחרון · 10.9.26', late: false });

// a task due 15.9, no visit after it → the due date, late
assert.deepEqual(lastVisitLine(visit, [{ expectedCompletionDate: '2026-09-15', status: 'in_progress' }], today),
  { text: '⏰ ביקור אחרון · 15.9.26 · ללא סיכום ביקור!', late: true });
// …and with no visit at all
assert.deepEqual(lastVisitLine(null, [{ expectedCompletionDate: '2026-09-15', status: 'new' }], today),
  { text: '⏰ ביקור אחרון · 15.9.26 · ללא סיכום ביקור!', late: true });
// a visit AFTER the due date settles it
assert.deepEqual(lastVisitLine({ date: '2026-09-16T12:00:00.000Z' }, [{ expectedCompletionDate: '2026-09-15', status: 'new' }], today),
  { text: '📍 ביקור אחרון · 16.9.26', late: false });
// due TODAY is not late (day granularity), a closed task never counts
assert.deepEqual(lastVisitLine(null, [{ expectedCompletionDate: '2026-09-22', status: 'new' }], today), null);
assert.deepEqual(lastVisitLine(null, [{ expectedCompletionDate: '2026-09-01', status: 'done' }], today), null);
// the OLDEST overdue due date is the one shown
assert.equal(lastVisitLine(null, [
  { expectedCompletionDate: '2026-09-15', status: 'new' }, { expectedCompletionDate: '2026-09-03', status: 'new' },
], today).text, '⏰ ביקור אחרון · 3.9.26 · ללא סיכום ביקור!');

console.log('✅ test-last-visit-line: 9 cases green');
