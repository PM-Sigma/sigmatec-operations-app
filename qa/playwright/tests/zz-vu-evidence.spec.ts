// Round 5 · V-U4 designer evidence (spec docs/superpowers/specs/2026-09-23-r5-V-visit.md) —
// the visit summary sheet, the ביקורים tab and their toasts/prompts. Not part of the
// correctness gate (visit-chapters.spec.ts / kibbutz-detail.spec.ts own that) — this file only
// produces qa/evidence/V-U/*.png for the designer, at the two phone widths the handoff asked
// for, light + dark. Run under mobile-390-light / mobile-390-dark (the only two projects with
// both a real storage `theme` and enough headroom to resize into); each test resizes into 360
// and 412 after boot so the SAME theme/localStorage setup produces both sizes. Every capture
// also asserts no horizontal page overflow at that width, as the release note asked.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { boot, expect, test } from './_helpers';

const OUT = path.resolve(__dirname, '..', '..', 'evidence', 'V-U');
mkdirSync(OUT, { recursive: true });

const WIDTHS: Array<{ w: number; h: number }> = [{ w: 360, h: 780 }, { w: 412, h: 915 }];

/** No element's right/left edge sits outside the viewport, and the document itself never scrolls sideways. */
async function expectNoPageOverflow(page: Page, w: number): Promise<void> {
  const overflowing = await page.evaluate((width: number) => {
    const doc = document.scrollingElement as HTMLElement;
    const bad: string[] = [];
    if (doc && doc.scrollWidth > width + 1) bad.push('document');
    // #sidePanel is a pre-existing off-canvas legacy drawer, unrelated to this screen (see
    // zz-cu-evidence.spec.ts's own note on the same false positive) — excluded here too.
    // The sonner `.toaster` region is a fixed-position container the library sizes to its
    // widest POSSIBLE toast, including ones sliding off-screen mid-animation — not a page
    // layout bug, so it is excluded the same way.
    document.querySelectorAll<HTMLElement>('body *').forEach(el => {
      if (el.closest('#sidePanel') || el.closest('.toaster') || el.classList.contains('toaster')) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > width + 1 || r.left < -1)) {
        const id = el.id || el.className || el.tagName;
        if (bad.length < 5) bad.push(String(id).slice(0, 60));
      }
    });
    return bad;
  }, w);
  expect(overflowing, 'elements overflowing the ' + w + 'px viewport: ' + overflowing.join(', ')).toEqual([]);
}

async function openArrivalVisit(page: Page): Promise<void> {
  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();
  await page.getByTestId('brief-visit').click();
  await expect(page.getByTestId('visit-chapters')).toBeVisible({ timeout: 10_000 });
}

test.describe('V-U evidence captures', () => {
  test.beforeEach(({}, ti) => {
    test.skip(!['mobile-390-light', 'mobile-390-dark'].includes(ti.project.name), 'one run per theme is enough');
  });

  for (const { w, h } of WIDTHS) {
    test(`visit sheet: new, multi-visitor + contact chips @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
      await page.setViewportSize({ width: w, height: h });
      await openArrivalVisit(page);

      const who = page.getByTestId('visit-visitors');
      await who.getByTestId('vc-visitor-ניתאי').click();
      await page.getByTestId('vc-summary').fill('הוחלף מונה, סוכם המשך מול גפן');
      await page.getByTestId('vc-hours-2').click();
      await page.getByTestId('vc-contact').fill('גפן');
      await expect(page.getByTestId('visit-chapters')).toBeVisible();

      await expectNoPageOverflow(page, w);
      await page.screenshot({ path: path.join(OUT, `visit-sheet-new__${w}__${theme}.png`) });
    });

    test(`visit sheet: draft + cancel prompt @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
      await page.setViewportSize({ width: w, height: h });
      await openArrivalVisit(page);

      await page.getByTestId('vc-summary').fill('התחלתי לכתוב ואז קראו לי');
      // round 5 V-L7 (grill round 2 "Drafts rule 2"): a scrim tap on real input asks the
      // ruling's own two-button question.
      await page.mouse.click(5, 5);
      await expect(page.getByTestId('unsaved-guard')).toBeVisible();

      await expectNoPageOverflow(page, w);
      await page.screenshot({ path: path.join(OUT, `visit-sheet-cancel-prompt__${w}__${theme}.png`) });
    });

    test(`ביקורים tab: history + draft row @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'אביאם' });
      await page.setViewportSize({ width: w, height: h });
      await page.waitForSelector('#sigma-home .kibbutz[data-name="חוקוק"]');
      await page.evaluate(() => (window as any).sigma.visitDraftPut({
        id: 'v_ev', person: 'אביאם', kibbutz: 'חוקוק',
        date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(), payload: { summary: 'x' },
      }));
      await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק', 'visits'));
      const detail = page.locator('[data-testid="kibbutz-detail"]');
      await expect(detail).toBeVisible({ timeout: 15_000 });
      await expect(detail.getByTestId('visit-draft-row')).toBeVisible();

      await expectNoPageOverflow(page, w);
      await page.screenshot({ path: path.join(OUT, `visits-tab-history-draft__${w}__${theme}.png`) });
    });

    test(`visit save: the toast @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
      await page.setViewportSize({ width: w, height: h });
      await openArrivalVisit(page);

      await page.getByTestId('vc-summary').fill('נבדק מונה, הכול תקין');
      await page.getByTestId('vc-hours-2').click();
      await page.getByTestId('vc-contact').fill('יוסי מהמחלבה');
      await page.getByTestId('vc-reason-fault').click();
      await page.getByTestId('vc-send').click();
      await expect(page.getByTestId('visit-chapters')).toBeHidden({ timeout: 15_000 });
      await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 15_000 });

      await expectNoPageOverflow(page, w);
      await page.screenshot({ path: path.join(OUT, `visit-save-toast__${w}__${theme}.png`) });
    });

    test(`visit save: the attendance conflict question @ ${w}`, async ({ page }, ti) => {
      const { theme } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
      await page.setViewportSize({ width: w, height: h });
      // an existing MANUAL office row for today, for אביאם — a field-day save that day must
      // ask before overwriting it (rule 2), never overwrite silently.
      const today = new Date().toISOString().slice(0, 10) + 'T09:00:00.000Z';
      await page.evaluate((iso: string) => {
        const w = window as any;
        w.SHEET_DATA = w.SHEET_DATA || {};
        w.SHEET_DATA.attendance = [
          ...(w.SHEET_DATA.attendance || []),
          { id: 'att-conflict-ev', person: 'אביאם', date: iso, dayType: 'office', source: 'manual' },
        ];
      }, today);
      await openArrivalVisit(page);

      await page.getByTestId('vc-summary').fill('נבדק מונה, הכול תקין');
      await page.getByTestId('vc-hours-2').click();
      await page.getByTestId('vc-contact').fill('יוסי מהמחלבה');
      await page.getByTestId('vc-reason-fault').click();
      await page.getByTestId('vc-send').click();
      await expect(page.getByTestId('visit-chapters')).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText('לשנות לשטח?')).toBeVisible({ timeout: 15_000 });

      await expectNoPageOverflow(page, w);
      await page.screenshot({ path: path.join(OUT, `visit-save-attendance-conflict__${w}__${theme}.png`) });
    });
  }
});
