// scripts/docs/dump-front-matter.mjs — every docs/system/**/*.md doc's front-matter + body, as
// JSON, on stdout. The ONE place that parses this repo's front-matter grammar is matter.mjs;
// doc_links.py (Python, called from rebuild.py) shells out to this instead of re-implementing a
// second parser that could quietly drift from the JS one.
//
//   node scripts/docs/dump-front-matter.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from './matter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SYSTEM_DIR = path.join(ROOT, 'docs/system');

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

export function dumpAll() {
  return walkMd(SYSTEM_DIR).map((p) => {
    const raw = fs.readFileSync(p, 'utf8');
    const { data, content } = matter(raw, { bodyOnly: true });
    return { path: path.relative(ROOT, p).replace(/\\/g, '/'), data, body: content };
  });
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs/dump-front-matter.mjs')) {
  process.stdout.write(JSON.stringify(dumpAll()));
}
