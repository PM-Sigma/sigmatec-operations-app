// 📅 נוכחות + 🕎 חגים (spec §7e, Task 12).
//
// The rules themselves are goldens (app/src/lib/attendance.test.ts). What only a real browser
// can answer is here: the island takes the screen over from the legacy table, the month grid
// renders with the holiday cells the sandbox seeds, one tap files today, the day sheet opens
// on a chip and says a holiday is optional rather than missing, and a field worker sees his
// own month while whoever may look at everyone gets the person toggle.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, skipKnownMobile360, test } from './_helpers';
import type { Page } from '@playwright/test';

// mobile-360-known.json ratchet (Opus audit round 4 item 3) — see _helpers.ts.
test.beforeEach(({}, testInfo) => skipKnownMobile360(testInfo));

/**
 * Open the attendance page the way every nav entry does, and wait for the island.
 * `showPage` is RETRIED: the legacy bundle defines it a beat after the island chunk lands,
 * and a call that arrives first is silently dropped — the page then stays on the cards with
 * a perfectly rendered (but hidden) grid behind it.
 */
async function openAttendance(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    (window as any).sigma?.showPage?.('attendance');
    const el = document.getElementById('attendance-view');
    return !!el && el.style.display !== 'none';
  }), { timeout: 20_000 }).toBe(true);
  await page.waitForSelector('[data-testid="att-grid"]', { state: 'visible', timeout: 20_000 });
}

/** The sandbox anchors its fixture to the first <weekday> of the current month. */
async function firstDow(page: Page, dow: number): Promise<string> {
  return page.evaluate(n => {
    const d = new Date();
    const x = new Date(d.getFullYear(), d.getMonth(), 1);
    while (x.getDay() !== n) x.setDate(x.getDate() + 1);
    const p = (v: number) => String(v).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }, dow);
}

test('attendance: the island owns the screen and the legacy table steps aside', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  // The legacy summary/table are still in the DOM — 📄 PDF and 📗 Excel read what they leave
  // behind — but they are no longer what the person looks at.
  await expect(page.locator('#attendanceLegacy')).toBeHidden();
  await expect(page.locator('#attendanceTable')).toBeAttached();

  await expect(page.getByRole('heading', { name: /נוכחות/ })).toBeVisible();
  await expect(page.getByTestId('att-today')).toBeVisible();
  await expect(page.getByTestId('att-kpi-field')).toBeVisible();
  await expect(page.getByTestId('att-kpi-office')).toBeVisible();
  await expect(page.getByTestId('att-kpi-missing')).toBeVisible();
  await expect(page.getByTestId('att-missing')).toBeVisible();

  await expectRtl(page);
  await shot(page, ti, 'month');
  expectNoConsoleErrors(rec);
});

test('attendance: 🕎 holidays are violet, never missing', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  const holiday = await firstDow(page, 1);      // the sandbox's חג
  const closure = await firstDow(page, 4);      // …and its סגירת חברה

  await expect(page.locator(`[data-date="${holiday}"]`)).toHaveAttribute('data-state', 'holiday');
  await expect(page.locator(`[data-date="${closure}"]`)).toHaveAttribute('data-state', 'holiday');
  // …and neither of them is ever offered as a day to complete.
  await expect(page.locator(`[data-missing="${holiday}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-missing="${closure}"]`)).toHaveCount(0);

  // Opening one says it is optional — an invitation, not a reprimand.
  await page.locator(`[data-date="${holiday}"]`).click();
  await expect(page.getByTestId('att-holiday-note').first()).toContainText('הזנה אופציונלית');
  await shot(page, ti, 'holiday');
  expectNoConsoleErrors(rec);
});

test('attendance: the mock month is on the grid (a visit day and an office day)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  await expect(page.locator(`[data-date="${await firstDow(page, 0)}"]`)).toHaveAttribute('data-state', 'office');
  await expect(page.locator(`[data-date="${await firstDow(page, 2)}"]`)).toHaveAttribute('data-state', 'office');
  await expect(page.locator(`[data-date="${await firstDow(page, 3)}"]`)).toHaveAttribute('data-state', 'field');

  expectNoConsoleErrors(rec);
});

test('attendance: the month switcher moves, and the label follows', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  await openAttendance(page);

  const label = page.getByTestId('att-month');
  const before = await label.textContent();
  await page.getByRole('button', { name: 'חודש קודם' }).click();
  await expect(label).not.toHaveText(before || '');
  await page.getByRole('button', { name: 'חודש הבא' }).click();
  await expect(label).toHaveText(before || '');

  expectNoConsoleErrors(rec);
});

