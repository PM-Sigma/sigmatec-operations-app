// test-readings-roster.mjs — who may call readings-fetch (עידן 29.9: all signed-in staff, not the viewer).
// Run: node test-readings-roster.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import { canUseReadings } from './supabase/functions/_shared/readingsRoster.js';

// The JS predicate (bridge-JWT claims): staff name -> yes, viewer -> no, no name -> no.
const cases = [
  [{ name: 'עידן' }, true], [{ name: 'אביאם' }, true], [{ name: 'אבצן', viewer: false }, true],
  [{ sub: 'viewer', viewer: true }, false], [{ name: 'עידן', viewer: true }, false],
  [{ sub: '123' }, false], [{ name: '' }, false], [{ name: '  ' }, false], [{ name: 42 }, false], [null, false], [undefined, false],
];
for (const [p, want] of cases) assert.strictEqual(canUseReadings(p), want, JSON.stringify(p));
console.log('readings roster OK');

// db/readings_pull.sql: is_readings_user() must say the same: non-empty name + not viewer.
const sql = fs.readFileSync(new URL('./db/readings_pull.sql', import.meta.url), 'utf8');
const fn = /create or replace function public\.is_readings_user\(\)[\s\S]*?\$\$;/.exec(sql);
assert.ok(fn, 'is_readings_user() present in db/readings_pull.sql');
const body = fn[0];
assert.match(body, /nullif\(btrim\(auth\.jwt\(\) ->> 'name'\), ''\) is not null/, 'SQL: non-empty name claim');
assert.match(body, /coalesce\(\(auth\.jwt\(\) ->> 'viewer'\)::boolean, false\) = false/, 'SQL: viewer claim refused');
assert.ok(!/in \('/.test(body), 'SQL has no name list any more');
assert.match(sql, /grant select \([^)]*\)\s+on public\.reading_runs/, 'reading_runs uses column grants');
assert.ok(!/grant select \([^)]*\braw\b[^)]*\)/.test(sql), 'raw is never granted to authenticated');
const fx = fs.readFileSync(new URL('./supabase/functions/readings-fetch/index.ts', import.meta.url), 'utf8');
assert.match(fx, /canUseReadings\(p\)/, 'readings-fetch checks canUseReadings(payload)');
console.log('readings SQL == JS predicate OK');
