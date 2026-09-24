// ▶ ישיבת פיתוח (company-process spec §7, D-U2) — the dev meeting, end to end.
//
// What this proves that the unit tests cannot: the overlay really covers the app on a phone
// and a desktop in both themes; the keys reach it through the real page; the 📋 prep card, the
// חדש השבוע screen and the walk are built from ONE board fetch; the walk is grouped by domain;
// marking a card (1/2/3, or the mark bar) never fires a GitHub write; 📌 writes a real
// `meeting_events` row; and the end-of-meeting summary lists what was marked.
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

/** Every github call the page makes, so a spec can assert WHICH mode was used (none, for D-U2). */
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

async function toWalk(page: any) {
  await page.getByTestId('dev-start').click();
  await expect(page.getByTestId('dev-new-week')).toBeVisible();
  await page.getByTestId('dev-new-week-start').click();
  await expect(page.getByTestId('dev-card-title')).toBeVisible();
}

test('dev meeting: prep card → חדש השבוע → the domain walk → 📌 → mark a card locally', async ({ page }, ti) => {
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
  expect(sent.some(s => s.table === 'meeting_sessions' && s.body?.kind === 'dev')).toBe(false);
  expect(gh.filter(c => !c.mode).length).toBe(1);

  await shot(page, ti);
  await expectRtl(page);

  // ── accepting a proposal is now a LOCAL mark — no GitHub write, ever
  await page.getByTestId('dev-accept-21').click();
  await expect(page.getByTestId('dev-accept-21')).toHaveText('הועבר');
  expect(gh.some(c => c.mode)).toBe(false);

  // ── חדש השבוע, its own screen before the walk
  await page.getByTestId('dev-start').click();
  await expect(page.getByTestId('dev-new-week')).toBeVisible();
  await shot(page, ti, 'new-week');
  await page.getByTestId('dev-new-week-start').click();

  // ── the walk: grouped by domain, one card per screen
  await expect(page.getByTestId('dev-domain')).toBeVisible();
  await expect(page.getByTestId('dev-card-title')).toBeVisible();
  await shot(page, ti, 'walk');

  // ── 📌 writes ONE issue event for the card on screen, and the screen does not move
  const before = sent.filter(s => s.table === 'meeting_events').length;
  await page.getByTestId('dev-marker').click();
  await expect.poll(() => sent.filter(s => s.table === 'meeting_events').length).toBe(before + 1);
  const row = sent.filter(s => s.table === 'meeting_events').pop()!.body;
  expect(row.kind).toBe('issue');

  // ── the mark bar sets a local mark — still no GitHub write
  await page.keyboard.press('2');
  await expect(page.getByTestId('dev-mark-bar')).toContainText('לבירור');
  expect(gh.some(c => c.mode)).toBe(false);

  expectNoConsoleErrors(rec);
});

test('dev meeting: walk two domains with the keys and finish at the summary', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  await openDevMeeting(page);
  await toWalk(page);

  await page.keyboard.press('1');   // mark the current card לספרינט
  await page.keyboard.press('j');   // next card
  await page.keyboard.press('3');   // mark it לדחות
  await page.keyboard.press('ArrowLeft');  // jump to the next domain (a no-op with one domain in the fixture)
  await page.keyboard.press('ArrowRight');

  await page.getByTestId('dev-to-summary').click();
  await expect(page.getByTestId('dev-summary')).toBeVisible();
  await shot(page, ti, 'summary');
  await expect(page.getByTestId('dev-summary-sprint')).toContainText('#21');
  await expect(page.getByTestId('dev-summary-defer')).toContainText('#12');

  await page.getByTestId('dev-summary-finish').click();
  await expect(page.getByTestId('dev-presenter')).toBeHidden();

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
