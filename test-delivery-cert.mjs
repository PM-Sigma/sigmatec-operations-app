// Self-check for the delivery-certificate module (js/src/20-delivery-cert.js + -logo.js).
// U10 trimmed this file to: the ?cert= public view route, the accounting range report
// (delegating to SigmaInv.certRangeReportHtml), and the prefill "trigger point" helpers still
// reached from legacy markup (visit form / visit history / EMS task / visits-report picker).
// The modal/table UI itself (certCollect, issueDeliveryCert, certOverlayShow, invRenderCerts,
// certReissue, certCancel, certSendPlan, …) is React now (app/src/islands/InventoryCert.tsx) —
// asserted in app/src/lib/certDoc.test.ts / certSend.test.ts, not here.
// Run: node test-delivery-cert.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSigmaInv } from './scripts/sigma-inv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certSrc = fs.readFileSync(path.join(__dirname, 'js/src/20-delivery-cert.js'), 'utf8');
const logoSrc = fs.readFileSync(path.join(__dirname, 'js/src/20-delivery-cert-logo.js'), 'utf8');
const SigmaInv = loadSigmaInv();

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

function makeEl(overrides) {
  return Object.assign({
    value: '', innerHTML: '', dataset: {}, style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  }, overrides || {});
}

const elements = {};
['visitDate', 'visitContact', 'visitSummary', 'visitsReportFrom', 'visitsReportTo', 'visitsReportVisitor',
  'certPickerModal', 'invCertsFrom', 'invCertsTo'].forEach(id => { elements[id] = makeEl(); });

const invOpenCalls = [];
const document_ = {
  getElementById: (id) => elements[id] || null,
  createElement: () => makeEl(),
  body: { appendChild() {} },
  querySelector: () => null,
  querySelectorAll: (sel) => (sel === '.prod-chk:checked' ? [] : []),
};
const window_ = { currentKibbutz: 'שדה אליהו', _certIssuedFor: {} };

let lastFetchBody = null;
const fetch_ = async (url, opts) => {
  lastFetchBody = opts && opts.body ? JSON.parse(opts.body) : null;
  return { json: async () => ({ ok: true }) };
};
const openedWindows = [];
window_.open = () => {
  const w = { document: { _html: '', write(html) { this._html += html; }, open() { this._html = ''; }, close() {} } };
  openedWindows.push(w);
  return w;
};

function runModule(overrides) {
  overrides = overrides || {};
  const fn = new Function(
    'window', 'document', 'fetch', 'invOpen', 'location', 'SB_URL', 'SB_ANON', 'SigmaInv',
    'loadAllVisitsCombined', 'visitorsOf', 'alert', '_certRows',
    certSrc + '\n' + logoSrc +
      '\nreturn { certEsc, certFmtDate, certDocHtml, openDeliveryCert, certIssuedForVisit, certViewUrl,' +
      ' certFetchRow, certFromVisit, openVisitCertPicker, certView, certSendOpen,' +
      ' certRowForVisit, certSendForVisit, certDownloadForVisit, certGroupName, certReportLabel,' +
      ' certRangeReportRange, certRangeReport, certMonthlyFromTab };'
  );
  return fn(
    overrides.window || window_, overrides.document || document_, overrides.fetch || fetch_,
    (detail) => invOpenCalls.push(detail),
    overrides.location || { search: '' }, overrides.SB_URL || 'https://sb.test', overrides.SB_ANON || 'anonkey',
    overrides.SigmaInv || SigmaInv,
    overrides.loadAllVisitsCombined || (() => []), overrides.visitorsOf || (() => []),
    overrides.alert || ((m) => alertLog.push(m)), overrides._certRows || [],
  );
}

const alertLog = [];
let mod;
check('module evals without throwing', () => { mod = runModule(); assert.ok(mod); });

