// The visit form (spec §3.3 desk contract, §5 cert rules, §5.1c drafts).
//
// Ruling 19.9: the card's 📍 now opens the same §7p CHAPTERS sheet as briefing/gaps/nudge —
// one visit path, no separate card-only entry (see `openVisitChapters` used from
// `app/src/components/home/CardActions.tsx`). The legacy form (js/src/09-visits.js) stays
// wired only as the FALLBACK for a browser where the chapters island did not mount. The
// split-summary / cert-gate / draft-autosave / restart tests below exercise that legacy DOM
// directly through `openLegacyFormDirect` — exactly the fallback's own call
// (`sigma.openVisitQuick(kibbutz)`) — so the desk contract stays pinned even though the card
// no longer reaches it on the happy path.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

const DRAFT_KEY = 'visitDrafts_v2';

/** 📍 סיכום ביקור on a card → the §7p chapters sheet, at chapter 1, for that kibbutz. */
async function openFromCard(page: any, kibbutz: string) {
  await page.locator(`#sigma-home .kibbutz[data-name="${kibbutz}"]`)
    .getByRole('button', { name: 'סיכום ביקור' }).click();
  const chapters = page.getByTestId('visit-chapters');
  await expect(chapters).toBeVisible({ timeout: 10_000 });
  await expect(chapters).toHaveAttribute('data-chapter', '1');
  await expect(chapters).toContainText(kibbutz);
}

/** The legacy form's own fallback path (`openVisitChapters` returning false) — no card tap. */
async function openLegacyFormDirect(page: any, kibbutz: string) {
  await page.waitForSelector('#sigma-home .kibbutz');
  await page.waitForFunction(() => typeof (window as any).sigma?.openVisitQuick === 'function');
  await page.evaluate(k => (window as any).sigma.openVisitQuick(k), kibbutz);
  await expect(page.locator('#modalBackdrop')).toHaveClass(/open/);
  await expect(page.locator('#visitSummary')).toBeVisible();
}

test('visit form: 📍 on a card opens the chapters sheet in one tap, for that kibbutz', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await openFromCard(page, 'חוקוק');

  await shot(page, ti);
  expectNoConsoleErrors(rec);
});

test('visit form (legacy fallback): split summary fields, one tap, visitor pre-filled', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await openLegacyFormDirect(page, 'חוקוק');

  // one tap, no picker in between (bridge `openVisitQuick(kibbutz)`)
  await expect(page.locator('#visitQuickModal')).not.toHaveClass(/open/);
  await expect(page.locator('#modalSub')).toContainText('חוקוק');
  // the visitor is pre-filled with the person doing it
  await expect(page.locator('#visitor')).toHaveValue('אביאם');

  // ── the split: what was actually done, and what is still open for next time
  const done = page.locator('#visitSummary');
  const open = page.locator('#visitOpenItems');
  await expect(done).toHaveAttribute('placeholder', /מה נעשה בפועל/);
  await expect(open).toHaveAttribute('placeholder', /מה לא נסגר/);
  await done.fill('הוחלף המונה הראשי במחלבה ונבדקה תקשורת');
  await open.fill('חסר בקר לחלקה הדרומית — להביא בביקור הבא');
  await expect(done).toHaveValue(/הוחלף המונה/);
  await expect(open).toHaveValue(/חסר בקר/);

  await shot(page, ti);
  expectNoConsoleErrors(rec);
});

