// 📥 עין המפרץ (CityMind) tab on the readings page. Everything is mocked; serials/ids are FAKE.
// The rules are goldens (test-readings-citymind.mjs, readingsLogic.test.ts siteMode); here the browser half: the site
// tabs, the "auto every morning" note, no manual pull, downloads locked until the EMS check, then open.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';
import { addDays, yesterdayIL } from '../../../app/src/lib/readingsLogic';

const HULDA = { id: 'site-1', kibbutz: 'חולדה', ems_site_id: null, active: true, rules: {} };
const EIN = { id: 'site-2', kibbutz: 'עין המפרץ', ems_site_id: null, active: true, rules: { source: 'citymind', energy_type_code: 2 } };
const FILES = 'https://readings-files.test';
type Row = Record<string, any>;
const d0 = yesterdayIL();

const einRun = (o: Row = {}): Row => ({
  id: 'ein-1', site_id: 'site-2', reading_date: d0, trigger: 'cron', started_by: 'GitHub', started_at: `${addDays(d0, 1)}T03:12:00Z`,
  finished_at: `${addDays(d0, 1)}T03:13:00Z`, status: 'ok', attempt: 1, progress: { CityMind: { state: 'ok', count: 496 } },
  n_ok: 493, n_blocked: 2, n_warn: 1,
  summary: [['חוסם', 'ירידה', 1], ['חוסם', 'החלפת משדר/מונה בזיהוי 9001', 1], ['אזהרה', 'צריכה גבוהה', 1]],
  exceptions: [
    ['CityMind', '9002', 'T1000002', `${d0} 23:00`, 10, 'חוסם', 'ירידה: 20 (01/10) → 10'],
    ['CityMind', '9001', 'T2000001', `${d0} 23:00`, 3, 'חוסם', 'החלפת משדר/מונה בזיהוי 9001: T1000001 → T2000001 — ממתין לבדיקת רצף שיוך במערכת'],
    ['CityMind', '9003', 'T1000003', `${d0} 23:00`, 900, 'אזהרה', 'צריכה גבוהה: 150.0 מ"ק ביום (מעל 100)'],
  ],
  error: null, readings_file: 'x/readings.xlsx', exceptions_file: 'x/exceptions.xlsx',
  ems_checked: false, ems_checked_by: null, ems_checked_at: null, uploaded: false, uploaded_by: null, uploaded_at: null,
  uploaded_source: null, seen_by: ['עידן'], ...o,
});

async function install(page: any, runs: Row[], calls: Row[]) {
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(SB_ORIGIN + '/rest/v1/reading_sites*', (r: any) => r.fulfill(json([HULDA, EIN])));
  await page.route(SB_ORIGIN + '/rest/v1/reading_sources*', (r: any) => {
    const sid = new URL(r.request().url()).searchParams.get('site_id') || '';
    r.fulfill(json(sid.endsWith('site-1') ? [{ id: 'src-speednet', name: 'SpeedNet' }] : []));
  });
  await page.route(SB_ORIGIN + '/rest/v1/reading_runs*', (r: any) => {
    const q = new URL(r.request().url()).searchParams;
    const sid = (q.get('site_id') || '').replace(/^eq\./, '');
    r.fulfill(json(runs.filter(x => !sid || x.site_id === sid)));
  });
  await page.route(FILES + '/**', (r: any) => r.fulfill({ status: 200, body: 'PK-fake', headers: { 'content-type': 'application/octet-stream' } }));
  await page.route(SB_ORIGIN + '/functions/v1/readings-fetch', async (r: any) => {
    const b = JSON.parse(r.request().postData() || '{}');
    calls.push(b);
    const run = runs.find(x => x.id === b.run_id);
    if (b.mode === 'emsCheck' && run) Object.assign(run, { ems_checked: true, ems_checked_by: 'עידן', ems_checked_at: new Date().toISOString() });
    if (b.mode === 'sign') return r.fulfill(json(run && !run.ems_checked ? { error: 'NOT_CHECKED', message: 'x' } : { url: `${FILES}/${b.kind}.xlsx` }, run && !run.ems_checked ? 409 : 200));
    return r.fulfill(json({ ok: true }));
  });
}

test('readings: עין המפרץ tab — auto every morning, no manual pull, files open only after the EMS check', async ({ page }, ti) => {
  test.skip(!/mobile-(360|412)/.test(ti.project.name), 'phone widths (360/412) for this tab');
  const runs = [einRun()];
  const calls: Row[] = [];
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await install(page, runs, calls);
  await page.evaluate(() => { (window as any).sigma.emsToken = () => 'fake-ems-token'; });
  await page.evaluate(() => (window as any).showPage('readings'));
  await page.mouse.click(1, 1);
  await expect(page.getByTestId('readings-page')).toBeVisible({ timeout: 20_000 });

  const tabs = page.getByTestId('readings-site-tabs');
  await expect(tabs.getByRole('radio', { name: 'חולדה' })).toBeVisible();
  await tabs.getByRole('radio', { name: 'עין המפרץ' }).click();

  await expect(page.getByTestId('readings-site-note')).toContainText('נמשך אוטומטית כל בוקר בסביבות 06:00');
  await expect(page.getByTestId('readings-manual')).toHaveCount(0);
  await expect(page.locator('[data-gap]').first()).toBeVisible();
  await expect(page.locator('[data-gap]').getByRole('button', { name: 'משוך' })).toHaveCount(0);

  const latest = page.getByTestId('readings-latest');
  await expect(latest.getByText('493')).toBeVisible();
  await expect(latest.getByTestId('readings-reason')).toHaveCount(3);
  await expect(latest.getByTestId('readings-locked')).toBeVisible();
  await expect(latest.getByTestId('readings-download-readings')).toBeDisabled();
  await expect(latest.getByTestId('readings-download-exceptions')).toBeDisabled();
  await expectRtl(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'horizontal overflow (px)').toBeLessThanOrEqual(0);
  await shot(page, ti, 'ein-locked');

  await latest.getByTestId('readings-ems-check').click();
  await expect(latest.getByTestId('readings-download-readings')).toBeEnabled({ timeout: 10_000 });
  await expect(latest.getByTestId('readings-locked')).toHaveCount(0);
  expect(calls.some(c => c.mode === 'run'), 'no on-demand pull for עין המפרץ').toBe(false);
  expect(calls.find(c => c.mode === 'emsCheck')).toMatchObject({ run_id: 'ein-1' });
  await shot(page, ti, 'ein-open');
  expectNoConsoleErrors(rec);
});
