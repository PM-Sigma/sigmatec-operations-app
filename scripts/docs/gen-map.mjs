// scripts/docs/gen-map.mjs — docs/system/README.md (spec §6): the EMS `_map.md` equivalent, one
// row per doc from front-matter, plus a GENERATED "not yet covered" block. The intro prose and
// the "questions it answers" column are WRITTEN (never regenerated): the intro comes from the
// overlay docs/system/README.intro.md, "questions it answers" from each doc's own front-matter
// `questions:` list.
//
//   node scripts/docs/gen-map.mjs             → (re)write docs/system/README.md
//   node scripts/docs/gen-map.mjs --check       → fail when it's stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from './matter.mjs';
import { writeIfChanged } from './gen-blocks.mjs';
import { computeCoverage } from '../../test-docs.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SYSTEM_DIR = path.join(ROOT, 'docs/system');
const INTRO_PATH = path.join(SYSTEM_DIR, 'README.intro.md');
const OUT_PATH = path.join(SYSTEM_DIR, 'README.md');

export function walkDocs(dir = SYSTEM_DIR) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '_templates') walk(p); }
      else if (e.name.endsWith('.md') && p !== OUT_PATH) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function loadIntrospection() {
  const p = path.join(SYSTEM_DIR, 'schema/_introspection.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

export function renderTable(docs) {
  const rows = docs.map((p) => {
    const { data } = matter(fs.readFileSync(p, 'utf8'));
    const rel = path.relative(SYSTEM_DIR, p).replace(/\\/g, '/');
    return {
      rel, doc_type: data.doc_type || '?', title: data.title || path.basename(p),
      questions: (data.questions || []).join('; ') || '',
    };
  }).sort((a, b) => a.rel.localeCompare(b.rel));
  const L = ['| Doc | Type | Questions it answers |', '|---|---|---|'];
  for (const r of rows) L.push(`| [${r.title}](${r.rel}) | ${r.doc_type} | ${r.questions || '*(not yet noted)*'} |`);
  return L.join('\n');
}

export function renderNotYetCovered(cov) {
  const L = [];
  L.push(`- **${cov.missingTables}** live table(s) with no schema page.`);
  L.push(`- **${cov.missingFns}** edge function(s) with no doc.`);
  L.push(`- **${cov.unclaimed.length}** source file(s) under \`app/src\`/\`supabase/functions\`/\`js/src\`/\`db\` owned by no module doc.`);
  if (cov.doubleClaimed.length) L.push(`- **${cov.doubleClaimed.length}** file(s) claimed by more than one module (a bug — see test-docs.mjs).`);
  return L.join('\n');
}

export function generate() {
  const docs = walkDocs();
  const introspection = loadIntrospection();
  const cov = computeCoverage(docs, introspection);
  const intro = fs.existsSync(INTRO_PATH)
    ? fs.readFileSync(INTRO_PATH, 'utf8').trim()
    : '*(write docs/system/README.intro.md — the cold-start intro for a fresh Claude session — DOC-1.)*';

  return [
    '---', 'doc_id: system:readme', 'doc_type: generated', 'title: docs/system map',
    'generated: partial', 'generator: scripts/docs/gen-map.mjs', '---', '',
    '# docs/system — the map', '',
    intro, '',
    '## Every doc', '',
    '<!-- GENERATED:table -->',
    renderTable(docs),
    '<!-- /GENERATED:table -->', '',
    '## Not yet covered', '',
    '<!-- GENERATED:gaps -->',
    renderNotYetCovered(cov),
    '<!-- /GENERATED:gaps -->', '',
  ].join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const content = generate();
  if (check) {
    const cur = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;
    if (cur !== content) { console.error(`docs/system/README.md STALE — run \`node scripts/docs/gen-map.mjs\`.`); process.exit(1); }
    console.log('docs/system/README.md up to date.');
    return;
  }
  writeIfChanged(OUT_PATH, content);
  console.log(`wrote ${OUT_PATH}`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs/gen-map.mjs')) main();
