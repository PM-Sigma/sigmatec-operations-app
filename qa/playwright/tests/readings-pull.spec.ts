// 📥 משיכת קריאות מתוכנות חיצונית (readings-pull) — the page, the background flow and the gate.
// Everything is mocked: the four reading_* tables and the `readings-fetch` Edge Function are
// answered by this file (real-size shape: 253 meters = 249 ok + 3 blocked + 1 warning, four
// exceptions). Every serial below is SYNTHETIC — no real customer data.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';
import { addDays, yesterdayIL } from '../../../app/src/lib/readingsLogic';

const SITE = { id: 'site-1', kibbutz: 'חולדה', ems_site_id: null, active: true };
const SOURCES = [{ id: 'src-speednet', name: 'SpeedNet' }, { id: 'src-ds', name: 'DataSense' }];
const FILES = 'https://readings-files.test';

type Row = Record<string, any>;
const day = (n: number) => addDays(yesterdayIL(), -n);
const at = (date: string, hhmm = '04:02') => `${addDays(date, 1)}T${hhmm}:00Z`;   // 07:02 Israel on the next day

const EXCEPTIONS = [
  ['SpeedNet', '9000101', '9000101', '28.09 23:00', 1234.5, 'חסימה', 'אין סה״כ'],
  ['SpeedNet', '9000102', '9000102', '28.09 23:00', 88, 'חסימה', 'אין סה״כ'],
  ['DataSense', '9000203', '9000203', '', '', 'חסימה', 'המונה לא הגיע היום'],
  ['DataSense', '9000304', '9000304', '27.09 23:00', 5, 'אזהרה', 'קריאה ישנה'],
];
const SUMMARY = [['חסימה', 'אין סה״כ', 2], ['חסימה', 'המונה לא הגיע היום', 1], ['אזהרה', 'קריאה ישנה', 1]];

const base = (o: Row): Row => ({
  site_id: 'site-1', trigger: 'cron', started_by: null, finished_at: null, status: 'ok', attempt: 1,
  progress: { SpeedNet: { state: 'ok', count: 197 }, DataSense: { state: 'ok', count: 56 } },
  n_ok: 249, n_blocked: 3, n_warn: 1, summary: SUMMARY, exceptions: EXCEPTIONS, error: null,
  readings_file: 'runs/x/readings.xlsx', exceptions_file: 'runs/x/exceptions.xlsx',
  ems_checked: false, ems_checked_by: null, ems_checked_at: null,
  uploaded: false, uploaded_by: null, uploaded_at: null, uploaded_source: null, seen_by: ['עידן', 'עמיחי', 'מתניה'], ...o,
});

/** ~a month of history: uploaded days, a failed day, a partial manual day, and gaps between. */
function history(): Row[] {
  return [
    base({ id: 'run-latest', reading_date: day(0), started_at: at(day(0)) }),
    base({ id: 'run-1', reading_date: day(1), started_at: at(day(1)), ems_checked: true, ems_checked_by: 'עידן', ems_checked_at: at(day(1), '05:10'), uploaded: true, uploaded_by: 'עידן', uploaded_at: at(day(1), '05:30'), uploaded_source: 'manual' }),
    base({ id: 'run-fail', reading_date: day(2), started_at: at(day(2)), status: 'failed', error: 'SpeedNet חסם את הבקשה. נסה שוב בעוד כמה דקות', readings_file: null, exceptions_file: null, n_ok: null, n_blocked: null, n_warn: null, summary: null, exceptions: null }),
    // day(3): no run at all → "לא נמשך"
    base({ id: 'run-manual', reading_date: day(4), started_at: at(day(4), '09:15'), trigger: 'manual', started_by: 'מתניה', ems_checked: true, uploaded: true, uploaded_by: 'מתניה', uploaded_at: at(day(4), '10:00'), uploaded_source: 'auto' }),
    ...[6, 7, 8, 10, 11, 13, 14, 15, 17, 20].map(n => base({ id: 'run-h' + n, reading_date: day(n), started_at: at(day(n)), ems_checked: true, uploaded: true, uploaded_by: 'עמיחי', uploaded_at: at(day(n), '06:00'), uploaded_source: 'manual' })),
  ];
}

