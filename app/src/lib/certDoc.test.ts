// Goldens for the printed certificate + range report (package I, task L5). certDocHtml is
// evaluated LIVE out of the current js/src/20-delivery-cert.js (same lift-and-compare technique
// L2/L3/L4 use for 08/07-orders.js) and compared byte-for-byte against the ported version here —
// this is the printed record a customer already signed; it must never silently change shape.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSigmaInv } from '../../../scripts/sigma-inv.mjs';
import {
  CERT_COMPANY, certDocHtml, certEsc, certFmtDate, certGroupName, certIssueErrors, certItemsForView,
  certPrefill, certRange, certRangeGroups, certRangeReportHtml, certReissuePrefill, certSearch,
  certShareText, certViewUrl,
  type CertLike, type CertRow,
} from './certDoc';

const read = (p: string) => readFileSync(join(__dirname, '../../../', p), 'utf8');

/** Lifts the CURRENT js/src/20-delivery-cert.js's certDocHtml for real. CERT_LOGO is injected as
 * a parameter (the real one lives in 20-delivery-cert-logo.js, concatenated before this file in
 * the build — irrelevant to whether the REST of the template stays byte-identical). */
function legacyCertDocHtml(cert: any, opts: { screen?: boolean } | undefined, logo: string, year: number) {
  const src = read('js/src/20-delivery-cert.js') + '\nreturn certDocHtml;';
  const RealDate = Date;
  class FixedDate extends RealDate {
    getFullYear() { return year; }
  }
  // L6 (minimal): 20-delivery-cert.js's certDocHtml now DELEGATES to window.SigmaInv.certDocHtml
  // (this same certDoc.ts, compiled to an IIFE) — so `Date` mocking here no longer reaches the
  // year in the footer (SigmaInv is its own closure, not part of this `new Function` scope);
  // opts.year is passed explicitly instead, exactly like the real caller in 20-delivery-cert.js
  // would if it needed a non-current year (it never does — `new Date().getFullYear()` is the
  // legacy behaviour's own default, preserved as certDoc.ts's `opts.year ?? new Date().getFullYear()`).
  const fn = new Function('CERT_LOGO', 'Date', 'window', 'SigmaInv', src);
  const certDocHtmlLegacy = fn(logo, FixedDate as any, {}, loadSigmaInv());
  return certDocHtmlLegacy(cert, Object.assign({ year }, opts || {}));
}

const LOGO = 'data:image/png;base64,TEST';
const YEAR = 2026;

const numbered: CertLike = {
  number: 1041, date: '2026-09-02', kibbutz: 'חוקוק',
  customer: { name: 'חוקוק אגש"ח', company_id: '570000001', address: 'חוקוק', contact: 'דני' },
  items: [{ name: 'מונה Landis+Gyr E360PP', qty: 3 }], notes: '', source: 'visit', refId: 'vis-אביאם',
  recipient: '', signature: '',
};
const draft: CertLike = { number: null, date: '2026-09-20', customer: { name: 'לקוח בדיקה' }, items: [{ name: 'בקר 504', qty: 1 }], notes: 'למשל: לא לחיוב' };
const cancelled: CertLike = { number: 1042, date: '2026-09-15', customer: { name: 'דגניה' }, items: [{ name: 'בקר 504', qty: 1 }], cancelled: true, replacedBy: 1043 };
const signed: CertLike = {
  number: 1040, date: '2026-08-20', customer: { name: 'יגור' }, items: [{ name: 'E360CT', qty: 2 }],
  recipient: 'ישראל ישראלי', signature: 'data:image/png;base64,SIGNATURE',
};

describe('certDocHtml = today (recorded live from js/src/20-delivery-cert.js)', () => {
  for (const [name, cert] of Object.entries({ numbered, draft, cancelled, signed })) {
    for (const screen of [false, true]) {
      it(`${name}${screen ? ' (screen)' : ''}`, () => {
        const opts = { screen, logo: LOGO, year: YEAR };
        expect(certDocHtml(cert as CertLike, opts)).toBe(legacyCertDocHtml(cert, { screen }, LOGO, YEAR));
      });
    }
  }
});

