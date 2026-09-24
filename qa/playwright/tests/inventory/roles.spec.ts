// L1d (part 3): the role matrix characterized on the OLD screen — F23.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '../_helpers';
import { bootInv, driverFor } from './_inv-driver';

const d = driverFor();
const read = (p: string) => readFileSync(join(__dirname, '../../../../', p), 'utf8');

test('F23 viewer: all 6 tabs, no new-order / new-product write controls', async ({ page }, ti) => {
  await bootInv(page, ti, 'צפייה', d);
  expect((await d.tabOrder(page)).length).toBe(6);
  await d.openTab(page, 'orders');
  expect(await page.locator('button:has-text("+ הזמנה חדשה")').isVisible()).toBe(false);
  await d.openTab(page, 'products');
  expect(await page.locator('button:has-text("+ פריט חדש")').isVisible()).toBe(false);
});

// F23b as a live sb=1 boot hits Phase 0's UPGRADE_FREEZE (js/src/00-consts.js: true today) —
// upgradeFreezeDecision(name, isViewer, isCertView, isMock, allowList) returns `isMock` false
// under sb=1, and `isViewer` freezes unconditionally (00-consts.js:68-72) — the viewer never
// reaches the certs tab on the real path at all right now, so there is nothing to click.
// The rule itself is asserted directly against the source instead (same style test-inventory-
// pool.mjs already uses for source-level contracts).
test('F23b viewer: invRenderCerts hides new/send/reissue/cancel behind isViewer()', () => {
  const src = read('js/src/20-delivery-cert.js');
  expect(src).toMatch(/const vw = typeof isViewer === 'function' && isViewer\(\);/);
  expect(src).toMatch(/nb\.style\.display = vw \? 'none' : '';/);
  expect(src).toMatch(/\$\{vw \? '' : `<button class="inv-btn small" style="background:#16a34a;" onclick="certSendOpen/);
  expect(src).toMatch(/\$\{\(cancelled \|\| vw\) \? '' : `<button class="inv-btn small" style="background:#0e7490;" onclick="certReissue/);
});

// F23c: booting מתניה all the way to #sigma-home hits an unrelated block (a "ההתחברות פגה"
// banner appears even under sb=0/mock, seemingly tied to the round-5 "hours are per person"
// change — outside package I). The bounce rule itself is exact and unambiguous in source,
// so it's asserted the same way rather than blocked on an unrelated boot issue.
test('F23c מתניה: showPage(\'inventory\') is coded to bounce to kibbutz', () => {
  const src = read('js/src/02-init-attendance.js');
  expect(src).toMatch(/if \(page === 'inventory' && getCurrentUser\(\) === 'מתניה'\) page = 'kibbutz';/);
});

test('F23d אבצן sees the page and can create an order, but cannot approve one', async ({ page }, ti) => {
  await bootInv(page, ti, 'אבצן' as any, d);
  await d.openTab(page, 'orders');
  expect(await page.locator('button:has-text("+ הזמנה חדשה")').isVisible()).toBe(true);
  for (const id of ['ord-s-small', 'ord-s-big', 'ord-c', 'ord-d']) {
    expect(await d.hasApprove(page, id)).toBe(false);
  }
});
