// #sigma-home — the card page (spec §2 + §7b + §7c).
// Covers: both sections render, every card carries its region chip (עידן 20.9 #1 — the old
// standalone label rows between the cards are gone),
// the filter chips actually filter (and the card list crossfades rather than jumping), and
// the card quick-action row is role-gated (viewer = ישיבות only).
import { boot, expect, expectNoConsoleErrors, expectRtl, expectTheme, shot, test } from './_helpers';

test('home cards: sections, region chips, filters, quick actions', async ({ page }, ti) => {
  const { rec, theme } = await boot(page, ti);

  await expectRtl(page);
  await expectTheme(page, theme);

  const home = page.locator('#sigma-home');

  // ── two sections, each with its own animated count
  await expect(home.getByRole('heading', { name: '🆕 לקוחות חדשים' })).toBeVisible();
  await expect(home.getByRole('heading', { name: '✅ לקוחות פעילים' })).toBeVisible();

  // ── every fixture kibbutz has a card, and the sub-site carries its parent chip
  await expect(home.locator('.kibbutz')).toHaveCount(7);
  await expect(home.locator('.kibbutz[data-name="חוקוק"]')).toBeVisible();
  await expect(home.locator('.kibbutz[data-name="יגור — רפת"] .tag-subsite')).toContainText('יגור');
  await expect(home.locator('.kibbutz[data-name="כפר עזה"] .tag-marketing')).toBeVisible();
  // the energy badge is per-row data, never a hardcoded ⚡
  await expect(home.locator('.kibbutz[data-name="כפר עזה"] .energy-badge')).toContainText('גז');

  // ── the region lives ON the card (עידן 20.9 #1). The standalone label rows between cards
  // read as noise once every card already says where it is, so there are none — the chip
  // beside the name carries the region, and the grouping survives as the sort order.
  await expect(home.locator('[data-region]:not(.kibbutz)')).toHaveCount(0);
  await expect(home.locator('.kibbutz[data-name="חוקוק"] .region-chip')).toHaveText('גליל וגולן');
  await expect(home.locator('.kibbutz[data-name="יגור"] .region-chip')).toHaveText('העמקים');
  await expect(home.locator('.kibbutz[data-name="כפר עזה"] .region-chip')).toHaveText('דרום, עוטף עזה והנגב');
  // grouping = ordering: every card of one region is contiguous within its section.
  const seen = await home.locator('#sigma-home .kibbutz .region-chip').allInnerTexts();
  const firstSeen = new Map<string, number>();
  seen.forEach((r, i) => { if (!firstSeen.has(r)) firstSeen.set(r, i); });
  seen.forEach((r, i) => expect(i === 0 || seen[i - 1] === r || firstSeen.get(r) === i,
    'region "' + r + '" is split across the grid — the grouping order broke').toBeTruthy());

  await shot(page, ti);

  // ── filter chips. 🤝 שיווקי leaves exactly the one marketing row; the transition is a
  // crossfade, so the old cards must be GONE once it settles (an AnimatePresence leak used to
  // leave exited cards stranded in the DOM — see Section.tsx).
  await home.getByRole('radio', { name: '🤝 שיווקי' }).click();
  await expect(home.locator('.kibbutz')).toHaveCount(1);
  await expect(home.locator('.kibbutz[data-name="כפר עזה"]')).toBeVisible();
  await expect(home.locator('[data-region]:not(.kibbutz)')).toHaveCount(0);
  await shot(page, ti, 'filter-marketing');

  await home.getByRole('radio', { name: '🆕 חדשים' }).click();
  await expect(home.locator('.kibbutz')).toHaveCount(2);
  await expect(home.getByRole('heading', { name: '✅ לקוחות פעילים' })).toHaveCount(0);

  await home.getByRole('radio', { name: 'הכל' }).click();
  await expect(home.locator('.kibbutz')).toHaveCount(7);

  // ── search narrows the same list
  await home.getByRole('searchbox', { name: 'חיפוש קיבוץ' }).fill('חוקוק');
  await expect(home.locator('.kibbutz')).toHaveCount(1);
  await home.getByRole('searchbox', { name: 'חיפוש קיבוץ' }).fill('');
  await expect(home.locator('.kibbutz')).toHaveCount(7);

  // ── quick actions, עידן (22.9): 📍 סיכום ביקור + the two task adders; 🚚 and 🗓 are gone
  const card = home.locator('.kibbutz[data-name="חוקוק"]');
  await expect(card.getByRole('button', { name: 'סיכום ביקור' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'תעודת משלוח' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'ישיבות' })).toHaveCount(0);
  await expect(card.getByTestId('add-ems-task')).toBeVisible();
  await expect(card.getByTestId('add-internal-task')).toBeVisible();
  // the ✏️ moved inside the kibbutz card (modal), עידן only — nothing on the home card
  await expect(card.locator('button[title="פרטי קיבוץ"]')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('home cards: viewer gets no action row at all', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });

  const card = page.locator('#sigma-home .kibbutz[data-name="חוקוק"]');
  await expect(card.getByRole('button', { name: 'ישיבות' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'סיכום ביקור' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'תעודת משלוח' })).toHaveCount(0);
  await expect(card.getByTestId('add-internal-task')).toHaveCount(0);
  // not a kibbutz admin → no edit pencil, and no "קיבוץ חדש" button
  await expect(card.locator('button[title="פרטי קיבוץ"]')).toHaveCount(0);
  await expect(page.locator('#sigma-home').getByRole('button', { name: 'קיבוץ חדש' })).toHaveCount(0);

  await shot(page, ti, 'viewer');
  expectNoConsoleErrors(rec);
});