describe('certRangeReportHtml = today (recorded live from js/src/20-delivery-cert.js certRangeReportRange)', () => {
  it('byte-identical for a mixed active/cancelled set, grouped by kibbutz', async () => {
    const certs: CertRow[] = [
      { id: '1', cert_number: 1041, cert_date: '2026-09-02', kibbutz: 'חוקוק', customer: { name: 'חוקוק' }, items: [{ name: 'A', qty: 2 }], notes: '', created_by: 'אביאם', status: 'active' } as any,
      { id: '2', cert_number: 1042, cert_date: '2026-09-15', kibbutz: 'דגניה', customer: { name: 'דגניה' }, items: [{ name: 'B', qty: 1 }], notes: 'הערה', created_by: 'עידן', status: 'cancelled', replaced_by: 1043 } as any,
    ];
    const from = '2026-09-01', to = '2026-09-30', now = '23.9.2026, 10:00:00';
    const mine = certRangeReportHtml(certs, from, to, { logo: LOGO, label: n => n, now });

    const src = read('js/src/20-delivery-cert.js') + '\nreturn certRangeReportRange;';
    let written = '';
    const fakeWin = { document: { write: (h: string) => { written = h; }, open() {}, close() {} } };
    const fn = new Function('CERT_LOGO', 'window', src);
    class FixedDate extends Date { toLocaleString() { return now; } }
    const legacyFn = fn(LOGO, {
      open: () => fakeWin as any,
      _sbCertGet: async () => certs.map(c => ({ ...c, cert_number: c.cert_number, cert_date: c.cert_date, replaced_by: (c as any).replaced_by, created_by: c.created_by })),
      SHEET_DATA: { products: [] },
    });
    const RealDate = globalThis.Date;
    // @ts-expect-error test-only Date override, matching the spec's "freeze Date.toLocaleString" approach
    globalThis.Date = FixedDate;
    try { await legacyFn(from, to); } finally { globalThis.Date = RealDate; }
    expect(mine).toBe(written);
  });
});

describe('certViewUrl / certShareText / certGroupName', () => {
  it('certViewUrl: the canonical live base, never a preview origin', () => {
    expect(certViewUrl('abc-123')).toBe('https://pm-sigma.github.io/sigmatec-operations-app/?cert=abc-123');
  });
  it('certShareText', () => {
    const c: CertRow = { id: 'x', cert_number: 1041, cert_date: '2026-09-02', customer: { name: 'חוקוק' }, items: [] };
    expect(certShareText(c)).toBe('שלום, מצורפת תעודת משלוח מס\' 1041 מסיגמאטק עבור חוקוק מתאריך 2.9.2026.\nלצפייה והדפסה: https://pm-sigma.github.io/sigmatec-operations-app/?cert=x');
  });
  it('certGroupName: customer name wins, else the kibbutz', () => {
    expect(certGroupName({ customer: { name: 'א' }, kibbutz: 'ב' })).toBe('א');
    expect(certGroupName({ kibbutz: 'ב' })).toBe('ב');
  });
});

