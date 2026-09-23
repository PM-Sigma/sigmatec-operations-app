// scripts/docs/gen-edge-functions.mjs — the G sections of docs/system/edge-functions/<fn>.md
// (spec §5.3 / §6): modes, per-mode auth, secret NAMES, tables touched, callers. Never a
// function body, never a secret VALUE — only the `Deno.env.get("NAME")` name.
//
//   node scripts/docs/gen-edge-functions.mjs             → write/refresh every doc
//   node scripts/docs/gen-edge-functions.mjs --check      → fail when a doc is stale
//   node scripts/docs/gen-edge-functions.mjs --fn push-send  → just one
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setBlock, seedFromTemplate, writeIfChanged } from './gen-blocks.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FN_DIR = path.join(ROOT, 'supabase/functions');
const OUT_DIR = path.join(ROOT, 'docs/system/edge-functions');
const TEMPLATE = path.join(ROOT, 'docs/system/_templates/edge_function.md');

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));

function listFunctions() {
  if (!fs.existsSync(FN_DIR)) return [];
  return fs.readdirSync(FN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared' && fs.existsSync(path.join(FN_DIR, d.name, 'index.ts')))
    .map((d) => d.name).sort();
}

/** Every `body.mode === "x"` / `case "x":` branch, deduped by mode, first occurrence wins. */
export function extractModes(text) {
  const lines = stripComments(text).split(/\r?\n/);
  const seen = new Map();
  const re1 = /\bmode\s*===\s*['"]([\w-]+)['"]/;
  const re2 = /\bcase\s+['"]([\w-]+)['"]\s*:/;
  lines.forEach((l, i) => {
    const m = re1.exec(l) || re2.exec(l);
    if (m && !seen.has(m[1])) seen.set(m[1], i + 1);
  });
  return seen; // mode -> 1-based line
}

/** Auth guard near a mode's branch: emsValid()/emsValid(...) call and/or a CRON_SECRET compare,
 * scanned in the following window of lines (a branch's guard is written right after the `if`). */
export function authForMode(lines, startLine, window = 12) {
  const chunk = lines.slice(startLine - 1, startLine - 1 + window).join('\n');
  const hasCron = /CRON_SECRET/.test(chunk);
  const hasEms = /emsValid\s*\(/.test(chunk);
  if (hasCron && hasEms) return 'cron (`CRON_SECRET`) or EMS login (`emsValid`)';
  if (hasCron) return 'cron (`CRON_SECRET`)';
  if (hasEms) return 'EMS login (`emsValid`)';
  return '*(no guard found near this branch — verify by hand)*';
}

export function extractSecrets(text) {
  const lines = stripComments(text).split(/\r?\n/);
  const out = new Map(); // name -> first line
  const re = /Deno\.env\.get\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g;
  lines.forEach((l, i) => { let m; while ((m = re.exec(l))) if (!out.has(m[1])) out.set(m[1], i + 1); });
  return out;
}

export function extractTables(text) {
  const lines = stripComments(text).split(/\r?\n/);
  const out = new Map();
  const re = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
  lines.forEach((l, i) => { let m; while ((m = re.exec(l))) if (!out.has(m[1])) out.set(m[1], i + 1); });
  return out;
}

export function extractOutboundHosts(text) {
  const hosts = new Set();
  const re = /https?:\/\/([a-zA-Z0-9.-]+)/g;
  let m; while ((m = re.exec(stripComments(text)))) hosts.add(m[1]);
  return [...hosts].sort();
}

/** Client call sites (`functions/v1/<fn>`) across the whole app, plus cron jobs (from a saved
 * introspection JSON, if present) that target this function. Both optional/best-effort. */
function findCallers(fn, introspection) {
  const callers = [];
  for (const glob of ['js/src', 'app/src']) {
    const dir = path.join(ROOT, glob);
    if (!fs.existsSync(dir)) continue;
    walk(dir, (rel, text) => {
      const lines = text.split(/\r?\n/);
      lines.forEach((l, i) => { if (l.includes(`functions/v1/${fn}`)) callers.push(`${rel}:${i + 1}`); });
    });
  }
  const cronHits = (introspection?.cron_jobs || []).filter((c) => c.target === fn).map((c) => `cron \`${c.jobname}\` (${c.schedule})`);
  return { clientSites: callers.slice(0, 10), cron: cronHits };
}

function walk(dir, cb, base = dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, cb, base); }
    else if (/\.(js|ts|tsx)$/.test(e.name)) cb(path.relative(ROOT, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8'));
  }
}

export function renderDoc(fn, { modes, secrets, tables, hosts, callers, existing }) {
  let content = existing ?? seedFromTemplate(TEMPLATE, fn);

  const modesBody = modes.size
    ? [...modes].map(([mode, line]) => `- \`${mode}\` — \`supabase/functions/${fn}/index.ts:${line}\``).join('\n')
    : '*(no `mode` dispatch found — single-purpose function)*';
  content = setBlock(content, 'modes', modesBody);

  const lines = fs.readFileSync(path.join(FN_DIR, fn, 'index.ts'), 'utf8').split(/\r?\n/);
  const authBody = modes.size
    ? [...modes].map(([mode, line]) => `- \`${mode}\`: ${authForMode(lines, line)}`).join('\n')
    : '*(see the function for its single auth check)*';
  content = setBlock(content, 'auth', authBody);

  content = setBlock(content, 'secrets', secrets.size
    ? [...secrets.keys()].sort().map((n) => `- \`${n}\``).join('\n')
    : '*none read via `Deno.env.get`*');

  const tableLines = [...tables.keys()].sort().map((t) => `- \`${t}\``);
  if (hosts.length) tableLines.push('', '**Outbound hosts:** ' + hosts.map((h) => `\`${h}\``).join(', '));
  content = setBlock(content, 'tables', tableLines.length ? tableLines.join('\n') : '*none*');

  const callerLines = [];
  if (callers.clientSites.length) callerLines.push(...callers.clientSites.map((c) => `- ${c}`));
  if (callers.cron.length) callerLines.push(...callers.cron.map((c) => `- ${c}`));
  content = setBlock(content, 'callers', callerLines.length ? callerLines.join('\n') : '*none found*');

  return content;
}

export function generateOne(fn, { introspection } = {}) {
  const indexText = fs.readFileSync(path.join(FN_DIR, fn, 'index.ts'), 'utf8');
  const modes = extractModes(indexText);
  const secrets = extractSecrets(indexText);
  const tables = extractTables(indexText);
  const hosts = extractOutboundHosts(indexText);
  const callers = findCallers(fn, introspection);
  const outPath = path.join(OUT_DIR, `${fn}.md`);
  const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
  return { outPath, content: renderDoc(fn, { modes, secrets, tables, hosts, callers, existing }) };
}

function loadIntrospection() {
  const p = path.join(ROOT, 'docs/system/schema/_introspection.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--fn') ? args[args.indexOf('--fn') + 1] : null;
  const check = args.includes('--check');
  const introspection = loadIntrospection();
  const fns = only ? [only] : listFunctions();
  let stale = [], notYetWritten = 0;
  for (const fn of fns) {
    const { outPath, content } = generateOne(fn, { introspection });
    if (check) {
      // A doc DOC-1 hasn't written yet (never generated to disk) is a coverage gap, not
      // staleness — test-docs.mjs's ratchet is where that gap gets tracked. --check here only
      // guards against an EXISTING doc's generated blocks drifting from the source.
      if (!fs.existsSync(outPath)) { notYetWritten++; continue; }
      if (fs.readFileSync(outPath, 'utf8') !== content) stale.push(fn);
    } else {
      writeIfChanged(outPath, content);
    }
  }
  if (check) {
    if (stale.length) {
      console.error(`edge-function docs STALE: ${stale.join(', ')}\nrun \`node scripts/docs/gen-edge-functions.mjs\`.`);
      process.exit(1);
    }
    console.log(`${fns.length - notYetWritten} edge-function docs up to date (${notYetWritten} not written yet).`);
  } else {
    console.log(`wrote ${fns.length} edge-function docs to ${OUT_DIR}`);
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs/gen-edge-functions.mjs')) main();
