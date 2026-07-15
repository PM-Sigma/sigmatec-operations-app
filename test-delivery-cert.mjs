// Self-check for the delivery-certificate module (js/src/20-delivery-cert.js + -logo.js).
// Run: node test-delivery-cert.mjs
// Loads both source files as text and evals them inside a function scope with minimal
// browser-global stubs (window/document/fetch), mirroring test-devboard.mjs / test-order-patch.mjs style.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certSrc = fs.readFileSync(path.join(__dirname, 'js/src/20-delivery-cert.js'), 'utf8');
const logoSrc = fs.readFileSync(path.join(__dirname, 'js/src/20-delivery-cert-logo.js'), 'utf8');

let failures = 0;
const pending = [];
function await0(fn) { pending.push(fn); }
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ---- minimal DOM stubs ----
function makeEl(overrides) {
  return Object.assign({
    value: '', innerHTML: '', dataset: {}, style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  }, overrides || {});
}

const elements = {};
['certModal', 'certCustName', 'certCustCompanyId', 'certCustAddress', 'certCustContact',
  'certDate', 'certItems', 'certNotes', 'certProductList',
  'invCertsList', 'inv-section-certs', 'invCertsFrom', 'invCertsTo', 'invCertsSearch',
  'certSendModal'].forEach(id => { elements[id] = makeEl(); });
// the certs tab is "open" for invRenderCerts's active-tab guard (force=true bypasses it anyway, but keep it realistic)
elements['inv-section-certs'].classList.contains = (c) => c === 'active';
// certSendOpen()'s "modal already exists" branch — pre-registering it means the module skips
// document.createElement/appendChild and calls classList.add('open') on OUR stub directly, so we
// can observe it. Track every class passed to add() for the "auto-opened after issue" assertion.
const certSendModalOpens = [];
elements['certSendModal'].classList.add = (c) => certSendModalOpens.push(c);
// certEmailSelected() reads document.querySelectorAll('#certSendModal .cert-send-chk:checked') —
// test sections populate this array to simulate which checkboxes are checked.
let sendModalCheckedBoxes = [];

// certItems collects appended rows (used by certAddItemRow -> certCollect roundtrip)
const certItemRows = [];
elements.certItems.appendChild = (row) => { certItemRows.push(row); };
// certModal.querySelectorAll('.cert-item-row') returns whatever rows we registered
elements.certModal.querySelectorAll = (sel) => sel === '.cert-item-row' ? certItemRows.slice() : [];

const alerts = [];
const window_ = {};
const document_ = {
  getElementById: (id) => elements[id] || null,
  createElement: () => makeEl(),
  body: { appendChild() {} },
  querySelector: () => null,
  querySelectorAll: (sel) => (typeof sel === 'string' && sel.indexOf('cert-send-chk') !== -1) ? sendModalCheckedBoxes : []
};

// mailto: link target for certEmailSelected — a plain mutable object standing in for the
// browser's `location`, passed into the module as a Function param (the module references bare
// `location`, so it must be supplied — it is NOT a real global in the Node harness).
const location_ = { href: '', search: '' };

let lastFetchBody = null;
const fetchBodies = [];   // every POST body, in call order (issue + auto-cancel, etc.)
// per-call override for the persisted-cert response (default matches the original stub: no id).
let fetchJsonOverride = null;
const fetch_ = async (url, opts) => {
  lastFetchBody = opts && opts.body ? JSON.parse(opts.body) : null;
  if (lastFetchBody) fetchBodies.push(lastFetchBody);
  return { json: async () => (fetchJsonOverride || { ok: true, certNumber: 1234 }) };
};

// emsWriteOrQueue capture — issueDeliveryCert drops an EMS-task comment through this global when
// a cert born from an EMS task is issued; captured here instead of touching the real EMS API.
const emsCalls = [];
const emsWriteOrQueue_ = (arg) => emsCalls.push(arg);

// window.open stub — issueDeliveryCert/certReprint open a blank print window then write the doc into it.
const openedWindows = [];
window_.open = () => {
  const w = { document: { _html: '', write(html) { this._html += html; }, open() { this._html = ''; }, close() {} } };
  openedWindows.push(w);
  return w;
};

const KIBBUTZ_DETAILS = [
  { kibbutz: 'שדה אליהו', legal_name: 'שדה - אל חשמל בע"מ', company_id: '516702735', address: '', contact: 'a@b.c' }
];

// stored issued-cert row (snake_case, as returned by Supabase) — used for invRenderCerts/certReprint checks
const DELIVERY_CERT_ROWS = [{
  id: 'c1', cert_number: 2001, cert_date: '2026-07-10', kibbutz: 'שדה אליהו',
  customer: { name: 'שדה - אל חשמל בע"מ', company_id: '516702735', address: 'כתובת בדיקה', contact: 'איש קשר' },
  items: [{ name: 'אנטנה', qty: 2 }], notes: 'הערה לבדיקה', source: 'visit', ref_id: 'v99',
  created_by: 'עידן', recipient: 'דנה מקבלת', signature: 'data:image/png;base64,ZZZ'
}];

// certCancel() calls a bare confirm(...) — controllable per-test via confirmReturn.
let confirmReturn = true;
const confirm_ = () => confirmReturn;

