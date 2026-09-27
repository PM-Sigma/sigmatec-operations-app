// פעולות שטח → קריאת מודבוס (r9) in a real browser. The numbers are goldens in
// app/src/lib/fieldops/*.test.ts; here: the page opens for staff (never the viewer), a list read
// renders the scaled table, manual mode says how many EMS meters sit on the typed IP (0 / 1 /
// several) with the kibbutz · meter · address table, a timeout and a `[null]` reply read clearly.
// The field-ops Edge Function is stubbed; IPs are documentation-range only (the repo is public).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';
import type { Page, Route } from '@playwright/test';

const EMS = { ems_token_v1: 'qa-ems-token', ems_token_at_v1: String(Date.now()) };
const SITE = '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const M3 = '33333333-3333-4333-8333-333333333333';

const meter = (id: string, ip: string, unit: string, serial: string, address: string, o: any = {}) => ({
  id, serialNumber: serial, address, ipAddress: ip, deviceNumber: unit,
  currentMultiplier: '1.0000', voltageMultiplier: '1.0000', powerMultiplier: '1.0000',
  site: { id: SITE, name: 'קיבוץ דוגמה' }, type: { code: 12, key: 'pm135', name: 'Satec PM135', powerMultiplier: '1.0000' },
  lastTransmission: { callDate: '2026-09-27T09:30:00.000Z', goodRow: true }, ...o,
});
const SITE_METERS = [meter(M1, '192.0.2.10', '1', '1672005', 'רפת'), meter(M2, '192.0.2.20', '1', '1557654', 'לול', { currentMultiplier: '200.0000', type: { code: 25, name: 'ABB B23/B24', powerMultiplier: '1' } })];
const LOOKUP: Record<string, any[]> = {
  '192.0.2.10': [SITE_METERS[0]],
  '192.0.2.30': [meter(M1, '192.0.2.30', '1', '1239859-1', 'מבנה א'), meter(M3, '192.0.2.30', '2', '1239860', 'מבנה ב')],
};
const log = (responseData: unknown, o: any = {}) => ({
  id: 'L' + Math.random(), operationCode: 'modbus_read', status: 'completed', responseData, errorMessage: null,
  createdAt: '2026-09-27T10:00:00Z', completedAt: '2026-09-27T10:00:04Z', executedBy: 'עידן', ...o,
});
const G1 = [{ CounterNumber: '1672005', FT: 169404, V1: 235, V2: 234, V3: 234, I1: 166, I2: 139, I3: 113, PF: 1000, CT_Ratio: 0 }];
const G10 = [{ CounterNumber: '1557654', FT: 17127.221, V1: 229.7, V2: 229.5, V3: 230.1, I1: 0.56, I2: 0.42, I3: 0.54, PF: -0.866 }];

type Handler = (b: any) => { status?: number; body: unknown };
async function stubFieldOps(page: Page, read: Handler = () => ({ body: {} })) {
  const calls: any[] = [];
  await page.route('**/functions/v1/field-ops', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    let r: { status?: number; body: unknown };
    if (b.mode === 'meters') r = { body: { meters: SITE_METERS } };
    else if (b.mode === 'lookup') r = { body: { meters: LOOKUP[b.ip] || [] } };
    else if (b.mode === 'history') r = { body: { logs: [log(G1)] } };
    else r = read(b);
    return route.fulfill({ status: r.status ?? 200, contentType: 'application/json', body: JSON.stringify(r.body) });
  });
  return calls;
}

async function openFieldOps(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).sigma;
    s.getEmsSites = async () => [{ id: '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', name: 'קיבוץ דוגמה' }];
    (window as any).showPage('fieldops');
  });
  await expect(page.getByTestId('fieldops-page')).toBeVisible({ timeout: 20_000 });
}

async function pickListMeter(page: Page, id: string) {
  await page.getByLabel('בחר קיבוץ *').selectOption(SITE);
  const sel = page.getByLabel('בחר מונה');
  await expect(sel.locator(`option[value="${id}"]`)).toBeAttached({ timeout: 10_000 });
  await sel.selectOption(id);
}

async function manual(page: Page, ip: string, unit = '') {
  await page.getByRole('radio', { name: 'הזנה ידנית' }).click();
  await page.getByLabel('כתובת IP *').fill(ip);
  if (unit) await page.getByLabel('מספר ID').fill(unit);
  return page.getByTestId('fieldops-ip-status');
}

const readBtn = (page: Page) => page.getByRole('button', { name: /בדוק חיבור וקרא נתונים/ });

