// One runner for the whole repo: every legacy node runner (test-*.mjs in the repo root),
// then the vitest suite of the React islands. Exits non-zero on the first real failure.
//   node scripts/test-all.mjs        →  npm test
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Known-broken runners. Reported, never fatal — a pre-existing failure must not hide a
// regression in everything that runs after it.
const SKIP = new Map([
  // shells out to `timeout /t` (cmd.exe), which has no stdin under a non-interactive runner
  // on Windows → always fails locally. Pre-existing, unrelated to the React islands.
  ['test-cert-pdf.mjs', 'pre-existing Windows failure (shells out to `timeout /t`)'],
]);

const runners = readdirSync(root).filter(f => /^test-.*\.mjs$/.test(f)).sort();
const skipped = [];
let failed = null;

for (const f of runners) {
  if (SKIP.has(f)) { skipped.push(f); continue; }
  process.stdout.write(`\n── ${f}\n`);
  const r = spawnSync(process.execPath, [f], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { failed = f; break; }
}

if (!failed) {
  process.stdout.write('\n── app (vitest)\n');
  const r = spawnSync('npm', ['--prefix', 'app', 'test', '--', '--run'], { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) failed = 'app (vitest)';
}

process.stdout.write('\n' + '─'.repeat(60) + '\n');
for (const f of skipped) process.stdout.write(`SKIPPED  ${f} — ${SKIP.get(f)}\n`);
if (failed) { process.stdout.write(`FAILED   ${failed}\n`); process.exit(1); }
process.stdout.write(`PASSED   ${runners.length - skipped.length} legacy runners + app vitest\n`);
