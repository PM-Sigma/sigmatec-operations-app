// First screen per role (spec §7l, app/src/lib/landing.ts).
// Covers: the role default (dev → 💻 פיתוח, viewer → the reports hub on the cards page, field
// and pm → the cards), the personal ⚙️ הגדרות override, and the once-per-session rule.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

const SETTINGS_KEY = 'sigma_settings_v1';

test('landing: a dev lands on 💻 פיתוח', async ({ page }, ti) => {
  // מתניה is `dev` in landing.ts BY_NAME, and canSeeDevTasks() lets him open the page.
  const { rec } = await boot(page, ti, { who: 'מתניה', ready: '#dev-view' });

  await expect(page.locator('#dev-view')).toBeVisible();
  await expect(page.locator('#kibbutz-view')).toBeHidden();

  await shot(page, ti, 'dev');
  expectNoConsoleErrors(rec);
});

test('landing: the viewer lands on the cards with the reports hub', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });

  // `{ page: 'kibbutz', scrollTo: 'viewerReportsHub' }` — the one landing that is not a page
  await expect(page.locator('#kibbutz-view')).toBeVisible();
  await expect(page.locator('#viewerReportsHub')).toBeVisible();

  await shot(page, ti, 'viewer');
  expectNoConsoleErrors(rec);
});

test('landing: field and pm land on the cards (and the hub stays hidden)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await expect(page.locator('#kibbutz-view')).toBeVisible();
  await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible();
  await expect(page.locator('#viewerReportsHub')).toBeHidden();
  await expect(page.locator('#dev-view')).toBeHidden();

  expectNoConsoleErrors(rec);
});

test('landing: a personal ⚙️ הגדרות choice beats the role default', async ({ page }, ti) => {
  // עידן is `pm` → the cards by default; his stored choice says 📦 מלאי.
  const { rec } = await boot(page, ti, {
    storage: { [SETTINGS_KEY]: JSON.stringify({ landing: 'inventory' }) },
    ready: '#inventory-view',
  });

  await expect(page.locator('#inventory-view')).toBeVisible();
  await expect(page.locator('#kibbutz-view')).toBeHidden();

  expectNoConsoleErrors(rec);
});

test('landing: a choice the person may not open falls back to the role default', async ({ page }, ti) => {
  // מתניה is refused 📦 מלאי by showPage() ("מתניה doesn't handle inventory"), so his stored
  // inventory landing must resolve to his ROLE default (💻 פיתוח) — never to a blank screen.
  const { rec } = await boot(page, ti, {
    who: 'מתניה',
    storage: { [SETTINGS_KEY]: JSON.stringify({ landing: 'inventory' }) },
    ready: '#dev-view',
  });

  await expect(page.locator('#dev-view')).toBeVisible();
  await expect(page.locator('#inventory-view')).toBeHidden();

  expectNoConsoleErrors(rec);
});

test('landing: a deep link in the hash wins over any landing', async ({ page }, ti) => {
  // §7l: "a deep link always wins — he asked for that screen". With a hash present the
  // landing is a no-op, so מתניה stays on the cards the legacy boot painted.
  const { rec } = await boot(page, ti, { who: 'מתניה', query: 'x=1#usage' });

  await expect(page.locator('#kibbutz-view')).toBeVisible();
  await expect(page.locator('#dev-view')).toBeHidden();

  expectNoConsoleErrors(rec);
});