test('attendance: a day sheet opens from the grid with the day types one tap away', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  // A day with nothing on it — the first Wednesday holds the mock visit, so take the grid's
  // first cell that is still empty.
  const empty = page.locator('[data-date][data-state="missing"], [data-date][data-state="future"]').first();
  await empty.click();

  // Phone → the bottom sheet; wide → the side panel. Only one of the two is ever on screen
  // (the panel is `hidden lg:block`), so ask for whichever is visible rather than for the
  // first in DOM order.
  const editor = page.locator('[data-testid="att-sheet"]:visible, [data-testid="att-panel"]:visible').first();
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-daytype="field"]').first()).toBeVisible();
  await expect(editor.locator('[data-daytype="office"]').first()).toBeVisible();

  await shot(page, ti, 'day');
  expectNoConsoleErrors(rec);
});

test('attendance: whoever may look at everyone gets the person toggle', async ({ page }, ti) => {
  // The gate is `canSeeAttendance()` (js/src/11-search-login.js): the two field workers,
  // עמיחי and the viewer. The TOGGLE is the narrower `isIdan() || isViewer()` — this branch
  // keeps עידן out of the page entirely (Task 4), so the viewer is who exercises it.
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await openAttendance(page);
  await expect(page.locator('[data-person]').first()).toBeVisible();
  await expect(page.locator('[data-person="אביאם"]')).toBeVisible();
  await expect(page.locator('[data-person="ניתאי"]')).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('attendance: אביאם sees the month of ניתאי, and may only look at it', async ({ page }, ti) => {
  // Round 2 (F-6): אביאם asked to see ניתאי's month so he can tell him to fill it in. The
  // toggle is therefore his too — and the day panel on ניתאי's month says צפייה בלבד.
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  await expect(page.locator('[data-person="ניתאי"]')).toBeVisible();
  await page.locator('[data-person="ניתאי"]').click();
  await expect(page.getByRole('heading', { name: /נוכחות/ })).toContainText('ניתאי');

  const empty = page.locator('[data-date][data-state="missing"], [data-date][data-state="future"]').first();
  await empty.click();
  const editor = page.locator('[data-testid="att-sheet"]:visible, [data-testid="att-panel"]:visible').first();
  await expect(editor.getByTestId('att-readonly')).toBeVisible();
  await expect(editor.locator('[data-daytype="office"]')).toHaveCount(0);

  await shot(page, ti, 'read-only');
  expectNoConsoleErrors(rec);
});

// ── round 2 · F-1 + F-3: the gaps are obviously tappable, the reports are labelled ──────

test('attendance: a missing day is a real tap target, and the reports carry a label', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  const pdf = page.getByTestId('att-pdf');
  const excel = page.getByTestId('att-excel');
  // A-U1: the report buttons are IconBubbles (icon + Hebrew aria-label, no visible text).
  await expect(pdf.getByRole('button')).toHaveAttribute('aria-label', 'הורדת דוח נוכחות PDF');
  await expect(excel.getByRole('button')).toHaveAttribute('aria-label', 'הורדת דוח נוכחות Excel');
  await expect(pdf.locator('svg')).toBeVisible();
  await expect(excel.locator('svg')).toBeVisible();

  // A-U2: a missing day is now a design-system ListRow (min-h-14), with a trailing chevron
  // rather than a bare "＋" glyph.
  const row = page.getByTestId('att-missing').locator('[data-missing]').first();
  if (await row.count()) {
    const box = await row.boundingBox();
    expect(box!.height, 'a missing-day row must be a thumb-sized tap target').toBeGreaterThanOrEqual(36);
    await expect(row.locator('svg')).toBeVisible();
  }

  expectNoConsoleErrors(rec);
});

// ── round 2 · F-5: ערב חג — required, and מהבית unless the person says otherwise ────────

test('attendance: an ערב חג offers מהבית on a countdown that can be stopped', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  // A weekday in the SECOND week — the fixture's holiday, closure, visit and two manual days
  // all sit in the first one. Pushed onto the same list the production fetch fills.
  const eve = await page.evaluate(() => {
    const d = new Date();
    const x = new Date(d.getFullYear(), d.getMonth(), 1);
    while (x.getDay() !== 2) x.setDate(x.getDate() + 1);
    x.setDate(x.getDate() + 7);
    const p = (v: number) => String(v).padStart(2, '0');
    const key = x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
    const w = window as any;
    w.SHEET_DATA.holidays = (w.SHEET_DATA.holidays || [])
      .filter((h: any) => h.date !== key)
      .concat([{ date: key, name: 'ערב חג לדוגמה', kind: 'holiday_eve', required: true }]);
    w.sigmaEmit?.('holidays-loaded', { count: w.SHEET_DATA.holidays.length });
    return key;
  });

  // Stretch the countdown for the harness: under four parallel workers the 4 s were over before
  // the ביטול tap landed on the desktop project. The rule itself stays 4 s in production.
  await page.evaluate(() => { (window as any).__sigmaEveCountdownMs = 60_000; });
  const cell = page.locator(`[data-date="${eve}"]`);
  await expect(cell).toHaveAttribute('data-eve', '1');
  // it is a WORK day — never violet-muted like a חג, and never skipped by the gaps
  await expect(cell).not.toHaveAttribute('data-state', 'holiday');

  await cell.click();
  const editor = page.locator('[data-testid="att-sheet"]:visible, [data-testid="att-panel"]:visible').first();
  const countdown = editor.getByTestId('att-eve-countdown');
  await expect(countdown).toBeVisible();
  await expect(countdown).toContainText('מהבית');

  await editor.getByTestId('att-eve-cancel').click();
  await expect(countdown).toHaveCount(0);
  // …and the person picks whatever he likes instead
  await expect(editor.locator('[data-daytype="office"]').first()).toBeVisible();

  await shot(page, ti, 'eve');
  expectNoConsoleErrors(rec);
});

