// ▶ מצב ישיבה (company-process spec §1.2 + §1.2b) — the in-meeting screen, end to end.
//
// What this proves that the unit tests cannot: the overlay really covers the app on a phone
// and on a desktop, in both themes; the keys reach it through the real page (the legacy
// bundle binds keys of its own, and a meeting screen that loses `Space` to something else is
// useless); and a line typed during the meeting is on the kibbutz card the moment he exits.
//
// The meeting tables are REAL stores in the harness (_helpers.ts), so the writes come back.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, writeRectSidecar } from './_helpers';

/** The board's order for the fixtures: 🆕 שדה אליהו · גבת → ✅ דגניה · חוקוק · יגור … */
const FIRST = 'שדה אליהו';

/** The harness's own "🧪 DEV" sandbox notch (01-data.js) — real and useful in a browser, but
 *  it has no selector of its own and just clutters every evidence screenshot in this file. */
async function hideDevBadge(page: any) {
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach(d => {
      if (d.textContent === '🧪 DEV') (d as HTMLElement).style.display = 'none';
    });
  });
}

async function openPresenter(page: any) {
  await page.waitForSelector('#sigma-presenter', { state: 'attached' });
  await hideDevBadge(page);
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
  // round 5 M-L2: opening the mode alone writes NO session row (lazy — created when the meeting really runs)
  expect(sent.some(s => s.table === 'meeting_sessions')).toBe(false);

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

  // ── חוקוק's open bullets from its last meeting are on the TIMELINE now, not a separate
  //    collapsed card (designer round-5: the header carry line is gone; round-6: the collapsed
  //    "מהישיבה הקודמת" card is gone too — the timeline is the one place that shows it).
  await expect(page.getByTestId('presenter-carry')).toHaveCount(0);
  await expect(page.getByTestId('presenter')).toContainText('להשלים החלפת מונה ראשי במחלבה');
  await expect(page.getByTestId('presenter-strip-admin')).toBeVisible();
  await expect(page.getByTestId('presenter-strip-field')).toBeVisible();
  // Task 28 has not shipped — its strip is simply absent, not broken
  await expect(page.getByTestId('presenter-strip-extra')).toHaveCount(0);

  // designer round-4: the composer must never sit outside the viewport or bleed past its own
  // parent on either RTL side — geometry, not a screenshot guess.
  const composerBox = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="presenter-quicknote"]') as HTMLElement;
    const row = input?.closest('footer') as HTMLElement;
    const ir = input.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    return { vw: window.innerWidth, input: { left: ir.left, right: ir.right }, row: { left: rr.left, right: rr.right } };
  });
  expect(composerBox.input.left).toBeGreaterThanOrEqual(composerBox.row.left);
  expect(composerBox.input.right).toBeLessThanOrEqual(composerBox.row.right);
  expect(composerBox.row.left).toBeGreaterThanOrEqual(0);
  expect(composerBox.row.right).toBeLessThanOrEqual(composerBox.vw);

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

test('presenter: fits the phone width, the stopwatch starts on demand, and the arrows name their neighbour', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  const screen = await openPresenter(page);

  // ── item 1: no horizontal overflow at 390px ──────────────────────────────────────────
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowX).toBeLessThanOrEqual(1);

  // ── item 4: the clock does not run until the person starts it ───────────────────────
  await expect(page.getByTestId('presenter-timer')).toHaveText('00:00');
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('presenter-timer')).toHaveText('00:00');
  await page.getByTestId('presenter-timer-toggle').click();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('presenter-timer')).not.toHaveText('00:00');
  await page.getByTestId('presenter-timer-toggle').click();   // pause
  const paused = await page.getByTestId('presenter-timer').textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('presenter-timer')).toHaveText(paused || '');

  // ── item 3: big prev/next arrows show the neighbour's name (started on שדה אליהו — first,
  //    so ◀ has no previous; ▶ names the next kibbutz) ─────────────────────────────────
  await expect(page.getByTestId('presenter-next')).toBeVisible();
  await expect(page.getByTestId('presenter-prev')).toBeVisible();
  await page.keyboard.press('ArrowLeft');   // moves forward (RTL board order)
  await expect(page.getByTestId('presenter-prev')).toContainText(FIRST);

  // ── item 2: the open EMS tasks render as text, not just a count ─────────────────────
  await expect(page.getByTestId('presenter-strip-field')).toContainText('משימות EMS פתוחות');

  await shot(page, ti, 'phone-fit');

  await page.keyboard.press('Escape');
  await page.getByTestId('presenter-exit-yes').click();
  await expect(screen).toHaveCount(0);

  await expectNoConsoleErrors(rec);
});

