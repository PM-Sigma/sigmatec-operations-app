// ▶ מצב ישיבה (company-process spec §1.2 + §1.2b) — the in-meeting screen, end to end.
//
// What this proves that the unit tests cannot: the overlay really covers the app on a phone
// and on a desktop, in both themes; the keys reach it through the real page (the legacy
// bundle binds keys of its own, and a meeting screen that loses `Space` to something else is
// useless); and a line typed during the meeting is on the kibbutz card the moment he exits.
//
// The meeting tables are REAL stores in the harness (_helpers.ts), so the writes come back.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

/** The board's order for the fixtures: 🆕 שדה אליהו · גבת → ✅ דגניה · חוקוק · יגור … */
const FIRST = 'שדה אליהו';

async function openPresenter(page: any) {
  await page.waitForSelector('#sigma-presenter', { state: 'attached' });
  await page.evaluate(() => (window as any).sigmaOpenPresenter?.()
    ?? window.dispatchEvent(new CustomEvent('sigma-open-presenter')));
  const screen = page.getByTestId('presenter');
  await expect(screen).toBeVisible();
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText(FIRST);
  return screen;
}

/** Every write the page makes, so a spec can assert a row was really sent. */
function watchWrites(page: any) {
  const sent: Array<{ table: string; body: any }> = [];
  page.on('request', (r: any) => {
    if (r.method() !== 'POST' && r.method() !== 'PATCH') return;
    const m = /\/rest\/v1\/([^?/]+)/.exec(r.url());
    if (!m) return;
    let body: any = null;
    try { body = JSON.parse(r.postData() || 'null'); } catch { /* not json */ }
    sent.push({ table: m[1], body });
  });
  return sent;
}

test('presenter: the keys walk the board, mark a moment and write one line', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  const sent = watchWrites(page);

  const screen = await openPresenter(page);

  // ── the header is the whole state of the meeting: clock · X/N · what carried over
  await expect(page.getByTestId('presenter-timer')).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.getByTestId('presenter-counter')).toContainText('1 / 7');
  // …and a session was opened for it
  await expect.poll(() => sent.some(s => s.table === 'meeting_sessions')).toBe(true);

  await shot(page, ti);
  await expectRtl(page);

  // ── ← walks forward through the board's own order, → walks back
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText('גבת');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText('דגניה');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText('חוקוק');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText('דגניה');

  // K / J are the same two moves
  await page.keyboard.press('j');
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText('חוקוק');

  // ── חוקוק has three open bullets from its last meeting: the header says so, and they are
  //    on screen, big, with their owners.
  await expect(page.getByTestId('presenter-carry')).toHaveText('מהישיבה הקודמת: 3 פתוחים');
  await expect(page.getByTestId('presenter-bullets')).toContainText('להשלים החלפת מונה ראשי במחלבה');
  await expect(page.getByTestId('presenter-strip-admin')).toBeVisible();
  await expect(page.getByTestId('presenter-strip-field')).toBeVisible();
  // Task 28 has not shipped — its strip is simply absent, not broken
  await expect(page.getByTestId('presenter-strip-extra')).toHaveCount(0);

  await shot(page, ti, 'kibbutz');

  // ── Space marks the moment WITHOUT moving the screen
  await page.keyboard.press('Space');
  await expect.poll(() => sent.some(s => s.table === 'meeting_events' && s.body?.kind === 'marker')).toBe(true);
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText('חוקוק');

  // ── P parks a tangent, also without moving, and files the kibbutz as a hint only
  await page.keyboard.press('p');
  await expect.poll(() => sent.find(s => s.table === 'meeting_events' && s.body?.kind === 'parking')?.body)
    .toMatchObject({ kind: 'parking', hint: 'חוקוק' });
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText('חוקוק');

  // ── N focuses the always-visible line; Enter writes it and empties the field
  await page.keyboard.press('n');
  const note = page.getByTestId('presenter-quicknote');
  await expect(note).toBeFocused();
  await note.fill('לבדוק את זרימת הנתונים מהבקר');
  await page.keyboard.press('Enter');
  await expect.poll(() => sent.find(s => s.table === 'meeting_events' && s.body?.kind === 'note')?.body)
    .toMatchObject({ kind: 'note', kibbutz: 'חוקוק', hint: 'לבדוק את זרימת הנתונים מהבקר' });
  await expect(note).toHaveValue('');

  // ── Esc from the field goes back to navigation; only the SECOND Esc asks about leaving
  await note.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('presenter-exit-sheet')).toHaveCount(0);
  await expect(screen).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('presenter-exit-sheet')).toBeVisible();
  await shot(page, ti, 'exit');
  await page.getByTestId('presenter-exit-yes').click();
  await expect(screen).toHaveCount(0);
  // …and the session was closed rather than abandoned
  await expect.poll(() => sent.some(s => s.table === 'meeting_sessions' && s.body?.ended_at)).toBe(true);

  await expectNoConsoleErrors(rec);
});

test('presenter: ✏️ writes the line onto the kibbutz card while the meeting runs', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  const sent = watchWrites(page);

  await openPresenter(page);
  // walk to חוקוק, which is the card the home screen behind shows bullets on
  for (const k of ['גבת', 'דגניה', 'חוקוק']) {
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('presenter-kibbutz')).toHaveText(k);
  }

  await page.getByTestId('presenter-edit').click();
  const sheet = page.getByTestId('presenter-live');
  await expect(sheet).toBeVisible();

  // 🔒 פנימי is offered now that internal tasks have a write path (Task 26)
  await expect(page.getByTestId('live-chip-internal')).toBeVisible();
  for (const id of ['ems', 'note', 'decision', 'idea']) {
    await expect(page.getByTestId('live-chip-' + id)).toBeVisible();
  }
  // an empty line cannot be entered
  await expect(page.getByTestId('live-submit')).toBeDisabled();

  await page.getByTestId('live-text').fill('הקיבוץ ביקש דוח צריכה חודשי');
  await page.getByTestId('live-chip-note').click();
  await page.getByTestId('live-owner').selectOption('עמיחי');
  await shot(page, ti, 'live');
  await page.getByTestId('live-submit').click();

  // it is created ON THE SPOT, stamped as written during the meeting
  await expect.poll(() => sent.find(s => s.table === 'kibbutz_meeting_notes')?.body)
    .toMatchObject({ kibbutz: 'חוקוק', text: 'הקיבוץ ביקש דוח צריכה חודשי', source: 'live' });
  await expect(sheet).toHaveCount(0);

  // …and when he leaves, the card behind the overlay already has it
  await page.keyboard.press('Escape');
  await page.getByTestId('presenter-exit-yes').click();
  await expect(page.getByTestId('presenter')).toHaveCount(0);
  const card = page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .card-notes');
  await expect(card).toContainText('הקיבוץ ביקש דוח צריכה חודשי', { timeout: 10_000 });

  await expectNoConsoleErrors(rec);
});

test('presenter: a viewer is never offered the screen', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });

  await page.waitForSelector('#sigma-presenter', { state: 'attached' });
  await page.evaluate(() => (window as any).sigmaOpenPresenter?.()
    ?? window.dispatchEvent(new CustomEvent('sigma-open-presenter')));
  // give the chunk time to load and decide
  await page.waitForTimeout(500);
  await expect(page.getByTestId('presenter')).toHaveCount(0);

  await expectNoConsoleErrors(rec);
});
