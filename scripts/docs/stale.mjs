// scripts/docs/stale.mjs — EMS-style diff-based staleness report (spec §9.3).
//
// For every WRITTEN doc under docs/system/** (generated docs regenerate themselves via --check,
// they don't need this), lists the commits since its front-matter `last_validated.commit` that
// touched its `code:` globs. An empty list means the doc is current; otherwise it prints the
// paths, so whoever updates it reads only those hunks (the sigmatec-knowledge update procedure,
// step 4-6) instead of re-reading the whole module from scratch.
//
//   node scripts/docs/stale.mjs             → human report, one doc per line
//   node scripts/docs/stale.mjs --json        → machine-readable
//   node scripts/docs/stale.mjs --fail-if-stale   → exit 1 if anything is stale (checkpoint gate)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from './matter.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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

/** Real git, isolated so tests can inject a fake. Returns null when the baseline commit can't be
 * diffed (unknown sha, or none recorded yet — "never validated", not "clean"). */
export function realGitDiff(sha, globs, cwd = ROOT) {
  if (!sha || !globs?.length) return null;
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${sha}..HEAD`, '--', ...globs.map((g) => `:(glob)${g}`)],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return null;
  }
}

/** Pure: given one doc's front-matter and a diff function, decide its status. No filesystem or
 * git here, so this is unit-testable without a real repo. */
export function reportForDoc(data, gitDiff) {
  if (data.generated === true) return { status: 'generated', changed: [] };
  const sha = data.last_validated?.commit;
  if (!sha) return { status: 'never-validated', changed: [] };
  if (!data.code?.length) return { status: 'no-code-globs', changed: [] };
  const changed = gitDiff(sha, data.code);
  if (changed === null) return { status: 'unknown (bad baseline commit)', changed: [] };
  return { status: changed.length ? 'stale' : 'current', changed };
}

export function run(gitDiff = realGitDiff) {
  const docs = walkMd(SYSTEM_DIR);
  const rows = [];
  for (const p of docs) {
    const { data } = matter(fs.readFileSync(p, 'utf8'));
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    rows.push({ doc: rel, doc_id: data.doc_id, ...reportForDoc(data, gitDiff) });
  }
  return rows;
}

function main() {
  const rows = run();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const stale = rows.filter((r) => r.status === 'stale');
    const other = rows.filter((r) => r.status !== 'stale' && r.status !== 'current' && r.status !== 'generated');
    for (const r of stale) {
      console.log(`STALE   ${r.doc} (${r.doc_id}) — ${r.changed.length} changed path(s):`);
      for (const c of r.changed) console.log(`          ${c}`);
    }
    for (const r of other) console.log(`${r.status.toUpperCase().padEnd(24)}${r.doc}`);
    console.log(`\n${stale.length} stale, ${rows.filter((r) => r.status === 'current').length} current, ${rows.length} total.`);
  }
  if (process.argv.includes('--fail-if-stale') && rows.some((r) => r.status === 'stale')) process.exit(1);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs/stale.mjs')) main();