// ── עידן 20.9 #2 — "what is missing" is the first thing on the screen ───────────────────
//
// The gaps used to sit in a box UNDER the calendar: the screen opened on a month grid and
// answered the one question a person actually arrives with ("what do I still owe?") last.
// The strip is now above everything, carries the count, and every chip is one tap into that
// day's sheet. For whoever may look at the whole team, the same question is answered for
// everyone in a second strip right after it.

test('attendance: חסר לך comes before the calendar, and a chip opens the day', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  const strip = page.getByTestId('att-missing');
  const grid = page.getByTestId('att-grid');
  await expect(strip).toBeVisible();

  // ── ORDER is the requirement, so it is asserted as order, not as "both exist".
  const before = await strip.evaluate(
    (el, g) => !!(el.compareDocumentPosition(g as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    await grid.elementHandle(),
  );
  expect(before, 'the חסר לך strip must render BEFORE the month grid').toBe(true);

  // ── the count, and a chip that opens that day's sheet
  const chips = strip.locator('[data-missing]');
  const n = await chips.count();
  if (n > 0) {
    await expect(strip).toContainText('חסר לך');
    await expect(page.getByTestId('att-missing-count')).toHaveText(String(n));
    const date = await chips.first().getAttribute('data-missing');
    await chips.first().click();
    // The phone opens a sheet; the desktop moves its side panel. Both land on that date.
    await expect(page.locator('[data-date="' + date + '"], [data-testid="att-panel"]').first()).toBeVisible();
  } else {
    // A fully-filed month is a legitimate state — it must say so, not show an empty box.
    await expect(strip).toContainText('החודש מלא');
  }

  await shot(page, ti, 'missing-first');
  expectNoConsoleErrors(rec);
});

test('attendance: עידן gets the whole team\'s gaps, and a tap switches to that person', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openAttendance(page);

  const team = page.getByTestId('att-missing-team');
  await expect(team).toBeVisible();
  await expect(team).toContainText('חסר לצוות');

  const people = team.locator('[data-person-missing]');
  await expect(people.first()).toBeVisible();

  // worst first — the strip exists to say who needs chasing
  const counts = await people.evaluateAll(els =>
    els.map(e => e.getAttribute('data-count')).filter(v => v !== '' && v !== null).map(Number));
  expect(counts, 'no per-person counts rendered').not.toHaveLength(0);
  expect([...counts].sort((a, b) => b - a), 'the team strip is not sorted worst-first').toEqual(counts);

  // a tap moves the whole screen onto that person
  const who = await people.nth(1).getAttribute('data-person-missing');
  await people.nth(1).click();
  await expect(page.getByRole('heading', { name: /נוכחות/ })).toContainText(who!);
  await expect(team.locator('[data-person-missing="' + who + '"]')).toHaveAttribute('aria-pressed', 'true');

  await shot(page, ti, 'missing-team');
  expectNoConsoleErrors(rec);
});

test('attendance r5 · A-L5: a saved visit shows as an automatic field day from the row V wrote', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  const visitDay = await page.evaluate(() => String(((window as any).SHEET_DATA.visits || []).find((v: any) => v.visitor === 'אביאם').date).slice(0, 10));
  const row = await page.evaluate(d => ((window as any).SHEET_DATA.attendance || []).find((a: any) => a.person === 'אביאם' && String(a.date).slice(0, 10) === d), visitDay);
  expect(row && row.source).toBe('visit_auto');
  // A-U3: the cell carries data-att-state (monthGrid's semantic state) alongside data-state.
  await expect(page.locator(`[data-date="${visitDay}"]`)).toHaveAttribute('data-att-state', 'field');
  await expect(page.locator(`[data-date="${visitDay}"]`)).toHaveAttribute('data-state', 'field');

  expectNoConsoleErrors(rec);
});
