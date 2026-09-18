// Lighthouse runner (QA gate 4).
//
// WHY NOT `lhci autorun`: on Windows, chrome-launcher's `destroyTmp()` fails with
// `EPERM, Permission denied: C:\...\Temp\lighthouse.<n>` after every run — Chrome still holds
// its own temp profile when the launcher tries to delete it. The audit itself completes, but
// both `lhci autorun` and the plain `lighthouse` CLI then exit non-zero with no report on
// disk, which would make the gate unusable here.
//
// So Lighthouse is driven programmatically against a Chromium that Playwright launched (the
// one `npx playwright install chromium` already put on this machine) over CDP. No
// chrome-launcher, no temp profile to delete, and the browser is closed by the same code that
// opened it.
//
//   node qa/lighthouse/run.mjs [--port 8124]
//
// Thresholds and settings come from qa/lighthouse/lighthouserc.json, so that file stays the
// single source of truth and `npx lhci autorun --config qa/lighthouse/lighthouserc.json` is
// still the documented fallback on a machine where it works.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import lighthouse from 'lighthouse';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const RC = JSON.parse(readFileSync(resolve(HERE, 'lighthouserc.json'), 'utf8')).ci;
const CACHE = resolve(ROOT, 'qa', 'lighthouse', '.cache');

const portArg = process.argv.indexOf('--port');
const PORT = portArg === -1 ? 8124 : Number(process.argv[portArg + 1]);
const URL_UNDER_TEST = RC.collect.url[0].replace(/:\d+\//, `:${PORT}/`);
const RUNS = RC.collect.numberOfRuns || 3;

/** { 'categories:performance': 0.85, … } → { performance: 0.85, … } */
const THRESHOLDS = Object.fromEntries(
  Object.entries(RC.assert.assertions).map(([k, v]) => [k.replace('categories:', ''), v[1].minScore]),
);

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function startServer() {
  const proc = spawn(process.execPath, [resolve(ROOT, 'qa', 'playwright', 'server.mjs'), String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('the static server did not start')), 30_000);
    proc.stdout.on('data', d => {
      if (String(d).includes('qa static server')) { clearTimeout(t); ok(proc); }
    });
    proc.on('exit', c => { clearTimeout(t); fail(new Error('the static server exited with ' + c)); });
  });
}

async function main() {
  mkdirSync(CACHE, { recursive: true });

  let server = null;
  try {
    // Reuse a server already on the port (a dev run, or the Playwright gate); otherwise ours.
    const probe = await fetch(`http://127.0.0.1:${PORT}/index.html`).then(r => r.ok).catch(() => false);
    if (!probe) server = await startServer();

    const browser = await chromium.launch({ args: ['--remote-debugging-port=9222', '--no-sandbox'] });
    const runs = [];
    try {
      for (let i = 0; i < RUNS; i++) {
        const res = await lighthouse(URL_UNDER_TEST, {
          port: 9222,
          output: ['json', 'html'],
          logLevel: 'error',
          screenEmulation: RC.collect.settings.screenEmulation,
          formFactor: RC.collect.settings.formFactor,
          throttling: RC.collect.settings.throttling,
          emulatedUserAgent: RC.collect.settings.emulatedUserAgent,
          skipAudits: RC.collect.settings.skipAudits,
          onlyCategories: Object.keys(THRESHOLDS),
        });
        if (!res?.lhr) throw new Error('lighthouse returned no result on run ' + (i + 1));
        runs.push(res);
        writeFileSync(resolve(CACHE, `run-${i + 1}.json`), res.report[0]);
        writeFileSync(resolve(CACHE, `run-${i + 1}.html`), res.report[1]);
      }
    } finally {
      await browser.close();
    }

    // ── scores: the median of the runs, per category
    const scores = {};
    for (const cat of Object.keys(THRESHOLDS)) {
      scores[cat] = median(runs.map(r => (r.lhr.categories[cat]?.score ?? 0) * 100));
    }

    // ── the biggest opportunities, for the report (median run)
    const mid = runs[Math.floor(runs.length / 2)].lhr;
    const failed = Object.values(mid.audits)
      .filter(a => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
      .sort((a, b) => (b.details?.overallSavingsMs || 0) - (a.details?.overallSavingsMs || 0)
        || a.score - b.score)
      .slice(0, 8)
      .map(a => ({
        id: a.id,
        title: a.title,
        score: a.score,
        savingsMs: a.details?.overallSavingsMs ?? null,
      }));

    const out = {
      url: URL_UNDER_TEST,
      runs: RUNS,
      lighthouseVersion: mid.lighthouseVersion,
      scores,
      thresholds: Object.fromEntries(Object.entries(THRESHOLDS).map(([k, v]) => [k, v * 100])),
      pass: Object.entries(THRESHOLDS).every(([cat, min]) => scores[cat] >= min * 100),
      metrics: {
        fcp: mid.audits['first-contentful-paint']?.numericValue ?? null,
        lcp: mid.audits['largest-contentful-paint']?.numericValue ?? null,
        tbt: mid.audits['total-blocking-time']?.numericValue ?? null,
        cls: mid.audits['cumulative-layout-shift']?.numericValue ?? null,
        si: mid.audits['speed-index']?.numericValue ?? null,
      },
      topIssues: failed,
    };
    writeFileSync(resolve(CACHE, 'summary.json'), JSON.stringify(out, null, 2) + '\n');

    for (const [cat, min] of Object.entries(THRESHOLDS)) {
      const got = scores[cat];
      process.stdout.write(
        `${got >= min * 100 ? 'PASS' : 'FAIL'}  ${cat.padEnd(15)} ${got.toFixed(0)} (min ${min * 100})\n`,
      );
    }
    if (!out.pass) {
      process.stdout.write('\ntop issues in the median run:\n');
      for (const i of failed) {
        process.stdout.write(`  · ${i.title}${i.savingsMs ? ` (~${Math.round(i.savingsMs)} ms)` : ''}\n`);
      }
    }
    process.exitCode = out.pass ? 0 : 1;
  } finally {
    if (server) server.kill();
  }
}

await main();
