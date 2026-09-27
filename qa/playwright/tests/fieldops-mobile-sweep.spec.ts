// פעולות שטח → קריאת מודבוס — phone-width overlap/overflow sweep (עידן, real-phone report
// 27.9: "the page is CUT OFF — can't see all the content, in the selection/navigation part AND
// in the results"). This is a DEDICATED sweep (not folded into no-overlap.spec.ts's SCREENS list,
// which only ever samples 390/360/412/430 and only in light except at its own native project)
// because the report demands every one of 360/375/390/412/430 × light/dark, plus his own
// phone's 360×740 / 384×854 — widths and heights the shared matrix does not cover. It reuses the
// same scanOverlap/assertNoOverflow machinery every other sweep uses; nothing new is invented.
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';
import { scanOverlap } from './_overlap';

// Evidence for this sweep lives in its own folder (task instruction), not the shared
// qa/playwright/shots/<spec>/ tree shot() writes to — one file per state × width × theme.
const EVIDENCE_DIR = resolve(__dirname, '..', '..', 'evidence', 'fieldops');
async function captureEvidence(page: Page, name: string): Promise<void> {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: resolve(EVIDENCE_DIR, `${name}.png`) });
}

const EMS = { ems_token_v1: 'qa-ems-token', ems_token_at_v1: String(Date.now()) };
const SITE = '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const M3 = '33333333-3333-4333-8333-333333333333';

const meter = (id: string, ip: string, unit: string, serial: string, address: string, o: any = {}) => ({
  id, serialNumber: serial, address, ipAddress: ip, deviceNumber: unit,
  currentMultiplier: '1.0000', voltageMultiplier: '1.0000', powerMultiplier: '1.0000',
  site: { id: SITE, name: 'קיבוץ דוגמה עם שם ארוך מאוד לבדיקת גלישה' },
  type: { code: 12, key: 'pm135', name: 'Satec PM135', powerMultiplier: '1.0000' },
  lastTransmission: { callDate: '2026-09-27T09:30:00.000Z', goodRow: true }, ...o,
});
// Two circuits sharing the SAME ip+unit — the fixture no other spec builds — so the sweep can
// see ReadCards' "multi-circuit" branch (one SectionBlock per circuit) on a real narrow screen.
const CIRCUIT_A = meter(M1, '192.0.2.10', '1', '16720051239859', 'רפת מספר 1 — הענף הצפוני הארוך');
const CIRCUIT_B = meter(M2, '192.0.2.10', '1', '1557654', 'לול', { currentMultiplier: '200.0000', type: { code: 25, name: 'ABB B23/B24', powerMultiplier: '1' } });
const SITE_METERS = [CIRCUIT_A, CIRCUIT_B];
const LOOKUP: Record<string, any[]> = {
  '192.0.2.10': [CIRCUIT_A, CIRCUIT_B],
  '192.0.2.30': [meter(M1, '192.0.2.30', '1', '1239859-1', 'מבנה א'), meter(M3, '192.0.2.30', '2', '1239860', 'מבנה ב')],
};
const log = (responseData: unknown, o: any = {}) => ({
  id: 'L' + Math.random(), operationCode: 'modbus_read', status: 'completed', responseData, errorMessage: null,
  createdAt: '2026-09-27T10:00:00Z', completedAt: '2026-09-27T10:00:04Z', executedBy: 'עידן', ...o,
});
const G1 = [{ CounterNumber: '1672005', FT: 169404, V1: 235, V2: 234, V3: 234, I1: 166, I2: 139, I3: 113, PF: 1000, CT_Ratio: 0 }];
const G2 = [{ CounterNumber: '1557654', FT: 17127.221, V1: 229.7, V2: 229.5, V3: 230.1, I1: 0.56, I2: 0.42, I3: 0.54, PF: -0.866 }];
const HIST = [log(G1, { id: 'h1' }), log(G2, { id: 'h2', operationCode: 'modbus_ping', status: 'completed' }), log([null], { id: 'h3', status: 'completed' })];

type Handler = (b: any) => { status?: number; body: unknown };
async function stubFieldOps(page: Page, read: Handler = () => ({ body: {} })) {
  await page.route('**/functions/v1/field-ops', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    const b = JSON.parse(route.request().postData() || '{}');
    let r: { status?: number; body: unknown };
    if (b.mode === 'meters') r = { body: { meters: SITE_METERS } };
    else if (b.mode === 'lookup') r = { body: { meters: LOOKUP[b.ip] || [] } };
    else if (b.mode === 'history') r = { body: { logs: HIST } };
    else r = read(b);
    return route.fulfill({ status: r.status ?? 200, contentType: 'application/json', body: JSON.stringify(r.body) });
  });
}

