// test-readings-roster.mjs — who may call readings-fetch.
// Run: node test-readings-roster.mjs
import assert from 'node:assert';
import { canUseReadings, READINGS_USERS } from './supabase/functions/_shared/readingsRoster.js';
for (const n of READINGS_USERS) assert.strictEqual(canUseReadings(n), true, n);
assert.deepStrictEqual(READINGS_USERS, ['עידן', 'עמיחי', 'מתניה']);
for (const n of ['אביאם', '', null, undefined, 42]) assert.strictEqual(canUseReadings(n), false, String(n));
console.log('readings roster OK');

// db/readings_pull.sql: is_readings_user() must list exactly the same names as the roster.
import fs from 'node:fs';
const sql = fs.readFileSync(new URL('./db/readings_pull.sql', import.meta.url), 'utf8');
const fn = /create or replace function public\.is_readings_user\(\)[\s\S]*?\$\$;/.exec(sql);
assert.ok(fn, 'is_readings_user() present in db/readings_pull.sql');
const names = [...fn[0].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((n) => n !== 'name');
assert.deepStrictEqual(names, READINGS_USERS, 'SQL roster == READINGS_USERS');
assert.match(sql, /grant select \([^)]*\)\s+on public\.reading_runs/, 'reading_runs uses column grants');
assert.ok(!/grant select \([^)]*\braw\b[^)]*\)/.test(sql), 'raw is never granted to authenticated');
console.log('readings SQL roster OK');