describe('certRange', () => {
  it('every chip, against a fixed today', () => {
    expect(certRange('thisMonth', '2026-09-23')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(certRange('lastMonth', '2026-09-23')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(certRange('last7', '2026-09-23')).toEqual({ from: '2026-09-17', to: '2026-09-23' });
    expect(certRange('last30', '2026-09-23')).toEqual({ from: '2026-08-25', to: '2026-09-23' });
    expect(certRange('all', '2026-09-23')).toEqual({ from: '2000-01-01', to: '2099-01-01' });
  });
});

describe('certSearch', () => {
  const rows = [
    { kibbutz: 'חוקוק', customer: { name: 'חוקוק אגש"ח' }, cert_number: 1041 },
    { kibbutz: 'דגניה', customer: { name: 'דגניה' }, cert_number: 1042 },
  ];
  it('matches kibbutz, customer name, or the number as a substring', () => {
    expect(certSearch(rows, 'דגניה').map(r => r.cert_number)).toEqual([1042]);
    expect(certSearch(rows, '1041').map(r => r.cert_number)).toEqual([1041]);
    expect(certSearch(rows, '')).toEqual(rows);
  });
});

describe('certRangeGroups (C24)', () => {
  it('excludes cancelled certs from totals but lists them', () => {
    const g = certRangeGroups([
      { id: '1', cert_number: 1, kibbutz: 'א', customer: {} as any, items: [{ name: 'A', qty: 2 }], status: 'active' },
      { id: '2', cert_number: 2, kibbutz: 'א', customer: {} as any, items: [{ name: 'A', qty: 5 }], status: 'cancelled' },
    ] as any, n => n);
    expect(g).toEqual([{ name: 'א', certs: expect.arrayContaining([expect.objectContaining({ cert_number: 1 }), expect.objectContaining({ cert_number: 2 })]), totals: [['A', 2]] }]);
  });
});

describe('certItemsForView (C11)', () => {
  it('a viewer sees the report label; print/reissue (isViewer=false) keep the technical name', () => {
    const map = { 'מונה Landis+Gyr E360PP': { name: 'מונה Landis+Gyr E360PP', display_name: 'מונה חשמל תלת-פאזי' } };
    expect(certItemsForView([{ name: 'מונה Landis+Gyr E360PP', qty: 1 }], true, map)).toEqual([{ name: 'מונה חשמל תלת-פאזי', qty: 1 }]);
    expect(certItemsForView([{ name: 'מונה Landis+Gyr E360PP', qty: 1 }], false, map)).toEqual([{ name: 'מונה Landis+Gyr E360PP', qty: 1 }]);
  });
});

describe('certIssueErrors (C5)', () => {
  it('viewer, no items, no customer name', () => {
    expect(certIssueErrors({ items: [], customer: { name: 'x' } }, false)).toEqual(['אין פריטים בתעודה. צריך לפחות פריט אחד.']);
    expect(certIssueErrors({ items: [{ name: 'A', qty: 1 }], customer: { name: '' } }, false)).toEqual(['חסר שם לקוח.']);
    expect(certIssueErrors({ items: [{ name: 'A', qty: 1 }], customer: { name: 'x' } }, true)).toEqual(['משתמש צפייה לא מפיק תעודות.']);
    expect(certIssueErrors({ items: [{ name: 'A', qty: 1 }], customer: { name: 'x' } }, false)).toEqual([]);
  });
});

describe('certPrefill / certReissuePrefill (C2, C19)', () => {
  it('a manual cert falls back to kibbutz_details; pre.customer overrides it (reissue)', () => {
    const details = { legal_name: 'חוקוק אגש"ח', company_id: '570000001', address: 'חוקוק', contact: 'דני' };
    const p = certPrefill({ kibbutz: 'חוקוק', items: [{ name: 'A', qty: 1 }] }, details, '2026-09-23');
    expect(p.customer).toEqual({ name: 'חוקוק אגש"ח', company_id: '570000001', address: 'חוקוק', contact: 'דני' });
    expect(p.date).toBe('2026-09-23');
  });
  it('no items → one blank row', () => {
    expect(certPrefill({ kibbutz: 'חוקוק' }, undefined, '2026-09-23').items).toEqual([{ name: '', qty: 1 }]);
  });
  it('certReissuePrefill carries reissueOf so issuing auto-cancels the old one', () => {
    const c: CertRow = { id: 'old-id', cert_number: 1041, customer: { name: 'חוקוק' }, items: [{ name: 'A', qty: 1 }], kibbutz: 'חוקוק', source: 'visit', refId: 'v1' };
    expect(certReissuePrefill(c, '2026-09-23').reissueOf).toEqual({ id: 'old-id', certNumber: 1041 });
  });
});

describe('certEsc / certFmtDate', () => {
  it('certEsc escapes the four HTML-sensitive characters', () => expect(certEsc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'));
  it('certFmtDate: he-IL, or an em dash for nothing', () => {
    expect(certFmtDate('2026-09-02')).toBe(new Date('2026-09-02T12:00:00').toLocaleDateString('he-IL'));
    expect(certFmtDate('')).toBe('—');
  });
  it('CERT_COMPANY is the real registered block', () => expect(CERT_COMPANY.reg).toBe('עוסק מורשה/ח.פ.: 515923084'));
});
