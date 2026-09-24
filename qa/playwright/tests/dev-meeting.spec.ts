// ▶ ישיבת פיתוח (company-process spec §7) — the dev meeting, end to end.
//
// What this proves that the unit tests cannot: the overlay really covers the app on a phone
// and a desktop in both themes; the keys reach it through the real page; the 📋 prep card and
// the walk are built from ONE board fetch; 📌 writes a real `meeting_events` row; and
// accepting a proposal calls the EXISTING "העבר לספרינט הקרוב" action exactly once and never
// creates a ticket (the harness refuses every other github mode, so a create would fail loud).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

/** The github function is EMS-gated, so the meeting needs a connected session. */
const EMS = { ems_token_v1: 'qa-ems-token', ems_token_at_v1: String(Date.now()) };

async function openDevMeeting(page: any) {
  await page.waitForSelector('#sigma-dev-presenter', { state: 'attached' });
  await page.evaluate(() => (window as any).sigmaOpenDevPresenter?.()
    ?? window.dispatchEvent(new CustomEvent('sigma-open-dev-presenter')));
  await expect(page.getByTestId('dev-presenter')).toBeVisible();
  await expect(page.getByTestId('dev-prep')).toBeVisible();
}

/** Every github call the page makes, so a spec can assert WHICH mode was used. */
function watchGithub(page: any) {
  const calls: any[] = [];
  page.on('request', (r: any) => {
    if (r.method() !== 'POST' || !r.url().includes('/functions/v1/github')) return;
    try { calls.push(JSON.parse(r.postData() || '{}')); } catch { calls.push({}); }
  });
  return calls;
}

/** Every Supabase write, so the meeting log can be asserted. */
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

test('dev meeting: prep card → three columns → 📌 → accept one card into the sprint', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  const gh = watchGithub(page);
  const sent = watchWrites(page);

  await openDevMeeting(page);

  // ── the prep card: burndown + every list, from the ONE board read
  await expect(page.getByTestId('dev-burndown')).toHaveText(/\d+\/\d+ · \d+%/);
  await expect(page.getByTestId('dev-nospec')).toContainText('#13');
  await expect(page.getByTestId('dev-blocked')).toContainText('#10');
  await expect(page.getByTestId('dev-questions')).toContainText('איזה תעריף');
  await expect(page.getByTestId('dev-proposed')).toContainText('#21');
  // round 5 M-L2: the prep screen alone opens NO session (the row is created only once the walk starts)
  expect(sent.some(s => s.table === 'meeting_sessions' && s.body?.kind === 'dev')).toBe(false);
  // …from ONE board fetch, not two
  expect(gh.filter(c => !c.mode).length).toBe(1);

  await shot(page, ti);
  await expectRtl(page);

  // ── the walk: בפיתוח עכשיו → שלבי בדיקות → ספרינט הקרוב, one card per screen
  await page.getByTestId('dev-start').click();
  await expect(page.getByTestId('dev-column')).toHaveText('בפיתוח עכשיו');
  await expect(page.getByTestId('dev-card-title')).toContainText('תיקון קריאה שלילית');
  await expect(page.getByTestId('dev-card-body')).toContainText('לתקן קריאה שלילית');
  await expect(page.getByTestId('dev-card-comments')).toContainText('מתניה');
  await expect(page.getByTestId('dev-card-questions')).toContainText('איזה תעריף');
  await expect(page.getByTestId('dev-counter')).toContainText('1 / 3');
  await shot(page, ti, 'walk');

  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('dev-column')).toHaveText('שלבי בדיקות');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('dev-column')).toHaveText('ספרינט הקרוב');
  await expect(page.getByTestId('dev-counter')).toContainText('3 / 3');
  // …and it does not wrap back to the first card
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('dev-counter')).toContainText('3 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('dev-column')).toHaveText('שלבי בדיקות');

  // ── 📌 writes ONE issue event for the card on screen, and the screen does not move
  const before = sent.filter(s => s.table === 'meeting_events').length;
  await page.getByTestId('dev-marker').click();
  await expect.poll(() => sent.filter(s => s.table === 'meeting_events').length).toBe(before + 1);
  const row = sent.filter(s => s.table === 'meeting_events').pop()!.body;
  expect(row.kind).toBe('issue');
  expect(row.issue_number).toBe(12);
  await expect(page.getByTestId('dev-counter')).toContainText('2 / 3');

  expectNoConsoleErrors(rec);
});

test('dev meeting: accepting a proposal moves the card with the existing action, and never creates one', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  const gh = watchGithub(page);

  await openDevMeeting(page);
  await expect(page.getByTestId('dev-proposed-21')).toBeVisible();

  await page.getByTestId('dev-accept-21').click();
  await expect(page.getByTestId('dev-accept-21')).toHaveText('הועבר');

  const writes = gh.filter(c => c.mode);
  expect(writes.length).toBe(1);
  expect(writes[0].mode).toBe('setStatus');
  expect(writes[0].numbers).toEqual([21]);
  expect(gh.some(c => c.mode === 'createIssue')).toBe(false);

  // …and the board really moved: #21 is now walked as part of ספרינט הקרוב.
  await page.getByTestId('dev-start').click();
  await expect(page.getByTestId('dev-counter')).toContainText('/ 4');

  expectNoConsoleErrors(rec);
});

test('dev meeting: fits the phone width and the stopwatch starts on demand', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  await openDevMeeting(page);

  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowX).toBeLessThanOrEqual(1);

  await expect(page.getByTestId('dev-timer')).toHaveText('00:00');
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('dev-timer')).toHaveText('00:00');
  await page.getByTestId('dev-timer-toggle').click();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('dev-timer')).not.toHaveText('00:00');

  await shot(page, ti, 'phone-fit');
  expectNoConsoleErrors(rec);
});

test('dev meeting: a viewer never gets the screen', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה', storage: EMS, ready: '' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-dev-presenter')));
  await expect(page.getByTestId('dev-presenter')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});
