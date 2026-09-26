// Playwright config for the Sigmatec Operations App (QA gate 3).
//
// Four projects = the binding matrix from the phased-execution plan: desktop 1440×900 and
// mobile 390×844, each in light and dark. The app is RTL at the document level
// (`<html dir="rtl">`) and every island root re-declares `dir="rtl"`, so RTL is not a fifth
// project — `expectRtl()` in tests/_helpers.ts asserts it on every spec instead, which is
// stronger than running one extra browser.
//
// The server is started by THIS config (`webServer`): http-server on port 8123 over the repo
// root, so the suite needs nothing running beforehand. `?login=0&sb=0` (added by `boot()`)
// gives mock data and no EMS login, and _helpers.ts stubs every Supabase REST call with local
// fixtures — no network, no production writes, fully offline.
//
//   npx playwright test --config qa/playwright/playwright.config.ts
//   npm run qa -- --only playwright
import { defineConfig, devices } from '@playwright/test';

// 8124, not 8123: the `cards-wt` launch entry already serves this worktree on 8123 with a
// single-threaded python http.server, and `reuseExistingServer` would hand the suite that
// server, which drops island-chunk requests under four parallel workers. The QA suite owns
// its own port so a dev server being up (or not) can never change the result.
const PORT = 8124;

export default defineConfig({
  testDir: './tests',
  // Screenshots land in shots/<spec>/<viewport>-<theme>.png (see shot() in tests/_helpers.ts);
  // this is only where Playwright puts its own failure artifacts.
  outputDir: '../../test-results',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 4,
  reporter: [
    ['list'],
    ['json', { outputFile: '../../test-results/playwright.json' }],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    // The feedback spec needs the microphone REFUSED. Playwright grants nothing by default,
    // and an empty list makes that explicit rather than incidental.
    permissions: [],
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 10_000,
    // The app is a PWA; a live service worker would serve a stale bundle between projects.
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'desktop-1440-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
      metadata: { viewport: 'desktop-1440', theme: 'light' },
    },
    {
      name: 'desktop-1440-dark',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
      metadata: { viewport: 'desktop-1440', theme: 'dark' },
    },
    {
      name: 'mobile-390-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, colorScheme: 'light' },
      metadata: { viewport: 'mobile-390', theme: 'light' },
    },
    {
      name: 'mobile-390-dark',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, colorScheme: 'dark' },
      metadata: { viewport: 'mobile-390', theme: 'dark' },
    },
    // 360×780 (Galaxy S24, the smallest phone in the round-5 QA range — עידן 23.9): a real
    // touch/DPR profile, not the Desktop-Chrome base the other mobile projects use, since 360
    // is now the primary phone target and a false-negative from an untouched/1x emulation would
    // hide the exact overlap bugs this width exists to catch.
    {
      name: 'mobile-360-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, colorScheme: 'light', deviceScaleFactor: 3, hasTouch: true, isMobile: true },
      metadata: { viewport: 'mobile-360', theme: 'light' },
    },
    // 412×915 (Pixel-class phone — round-7 M-U coordinator finding): the width the presenter's
    // close-undo toast gutter mismatch was actually caught at (38px left vs 16px right), so it
    // needs its own project rather than being covered only by 390/360.
    {
      name: 'mobile-412-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 412, height: 915 }, colorScheme: 'light', deviceScaleFactor: 3.5, hasTouch: true, isMobile: true },
      metadata: { viewport: 'mobile-412', theme: 'light' },
    },
  ],

  webServer: {
    // A dependency-free node:http server over the repo root. `npx http-server` was tried
    // first and dropped island-chunk requests (ERR_CONNECTION_REFUSED) under four parallel
    // workers; see the note at the top of server.mjs.
    command: `node qa/playwright/server.mjs ${PORT}`,
    cwd: '../..',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
