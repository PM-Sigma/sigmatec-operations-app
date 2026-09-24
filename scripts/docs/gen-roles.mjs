// scripts/docs/gen-roles.mjs — the G matrices of docs/system/roles-and-permissions.md (spec §5.5
// / §6): people -> role, role x page (canShowPage.ts's real logic, in js/src/00-bridge.js), role
// x capability (caps.ts), role x table/command (a live pg_policies pull, when one exists).
//
//   node scripts/docs/gen-roles.mjs             → refresh the GENERATED block
//   node scripts/docs/gen-roles.mjs --check       → fail when it's stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setBlock, writeIfChanged } from './gen-blocks.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PEOPLE_PATH = path.join(ROOT, 'app/src/lib/people.ts');
const CAPS_PATH = path.join(ROOT, 'app/src/lib/caps.ts');
const BRIDGE_PATH = path.join(ROOT, 'js/src/00-bridge.js');
const OUT_PATH = path.join(ROOT, 'docs/system/roles-and-permissions.md');

export function extractPeople(text) {
  const m = /APP_PEOPLE\s*=\s*\[([^\]]*)\]/.exec(text);
  const people = m ? [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2]) : [];
  const viewer = /VIEWER_NAME\s*=\s*'([^']+)'/.exec(text)?.[1] || null;
  return { people, viewer };
}

export function extractCaps(text) {
  const out = [];
  const re = /export const ([A-Z][A-Z0-9_]*)\s*=\s*([^;]+);/g;
  let m; while ((m = re.exec(text))) out.push({ name: m[1], value: m[2].trim() });
  return out;
}

/** Each `case 'page': <body>` in canShowPage()'s switch, up to the next `case`/`default`/closing
 * brace at the same depth. Returns a short FACTUAL rule (delegate function name(s), literal
 * person names it lists, and whether it reads `isViewer`) — never the code itself. */
export function extractPageRules(text) {
  const at = text.indexOf('function canShowPage(');
  if (at === -1) return [];
  const end = text.indexOf('\n    window.sigma = {', at);
  const body = text.slice(at, end === -1 ? undefined : end);
  const lines = body.split(/\r?\n/);
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  const caseRe = /case\s+'([\w-]+)'\s*:(?:\s*case\s+'([\w-]+)'\s*:)?/;
  for (let i = 0; i < lines.length; i++) {
    const m = caseRe.exec(lines[i]);
    if (m) {
      flush();
      const pages = [m[1], m[2]].filter(Boolean);
      cur = { pages, line: at ? countLines(text, at) + i : i, text: lines[i] };
      continue;
    }
    if (cur) cur.text += '\n' + lines[i];
  }
  flush();
  return out.map((c) => {
    const calls = [...new Set([...c.text.matchAll(/call\('([\w]+)'/g)].map((x) => x[1]))];
    const names = [...new Set([...c.text.matchAll(/'([֐-׿]+)'/g)].map((x) => x[1]))];
    const isViewer = /isViewer/.test(c.text);
    const literal = /return true;/.test(c.text) && !/return false/.test(c.text) && !calls.length ? 'everyone' : null;
    const allFalse = /return false;\s*$/.test(c.text.trim()) && !calls.length && !names.length ? 'nobody (retired/unreachable)' : null;
    const parts = [];
    if (literal) parts.push(literal);
    if (allFalse) parts.push(allFalse);
    if (calls.length) parts.push(`via ${calls.map((c) => `\`${c}()\``).join(', ')}`);
    if (names.length) parts.push(`names: ${names.join(', ')}`);
    if (isViewer) parts.push('viewer: yes');
    return { pages: c.pages, rule: parts.join(' · ') || '*(see js/src/00-bridge.js#canShowPage)*', line: c.line };
  });
}

function countLines(text, upTo) { return text.slice(0, upTo).split('\n').length; }

function loadIntrospection() {
  const p = path.join(ROOT, 'docs/system/schema/_introspection.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

export function renderMatrices({ people, viewer, caps, pageRules, introspection }) {
  const L = [];
  L.push('### People -> roles', '');
  L.push('| Person | Notes |', '|---|---|');
  for (const p of people) L.push(`| ${p} | |`);
  L.push(`| ${viewer || '*(none)*'} | the view-only identity (\`VIEWER_NAME\`, stored as this string) |`, '');

  L.push('### Role x page (`canShowPage()`, `js/src/00-bridge.js`)', '');
  L.push('| Page | Rule |', '|---|---|');
  for (const c of pageRules) for (const page of c.pages) L.push(`| \`${page}\` | ${c.rule} |`);
  L.push('');

  L.push('### Build capability flags (`app/src/lib/caps.ts`)', '');
  L.push('| Flag | Value |', '|---|---|');
  for (const c of caps) L.push(`| \`${c.name}\` | \`${c.value}\` |`);
  L.push('');

  L.push('### Role x table x command (live `pg_policies`)', '');
  if (introspection && introspection.policies_pulled !== false && introspection.policies?.length) {
    L.push('| Table | Policy | Command | Roles |', '|---|---|---|---|');
    for (const p of introspection.policies) L.push(`| ${p.table} | \`${p.name}\` | ${p.command} | ${(p.roles || []).join(', ')} |`);
  } else {
    L.push('*(not yet generated — requires a live `pg_policies` pull via `introspect.sql`)*');
  }
  return L.join('\n');
}

export function generate() {
  const { people, viewer } = extractPeople(fs.readFileSync(PEOPLE_PATH, 'utf8'));
  const caps = extractCaps(fs.readFileSync(CAPS_PATH, 'utf8'));
  const pageRules = extractPageRules(fs.readFileSync(BRIDGE_PATH, 'utf8'));
  const introspection = loadIntrospection();
  const matrices = renderMatrices({ people, viewer, caps, pageRules, introspection });

  const existing = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;
  const base = existing ?? [
    '---', 'doc_id: system:roles-and-permissions', 'doc_type: system', 'title: Roles and permissions',
    'generated: partial', 'generator: scripts/docs/gen-roles.mjs',
    'code:', '  - app/src/lib/people.ts', '  - app/src/lib/caps.ts', '  - js/src/00-bridge.js',
    'last_validated: { date: null, branch: main, commit: null }', '---', '',
    '# Roles and permissions', '',
    'The model in prose, and which layer enforces what (UI gate vs RLS vs edge fn) — written by',
    'DOC-1, not generated.', '',
    '## Matrices', '',
    '<!-- GENERATED:matrices -->', '<!-- /GENERATED:matrices -->', '',
  ].join('\n');
  return setBlock(base, 'matrices', matrices);
}

function main() {
  const check = process.argv.includes('--check');
  const content = generate();
  if (check) {
    const cur = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;
    if (cur === null) { console.log(`${OUT_PATH} not written yet — skipping (coverage tracked by test-docs.mjs).`); return; }
    if (cur !== content) { console.error(`roles-and-permissions.md STALE — run \`node scripts/docs/gen-roles.mjs\`.`); process.exit(1); }
    console.log('roles-and-permissions.md up to date.');
    return;
  }
  writeIfChanged(OUT_PATH, content);
  console.log(`wrote ${OUT_PATH}`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs/gen-roles.mjs')) main();