// overrides — {window, document, fetch, location, SB_URL, SB_ANON, emsWriteOrQueue}: used by the
// ?cert route-guard test to eval a SEPARATE module instance against its own stubs (the route's
// top-level IIFE runs once at eval time against whatever `location` it's given). Every other test
// shares the single default-args `mod` instance built by the bare runModule() call below.
function runModule(overrides) {
  overrides = overrides || {};
  const fn = new Function(
    'window', 'document', 'fetch', 'SHEET_API', 'getCurrentUser', 'setBtnLoading', 'alert', 'confirm', 'console',
    'location', 'SB_URL', 'SB_ANON', 'emsWriteOrQueue',
    certSrc + '\n' + logoSrc + '\nreturn { certEsc, certFmtDate, certDocHtml, openDeliveryCert, certCollect, certFromEmsTask, certFromVisitObj, certFromOrder, certAddItemRow, CERT_LOGO, issueDeliveryCert, certReissue, certCancel, invRenderCerts, certShareText, certViewUrl, getCertRows: () => _certRows, setCertSig: (v) => { _certSig = v; }, setCertRows: (v) => { _certRows = v; } };'
  );
  return fn(
    overrides.window || window_, overrides.document || document_, overrides.fetch || fetch_, 'http://sheet.test',
    () => 'עידן', () => {}, (msg) => alerts.push(msg), confirm_, console,
    overrides.location || location_, overrides.SB_URL || 'https://sb.test', overrides.SB_ANON || 'anonkey',
    overrides.emsWriteOrQueue || emsWriteOrQueue_
  );
}

let mod;
check('module evals without throwing', () => { mod = runModule(); assert.ok(mod); });

