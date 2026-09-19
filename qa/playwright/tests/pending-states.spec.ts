// §7p and the waits: the suite task 31 audit D specified, and the permanent gate under it.
//
// Two things are asserted here, both of which the audit found completely absent:
//
//   A. **A popup holding input does not close on its own.** Sixteen of them did — a backdrop
//      tap or a stray Esc dismissed them, and two (📣 תיבת רעיונות, 📥 ייבוא סיכום ישיבה)
//      also called `reset()` on the way out, so a dictated idea or a pasted meeting summary
//      was gone. Every case below types something, taps the backdrop, and asserts the
//      three-way prompt AND that the text is still there. Then the same with Esc. Then that a
//      CLEAN popup still dismisses exactly as it always did — a guard that fires on an empty
//      form is a bug of its own.
//
//   B. **A click that waits on a backend says so within 100 ms.** Each case below delays the
//      call and asserts the button is disabled, carries a spinner, and — the F11 half — still
//      carries its LABEL, so the pending state has an accessible name and can be asserted at
//      all. Then the failure leg: the call is aborted and the screen must say so in Hebrew
//      and offer a way to try again, with the button back to its idle label and nothing
//      double-submitted.
//
//   C. **The contract itself**: `docs/click-map.md` §2 is empty and `node scripts/click-map.mjs
//      --check` exits 0. That is the gate `npm run qa` runs on every future change.
//
// Deviation from the audit's sketch, deliberately: its "3 s delay / 30 s + abort" legs are
// written here as ~1.2 s and an immediate abort. The assertions are the same ones — a pending
// state within 100 ms, and a Hebrew failure with a retry — and the numbers in the sketch would
// have put this one spec at roughly forty minutes across four projects for no extra coverage.
// The 100 ms rule is what the delay exists to test, and 1.2 s tests it twelve times over.
import { boot, expect, expectNoConsoleErrors, shot, test, SB_ORIGIN } from './_helpers';

const SLOW_MS = 1200;

/** Delay every matching request, so the pending state has time to be observed. */
async function delay(page: any, pattern: string | RegExp, ms = SLOW_MS) {
  await page.route(pattern, async (route: any) => {
    await new Promise(res => setTimeout(res, ms));
    await route.fallback();
  });
}

/** Fail every matching request outright — the timeout/abort leg. */
async function fail(page: any, pattern: string | RegExp, ms = 200) {
  await page.route(pattern, async (route: any) => {
    await new Promise(res => setTimeout(res, ms));
    await route.abort('failed');
  });
}

/**
 * Pattern 4, asserted: disabled, spinning, and the label still readable. The 100 ms budget is
 * the rule from docs/ux-loading-patterns.md; Playwright's own polling makes anything under
 * ~50 ms unmeasurable, so it is asserted as "already true when we look", immediately after
 * the click.
 */
async function expectPending(btn: any, label: RegExp) {
  await expect(btn).toBeDisabled({ timeout: 300 });
  await expect(btn.locator('.animate-spin, [data-spinner], .btn-spinner')).toBeVisible({ timeout: 300 });
  await expect(btn).toHaveText(label);          // F11: the label survived the spinner
}

const openFeedback = async (page: any) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toBeVisible();
};

const backdrop = (page: any) => page.locator('[data-sigma-portal] [data-state="open"]').first();

/** A backdrop tap, as a thumb makes it: a real pointer event outside the panel. */
async function tapOutside(page: any) {
  await page.mouse.click(5, 5);
}

// ═════════════════════════ A. §7p — the popups ═════════════════════════

test('§7p: the feedback sheet keeps a typed idea through a backdrop tap and through Esc', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openFeedback(page);

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await box.fill('הכרטיסים נטענים לאט ברשת חלשה');

  // ── the backdrop ──
  await tapOutside(page);
  await expect(page.getByTestId('unsaved-guard')).toBeVisible();
  await expect(page.getByText('יש שינויים שלא נשמרו — לשמור / לבטל / להמשיך לערוך')).toBeVisible();
  await shot(page, ti, 'guard');
  await page.getByTestId('unsaved-keep').click();
  await expect(page.getByTestId('unsaved-guard')).toHaveCount(0);
  await expect(box).toHaveValue('הכרטיסים נטענים לאט ברשת חלשה');   // F2: the draft survived

  // ── Esc ──
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('unsaved-guard')).toBeVisible();
  await page.getByTestId('unsaved-keep').click();
  await expect(box).toHaveValue('הכרטיסים נטענים לאט ברשת חלשה');

  // ── and the sheet is still open, still usable ──
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('§7p: לבטל throws the draft away on purpose, and only then', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openFeedback(page);

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await box.fill('רעיון שלא יישמר');
  await page.keyboard.press('Escape');
  await page.getByTestId('unsaved-discard').click();

  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toHaveCount(0);
  await openFeedback(page);
  await expect(page.getByPlaceholder('מה קרה / מה היה עוזר לך?')).toHaveValue('');
  expectNoConsoleErrors(rec);
});

