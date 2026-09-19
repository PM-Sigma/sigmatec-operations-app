// 📝 ישיבה → סיכום (company-process spec §1.3) — the review editor, end to end.
//
// What this proves that the unit tests cannot: the real 17.9 summary goes through the real
// import sheet, the hand-off button really mounts the review island, the screen is usable at
// 390 px and at 1440 px in both themes, and — the point of the whole feature — NOTHING
// reaches the backend until בצע, at which moment the bullets land through
// `import_meeting_notes` and one EMS task is opened per 📋 line.
//
// `kibbutz_meeting_notes` and that RPC are real stores in the harness (_helpers.ts), so the
// rows come back and the card behind the sheet shows them.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

/** A two-kibbutz slice in the exact shape עידן pastes (the 17.9 fixture's own wording). */
const SUMMARY = `**סיכום ישיבת חברה — 17.9.26**

**1. חוקוק**

להשלים את החלפת המונה הראשי במחלבה. **אחריות אביאם.**

ללא פערים נוספים.

**2. גבת**

הוחלט שהפגישה עם פז תתקיים בחול המועד. **אחריות עמיחי.**
`;

/** Every write the page makes, so a spec can assert what was — and was not — sent. */
function watchWrites(page: any) {
  const sent: Array<{ table: string; method: string; body: any }> = [];
  page.on('request', (r: any) => {
    if (r.method() !== 'POST' && r.method() !== 'PATCH') return;
    const m = /\/rest\/v1\/(?:rpc\/)?([^?/]+)/.exec(r.url());
    if (!m) return;
    let body: any = null;
    try { body = JSON.parse(r.postData() || 'null'); } catch { /* not json */ }
    sent.push({ table: m[1], method: r.method(), body });
  });
  return sent;
}

/** Record every EMS task the page opens — EMS itself is offline in this harness. */
async function watchTasks(page: any) {
  await page.evaluate(() => {
    const s: any = (window as any).sigma;
    (window as any).__created = [];
    const real = s.createTask.bind(s);
    s.createTask = (item: any) => {
      (window as any).__created.push(item);
      return Promise.resolve({ sent: true, id: 'T-' + (window as any).__created.length });
    };
    (window as any).__realCreateTask = real;
  });
}
const createdTasks = (page: any) => page.evaluate(() => (window as any).__created || []);

