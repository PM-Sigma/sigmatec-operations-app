// The overlap sweep (design-system spec §3 "Rules that prevent overlap"). Runs on every page
// reachable in mock mode and on the two shared popups (⋯ עוד, ⚙️ הגדרות).
//
// Widths (עידן 23.9 — "phones must be perfect across the range"): the phone range
// (360/390/412/430, see PHONE_WIDTHS) and 1440 on every build; 1920/2560/3840 behind NIGHTLY=1.
// The phone sweep runs once, from the mobile-390-light project — every mobile Playwright
// project already boots the app at its OWN native width as a side effect of existing on the
// matrix, so re-walking all four widths from mobile-390-dark and mobile-360-light too would
// just repeat the same layout checks for no new coverage.
//
// It is EXPECTED to fail on pages nobody has rewritten onto the new primitives yet (foundation
// package — tokens + components only, no page rewrites). Every screen is reported on its own;
// a screen already listed in no-overlap-allow.json logs its violations as a warning instead of
// failing the build. Later packages (S, K, V, C, I, A, G, M, D) fix their page and shrink the
// allow-list — the goal is an EMPTY file, not a permanently-tolerated one.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { boot, expect, expectNoConsoleErrors, test, type Who } from './_helpers';
import { NIGHTLY_WIDTHS, PHONE_WIDTHS, scanA11y, scanNavSafeArea, scanOverlap } from './_overlap';

const ALLOW_PATH = path.resolve(__dirname, '..', 'no-overlap-allow.json');
const ALLOW: Record<string, string> = JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8'));

/** `sigma.showPage(name)` racing the first-screen-per-role pass, the same retry calendar.spec.ts
    uses — a call that lands before that pass finishes is silently dropped. */