interface Mock { runs: Row[]; calls: Row[]; }

async function installReadings(page: any, S: Mock) {
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const one = (rows: Row[], accept?: string) => (accept && accept.includes('pgrst.object') ? (rows[0] ?? null) : rows);
  await page.route(SB_ORIGIN + '/rest/v1/reading_sites*', (r: any) => r.fulfill(json(one([SITE], r.request().headers()['accept']))));
  await page.route(SB_ORIGIN + '/rest/v1/reading_sources*', (r: any) => r.fulfill(json(SOURCES)));
  await page.route(SB_ORIGIN + '/rest/v1/reading_runs*', (r: any) => {
    const q = new URL(r.request().url()).searchParams;
    let rows = S.runs.slice();
    const id = (q.get('id') || '').replace(/^eq\./, '');
    if (id) rows = rows.filter(x => x.id === id);
    if ((q.get('trigger') || '') === 'eq.cron') rows = rows.filter(x => x.trigger === 'cron');
    const gte = (q.get('reading_date') || '').replace(/^gte\./, '');
    if (gte && q.get('reading_date')!.startsWith('gte.')) rows = rows.filter(x => x.reading_date >= gte);
    rows.sort((a, b) => (a.reading_date < b.reading_date ? 1 : a.reading_date > b.reading_date ? -1 : (a.started_at < b.started_at ? 1 : -1)));
    r.fulfill(json(one(rows, r.request().headers()['accept'])));
  });
  await page.route(FILES + '/**', (r: any) => r.fulfill({
    status: 200, body: 'PK-synthetic',
    headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="readings.xlsx"' },
  }));
  await page.route(SB_ORIGIN + '/functions/v1/readings-fetch', (r: any) => {
    const b = JSON.parse(r.request().postData() || '{}');
    S.calls.push(b);
    const run = S.runs.find(x => x.id === b.run_id);
    switch (b.mode) {
      case 'run':
        S.runs.push(base({
          id: 'run-new', reading_date: b.date, trigger: 'manual', started_by: 'עידן', status: 'running',
          started_at: new Date().toISOString(), n_ok: null, n_blocked: null, n_warn: null, summary: null, exceptions: null,
          readings_file: null, exceptions_file: null, seen_by: [],
          progress: { SpeedNet: { state: 'ok', count: 197 }, DataSense: { state: 'running' } },
        }));
        return r.fulfill(json({ run_id: 'run-new' }));
      case 'emsCheck':
        if (run) Object.assign(run, { ems_checked: true, ems_checked_by: 'עידן', ems_checked_at: new Date().toISOString() });
        return r.fulfill(json({ ok: true }));
      case 'sign': return r.fulfill(json({ url: `${FILES}/${b.kind}.xlsx` }));
      case 'markUploaded':
        if (run) Object.assign(run, { uploaded: b.uploaded, uploaded_by: b.uploaded ? 'עידן' : null, uploaded_at: b.uploaded ? new Date().toISOString() : null, uploaded_source: b.uploaded ? 'manual' : null });
        return r.fulfill(json({ ok: true }));
      case 'seen':
        if (run) run.seen_by = [...(run.seen_by || []), 'עידן'];
        return r.fulfill(json({ ok: true }));
      case 'retrySource':
        if (run) Object.assign(run, { status: 'running', progress: { SpeedNet: { state: 'running' }, DataSense: { state: 'ok', count: 56 } } });
        return r.fulfill(json({ ok: true }));
      default: return r.fulfill(json({ ok: true }));
    }
  });
}

