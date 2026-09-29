// test-html-guard.mjs — index.html vs. the code that talks to it (r9 guard-html).
//
// Merges of index.html silently dropped markup three times (loginModal/authGate/toast, the Σ
// home button, #emsstats-view). HTML has no compiler, and test-html-structure.mjs only checks a
// hand-written list. This runner DERIVES its expectations from the source, so a page/handler/id
// added tomorrow is covered without touching the list:
//
//   1. every page reachable through showPage / canShowPage / the SigmaPage union (bridge.ts) /
//      ⋯ עוד menu entries / showPage('x') call sites has its `#<page>-view` container, and the
//      island mount div main.tsx pairs with that view (`getElementById('x-view')` …
//      `getElementById('sigma-…')`)
//   2. every inline handler in index.html (onclick="…", href="javascript:…", …) calls a function
//      that is a real GLOBAL of the legacy bundle (top-level in js/src — build.mjs concatenates
//      it in one scope) or is assigned to `window` (js/src, or the React side via the bridge);
//      `window.sigma.<m>()` calls need <m> on the bridge object. Reverse: every `window.sigmaX`
//      that any source file reads is assigned somewhere.
//   3. every id that js/src or app/src looks up by literal (getElementById('x'),
//      querySelector('#x'), mount('x', …)) exists in index.html — unless the source itself
//      creates that id at runtime (detected: `id="x"`, `.id = 'x'`, `id: 'x'`) or it is on the
//      allow-list below, each with the reason.
//
//   node test-html-guard.mjs
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url)); // decodes %20 (a space in the checkout path)
const read = p => readFileSync(join(root, p), 'utf8').split('\r\n').join('\n');
const html = read('index.html');
const problems = [];
let checks = 0;
const need = (cond, msg) => { checks++; if (!cond) problems.push(msg); };

const walk = (d, out = []) => {
  for (const f of readdirSync(join(root, d))) {
    if (f === 'node_modules') continue;
    const rel = d + '/' + f;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
};
const isTest = f => /\.test\.|__tests__|\.spec\./.test(f);
const legacy = readdirSync(join(root, 'js/src')).filter(f => f.endsWith('.js')).sort().map(f => 'js/src/' + f);
const react = walk('app/src').filter(f => /\.(ts|tsx)$/.test(f) && !isTest(f));
const sources = [...legacy, ...react].map(f => ({ f, s: read(f) }));
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

const htmlIds = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));

// ═══ 1. pages ════════════════════════════════════════════════════════════════════════════
const pages = new Map();   // page → where it was derived from
const addPage = (p, why) => { if (!pages.has(p)) pages.set(p, why); };

const bridgeTs = read('app/src/bridge.ts');
const union = /export type SigmaPage\s*=([^;]+);/.exec(bridgeTs);
need(union, 'app/src/bridge.ts: `export type SigmaPage = …` not found — the guard cannot derive the page list');
for (const m of (union?.[1] || '').matchAll(/'([a-z]+)'/g)) addPage(m[1], 'SigmaPage union (bridge.ts)');

const bridgeJs = read('js/src/00-bridge.js');
const cs = /function canShowPage\(page\)\s*\{([\s\S]*?)\n    \}\n/.exec(bridgeJs);
need(cs, 'js/src/00-bridge.js: canShowPage(page) switch not found');
for (const m of (cs?.[1] || '').matchAll(/case '([a-z]+)'/g)) addPage(m[1], 'canShowPage (00-bridge.js)');

const init = read('js/src/02-init-attendance.js');
const sp = /function showPage\(page, opts\)\s*\{([\s\S]*?)\n  \}\n/.exec(init);
need(sp, 'js/src/02-init-attendance.js: showPage(page, opts) not found');
for (const m of (sp?.[1] || '').matchAll(/page === '([a-z]+)'/g)) addPage(m[1], 'showPage gate ladder');
for (const m of (sp?.[1] || '').matchAll(/\b([a-z]+): '\1-view'/g)) addPage(m[1], 'showPage page→view map');
for (const m of (sp?.[1] || '').matchAll(/getElementById\('([a-z]+)-view'\)/g)) addPage(m[1], 'showPage display flip');

const retired = new Set([...(/RETIRED_PAGES = \{([^}]*)\}/.exec(init)?.[1] || '').matchAll(/(\w+):/g)].map(m => m[1]));

