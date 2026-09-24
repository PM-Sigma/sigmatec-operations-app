// Reusable overlap-detection helper for qa/playwright/tests/no-overlap.spec.ts (design-system
// spec docs/superpowers/specs/2026-09-23-design-system-design.md §3 "Rules that prevent
// overlap"). Runs entirely inside the page (one evaluate call) so it works the same on the
// legacy DOM and on a React island, and needs nothing the app doesn't already expose.
//
// What it checks, on whatever is currently rendered:
//   1. the page never scrolls sideways (`scrollingElement.scrollWidth <= innerWidth + 1`) — the
//      one rule no-overlap.spec.ts never lets an allow-list entry waive (designer confirm round,
//      N4a: a page scrolling sideways is real, whatever else about the screen is known-broken);
//   2. no text-bearing LEAF element overflows its box (`scrollWidth > clientWidth + 1`), unless
//      it (or an ancestor) carries `data-truncate` — the escape hatch `<Text>` sets;
//   3. every visible interactive element clears a 48×48 hit area (design-review.md's 360–430
//      update), unless it carries `data-min-tap="44"` (DayCell, the one named exception — seven
//      columns only fit 45px cells at 360) or `data-hit-slop` (a visual under even that, with
//      hit-slop making up the rest);
//   4. no two visible interactive/text boxes intersect by more than 2px on both axes —
//      ancestor/descendant pairs (a label wrapping its input, an icon inside its own button)
//      are not a collision and are skipped;
//   5. an interactive element inside a `<section>` card (SectionBlock) stays inside that card's
//      own box (designer confirm round, N4c) — how DayCell bled past its card went uncaught.
// `.sr-only` content is ignored throughout (noise the audit itself flagged: "the 'Close' and
// the h2 clientWidth=1 hits are that kind of noise").
import path from 'node:path';
import type { Page } from '@playwright/test';

export interface OverlapReport {
  label: string;
  violations: string[];
}

const AXE_PATH = path.resolve(__dirname, '..', '..', '..', 'node_modules', 'axe-core', 'axe.min.js');

/**
 * axe-core, injected fresh per screen (tools-and-motion.md §1 "Accessibility / contrast" —
 * "axe-core injected into the Playwright sweep with addScriptTag. No new dependency"). Only
 * serious/critical violations fail the gate here, matching the sign-off bar in §4 ("axe has 0
 * serious or critical issues"); moderate/minor are logged but never block, the same way a
 * known-failing screen logs its overlap violations instead of failing on them.
 */
