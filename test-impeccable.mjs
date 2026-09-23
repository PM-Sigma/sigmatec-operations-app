// The real impeccable detector (round 5 phase 2, עידן's addition to the design-system package —
// "design checks must run the real open-source tool, not a hand checklist"), gated against a
// committed baseline instead of a hand-written checklist of anti-patterns.
//   node test-impeccable.mjs
//
// The tool itself is a local machine install, not vendored into this repo (it lives outside the
// worktree — see IMPECCABLE_CLI below), so this SKIPS (not fails) when it can't be found, the
// same shape test-cert-pdf.mjs uses for an environment-only dependency. Where it IS available,
// the gate is real: qa/impeccable-baseline.json is the total this pass landed on, and a rise
// above it fails the build. Later packages (S, K, V, C, I, A, G, M, D) rewrite each page and
// shrink the baseline toward 0 — this file's job is only to stop it climbing back up.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CANDIDATES = [
  process.env.IMPECCABLE_CLI,
  'C:\\Users\\idann\\Projects\\_tools\\impeccable\\cli\\bin\\cli.js',
].filter(Boolean);
const cli = CANDIDATES.find(p => fs.existsSync(p));

if (!cli) {
  console.log('SKIP - impeccable CLI not found on this machine (set IMPECCABLE_CLI to run this gate)');
  process.exit(0);
}

const TARGETS = ['index.html', 'css/app.css', 'app/src'];
let raw;
try {
  // Exit 0 = no findings.
  raw = execFileSync(process.execPath, [cli, 'detect', ...TARGETS, '--no-advisory', '--json'], {
    cwd: __dirname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  // Exit 2 = "scan completed WITH findings" (expected — that's what this gate measures), so
  // execFileSync's throw still carries real stdout. Exit 1 (a target could not be scanned) is
  // a genuine tool failure and has none — surface it instead of silently treating it as "0
  // findings", which would let a real regression through.
  if (e.status !== 2 || !e.stdout) {
    console.log('SKIP - impeccable could not complete the scan: ' + (e.stderr || e.message));
    process.exit(0);
  }
  raw = e.stdout;
}

let findings;
try {
  findings = JSON.parse(raw);
} catch {
  console.log('SKIP - impeccable did not return JSON (unexpected CLI output, not a design regression)');
  process.exit(0);
}

const byRule = {};
for (const f of findings) byRule[f.antipattern] = (byRule[f.antipattern] || 0) + 1;
const total = findings.length;

const baselinePath = path.join(__dirname, 'qa', 'impeccable-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

console.log(`impeccable: ${total} findings (baseline ${baseline.total})`);
const rules = new Set([...Object.keys(byRule), ...Object.keys(baseline.byRule)]);
for (const rule of [...rules].sort()) {
  const now = byRule[rule] || 0;
  const was = baseline.byRule[rule] || 0;
  const delta = now - was;
  const flag = delta > 0 ? ' ▲ REGRESSION' : delta < 0 ? ' ▼ improved' : '';
  console.log(`  ${rule.padEnd(20)} ${now} (was ${was})${flag}`);
}

if (total > baseline.total) {
  console.log(`\nFAIL — impeccable findings rose from ${baseline.total} to ${total}. `
    + `Fix the new findings, or if they are pre-existing debt outside this change's scope, `
    + `update qa/impeccable-baseline.json with the reason.`);
  process.exit(1);
}
console.log(`\nPASS — at or below the committed baseline (${baseline.total})`);