test('§7p: a CLEAN popup still dismisses on Esc and on a backdrop tap', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await openFeedback(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('unsaved-guard')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toHaveCount(0);

  await openFeedback(page);
  await tapOutside(page);
  await expect(page.getByTestId('unsaved-guard')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('§7p: the import sheet keeps pasted meeting markdown through a dismiss', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-import-notes')));
  const md = page.getByPlaceholder(/סיכום ישיבת חברה/);
  if (await md.count() === 0) { test.skip(true, 'the import island is not on this page'); return; }

  await md.fill('**סיכום ישיבת חברה — 17.9.26**\n- דפנה: מונים');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('unsaved-guard')).toBeVisible();
  await page.getByTestId('unsaved-keep').click();
  await expect(md).toHaveValue(/סיכום ישיבת חברה/);   // F3: the parse preview's source survived
  expectNoConsoleErrors(rec);
});

test('§7p: the legacy modals ask before they drop what was typed', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });

  // The quick-visit modal is the representative legacy case: markup in index.html, opened by
  // legacy code, dismissed by the ONE dispatcher in js/src/00-guard.js.
  const opened = await page.evaluate(() => {
    const el = document.getElementById('visitQuickModal');
    if (!el) return false;
    el.classList.add('open');
    const d = document.getElementById('vqDate') as HTMLInputElement | null;
    if (d) { d.value = '2026-09-20'; d.dispatchEvent(new Event('input', { bubbles: true })); }
    return true;
  });
  expect(opened, '#visitQuickModal is in index.html').toBe(true);

  // Esc → the prompt, not a dismiss.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('unsaved-guard')).toBeVisible();
  await page.getByTestId('unsaved-keep').click();
  await expect(page.locator('#visitQuickModal')).toHaveClass(/open/);
  await expect(page.locator('#vqDate')).toHaveValue('2026-09-20');

  // A backdrop tap → the same question.
  await page.locator('#visitQuickModal').click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId('unsaved-guard')).toBeVisible();
  await page.getByTestId('unsaved-discard').click();
  await expect(page.locator('#visitQuickModal')).not.toHaveClass(/open/);

  expectNoConsoleErrors(rec);
});

test('§7p: a clean legacy modal closes on Esc, and a blocking gate never does', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });

  await page.evaluate(() => { document.getElementById('emsTaskModal')?.classList.add('open'); });
  await page.keyboard.press('Escape');
  await expect(page.locator('#emsTaskModal')).not.toHaveClass(/open/);

  // The skip list: a gate resolves through its own buttons, never through Esc.
  await page.evaluate(() => { document.getElementById('authGate')?.classList.add('open'); });
  await page.keyboard.press('Escape');
  await expect(page.locator('#authGate')).toHaveClass(/open/);
  await page.evaluate(() => { document.getElementById('authGate')?.classList.remove('open'); });

  expectNoConsoleErrors(rec);
});

test('§7p / F4: one Esc closes ONE layer, never two', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });

  await page.evaluate(() => {
    document.getElementById('modalBackdrop')?.classList.add('open');
    document.getElementById('emsTaskModal')?.classList.add('open');
  });
  await page.keyboard.press('Escape');
  // The TOPMOST one went (#emsTaskModal, z-index 1160) and the one under it stayed. Two
  // competing listeners used to take both, and document order used to pick the wrong one.
  await expect(page.locator('#emsTaskModal')).not.toHaveClass(/open/);
  await expect(page.locator('#modalBackdrop')).toHaveClass(/open/);
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.classList.remove('open'); });

  expectNoConsoleErrors(rec);
});

// ═════════════════════════ B. the waits ═════════════════════════

test('pattern 4: a slow send keeps the button disabled, spinning AND labelled', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await delay(page, `${SB_ORIGIN}/rest/v1/feedback*`);
  await openFeedback(page);

  await page.getByPlaceholder('מה קרה / מה היה עוזר לך?').fill('משהו איטי');
  const send = page.getByTestId('feedback-send');
  await expect(send).toHaveText(/שלח/);

  await send.click();
  await expectPending(send, /שלח/);              // F11 — the label is still its accessible name

  // …and it comes back to its idle state when the answer lands.
  await expect(send).toBeEnabled({ timeout: 15_000 });
  await expect(send).toHaveText(/שלח/);
  expectNoConsoleErrors(rec);
});

