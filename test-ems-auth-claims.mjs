// test-ems-auth-claims.mjs — X-L1: the server-side identity claim ems-auth mints.
//
// The claim is the roster spelling or nothing at all — never "PM", never a raw email, never a
// client-chosen name. `identity.js` is dependency-free so this file can import it directly.
//
//   node test-ems-auth-claims.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import { resolveName, ROSTER } from './supabase/functions/ems-auth/identity.js';

assert.equal(resolveName({ name: 'אביאם' }, null), 'אביאם', 'the table wins');
assert.equal(resolveName(null, 'pm@sigmatec-energy.com'), 'עידן', 'the pm@ alias');
assert.equal(resolveName(null, 'PM@Sigmatec-Energy.com '), 'עידן', 'case/space tolerant');
assert.equal(resolveName({ name: 'PM' }, null), null, 'never a non-roster name');
assert.equal(resolveName(null, 'someone@x.com'), null, 'unknown → no claim');
assert.deepEqual(ROSTER, ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'מתניה', 'אליה']);

const roster = fs.readFileSync('app/src/lib/people.ts', 'utf8').match(/APP_PEOPLE[^=]*=\s*\[([^\]]+)\]/)[1];
for (const n of ROSTER) assert.ok(roster.includes(`'${n}'`), n + ' is in APP_PEOPLE');

const src = fs.readFileSync('supabase/functions/ems-auth/index.ts', 'utf8');
assert.match(src, /mintPass\(sub,\s*name \? \{ name \} : \{\}\)/, 'the EMS path mints the name claim');
assert.match(src, /mintPass\("viewer",\s*\{ viewer: true \}\)/, 'the viewer path stays name-less');
assert.match(fs.readFileSync('db/staff_identities.sql', 'utf8'), /enable row level security/);

// Audit fix (Opus 24.9): the learn-at-sign-in path (an EMS /users call with the caller's own
// token) is deleted — the seed covers every active user up front — and a miss is LOGGED, not
// silently swallowed or chased at sign-in time.
assert.doesNotMatch(src, /emsUserEmail|learnIdentity/, 'the learn-at-sign-in path must be gone (the seed covers it)');
assert.match(src, /logIdentityMissing\(sub\)/, 'a name-less sign-in is logged');
assert.match(src, /action:\s*"identity-missing"/, 'the log row uses the fixed action key the spec names');
assert.match(src, /restApi\("staff_identities"\)/, 'staff_identities lookup shares the generic REST helper (ponytail)');
assert.match(src, /restApi\("auth_attempts"\)/, 'auth_attempts shares it too — one helper, not two near-identical ones');

const seed = fs.readFileSync('scripts/seed-staff-identities.mjs', 'utf8');
assert.match(seed, /`\$\{EMS_API_BASE\}\/v1\/users\?statuses=active&take=200`/,
  'the seed must query every ACTIVE user, not only roles=admin (lockout risk)');

console.log('ems-auth claims OK');
