// test-github-gate.mjs — X-L8: who may WRITE through the `github` function.
//
// עידן's approval (23.9/24.9): setStatus / setPriority / createIssue — every write mode, no
// narrower carve-out — are עידן / עמיחי / מתניה only. Reads (the default path, listParents)
// stay open to any EMS-valid staff login, unchanged. Wired once package D's `chainOf` import
// landed (round-5 merge order); deployment is a separate step, not run here.
//
//   node test-github-gate.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import { canWrite, WRITERS } from './supabase/functions/github/gate.js';

assert.deepEqual(WRITERS, ['עידן', 'עמיחי', 'מתניה']);
assert.equal(canWrite('מתניה'), true, 'מתניה is in the approved roster');
assert.equal(canWrite('עידן'), true);
assert.equal(canWrite('עמיחי'), true);
assert.equal(canWrite('אביאם'), false, 'not in the roster → no write');
assert.equal(canWrite('ניתאי'), false);
assert.equal(canWrite('אליה'), false);
assert.equal(canWrite('אבצן'), false);
assert.equal(canWrite(null), false, 'no name → no write');
assert.equal(canWrite(undefined), false);
assert.equal(canWrite(''), false);
assert.equal(canWrite('PM'), false, 'never a non-roster string');

// ── the wiring into index.ts ──────────────────────────────────────────────────
const idx = fs.readFileSync('supabase/functions/github/index.ts', 'utf8');

assert.match(idx, /import \{ canWrite \} from "\.\/gate\.js";/, 'index.ts imports the gate');
// Both D and X touch this file — D's lineage import must survive X's wiring.
assert.match(idx, /import \{ chainOf \} from "\.\/lineage\.js";/, "D's chainOf import must still be there");

// requireWriter must run before every write mode, and NOT before the read modes.
for (const mode of ['setStatus', 'setPriority', 'createIssue']) {
  const at = idx.indexOf(`body.mode === "${mode}"`);
  assert.ok(at !== -1, `mode ${mode} exists`);
  const after = idx.slice(at, at + 400);
  assert.match(after, /requireWriter\(req\)/, `${mode} must call requireWriter before doing anything else`);
}
{
  const at = idx.indexOf('body.mode === "listParents"');
  const next = idx.indexOf('body.mode ===', at + 5);
  const block = idx.slice(at, next === -1 ? idx.length : next);
  assert.doesNotMatch(block, /requireWriter/, 'listParents is a read — it must not be gated');
}

// The gate itself: verified against the JWT_SECRET ems-auth signs with, name read from the
// VERIFIED payload only (never body.actor or any other client-supplied field), 403 for a
// valid-but-unlisted pass, 401 for a missing/invalid one.
const gateFn = idx.slice(idx.indexOf('async function requireWriter'), idx.indexOf('Deno.serve'));
assert.match(gateFn, /verify\(pass,/, 'the pass is cryptographically verified (djwt), not just decoded');
assert.match(gateFn, /JWT_SECRET.*EMS_BRIDGE_SECRET|EMS_BRIDGE_SECRET.*JWT_SECRET/, 'the same secret ems-auth signs with');
assert.doesNotMatch(gateFn, /body\.actor|body\.name/, 'the name never comes from the request body');
assert.match(gateFn, /status: 403/, 'a verified-but-unlisted pass is refused with 403');
assert.match(gateFn, /status: 401/, 'a missing/invalid pass is refused with 401');
assert.match(gateFn, /canWrite\(name\)/, 'the roster check itself is canWrite, not a re-typed list');

// devBoard.ts sends the pass the gate verifies (not a body field, not the anon key alone).
const devBoard = fs.readFileSync('app/src/lib/devBoard.ts', 'utf8');
assert.match(devBoard, /sigma\?\.sbPass\?\.\(\)\?\.token/, 'ghCall reads the same bridge pass every authenticated table read uses');
assert.match(devBoard, /Authorization:\s*'Bearer '\s*\+\s*\(pass \|\| SB_ANON\)/, 'the pass travels in the Authorization header');

console.log('github gate OK — canWrite pinned to WRITERS, index.ts + devBoard.ts wiring verified (not deployed)');
