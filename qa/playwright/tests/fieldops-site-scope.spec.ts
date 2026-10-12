// פעולות שטח → manual IP lookup when EMS limits the user to his current site (field bug 12.10: 12 meters
// at one site were invisible because the user's EMS site was another one). The rule is a golden
// (fieldOpsView.test.ts lookupScopeText, field-ops handler.test.ts); here the browser half: an empty lookup
// names the site, "חיפוש בכל האתרים" asks with allSites and shows the meters. field-ops is stubbed; fake IPs.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';
import type { Route } from '@playwright/test';

const EMS = { ems_token_v1: 'qa-ems-token', ems_token_at_v1: String(Date.now()) };
const SITE = '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const meter = (n: number) => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, serialNumber: 'BFM-' + n, address: 'לוח ' + n,
  ipAddress: '10.0.0.1', deviceNumber: String(n), currentMultiplier: '1', voltageMultiplier: '1', powerMultiplier: '1',
  site: { id: SITE, name: 'יגור' }, type: { code: 15, key: 'bfm2', name: 'Satec BFM 2', powerMultiplier: '1' },
});

test('fieldops: an empty lookup names the EMS site it was limited to; "search all sites" finds the meters', async ({ page }, ti) => {
  test.skip(!/mobile-(360|412)/.test(ti.project.name), 'phone widths (360/412) are the field target');
  const { rec } = await boot(page, ti, { storage: EMS });
  const calls: any[] = [];
  await page.route('**/functions/v1/field-ops', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const body = b.mode !== 'lookup' ? { meters: [] }
      : b.allSites ? { meters: Array.from({ length: 12 }, (_, i) => meter(i + 1)) }
      : { meters: [], scope: { siteId: 'x', siteName: 'דגניה א' }, switched: false };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.evaluate(() => {
    (window as any).sigma.getEmsSites = async () => [];
    (window as any).showPage('fieldops');
  });
  await expect(page.getByTestId('fieldops-page')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('radio', { name: 'הזנה ידנית' }).click();
  await page.getByLabel('כתובת IP *').fill('10.0.0.1');
  const box = page.getByTestId('fieldops-ip-scope');
  await expect(box).toContainText('EMS מציג רק את האתר הנוכחי שלך (דגניה א). לחפש בכל האתרים?');
  await expect(page.getByTestId('fieldops-lookup-refresh')).toBeVisible();
  await box.scrollIntoViewIfNeeded();
  await shot(page, ti, 'site-scope');
  expect(calls.some(c => c.allSites), 'nothing switched before the user asked').toBe(false);
  await page.getByTestId('fieldops-search-all').click();
  await expect(page.getByTestId('fieldops-ip-table').locator('tbody tr')).toHaveCount(12);
  await expect(page.getByTestId('fieldops-ip-table')).toContainText('יגור');
  expect(calls.filter(c => c.allSites)).toEqual([{ token: 'qa-ems-token', mode: 'lookup', ip: '10.0.0.1', allSites: true }]);
  expectNoConsoleErrors(rec);
});
