// test-github-lineage.mjs — D-L1: the github function's parent-chain helper.
// Run: node test-github-lineage.mjs
import assert from 'node:assert';
import { chainOf } from './supabase/functions/github/lineage.js';
const L = { chainOf };
const node = { number: 5, parent: { number: 4, title: 'טופס ביקור', state: 'OPEN', parent: { number: 1, title: 'שטח', state: 'CLOSED', parent: null } } };
assert.deepStrictEqual(L.chainOf(node), [{ number: 4, title: 'טופס ביקור', state: 'OPEN' }, { number: 1, title: 'שטח', state: 'CLOSED' }]);
assert.deepStrictEqual(L.chainOf({ number: 9, parent: null }), []);
const loop = { number: 7, parent: { number: 8, title: 'x', state: 'OPEN', parent: { number: 7, title: 'y', state: 'OPEN', parent: null } } };
assert.deepStrictEqual(L.chainOf(loop).map(p => p.number), [8], 'a cycle stops at the first repeat');
console.log('github lineage OK');
