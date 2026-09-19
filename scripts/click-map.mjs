#!/usr/bin/env node
// Click-to-action map (Task 31 audit D, dimension 14).
//
// Statically walks every clickable in the app — legacy inline `onclick="…"`, legacy
// `addEventListener('click' …)`, and React `onClick=` / `onSubmit=` — resolves each one to its
// handler, and classifies the BACKEND CALL that handler reaches (EMS op, Supabase table, edge
// function, GitHub mode, Apps Script sheet, bus event) plus whether the handler shows a PENDING
// state (setBtnLoading / disabled / isPending / busy / Loader2 / Skeleton / toast).
//
// Output: docs/click-map.md. Deterministic — safe to diff in CI.
//   node scripts/click-map.mjs            → writes docs/click-map.md
//   node scripts/click-map.mjs --check    → exits 1 if the file on disk is stale
//
// Heuristic by design: it reads source text, not a type graph. Its job is to make an unreviewable
// surface reviewable and to flag handlers with a backend call and NO pending state — those rows
// are the input to qa/playwright/tests/pending-states.spec.ts.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'click-map.md');

// ── file collection ────────────────────────────────────────────────────────────
function walk(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, exts, acc); }
    else if (exts.some(x => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
const read = p => fs.readFileSync(p, 'utf8');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

// ── backend-call detectors ─────────────────────────────────────────────────────
const DETECTORS = [
  [/emsWriteOrQueue\s*\(/g, () => 'EMS write (queued when offline)'],
  [/changeEmsStatus\s*\(/g, () => 'EMS status'],
  [/emsApi\s*\(\s*['"`]([^'"`]+)/g, m => `EMS ${m[1]}`],
  [/sigma\.ems\.(\w+)\s*\(/g, m => `EMS gateway.${m[1]}`],
  [/emsGateway\(\)\.(\w+)\s*\(/g, m => `EMS gateway.${m[1]}`],
  [/\/functions\/v1\/([\w-]+)/g, m => `edge fn ${m[1]}`],
  [/functions\.invoke\(\s*['"`]([\w-]+)/g, m => `edge fn ${m[1]}`],
  [/mode:\s*['"`](\w+)['"`]/g, m => `github mode:${m[1]}`],
  [/\/rest\/v1\/([\w]+)/g, m => `supabase ${m[1]}`],
  [/\.from\(\s*['"`]([\w]+)['"`]\s*\)/g, m => `supabase ${m[1]}`],
  [/SHEET_API/g, () => 'apps-script sheet'],
  [/sheetPost\s*\(\s*['"`]?(\w+)?/g, m => `apps-script ${m[1] || 'post'}`],
  [/sigmaEmit\s*\(\s*['"`]([\w-]+)/g, m => `bus ${m[1]}`],
  [/dispatchEvent\(\s*new CustomEvent\(\s*['"`]([\w-]+)/g, m => `bus ${m[1]}`],
  [/\.mutate(?:Async)?\s*\(/g, () => 'mutation'],
  [/queryClient\.invalidateQueries/g, () => 'refetch'],
];
const PENDING = [
  [/setBtnLoading\s*\(/, 'setBtnLoading'],
  [/\.disabled\s*=\s*true/, 'disabled=true'],
  [/disabled=\{/, 'disabled prop'],
  [/isPending/, 'isPending'],
  [/\bbusy\b/, 'busy state'],
  [/\bsaving\b|\bsending\b/, 'saving/sending state'],
  [/Loader2|btn-spinner|animate-spin/, 'spinner'],
  [/Skeleton/, 'Skeleton'],
  [/toast\.(promise|loading)/, 'toast.promise'],
];

function classify(body) {
  const hits = new Set();
  for (const [re, fmt] of DETECTORS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) hits.add(fmt(m));
  }
  const pend = PENDING.filter(([re]) => re.test(body)).map(([, n]) => n);
  return { backend: [...hits].sort(), pending: pend };
}

// grab a balanced {...} block starting at/after `from`
function block(src, from) {
  const i = src.indexOf('{', from);
  if (i < 0) return '';
  let d = 0;
  for (let j = i; j < src.length && j < i + 40000; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
  }
  return src.slice(i, i + 4000);
}

// ── legacy (index.html + js/src) ───────────────────────────────────────────────
const legacyFiles = [path.join(ROOT, 'index.html'), ...walk(path.join(ROOT, 'js', 'src'), ['.js'])];
const defs = new Map();   // handler name → {file, line, body}
for (const f of legacyFiles.filter(f => f.endsWith('.js'))) {
  const src = read(f);
  const re = /(?:window\.(\w+)\s*=\s*(?:async\s*)?function|(?:async\s+)?function\s+(\w+)\s*\()/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1] || m[2];
    if (!name || defs.has(name)) continue;
    defs.set(name, { file: rel(f), line: lineOf(src, m.index), body: block(src, m.index) });
  }
}

const rows = [];
for (const f of legacyFiles) {
  const src = read(f);
  const seen = new Set();
  // inline onclick="name(...)"
  const re = /on(click|submit|change)\s*=\s*(["'])(.*?)\2/gs;
  let m;
  while ((m = re.exec(src))) {
    const expr = m[3].trim();
    const call = /^(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/.exec(expr);
    const name = call ? call[1] : null;
    const key = (name || expr).slice(0, 60) + '@' + rel(f);
    if (seen.has(key)) continue;
    seen.add(key);
    const d = name ? defs.get(name) : null;
    const body = d ? d.body : expr;
    const c = classify(body);
    rows.push({
      surface: 'legacy',
      where: `${rel(f)}:${lineOf(src, m.index)}`,
      trigger: `on${m[1]}`,
      handler: name || `(inline) ${expr.slice(0, 40)}`,
      impl: d ? `${d.file}:${d.line}` : '—',
      ...c,
    });
  }
  // addEventListener('click', …)
  const re2 = /addEventListener\(\s*['"`](click|submit)['"`]\s*,/g;
  while ((m = re2.exec(src))) {
    const body = block(src, m.index + m[0].length);
    const c = classify(body);
    rows.push({
      surface: 'legacy',
      where: `${rel(f)}:${lineOf(src, m.index)}`,
      trigger: `addEventListener(${m[1]})`,
      handler: '(inline listener)',
      impl: '—',
      ...c,
    });
  }
}

// ── React islands / components ─────────────────────────────────────────────────
for (const f of walk(path.join(ROOT, 'app', 'src'), ['.tsx'])) {
  if (/\.test\.tsx$/.test(f)) continue;
  const src = read(f);
  const named = new Map();
  const dre = /(?:const|function)\s+(\w+)\s*=?\s*(?:async\s*)?(?:\([^)]*\)\s*(?:=>)?|function)/g;
  let dm;
  while ((dm = dre.exec(src))) if (!named.has(dm[1])) named.set(dm[1], block(src, dm.index));
  const re = /on(Click|Submit)=\{/g;
  let m;
  while ((m = re.exec(src))) {
    const tail = src.slice(m.index + m[0].length - 1);
    const body = block(src, m.index + m[0].length - 1) || tail.slice(0, 200);
    const idOnly = /^\{\s*(\w+)\s*\}/.exec(body);
    const inner = idOnly && named.get(idOnly[1]) ? named.get(idOnly[1]) : body;
    // an inline arrow that just calls a local fn — pull that fn's body in too
    const calls = [...inner.matchAll(/\b(\w+)\s*\(/g)].map(x => x[1]).filter(n => named.has(n));
    // sibling JSX attributes of the SAME element (`disabled={saving}`, the spinner child) live
    // after the handler expression, not inside it — pull a window of them in before classifying.
    const siblings = src.slice(Math.max(0, m.index - 250), m.index + body.length + 400);
    const full = inner + calls.slice(0, 4).map(n => named.get(n)).join('\n') + '\n' + siblings;
    const c = classify(full);
    if (!c.backend.length && !c.pending.length) continue;   // pure-UI toggles: not in the map
    rows.push({
      surface: 'react',
      where: `${rel(f)}:${lineOf(src, m.index)}`,
      trigger: `on${m[1]}`,
      handler: idOnly ? idOnly[1] : '(inline)',
      impl: rel(f),
      ...c,
    });
  }
}

// ── render ─────────────────────────────────────────────────────────────────────
const withBackend = rows.filter(r => r.backend.length);
const gaps = withBackend.filter(r => !r.pending.length);
const esc = s => String(s).replace(/\|/g, '\\|');
const table = list => [
  '| # | surface | clickable (file:line) | handler | backend call | pending state |',
  '|---|---|---|---|---|---|',
  ...list.map((r, i) => `| ${i + 1} | ${r.surface} | \`${esc(r.where)}\` | \`${esc(r.handler)}\` | ${esc(r.backend.join(', ')) || '—'} | ${esc(r.pending.join(', ')) || '**none**'} |`),
].join('\n');

const md = `<!-- GENERATED by scripts/click-map.mjs — do not edit by hand. Re-run: node scripts/click-map.mjs -->
# Click → action map

Every clickable that reaches a backend, and whether its handler shows a pending state.
Generated from source text (see \`scripts/click-map.mjs\` for the detectors).

- clickables scanned: **${rows.length}** (legacy ${rows.filter(r => r.surface === 'legacy').length}, react ${rows.filter(r => r.surface === 'react').length})
- with a backend call: **${withBackend.length}**
- **with a backend call and NO pending state: ${gaps.length}** ← the pending-states backlog

## 1. Clickables with a backend call

${table(withBackend)}

## 2. Gaps — backend call, no pending state

These are the rows \`qa/playwright/tests/pending-states.spec.ts\` must cover with a delayed mock.

${table(gaps)}

## 3. Clickables with a pending state but no detected backend call

Usually a handler that delegates through a bridge the detectors do not follow — verify by hand.

${table(rows.filter(r => !r.backend.length))}
`;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? read(OUT) : '';
  if (cur !== md) { console.error('docs/click-map.md is stale — run: node scripts/click-map.mjs'); process.exit(1); }
  console.log('click-map up to date');
} else {
  fs.writeFileSync(OUT, md, 'utf8');
  console.log(`docs/click-map.md — ${rows.length} clickables, ${withBackend.length} with a backend call, ${gaps.length} without a pending state`);
}