async function openPage(page: Page, name: string, viewId: string): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await expect.poll(async () => page.evaluate(([n, v]) => {
    const el = document.getElementById(v as string);
    if (!el || (el as HTMLElement).style.display === 'none') { (window as any).sigma?.showPage?.(n); return false; }
    return true;
  }, [name, viewId] as const), { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(300); // let the island's own async layers (EMS cache, visits) settle
}

async function openMoreSheet(page: Page): Promise<void> {
  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

interface Screen {
  label: string;
  who?: Who;
  open: (page: Page) => Promise<void>;
  /** Skip entirely on this class of viewport (a phone-only sheet, a desktop-only layout). */
  onlyViewport?: 'mobile' | 'desktop';
  /** Extra boot() query string (e.g. `gallery=1`). */
  query?: string;
  /** Wait for this selector instead of the default card-home marker. */
  ready?: string;
  /** Scope the sweep to this subtree instead of the whole document (see `root` on gallery). */
  root?: string;
}

const SCREENS: Screen[] = [
  { label: 'home', open: async () => {} },
  // /?gallery=1 (designer sign-off E2 / Opus audit round 4 item 4): every primitive, every
  // documented state, on the real #sigma-home mount with the real header/nav chrome — and
  // deliberately NOT in no-overlap-allow.json. Unlike every other screen here (foundation
  // package, no page rewrites yet), this one is built entirely from the new primitives, so it
  // must pass the sweep on its own merits, not on a warning-only allowance. Scoped to its own
  // root: the header/nav/FAB chrome it shares with every other screen carries ITS OWN
  // pre-existing bugs (why every other screen has an allow-list entry) — the point here is to
  // prove the NEW primitives are clean, not to make this package fix all of that chrome too.
  { label: 'gallery', query: 'gallery=1', ready: '[data-testid="gallery-root"]', root: '[data-testid="gallery-root"]', open: async () => {} },
  { label: 'calendar', open: p => openPage(p, 'calendar', 'calendar-view') },
  { label: 'inventory', open: p => openPage(p, 'inventory', 'inventory-view') },
  { label: 'attendance', who: 'אביאם', open: p => openPage(p, 'attendance', 'attendance-view') },
  { label: 'burns', open: p => openPage(p, 'burns', 'burns-view') },
  { label: 'pushlog', open: p => openPage(p, 'pushlog', 'pushlog-view') },
  {
    label: 'more-sheet', onlyViewport: 'mobile',
    open: async p => openMoreSheet(p),
  },
  {
    label: 'settings-sheet',
    open: async p => {
      const viewport = (p as any)._sigmaViewport as string;
      if (viewport.startsWith('mobile')) await openMoreSheet(p);
      const chip = p.getByRole('button', { name: /עידן/ }).first();
      await chip.click();
      await p.getByRole('menu').getByRole('menuitem', { name: 'הגדרות' }).click();
      await expect(p.getByRole('dialog').filter({ hasText: 'הגדרות' })).toBeVisible();
    },
  },
];

test.describe('no-overlap sweep', () => {
  for (const screen of SCREENS) {
    test(`no-overlap: ${screen.label}`, async ({ page }, ti) => {
      const { rec, viewport } = await boot(page, ti, { who: screen.who ?? 'עידן', query: screen.query, ready: screen.ready });
      if (screen.onlyViewport === 'mobile') test.skip(!viewport.startsWith('mobile'), `${screen.label} is a phone-only surface`);
      if (screen.onlyViewport === 'desktop') test.skip(!viewport.startsWith('desktop'), `${screen.label} is a desktop-only surface`);
      (page as any)._sigmaViewport = viewport;

      await screen.open(page);

      const theme = ti.project.metadata && (ti.project.metadata as any).theme;
      const reports = [
        await scanOverlap(page, `${screen.label} @ ${viewport}/${theme}`, { root: screen.root }),
        // axe-core (tools-and-motion.md §1 "Accessibility"): once per screen at its base
        // viewport, not at every resized width — a landmark/name/role issue doesn't change
        // with the viewport, so re-running it per width would just repeat the same finding.
        await scanA11y(page, `${screen.label} @ ${viewport}/${theme} (axe)`, { root: screen.root }),
      ];

      // Fixed-nav safe area (designer confirm round, N4b) — scrolls to the bottom itself, so it
      // runs before the PHONE_WIDTHS resize loop below and the scroll position is reset after,
      // not left contaminating those measurements.
      if (viewport.startsWith('mobile')) {
        reports.push(await scanNavSafeArea(page, `${screen.label} @ ${viewport}/${theme} (nav safe area)`));
        await page.evaluate(() => { (document.scrollingElement || document.documentElement).scrollTop = 0; });
      }

      // The full phone-width range, from one canonical project only (see the file header).
      if (ti.project.name === 'mobile-390-light') {
        for (const w of PHONE_WIDTHS) {
          if (w === 390) continue; // already scanned above, at the project's native size
          await page.setViewportSize({ width: w, height: 844 });
          await page.waitForTimeout(150);
          reports.push(await scanOverlap(page, `${screen.label} @ ${w}/${theme}`, { root: screen.root }));
        }
      }

      if (process.env.NIGHTLY === '1' && viewport.startsWith('desktop')) {
        for (const w of NIGHTLY_WIDTHS) {
          await page.setViewportSize({ width: w, height: 1080 });
          await page.waitForTimeout(150);
          reports.push(await scanOverlap(page, `${screen.label} @ ${w}/${theme}`, { root: screen.root }));
        }
      }

      const allowed = ALLOW[screen.label];
      for (const r of reports) {
        if (r.violations.length === 0) continue;
        // rule 1 (horizontal scroll) is never waivable, allow-listed screen or not (designer
        // confirm round, N4a) — split it out and fail on it regardless.
        const rule1 = r.violations.filter(v => v.startsWith('[rule1]'));
        const rest = r.violations.filter(v => !v.startsWith('[rule1]'));
        if (rule1.length) {
          expect(rule1, `${r.label}:\n    ` + rule1.join('\n    ')).toEqual([]);
        }
        if (rest.length === 0) continue;
        const msg = `${r.label}:\n    ` + rest.join('\n    ');
        if (allowed) {
          // eslint-disable-next-line no-console
          console.log(`[no-overlap] KNOWN-FAILING (${allowed}) — ${msg}`);
        } else {
          expect(rest, msg).toEqual([]);
        }
      }

      expectNoConsoleErrors(rec);
    });
  }
});
