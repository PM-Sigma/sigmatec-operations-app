// scripts/docs/gen-module-inventory.mjs — the "Inventory" + "Tests" G blocks of a module doc
// (spec §5.1 items 10 + 12): owned files, exported symbols, tables touched, inbound dependents,
// and the test files that cover them — all read from the OPS GRAPH (`graph.json`), never
// re-derived, so a module doc and the graph can never silently disagree.
//
//   node scripts/docs/gen-module-inventory.mjs                  → refresh every docs/system/modules/*.md
//   node scripts/docs/gen-module-inventory.mjs --check           → fail when one is stale
//   node scripts/docs/gen-module-inventory.mjs --graph <path>     → use a different graph.json (tests)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from './matter.mjs';
import { setBlock, writeIfChanged } from './gen-blocks.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULES_DIR = path.join(ROOT, 'docs/system/modules');
const DEFAULT_GRAPH = path.join(ROOT, 'docs/ops-graph/graphify-out/graph.json');

function loadGraph(graphPath) {
  const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const nodes = new Map((g.nodes || []).map((n) => [n.id, n]));
  const links = g.links || g.edges || [];
  return { nodes, links };
}

/** Glob → RegExp, just enough for the `code:` front-matter globs (`app/src/lib/visitDraft*.ts`,
 * `app/src/islands/Field.tsx`, `supabase/functions/push-send/**`) — no dependency for this. */
function globToRe(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${esc}$`);
}

export function matchOwned(codeGlobs, files) {
  const res = (codeGlobs || []).map(globToRe);
  return files.filter((f) => res.some((r) => r.test(f)));
}

/** For each owned file: the `file:<path>` node's outgoing `contains`/`groups` symbols, the
 * `table:`/`ext:` nodes it `reads_writes`/`calls`, and the nodes that `tests`/`documents` it. */
export function buildInventory({ nodes, links }, ownedFiles) {
  const ownedIds = new Set(ownedFiles.map((f) => `file:${f}`));
  const symbols = [];
  const tables = new Set();
  const dependents = new Set();
  const tests = new Set();

  for (const l of links) {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (ownedIds.has(src)) {
      if (l.relation === 'contains' && nodes.has(tgt) && (nodes.get(tgt).id || '').startsWith('fn:')) {
        symbols.push(nodes.get(tgt).label || tgt);
      }
      if (l.relation === 'reads_writes' && tgt.startsWith('table:')) tables.add(tgt.slice(6));
    }
    if (ownedIds.has(tgt)) {
      if (l.relation === 'tests') tests.add(src);
      else if (['calls', 'imports_from', 'references'].includes(l.relation) && !ownedIds.has(src)) dependents.add(src);
    }
  }

  const label = (id) => nodes.get(id)?.label || id;
  return {
    files: ownedFiles.slice().sort(),
    symbols: [...new Set(symbols)].sort(),
    tables: [...tables].sort(),
    dependents: [...dependents].map(label).sort(),
    tests: [...tests].map(label).sort(),
  };
}

export function renderInventoryBlock(inv) {
  const L = [];
  L.push(`**Files (${inv.files.length}):** ` + (inv.files.length ? inv.files.map((f) => `\`${f}\``).join(', ') : '*none*'));
  L.push('');
  L.push(`**Exported symbols:** ` + (inv.symbols.length ? inv.symbols.map((s) => `\`${s}\``).join(', ') : '*none found*'));
  L.push('');
  L.push(`**Tables touched:** ` + (inv.tables.length ? inv.tables.map((t) => `[${t}](../schema/public.${t}.md)`).join(', ') : '*none*'));
  L.push('');
  L.push(`**Inbound dependents:** ` + (inv.dependents.length ? inv.dependents.join(', ') : '*none found*'));
  return L.join('\n');
}

export function renderTestsBlock(inv) {
  return inv.tests.length ? inv.tests.map((t) => `- \`${t}\``).join('\n') : '*no test found that loads an owned file*';
}

function listModuleDocs() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  return fs.readdirSync(MODULES_DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(MODULES_DIR, f));
}

function allRepoFiles() {
  const out = [];
  const globs = ['app/src', 'supabase/functions', 'js/src'];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    }
  };
  for (const g of globs) walk(path.join(ROOT, g));
  return out;
}

export function generateOne(docPath, graph, files = allRepoFiles()) {
  const raw = fs.readFileSync(docPath, 'utf8');
  const { data, content } = matter(raw);
  const owned = matchOwned(data.code, files);
  const inv = buildInventory(graph, owned);
  let next = setBlock(raw, 'inventory', renderInventoryBlock(inv));
  next = setBlock(next, 'tests', renderTestsBlock(inv));
  return next;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
  const graphPath = flag('--graph', DEFAULT_GRAPH);
  const check = args.includes('--check');
  if (!fs.existsSync(graphPath)) {
    // In --check mode this is a "nothing to verify yet" skip, not a failure: the graph is a
    // built (gitignored) artifact, and a fresh checkout or a JS-only CI runner may not have
    // run `python docs/ops-graph/rebuild.py` at all. Wiring this into `npm test` must not force
    // a Python dependency onto every run (see test-docs-generators-check.mjs).
    if (check) { console.log(`${graphPath} not built — skipping module-inventory check.`); return; }
    console.error(`${graphPath} not found — run \`python docs/ops-graph/rebuild.py\` first.`);
    process.exit(1);
  }
  const graph = loadGraph(graphPath);
  const docs = listModuleDocs();
  const files = allRepoFiles();
  let stale = [];
  for (const docPath of docs) {
    const next = generateOne(docPath, graph, files);
    const cur = fs.readFileSync(docPath, 'utf8');
    if (check) { if (cur !== next) stale.push(path.basename(docPath)); }
    else writeIfChanged(docPath, next);
  }
  if (check) {
    if (stale.length) { console.error(`module inventory STALE: ${stale.join(', ')}`); process.exit(1); }
    console.log(`${docs.length} module docs' inventory up to date.`);
  } else {
    console.log(`refreshed inventory in ${docs.length} module docs.`);
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs/gen-module-inventory.mjs')) main();