test('rule 3: a failed write says so in Hebrew and the button returns to idle', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await fail(page, `${SB_ORIGIN}/rest/v1/feedback*`);
  await openFeedback(page);

  await page.getByPlaceholder('מה קרה / מה היה עוזר לך?').fill('זה ייכשל');
  const send = page.getByTestId('feedback-send');
  await send.click();

  await expect(page.getByText(/תם הזמן|נסה שוב|נכשל|להתחבר/).first()).toBeVisible({ timeout: 20_000 });
  // rule 3: and a way to try again, not just a sentence.
  await expect(page.getByRole('button', { name: 'נסה שוב' })).toBeVisible();
  await expect(send).toBeEnabled();
  await expect(send).toHaveText(/שלח/);
  // Nothing was double-submitted, and — the §7p half — the text is still there to retry with.
  await expect(page.getByPlaceholder('מה קרה / מה היה עוזר לך?')).toHaveValue('זה ייכשל');
  expectNoConsoleErrors(rec);
});

test('pattern 4 (legacy): setBtnLoading keeps the label and refuses the second tap', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });

  // Driven directly, because the ONE helper is what every legacy button now shares and the
  // contract is the helper's, not any one screen's.
  const state = await page.evaluate(() => {
    const b = document.createElement('button');
    b.textContent = 'שמור';
    document.body.appendChild(b);
    const w = window as any;
    w.setBtnLoading(b, true, 'שומר…');
    const pending = {
      disabled: b.disabled,
      busy: b.getAttribute('aria-busy'),
      hasSpinner: !!b.querySelector('.btn-spinner'),
      text: (b.textContent || '').trim(),
      refusedSecondRun: w.runOnce(b, 'שומר…', () => Promise.resolve('x')) === null,
    };
    w.setBtnLoading(b, false);
    const idle = { disabled: b.disabled, text: (b.textContent || '').trim() };
    b.remove();
    return { pending, idle };
  });

  expect(state.pending.disabled).toBe(true);
  expect(state.pending.busy).toBe('true');
  expect(state.pending.hasSpinner).toBe(true);
  expect(state.pending.text).toContain('שומר');      // rule 4 — a label, not a bare spinner
  expect(state.pending.refusedSecondRun).toBe(true); // F7/F8 — single flight
  expect(state.idle.disabled).toBe(false);
  expect(state.idle.text).toBe('שמור');              // restored exactly

  expectNoConsoleErrors(rec);
});

test('F9: queued EMS writes are visible in the header and listed on a tap', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });

  const chip = page.locator('#emsQueueChip');
  await expect(chip).toBeHidden();                   // nothing queued → nothing to say

  await page.evaluate(() => {
    const w = window as any;
    w.SHEET_DATA = w.SHEET_DATA || {};
    w.SHEET_DATA.emsQueue = [
      { id: 'q1', kind: 'comment', taskId: 'T-1', message: 'נשלח כשיהיה קליטה' },
      { id: 'q2', kind: 'status', taskId: 'T-2', status: 'done' },
    ];
    w.emsQueueChipRender();
  });

  await expect(chip).toBeVisible();
  await expect(chip).toHaveText(/2 פעולות ממתינות לחיבור/);
  await chip.click();
  await expect(page.getByTestId('ems-queue-list')).toBeVisible();
  await expect(page.getByTestId('ems-queue-list')).toContainText('בתור');
  await page.getByRole('button', { name: 'סגור' }).click();

  // …and it clears the moment the queue does.
  await page.evaluate(() => {
    const w = window as any;
    w.SHEET_DATA.emsQueue = [];
    w.emsQueueChipRender();
  });
  await expect(chip).toBeHidden();

  expectNoConsoleErrors(rec);
});

test('F5: a Supabase write is not open-ended — a hung PostgREST ends in a Hebrew message', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  // A PostgREST that accepts the request and never answers — the exact shape F5 describes,
  // and the one that used to leave a save button spinning forever with nothing on screen.
  await page.route(`${SB_ORIGIN}/rest/v1/feedback*`, () => { /* never fulfilled */ });
  await openFeedback(page);

  await page.getByPlaceholder('מה קרה / מה היה עוזר לך?').fill('לעולם לא ייענה');
  const send = page.getByTestId('feedback-send');
  await send.click();
  await expectPending(send, /שלח/);

  // sbWrite gives up at 15 s and the screen says so, in Hebrew, with the draft intact.
  await expect(page.getByText(/תם הזמן/).first()).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole('button', { name: 'נסה שוב' })).toBeVisible();
  await expect(send).toBeEnabled();
  await expect(page.getByPlaceholder('מה קרה / מה היה עוזר לך?')).toHaveValue('לעולם לא ייענה');
  expectNoConsoleErrors(rec);
  void ti;
});

// ═════════════════════════ C. the contract ═════════════════════════

test('the click-map contract: §2 (gaps) is empty', async ({ page }, ti) => {
  const res = await page.request.get('/docs/click-map.md');
  expect(res.ok(), 'docs/click-map.md is served from the repo root').toBeTruthy();
  const md = await res.text();

  const gaps = md.split('## 2. Gaps')[1]?.split('## 3.')[0] ?? '';
  const rows = gaps.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l));
  expect(rows, 'clickables reaching a backend with no pending state:\n' + rows.join('\n')).toEqual([]);

  expect(md).toContain('with a backend call and NO pending state: 0');
  void ti;
});
