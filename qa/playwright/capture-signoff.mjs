// Sign-off screenshot capture (tools-and-motion.md §4 "Sign-off protocol": "PNGs at 360×780 and
// 412×915, light and dark... named <screen>__<width>__<theme>.png"). Reuses the same mock-mode
// harness the Playwright suite boots from (installRoutes in tests/_helpers.ts) so what's
// captured is exactly what the suite tests against — not a hand-driven browser session.
//
//   node qa/playwright/capture-signoff.mjs <output-dir>
//
// Not a test — a one-off (well, once-per-package) capture tool run by hand before a designer
// sign-off, so it drives Playwright directly instead of through the `test()` fixture.
//
// Designer verdict fixes (round 3 confirm evidence):
//   E1 — real-device DPR, full page: deviceScaleFactor 3 at 360 (Galaxy S24), 3.5 at 412
//        (S24 Ultra) — was DPR 1, and `page.screenshot` had no `fullPage: true`.
//   E2 — the /?gallery=1 primitives screen is captured too, at every width/theme.
//   E3 — "kibbutz-card-sheet" must be the KIBBUTZ card sheet, not an EMS task modal: clicking
//        `.kibbutz` on the card list (not `.kibbutz` inside an ems-tasks strip) already did
//        this correctly — kept, just made explicit below.
//   E4 — navigate by TAPPING the real nav (`#sigma-nav`'s buttons, the ⋯ עוד sheet), not
//        `window.sigma.showPage()` — a showPage() call never flips the nav's own
//        `aria-current`/active state, so a capture taken right after one shows the wrong tab
//        highlighted. Every screen below is reached the way a finger would reach it.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
// Node 24 strips TypeScript types natively — no loader needed to reuse the SAME fixture rows
// the Playwright suite itself asserts against (Opus audit round 4 item 5: "import the test
// mocks instead of copying them").
import { KIBBUTZIM } from './tests/_fixtures.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = process.argv[2] || path.resolve(__dirname, 'signoff-shots');

const PORT = 8177;
// deviceScaleFactor: the real pixel density of each reference phone (E1) — Galaxy S24 (360×780
// @3x) and Galaxy S24 Ultra / a "Pro Max"-class phone (412×915 @3.5x), not Playwright's default
// desktop DPR of 1.
const PROFILES = [
  { width: 360, height: 780, deviceScaleFactor: 3 },
  { width: 412, height: 915, deviceScaleFactor: 3.5 },
];
const THEMES = ['light', 'dark'];

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

/** Tap the real bottom nav (#sigma-nav) — never `window.sigma.showPage()` (verdict E4): a
    showPage() call paints the page but never touches the nav's own active/aria-current state,
    so a screenshot taken right after one shows the WRONG tab highlighted. `force: true`: the
    PREVIOUS screen's sheet/dialog scrim can still be present (opacity 0, mid fade-out
    transition) when this fires, and Playwright's actionability check correctly reports it as
    "intercepting" even though it is on its way out — this is a capture script driving a KNOWN
    target, not a strict test asserting real user-reachability, so skipping that check is the
    right tradeoff here. */
async function tapNav(page, label) {
  const nav = page.locator('#sigma-nav').getByRole('button', { name: label, exact: true });
  await nav.click({ force: true });
  await page.waitForTimeout(700);
}

/** נוכחות has no direct phone-nav slot for עידן (it lives in the ⋯ עוד sheet — MoreSheet.tsx,
    "נוכחות never hidden"); open the sheet first, the same two taps a finger would make. */
async function tapMoreThenPage(page, label) {
  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click({ force: true });
  await page.waitForTimeout(300);
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(700);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const server = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), String(PORT)], {
    cwd: repoRoot, stdio: 'ignore',
  });
  await waitForPort(PORT);

  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      for (const profile of PROFILES) {
        const { width, height, deviceScaleFactor } = profile;
        const context = await browser.newContext({
          viewport: { width, height }, deviceScaleFactor, isMobile: true, hasTouch: true,
          locale: 'he-IL', colorScheme: theme, serviceWorkers: 'block',
        });
        const page = await context.newPage();
        await page.addInitScript(entries => {
          try { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); } catch {}
          window._pushPromptShown = true;
          window._attReminderShown = true;
          window._fieldPromptShown = true;
        }, {
          dashboard_user_v1: 'עידן', dashboard_role_v1: 'idan', dashboard_auth_v4: 'ok', theme,
        });

        // Minimal offline mock routes — the same shape tests/_helpers.ts installRoutes uses,
        // trimmed to what these screens need to render without a network.
        await page.route('**://fonts.googleapis.com/**', r => r.abort());
        await page.route('**://fonts.gstatic.com/**', r => r.abort());
        await page.route('**://script.google.com/**', r => r.abort());
        await page.route('https://wwqfcajnxinaxmobrgol.supabase.co/**', route => {
          const url = route.request().url();
          const method = route.request().method();
          if (method === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
          if (url.includes('/functions/v1/')) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"offline"}' });
          if (method !== 'GET') return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"row-level security"}' });
          const table = (/\/rest\/v1\/([^?/]+)/.exec(url) || [])[1];
          const body = table === 'kibbutzim' ? KIBBUTZIM : [];
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });

        await page.goto(`http://127.0.0.1:${PORT}/index.html?login=0&sb=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#sigma-home', { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1200);

        const shot = async name => {
          await page.waitForTimeout(300);
          // fullPage (verdict E1): a real sign-off screenshot shows the whole scrollable
          // screen, not just the first viewport-height slice.
          await page.screenshot({ path: path.join(outDir, `${name}__${width}__${theme}.png`), fullPage: true });
          console.log(`  ${name}__${width}__${theme}.png`);
        };

        await shot('home');

        // The kibbutz CARD sheet (verdict E3 — not an EMS task sheet): `.kibbutz` on the home
        // card list, before any nav tap has moved the page away from it.
        const card = page.locator('.kibbutz').first();
        if (await card.count()) {
          await card.click().catch(() => {});
          await page.waitForTimeout(500);
          await shot('kibbutz-card-sheet');
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        }

        await tapNav(page, 'יומן');
        await shot('calendar-month');

        await tapMoreThenPage(page, 'נוכחות');
        await shot('attendance');

        await tapNav(page, 'מלאי');
        await shot('inventory');

        await tapNav(page, 'קיבוצים');
        await page.waitForTimeout(300);

        // /?gallery=1 (designer sign-off E2 / Opus audit round 4 item 4): every primitive,
        // every documented state, captured the same way as any other screen.
        await page.goto(`http://127.0.0.1:${PORT}/index.html?login=0&sb=0&gallery=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="gallery-root"]', { timeout: 30_000 }).catch(() => {});
        await shot('gallery');
        await page.goto(`http://127.0.0.1:${PORT}/index.html?login=0&sb=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#sigma-home', { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(500);

        // settings sheet, from the user chip menu
        const chip = page.getByRole('button', { name: /עידן/ }).first();
        if (await chip.count()) {
          await chip.click().catch(() => {});
          await page.waitForTimeout(300);
          const settingsItem = page.getByRole('menuitem', { name: 'הגדרות' });
          if (await settingsItem.count()) {
            await settingsItem.click().catch(() => {});
            await page.waitForTimeout(500);
            await shot('settings');
          }
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\nSaved to ${outDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