const withToken = (page: any) => page.evaluate(() => { (window as any).sigma.emsToken = () => 'synthetic-ems-token'; });
const openPage = async (page: any) => {
  await page.evaluate(() => (window as any).showPage('readings'));
  await page.mouse.click(1, 1);          // the shell re-reads the page on a click (a real tap does this)
  await expect(page.getByTestId('readings-page')).toBeVisible({ timeout: 20_000 });
};
const noHScroll = async (page: any) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'horizontal overflow (px)').toBeLessThanOrEqual(0);
};

test('page: last run, reasons come BEFORE the downloads, history shows gaps and non-uploaded days', async ({ page }, ti) => {
  const S: Mock = { runs: history(), calls: [] };
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await installReadings(page, S);
  await openPage(page);

  const latest = page.getByTestId('readings-latest');
  await expect(latest.getByText('לא נבדק מול EMS')).toBeVisible();
  await expect(latest.getByText('אוטומטית').first()).toBeVisible();
  await expect(latest.getByText('249')).toBeVisible();
  await expect(latest.getByTestId('readings-ems-check')).toBeVisible();

  // reasons first, then the downloads (DOM order and on screen)
  const reasons = latest.getByTestId('readings-reason');
  await expect(reasons).toHaveCount(3);
  const yReason = (await reasons.first().boundingBox())!.y;
  const yDownload = (await latest.getByTestId('readings-download-readings').boundingBox())!.y;
  expect(yReason).toBeLessThan(yDownload);

  // 35 days, one row each; a day nobody pulled says so
  const rows = page.getByTestId('readings-history-row');
  await expect(rows).toHaveCount(35);
  await expect(page.getByTestId('readings-history').getByText('לא נמשך').first()).toBeVisible();
  await expect(page.getByText('SpeedNet חסם את הבקשה. נסה שוב בעוד כמה דקות')).toBeVisible();
  await expect(page.locator('[data-needs-upload]').first()).toBeVisible();     // day(0) pulled, not uploaded
  await expect(page.locator('[data-gap]').first().getByRole('button', { name: 'משוך' })).toBeVisible();

  await noHScroll(page);
  await expectRtl(page);
  await shot(page, ti, 'page-top');
  await page.getByTestId('readings-history').scrollIntoViewIfNeeded();
  await shot(page, ti, 'page-history', { fullPage: true });
  expectNoConsoleErrors(rec);
});

test('a reason opens the list of its meters; the reason summary is shown before any download', async ({ page }, ti) => {
  const S: Mock = { runs: history(), calls: [] };
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await installReadings(page, S);
  await openPage(page);
  await page.getByTestId('readings-reason').first().click();
  const list = page.getByTestId('readings-reason-meters');
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list.getByText('9000101')).toBeVisible();
  await shot(page, ti, 'reason-meters');
  expectNoConsoleErrors(rec);
});

test('EMS check: the prominent button sends the EMS token, then the tag flips to ✓ EMS', async ({ page }, ti) => {
  const S: Mock = { runs: history(), calls: [] };
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await installReadings(page, S);
  await withToken(page);
  await openPage(page);
  await shot(page, ti, 'ems-unchecked');
  await page.getByTestId('readings-ems-check').click();
  await expect(page.getByTestId('readings-latest').getByText('✓ EMS')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('readings-ems-check')).toHaveCount(0);
  const call = S.calls.find(c => c.mode === 'emsCheck')!;
  expect(call.run_id).toBe('run-latest');
  expect(call.ems_token).toBe('synthetic-ems-token');
  await shot(page, ti, 'ems-checked');
  expectNoConsoleErrors(rec);
});

