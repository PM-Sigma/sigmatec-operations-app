// test-visitor-equality.mjs: nothing compares visit.visitor with === / !== / .eq("visitor") / .in("visitor") any
// more (round 5 V13: מי ביקר is multi-select, so the join string can hold more than one name).
//   node test-visitor-equality.mjs
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['js/src', 'app/src', 'supabase/functions'];
const bad = [];
const walk = d => readdirSync(d).forEach(f => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return walk(p);
  if (!/\.(js|ts|tsx)$/.test(f) || /\.test\./.test(f)) return;
  readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
    if (/\.visitor\s*[!=]==|[!=]==\s*\w+\.visitor\b|\.(eq|in)\(\s*["']visitor["']/.test(l) && !/visitor-ok|VISITORS-PURE/.test(l)) bad.push(p + ':' + (i + 1) + '  ' + l.trim());
  });
});
roots.forEach(walk);
// app/src/lib/attendance.ts is package A's file (round-5-A-attendance.md §3: "V never edits it"). Its own
// equality sweep is A's to do (A-L1); this guard does not block on it, but the rest of the tree must be clean.
const bad_ = bad.filter(l => !l.startsWith(join('app', 'src', 'lib', 'attendance.ts') + ':'));
assert.deepEqual(bad_, [], 'compare through visitorsOf():\n' + bad_.join('\n'));

// the TS and JS parsers agree on the same inputs
const js = readFileSync('js/src/01-data.js', 'utf8');
const a = js.indexOf('// VISITORS-PURE-START'), b = js.indexOf('// VISITORS-PURE-END');
assert.ok(a > 0 && b > a, 'VISITORS-PURE markers');
const { visitorsOf, joinVisitors } = new Function(js.slice(a, b) + '\nreturn { visitorsOf, joinVisitors };')();
assert.deepEqual(visitorsOf('  אביאם ,, ניתאי , '), ['אביאם', 'ניתאי']);
assert.equal(joinVisitors(['אביאם', 'ניתאי', 'אביאם']), 'אביאם, ניתאי');
console.log('test-visitor-equality: ok');
