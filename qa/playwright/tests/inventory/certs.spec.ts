// L1d (part 1): certificate flows characterized on the OLD screen — F16–F19.
// Certs need the REAL-Supabase boot path (bootInvCerts, sb=1) — js/src/20-delivery-cert.js's
// _sbCertGet only exists there (see _inv-driver.ts's own note on bootInvCerts).
import { test, expect } from '../_helpers';
import { bootInvCerts, driverFor } from './_inv-driver';
import { ledger } from './_inv-ledger';

const d = driverFor();

test('F16 range/search filter the registry; cancel and reissue write the expected rows', async ({ page }, ti) => {
  await bootInvCerts(page, ti, 'עידן');
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.locator('[data-inv-tab="certs"]').click();
  await expect(page.locator('#invCertsList')).toBeVisible();

  await d.certRange(page, 'all');
  expect(await d.certNumbers(page)).toEqual([1042, 1041]);   // desc by cert_number

  await d.certSearch(page, 'דגניה');
  expect(await d.certNumbers(page)).toEqual([1042]);
  await d.certSearch(page, '');

  const viewText = await d.certViewText(page, 1041);
  expect(viewText).toContain('תעודת משלוח 1041');
  expect(viewText).toContain('מסמך ממוחשב');
  await page.locator('#certViewOverlay').evaluate(el => { (el as HTMLElement).style.display = 'none'; });

  const sendRows = await d.certSendRows(page, 1041);
  expect(sendRows.join(' ')).toContain('דני');
  await page.locator('#certSendModal').evaluate(el => el.classList.remove('open'));

  await d.certCancel(page, 1041);
  let l = await ledger(page);
  expect(l).toContainEqual(expect.objectContaining({
    table: 'delivery_certs', op: 'patch',
    match: '00000000-0000-4000-8000-000000001041',
    row: { status: 'cancelled' },
  }));

  await d.certReissue(page, 1041);
  l = await ledger(page);
  const inserted = l.find(r => r.table === 'delivery_certs' && r.op === 'insert');
  expect(inserted?.row).toMatchObject({ kibbutz: 'חוקוק', items: [{ name: 'מונה Landis+Gyr E360PP', qty: 3 }] });
  const cancelPatches = l.filter(r => r.table === 'delivery_certs' && r.op === 'patch' && r.match === '00000000-0000-4000-8000-000000001041');
  expect(cancelPatches.some(p => (p.row as any).replaced_by)).toBe(true);
});

test('F17 issuing from a visit (noPrint) opens the overlay and marks the visit\'s cert gate', async ({ page }, ti) => {
  await bootInvCerts(page, ti, 'עידן');
  await page.evaluate(pre => (window as any).sigma.openDeliveryCert(pre), {
    kibbutz: 'חוקוק', items: [{ name: 'בקר 504', qty: 1 }], source: 'visit', refId: 'vis-new-visit', noPrint: true,
  });
  await page.locator('#certModal.open').waitFor({ state: 'visible' });
  page.once('dialog', dlg => dlg.accept());
  await page.locator('#certModal button[onclick="issueDeliveryCert(this)"]').click();
  await page.locator('#certViewOverlay').waitFor({ state: 'visible', timeout: 15_000 });
  const num = await page.evaluate(id => (window as any).certIssuedForVisit(id), 'vis-new-visit');
  expect(num).toBeGreaterThan(1042);
});

test('F17b an insert that fails issues an unnumbered draft, never reaches the registry', async ({ page }, ti) => {
  await bootInvCerts(page, ti, 'עידן');
  await page.route('**/rest/v1/delivery_certs**', route =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{}' }) : route.fallback());
  await page.evaluate(pre => (window as any).sigma.openDeliveryCert(pre), {
    kibbutz: 'חוקוק', items: [{ name: 'בקר 504', qty: 1 }], source: 'visit', refId: 'vis-fail', noPrint: true,
  });
  await page.locator('#certModal.open').waitFor({ state: 'visible' });
  await page.locator('#certModal button[onclick="issueDeliveryCert(this)"]').click();
  // the ledger records the ATTEMPT (the client posts to sigma:write-router regardless of what
  // the server does with it) — the real guarantee is what issueDeliveryCert does when that
  // attempt comes back failed: no number, no registry entry, no doc-snapshot follow-up patch.
  await expect(page.locator('#toast')).toContainText('טיוטה', { timeout: 10_000 });
  const l = await ledger(page);
  expect(l.filter(r => r.table === 'delivery_certs' && r.op === 'patch' && (r.row as any).doc_html)).toEqual([]);
  const num = await page.evaluate(id => (window as any).certIssuedForVisit(id), 'vis-fail');
  expect(num).toBe(0);
});

test('F18 ?cert=<uuid> renders the certificate full-page, no app shell', async ({ page }, ti) => {
  await bootInvCerts(page, ti, 'עידן');
  await page.goto('/index.html?cert=00000000-0000-4000-8000-000000001041');
  await expect(page.locator('body')).toContainText('תעודת משלוח 1041');
  expect(await page.locator('#sigma-nav').count()).toBe(0);
});

test('F19 the periodic report groups by kibbutz with totals', async ({ page }, ti) => {
  await bootInvCerts(page, ti, 'עידן');
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.locator('[data-inv-tab="certs"]').click();
  await d.certRange(page, 'all');   // sets #invCertsFrom/To to 2000-01-01..2099-01-01 — real-clock safe
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.evaluate(() => (window as any).certMonthlyFromTab()),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  const text = await popup.innerText('body');
  expect(text).toContain('חוקוק');
  expect(text).toContain('דגניה');
});