test('downloads: sign, then a plain <a download> click yields a file; the "הועלה" mark round-trips', async ({ page }, ti) => {
  const S: Mock = { runs: history(), calls: [] };
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await installReadings(page, S);
  await openPage(page);
  const [dlEvent] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.getByTestId('readings-download-readings').click(),
  ]);
  expect(dlEvent.suggestedFilename()).toBe('readings.xlsx');
  expect(S.calls.find(c => c.mode === 'sign')).toMatchObject({ run_id: 'run-latest', kind: 'readings' });

  const box = page.getByTestId('readings-uploaded');
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(page.getByTestId('readings-latest').getByText(/עידן · /)).toBeVisible({ timeout: 15_000 });
  expect(S.calls.find(c => c.mode === 'markUploaded')).toMatchObject({ run_id: 'run-latest', uploaded: true });
  await shot(page, ti, 'uploaded');
  expectNoConsoleErrors(rec);
});

test('partial run: red strip names the failed source and retries only that source', async ({ page }, ti) => {
  const runs = history();
  runs[0] = base({
    id: 'run-latest', reading_date: day(0), started_at: at(day(0)), status: 'partial', n_ok: 52, n_blocked: 0, n_warn: 0,
    summary: [], exceptions: [],
    progress: { SpeedNet: { state: 'failed', error: { code: 'blocked', message: 'האתר חסם את הבקשה' } }, DataSense: { state: 'ok', count: 56 } },
  });
  const S: Mock = { runs, calls: [] };
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await installReadings(page, S);
  await openPage(page);
  const strip = page.getByTestId('readings-partial');
  await expect(strip).toContainText('SpeedNet');
  await expect(strip).toContainText('האתר חסם את הבקשה');
  await shot(page, ti, 'partial');
  await strip.getByRole('button', { name: 'נסה שוב רק את המקור הזה' }).click();
  await expect.poll(() => S.calls.find(c => c.mode === 'retrySource')).toMatchObject({ run_id: 'run-latest', source_id: 'src-speednet' });
  expectNoConsoleErrors(rec);
});

test('a gap day: "לא נמשך" + [משוך] starts a run for exactly that date', async ({ page }, ti) => {
  const S: Mock = { runs: history(), calls: [] };
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await installReadings(page, S);
  await openPage(page);
  const gap = page.locator('[data-gap]').first();
  await gap.getByRole('button', { name: 'משוך' }).click();
  await expect.poll(() => S.calls.find(c => c.mode === 'run')).toMatchObject({ kibbutz: 'חולדה', date: day(3), trigger: 'manual' });
  expectNoConsoleErrors(rec);
});

test('manual run: date defaults to yesterday (max = yesterday, no min); run → progress; leave the page → chip; done → toast with the way back', async ({ page }, ti) => {
  test.setTimeout(90_000);
  const S: Mock = { runs: history().slice(1), calls: [] };          // nothing pulled for yesterday yet
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await installReadings(page, S);
  await withToken(page);
  await openPage(page);

  const date = page.getByTestId('readings-date');
  await expect(date).toHaveValue(yesterdayIL());
  await expect(date).toHaveAttribute('max', yesterdayIL());
  await expect(date).not.toHaveAttribute('min', /.+/);

  await page.getByTestId('readings-run').click();
  const prog = page.getByTestId('readings-progress');
  await expect(prog).toContainText('✓ SpeedNet 197');
  await expect(prog).toContainText('⏳ DataSense…');
  await expect(prog).toContainText('אפשר לעבור למסכים אחרים — נודיע לך כשהקבצים מוכנים.');
  await shot(page, ti, 'manual-progress');
  expect(S.calls.find(c => c.mode === 'run')).toMatchObject({ date: yesterdayIL(), trigger: 'manual' });

  // walk away: the watcher's chip follows to every screen
  await page.evaluate(() => (window as any).showPage('kibbutz'));
  const chip = page.getByTestId('readings-chip');
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip).toContainText('משיכת חולדה');
  await shot(page, ti, 'chip-on-other-screen');

  // the server finishes: the watcher (≤ 5 s) does the EMS check by itself and toasts
  const run = S.runs.find(r => r.id === 'run-new')!;
  Object.assign(run, base({ id: 'run-new', reading_date: yesterdayIL(), trigger: 'manual', started_by: 'עידן', started_at: run.started_at, status: 'ok', seen_by: [] }));
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'הקבצים של חולדה מוכנים' });
  await expect(toast).toBeVisible({ timeout: 30_000 });
  expect(S.calls.some(c => c.mode === 'emsCheck' && c.run_id === 'run-new' && c.ems_token === 'synthetic-ems-token')).toBe(true);
  await expect(chip).toHaveCount(0);
  await shot(page, ti, 'toast-done');

  await toast.getByRole('button', { name: 'לקבצים ←' }).click();
  await expect(page.getByTestId('readings-page')).toBeVisible();
  await expect(page.getByText('ריצה שנבחרה')).toBeVisible();
  await expect(page.getByTestId('readings-latest').getByText('ידנית').first()).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('a failed run toasts red with the reason', async ({ page }, ti) => {
  test.setTimeout(60_000);
  const S: Mock = { runs: history().slice(1), calls: [] };
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await installReadings(page, S);
  await openPage(page);
  await page.getByTestId('readings-run').click();
  await expect(page.getByTestId('readings-progress')).toBeVisible();
  await page.evaluate(() => (window as any).showPage('kibbutz'));
  const run = S.runs.find(r => r.id === 'run-new')!;
  Object.assign(run, { status: 'failed', error: 'שם המשתמש או הסיסמה של DataSense שגויים', progress: { SpeedNet: { state: 'ok', count: 197 }, DataSense: { state: 'failed', error: { code: 'auth', message: 'התחברות נכשלה' } } } });
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'משיכת חולדה נכשלה' });
  await expect(toast).toBeVisible({ timeout: 30_000 });
  await expect(toast).toContainText('שם המשתמש או הסיסמה של DataSense שגויים');
  await shot(page, ti, 'toast-failed');
  expectNoConsoleErrors(rec);
});

