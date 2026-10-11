// R9 (עידן 11.10): (1) visit summary <-> EMS task: the prominent link block, the pre-save
// warning dialog, the status picker applied AFTER the save; (2) אביאם / ניתאי report only
// NON-field days, only for past days (today counts), from the attendance calendar.
// The decisions are goldens (visitEmsLink.test.ts, attendance.test.ts); this is the browser half.
import { boot, expect, expectNoConsoleErrors, shot, skipKnownMobile360, test } from './_helpers';
import type { Page } from '@playwright/test';

test.beforeEach(({}, testInfo) => skipKnownMobile360(testInfo));

async function recordSheet(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    if (w.__qaPosted) return;
    w.__qaPosted = [];
    const real = w.fetch.bind(w);
    w.fetch = function (url: any, opts: any) {
      try {
        if (typeof url === 'string' && url.indexOf('sigma:write-router') === 0 && opts && opts.body) w.__qaPosted.push(JSON.parse(opts.body));
      } catch { /* not ours */ }
      return real(url, opts);
    };
  });
}
const posted = (page: Page, type: string) => page.evaluate((t: string) =>
  (((window as any).__qaPosted || []) as any[]).filter(p => p && p.type === t), type);

const TASKS = [
  { id: 'T-77', title: 'בדיקת תקשורת', status: 'new' },
  { id: 'T-78', title: 'החלפת מונה ראשי', status: 'in_progress' },
];

/** Stub the EMS cache + the status writer; `fail` makes the writer throw. */
async function stubEms(page: Page, tasks: unknown[], fail = false) {
  await page.evaluate(([t, f]) => {
    const w = window as any;
    w.emsCacheTasksForKibbutz = (k: string) => (k === 'חוקוק' ? t : []);
    w.__emsStatusCalls = [];
    w.sigma.emsSetStatus = async (id: string, st: string) => {
      w.__emsStatusCalls.push([id, st]);
      if (f) throw new Error('503 gateway');
    };
  }, [tasks, fail] as const);
}

async function openVisit(page: Page) {
  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();
  await page.getByTestId('brief-visit').click();
  await expect(page.getByTestId('visit-chapters')).toBeVisible();
  await page.getByTestId('vc-summary').fill('הוחלף מונה ונבדקה תקשורת');
  await page.getByTestId('vc-hours-2').click();
  await page.getByTestId('vc-contact').fill('יוסי מהמחלבה');
}

test('visit: the EMS link block is first in the chapter and says what it is', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await stubEms(page, TASKS);
  await openVisit(page);
  const block = page.getByTestId('vc-tasks');
  await expect(page.getByTestId('vc-ems-link-title')).toHaveText(/שיוך למשימת EMS/);
  const above = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="vc-tasks"]')!.getBoundingClientRect().top;
    const b = document.querySelector('[data-testid="vc-hours-2"]')!.getBoundingClientRect().top;
    return a < b;
  });
  expect(above).toBe(true);
  await block.scrollIntoViewIfNeeded();
  await shot(page, ti, 'ems-link-block');
  expectNoConsoleErrors(rec);
});

test('visit: saving with no EMS task asks first; "שמור בלי שיוך" saves unlinked', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);
  await stubEms(page, TASKS);
  await openVisit(page);
  await page.getByTestId('vc-reason-planned').click();
  await page.getByTestId('vc-send').click();

  const dlg = page.getByTestId('vc-link-warning');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('לא שויכה משימת EMS לסיכום הביקור');
  await expect(page.getByTestId('vc-link-radio-T-77')).toBeVisible();
  await expect(page.getByTestId('vc-link-radio-T-78')).toBeVisible();
  await expect(page.getByTestId('vc-link-confirm')).toBeDisabled();
  expect(await posted(page, 'visit'), 'nothing is saved while the dialog is up').toHaveLength(0);
  await shot(page, ti, 'link-warning');

  await page.getByTestId('vc-link-skip').click();
  await expect(page.getByTestId('visit-chapters')).toBeHidden({ timeout: 15_000 });
  const v = await posted(page, 'visit');
  expect(v).toHaveLength(1);
  expect(v[0].emsTaskId || '').toBe('');
  expectNoConsoleErrors(rec);
});

test('visit: the dialog radio links the task; default status is "keep" so no EMS call', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);
  await stubEms(page, TASKS);
  await openVisit(page);
  await page.getByTestId('vc-reason-planned').click();
  await page.getByTestId('vc-send').click();
  await page.getByTestId('vc-link-radio-T-78').click();
  await page.getByTestId('vc-link-confirm').click();
  await expect(page.getByTestId('visit-chapters')).toBeHidden({ timeout: 15_000 });
  const v = await posted(page, 'visit');
  expect(v).toHaveLength(1);
  expect(v[0].emsTaskId).toBe('T-78');
  expect(await page.evaluate(() => (window as any).__emsStatusCalls)).toEqual([]);
  expectNoConsoleErrors(rec);
});