const more = read('app/src/components/MoreSheet.tsx');
for (const m of more.matchAll(/\{ page: '([a-z]+)'/g)) addPage(m[1], '⋯ עוד menu (MoreSheet.tsx)');
for (const { f, s } of sources) {
  for (const m of s.matchAll(/\b(?:showPage|goTo|navigate)\(\s*['"]([a-z]+)['"]/g)) addPage(m[1], `showPage('${m[1]}') call in ${f}`);
}
for (const p of retired) pages.delete(p);   // redirected to 'kibbutz' on purpose
// canShowPage gate KEYS that are sections of a page, not pages (the field hub's IP section) — no own view
for (const p of ['modbus']) pages.delete(p);

// the island mount div main.tsx pairs with each view
const main = read('app/src/main.tsx');
const mountOf = new Map();
for (const m of main.matchAll(/getElementById\('([a-z]+)-view'\)[\s\S]{0,160}?getElementById\('(sigma-[\w-]+)'\)/g)) mountOf.set(m[1], m[2]);

for (const [p, why] of [...pages].sort()) {
  need(htmlIds.has(`${p}-view`),
    `index.html is missing <div id="${p}-view"> — page '${p}' (from ${why}); showPage('${p}') would blank the app`);
  if (mountOf.has(p)) {
    need(htmlIds.has(mountOf.get(p)),
      `index.html is missing <div id="${mountOf.get(p)}"> — the island main.tsx mounts into #${p}-view`);
  }
}
need(pages.size >= 8, `derived only ${pages.size} pages (${[...pages.keys()]}) — the source patterns drifted, fix the guard`);
need(mountOf.size >= 5, `derived only ${mountOf.size} view→island mounts from main.tsx — the pattern drifted, fix the guard`);

// ═══ 2. handlers ═════════════════════════════════════════════════════════════════════════
// Globals reachable from an inline handler:
//  · a top-level `function x` / `var|let|const x` in the legacy bundle. build.mjs concatenates
//    js/src/*.js at TOP LEVEL (indent 2 in the sources); a column-0 `(function(){ … })();`
//    wrapper (22-push.js) or a nested block hides what is inside it.
//  · anything assigned to window: `window.x =`, `(window as any).x =`, `w.x =`, `window['x'] =`,
//    Object.assign(window, { x, … }), Object.defineProperty(window, 'x', …).
const globals = new Set();
for (const f of legacy) {
  let wrapped = false;
  for (const line of read(f).split('\n')) {
    if (/^\((?:async )?(?:function|\(\))/.test(line)) wrapped = true;
    else if (/^\}\)\(\)/.test(line)) { wrapped = false; continue; }
    if (wrapped) continue;
    const m = /^  (?:async )?function\*?\s+([\w$]+)\s*\(/.exec(line) || /^  (?:var|let|const)\s+([\w$]+)\s*=/.exec(line);
    if (m) globals.add(m[1]);
  }
}
for (const { s } of sources) {
  for (const m of s.matchAll(/(?:\bwindow|\bw|globalThis)(?:\s+as\s+any\))?\s*\.\s*([\w$]+)\s*=(?!=)/g)) globals.add(m[1]);
  for (const m of s.matchAll(/\(\s*(?:window|w)\s+as\s+any\s*\)\s*\.\s*([\w$]+)\s*=(?!=)/g)) globals.add(m[1]);
  for (const m of s.matchAll(/\bwindow\s*\[\s*['"]([\w$]+)['"]\s*\]\s*=(?!=)/g)) globals.add(m[1]);
  for (const m of s.matchAll(/Object\.defineProperty\(\s*window\s*,\s*['"]([\w$]+)['"]/g)) globals.add(m[1]);
  for (const m of s.matchAll(/Object\.assign\(\s*window\s*,\s*\{([^}]*)\}/g)) {
    for (const k of m[1].matchAll(/([\w$]+)\s*[:,}]?/g)) globals.add(k[1]);
  }
}
const BUILTIN = new Set(('if for while switch return typeof void new delete function catch with in of else do try ' +
  'event this window document navigator location history console alert confirm prompt open close print ' +
  'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame fetch ' +
  'Math JSON Number String Boolean Array Object Date RegExp Promise Error parseInt parseFloat isNaN isFinite ' +
  'encodeURIComponent decodeURIComponent encodeURI decodeURI localStorage sessionStorage ' +
  'stopPropagation preventDefault').split(' '));

// bridge methods: `name:` / `name(` keys of the object literal in 00-bridge.js, or `sigma.name =`
// assigned by the React side (main.tsx sets sigma.toast, gateway sets sigma.ems …).
const bridgeMethods = new Set();
for (const m of bridgeJs.matchAll(/^\s{6}([\w$]+)\s*(?::|\()/gm)) bridgeMethods.add(m[1]);
for (const { s } of sources) for (const m of s.matchAll(/\bsigma\s*\.\s*([\w$]+)\s*=(?!=)/g)) bridgeMethods.add(m[1]);

// inline handler attribute values (double- or single-quoted) + javascript: hrefs
const handlerRe = /\s(on[a-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')|\shref\s*=\s*"javascript:([^"]*)"/g;
const used = new Map();       // global name → first "line:attr"
const usedBridge = new Map(); // bridge method → first "line:attr"
for (const m of html.matchAll(handlerRe)) {
  const at = `index.html:${lineOf(html, m.index)}`;
  let code = m[2] ?? m[3] ?? m[4] ?? '';
  code = code.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");           // drop string contents
  for (const b of code.matchAll(/\bwindow\.sigma\.([\w$]+)/g)) if (!usedBridge.has(b[1])) usedBridge.set(b[1], at);
  code = code.replace(/\bwindow\.sigma\.[\w$]+/g, '');
  for (const c of code.matchAll(/(?<![\w$.])(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!BUILTIN.has(c[1]) && !used.has(c[1])) used.set(c[1], `${at} ${m[1] || 'href'}`);
  }
  for (const c of code.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*\|\|/g)) {   // window.sigmaGoHome||fallback
    if (!used.has(c[1])) used.set(c[1], `${at} ${m[1] || 'href'}`);
  }
}
for (const [name, where] of used) {
  need(globals.has(name),
    `${where}: inline handler calls ${name}() but no top-level function ${name} exists in js/src and nothing assigns window.${name} — a click would throw ReferenceError`);
}
for (const [name, where] of usedBridge) {
  need(bridgeMethods.has(name), `${where}: inline handler calls window.sigma.${name}() which the bridge (js/src/00-bridge.js) does not define`);
}
need(used.size >= 20, `derived only ${used.size} inline-handler functions from index.html — the extraction drifted, fix the guard`);

// reverse: every window.sigmaX / w.sigmaX any source reads has an assignment somewhere
const sigmaAssigned = new Set([...globals].filter(g => /^sigma[A-Z]/.test(g)));
const sigmaRead = new Map();
for (const { f, s } of sources) {
  for (const m of s.matchAll(/\b(?:window|w)(?:\s+as\s+any\))?\s*\.\s*(sigma[A-Z][\w$]*)/g)) {
    if (!sigmaRead.has(m[1])) sigmaRead.set(m[1], `${f}:${lineOf(s, m.index)}`);
  }
}
for (const m of html.matchAll(/window\.(sigma[A-Z][\w$]*)/g)) if (!sigmaRead.has(m[1])) sigmaRead.set(m[1], `index.html:${lineOf(html, m.index)}`);
// Extra assignment shapes for the sigma* hooks: `(window as any).sigmaX ??= …`, `||=`, and
// `Object.assign`. globals[] covers `=`; widen for the logical-assignment operators.
for (const { s } of sources) for (const m of s.matchAll(/\b(?:window|w)(?:\s+as\s+any\))?\s*\.\s*(sigma[A-Z][\w$]*)\s*(?:\?\?|\|\||&&)=/g)) sigmaAssigned.add(m[1]);
// the assignment goes through a name constant: `export const VISIT_CHAPTERS_API = 'sigmaVisitChapters'`
for (const { s } of sources) for (const m of s.matchAll(/const\s+[A-Z_]+_API\s*=\s*'(sigma[A-Z][\w$]*)'/g)) sigmaAssigned.add(m[1]);
for (const [name, where] of sigmaRead) {
  need(sigmaAssigned.has(name), `${where}: reads window.${name} but nothing in js/src, app/src or index.html assigns it`);
}

// ═══ 3. looked-up ids ════════════════════════════════════════════════════════════════════
// Ids that are NOT in index.html on purpose. Auto-accepted: any id the source creates itself at
// runtime (detected below). Listed here: lookups where that detection cannot see the creation,
// or where the element is retired legacy markup and the lookup is dead/guarded code.
const ALLOW = {
  // dead legacy code — the markup went with the 2.00 React rewrite, the functions have no callers
  // left (verified: no reference from index.html, no other call site) or return before the lookup.
  copyBtn: 'legacy copyLink() in 01-data.js — no caller; the cert copy-link button lives in InventoryCert.tsx',
  invCertsFrom: 'legacy certificate range chips (20/21) — React InventoryCert has its own; every entry point returns early on the missing section',
  invCertsTo: 'as invCertsFrom',
  invCertsSearch: 'as invCertsFrom',
  invCertsList: 'as invCertsFrom (guarded: `if (!root || !section) return`)',
  invCertsNew: 'as invCertsFrom (null-guarded)',
  'inv-section-certs': 'as invCertsFrom (null-guarded)',
  invRequirementsList: 'retired legacy requirements list, null-guarded (`if (!root) return`)',
  invReqFilter: 'retired legacy filter, optional-chained',
  visitReturnedList: 'retired legacy visit form, null-guarded',
  visitSource: 'retired legacy visit form (package V), null-guarded',
  aviamDayTypeSelector: 'retired legacy visit form, null-guarded',
  visitFieldForm: 'only reached after the aviamDayTypeSelector guard, which is null for a retired form',
  visitSimpleForm: 'as visitFieldForm',
  visitSummary: 'legacy voice-dictation target, reached only when a visit form was open',
  visitor: 'legacy visit <select>, read as `(el && el.value) || ""`',
  emsSiteAudit: 'retired legacy EMS panel, null-guarded (`if (!box) return`)',
  emsQueueChip: 'created by the EMS queue chip code path or absent by design, null-guarded',
};
const created = new Set();
for (const { s } of sources) {
  for (const m of s.matchAll(/\bid\s*[=:]\s*\\?["']([\w-]+)/g)) created.add(m[1]);
  for (const m of s.matchAll(/\.id\s*=\s*['"]([\w-]+)['"]/g)) created.add(m[1]);
  for (const m of s.matchAll(/setAttribute\(\s*['"]id['"]\s*,\s*['"]([\w-]+)['"]/g)) created.add(m[1]);
}
const lookups = new Map();  // id → "file:line"
const lookupRe = /getElementById\(\s*(['"`])([^'"`$\\]+)\1\s*\)|querySelector(?:All)?\(\s*(['"`])#([\w-]+)(?:[ .:\[>][^'"`]*)?\3\s*\)|\bmount(?:Eager)?\(\s*'([\w-]+)'/g;
for (const { f, s } of sources) {
  for (const m of s.matchAll(lookupRe)) {
    const id = m[2] || m[4] || m[5];
    if (id && !lookups.has(id)) lookups.set(id, `${f}:${lineOf(s, m.index)}`);
  }
}
let allowUsed = 0;
for (const [id, where] of [...lookups].sort()) {
  if (htmlIds.has(id)) continue;
  if (created.has(id)) continue;
  if (ALLOW[id]) { allowUsed++; continue; }
  need(false, `${where}: looks up #${id}, but index.html has no id="${id}" and no source creates it — a merge may have dropped that markup (allow-list it in test-html-guard.mjs, with a reason, only if it is dynamic/dead on purpose)`);
}
for (const id of Object.keys(ALLOW)) {   // a stale allow-list entry hides a future regression
  need(lookups.has(id) && !htmlIds.has(id) && !created.has(id),
    `ALLOW['${id}'] is stale: ${htmlIds.has(id) ? 'index.html now has it' : created.has(id) ? 'the source now creates it' : 'nothing looks it up any more'} — remove the entry`);
}
need(lookups.size >= 60, `derived only ${lookups.size} looked-up ids — the extraction drifted, fix the guard`);

// ═══ report ══════════════════════════════════════════════════════════════════════════════
if (problems.length) {
  console.error(`test-html-guard: ${problems.length} problem(s)\n  - ` + problems.join('\n  - '));
  process.exit(1);
}
console.log(`test-html-guard: ${checks} checks passed (${pages.size} pages, ${mountOf.size} view mounts, `
  + `${used.size} handler globals, ${usedBridge.size} bridge calls, ${sigmaRead.size} window.sigma* hooks, `
  + `${lookups.size} looked-up ids, ${allowUsed} allow-listed).`);
