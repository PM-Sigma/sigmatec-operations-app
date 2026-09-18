// `npm run qa` — the six quality gates, in order, on the current tree.
//
//   1. gitleaks detect        (qa/gitleaks/.gitleaks.toml)          → 0 findings
//   2. semgrep               (qa/semgrep/config.yml)               → 0 ERROR / 0 WARNING
//   3. npm test              (legacy test-*.mjs runners + vitest)   → green
//   4. playwright            (qa/playwright/playwright.config.ts)   → green, 4 projects
//   5. lighthouse            (qa/lighthouse/lighthouserc.json)      → perf 85 / a11y 95 / bp 95
//   6. zap baseline          (qa/zap/baseline.*)                    → 0 High/Medium
//
// Every run writes qa/reports/<yyyy-mm-dd>-<label>.md and exits non-zero if ANY gate failed.
// ZAP is the ONLY gate allowed to be SKIPPED, and only when Docker is absent — it says so
// loudly in the console and in the report, never silently.
//
//   npm run qa                        # all six, label "manual"
//   npm run qa -- --label task-22     # → qa/reports/2026-09-18-task-22.md
//   npm run qa -- --only semgrep      # one gate (repeatable: --only gitleaks --only test)
//   npm run qa -- --skip lighthouse   # everything but that gate
//
// Install + fallbacks: qa/README.md.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = resolve(ROOT, 'qa', 'reports');
const isWin = process.platform === 'win32';

// ───────────────────────────── args ─────────────────────────────

function parseArgs(argv) {
  const out = { label: 'manual', only: [], skip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--label') out.label = argv[++i] || out.label;
    else if (a === '--only') out.only.push(argv[++i]);
    else if (a === '--skip') out.skip.push(argv[++i]);
    else if (a.startsWith('--label=')) out.label = a.slice(8);
    else if (a.startsWith('--only=')) out.only.push(a.slice(7));
    else if (a.startsWith('--skip=')) out.skip.push(a.slice(7));
  }
  out.label = String(out.label).replace(/[^\w.\-א-ת]+/g, '-') || 'manual';
  return out;
}
const ARGS = parseArgs(process.argv.slice(2));

// ───────────────────────────── helpers ─────────────────────────────

/** Run a command, capture everything, never throw. */
function run(cmd, args, opts = {}) {
  const started = Date.now();
  // detect-child-process: this IS the gate runner. `cmd`/`args` come only from the gate
  // definitions below (fixed tool names + paths inside this repo), never from user input, and
  // no shell is involved (`shell` is left off, so there is nothing to inject into).
  // nosemgrep
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    ...opts,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return {
    code: r.error ? -1 : (r.status ?? -1),
    out: (r.stdout || '') + (r.stderr || ''),
    error: r.error ? String(r.error.message) : null,
    ms: Date.now() - started,
  };
}

const bin = p => resolve(ROOT, p) + (isWin ? '.exe' : '');

// NEVER `npm.cmd` / `npx.cmd`: node >= 22 refuses to spawn a .cmd or .bat without a shell
// (EINVAL, CVE-2024-27980), and spawning WITH a shell is what semgrep's spawn-shell-true
// rightly objects to. So every node tool is invoked through its own js entry point with this
// same node binary — no shell, no wrapper script, and the same behaviour on every platform.
const node = process.execPath;
const PLAYWRIGHT_CLI = resolve(ROOT, 'node_modules/@playwright/test/cli.js');
const TEST_ALL = resolve(ROOT, 'scripts/test-all.mjs');

/**
 * Where semgrep is. `pip install semgrep` puts it on PATH for an interactive shell but not
 * always for a spawned process, so the Python user-scripts dir is tried too, and finally
 * `python -m semgrep` (which works from any install). qa/README.md documents all three.
 */
function semgrepCmd() {
  const probe = (cmd, args) => run(cmd, args).code === 0;
  if (probe('semgrep', ['--version'])) return { cmd: 'semgrep', pre: [] };
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = isWin
    ? [
      resolve(localAppData, 'Programs/Python/Python312/Scripts/semgrep.exe'),
      resolve(localAppData, 'Packages/PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0/LocalCache/local-packages/Python312/Scripts/semgrep.exe'),
    ]
    : [];
  for (const c of candidates) if (existsSync(c) && probe(c, ['--version'])) return { cmd: c, pre: [] };
  const py = isWin ? 'python' : 'python3';
  if (probe(py, ['-m', 'semgrep', '--version'])) return { cmd: py, pre: ['-m', 'semgrep'] };
  return null;
}

