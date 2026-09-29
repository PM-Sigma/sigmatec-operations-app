// test-readings-roster.mjs — who may call readings-fetch.
// Run: node test-readings-roster.mjs
import assert from 'node:assert';
import { canUseReadings, READINGS_USERS } from './supabase/functions/_shared/readingsRoster.js';
for (const n of READINGS_USERS) assert.strictEqual(canUseReadings(n), true, n);
assert.deepStrictEqual(READINGS_USERS, ['עידן', 'עמיחי', 'מתניה']);
for (const n of ['אביאם', '', null, undefined, 42]) assert.strictEqual(canUseReadings(n), false, String(n));
console.log('readings roster OK');