async function openFieldOps(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).sigma;
    s.getEmsSites = async () => [{ id: '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', name: 'קיבוץ דוגמה עם שם ארוך מאוד לבדיקת גלישה' }];
    (window as any).showPage('fieldops');
  });
  await expect(page.getByTestId('fieldops-page')).toBeVisible({ timeout: 20_000 });
}

async function pickListMeter(page: Page, id: string) {
  await page.getByLabel('בחר קיבוץ *').selectOption(SITE);
  const sel = page.getByLabel('בחר מונה');
  await expect(sel.locator(`option[value="${id}"]`)).toBeAttached({ timeout: 10_000 });
  await sel.selectOption(id);
}

async function manual(page: Page, ip: string, unit = '') {
  await page.getByRole('radio', { name: 'הזנה ידנית' }).click();
  await page.getByLabel('כתובת IP *').fill(ip);
  if (unit) await page.getByLabel('מספר ID').fill(unit);
  return page.getByTestId('fieldops-ip-status');
}

const readBtn = (page: Page) => page.getByRole('button', { name: /בדוק חיבור וקרא נתונים/ });

// The report's own widths (360/375/390/412/430 — the binding phone range) plus his two exact
// device sizes (360×740, 384×854 — narrower/taller than anything the shared matrix samples).
const SIZES: Array<{ width: number; height: number }> = [
  { width: 360, height: 740 },
  { width: 360, height: 780 },
  { width: 375, height: 812 },
  { width: 384, height: 854 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
];
const THEMES = ['light', 'dark'] as const;

interface State {
  label: string;
  open: (page: Page) => Promise<void>;
}

const STATES: State[] = [
  { label: 'hub', open: async p => { await openFieldOps(p); } },
  {
    label: 'list-multi-circuit',
    open: async p => {
      await openFieldOps(p);
      await pickListMeter(p, M1);
      await readBtn(p).click();
      await expect(p.getByTestId('fieldops-read').first()).toBeVisible();
    },
  },
  {
    label: 'manual-0-matches',
    open: async p => { await openFieldOps(p); await manual(p, '192.0.2.99', '4'); },
  },
  {
    label: 'manual-1-match',
    open: async p => { await openFieldOps(p); await manual(p, '192.0.2.30', '1'); await p.getByTestId('fieldops-ip-table').waitFor(); },
  },
  {
    label: 'manual-several-matches',
    open: async p => { await openFieldOps(p); await manual(p, '192.0.2.10', '1'); await p.getByTestId('fieldops-ip-table').waitFor(); },
  },
  {
    label: 'read-error',
    open: async p => {
      await openFieldOps(p);
      await pickListMeter(p, M1);
      await readBtn(p).click();
      await expect(p.getByTestId('fieldops-error')).toBeVisible();
    },
  },
];

/** Every visible TEXT node's box must sit inside the viewport's own horizontal bounds (עידן's
    "can't see all the content" report) — a stronger, page-wide version of scanOverlap's rule 2
    (which only checks scrollWidth>clientWidth on the node's OWN box, and only inside `root`). A
    text node can be fully clipped by an ancestor's `overflow:hidden` (SectionBlock's collapse
    wrapper) without ever growing its own scrollWidth, which is exactly how content silently goes
    missing instead of scrolling — this catches that case too. */
async function assertAllTextVisible(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const w = window.innerWidth;
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const text = (n.textContent || '').trim();
      if (!text) continue;
      const el = n.parentElement;
      // #sidePanel is a legacy off-canvas drawer (position:fixed, `right:-100%` until `.open`)
      // — parked off-screen by design, the same exemption no-page-overflow.spec.ts's own
      // assertEveryElementInViewport already carries; it is not this page's own chrome.
      if (!el || el.closest('.sr-only, [aria-hidden="true"], #sidePanel')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = Array.from(range.getClientRects());
      for (const r of rects) {
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.bottom < 0 || r.top > window.innerHeight + 4000) continue; // off-screen (scrolled)
        if (r.right > w + 2 || r.left < -2) {
          out.push(`"${text.slice(0, 30)}": left ${Math.round(r.left)} right ${Math.round(r.right)} (viewport ${w})`);
          break;
        }
      }
      if (out.length >= 10) break;
    }
    return out;
  });
  expect(offenders, `text spilling outside the ${await page.evaluate(() => window.innerWidth)}px viewport:\n${offenders.join('\n')}`).toEqual([]);
}

