// scripts/docs/gen-design.mjs — docs/system/design/tokens.md + components.md (spec §6): fully
// generated, from app/src/styles.css and app/src/components/ui/* + their import sites.
//
//   node scripts/docs/gen-design.mjs             → write both files
//   node scripts/docs/gen-design.mjs --check       → fail when either is stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIfChanged } from './gen-blocks.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS_PATH = path.join(ROOT, 'app/src/styles.css');
const UI_DIR = path.join(ROOT, 'app/src/components/ui');
const OUT_DIR = path.join(ROOT, 'docs/system/design');

/** Every `--name: value;` inside a `:root`/`.dark`-selector block, tagged light/dark by whether
 * the selector mentions "dark". Brace-depth matched (flat blocks only — this repo's tokens live
 * in simple `{ --x: y; }` rules, never nested), so a value that itself contains `{`/`}` (none do
 * today) would need more; good enough for what's actually in styles.css. */
export function parseTokens(css) {
  const light = new Map(), dark = new Map();
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css))) {
    const selector = m[1].trim();
    if (!/:root|\.dark/i.test(selector)) continue;
    const target = /dark/i.test(selector) ? dark : light;
    const varRe = /--([\w-]+)\s*:\s*([^;]+);/g;
    let v;
    while ((v = varRe.exec(m[2]))) if (!target.has(v[1])) target.set(v[1], v[2].trim());
  }
  return { light, dark };
}

function importSites(basename) {
  const out = [];
  const re = new RegExp(`components/ui/${basename}(?:['"]|$)`);
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'ui') walk(p); }
      else if (/\.(tsx?|jsx?)$/.test(e.name)) {
        const text = fs.readFileSync(p, 'utf8');
        const lines = text.split(/\r?\n/);
        lines.forEach((l, i) => { if (re.test(l)) out.push(`${path.relative(ROOT, p).replace(/\\/g, '/')}:${i + 1}`); });
      }
    }
  };
  walk(path.join(ROOT, 'app/src'));
  return out;
}

export function renderTokens(css, generatedAt) {
  const { light, dark } = parseTokens(css);
  const names = [...new Set([...light.keys(), ...dark.keys()])].sort();
  const fm = [
    '---', 'doc_id: generated:design-tokens', 'doc_type: generated', 'title: Design tokens',
    'generated: true', 'generator: scripts/docs/gen-design.mjs', `introspected_at: ${generatedAt}`,
    '---', '',
  ].join('\n');
  const L = ['# Design tokens', '', `Every CSS custom property in \`app/src/styles.css\` (${names.length}).`, '',
    '| Token | Light | Dark |', '|---|---|---|'];
  for (const n of names) L.push(`| \`--${n}\` | ${light.get(n) ? `\`${light.get(n)}\`` : '—'} | ${dark.get(n) ? `\`${dark.get(n)}\`` : '—'} |`);
  return fm + '<!-- GENERATED:body -->\n' + L.join('\n') + '\n<!-- /GENERATED:body -->\n';
}

export function renderComponents(files, generatedAt) {
  const fm = [
    '---', 'doc_id: generated:design-components', 'doc_type: generated', 'title: UI components',
    'generated: true', 'generator: scripts/docs/gen-design.mjs', `introspected_at: ${generatedAt}`,
    '---', '',
  ].join('\n');
  const L = ['# UI components', '', `\`app/src/components/ui/*\` (${files.length}) and where each is used.`, ''];
  for (const f of files.sort()) {
    const base = f.replace(/\.tsx?$/, '');
    const sites = importSites(base);
    L.push(`## ${f}`, '', sites.length ? sites.slice(0, 8).map((s) => `- ${s}`).join('\n') +
      (sites.length > 8 ? `\n- …+${sites.length - 8} more` : '') : '*not imported anywhere found*', '');
  }
  return fm + '<!-- GENERATED:body -->\n' + L.join('\n').trimEnd() + '\n<!-- /GENERATED:body -->\n';
}

export function generate() {
  const generatedAt = new Date().toISOString();
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const files = fs.existsSync(UI_DIR) ? fs.readdirSync(UI_DIR).filter((f) => /\.tsx?$/.test(f)) : [];
  return new Map([
    ['tokens.md', renderTokens(css, generatedAt)],
    ['components.md', renderComponents(files, generatedAt)],
  ]);
}

function main() {
  const check = process.argv.includes('--check');
  if (!fs.existsSync(CSS_PATH)) { console.error(`${CSS_PATH} not found.`); process.exit(1); }
  const files = generate();
  if (check) {
    const stale = [...files].filter(([name, content]) => {
      const p = path.join(OUT_DIR, name);
      // introspected_at is a fresh timestamp every run — compare bodies only, or --check would
      // always report stale. Same idea as gen-schema.mjs's committed `_introspection.json`
      // timestamp, just without a saved input file to pin it to.
      const norm = (s) => s.replace(/introspected_at: .*/g, 'introspected_at: X');
      return !fs.existsSync(p) || norm(fs.readFileSync(p, 'utf8')) !== norm(content);
    }).map(([name]) => name);
    if (stale.length) { console.error(`design docs STALE: ${stale.join(', ')}\nrun \`node scripts/docs/gen-design.mjs\`.`); process.exit(1); }
    console.log(`${files.size} design docs up to date.`);
    return;
  }
  for (const [name, content] of files) writeIfChanged(path.join(OUT_DIR, name), content);
  console.log(`wrote ${files.size} files to ${OUT_DIR}`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs/gen-design.mjs')) main();
