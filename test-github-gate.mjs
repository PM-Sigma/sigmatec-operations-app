// test-github-gate.mjs — X-L8: who may WRITE through the `github` function.
//
// STATUS: gate.js (the pure roster check) is done and pinned here. Wiring it into
// supabase/functions/github/index.ts (requireWriter before setStatus/setPriority/createIssue,
// 403 for a valid-but-unlisted staff pass, 401 for a missing/invalid one) is coordinated with
// package D, which also edits that file and merges first — see docs/superpowers/specs/
// 2026-09-23-r5-X-security-copy.md X-L8 and the round-5 merge-order note. This file gains those
// assertions in the same commit as the index.ts wiring, once that lands.
//
//   node test-github-gate.mjs
import assert from 'node:assert';
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

console.log('github gate OK (canWrite pinned to WRITERS; index.ts wiring pending D)');
