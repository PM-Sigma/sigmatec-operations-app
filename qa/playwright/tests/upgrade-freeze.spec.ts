// Upgrade freeze (round 5, Phase 0, spec docs/superpowers/specs/2026-09-23-round-5-design.md).
// עידן and עמיחי get in; everyone else (and the view-only PIN) sees a full-screen "המערכת
// בשדרוג" that cannot be closed, with one "התנתק" link back to the login gate.
//
// Mock mode (`?sb=0`, which every spec in this suite boots with) is itself exempt — a frozen
// app would break the whole rest of the suite — so this spec drives the check with the test
// hook `?freeze=1`, honored only under `?sb=0` (js/src/15-login-gate.js `upgradeFrozen`).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

const TITLE = 'המערכת בשדרוג';
const LINE = 'נעדכן כשהיא חוזרת.';

async function expectFrozen(page: import('@playwright/test').Page) {
  const gate = page.locator('#upgradeFreezeGate');
  await expect(gate).toBeVisible();
  await expect(gate).toContainText(TITLE);
  await expect(gate).toContainText(LINE);
  await expect(gate.getByRole('link', { name: 'התנתק' })).toBeVisible();

  // Full screen, and above every other overlay in the app (the highest static z-index in
  // index.html, the EMS gate, is 3000).
  const box = await gate.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(vp.width - 2);
  expect(box!.height).toBeGreaterThanOrEqual(vp.height - 2);
  const z = await gate.evaluate(el => Number(getComputedStyle(el).zIndex));
  expect(z).toBeGreaterThan(3000);

  // No close: nothing behind it is reachable — a click through the overlay hits the overlay,
  // not a kibbutz card, and Escape does not dismiss it.
  await page.keyboard.press('Escape');
  await expect(gate).toBeVisible();
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('#upgradeFreezeGate') !== null : false;
  }, { x: Math.floor(vp.width / 2), y: Math.floor(vp.height / 2) });
  expect(hit, 'the center of the screen must hit the freeze overlay, not the app under it').toBe(true);
}

test('עידן — allow-listed, passes straight through', async ({ page }, testInfo) => {
  const { rec } = await boot(page, testInfo, { who: 'עידן', query: 'freeze=1' });
  await expectRtl(page);
  await expect(page.locator('#upgradeFreezeGate')).toHaveCount(0);
  await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('עמיחי — allow-listed, passes straight through', async ({ page }, testInfo) => {
  const { rec } = await boot(page, testInfo, { who: 'עמיחי', query: 'freeze=1' });
  await expectRtl(page);
  await expect(page.locator('#upgradeFreezeGate')).toHaveCount(0);
  await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('אביאם — not on the allow-list, blocked and cannot interact', async ({ page }, testInfo) => {
  // ready: '' — the card home never appears while frozen, so boot() must not wait for it.
  await boot(page, testInfo, { who: 'אביאם', query: 'freeze=1', ready: '' });
  await expectFrozen(page);
  await shot(page, testInfo, 'frozen-aviam');
});

test('the view-only PIN — always blocked, allow-list or not', async ({ page }, testInfo) => {
  await boot(page, testInfo, { who: 'צפייה', query: 'freeze=1', ready: '' });
  await expectFrozen(page);
});

test('the "התנתק" link clears identity and returns to the login gate', async ({ page }, testInfo) => {
  await boot(page, testInfo, { who: 'אביאם', query: 'freeze=1', ready: '' });
  await expectFrozen(page);
  // boot()'s addInitScript re-seeds the persona on every real navigation (by design, so a spec
  // stays "logged in" across reloads elsewhere in the suite) — that would immediately
  // re-authenticate and re-freeze the reload the link triggers, hiding the clear this test is
  // checking. One more init script, registered after boot()'s, undoes that reseed.
  await page.addInitScript(() => {
    localStorage.removeItem('dashboard_user_v1');
    localStorage.removeItem('dashboard_auth_v4');
    localStorage.removeItem('dashboard_role_v1');
  });
  await page.locator('#upgradeFreezeGate').getByRole('link', { name: 'התנתק' }).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#upgradeFreezeGate')).toHaveCount(0);
  await expect(page.locator('#loginModal')).toHaveClass(/open/);
});

test('mock mode without the test hook is exempt — the freeze must not break the rest of the suite', async ({ page }, testInfo) => {
  const { rec } = await boot(page, testInfo, { who: 'אביאם' });   // no ?freeze=1
  await expect(page.locator('#upgradeFreezeGate')).toHaveCount(0);
  await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible();
  expectNoConsoleErrors(rec);
});