test('presenter: the timeline replaces "מאז הישיבה הקודמת", and the 30-day toggle is there', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  const screen = await openPresenter(page);

  // M-R6 + designer round-5: "מאז הישיבה הקודמת" is gone everywhere — the removed block, the
  // header carry line, AND the empty-state wording (עידן asked for all three).
  await expect(page.getByText('מאז הישיבה הקודמת')).toHaveCount(0);
  await expect(page.getByTestId('presenter-carry')).toHaveCount(0);

  // M-U1: the timeline section + status blocks + window toggle are on screen
  await expect(page.getByRole('heading', { name: 'מה קרה' })).toBeVisible();
  await expect(page.getByTestId('presenter-status-blocks')).toBeVisible();
  await expect(page.getByText('30 יום')).toBeVisible();

  await shot(page, ti, 'timeline');

  await page.keyboard.press('Escape');
  await page.getByTestId('presenter-exit-yes').click();
  await expect(screen).toHaveCount(0);

  await expectNoConsoleErrors(rec);
});

test('presenter: one-click close offers a 5 s undo toast, and it really cancels or really commits', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  const screen = await openPresenter(page);

  // The harness's mock mode has no live EMS session, so the timeline falls back to the shared
  // EMS cache — this seeds it with one open task for FIRST so the close bubbles have something
  // to act on. No real network write happens either way in mock mode; this proves the UI's own
  // undo-window contract (M-R8 / Opus round-5 items 1+5), not a specific EMS call.
  await page.evaluate((kibbutz: string) => {
    (window as any).sigma.emsCacheTasksForKibbutz = (name: string) =>
      name === kibbutz ? [{ id: 'e2e-close-1', title: 'בדיקת סגירה', status: 'open' }] : [];
  }, FIRST);

  // Force the timeline's cache-fallback memo to re-read the (now patched) function: it only
  // recomputes when the kibbutz on screen changes.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText(FIRST);

  // A cache-fallback task has no date, so it lands in "משימות פתוחות ותיקות" — collapsed by
  // default; open it before its close bubbles are clickable.
  await page.getByText('משימות פתוחות ותיקות').click();

  const done = page.getByTestId('presenter-close-done-e2e-close-1');
  await expect(done).toBeVisible();
  await done.scrollIntoViewIfNeeded();
  await done.click();

  // Round-7/M-U: this toast is no longer Sonner's — it's the presenter's own element (see
  // Presenter.tsx `undoToast`), so its "ביטול" action has its own testid rather than sonner's
  // `[data-button]` markup.
  const undoBtn = page.getByTestId('presenter-undo-toast-action');

  // Undo, inside the window: the button disappears immediately, ONE toast only (Opus item 5).
  await expect(undoBtn).toBeVisible();
  await page.waitForTimeout(600);

  // Round-6 final ruling item 3, asserted rather than eyeballed: the toast clears BOTH the dock
  // and the prev/next nav row by ≥8px, and — at desktop widths, where the composer is capped
  // and centred rather than edge-to-edge — the toast's own centre lines up with the composer's.
  const toastGeo = await page.evaluate(() => {
    const toast = document.querySelector('[data-testid="presenter-undo-toast"]') as HTMLElement | null;
    const footer = document.querySelector('footer') as HTMLElement | null;
    const navRow = footer?.querySelector('[data-testid="presenter-prev"]')?.parentElement as HTMLElement | null;
    if (!toast || !footer || !navRow) return null;
    const t = toast.getBoundingClientRect();
    const f = footer.getBoundingClientRect();
    const n = navRow.getBoundingClientRect();
    return {
      toastBottom: t.bottom, toastLeft: t.left, toastRight: t.right,
      dockTop: f.top, navTop: n.top,
      toastCentre: (t.left + t.right) / 2, composerCentre: (f.left + f.right) / 2,
      vw: window.innerWidth,
    };
  });
  expect(toastGeo).not.toBeNull();
  if (toastGeo) {
    expect(toastGeo.toastBottom).toBeLessThanOrEqual(Math.min(toastGeo.dockTop, toastGeo.navTop) - 8);
    // round-7 (עידן): a centred-BOX-but-off-centre-TOAST bug survived the >=1024-only check
    // (measured composer-centre matched, but the toast's own width still wasn't symmetric
    // inside it at 412px — 38px left vs 16px right). Assert the toast's own left/right gutters
    // against the viewport directly, at every width, so "centred" can't pass on the box alone.
    const leftGutter = toastGeo.toastLeft;
    const rightGutter = toastGeo.vw - toastGeo.toastRight;
    expect(leftGutter).toBeGreaterThanOrEqual(16);
    expect(rightGutter).toBeGreaterThanOrEqual(16);
    expect(Math.abs(leftGutter - rightGutter)).toBeLessThanOrEqual(2);
    // Stamp the exact measured rect right after it passed the assertion above, so the shot
    // taken next can never be mistaken for evidence from a stale/pre-fix run.
    await writeRectSidecar(page, ti, 'close-undo-toast', {
      left: toastGeo.toastLeft, right: toastGeo.toastRight, bottom: toastGeo.toastBottom, vw: toastGeo.vw,
      leftGutter, rightGutter,
    });
  }

  await shot(page, ti, 'close-undo-toast');
  await undoBtn.dispatchEvent('click');
  await page.waitForTimeout(5500);
  await expect(page.getByTestId('presenter-close-done-e2e-close-1')).toBeVisible();   // still open

  // Left alone this time: the undo window closes on its own once the 5 s pass
  const cancel = page.getByTestId('presenter-close-cancel-e2e-close-1');
  await cancel.click();
  await expect(undoBtn).toBeVisible();
  await page.waitForTimeout(5500);
  await expect(undoBtn).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.getByTestId('presenter-exit-yes').click();
  await expect(screen).toHaveCount(0);

  await expectNoConsoleErrors(rec);
});

