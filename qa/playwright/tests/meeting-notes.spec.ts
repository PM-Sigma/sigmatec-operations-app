// MeetingNotes on the card (spec §7c + §7k #7).
// Covers: the latest bullets render with the meeting date chip, the "עוד N" disclosure opens
// the full latest meeting, and "היסטוריה (N)" collapses the older meetings behind one tap.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

test('meeting notes: latest bullets, עוד disclosure, היסטוריה collapse', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // חוקוק has four meetings in the fixtures: three bullets on the newest, one each before.
  const notes = page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .card-notes');
  await expect(notes).toBeVisible();

  // ── collapsed card view: CARD_BULLETS (2) bullets + the 🗓 date chip of the newest meeting
  await expect(notes.getByText('להשלים החלפת מונה ראשי במחלבה')).toBeVisible();
  await expect(notes.getByText('לתאם מול הגזבר את החתימה על ההסכם')).toBeVisible();
  await expect(notes.getByText('לבדוק זרימת נתונים מהבקר החדש')).toHaveCount(0);
  await expect(notes.locator('.card-notes-more')).toContainText('עוד');

  await shot(page, ti);

  // ── "עוד 1" expands to the whole latest meeting (and the disclosure is gone)
  await notes.locator('.card-notes-more').click();
  await expect(notes.getByText('לבדוק זרימת נתונים מהבקר החדש')).toBeVisible();
  await expect(notes.locator('.card-notes-more')).toHaveCount(0);

  // ── the older meetings are behind "היסטוריה (3)", closed by default
  const history = notes.locator('.card-notes-history');
  const historyToggle = history.getByRole('button', { name: /היסטוריה/ });
  await expect(history).toBeVisible();
  await expect(historyToggle).toContainText('היסטוריה (3)');
  await expect(notes.getByText('הוזמנו 12 מונים מהמחסן')).toHaveCount(0);

  await historyToggle.click();
  await expect(notes.getByText('הוזמנו 12 מונים מהמחסן')).toBeVisible();
  await expect(notes.getByText('פגישת היכרות עם מנהל המשק')).toBeVisible();
  await shot(page, ti, 'history-open');

  // closing it puts them away again — the card returns to its two lines
  await historyToggle.click();
  await expect(notes.getByText('הוזמנו 12 מונים מהמחסן')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('meeting notes: a card with one meeting has no היסטוריה, an empty one shows nothing', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // גבת has exactly one meeting with one bullet → no "עוד", no "היסטוריה"
  const gvat = page.locator('#sigma-home .kibbutz[data-name="גבת"] .card-notes');
  await expect(gvat.getByText('להוציא הצעת מחיר')).toBeVisible();
  await expect(gvat.locator('.card-notes-more')).toHaveCount(0);
  await expect(gvat.locator('.card-notes-history')).toHaveCount(0);

  // דגניה has none → nothing at all (22.9, D4: "אין סיכום ישיבה" is not a thing to show)
  const dganya = page.locator('#sigma-home .kibbutz[data-name="דגניה"] .card-notes');
  await expect(dganya.locator('.card-notes-empty')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

// Designer round 9: the ➕/⋯ actions must clear a real 44×44 hit target on the RENDERED
// button box itself — not the `.s-hit` overlay, which only grows the invisible tap area
// around a smaller visual box. Checked at both phone widths, inside the open sheet (the
// section is StatusTab's, not the closed card's collapsed view).
for (const width of [360, 412] as const) {
  test(`meeting notes: ➕/⋯ actions clear 44×44 and never overlap, at ${width}px`, async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { who: 'עידן' });
    await page.setViewportSize({ width, height: width === 360 ? 780 : 915 });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
    const section = page.locator('[data-section="meetings"]');
    await expect(section).toBeVisible();

    const plus = section.getByRole('button', { name: 'פתח משימה ב-EMS' }).first();
    const more = section.getByRole('button', { name: 'עוד פעולות לבולט' }).first();
    await expect(plus).toBeVisible();
    await expect(more).toBeVisible();

    const plusBox = await plus.boundingBox();
    const moreBox = await more.boundingBox();
    expect(plusBox).toBeTruthy();
    expect(moreBox).toBeTruthy();
    expect(plusBox!.width).toBeGreaterThanOrEqual(44);
    expect(plusBox!.height).toBeGreaterThanOrEqual(44);
    expect(moreBox!.width).toBeGreaterThanOrEqual(44);
    expect(moreBox!.height).toBeGreaterThanOrEqual(44);

    // no overlap between the two actions themselves
    const overlapX = plusBox!.x < moreBox!.x + moreBox!.width && moreBox!.x < plusBox!.x + plusBox!.width;
    const overlapY = plusBox!.y < moreBox!.y + moreBox!.height && moreBox!.y < plusBox!.y + plusBox!.height;
    expect(overlapX && overlapY).toBe(false);

    // no overlap with the note text itself
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const textBox = await section.locator('.note-bullet').first().locator('span').first().boundingBox();
    if (textBox) expect(overlaps(plusBox!, textBox)).toBe(false);

    console.log(`[K-U9] ${width}px ➕ ${Math.round(plusBox!.width)}x${Math.round(plusBox!.height)} · ⋯ ${Math.round(moreBox!.width)}x${Math.round(moreBox!.height)}`);

    // designer round 10: every row must stay INSIDE its card — SectionBlock wraps its rows in
    // `-mx-4 divide-y`, and a row that drops its own compensating px-4 spills past the card's
    // real edge (the ⋯ bubble got clipped at the left in round 6's evidence).
    const cardBox = (await section.boundingBox())!;
    const rowBoxes = await section.locator('.note-bullet').evaluateAll(
      els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
    for (const row of rowBoxes) {
      expect(row.x).toBeGreaterThanOrEqual(cardBox.x - 0.5);
      expect(row.x + row.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5);
    }

    expectNoConsoleErrors(rec);
  });
}