/** A tiny YAML reader for qa/semgrep/config.yml — a list/scalar manifest, not arbitrary YAML. */
function readSemgrepManifest() {
  const text = readFileSync(resolve(ROOT, 'qa/semgrep/config.yml'), 'utf8');
  const out = { rulesets: [], severities: [], exclude: [], exclude_rules: [], cache: 'qa/semgrep/.cache' };
  let key = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top) {
      key = top[1];
      if (top[2].trim()) { if (key === 'cache') out.cache = top[2].trim(); key = null; }
      continue;
    }
    const item = /^\s{2}-\s*(.*)$/.exec(line);
    if (!item || !key) continue;
    const v = item[1].trim();
    if (key === 'exclude_rules') {
      const m = /^id:\s*(.+)$/.exec(v);
      if (m) out.exclude_rules.push(m[1].trim());
    } else if (out[key]) {
      out[key].push(v.replace(/^['"]|['"]$/g, ''));
    }
  }
  return out;
}

// ───────────────────────────── the gates ─────────────────────────────

const GATES = [];
const results = [];

/** name, threshold (one line for the report), and a fn returning {status, summary, detail}. */
const gate = (name, threshold, fn) => GATES.push({ name, threshold, fn });

// ── 1. gitleaks ────────────────────────────────────────────────────────────────────────────
gate('gitleaks', '0 findings', () => {
  const exe = existsSync(bin('qa/bin/gitleaks')) ? bin('qa/bin/gitleaks') : 'gitleaks';
  const report = resolve(ROOT, 'qa/gitleaks/.cache/findings.json');
  mkdirSync(dirname(report), { recursive: true });
  const r = run(exe, [
    'detect', '--source', '.', '--config', 'qa/gitleaks/.gitleaks.toml',
    '--no-git', '--no-banner', '--redact', '--report-format', 'json', '--report-path', report,
  ]);
  if (r.code === -1) {
    return { status: 'FAIL', summary: 'gitleaks is not installed — see qa/README.md', detail: r.error || r.out, ms: r.ms };
  }
  let findings = [];
  try { findings = JSON.parse(readFileSync(report, 'utf8')); } catch { findings = []; }
  const detail = findings.map(f => `${f.RuleID} · ${f.File}:${f.StartLine}`).join('\n');
  return {
    status: findings.length ? 'FAIL' : 'PASS',
    summary: `${findings.length} finding(s)`,
    detail: detail || r.out.trim().split('\n').slice(-2).join('\n'),
    ms: r.ms,
  };
});

// ── 2. semgrep ─────────────────────────────────────────────────────────────────────────────
gate('semgrep', '0 ERROR / 0 WARNING (after qa/semgrep/config.yml exclude_rules)', () => {
  const sg = semgrepCmd();
  if (!sg) {
    return {
      status: 'FAIL',
      summary: 'semgrep is not installed — `pip install semgrep` (see qa/README.md)',
      detail: '', ms: 0,
    };
  }
  const man = readSemgrepManifest();
  const cache = resolve(ROOT, man.cache);
  mkdirSync(cache, { recursive: true });

  // Fetch the rule packs once; after that the gate is fully offline.
  const missing = man.rulesets.filter(rs => !existsSync(resolve(cache, rs.replace(/^p\//, '') + '.yml')));
  const fetched = [];
  for (const rs of missing) {
    const name = rs.replace(/^p\//, '');
    // A one-liner node child would need a shell on Windows; fetch it right here instead.
    const r = run(node, ['-e',
      'const fs=require("fs");fetch(process.argv[1]).then(r=>r.text()).then(t=>fs.writeFileSync(process.argv[2],t))',
      'https://semgrep.dev/c/' + rs, resolve(cache, name + '.yml')]);
    if (r.code !== 0 || !existsSync(resolve(cache, name + '.yml'))) {
      return { status: 'FAIL', summary: `could not fetch the rule pack ${rs} (offline first run?)`, detail: r.out, ms: r.ms };
    }
    fetched.push(rs);
  }

  const json = resolve(cache, 'findings.json');
  const args = [
    ...sg.pre, 'scan', '--config', man.cache, '--metrics=off', '--quiet',
    ...man.severities.flatMap(s => ['--severity', s]),
    ...man.exclude.flatMap(e => ['--exclude', e]),
    '--json-output', json, '.',
  ];
  const r = run(sg.cmd, args);
  let parsed = { results: [], errors: [] };
  try { parsed = JSON.parse(readFileSync(json, 'utf8')); } catch { /* reported below */ }

  // The exclusions are applied HERE, on check_id suffixes: semgrep prefixes rule ids with the
  // config path when the packs are loaded from a directory, so the suffix is the stable part.
  const excluded = new Set(man.exclude_rules);
  const isExcluded = id => [...excluded].some(x => String(id).endsWith(x));
  const live = (parsed.results || []).filter(f => !isExcluded(f.check_id));
  const accepted = (parsed.results || []).length - live.length;

  const detail = live.map(f => `${f.extra?.severity} · ${f.check_id} · ${f.path}:${f.start?.line}`).join('\n');
  return {
    status: live.length ? 'FAIL' : 'PASS',
    summary: `${live.length} blocking · ${accepted} accepted by config.yml`
      + (fetched.length ? ` · fetched ${fetched.join(', ')}` : ''),
    detail: detail || (r.code === -1 ? r.out : ''),
    ms: r.ms,
  };
});

// ── 3. the existing suites ─────────────────────────────────────────────────────────────────
gate('npm test', 'legacy test-*.mjs runners + app vitest, green', () => {
  const r = run(node, [TEST_ALL]);
  const tail = r.out.trim().split('\n').slice(-6).join('\n');
  return { status: r.code === 0 ? 'PASS' : 'FAIL', summary: r.code === 0 ? 'green' : 'red', detail: tail, ms: r.ms };
});

// ── 4. playwright ──────────────────────────────────────────────────────────────────────────
gate('playwright', 'desktop 1440×900 + mobile 390×844, light + dark, RTL, no console errors', () => {
  const r = run(node, [PLAYWRIGHT_CLI, 'test', '--config', 'qa/playwright/playwright.config.ts']);
  const m = /(\d+) passed/.exec(r.out);
  const f = /(\d+) failed/.exec(r.out);
  const s = /(\d+) skipped/.exec(r.out);
  const failedNames = r.out.split('\n').filter(l => /›.*spec\.ts/.test(l) && /^\s{2}\d+\)/.test(l));
  return {
    status: r.code === 0 ? 'PASS' : 'FAIL',
    summary: `${m ? m[1] : '?'} passed · ${f ? f[1] : 0} failed · ${s ? s[1] : 0} skipped`,
    detail: failedNames.join('\n'),
    ms: r.ms,
  };
});

// ── 5. lighthouse ──────────────────────────────────────────────────────────────────────────
gate('lighthouse', 'mobile preset: performance ≥ 85 · accessibility ≥ 95 · best-practices ≥ 95', () => {
  const r = run(process.execPath, ['qa/lighthouse/run.mjs']);
  let sum = null;
  try { sum = JSON.parse(readFileSync(resolve(ROOT, 'qa/lighthouse/.cache/summary.json'), 'utf8')); } catch { /* below */ }
  if (!sum) {
    return { status: 'FAIL', summary: 'lighthouse produced no summary', detail: r.out.trim().split('\n').slice(-12).join('\n'), ms: r.ms };
  }
  const line = Object.entries(sum.scores)
    .map(([k, v]) => `${k} ${Math.round(v)}/${sum.thresholds[k]}`).join(' · ');
  const detail = [
    `FCP ${Math.round(sum.metrics.fcp)} ms · LCP ${Math.round(sum.metrics.lcp)} ms · TBT ${Math.round(sum.metrics.tbt)} ms · CLS ${sum.metrics.cls?.toFixed(3)}`,
    '',
    'top issues (median run):',
    ...sum.topIssues.slice(0, 8).map(i => `  · ${i.title}${i.savingsMs ? ` (~${Math.round(i.savingsMs)} ms)` : ''}`),
  ].join('\n');
  return { status: sum.pass ? 'PASS' : 'FAIL', summary: line, detail, ms: r.ms };
});

// ── 6. zap baseline ────────────────────────────────────────────────────────────────────────
gate('zap baseline', '0 High / 0 Medium (passive)', () => {
  const r = isWin
    ? run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'qa/zap/baseline.ps1'])
    : run('bash', ['qa/zap/baseline.sh']);
  if (r.code === 2) {
    // The ONE allowed skip. Loud in the console, and in the report.
    return {
      status: 'SKIPPED',
      summary: 'Docker is not installed on this machine — the scan did not run',
      detail: r.out.trim(),
      ms: r.ms,
    };
  }
  return {
    status: r.code === 0 ? 'PASS' : 'FAIL',
    summary: r.code === 0 ? 'no High/Medium' : `exit ${r.code} — see qa/zap/.cache/zap-baseline.html`,
    detail: r.out.trim().split('\n').slice(-20).join('\n'),
    ms: r.ms,
  };
});

// ───────────────────────────── drive them ─────────────────────────────

const wanted = GATES.filter(g => {
  const key = g.name.split(' ')[0];
  if (ARGS.only.length) return ARGS.only.some(o => g.name === o || key === o);
  return !ARGS.skip.some(s => g.name === s || key === s);
});

const ICON = { PASS: '✅', FAIL: '❌', SKIPPED: '⚠️ ' };
const started = Date.now();

process.stdout.write(`\nnpm run qa — ${wanted.length} gate(s), label "${ARGS.label}"\n`);
for (const g of wanted) {
  process.stdout.write(`\n── ${g.name} …\n`);
  let res;
  try { res = g.fn(); }
  catch (e) { res = { status: 'FAIL', summary: 'the gate itself threw', detail: String(e?.stack || e), ms: 0 }; }
  results.push({ ...g, ...res });
  process.stdout.write(`${ICON[res.status]} ${g.name}: ${res.summary}  (${(res.ms / 1000).toFixed(1)}s)\n`);
  if (res.detail && res.status !== 'PASS') process.stdout.write(res.detail.split('\n').map(l => '   ' + l).join('\n') + '\n');
}

// ───────────────────────────── the report ─────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const failed = results.filter(r => r.status === 'FAIL');
const skipped = results.filter(r => r.status === 'SKIPPED');

const md = [
  `# QA gates — ${today} · ${ARGS.label}`,
  '',
  `Run: \`npm run qa -- --label ${ARGS.label}\` · ${(Date.now() - started) / 1000 | 0}s total · node ${process.version} · ${process.platform}`,
  '',
  `**Result: ${failed.length ? '❌ FAILED' : '✅ GREEN'}**`
  + (skipped.length ? ` · ${skipped.length} gate(s) SKIPPED (${skipped.map(s => s.name).join(', ')})` : ''),
  '',
  '| Gate | Threshold | Result | Detail | Time |',
  '|------|-----------|--------|--------|------|',
  ...results.map(r => `| ${r.name} | ${r.threshold} | ${ICON[r.status]} ${r.status} | ${r.summary.replace(/\|/g, '\\|')} | ${(r.ms / 1000).toFixed(1)}s |`),
  '',
];

for (const r of results) {
  if (!r.detail) continue;
  md.push(`## ${r.name} — ${r.status}`, '', '```', r.detail, '```', '');
}

if (skipped.length) {
  md.push(
    '## Skipped gates',
    '',
    'A skip is only ever allowed for the ZAP baseline, and only when Docker is absent.',
    'Everything needed to run it is in `qa/README.md` and printed by `qa/zap/baseline.ps1`.',
    '',
  );
}

mkdirSync(REPORTS, { recursive: true });
const file = resolve(REPORTS, `${today}-${ARGS.label}.md`);
writeFileSync(file, md.join('\n'));

process.stdout.write(`\n${'─'.repeat(70)}\n`);
for (const r of results) process.stdout.write(`${ICON[r.status]} ${r.name.padEnd(14)} ${r.summary}\n`);
process.stdout.write(`\nreport: ${file.replace(ROOT + (isWin ? '\\' : '/'), '')}\n`);
if (skipped.length) process.stdout.write(`\n⚠️  SKIPPED: ${skipped.map(s => `${s.name} — ${s.summary}`).join('; ')}\n`);
process.stdout.write(failed.length ? `\n❌ ${failed.length} gate(s) failed: ${failed.map(f => f.name).join(', ')}\n\n` : '\n✅ all gates green\n\n');

process.exit(failed.length ? 1 : 0);