test('visit: picking "בוצעה" for the linked task updates its status once, after the save', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);
  await stubEms(page, TASKS);
  await openVisit(page);
  await page.getByTestId('vc-ems-T-77').click();
  const pick = page.getByTestId('vc-ems-status-T-77');
  await expect(pick).toHaveValue('keep');
  await expect(pick.locator('option[value="done"]')).toHaveCount(1);
  await pick.selectOption('done');
  await pick.scrollIntoViewIfNeeded();
  await shot(page, ti, 'status-picker');
  await page.getByTestId('vc-send').click();
  await expect(page.getByTestId('visit-chapters')).toBeHidden({ timeout: 15_000 });
  expect(await posted(page, 'visit')).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => (window as any).__emsStatusCalls)).toEqual([['T-77', 'done']]);
  expectNoConsoleErrors(rec);
});

test('visit: an EMS failure keeps the visit and says so', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);
  await stubEms(page, TASKS, true);
  await openVisit(page);
  await page.getByTestId('vc-ems-T-77').click();
  await page.getByTestId('vc-ems-status-T-77').selectOption('done');
  await page.getByTestId('vc-send').click();
  await expect(page.getByTestId('visit-chapters')).toBeHidden({ timeout: 15_000 });
  expect(await posted(page, 'visit')).toHaveLength(1);
  await expect(page.getByText(/עדכון סטטוס המשימה נכשל/).first()).toBeVisible();
});

test('visit: a kibbutz with no open EMS tasks saves with no dialog', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);
  await stubEms(page, []);
  await openVisit(page);
  await page.getByTestId('vc-reason-planned').click();
  await page.getByTestId('vc-send').click();
  await expect(page.getByTestId('vc-link-warning')).toHaveCount(0);
  await expect(page.getByTestId('visit-chapters')).toBeHidden({ timeout: 15_000 });
  expect(await posted(page, 'visit')).toHaveLength(1);
  expectNoConsoleErrors(rec);
});

// ───────────────────────── attendance ─────────────────────────

async function openAttendance(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    (window as any).sigma?.showPage?.('attendance');
    const el = document.getElementById('attendance-view');
    return !!el && el.style.display !== 'none';
  }), { timeout: 20_000 }).toBe(true);
  await page.waitForSelector('[data-testid="att-grid"]', { state: 'visible', timeout: 20_000 });
}
const editorOf = (page: Page) => page.locator('[data-testid="att-sheet"]:visible, [data-testid="att-panel"]:visible').first();

test('attendance: field staff have no manual daily report', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  await openAttendance(page);
  await expect(page.getByTestId('att-today')).toHaveCount(0);
  await expect(page.getByText('דיווח נוכחות ידני')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});

test('attendance: a past day takes a non-field type; יום שטח is not offered', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  const cell = page.locator('[data-date][data-state="missing"], [data-date][data-state="today"]').first();
  const date = await cell.getAttribute('data-date');
  await cell.click();
  const ed = editorOf(page);
  await expect(ed).toBeVisible();
  await expect(ed.locator('[data-daytype="field"]')).toHaveCount(0);
  for (const t of ['office', 'wfh', 'vacation', 'reserve', 'other']) await expect(ed.locator(`[data-daytype="${t}"]`).first()).toBeVisible();
  await expect(ed.getByTestId('att-nofield-note')).toBeVisible();
  await shot(page, ti, 'past-day');
  await ed.locator('[data-daytype="office"]').first().click();
  await ed.getByTestId('att-save').click();
  await expect(page.locator(`[data-date="${date}"]`)).toHaveAttribute('data-state', 'office', { timeout: 10_000 });
  expectNoConsoleErrors(rec);
});

test('attendance: a future day cannot be reported from here', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  const cell = page.locator('[data-date][data-state="future"]').first();
  test.skip(await cell.count() === 0, 'no future day left in this month');
  await cell.click();
  const ed = editorOf(page);
  await expect(ed.getByTestId('att-readonly')).toBeVisible();
  await expect(ed.locator('[data-daytype]')).toHaveCount(0);
  await shot(page, ti, 'future-day');
  expectNoConsoleErrors(rec);
});

test('attendance: עידן keeps every type, יום שטח included', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openAttendance(page);
  await page.locator('[data-date][data-state="missing"], [data-date][data-state="today"], [data-date][data-state="future"]').first().click();
  await expect(editorOf(page).locator('[data-daytype="field"]').first()).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('attendance: the viewer only reads', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await openAttendance(page);
  await page.locator('[data-date][data-state="missing"], [data-date][data-state="today"], [data-date][data-state="future"]').first().click();
  await expect(editorOf(page).getByTestId('att-readonly')).toBeVisible();
  await expect(editorOf(page).locator('[data-daytype]')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});