test('visit form (legacy fallback): checking a supplied product raises the 🚚 certificate gate', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await openLegacyFormDirect(page, 'חוקוק');

  // The mock sheet ships no MOVEMENTS, so nobody has stock and the product list is empty by
  // design. Seed one movement into the in-page mock (the same shape computeStock() reads) so
  // the supplied-equipment path has something to check — this is fixture data, not a UI stub.
  const source = await page.locator('#visitSource').inputValue();
  await page.evaluate(loc => {
    const w = window as any;
    w.SHEET_DATA.movements = [{ product: 'מונה Landis+Gyr E360PP', quantity: 5, fromLocation: '', toLocation: loc }];
    w.renderProductsForVisitor();
  }, source);

  const row = page.locator('#visitProducts .sig-pi').first();
  await expect(row).toBeVisible();
  // nothing supplied yet → no certificate line at all (the gate only applies to equipment)
  await expect(page.locator('#visitCertStatus')).toBeEmpty();

  await row.getByRole('button', { name: /בחר/ }).click();
  // …checked: the quantity opens at 1 and the 🚚 line appears as the unmet gate
  await expect(page.locator('#visitProducts .prod-qty').first()).toHaveValue('1');
  await expect(page.locator('#visitCertStatus')).toContainText('טרם הופקה תעודת משלוח');
  await expect(page.locator('#visitCertStatus').getByRole('button', { name: '🚚 הפק' })).toBeVisible();
  await shot(page, ti, 'cert-gate');

  // un-checking it takes the gate away again — it is a statement about the visit, not a mode
  await row.getByRole('button', { name: /בחר/ }).click();
  await expect(page.locator('#visitCertStatus')).toBeEmpty();

  expectNoConsoleErrors(rec);
});

test('visit form (legacy fallback): a draft autosaves and is offered back after a reload', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await openLegacyFormDirect(page, 'חוקוק');
  await page.locator('#visitSummary').fill('התחלתי לכתוב ואז נסעתי');

  // 800 ms debounce (DRAFT_DEBOUNCE_MS) → the localStorage mirror is what the resume prompt
  // reads, so waiting for the KEY is waiting for the real autosave, not for a timer.
  await expect.poll(
    () => page.evaluate(k => localStorage.getItem(k), DRAFT_KEY),
    { message: 'the draft mirror was never written', timeout: 10_000 },
  ).not.toBeNull();

  const stored = JSON.parse(await page.evaluate(k => localStorage.getItem(k), DRAFT_KEY) as any);
  const rows = Object.values(stored) as any[];
  expect(rows).toHaveLength(1);
  expect(rows[0].kibbutz).toBe('חוקוק');
  expect(rows[0].person).toBe('אביאם');
  expect(rows[0].payload.summary).toContain('התחלתי לכתוב');

  // ── the card says so too, before any reload (§5.1c: an open draft is visible state)
  await page.locator('#modalBackdrop .modal-close, #modalBackdrop').first().press('Escape');
  await expect(page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .tag-draft')).toContainText('סיכום ביקור בהתהוות');

  // ── a FULL reload: the draft survives in localStorage and the form offers to resume
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await openLegacyFormDirect(page, 'חוקוק');

  const prompt = page.locator('#visitDraftPrompt');
  await expect(prompt).toBeVisible();
  await expect(page.locator('#visitDraftPromptText')).toContainText('המשך טיוטה');
  await shot(page, ti, 'draft-prompt');

  await page.locator('#visitDraftContinue').click();
  await expect(page.locator('#visitSummary')).toHaveValue('התחלתי לכתוב ואז נסעתי');
  await expect(prompt).toBeHidden();

  expectNoConsoleErrors(rec);
});

test('visit form (legacy fallback): "התחל מחדש" clears the form and drops the draft', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, {
    who: 'אביאם',
    // Pre-seeded so the prompt is there on the first open — the same shape the autosave writes.
    storage: {
      [DRAFT_KEY]: JSON.stringify({
        'אביאם|חוקוק|2026-09-18': {
          id: 'v_test_1', person: 'אביאם', kibbutz: 'חוקוק', date: '2026-09-18',
          updated_at: '2026-09-18T09:00:00.000Z',
          payload: { kibbutz: 'חוקוק', visitor: 'אביאם', summary: 'טיוטה ישנה', date: '2026-09-18' },
        },
      }),
    },
  });

  await openLegacyFormDirect(page, 'חוקוק');
  await expect(page.locator('#visitDraftPrompt')).toBeVisible();

  await page.locator('#visitDraftRestart').click();
  await expect(page.locator('#visitSummary')).toHaveValue('');
  await expect(page.locator('#visitDraftPrompt')).toBeHidden();
  // the mirror no longer holds it
  const left = await page.evaluate(k => localStorage.getItem(k), DRAFT_KEY);
  expect(left === null || left === '{}').toBeTruthy();

  expectNoConsoleErrors(rec);
});
