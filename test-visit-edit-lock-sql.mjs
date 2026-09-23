// test-visit-edit-lock-sql.mjs: the visit edit-lock DB trigger file mirrors app/src/lib/editLock.ts and is safe
// to apply and roll back. Round 5 grill round 5 (binding).
//   node test-visit-edit-lock-sql.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./db/visit_edit_lock_trigger.sql', import.meta.url), 'utf8');
const code = s => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

assert.match(sql, /^-- NOT APPLIED\./m, 'carries the NOT APPLIED header');
assert.match(code(sql), /create or replace function public\.visit_editable_until/i);
assert.match(code(sql), /date_trunc\('month', d\) \+ interval '1 month' \+ interval '9 days'/i, 'same formula as editableUntil()');
assert.match(code(sql), /d < date '2026-09-01'/i, 'same floor as isLocked()');
assert.match(code(sql), /before insert or update or delete on public\.visits/i, 'guards insert, update AND delete');
assert.match(code(sql), /create or replace function/i);
assert.match(code(sql), /drop trigger if exists visit_edit_lock/i, 'idempotent (drop + recreate)');
assert.ok(!/drop table|truncate/i.test(code(sql)), 'the migration deletes nothing');
assert.match(sql, /-- Verify/);
assert.match(sql, /-- ROLLBACK/);

// the SQL's Verify block states the same 4 cases the TS goldens check (app/src/lib/editLock.test.ts E1, L1-L3);
// this only pins the SQL text, since node cannot import the .ts module without a loader (repo convention:
// see test-daylog.mjs, test-ems-labels.mjs, which also assert on the source text rather than importing it).
assert.match(sql, /select public\.visit_editable_until\('2026-09-05'\);\s*-- 2026-10-10/);
assert.match(sql, /select public\.visit_edit_locked\('2026-08-31', '2026-09-01'::timestamptz\);\s*-- true/);
assert.match(sql, /select public\.visit_edit_locked\('2026-09-05', '2026-09-23'::timestamptz\);\s*-- false/);
assert.match(sql, /select public\.visit_edit_locked\('2026-09-05', '2026-10-11'::timestamptz\);\s*-- true/);

console.log('test-visit-edit-lock-sql: ok');
