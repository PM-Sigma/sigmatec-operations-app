// Sign-off motion evidence (verdict E5): short Playwright-recorded videos of a sheet's
// open/close at 360px, once with normal motion and once with `prefers-reduced-motion`
// emulated — proving the reduced-motion rule (styles.css's media query, sign-off P1-12) only
// zeroes the SLIDE/shift, not the opacity fade, per design-review.md §2.4.
//
//   node qa/playwright/capture-motion.mjs <output-dir>
import { chromium } from '@playwright/test';
import { mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { KIBBUTZIM } from './tests/_fixtures.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = process.argv[2] || path.resolve(__dirname, 'signoff-motion');

const PORT = 8179;

async function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise(resolve => {
      const sock = net.connect(port, '127.0.0.1');
      sock.once('connect', () => { sock.end(); resolve(true); });
      sock.once('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`server on :${port} never came up`);
}

async function record(browser, { reducedMotion, name }) {
  const videoDir = path.join(outDir, '_raw-' + name);
  await mkdir(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true,
    locale: 'he-IL', colorScheme: 'light', serviceWorkers: 'block',
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    recordVideo: { dir: videoDir, size: { width: 360, height: 780 } },
  });
  const page = await context.newPage();
  await page.addInitScript(entries => {
    try { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); } catch {}
    window._pushPromptShown = true;
    window._attReminderShown = true;
    window._fieldPromptShown = true;
  }, { dashboard_user_v1: 'עידן', dashboard_role_v1: 'idan', dashboard_auth_v4: 'ok', theme: 'light' });

  await page.route('https://wwqfcajnxinaxmobrgol.supabase.co/**', route => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    if (url.includes('/functions/v1/')) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"offline"}' });
    if (method !== 'GET') return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"row-level security"}' });
    const table = (/\/rest\/v1\/([^?/]+)/.exec(url) || [])[1];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(table === 'kibbutzim' ? KIBBUTZIM : []) });
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html?login=0&sb=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.kibbutz', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Open the kibbutz card sheet (slide-up from bottom — the clearest motion demo)…
  await page.locator('.kibbutz').first().click({ force: true });
  await page.waitForTimeout(900);
  // …and close it, so the recording shows both the enter and the exit transition.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(700);

  await context.close(); // flushes the video file to videoDir
  const files = await readdir(videoDir);
  const webm = files.find(f => f.endsWith('.webm'));
  if (webm) await rename(path.join(videoDir, webm), path.join(outDir, `sheet-${name}.webm`));
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), String(PORT)], {
    cwd: repoRoot, stdio: 'ignore',
  });
  await waitForPort(PORT);
  const browser = await chromium.launch();
  try {
    await record(browser, { reducedMotion: false, name: 'normal-motion' });
    await record(browser, { reducedMotion: true, name: 'reduced-motion' });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\nSaved to ${outDir}: sheet-normal-motion.webm, sheet-reduced-motion.webm`);
}

main().catch(e => { console.error(e); process.exit(1); });
