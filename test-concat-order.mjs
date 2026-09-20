// test-concat-order.mjs — the concatenation-order (TDZ) sweep. Task 34, FAIL-2.
//
// build.mjs concatenates js/src/*.js (sorted by the numeric prefix) into ONE shared top-level
// scope. `const`/`let` are hoisted but sit in the TEMPORAL DEAD ZONE until their own line runs,
// so code in an EARLY file that reads a `const` declared in a LATE file throws
// `ReferenceError: Cannot access 'X' before initialization` the moment it runs during boot —
// which is exactly how the live 2.01 bundle lost every Supabase read (task-33 FAIL-2:
// readSnapshot → sbEnsure → mintBody → getEmsToken → emsSessionExpired → `EMS_TOKEN_AT_KEY`,
// a const in 12-reports.js reached from 01-data.js).
//
// That chain is the reason this sweep is TRANSITIVE. A direct textual reference is the easy
// case; the live crash had none — file 01 only ever names `getEmsToken`, and the const is two
// hops further in. So the sweep resolves the call graph of top-level `function` declarations
// (which hoist fully, and are therefore callable early) and asks: starting from the names an
// early file mentions, can we REACH a const/let declared in a later file?
//
// The contract: **no file may reach, directly or through hoisted functions, a top-level
// `const`/`let` declared in a later file.**
//
//   node test-concat-order.mjs
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);
const DIR = new URL('./js/src/', import.meta.url);
const files = readdirSync(DIR).filter(f => f.endsWith('.js')).sort();

/**
 * A chain that is real but harmless, each with the reason. A name is exempted only when the
 * early reference cannot run before the later file has evaluated — add a line WITH a reason.
 */
const ALLOW = new Map([
  // (empty — every file is clean. Add a line WITH a reason only when a flagged chain provably
  // cannot run before the later file has evaluated.)
]);
// ── lexing ────────────────────────────────────────────────────────────────────────────────
// Strip comments and string/template bodies so a name inside prose or Hebrew copy is not a
// "reference". Deliberately crude but conservative: it only ever removes text.
function strip(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const j = src.indexOf(NL, i); i = j < 0 ? src.length : j; continue; }
    if (c === '/' && n === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === BS) i++; i++; }
      i++; out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

const idsIn = s => new Set(s.match(/[A-Za-z_$][\w$]*/g) || []);
// Bare identifiers only: never a property access (`x.name`), never part of a longer word.
const bareRe = name => new RegExp('(?<![' + BS + 'w$.])' + name.replace(/\$/g, BS + '$') + '(?![' + BS + 'w$])');

// Top-level = brace depth 0 AND an indent of at most 2 spaces. Every js/src file is flat with a
// 2-space top-level indent, so the indent check is what keeps a stray brace inside a regex
// literal from making a deeply nested `const` look like a module-level one.
function topLevelLines(src) {
  const out = [];
  let depth = 0;
  for (const raw of src.split(NL)) {
    const at = depth;
    for (const ch of raw) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (at === 0 && /^ {0,2}\S/.test(raw)) out.push(raw);
  }
  return out;
}

function topLevelConsts(src) {
  const names = new Set();
  for (const l of topLevelLines(src)) {
    const m = /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)/.exec(l);
    if (m) names.add(m[1]);
  }
  return names;
}

/** Every top-level `function NAME(…) { … }`, mapped to the identifiers in its body. */
function topLevelFunctions(src) {
  const map = new Map();
  const re = /(?:^|\n)\s{0,2}(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf('{', re.lastIndex);
    if (open < 0) continue;
    let depth = 0, i = open;
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    map.set(m[1], idsIn(src.slice(open, i)));
  }
  return map;
}

/** Names a file binds ITSELF anywhere — a reference to one of those is local, not cross-file. */
function localNames(src) {
  const names = new Set();
  const add = re => { let m; while ((m = re.exec(src))) names.add(m[1]); };
  add(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g);
  add(/function\s*\*?\s*([A-Za-z_$][\w$]*)/g);
  add(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g);
  // parameter lists and destructuring patterns
  for (const mm of src.match(/\(([^()]*)\)\s*(?:=>|\{)/g) || []) for (const id of idsIn(mm)) names.add(id);
  for (const mm of src.match(/(?:const|let|var)\s*[{[][^}\]]*[}\]]/g) || []) for (const id of idsIn(mm)) names.add(id);
  return names;
}

// ── the sweep ─────────────────────────────────────────────────────────────────────────────
const srcs = files.map(f => strip(readFileSync(new URL(f, DIR), 'utf8')));
const consts = srcs.map(topLevelConsts);
const locals = srcs.map(localNames);

// name → index of the file that declares it
const constOwner = new Map();
consts.forEach((set, i) => set.forEach(n => { if (!constOwner.has(n)) constOwner.set(n, i); }));
const fnBody = new Map();       // function name → identifiers in its body
srcs.forEach(s => topLevelFunctions(s).forEach((ids, n) => { if (!fnBody.has(n)) fnBody.set(n, ids); }));

const violations = [];
let checks = 0;

for (let i = 0; i < files.length; i++) {
  if (ALLOW.has(files[i])) continue;
  // The seed is EVAL-TIME code only: the file's statements at brace depth 0. Everything
  // inside a function body is excluded, because a body only runs when something calls it —
  // and if the caller is itself eval-time, this walk reaches it through the call graph
  // anyway. (That is the live bug exactly: `refreshData()` is a bare eval-time statement in
  // 11-search-login.js, and the const was five hops away in file 12.)
  const evalText = topLevelLines(srcs[i]).join(NL);
  const lines = srcs[i].split(NL);
  const seen = new Map();       // name → the chain that reached it
  const queue = [];
  for (const n of idsIn(evalText)) {
    if (locals[i].has(n)) continue;                       // the file binds it itself
    if (!constOwner.has(n) && !fnBody.has(n)) continue;
    checks++;
    if (bareRe(n).test(evalText) && !seen.has(n)) { seen.set(n, [n]); queue.push(n); }
  }
  // Walk the hoisted-function call graph.
  while (queue.length) {
    const cur = queue.shift();
    const chain = seen.get(cur);
    const owner = constOwner.get(cur);
    if (owner !== undefined && owner > i) {
      const head = chain[0];
      const ln = lines.findIndex(l => bareRe(head).test(l)) + 1;
      violations.push(`${files[i]}:${ln} reaches '${cur}' — a top-level const/let of ${files[owner]}`
        + (chain.length > 1 ? ' — via ' + chain.join(' → ') : '')
        + ' (TDZ if this runs at boot)');
      continue;
    }
    if (chain.length > 6) continue;                        // depth cap: the chain is already damning or noise
    for (const next of fnBody.get(cur) || []) {
      if (seen.has(next)) continue;
      if (!constOwner.has(next) && !fnBody.has(next)) continue;
      seen.set(next, chain.concat(next));
      queue.push(next);
    }
  }
}

assert.ok(violations.length === 0,
  'concat-order TDZ risk — ' + violations.length + ' forward reference(s) to a later file\'s const/let:' + NL + '  · '
  + violations.join(NL + '  · ')
  + NL + NL + 'Fix: move the declaration into the earliest file that needs it (js/src/00-consts.js).');

console.log('✅ test-concat-order.mjs — ' + files.length + ' files, ' + checks
  + ' cross-file names traced through the hoisted call graph, 0 forward const/let references');