export async function scanA11y(page: Page, label: string, opts: { root?: string } = {}): Promise<OverlapReport> {
  await page.addScriptTag({ path: AXE_PATH });
  // Same scoping rationale as scanOverlap's `root`: the gallery screen should be judged on its
  // OWN primitives, not on legacy header/nav/FAB chrome every other screen already carries (and
  // already tracks via its own allow-list entry).
  const results = await page.evaluate(rootSel => {
    const ctx = rootSel ? document.querySelector(rootSel) : undefined;
    return (window as any).axe.run(ctx || document);
  }, opts.root || '');
  const blocking = (results.violations || []).filter((v: any) => v.impact === 'serious' || v.impact === 'critical');
  const violations = blocking.map((v: any) =>
    `axe ${v.impact} [${v.id}] ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'}): `
    + v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')).join(', '));
  return { label, violations };
}

export async function scanOverlap(page: Page, label: string, opts: { root?: string } = {}): Promise<OverlapReport> {
  const violations = await page.evaluate(({ rootSel }) => {
    const out: string[] = [];
    // `rootSel` (e.g. gallery's own `[data-testid="gallery-root"]`) scopes rules 2–4 to a
    // subtree: the point of the /?gallery=1 screen is to prove the NEW primitives are clean on
    // their own, without every OTHER screen's shared legacy header/nav/FAB chrome (its own
    // pre-existing bugs — already tracked by every other screen's allow-list entry) leaking in
    // and making a screen built entirely from this package's components impossible to pass
    // without one too. Rule 1 (page-level horizontal scroll) always checks the whole document.
    const root: ParentNode = rootSel ? (document.querySelector(rootSel) || document) : document;

    const describe = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      const name = el.getAttribute('aria-label') || (el as HTMLElement).innerText?.trim().slice(0, 24) || el.id || '';
      return `${tag}${name ? `"${name}"` : ''}`;
    };
    const isNoise = (el: Element) => !!el.closest('.sr-only, [aria-hidden="true"]');
    const isVisible = (el: Element): { ok: boolean; r: DOMRect } => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return { ok: false, r };
      const cs = getComputedStyle(el as HTMLElement);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return { ok: false, r };
      if (r.bottom < 0 || r.top > window.innerHeight + 4000) return { ok: false, r }; // far off-screen
      return { ok: !isNoise(el), r };
    };

    // 1. no horizontal page scroll — always checked against the WHOLE document regardless of
    // `root` (a scoped scan still can't tolerate the page itself scrolling sideways), and
    // prefixed "[rule1]" so no-overlap.spec.ts can refuse to let an allow-list entry waive it.
    const scroller = document.scrollingElement || document.documentElement;
    if (scroller.scrollWidth > window.innerWidth + 1) {
      out.push(`[rule1] page scrolls sideways: scrollWidth ${scroller.scrollWidth} > innerWidth ${window.innerWidth}`);
    }

    // 2. text overflow on leaf elements
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el.children.length > 0) continue;
      const text = (el.textContent || '').trim();
      if (!text || isNoise(el)) continue;
      if (el.closest('[data-truncate]')) continue;
      const he = el as HTMLElement;
      if (he.scrollWidth > he.clientWidth + 1) {
        out.push(`text overflow "${text.slice(0, 30)}": scrollWidth ${he.scrollWidth} > clientWidth ${he.clientWidth}`);
      }
    }

    // 3 + 4. interactive elements — hit size, then pairwise overlap
    const SEL = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const boxes: Array<{ el: Element; r: DOMRect }> = [];
    for (const el of Array.from(root.querySelectorAll(SEL))) {
      const { ok, r } = isVisible(el);
      if (!ok) continue;
      boxes.push({ el, r });
      // design-review.md (360–430 update): the floor is 48×48; DayCell is the one named
      // exception, at 44 (seven columns only fit 45px cells at 360) — it marks itself with
      // `data-min-tap="44"`. `data-hit-slop` stays as a general escape hatch for a visual under
      // even that, with hit-slop making up the rest.
      const floor = Number(el.getAttribute('data-min-tap')) || 48;
      if ((r.width < floor - 1 || r.height < floor - 1) && !el.hasAttribute('data-hit-slop') && !(el as HTMLButtonElement).disabled) {
        out.push(`tap target under ${floor}×${floor}: ${describe(el)} is ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    // A `position: fixed` persistent-chrome element (the bottom nav, #sigma-nav) is SUPPOSED to
    // sit visually on top of whatever page content is currently scrolled underneath its band —
    // that is what a fixed bottom nav is, on every phone OS, not a layout defect. Without a
    // scroll simulation this sweep only ever samples scrollTop=0, so on any screen with enough
    // content to exceed one viewport, some normal-flow element will coincidentally land in the
    // nav's fixed y-band purely because of how tall the page happens to be up to that point —
    // that says nothing about whether THAT element's own box collides with a sibling, which is
    // what rule 4 exists to catch. Skip pairs that cross the fixed-chrome boundary; a pair fully
    // inside the nav (its own tabs) still gets checked.
    const inFixedChrome = (el: Element) => !!el.closest('#sigma-nav');
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (inFixedChrome(a.el) !== inFixedChrome(b.el)) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 2 && iy > 2) {
          out.push(`overlap (${Math.round(ix)}×${Math.round(iy)}px): ${describe(a.el)} × ${describe(b.el)}`);
        }
      }
    }

    // 5. card containment (designer confirm round, N4c): an interactive element inside a
    // SectionBlock (`<section>`) must stay inside that section's own box. This is scoped to
    // `<section>` specifically — the one card wrapper the new primitives actually use — rather
    // than every div styled like a card, so it can't misfire on legacy markup this package never
    // touched.
    for (const { el, r } of boxes) {
      const card = el.closest('section');
      if (!card) continue;
      const cr = (card as HTMLElement).getBoundingClientRect();
      const EPS = 1;
      if (r.left < cr.left - EPS || r.right > cr.right + EPS || r.top < cr.top - EPS || r.bottom > cr.bottom + EPS) {
        out.push(`escapes its card: ${describe(el)} at (${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)}) outside section (${Math.round(cr.left)},${Math.round(cr.top)})-(${Math.round(cr.right)},${Math.round(cr.bottom)})`);
      }
    }
    return out;
  }, { rootSel: opts.root || '' });
  return { label, violations };
}

/**
 * Fixed-nav safe area (designer confirm round, N4b): scrolls the page all the way down, then
 * checks that no normal-flow interactive element (the nav's OWN children are exempt) overlaps
 * the fixed bottom nav's box — covering both "the last content ends above the nav" and "nothing
 * interactive sits under the FAB" in one check, since the FAB is itself one of the nav's
 * children and this checks the nav's whole bounding box. Rule 4's own pairwise check
 * deliberately skips nav-crossing pairs (a fixed nav legitimately sits over whatever scrolls
 * under it mid-scroll) — this is the targeted replacement for the ONE position that actually
 * matters: fully scrolled to the end, where nothing should still be hidden behind it.
 */
export async function scanNavSafeArea(page: Page, label: string): Promise<OverlapReport> {
  const violations = await page.evaluate(() => {
    const out: string[] = [];
    const nav = document.querySelector('#sigma-nav') as HTMLElement | null;
    if (!nav) return out;
    const scroller = document.scrollingElement || document.documentElement;
    scroller.scrollTop = scroller.scrollHeight;
    const navRect = nav.getBoundingClientRect();
    if (navRect.width === 0 || navRect.height === 0) return out; // desktop: nav hidden (md:hidden)

    const isNoise = (el: Element) => !!el.closest('.sr-only, [aria-hidden="true"]');
    const SEL = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    for (const el of Array.from(document.querySelectorAll(SEL))) {
      if (el.closest('#sigma-nav')) continue; // the nav's own tabs/FAB live inside it
      if (isNoise(el)) continue;
      const he = el as HTMLElement;
      const r = he.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(he);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      const ix = Math.min(r.right, navRect.right) - Math.max(r.left, navRect.left);
      const iy = Math.min(r.bottom, navRect.bottom) - Math.max(r.top, navRect.top);
      if (ix > 2 && iy > 2) {
        const tag = el.tagName.toLowerCase();
        const name = el.getAttribute('aria-label') || he.innerText?.trim().slice(0, 24) || '';
        out.push(`content under the fixed nav after scrolling to the bottom: ${tag}${name ? `"${name}"` : ''}`);
      }
    }
    return out;
  });
  return { label, violations };
}

/** Extra widths behind NIGHTLY=1 (spec §3 "widths 390 and 1440 on every build, 1920/2560/3840
    behind an env flag"). */
export const NIGHTLY_WIDTHS = [1920, 2560, 3840];

/** Phone widths checked on every build (עידן 23.9: "phones must be perfect across the range") —
    Galaxy S24 (smallest, 360), the plain 390 baseline, S24 Ultra (412) and an iPhone Pro Max
    (430). Run from one canonical mobile project (no-overlap.spec.ts), not all of them, so the
    sweep doesn't redo the same four widths per mobile project for no extra coverage. */
export const PHONE_WIDTHS = [360, 390, 412, 430];