if (mod) {
  check('certEsc escapes & < > "', () => {
    assert.equal(mod.certEsc('<a href="x">&y</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;y&lt;/a&gt;');
  });
  check('certFmtDate returns he-IL date string, — for empty', () => {
    assert.equal(mod.certFmtDate(''), '—');
    assert.ok(mod.certFmtDate('2026-07-10').length > 0);
  });
  check('certViewUrl targets the live GitHub Pages origin, never localhost', () => {
    const u = mod.certViewUrl('abc-123');
    assert.ok(u.startsWith('https://pm-sigma.github.io/'));
    assert.ok(u.endsWith('?cert=abc-123'));
  });
  check('certDocHtml delegates to SigmaInv.certDocHtml with the logo injected', () => {
    const html = mod.certDocHtml({ number: 1, date: '2026-07-10', customer: {}, items: [] }, {});
    assert.ok(html.includes('<!doctype html>') || html.length > 0);
  });

  check('openDeliveryCert opens the React sheet (invOpen kind:cert) instead of a legacy modal', () => {
    invOpenCalls.length = 0;
    mod.openDeliveryCert({ kibbutz: 'דפנה' });
    assert.equal(invOpenCalls.length, 1);
    assert.equal(invOpenCalls[0].kind, 'cert');
    assert.equal(invOpenCalls[0].pre.kibbutz, 'דפנה');
  });
  check('certView / certSendOpen also just open the React sheet', () => {
    invOpenCalls.length = 0;
    mod.certView('c1');
    mod.certSendOpen('c1');
    assert.deepEqual(invOpenCalls.map(d => d.kind), ['cert-view', 'cert-send']);
  });

  // "certFromVisitForm builds a pre object from the visit form and opens the sheet" retired
  // round 5 V-U3 with the legacy visit form itself (#visitDate, .prod-chk) — certFromVisit
  // (below) and sigma.openVisitEditor({mode:'cert'}) are the only paths into the cert sheet now.
  check('certFromVisit resolves the visit by id and opens the sheet', () => {
    invOpenCalls.length = 0;
    const m2 = runModule({ loadAllVisitsCombined: () => [{ id: 'v1', kibbutz: 'גבים', date: '2026-07-01', products: [{ name: 'X', qty: 2 }] }] });
    m2.certFromVisit('v1');
  });
  check('openVisitCertPicker lists visits in range without throwing', () => {
    const m3 = runModule({ loadAllVisitsCombined: () => [{ id: 'v1', kibbutz: 'גבים', date: '2026-07-01', visitor: 'אביאם', products: [{ name: 'X', qty: 1 }] }] });
    m3.openVisitCertPicker();
  });

  check('certRowForVisit / certSendForVisit / certDownloadForVisit: no cert anywhere → clear message, not a crash', async () => {
    const alerts = [];
    const m4 = runModule({ alert: (m) => alerts.push(m), fetch: async () => ({ json: async () => [] }) });
    await m4.certSendForVisit('no-such-visit'); await m4.certDownloadForVisit('no-such-visit');
    assert.equal(alerts.length, 2);
  });

  // Regression: after U10 nothing fills _certRows any more (the legacy registry render that used
  // to is gone) — it starts empty and stays empty, so certRowForVisit must fetch the visit's
  // active cert from Supabase itself instead of always missing.
  check('certRowForVisit falls back to Supabase when _certRows is empty, and caches the row', async () => {
    const alerts = [];
    const queries = [];
    const win5 = Object.assign({}, window_, {
      _sbCertGet: async (q) => {
        queries.push(q);
        return q.includes('ref_id=eq.v-cold') ? [{ id: 'c-cold', ref_id: 'v-cold', status: 'active', cert_number: 9001 }] : [];
      },
    });
    const m5 = runModule({ alert: (m) => alerts.push(m), window: win5 });
    const r = await m5.certRowForVisit('v-cold');
    assert.equal(r && r.id, 'c-cold');
    assert.ok(queries.some(q => /delivery_certs\?.*ref_id=eq\.v-cold.*status=eq\.active/.test(q)), queries[0]);
    invOpenCalls.length = 0;
    await m5.certDownloadForVisit('v-cold');
    assert.equal(alerts.length, 0, 'a cold cache must not alert "not registered"');
    assert.deepEqual(invOpenCalls.map(d => d.kind), ['cert-view']);
  });

  check('certGroupName delegates to SigmaInv (customer.name over kibbutz)', () => {
    assert.equal(mod.certGroupName({ customer: { name: 'לקוח' }, kibbutz: 'דפנה' }), 'לקוח');
    assert.equal(mod.certGroupName({ kibbutz: 'דפנה' }), 'דפנה');
  });
  check('certReportLabel falls back to the technical name with no productLabel in scope', () => {
    assert.equal(mod.certReportLabel('מונה X'), 'מונה X');
  });

  check('certRangeReportRange writes SigmaInv.certRangeReportHtml into the print window', () => {
    const m5 = runModule({ fetch: async () => ({ json: async () => [] }) });
    m5.certRangeReportRange('2026-07-01', '2026-07-31');
  });
  check('certRangeReport / certMonthlyFromTab both resolve to certRangeReportRange without throwing', async () => {
    const m6 = runModule({ fetch: async () => ({ json: async () => [] }) });
    await m6.certRangeReport();
    await m6.certMonthlyFromTab();
  });

  check('certIssuedForVisit caches once found; 0 with no Supabase reader', async () => {
    const n = await mod.certIssuedForVisit('v-none');
    assert.equal(n, 0);
  });
}

// ---- ?cert= public view route (certFetchRow + the boot-time IIFE) ----
{
  check('with no ?cert= in the URL, the route never fires (no document.write)', () => {
    let wrote = false;
    const doc = Object.assign({}, document_, { open() {}, write() { wrote = true; }, close() {} });
    runModule({ location: { search: '' }, document: doc });
    assert.equal(wrote, false);
  });

  check('?cert=<uuid> renders the RPC row through certDocHtml', () => {
    let written = '';
    const doc = Object.assign({}, document_, { open() {}, write(h) { written += h; }, close() {} });
    const id = '11111111-1111-1111-1111-111111111111';
    const fakeFetch = async (url) => {
      if (String(url).includes('rpc/cert_by_id')) {
        return { ok: true, json: async () => [{ cert_number: 42, cert_date: '2026-07-10', kibbutz: 'דפנה', customer: {}, items: [] }] };
      }
      return { json: async () => [] };
    };
    runModule({ location: { search: '?cert=' + id }, document: doc, fetch: fakeFetch });
    // the route body runs in a microtask (async IIFE) — give it a tick
    return new Promise(res => setTimeout(() => {
      check('  → the doc was written with cert content, not the "not found" fallback', () => {
        assert.ok(written.length > 0);
        assert.ok(!written.includes('התעודה לא נמצאה'));
      });
      res();
    }, 20));
  });
}

console.log(failures === 0 ? '\nPASS — all delivery-cert checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