test('list read: ABB cm 200 renders both columns, the multiplier chip and history', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  const calls = await stubFieldOps(page, b => ({ body: { meter: SITE_METERS[1], override: [], log: log(G10) } }));
  await openFieldOps(page);
  await expectRtl(page);
  await pickListMeter(page, M2);
  await expect(page.getByTestId('fieldops-picked')).toContainText('192.0.2.20');
  await readBtn(page).click();
  const card = page.getByTestId('fieldops-read');
  await expect(card.locator('[data-row="I1"]')).toContainText('0.56');
  await expect(card.locator('[data-row="I1"]')).toContainText('112 A');
  await expect(card.locator('[data-row="FT"]')).toContainText('3,425,444.2 kWh');
  await expect(card).toContainText('כופל זרם ×200');
  await expect(card).toContainText('הצלחה');
  await expect(page.getByTestId('fieldops-history')).toContainText('הצליח');
  expect(calls.find(c => c.mode === 'read')).toEqual({ token: 'qa-ems-token', mode: 'read', meterId: M2 });
  await shot(page, ti, 'list-read');
  expectNoConsoleErrors(rec);
});

test('manual, 0 matches: "not registered" notice, no table, then a read with a type goes through the override', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  const calls = await stubFieldOps(page, () => ({ body: { meter: null, override: ['meterIpAddress'], log: log(G1) } }));
  await openFieldOps(page);
  const status = await manual(page, '192.0.2.99', '4');
  await expect(status).toContainText('ה-IP הזה לא מוקם ב-EMS — המונה לא רשום');
  await expect(status).toContainText('אין ב-EMS מונה על ה-IP הזה עם ID 4');
  await expect(page.getByTestId('fieldops-ip-table')).toHaveCount(0);
  await readBtn(page).click();
  await expect(page.getByTestId('fieldops-message')).toContainText('נא לבחור סוג מונה');
  await page.getByLabel('סוג מונה').selectOption('12');
  await readBtn(page).click();
  const card = page.getByTestId('fieldops-read');
  await expect(card).toContainText('לא רשום ב-EMS — מוצג בלי כופלי EMS');
  await expect(card.locator('[data-row="FT"]')).toContainText('169,404 kWh');
  expect(calls.find(c => c.mode === 'read')).toEqual({ token: 'qa-ems-token', mode: 'read', ip: '192.0.2.99', unit: 4, typeCode: 12 });
  await shot(page, ti, 'manual-unregistered');
  expectNoConsoleErrors(rec);
});

test('manual, 1 match: status line + a one-row table, the typed ID is registered', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  await stubFieldOps(page);
  await openFieldOps(page);
  const status = await manual(page, '192.0.2.10', '1');
  await expect(status).toContainText('ה-IP הזה מוביל למונה אחד ב-EMS');
  await expect(status).toContainText('המונה עם ID 1 רשום ב-EMS: 1672005 · רפת');
  const table = page.getByTestId('fieldops-ip-table');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('קיבוץ דוגמה');
  await expect(table).toContainText('רפת');
  expectNoConsoleErrors(rec);
});

test('manual, several matches: count + table, and a typed ID that is not among them is flagged', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  await stubFieldOps(page);
  await openFieldOps(page);
  const status = await manual(page, '192.0.2.30', '7');
  await expect(status).toContainText('ה-IP הזה מוביל ל-2 מונים ב-EMS');
  await expect(status).toContainText('אין ב-EMS מונה על ה-IP הזה עם ID 7 — המונה לא רשום');
  await expect(page.getByTestId('fieldops-ip-table').locator('tbody tr')).toHaveCount(2);
  await shot(page, ti, 'manual-several');
  expectNoConsoleErrors(rec);
});

test('timeout and [null]: each reads as one clear sentence', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  let reply: 'timeout' | 'null' = 'timeout';
  await stubFieldOps(page, () => reply === 'timeout'
    ? { status: 504, body: { error: 'timeout', detail: 'timeout' } }
    : { body: { meter: SITE_METERS[0], override: [], log: log([null]) } });
  await openFieldOps(page);
  await pickListMeter(page, M1);
  await readBtn(page).click();
  await expect(page.getByTestId('fieldops-message')).toContainText('המונה לא ענה בזמן');
  reply = 'null';
  await readBtn(page).click();
  await expect(page.getByTestId('fieldops-error')).toContainText('המונה לא החזיר נתונים — ייתכן שסוג המונה ב-EMS שגוי');
  await expect(page.getByTestId('fieldops-rows')).toHaveCount(0);
  // a function error is a 504 on purpose — the only console noise allowed is that response
  expect(rec.errors.filter(e => !/504/.test(e))).toEqual([]);
});

test('the viewer never gets the page', async ({ page }, ti) => {
  await boot(page, ti, { who: 'צפייה' as any, storage: EMS });
  await page.evaluate(() => (window as any).showPage('fieldops'));
  await expect(page.locator('#fieldops-view')).toBeHidden();
  await expect(page.getByTestId('fieldops-page')).toHaveCount(0);
});
