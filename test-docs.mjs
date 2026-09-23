// test-docs.mjs — the honesty gate for docs/system/** (spec §9.1), part of `npm test` because it
// sits at the repo root and matches test-all.mjs's `test-*.mjs` auto-discovery.
//
//   node test-docs.mjs                    → run every check
//   node test-docs.mjs --write-baseline    → recompute scripts/docs/coverage-baseline.json
//                                             honestly from the CURRENT gap (review the diff!)
//
// Coverage checks are a RATCHET (scripts/docs/coverage-baseline.json): they fail only when the
// gap grows past the committed baseline, never for a gap DOC-1 hasn't closed yet. This is what
// lets `npm test` stay green through DOC-0 (nothing written) and tighten as DOC-1 writes docs,
// down to 0 at DOC-1 exit — see the spec's phase table and §9.1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from './scripts/docs/matter.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_DIR = path.join(ROOT, 'docs/system');
const BASELINE_PATH = path.join(ROOT, 'scripts/docs/coverage-baseline.json');
const VALID_TYPES = new Set(['module', 'table', 'edge_function', 'flow', 'system', 'design', 'operations', 'generated']);

// §7: paths this package retires. They must be GONE once DOC-1's tree is live — but DOC-0 ships
// with them still in place (DOC-1 hasn't run its `git mv`s yet), so this is ratcheted, not a hard
// fail, exactly like the coverage checks.
const RETIRED_PATHS = [
  'docs/architecture.md', 'docs/modules.md', 'docs/data-and-security.md', 'docs/operations.md',
  'docs/ems-session.md', 'docs/team.md', 'docs/whisper-glossary.md', 'docs/whisper-glossary.txt',
  'docs/ux-loading-patterns.md', 'docs/design/tools-and-motion.md', 'docs/calendar-setup.md',
  'docs/ems-cache-refresh.md', 'docs/whisper-server.md', 'docs/click-map.md', 'docs/integration-map.md',
  'docs/integration-map.annotations.md', 'docs/SRS-סיגמה-2.0.md', 'docs/RECOMMENDATIONS-he.md',
  'docs/vision-budget.md',
];

const errors = []; // hard failures — always fatal
const fail = (msg) => errors.push(msg);

function walkMd(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '_templates') out.push(...walkMd(p)); }
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function loadIntrospection() {
  const p = path.join(SYSTEM_DIR, 'schema/_introspection.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// Every code identifier a `path#symbol` anchor could name — cheap regex, same spirit as
// scripts/integration-map.mjs: a lexer, not a real parser.
function symbolDeclared(absPath, symbol) {
  if (!fs.existsSync(absPath)) return false;
  const text = fs.readFileSync(absPath, 'utf8');
  const re = new RegExp(
    `\\b(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function|const|let|class|interface|type)\\s+${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
  );
  return re.test(text);
}

// ── 1–3: front-matter, doc_id uniqueness, doc_type ──
export function checkFrontMatter(docs) {
  const ids = new Map();
  for (const p of docs) {
    const raw = fs.readFileSync(p, 'utf8');
    const { data } = matter(raw);
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if (!data.doc_id) { fail(`${rel}: no doc_id in front-matter`); continue; }
    if (!VALID_TYPES.has(data.doc_type)) fail(`${rel}: doc_type "${data.doc_type}" is not one of ${[...VALID_TYPES].join(', ')}`);
    if (ids.has(data.doc_id)) fail(`${rel}: doc_id "${data.doc_id}" duplicates ${ids.get(data.doc_id)}`);
    else ids.set(data.doc_id, rel);
  }
}

// ── 4–5: anchors and relative links resolve ──
export function checkAnchorsAndLinks(docs) {
  const ANCHOR = /`([\w./-]+\.(?:ts|tsx|js|mjs|sql))#([A-Za-z_$][\w$]*)`/g;
  const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const p of docs) {
    const raw = fs.readFileSync(p, 'utf8');
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    let m;
    while ((m = ANCHOR.exec(raw))) {
      const [, file, symbol] = m;
      const abs = path.join(ROOT, file);
      if (!fs.existsSync(abs)) fail(`${rel}: anchor \`${file}#${symbol}\` — file does not exist`);
      else if (!symbolDeclared(abs, symbol)) fail(`${rel}: anchor \`${file}#${symbol}\` — symbol "${symbol}" not declared in ${file}`);
    }
    while ((m = LINK.exec(raw))) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const filePart = target.split('#')[0];
      if (!filePart) continue;
      const abs = path.resolve(path.dirname(p), filePart);
      if (!fs.existsSync(abs)) fail(`${rel}: link "${target}" does not resolve`);
    }
  }
}

// ── 6: coverage (ratcheted) ──
function partitionFiles() {
  const roots = ['app/src', 'supabase/functions', 'js/src'];
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    }
  };
  for (const r of roots) walk(path.join(ROOT, r));
  const dbDir = path.join(ROOT, 'db');
  if (fs.existsSync(dbDir)) for (const f of fs.readdirSync(dbDir)) if (f.endsWith('.sql')) out.push(`db/${f}`);
  return out;
}