test('home cards: a running work timer floats its kibbutz to the top section', async ({ page }, ti) => {
  // עידן, spec addendum 22.9: the TOP section is not only visit drafts — a running/paused
  // ▶/■ work timer means he is mid-visit too, whether or not he typed a draft. Seed a running
  // session on יגור (which has no visit draft in the fixtures) and expect it pinned to the
  // top, with the section title switching to mention the timer.
  const running = { person: 'עידן', kibbutz: 'יגור', started_at: new Date().toISOString() };
  const { rec } = await boot(page, ti, { storage: { sigma_clockify_running_v1: JSON.stringify({ עידן: running }) } });

  const top = page.locator('#sigma-home').getByRole('heading', { name: '✍️ טיוטות ושעון פעיל' });
  await expect(top).toBeVisible();

  // the card itself sits inside the top section, and its own ▶/■ chip already shows "running".
  const topSection = top.locator('xpath=ancestor::section');
  await expect(topSection.locator('.kibbutz[data-name="יגור"]')).toBeVisible();
  await expect(topSection.locator('.kibbutz[data-name="יגור"]').getByTestId('work-timer-stop')).toBeVisible();

  await shot(page, ti, 'timer-at-top');
  expectNoConsoleErrors(rec);
});

test('home cards: a team member sees the actions but not the admin affordances', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  const card = page.locator('#sigma-home .kibbutz[data-name="חוקוק"]');
  await expect(card.getByRole('button', { name: 'סיכום ביקור' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'תעודת משלוח' })).toHaveCount(0);   // 22.9: inside the visit only
  await expect(card.getByTestId('add-internal-task')).toBeVisible();
  // אביאם is not in KIBBUTZ_ADMINS (עידן · עמיחי) — and since 22.9 nobody has a ✏️ on the home card
  await expect(card.locator('button[title="פרטי קיבוץ"]')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('home cards: "ℹ️ מקרא צבעים והסבר הלחצנים" is gone (Package O §2)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await expect(page.getByText('מקרא צבעים והסבר הלחצנים')).toHaveCount(0);
  await expect(page.locator('.legend-collapsible')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('home cards: "המשימות הפנימיות שלי" is a fixed, collapsible strip above the bottom bar (Package O §4)', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);

  // Add an internal task with no owner picked — it defaults to whoever adds it (עידן here),
  // so it lands in his own "היום שלי" strip.
  const card = page.locator('#sigma-home .kibbutz[data-name="חוקוק"]');
  await card.getByTestId('add-internal-task').click();
  const sheet = page.getByTestId('internal-task-sheet');
  await sheet.locator('#itTitle').fill('לבדוק את הגנרטור');
  await sheet.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(sheet).toHaveCount(0);

  const strip = page.locator('#sigma-my-tasks .my-tasks-strip');
  await expect(strip).toBeVisible();
  // Collapsed by default (עידן 22.9: the open list sat on top of every page's scroll) — one
  // line with the count, and the page reserves room under itself for it.
  await expect(strip).toContainText('1 משימות פנימיות שלי');
  await expect(strip.getByText('לבדוק את הגנרטור')).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/has-my-tasks/);
  await strip.locator('.my-tasks-toggle').click();
  await expect(strip).toContainText('לבדוק את הגנרטור');

  if (viewport === 'mobile-390') {
    // fixed above the bottom bar, not buried at the bottom of the page flow
    await expect(strip).toHaveCSS('position', 'fixed');
    const stripBox = await strip.boundingBox();
    const navBox = await page.locator('#sigma-nav nav').boundingBox();
    // "above the bottom bar": the strip starts higher up the screen than the nav does.
    expect(stripBox && navBox && stripBox.y < navBox.y).toBeTruthy();
  }

  // collapsed = one line "🔒 N משימות פנימיות שלי", and it survives a reload (per-device state)
  await strip.getByRole('button', { name: 'המשימות הפנימיות שלי' }).click();
  await expect(strip).toContainText('1 משימות פנימיות שלי');
  await expect(strip.getByText('לבדוק את הגנרטור')).toHaveCount(0);
  await shot(page, ti, 'collapsed');

  await page.reload();
  const stripAfterReload = page.locator('#sigma-my-tasks .my-tasks-strip');
  await expect(stripAfterReload).toContainText('1 משימות פנימיות שלי');
  await expect(stripAfterReload.getByText('לבדוק את הגנרטור')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});
