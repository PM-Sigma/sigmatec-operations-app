// test-attendance-source-sql.mjs: the attendance.source migration + visit backfill are idempotent and scoped.
//   node test-attendance-source-sql.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const mig = readFileSync(new URL('./db/attendance_source.sql', import.meta.url), 'utf8');
const bf = readFileSync(new URL('./db/attendance_visit_backfill.sql', import.meta.url), 'utf8');
const code = s => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

assert.match(mig, /^-- NOT APPLIED\./m, 'migration carries the NOT APPLIED header');
assert.match(code(mig), /add column if not exists source text not null default 'manual'/i);
assert.match(code(mig), /check \(source in \('manual', 'visit_auto', 'calendar'\)\)/i);
assert.match(code(mig), /update public\.attendance set source = 'visit_auto' where source = 'visit'/i);
assert.match(code(mig), /create unique index if not exists attendance_visit_auto_day[\s\S]*where source = 'visit_auto'/i);
assert.ok(!/drop table|truncate|delete from/i.test(code(mig)), 'the migration deletes nothing');

assert.match(bf, /^-- NOT APPLIED\./m);
assert.match(bf, /AFTER db\/attendance_source\.sql/);
assert.match(code(bf), /regexp_split_to_table\(coalesce\(v\.visitor, ''\), '\\s\*,\\s\*'\)/, 'same split as visitorsOf');
assert.match(code(bf), /in \('אביאם', 'ניתאי'\)/, 'only the two filers');
assert.match(code(bf), /not exists \(\s*select 1 from public\.attendance a where a\.person = d\.person and left\(a\.date, 10\) = d\.ymd\s*\)/i,
  'a day with ANY row is skipped (manual wins)');
assert.match(code(bf), /on conflict \(id\) do nothing/i, 're-running inserts nothing twice');
assert.match(code(bf), /'att_v_' \|\| replace\(d\.ymd, '-', ''\) \|\| '_' \|\| d\.person/, 'deterministic id');
assert.match(bf, /-- Verify/);
assert.match(bf, /-- ROLLBACK/);
console.log('test-attendance-source-sql: ok');
