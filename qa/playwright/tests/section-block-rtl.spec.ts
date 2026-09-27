// SectionBlock's non-flush body geometry (design-system spec §2 "SectionBlock") — regression
// test for the RTL clipping bug fixed in section-block.tsx: the body's full-bleed wrapper used
// a symmetric `-mx-4` (physical margin), which under this app's RTL document direction anchored
// the widened box at the section's PADDED content edge instead of its OUTER edge, silently
// clipping ~30px off every row's inline-start/right side (field-ops real-phone report 27.9).
// Fixed with logical `-ms-4 -me-4` + an explicit `w-[calc(100%+2rem)]`.
//
// This spec proves the geometry directly against `/?gallery=1`'s "ListRow" SectionBlock (a
// plain non-flush SectionBlock with real ListRow children) at the 360 floor, in RTL: a row's
// rect must span the SAME inline extent as the section's own outer box — no gap, no clip, on
// either side.
import { boot, expect, test, type Who } from './_helpers';

test.describe('SectionBlock non-flush body geometry (RTL, 360)', () => {
  test('row spans the section\'s full outer width, no clip on either side', async ({ page }, ti) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await boot(page, ti, { who: 'עידן' as Who, query: 'gallery=1', ready: '[data-testid="gallery-root"]' });
    await expect(page.getByTestId('gallery-root')).toBeVisible({ timeout: 20_000 });

    const rects = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('[data-testid="gallery-root"] section'));
      const section = sections.find(s => s.textContent?.includes('ListRow')) as HTMLElement | undefined;
      if (!section) return null;
      const row = section.querySelector('[data-testid], button, a, div > div') as HTMLElement | null;
      // The section's own first ListRow (rendered as a button when it has an onClick).
      const rowEl = section.querySelector('button') as HTMLElement | null;
      const s = section.getBoundingClientRect();
      const r = (rowEl || row)!.getBoundingClientRect();
      return {
        section: { left: s.left, right: s.right },
        row: { left: r.left, right: r.right },
      };
    });

    expect(rects, 'gallery ListRow SectionBlock not found').not.toBeNull();
    // Sub-pixel rounding tolerance only (+1) — never a real allowance for clipping. Before the
    // fix this failed by ~30px on the inline-start/right side under RTL.
    expect(Math.abs(rects!.row.left - rects!.section.left), `row.left ${rects!.row.left} vs section.left ${rects!.section.left}`).toBeLessThanOrEqual(1);
    expect(Math.abs(rects!.row.right - rects!.section.right), `row.right ${rects!.row.right} vs section.right ${rects!.section.right}`).toBeLessThanOrEqual(1);
  });
});
