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
  // :visible, not .first().isVisible() — the legacy markup stays in the DOM (display:none) under
  // the react driver, so an unscoped text locator resolves to TWO buttons (a strict-mode
  // violation on plain .isVisible()); count() over the :visible pseudo-class is driver-agnostic.
  expect(await page.locator('button:has-text("+ הזמנה חדשה"):visible').count()).toBe(0);
  await d.openTab(page, 'products');
  expect(await page.locator('button:has-text("+ פריט חדש"):visible').count()).toBe(0);
});

// F23b legacy characterized invRenderCerts's source directly (js/src/20-delivery-cert.js), which
// U10/U4 trimmed down to the data pipeline — the certs UI it used to render is
// app/src/islands/InventoryCerts.tsx now, gated the same way (`!user.isViewer`) but as JSX.
// Tried as a real browser flow first (bootInvCerts('צפייה') → open the certs tab): it hangs, same
// as legacy — UPGRADE_FREEZE (js/src/00-consts.js:68-72) bounces a viewer unconditionally on the
// real sb=1 boot path certs needs (`_sbCertGet` is undefined under sb=0), so there is genuinely
// nothing to click, exactly the situation the ORIGINAL F23b comment already documented. Kept as
// a source-level contract for that reason, updated to the file the rule actually lives in now.
test('F23b viewer: the certs tab hides new/send/reissue/cancel behind isViewer() (view stays)', () => {
  const src = read('app/src/islands/InventoryCerts.tsx');
  // the new-cert button (page header) is gated
  expect(src).toMatch(/!user\.isViewer && \(\s*<button[\s\S]{0,80}data-testid="inv-new-cert"/);
  // the per-row "עוד" menu: הצגה is unconditional, שליחה/הפקה מתוקנת/ביטול are behind !isViewer
  expect(src).toMatch(/data-testid=\{`inv-cert-view-\$\{anyc\.cert_number\}`\}/);
  expect(src).toMatch(/\{!user\.isViewer && \(\s*<>\s*<button[\s\S]{0,80}data-testid=\{`inv-cert-send-/);
  expect(src).toMatch(/data-testid=\{`inv-cert-reissue-\$\{anyc\.cert_number\}`\}/);
  expect(src).toMatch(/data-testid=\{`inv-cert-cancel-\$\{anyc\.cert_number\}`\}/);
});

// F23e (Opus deep-check gap, round 2): F23b only proves the GATE EXISTS in source — it never
// proves a real viewer session actually can't see the buttons at runtime. The earlier "hangs"
// note above is about `bootInvCerts` specifically (the sb=1-real-backend certs boot, which
// UPGRADE_FREEZE bounces for a viewer — js/src/00-consts.js `isMock` only exempts sb=0). Plain
// `bootInv` stays on sb=0 the rest of this suite already uses, which IS exempt, so the ⋯ menu
// on a real cert row is reachable after all — no source-regex needed for this one.
test('F23e viewer: the ⋯ menu on a cert row offers הצגה but never שליחה/הפקה מתוקנת/ביטול', async ({ page }, ti) => {
  await bootInv(page, ti, 'צפייה', d);
  await d.openTab(page, 'certs');
  // cert 1041 — an ACTIVE cert (not cancelled), so a writer would see all four rows; the ⋯
  // trigger itself has no isViewer gate (view-only recipients see the same button).
  await page.locator('[data-testid="inv-cert-more-1041"]').click();
  await expect(page.locator('[data-testid="inv-cert-view-1041"]')).toBeVisible();
  expect(await page.locator('[data-testid="inv-cert-send-1041"]').count()).toBe(0);
  expect(await page.locator('[data-testid="inv-cert-reissue-1041"]').count()).toBe(0);
  expect(await page.locator('[data-testid="inv-cert-cancel-1041"]').count()).toBe(0);
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
  expect(await page.locator('button:has-text("+ הזמנה חדשה"):visible').count()).toBeGreaterThan(0);
  for (const id of ['ord-s-small', 'ord-s-big', 'ord-c', 'ord-d']) {
    expect(await d.hasApprove(page, id)).toBe(false);
  }
});