function globToRe(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${esc}$`);
}

export function computeCoverage(docs, introspection) {
  const moduleDocs = docs.filter((p) => matter(fs.readFileSync(p, 'utf8')).data.doc_type === 'module');
  const files = partitionFiles();
  const claims = new Map(files.map((f) => [f, []]));
  for (const p of moduleDocs) {
    const { data } = matter(fs.readFileSync(p, 'utf8'));
    const res = (data.code || []).map(globToRe);
    for (const f of files) if (res.some((r) => r.test(f))) claims.get(f).push(data.doc_id);
  }
  const unclaimed = files.filter((f) => claims.get(f).length === 0);
  const doubleClaimed = files.filter((f) => claims.get(f).length > 1);

  let missingTables = 0;
  if (introspection) {
    for (const t of introspection.tables) {
      if (!fs.existsSync(path.join(SYSTEM_DIR, 'schema', `${t.schema}.${t.name}.md`))) missingTables++;
    }
  }
  let missingFns = 0;
  const fnDir = path.join(ROOT, 'supabase/functions');
  if (fs.existsSync(fnDir)) {
    for (const d of fs.readdirSync(fnDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === '_shared') continue;
      if (!fs.existsSync(path.join(SYSTEM_DIR, 'edge-functions', `${d.name}.md`))) missingFns++;
    }
  }
  const retiredPresent = RETIRED_PATHS.filter((p) => fs.existsSync(path.join(ROOT, p)));

  return { missingTables, missingFns, unclaimed, doubleClaimed, retiredPresent };
}

function main() {
  const introspection = loadIntrospection();
  const docs = walkMd(SYSTEM_DIR);

  checkFrontMatter(docs);
  checkAnchorsAndLinks(docs);
  const cov = computeCoverage(docs, introspection);

  // A file claimed by two modules is a real bug, never ratcheted.
  if (cov.doubleClaimed.length) {
    fail(`${cov.doubleClaimed.length} file(s) claimed by more than one module: ${cov.doubleClaimed.slice(0, 10).join(', ')}`);
  }

  if (process.argv.includes('--write-baseline')) {
    const baseline = {
      _comment: JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))._comment,
      missing_table_docs: cov.missingTables,
      missing_edge_function_docs: cov.missingFns,
      unclaimed_partition_files: cov.unclaimed.length,
      retired_paths_still_present: cov.retiredPresent.length,
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
    console.log('wrote', BASELINE_PATH, baseline);
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const ratchet = (name, actual, allowed, detail) => {
    if (actual > allowed) fail(`RATCHET REGRESSION — ${name}: ${actual} > baseline ${allowed}${detail ? `\n  ${detail}` : ''}`);
  };
  ratchet('missing_table_docs', cov.missingTables, baseline.missing_table_docs);
  ratchet('missing_edge_function_docs', cov.missingFns, baseline.missing_edge_function_docs);
  ratchet('unclaimed_partition_files', cov.unclaimed.length, baseline.unclaimed_partition_files);
  ratchet('retired_paths_still_present', cov.retiredPresent.length, baseline.retired_paths_still_present,
    cov.retiredPresent.slice(0, 10).join(', '));

  if (errors.length) {
    console.error(`test-docs.mjs: ${errors.length} failure(s)`);
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log(`test-docs.mjs: PASS — ${docs.length} docs under docs/system checked ` +
    `(tables gap ${cov.missingTables}/${baseline.missing_table_docs}, ` +
    `edge-fn gap ${cov.missingFns}/${baseline.missing_edge_function_docs}, ` +
    `unclaimed ${cov.unclaimed.length}/${baseline.unclaimed_partition_files}, ` +
    `retired-still-present ${cov.retiredPresent.length}/${baseline.retired_paths_still_present}).`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('test-docs.mjs')) main();