/** Paste the summary through the real import sheet and hand it to the review. */
async function openReview(page: any) {
  await page.waitForSelector('#sigma-import', { state: 'attached' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-import')));
  await expect(page.getByRole('heading', { name: '📥 ייבוא סיכום ישיבה' })).toBeVisible();
  // The sheet renders in a portal, not inside its placeholder div.
  await page.getByRole('dialog').locator('textarea').first().fill(SUMMARY);
  await page.getByRole('button', { name: 'תצוגה מקדימה' }).click();
  await page.getByTestId('import-review').click();
  await expect(page.getByTestId('meeting-review')).toBeVisible();
  return page.getByTestId('meeting-review');
}

test('review: paste → edit → move → בצע writes the bullets and opens the tasks', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await watchTasks(page);
  const sent = watchWrites(page);

  const sheet = await openReview(page);

  // ── the draft opens with a proposal per line: work, quiet, decision
  await expect(page.getByTestId('review-section-חוקוק')).toBeVisible();
  await expect(page.getByTestId('review-section-גבת')).toBeVisible();
  await expect(page.getByTestId('review-chip-חוקוק#1-ems')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('review-chip-חוקוק#2-chatter')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('review-chip-גבת#1-decision')).toHaveAttribute('aria-pressed', 'true');
  // 🔒 פנימי is not offered — nothing can write an internal task yet (Task 26)
  await expect(page.getByTestId('review-chip-חוקוק#1-internal')).toHaveCount(0);

  await shot(page, ti);
  await expectRtl(page);

  // ── nothing has been written, and nothing will be until בצע
  expect(sent.filter(s => s.table === 'import_meeting_notes' || s.table === 'kibbutz_meeting_notes')).toHaveLength(0);
  expect(await createdTasks(page)).toHaveLength(0);

  // ── ✏️ rewrites one line
  await page.getByTestId('review-edit-חוקוק#1').click();
  await page.getByTestId('review-edit-text-חוקוק#1').fill('להשלים החלפת מונה ראשי במחלבה');
  await page.getByTestId('review-edit-save-חוקוק#1').click();
  await expect(page.getByTestId('review-text-חוקוק#1')).toContainText('להשלים החלפת מונה ראשי במחלבה');

  // ── ⋯ → "העבר לקיבוץ אחר" moves the quiet line to the other kibbutz (the phone's path,
  //    and the one that works at every width)
  await page.getByTestId('review-more-חוקוק#2').click();
  await page.getByTestId('review-move-חוקוק#2').selectOption('גבת');
  await expect(page.getByTestId('review-line-חוקוק#2')).toContainText('הועבר מ־');

  // ── ➕ a line nobody said aloud
  await page.getByTestId('review-add-גבת').click();
  await page.getByTestId('review-add-text-גבת').fill('לשלוח סיכום במייל');
  await page.getByTestId('review-add-save-גבת').click();
  await expect(sheet).toContainText('לשלוח סיכום במייל');

  await shot(page, ti, 'edited');

  // ── בצע: the bullets go through the merge, and one EMS task per 📋 line
  await expect(page.getByTestId('review-commit')).toContainText('בצע');
  await page.getByTestId('review-commit').click();
  await expect(sheet).toHaveCount(0);

  const rpc = sent.find(s => s.table === 'import_meeting_notes');
  expect(rpc).toBeTruthy();
  expect(rpc!.body.p.meeting_date).toBe('2026-09-17');
  expect(rpc!.body.p.rows).toHaveLength(4);
  expect(rpc!.body.p.rows[0]).toMatchObject({ kibbutz: 'חוקוק', seq: 1, text: 'להשלים החלפת מונה ראשי במחלבה' });

  const created = await createdTasks(page);
  expect(created.length).toBeGreaterThanOrEqual(2);      // the edited line + the ➕ line
  expect(created.map((c: any) => c.title)).toContain('להשלים החלפת מונה ראשי במחלבה');
  // …and each one was linked back onto its bullet
  await expect.poll(() => sent.filter(s => s.table === 'kibbutz_meeting_notes' && s.method === 'PATCH').length)
    .toBeGreaterThanOrEqual(2);

  // ── the card behind the sheet already carries the reviewed line
  const card = page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .card-notes');
  await expect(card).toContainText('להשלים החלפת מונה ראשי במחלבה', { timeout: 10_000 });

  await expectNoConsoleErrors(rec);
});

test('review: ביטול throws the whole session away and writes nothing', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await watchTasks(page);
  const sent = watchWrites(page);

  const sheet = await openReview(page);
  await page.getByTestId('review-chip-חוקוק#2-ems').click();
  await page.getByTestId('review-cancel').click();
  await expect(sheet).toHaveCount(0);

  expect(sent.filter(s => s.table === 'import_meeting_notes')).toHaveLength(0);
  expect(sent.filter(s => s.table === 'kibbutz_meeting_notes')).toHaveLength(0);
  expect(await createdTasks(page)).toHaveLength(0);

  await expectNoConsoleErrors(rec);
});

test('review: a viewer is never offered it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });

  await page.waitForSelector('#sigma-import', { state: 'attached' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-import')));
  await page.waitForTimeout(500);
  // the import sheet itself is admin-only, so the review behind it is unreachable
  await expect(page.getByTestId('import-review')).toHaveCount(0);
  await expect(page.getByTestId('meeting-review')).toHaveCount(0);

  await expectNoConsoleErrors(rec);
});
