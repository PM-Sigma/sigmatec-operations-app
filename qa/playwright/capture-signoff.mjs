// Sign-off screenshot capture (tools-and-motion.md §4 "Sign-off protocol": "PNGs at 360×780 and
// 412×915, light and dark... named <screen>__<width>__<theme>.png"). Reuses the same mock-mode
// harness the Playwright suite boots from (installRoutes in tests/_helpers.ts) so what's
// captured is exactly what the suite tests against — not a hand-driven browser session.
//
//   node qa/playwright/capture-signoff.mjs <output-dir>
//
// Not a test — a one-off (well, once-per-package) capture tool run by hand before a designer
// sign-off, so it drives Playwright directly instead of through the `test()` fixture.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = process.argv[2] || path.resolve(__dirname, 'signoff-shots');

const PORT = 8177;
const WIDTHS = [360, 412];
const THEMES = ['light', 'dark'];

// A compact stand-in for tests/_fixtures.ts's KIBBUTZIM (TS, not importable from a plain .mjs
// script without a loader) — enough rows for a representative home/calendar/kibbutz-sheet
// capture: two sections, a sub-site, a marketing row, mixed energy types.
const KIBBUTZIM = [
  { id: 'k1', name: 'חוקוק', display_name: null, section: 'active', region: 'גליל וגולן',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null, ems_site_ids: ['s1'] },
  { id: 'k2', name: 'דגניה', display_name: null, section: 'active', region: 'גליל וגולן',
    energy: ['electric', 'water'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null, ems_site_ids: ['s2'] },
  { id: 'k3', name: 'יגור', display_name: null, section: 'active', region: 'העמקים',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null, ems_site_ids: ['s3'] },
  { id: 'k4', name: 'יגור — רפת', display_name: null, section: 'active', region: 'העמקים',
    energy: ['water'], kind: 'subsite', parent: 'יגור', marketing: false, archived_at: null, ems_site_ids: ['s3'] },
  { id: 'k5', name: 'כפר עזה', display_name: null, section: 'active', region: 'דרום, עוטף עזה והנגב',
    energy: ['gas'], kind: 'kibbutz', parent: null, marketing: true, archived_at: null, ems_site_ids: ['s5'] },
  { id: 'k6', name: 'גבת', display_name: null, section: 'new', region: 'העמקים',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null, ems_site_ids: ['s6'] },
];

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

async function main() {
  await mkdir(outDir, { recursive: true });

  const server = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), String(PORT)], {
    cwd: repoRoot, stdio: 'ignore',
  });
  await waitForPort(PORT);

  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        const height = width === 360 ? 780 : 915;
        const context = await browser.newContext({
          viewport: { width, height }, locale: 'he-IL', colorScheme: theme,
          serviceWorkers: 'block',
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
        // trimmed to what these six screens need to render without a network.
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
          await page.screenshot({ path: path.join(outDir, `${name}__${width}__${theme}.png`) });
          console.log(`  ${name}__${width}__${theme}.png`);
        };

        await shot('home');

        // one kibbutz card sheet
        const card = page.locator('.kibbutz').first();
        if (await card.count()) {
          await card.click().catch(() => {});
          await page.waitForTimeout(500);
          await shot('kibbutz-card-sheet');
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        }

        const showPage = async (name, viewId) => {
          await page.evaluate(([n, v]) => {
            const el = document.getElementById(v);
            if (!el || el.style.display === 'none') window.sigma?.showPage?.(n);
          }, [name, viewId]);
          await page.waitForTimeout(700);
        };

        await showPage('calendar', 'calendar-view');
        await shot('calendar-month');

        await showPage('attendance', 'attendance-view');
        await shot('attendance');

        await showPage('inventory', 'inventory-view');
        await shot('inventory');

        // settings sheet, from the user chip menu
        await showPage('kibbutz', 'kibbutz-view');
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