/** scanOverlap's rule 2 already catches scrollWidth>clientWidth on the node itself; this adds
    the page-scoped, all-elements version (not just leaf text nodes) so a wrapper div that grew
    past its own box — the ip-table/rows tables' real risk on a phone — is caught even when no
    single leaf element's own scrollWidth trips. Any element carrying `data-scroll-x` is a
    declared horizontal-scroll container (the fix below) and is exempt. */
async function assertNoElementOverflowsExceptScrollers(page: Page, label: string): Promise<void> {
  const offenders = await page.evaluate(() => {
    const out: string[] = [];
    // Scoped to the fieldops page's own root — the shared header/nav chrome (title truncation,
    // the alerts bell) is pre-existing, not owned by this page, and out of scope here (the same
    // reasoning no-overlap.spec.ts's own `root` option documents for the gallery screen).
    const root = document.querySelector('[data-testid="fieldops-page"]') || document.body;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const he = el as HTMLElement;
      if (he.closest('[data-scroll-x]')) continue;
      if (he.closest('.sr-only, [aria-hidden="true"]')) continue;
      // `data-truncate` (SegmentedControl, KV values, …) is the app's own declared ellipsis
      // escape hatch (_overlap.ts rule 2 grants the same exemption) — CSS `truncate` clips the
      // overflow visually on purpose; scrollWidth still (correctly) reports the untruncated text.
      if (he.closest('[data-truncate]')) continue;
      if (he.scrollWidth > he.clientWidth + 2 && he.clientWidth > 0) {
        const name = he.getAttribute('data-testid') || (he.textContent || '').trim().slice(0, 30) || he.tagName.toLowerCase();
        out.push(`${he.tagName.toLowerCase()}"${name}": scrollWidth ${he.scrollWidth} > clientWidth ${he.clientWidth}`);
      }
    }
    return out.slice(0, 10);
  });
  expect(offenders, `${label}: element(s) overflow their own box (not a declared [data-scroll-x] container):\n${offenders.join('\n')}`).toEqual([]);
}

test.describe('fieldops mobile sweep', () => {
  for (const theme of THEMES) {
    for (const state of STATES) {
      test(`fieldops ${state.label} @ every phone width (${theme})`, async ({ page }, ti) => {
        const { rec } = await boot(page, ti, { who: 'עידן', storage: { ...EMS, theme } });
        await stubFieldOps(page, b => {
          if (b.mode !== 'read') return { body: {} };
          // `[null]` (not a 504): a 504 surfaces as the top-level `fieldops-message` banner
          // (field-ops.spec.ts's own "timeout" case) — the inline `fieldops-error` ReadCards
          // renders is the "device answered but the reading is unusable" outcome instead.
          if (state.label === 'read-error') return { body: { meter: CIRCUIT_A, override: [], log: log([null]) } };
          if (b.meterId === M1 || (b.ip === '192.0.2.10')) return { body: { meter: CIRCUIT_A, override: [], log: log(G1) } };
          return { body: { meter: null, override: ['meterIpAddress'], log: log(G1) } };
        });
        await state.open(page);

        for (const size of SIZES) {
          await page.setViewportSize(size);
          await page.waitForTimeout(150);
          const label = `fieldops ${state.label} @ ${size.width}x${size.height}/${theme}`;
          const report = await scanOverlap(page, label, { root: '[data-testid="fieldops-page"]' });
          // rule1 (page-level horizontal scroll) is a hard fail everywhere in this repo's sweeps
          // (no-overlap.spec.ts's own rule); every other overlap rule is a hard fail here too —
          // this is a brand-new, purpose-built sweep with no allow-list, so nothing is waived.
          expect(report.violations, `${label}:\n    ` + report.violations.join('\n    ')).toEqual([]);
          await assertAllTextVisible(page);
          await assertNoElementOverflowsExceptScrollers(page, label);
          await captureEvidence(page, `${state.label}-${size.width}x${size.height}-${theme}`);
        }

        expectNoConsoleErrors(rec);
      });
    }
  }
});