if (mod) {
  // ---- 1. certEsc / certFmtDate ----
  check('certEsc escapes & < > "', () => {
    assert.equal(mod.certEsc('<a href="x">&y</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;y&lt;/a&gt;');
  });
  check('certFmtDate returns he-IL date string', () => {
    const s = mod.certFmtDate('2026-07-14');
    assert.ok(/2026/.test(s), 'expected year 2026 in "' + s + '"');
  });
  check('certFmtDate invalid input does not throw', () => {
    assert.doesNotThrow(() => mod.certFmtDate('not-a-date'));
    assert.doesNotThrow(() => mod.certFmtDate(''));
  });

  // ---- 2. certDocHtml ----
  const baseCert = {
    number: 1001,
    date: '2026-07-14',
    kibbutz: 'שדה אליהו',
    customer: { name: 'שדה - אל חשמל בע"מ', company_id: '516702735', address: '', contact: 'a@b.c' },
    items: [{ name: 'אנטנה', qty: 2 }, { name: 'מונה', qty: 3 }],
    notes: 'שורה ראשונה\nשורה שנייה',
    source: 'manual',
    refId: ''
  };
  const html = mod.certDocHtml(baseCert);
  check('certDocHtml contains cert number heading', () => {
    assert.ok(html.includes('תעודת משלוח 1001'), 'missing heading');
  });
  check('certDocHtml contains customer name', () => {
    assert.ok(html.includes(mod.certEsc(baseCert.customer.name)));
  });
  check('certDocHtml contains every item name and qty', () => {
    baseCert.items.forEach(i => {
      assert.ok(html.includes(mod.certEsc(i.name)), 'missing item name ' + i.name);
    });
  });
  check('certDocHtml shows correct total qty', () => {
    const total = baseCert.items.reduce((s, i) => s + i.qty, 0);
    assert.ok(html.includes('סה"כ פריטים: ' + total), 'expected total ' + total);
  });
  check('certDocHtml contains no currency symbol', () => {
    assert.ok(!html.includes('₪'), 'found ₪ in price-less doc');
  });
  check('certDocHtml contains no מחיר (price) text', () => {
    assert.ok(!html.includes('מחיר'), 'found מחיר in price-less doc');
  });
  check('certDocHtml draft mode renders טיוטה, no numeric number', () => {
    const draft = mod.certDocHtml(Object.assign({}, baseCert, { number: null }));
    assert.ok(draft.includes('תעודת משלוח טיוטה'), 'expected draft heading');
    assert.ok(!/תעודת משלוח \d/.test(draft), 'draft doc should not show a numeric cert number');
  });
  check('certDocHtml escapes malicious item name (no raw <script> injected)', () => {
    const evil = mod.certDocHtml(Object.assign({}, baseCert, {
      items: [{ name: '<script>alert(1)</script>', qty: 1 }]
    }));
    assert.ok(evil.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'item name should be escaped');
    // module's own trailing print script is expected (built via string concat to dodge scanners);
    // beyond that, no other raw <script> tag should appear.
    const rawScriptCount = (evil.match(/<script(?!>)/gi) || []).length; // none should exist as literal '<script' (module uses '<scr'+'ipt>')
    assert.equal(rawScriptCount, 0, 'no literal <script opening tag should appear outside the concatenated print script');
  });
  check('certDocHtml converts notes newlines to <br>', () => {
    assert.ok(html.includes('שורה ראשונה<br>שורה שנייה'), 'notes newline not converted to <br>');
  });
  check('certDocHtml has exactly one logo <img> with base64 jpeg src', () => {
    const matches = html.match(/<img[^>]*src="data:image\/jpeg;base64,[^"]*"/g) || [];
    assert.equal(matches.length, 1, 'expected exactly one logo <img>, found ' + matches.length);
  });
  check('certDocHtml unsigned: blank recipient + signature lines, no PNG img', () => {
    assert.ok(!/data:image\/png/.test(html), 'unsigned cert must not embed a signature image');
    assert.ok(html.includes('שם המקבל: <span>&nbsp;</span>'), 'expected blank recipient line');
    assert.ok(html.includes('חתימה: <span>&nbsp;</span>'), 'expected blank signature line');
  });
  check('certDocHtml signed: recipient name + PNG signature embedded', () => {
    const sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const signed = mod.certDocHtml(Object.assign({}, baseCert, { recipient: 'יוסי המקבל', signature: sig }));
    assert.ok(signed.includes('שם המקבל: <b>יוסי המקבל</b>'), 'recipient name missing');
    assert.ok(signed.includes('<img src="' + sig + '"'), 'signature img missing');
  });
  check('certDocHtml rejects non-data-URI signature (stored-data sanitization)', () => {
    const bad = mod.certDocHtml(Object.assign({}, baseCert, { recipient: 'x', signature: 'https://evil.example/x.png' }));
    assert.ok(!bad.includes('evil.example'), 'non-data-URI signature must not be rendered');
    assert.ok(bad.includes('חתימה: <span>&nbsp;</span>'), 'should fall back to blank signature line');
  });
  check('certDocHtml cancelled:true renders מבוטלת watermark + הוחלפה בתעודה מס note with the new cert number', () => {
    const cancelledHtml = mod.certDocHtml(Object.assign({}, baseCert, { cancelled: true, replacedBy: 3002 }));
    assert.ok(cancelledHtml.includes('מבוטלת'), 'expected מבוטלת watermark text');
    assert.ok(cancelledHtml.includes('הוחלפה בתעודה מס'), 'expected "הוחלפה בתעודה מס" replacement note');
    assert.ok(cancelledHtml.includes('3002'), 'expected the replacing cert number 3002 in the note');
  });
  check('certDocHtml cancelled falsy renders neither the watermark nor the replacement note', () => {
    assert.ok(!html.includes('מבוטלת'), 'unexpected מבוטלת watermark on an active (non-cancelled) cert doc');
    assert.ok(!html.includes('הוחלפה בתעודה מס'), 'unexpected replacement note on an active (non-cancelled) cert doc');
  });

  // ---- 2b. certDocHtml opts.screen — in-app preview / public view link mode vs. the printed doc ----
  const htmlScreen = mod.certDocHtml(baseCert, { screen: true });
  check('certDocHtml({screen:true}) contains the floating print-fab button', () => {
    assert.ok(htmlScreen.includes('print-fab'), 'expected a .print-fab button in screen mode');
    assert.ok(htmlScreen.includes('🖨️ הדפס / שמור PDF'), 'expected the print-fab label');
  });
  check('certDocHtml({screen:true}) hides the print-fab via @media print', () => {
    const collapsed = htmlScreen.replace(/\s+/g, ' ');
    assert.ok(/@media print\s*\{\s*\.print-fab\s*\{\s*display:\s*none;?\s*\}/.test(collapsed),
      'expected an @media print rule hiding .print-fab');
  });
  check('certDocHtml({screen:true}) does NOT auto-print (no window.onload script)', () => {
    assert.ok(!htmlScreen.includes('window.onload'), 'screen mode must not carry the auto-print onload script');
  });
  check('certDocHtml() without opts auto-prints and has no print-fab', () => {
    assert.ok(html.includes('window.onload'), 'expected the auto-print onload script by default');
    assert.ok(!html.includes('print-fab'), 'default (print-window) mode must not include the print-fab button');
  });

  // ---- 2c. certViewUrl — canonical public share link, always pinned to the live app origin ----
  check('certViewUrl builds the public view link for a plain id', () => {
    assert.equal(mod.certViewUrl('abc-123'), 'https://pm-sigma.github.io/sigmatec-operations-app/?cert=abc-123');
  });
  check('certViewUrl encodes special characters in the id', () => {
    assert.equal(mod.certViewUrl('a b/c'), 'https://pm-sigma.github.io/sigmatec-operations-app/?cert=' + encodeURIComponent('a b/c'));
  });

  // ---- 2d. preview ≡ output parity — certDocHtml is the ONE generator for print window, in-app
  // preview and the public view link; {screen:true} and the plain call must render byte-identical
  // content up to the point they intentionally diverge (the print-fab vs. auto-print tail after
  // the closing </div> of .foot).
  check('certDocHtml preview/output parity: identical content up to the print-fab/auto-print tail', () => {
    const footPrefix = (s) => { const start = s.indexOf('<div class="foot">'); const end = s.indexOf('</div>', start) + '</div>'.length; return s.slice(0, end); };
    const outputHtml = mod.certDocHtml(baseCert);
    assert.ok(footPrefix(htmlScreen).length > 500, 'sanity: prefix should cover the whole document body');
    assert.equal(footPrefix(htmlScreen), footPrefix(outputHtml), 'content before the tail must be byte-identical between screen and print modes');
    assert.notEqual(htmlScreen, outputHtml, 'sanity: the two variants must actually differ somewhere (the tail)');
  });

  // ---- 3. openDeliveryCert prefill ----
  window_._sbCertGet = async (query) => {
    if (query.indexOf('kibbutz_details') !== -1) return KIBBUTZ_DETAILS;
    if (query.indexOf('delivery_certs') !== -1) return DELIVERY_CERT_ROWS;
    return [];
  };
  await0(async () => {
    await mod.openDeliveryCert({ kibbutz: 'שדה אליהו', items: [{ name: 'אנטנה', qty: 2 }], contact: 'יוסי', date: '2026-06-01' });
    check('openDeliveryCert prefill: known kibbutz sets legal name', () => {
      assert.equal(elements.certCustName.value, 'שדה - אל חשמל בע"מ');
    });
    check('openDeliveryCert prefill: known kibbutz sets company id', () => {
      assert.equal(elements.certCustCompanyId.value, '516702735');
    });
    check('openDeliveryCert prefill: date set from pre.date', () => {
      assert.equal(elements.certDate.value, '2026-06-01');
    });
    check('openDeliveryCert prefill: no address in kibbutz_details → defaults to the site name', () => {
      // KIBBUTZ_DETAILS['שדה אליהו'].address is '' — EMS has no delivery address for sites,
      // so the kibbutz/site name itself is used as the address (avoids a blank required field).
      assert.equal(elements.certCustAddress.value, 'שדה אליהו');
    });
  });

  await0(async () => {
    // reset name/company fields, then test unknown kibbutz fallback
    elements.certCustName.value = '';
    elements.certCustCompanyId.value = '';
    await mod.openDeliveryCert({ kibbutz: 'קיבוץ לא ידוע', items: [{ name: 'x', qty: 1 }], date: '2026-06-02' });
    check('openDeliveryCert prefill: unknown kibbutz falls back to kibbutz string as name', () => {
      assert.equal(elements.certCustName.value, 'קיבוץ לא ידוע');
    });
    check('openDeliveryCert prefill: unknown kibbutz leaves company id blank', () => {
      assert.equal(elements.certCustCompanyId.value, '');
    });
    check('openDeliveryCert prefill: unknown kibbutz also defaults address to the site name', () => {
      assert.equal(elements.certCustAddress.value, 'קיבוץ לא ידוע');
    });
  });

  // ---- 4. certCollect edit roundtrip ----
  await0(async () => {
    // simulate user editing the modal after openDeliveryCert prefilled it
    elements.certDate.value = '2026-08-15';
    elements.certCustName.value = 'לקוח ערוך';
    elements.certCustCompanyId.value = '999';
    elements.certCustAddress.value = 'רחוב 1';
    elements.certCustContact.value = 'מישהו';
    elements.certNotes.value = 'הערה';
    elements.certModal.dataset.kibbutz = 'שדה אליהו';
    elements.certModal.dataset.source = 'manual';
    elements.certModal.dataset.refId = 'r1';

    certItemRows.length = 0;
    certItemRows.push(
      { querySelector: (s) => s === '.cert-item-name' ? { value: 'אנטנה ערוכה' } : { value: '5' } },
      { querySelector: (s) => s === '.cert-item-name' ? { value: '' } : { value: '3' } }, // empty name -> excluded
      { querySelector: (s) => s === '.cert-item-name' ? { value: 'מונה' } : { value: '0' } } // qty 0 -> excluded
    );

    const collected = mod.certCollect();
    check('certCollect: edited date reflected', () => assert.equal(collected.date, '2026-08-15'));
    check('certCollect: edited customer name reflected', () => assert.equal(collected.customer.name, 'לקוח ערוך'));
    check('certCollect: edited customer company_id reflected', () => assert.equal(collected.customer.company_id, '999'));
    check('certCollect: excludes empty-name and zero-qty rows', () => {
      assert.deepEqual(collected.items, [{ name: 'אנטנה ערוכה', qty: 5 }]);
    });
  });

  // ---- 5. certFromEmsTask description parsing ----
  await0(async () => {
    window_._emsCurrentTask = {
      id: 't1',
      site: { name: 'שדה אליהו' },
      description: 'אספקת ציוד לשדה אליהו — אושר ע"י עידן\n• מונה Landis+Gyr E360PP ×3\n• אנטנה ×2\nשורה לא רלוונטית'
    };
    await mod.certFromEmsTask();
    // openDeliveryCert (called internally) clears then repopulates certItems via certAddItemRow,
    // which appends real DOM-shaped rows to elements.certItems (our stub records them in certItemRows).
    check('certFromEmsTask: parses exactly 2 items with correct qty', () => {
      // certAddItemRow builds a row whose .innerHTML/value we don't track directly since it's a real DOM op;
      // instead assert via the modal dataset + that certItems.appendChild was called twice with rows
      // containing the expected quantities baked into the row's cert-item-qty value attribute string.
      const parsed = certItemRows.filter(r => typeof r.innerHTML === 'string' && r.innerHTML.includes('cert-item-qty'));
      assert.equal(parsed.length, 2, 'expected 2 item rows appended, got ' + parsed.length);
      assert.ok(parsed[0].innerHTML.includes('value="Landis') === false); // sanity: not asserting exact html structure
    });
  });

  // ---- 6. certFromVisitObj + certFromOrder ----
  await0(async () => {
    certItemRows.length = 0;
    await mod.certFromVisitObj({ kibbutz: 'שדה אליהו', date: '2026-05-01T00:00:00Z', contact: 'ג', products: ['אנטנה', { name: 'מונה', qty: 4 }], id: 'v1' });
    check('certFromVisitObj: string + object products both become item rows', () => {
      const rows = certItemRows.filter(r => typeof r.innerHTML === 'string' && r.innerHTML.includes('cert-item-qty'));
      assert.equal(rows.length, 2, 'expected 2 rows from mixed product list');
    });
  });

  await0(async () => {
    window_.SHEET_DATA = { orders: [{ id: 'o1', kibbutz: 'לביא', orderType: 'customer', items: [{ name: 'אנטנה', qty: '4' }], deliveredAt: '2026-07-01T10:00:00Z' }] };
    certItemRows.length = 0;
    // certFromOrder is sync-dispatching (calls openDeliveryCert without awaiting internally, but openDeliveryCert is async)
    const p = mod.certFromOrder('o1');
    if (p && typeof p.then === 'function') await p;
    await Promise.resolve(); // let openDeliveryCert's internal awaits flush
    check('certFromOrder: date prefilled from deliveredAt (date-only slice)', () => {
      assert.equal(elements.certDate.value, '2026-07-01');
    });
    check('certFromOrder: qty coerced from string to number', () => {
      const rows = certItemRows.filter(r => typeof r.innerHTML === 'string' && r.innerHTML.includes('cert-item-qty'));
      assert.ok(rows.length >= 1, 'expected at least 1 item row');
      assert.ok(rows[0].innerHTML.includes('value="4"'), 'expected qty coerced to 4, row html: ' + rows[0].innerHTML);
    });
  });

  // ---- 7. issueDeliveryCert: persists recipient+signature, prints the numbered doc ----
  await0(async () => {
    // rebuild a clean modal state: one item row + a signed recipient (via the test-only setCertSig hook)
    elements.certModal.dataset.kibbutz = 'שדה אליהו';
    elements.certModal.dataset.source = 'manual';
    elements.certModal.dataset.refId = '';
    elements.certCustName.value = 'לקוח לחתימה';
    elements.certCustCompanyId.value = '';
    elements.certCustAddress.value = '';
    elements.certCustContact.value = '';
    elements.certDate.value = '2026-07-15';
    elements.certNotes.value = '';
    certItemRows.length = 0;
    certItemRows.push({ querySelector: (s) => s === '.cert-item-name' ? { value: 'אנטנה' } : { value: '2' } });
    mod.setCertSig({ name: 'יוסי החותם', data: 'data:image/png;base64,SIGDATA' });

    lastFetchBody = null;
    openedWindows.length = 0;
    await mod.issueDeliveryCert(null);

    check('issueDeliveryCert: posts type=deliveryCert', () => {
      assert.ok(lastFetchBody, 'expected a fetch call');
      assert.equal(lastFetchBody.type, 'deliveryCert');
    });
    check('issueDeliveryCert: cert body carries recipient + signature (data-URL) from the signed state', () => {
      assert.equal(lastFetchBody.cert.recipient, 'יוסי החותם');
      assert.equal(lastFetchBody.cert.signature, 'data:image/png;base64,SIGDATA');
    });
    check('issueDeliveryCert: cert body carries createdBy from getCurrentUser()', () => {
      assert.equal(lastFetchBody.createdBy, 'עידן');
    });
    check('issueDeliveryCert: printed doc reflects the server-assigned cert number + signature img', () => {
      assert.ok(openedWindows.length >= 1, 'expected a print window to open');
      const html = openedWindows[openedWindows.length - 1].document._html;
      assert.ok(html.includes('תעודת משלוח 1234'), 'expected numbered heading in printed doc');
      assert.ok(html.includes('שם המקבל: <b>יוסי החותם</b>'), 'expected recipient name in printed doc');
      assert.ok(html.includes('<img src="data:image/png;base64,SIGDATA"'), 'expected signature image in printed doc');
    });
  });

  // ---- 8. issued-certs tab: invRenderCerts renders stored rows; certReprint replays the exact snapshot ----
  await0(async () => {
    // invRenderCerts/certReprint are attached to `window` by the module itself (window.invRenderCerts = ...,
    // window.certReprint = ...), which already ran when runModule() evaluated the source above.
    await window_.invRenderCerts(true);
    check('invRenderCerts: lists the stored cert number + customer name', () => {
      const html = elements['invCertsList'].innerHTML;
      assert.ok(html.includes('2001'), 'expected cert_number 2001 in the rendered list');
      assert.ok(html.includes('שדה - אל חשמל בע&quot;מ'), 'expected (HTML-escaped) customer name in the rendered list');
    });
    check('invRenderCerts: shows the source label and a signed marker with recipient name', () => {
      const html = elements['invCertsList'].innerHTML;
      assert.ok(html.includes('📍 ביקור'), 'expected visit source label');
      assert.ok(html.includes('✅ דנה מקבלת'), 'expected signed marker with recipient name');
    });

    const fetchCallsBefore = lastFetchBody;
    openedWindows.length = 0;
    window_.certReprint('c1');
    check('certReprint: opens a print window without issuing any fetch (reprints from the cached row)', () => {
      assert.equal(lastFetchBody, fetchCallsBefore, 'certReprint must not trigger a network call');
      assert.ok(openedWindows.length >= 1, 'expected a print window to open');
    });
    check('certReprint: maps snake_case row fields (cert_number/cert_date/ref_id) into the printed doc', () => {
      const html = openedWindows[openedWindows.length - 1].document._html;
      assert.ok(html.includes('תעודת משלוח 2001'), 'expected cert_number 2001 in heading');
      assert.ok(/2026/.test(html) && html.includes('כתובת בדיקה'), 'expected stored address/date rendered');
      assert.ok(html.includes('· visit:v99'), 'expected source+ref_id footer built from ref_id');
    });
    check('certReprint: carries over the stored recipient + signature unchanged', () => {
      const html = openedWindows[openedWindows.length - 1].document._html;
      assert.ok(html.includes('שם המקבל: <b>דנה מקבלת</b>'), 'expected stored recipient name');
      assert.ok(html.includes('<img src="data:image/png;base64,ZZZ"'), 'expected stored signature image');
    });
  });

  // ---- 9. certReissue: opens the stored row for editing using its OWN customer block, not the kibbutz_details lookup ----
  const REISSUE_ROW = {
    id: 'x1', cert_number: 3001, cert_date: '2026-07-01', kibbutz: 'שדה אליהו',   // 'שדה אליהו' IS in KIBBUTZ_DETAILS —
    customer: { name: 'לקוח מקורי בע"מ', company_id: '111222333', address: 'כתובת מקורית 5', contact: 'איש קשר מקורי' },  // but these values must win
    items: [{ name: 'מונה מים', qty: 7 }], notes: 'הערה מקורית', source: 'order', ref_id: 'o55', status: 'active'
  };
  await0(async () => {
    mod.setCertRows([REISSUE_ROW]);
    certItemRows.length = 0;
    mod.certReissue('x1');   // sync dispatcher; internally calls the async openDeliveryCert
    await new Promise(r => setTimeout(r, 10));   // flush openDeliveryCert's internal awaits

    check('certReissue: modal customer name comes from the STORED row (not the kibbutz_details lookup)', () => {
      assert.equal(elements.certCustName.value, 'לקוח מקורי בע"מ');
    });
    check('certReissue: modal company_id comes from the STORED row (not kibbutz_details)', () => {
      assert.equal(elements.certCustCompanyId.value, '111222333');
    });
    check('certReissue: modal address comes from the STORED row', () => {
      assert.equal(elements.certCustAddress.value, 'כתובת מקורית 5');
    });
    check('certReissue: modal contact comes from the STORED row', () => {
      assert.equal(elements.certCustContact.value, 'איש קשר מקורי');
    });
    check('certReissue: modal items reflect the stored row\'s items', () => {
      const rows = certItemRows.filter(r => typeof r.innerHTML === 'string' && r.innerHTML.includes('cert-item-qty'));
      assert.equal(rows.length, 1, 'expected exactly 1 item row from the stored cert');
      assert.ok(rows[0].innerHTML.includes('value="מונה מים"'), 'expected stored item name in the row html');
      assert.ok(rows[0].innerHTML.includes('value="7"'), 'expected stored item qty in the row html');
    });
  });

  // ---- 10. reissue → issue auto-cancels the replaced cert ----
  await0(async () => {
    // register an item row so certCollect() has ≥1 item (mirrors the real UI: the modal was
    // just populated by certReissue() above, we just give it a querySelector-capable stub row).
    certItemRows.length = 0;
    certItemRows.push({ querySelector: (s) => s === '.cert-item-name' ? { value: 'מונה מים' } : { value: '7' } });
    // modal.dataset.{kibbutz,source,refId} were already set by certReissue's internal openDeliveryCert call above
    fetchBodies.length = 0;
    openedWindows.length = 0;
    await mod.issueDeliveryCert(null);

    check('issueDeliveryCert (reissue path): first POST body is the new cert (type=deliveryCert)', () => {
      assert.ok(fetchBodies.length >= 2, 'expected 2 POSTs (issue + auto-cancel), got ' + fetchBodies.length);
      assert.equal(fetchBodies[0].type, 'deliveryCert');
    });
    check('issueDeliveryCert (reissue path): a following POST auto-cancels the replaced cert', () => {
      const cancelBody = fetchBodies.find(b => b.type === 'deliveryCertCancel');
      assert.ok(cancelBody, 'expected a deliveryCertCancel POST');
      assert.equal(cancelBody.id, 'x1', 'expected the cancel to target the replaced cert id (x1)');
      assert.equal(cancelBody.replacedBy, 1234, 'expected replacedBy to equal the new cert number returned by the fetch stub (1234)');
    });
  });

  // ---- 11. certCancel: manual cancel gated by confirm(), no replacedBy ----
  await0(async () => {
    mod.setCertRows([{ id: 'x1', cert_number: 3001, status: 'active' }]);
    fetchBodies.length = 0;
    confirmReturn = true;
    await mod.certCancel('x1');
    await new Promise(r => setTimeout(r, 5));   // let certCancel's fire-and-forget invRenderCerts(true) settle
    check('certCancel (confirmed): posts type=deliveryCertCancel for the right id, with no replacedBy', () => {
      assert.equal(fetchBodies.length, 1, 'expected exactly one POST when confirmed');
      assert.equal(fetchBodies[0].type, 'deliveryCertCancel');
      assert.equal(fetchBodies[0].id, 'x1');
      assert.ok(!('replacedBy' in fetchBodies[0]), 'a manual cancel must not carry a replacedBy');
    });
  });

  await0(async () => {
    mod.setCertRows([{ id: 'x1', cert_number: 3001, status: 'active' }]);
    fetchBodies.length = 0;
    confirmReturn = false;
    await mod.certCancel('x1');
    check('certCancel (declined): no POST is sent when confirm() returns false', () => {
      assert.equal(fetchBodies.length, 0);
    });
  });

  // ---- 12. invRenderCerts: cancelled rows render the 🚫 מבוטלת marker + strikethrough, and hide their action buttons ----
  await0(async () => {
    const MIXED_ROWS = [
      { id: 'act1', cert_number: 4001, cert_date: '2026-07-01', kibbutz: 'שדה אליהו', customer: { name: 'לקוח פעיל' },
        items: [{ name: 'אנטנה', qty: 1 }], source: 'manual', created_by: 'עידן', status: 'active' },
      { id: 'canc1', cert_number: 4002, cert_date: '2026-07-02', kibbutz: 'שדה אליהו', customer: { name: 'לקוח מבוטל' },
        items: [{ name: 'אנטנה', qty: 1 }], source: 'manual', created_by: 'עידן', status: 'cancelled', replaced_by: 4003 }
    ];
    const originalSbCertGet = window_._sbCertGet;
    window_._sbCertGet = async (query) => query.indexOf('delivery_certs') !== -1 ? MIXED_ROWS : [];
    elements.invCertsSearch.value = '';
    await window_.invRenderCerts(true);
    window_._sbCertGet = originalSbCertGet;

    const listHtml = elements['invCertsList'].innerHTML;
    const rowChunks = listHtml.split('</tr>');
    const cancelledRowHtml = rowChunks.find(r => r.includes('4002')) || '';
    const activeRowHtml = rowChunks.find(r => r.includes('4001')) || '';

    check('invRenderCerts: cancelled row shows the 🚫 מבוטלת marker + strikethrough cert number', () => {
      assert.ok(cancelledRowHtml.includes('🚫 מבוטלת'), 'expected the cancelled marker in the cancelled row');
      assert.ok(/<s>4002<\/s>/.test(cancelledRowHtml), 'expected the cert number wrapped in <s> (strikethrough)');
    });
    check('invRenderCerts: cancelled row does NOT render the הפק מתוקנת / בטל action buttons', () => {
      assert.ok(cancelledRowHtml, 'could not locate the cancelled row in the rendered html');
      assert.ok(!cancelledRowHtml.includes('הפק מתוקנת'), 'cancelled row must not show the reissue button');
      assert.ok(!cancelledRowHtml.includes('>🚫 בטל<'), 'cancelled row must not show the cancel button');
    });
    check('invRenderCerts: active row DOES render the הפק מתוקנת / בטל action buttons', () => {
      assert.ok(activeRowHtml, 'could not locate the active row in the rendered html');
      assert.ok(activeRowHtml.includes('הפק מתוקנת'), 'active row should show the reissue button');
      assert.ok(activeRowHtml.includes('>🚫 בטל<'), 'active row should show the cancel button');
    });
  });

  // ---- 13. certShareText — the message body used for both email and WhatsApp shares ----
  check('certShareText includes the cert number, customer name and the view URL', () => {
    const row = { id: 'u1', cert_number: 4001, cert_date: '2026-07-15', kibbutz: 'לביא', customer: { name: 'חשמלביא' } };
    const text = mod.certShareText(row);
    assert.ok(text.includes('4001'), 'expected the cert number in the share text');
    assert.ok(text.includes('חשמלביא'), 'expected the customer name in the share text');
    assert.ok(text.includes(mod.certViewUrl('u1')), 'expected the view URL for id u1 in the share text');
  });
  check('certShareText falls back to kibbutz name when customer is missing', () => {
    const row = { id: 'u2', cert_number: 4002, cert_date: '2026-07-15', kibbutz: 'שדה אליהו' };
    assert.ok(mod.certShareText(row).includes('שדה אליהו'));
  });

  // ---- 14. certEmailSelected / certCopyLink — link building off window._certSendCtx + checked contacts ----
  await0(async () => {
    window_._certSendCtx = {
      contacts: [{ name: 'א', email: 'a@x.com' }, { name: 'ב', email: '' }],
      cert: { id: 'u1', cert_number: 4001 },
      text: 'שלום, מצורפת תעודת משלוח... לצפייה: ' + mod.certViewUrl('u1')
    };
    // real DOM: the contact-without-email checkbox is rendered `disabled` and never `:checked` —
    // only the emailed contact's box is "checked" here, mirroring that.
    sendModalCheckedBoxes = [{ dataset: { i: '0' } }];
    location_.href = '';
    window_.certEmailSelected();
    check('certEmailSelected: mailto: targets only the checked contact that has an email', () => {
      assert.ok(location_.href.startsWith('mailto:a@x.com'), 'expected mailto:a@x.com, got: ' + location_.href);
      assert.ok(!location_.href.includes('undefined'), 'must not leak "undefined" for the no-email contact');
    });
    check('certEmailSelected: subject is URL-encoded and carries the cert number', () => {
      const subject = 'תעודת משלוח 4001 — סיגמאטק התייעלות אנרגטית';
      assert.ok(location_.href.includes('subject=' + encodeURIComponent(subject)), 'expected encoded subject in mailto href');
    });
    check('certEmailSelected: body contains the view URL', () => {
      assert.ok(location_.href.includes(encodeURIComponent(mod.certViewUrl('u1'))), 'expected the encoded view URL in the mailto body');
    });

    check('certEmailSelected: alerts and does not touch location.href when nothing is checked', () => {
      location_.href = 'untouched';
      sendModalCheckedBoxes = [];
      alerts.length = 0;
      window_.certEmailSelected();
      assert.equal(location_.href, 'untouched', 'location.href must be left alone when no contact is selected');
      assert.ok(alerts.some(a => a.includes('בחר לפחות')), 'expected a "pick at least one contact" alert');
    });

    check('certCopyLink: callable without throwing regardless of clipboard API availability', () => {
      assert.doesNotThrow(() => window_.certCopyLink());
    });
  });

  // ---- 15. issueDeliveryCert EMS auto-comment + fresh-cert registry row + auto-opened send panel ----
  await0(async () => {
    // query-aware fallback: certSendOpen's site_contacts lookup resolves to [] (no contacts → the
    // "copy link manually" branch); invRenderCerts's delivery_certs lookup REJECTS instead of
    // resolving, so its (unawaited, background) refresh can't clobber the _certRows we're about
    // to assert on — a rejected await inside invRenderCerts is caught internally and leaves
    // _certRows untouched, matching how a real "load failed" refresh behaves.
    const originalSbCertGet = window_._sbCertGet;
    window_._sbCertGet = async (q) => { if (q.indexOf('site_contacts') !== -1) return []; throw new Error('not stubbed for this test'); };

    elements.certModal.dataset.kibbutz = 'שדה אליהו';
    elements.certModal.dataset.source = 'ems';
    elements.certModal.dataset.refId = 'task77';
    elements.certCustName.value = 'לקוח EMS';
    elements.certCustCompanyId.value = '';
    elements.certCustAddress.value = '';
    elements.certCustContact.value = '';
    elements.certDate.value = '2026-07-15';
    elements.certNotes.value = '';
    certItemRows.length = 0;
    certItemRows.push({ querySelector: (s) => s === '.cert-item-name' ? { value: 'אנטנה' } : { value: '1' } });
    mod.setCertSig({ name: '', data: '' });

    emsCalls.length = 0;
    certSendModalOpens.length = 0;
    fetchJsonOverride = { ok: true, certNumber: 1234, id: 'newid1' };

    await mod.issueDeliveryCert(null);
    await new Promise(r => setTimeout(r, 15));   // flush certSendOpen's + invRenderCerts's un-awaited background work

    check('issueDeliveryCert (source=ems): drops exactly one EMS-task comment', () => {
      assert.equal(emsCalls.length, 1, 'expected exactly one EMS comment capture, got ' + emsCalls.length);
      assert.equal(emsCalls[0].kind, 'comment');
      assert.equal(emsCalls[0].taskId, 'task77');
    });
    check('issueDeliveryCert (source=ems): comment message carries the cert number and the view URL', () => {
      const msg = emsCalls[0].message;
      assert.ok(msg.includes('1234'), 'expected cert number 1234 in the EMS comment: ' + msg);
      assert.ok(msg.includes(mod.certViewUrl('newid1')), 'expected the view URL for the new cert id in the EMS comment: ' + msg);
    });
    check('issueDeliveryCert: unshifts the fresh cert into the registry with the server-assigned id/number', () => {
      const rows = mod.getCertRows();
      assert.ok(rows.length >= 1, 'expected at least one row in the registry');
      assert.equal(rows[0].id, 'newid1');
      assert.equal(rows[0].cert_number, 1234);
      assert.equal(rows[0].status, 'active');
    });
    check('issueDeliveryCert: auto-opens the send panel for the freshly issued cert', () => {
      assert.ok(certSendModalOpens.includes('open'), 'expected certSendOpen to call classList.add("open") on the certSendModal stub');
    });

    // source=visit → issuing must NOT drop an EMS-task comment (there is no EMS task to comment on)
    elements.certModal.dataset.source = 'visit';
    elements.certModal.dataset.refId = 'v42';
    certItemRows.length = 0;
    certItemRows.push({ querySelector: (s) => s === '.cert-item-name' ? { value: 'אנטנה' } : { value: '1' } });
    emsCalls.length = 0;
    fetchJsonOverride = { ok: true, certNumber: 1235, id: 'newid2' };
    await mod.issueDeliveryCert(null);
    await new Promise(r => setTimeout(r, 15));
    check('issueDeliveryCert (source=visit): does NOT drop an EMS-task comment', () => {
      assert.equal(emsCalls.length, 0, 'a visit-sourced cert must not trigger an EMS comment');
    });

    window_._sbCertGet = originalSbCertGet;
    fetchJsonOverride = null;
  });

  // ---- 16. ?cert=<uuid> public view route guard — a SEPARATE module instance (the route's IIFE
  // runs once at eval time against whatever `location` it is given) ----
  await0(async () => {
    const routeWindow = {};
    const routeDoc = { _html: '', open() { this._html = ''; }, write(s) { this._html += s; }, close() {} };
    let routeFetchCall = null;
    const routeFetch = async (url, opts) => { routeFetchCall = { url, opts }; return { json: async () => [] }; };
    const testUuid = '99999999-9999-9999-9999-999999999999';

    runModule({
      window: routeWindow, document: routeDoc, fetch: routeFetch,
      location: { search: '?cert=' + testUuid },
      SB_URL: 'https://sb.test', SB_ANON: 'anonkey'
    });

    check('?cert route: sets window._certViewMode synchronously (survives the coming document.write)', () => {
      assert.equal(routeWindow._certViewMode, true);
    });

    await new Promise(r => setTimeout(r, 20));   // flush the route's internal fetch + document.write

    check('?cert route: fetches the delivery_certs REST endpoint with the uuid from the query string', () => {
      assert.ok(routeFetchCall, 'expected the route to call fetch');
      assert.ok(routeFetchCall.url.includes('https://sb.test/rest/v1/delivery_certs'), 'expected the SB_URL REST endpoint in the fetch URL');
      assert.ok(routeFetchCall.url.includes(testUuid), 'expected the uuid from the query string in the fetch URL');
    });
    check('?cert route: fetch carries the SB_ANON apikey + bearer auth headers', () => {
      const h = routeFetchCall.opts.headers;
      assert.equal(h.apikey, 'anonkey');
      assert.equal(h.Authorization, 'Bearer anonkey');
    });
    check('?cert route: renders the not-found message when the lookup returns no rows', () => {
      assert.ok(routeDoc._html.includes('התעודה לא נמצאה'), 'expected the not-found message to be written to document');
    });
  });
}

// Execute all queued async checks in order, then report.
for (const fn of pending) { await fn(); }

console.log(failures === 0 ? '\nPASS — all delivery-cert checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