test('presenter: a populated timeline shows all four kinds (EMS, internal, note, visit)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  const screen = await openPresenter(page);
  const KIB = 'חוקוק';   // already has a fixture note (n1, 2 days ago) — the other three kinds
                          // are test-only stubs added here, not production code, so the
                          // designer can judge a real timeline instead of its empty state.

  await page.evaluate((kibbutz: string) => {
    const w = window as any;
    w.sigma.isEmsConnected = () => true;
    w.sigma.emsApi = async (path: string) => {
      if (path.startsWith('/employee-tasks?')) {
        return {
          items: [{
            id: 'fx-ems-1', title: 'לתאם ביקור טכנאי', status: 'open',
            site: { id: 'd1bdff7a-82c2-46d1-92f1-96ab0679911e', name: kibbutz },
            createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
            updatedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
          }],
        };
      }
      if (path.includes('/comments')) {
        return { items: [{ id: 'c1', message: 'בדקתי, הכל תקין', author: 'אביאם', createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }] };
      }
      return { items: [] };
    };
    w.sigma.loadAllVisitsCombined = () => [
      { kibbutz, date: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10), visitor: 'ניתאי' },
    ];
    w.sigmaBus?.dispatchEvent(new CustomEvent('ems-cache-synced'));
  }, KIB);

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('presenter-kibbutz')).toHaveText(KIB);

  // The fourth kind — an internal task — added live through the existing ✏️ 🔒 path.
  await page.getByTestId('presenter-edit').click();
  await page.getByTestId('live-text').fill('להזמין ציוד גיבוי');
  await page.getByTestId('live-chip-internal').click();
  await page.getByTestId('live-submit').click();
  await expect(page.getByTestId('presenter-live')).toHaveCount(0);

  // The window toggle's state is on screen too (no previous session logged in this harness,
  // so "30 יום" is the only — and selected — option).
  const scope = page.getByTestId('presenter');   // the home card behind repeats some of this text
  await expect(scope.getByText('30 יום')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'מה קרה' })).toBeVisible();
  await expect(scope.getByText('לתאם ביקור טכנאי')).toBeVisible();               // EMS
  await expect(scope.getByText('להזמין ציוד גיבוי')).toBeVisible();              // internal
  await expect(scope.getByText('להשלים החלפת מונה ראשי במחלבה').first()).toBeVisible();  // note (n1)
  await expect(scope.getByText('ביקור · ניתאי')).toBeVisible();                  // visit

  // Let the "נפתחה משימה פנימית" toast clear and bring the OLDEST of the four items (the visit,
  // 3 days back — newest-first order) into frame, so the capture shows all four kinds at once
  // instead of the heading plus whichever one happens to sit right under it.
  await page.waitForTimeout(4200);
  await scope.getByText('ביקור · ניתאי').scrollIntoViewIfNeeded();
  await shot(page, ti, 'timeline-populated');

  await page.keyboard.press('Escape');
  await page.getByTestId('presenter-exit-yes').click();
  await expect(screen).toHaveCount(0);

  await expectNoConsoleErrors(rec);
});

test('presenter: סמן רגע opens the note sheet and the note lands on the moments list at exit', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  const screen = await openPresenter(page);

  await page.getByTestId('presenter-marker').click();
  const sheet = page.getByTestId('presenter-moment-sheet');
  await expect(sheet).toBeVisible();
  await page.getByTestId('presenter-moment-note').fill('לבדוק שוב את המונה');
  await shot(page, ti, 'moment');
  await page.getByTestId('presenter-moment-save').click();
  await expect(sheet).toHaveCount(0);

  await page.keyboard.press('Escape');
  const exitSheet = page.getByTestId('presenter-exit-sheet');
  await expect(exitSheet).toContainText('לבדוק שוב את המונה');
  await page.getByTestId('presenter-exit-yes').click();
  await expect(screen).toHaveCount(0);

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