test('badge: an unopened failed cron run marks ⋯ עוד; opening the page marks it seen', async ({ page }, ti) => {
  const runs = history();
  runs[0] = base({ id: 'run-latest', reading_date: day(0), started_at: at(day(0)), status: 'failed', error: 'SpeedNet חסם את הבקשה', seen_by: ['עמיחי'], readings_file: null, exceptions_file: null });
  const S: Mock = { runs, calls: [] };
  const { rec } = await boot(page, ti, { who: 'עידן', ready: '#sigma-nav' });
  await installReadings(page, S);
  // the watcher asks after the first paint; ask again now that the mocks are in place
  await page.evaluate(() => window.dispatchEvent(new Event('readings-badge-refresh')));
  await expect.poll(() => page.evaluate(() => (window as any).__readingsBadge | 0), { timeout: 20_000 }).toBe(1);
  await page.getByRole('button', { name: 'עוד' }).last().click();
  const row = page.getByRole('button', { name: /משיכת קריאות מתוכנות חיצונית/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('1');
  await shot(page, ti, 'badge-more-sheet');
  await row.click();
  await expect(page.getByTestId('readings-page')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => S.calls.find(c => c.mode === 'seen')).toMatchObject({ run_id: 'run-latest' });
  await expect.poll(() => page.evaluate(() => (window as any).__readingsBadge | 0), { timeout: 20_000 }).toBe(0);
  expectNoConsoleErrors(rec);
});

test('access: אביאם is refused — no ⋯ row, and the page bounces to the cards', async ({ page }, ti) => {
  const S: Mock = { runs: history(), calls: [] };
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await installReadings(page, S);
  expect(await page.evaluate(() => (window as any).sigma.canShowPage('readings'))).toBe(false);
  await page.evaluate(() => (window as any).showPage('readings'));
  await expect(page.getByTestId('readings-page')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any)._currentPage)).toBe('kibbutz');
  await page.getByRole('button', { name: 'עוד' }).last().click();
  await expect(page.getByRole('button', { name: /משיכת קריאות מתוכנות חיצונית/ })).toHaveCount(0);
  expect(S.calls).toEqual([]);
  expectNoConsoleErrors(rec);
});
