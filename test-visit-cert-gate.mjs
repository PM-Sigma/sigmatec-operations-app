// Self-check for the saveVisit delivery-cert GATE (js/src/09-visits.js, build 1.41).
// Rule under test: equipment supplied in a visit requires an ISSUED (active) cert linked to the
// visit — enforced for NEW visits, and for edits that ADD products where none were documented;
// edits of visits that already had products pass (no retroactive blocking).
// Run: node test-visit-cert-gate.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/09-visits.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ---- stubs ----
const mkEl = (o) => Object.assign({ value: '', innerHTML: '', checked: false, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false } }, o || {});
const els = {};
['visitWorkday', 'visitDuration', 'visitor', 'visitDate', 'visitSummary', 'visitContact',
  'visitProductsOther', 'visitSource', 'toast', 'visitCertStatus', 'modalBackdrop', 'lastVisitBox',
  'lastVisitContent', 'editLastVisitBtn', 'visitsHistoryWrap', 'visitProducts'].forEach(id => { els[id] = mkEl(); });
els.visitDuration.value = '2'; els.visitor.value = 'אביאם'; els.visitDate.value = '2026-07-15';
els.visitSummary.value = 'סיכום בדיקה'; els.visitSource.value = 'משרד';

let checkedProds = [];
const document_ = {
  getElementById: id => els[id] || mkEl(),
  querySelectorAll: sel => (sel === '.prod-chk:checked') ? checkedProds.slice() : [],
  querySelector: sel => /\.prod-qty/.test(sel) ? { value: '2', dataset: { max: '5' } } : null,
  createElement: () => mkEl(),
  addEventListener() {}
};
const window_ = { editingVisitId: null, _visitDraftId: null, SHEET_DATA: { visits: [] }, currentKibbutzVisits: [], _certIssuedFor: {} };
const storage = {}; const localStorage_ = { getItem: k => storage[k] ?? null, setItem(k, v) { storage[k] = v; }, removeItem(k) { delete storage[k]; } };
const alerts = []; const fetchBodies = []; const btnStates = [];
let certReturn = 0;
const fetch_ = (u, o) => { if (o && o.body) { try { fetchBodies.push(JSON.parse(o.body)); } catch (e) {} } return Promise.resolve({ json: async () => ({ ok: true, id: 'SRV_ID' }) }); };

function load() {
  const fn = new Function(
    'window', 'document', 'localStorage', 'fetch', 'alert', 'SHEET_API', 'setBtnLoading',
    'certIssuedForVisit', 'readVisitEmsIntent', 'pushVisitToEms', 'refreshData', 'closeModal',
    'currentKibbutz', 'STOCK_HOLDERS', 'DEFECTIVE_LOCATION', 'computeStock', 'switchTab', 'onVisitorChange',
    'visitReturnedItems', 'renderReturnedItems',
    src + '\nreturn { saveVisit, visitDraftId };'
  );
  return fn(
    window_, document_, localStorage_, fetch_, m => alerts.push(m), 'http://sheet.test',
    (btn, on) => btnStates.push(on),
    async () => certReturn, () => '', () => {}, () => {}, () => {},
    'שדה אליהו', ['אביאם'], 'תקול', () => ({}), () => {}, () => {},
    [], () => {}
  );
}

let mod;
check('09-visits evals with gate stubs', () => { mod = load(); assert.ok(mod && typeof mod.saveVisit === 'function'); });

if (mod) {
  const flush = () => new Promise(r => setTimeout(r, 25));
  const visitPosts = () => fetchBodies.filter(b => b.type === 'visit');
  const reset = () => { alerts.length = 0; fetchBodies.length = 0; btnStates.length = 0; window_.editingVisitId = null; window_._visitDraftId = null; window_.currentKibbutzVisits = []; };

  await (async () => {
    // B1: new visit + products + no cert → BLOCKED
    reset(); checkedProds = [{ dataset: { product: 'אנטנה' } }]; certReturn = 0;
    await mod.saveVisit(null); await flush();
    check('B1 gate blocks a new visit with products and no issued cert', () => {
      assert.ok(alerts.some(a => a.includes('תעודת משלוח')), 'expected gate alert');
      assert.equal(visitPosts().length, 0, 'no visit POST when blocked');
      assert.equal(btnStates[btnStates.length - 1], false, 'save button unlocked after block');
    });
    // B2: the gate minted a draft id (the same id the cert will link to)
    check('B2 gate mints a draft visit id', () => {
      assert.ok(window_._visitDraftId && /^v_/.test(window_._visitDraftId), 'draft id v_… expected, got ' + window_._visitDraftId);
    });

    // B3: cert issued for the draft → save proceeds, POST carries the SAME id + isNew
    const draft = window_._visitDraftId;
    certReturn = 4321; alerts.length = 0; fetchBodies.length = 0;
    await mod.saveVisit(null); await flush();
    check('B3 issued cert unlocks the save; POST carries the linked id + isNew', () => {
      assert.equal(visitPosts().length, 1, 'exactly one visit POST');
      assert.equal(visitPosts()[0].id, draft, 'visit POST id === cert refId');
      assert.equal(visitPosts()[0].isNew, true);
      assert.ok(!alerts.some(a => a.includes('תעודת משלוח')), 'no gate alert');
    });
    check('B6 draft id cleared after a successful save', () => {
      assert.equal(window_._visitDraftId, null);
      assert.equal(window_.editingVisitId, null);
    });

    // B4a: legacy edit — visit already had products → passes without cert
    reset(); checkedProds = [{ dataset: { product: 'אנטנה' } }]; certReturn = 0;
    window_.editingVisitId = 'v_OLD';
    window_.currentKibbutzVisits = [{ id: 'v_OLD', products: [{ name: 'אנטנה', qty: 1 }] }];
    await mod.saveVisit(null); await flush();
    check('B4a editing a visit that already had products is NOT blocked retroactively', () => {
      assert.equal(visitPosts().length, 1, 'visit POST expected');
      assert.equal(visitPosts()[0].id, 'v_OLD');
      assert.equal(visitPosts()[0].isNew, false);
      assert.ok(!alerts.some(a => a.includes('תעודת משלוח')));
    });

    // B4b: edit that ADDS products where none existed → blocked without cert
    reset(); checkedProds = [{ dataset: { product: 'אנטנה' } }]; certReturn = 0;
    window_.editingVisitId = 'v_OLD2';
    window_.currentKibbutzVisits = [{ id: 'v_OLD2', products: [] }];
    await mod.saveVisit(null); await flush();
    check('B4b edit adding products where none were documented IS gated', () => {
      assert.ok(alerts.some(a => a.includes('תעודת משלוח')));
      assert.equal(visitPosts().length, 0);
    });

    // B5: no products → no gate at all
    reset(); checkedProds = []; certReturn = 0;
    await mod.saveVisit(null); await flush();
    check('B5 a visit without products saves with no cert gate', () => {
      assert.equal(visitPosts().length, 1);
      assert.ok(!alerts.some(a => a.includes('תעודת משלוח')));
    });
  })();
}

console.log(failures === 0 ? '\nPASS — all visit-cert-gate checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
