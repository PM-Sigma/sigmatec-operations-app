// Self-check for the visit-draft autosave in js/src/09-visits.js (spec §5.1c).
//   node test-visit-drafts.mjs
//
// Two things matter and neither can be checked from a browser smoke:
//  A. the DEBOUNCE — one save 800 ms after the LAST keystroke, not one per keystroke (a
//     technician types a paragraph on a phone; a write per character is a dead battery);
//  B. the RESTORE ROUND-TRIP — everything the form holds comes back, including the products
//     and their quantities, clamped to what the stepper still allows.
//
// Same loading technique as test-visit-cert-gate.mjs: eval the module in a function scope with
// browser-global stubs. `setTimeout` is a FAKE here, driven by hand, so the debounce is
// measured rather than waited on.
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

// ---- a form made of stub elements -------------------------------------------
const mkEl = (o) => Object.assign(
  { value: '', innerHTML: '', checked: false, disabled: false, style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    closest: () => null, querySelectorAll: () => [], querySelector: () => null, focus() {} },
  o || {},
);

const els = {};
['visitWorkday', 'visitDuration', 'visitor', 'visitDate', 'visitSummary', 'visitOpenItems',
 'visitContact', 'visitProductsOther', 'visitSource', 'toast', 'visitCertStatus', 'modalBackdrop',
 'lastVisitBox', 'lastVisitContent', 'editLastVisitBtn', 'visitsHistoryWrap', 'visitProducts',
 'visitDraftPrompt', 'visitDraftPromptText', 'visitSaveBtn', 'visitDurationChips', 'visitWorkdayChip',
].forEach(id => { els[id] = mkEl(); });

// the products the form is showing, as checkbox/qty pairs
let productRows = [];
const prodChk = (name, checked) => mkEl({ dataset: { product: name }, checked, closest: () => null });
const prodQty = (name, value, max) => mkEl({ dataset: { product: name, max: String(max) }, value: String(value) });

function setProducts(list) {
  productRows = list.map(p => ({ chk: prodChk(p.name, p.checked), qty: prodQty(p.name, p.qty ?? '', p.max ?? 99) }));
}

const document_ = {
  visibilityState: 'visible',
  getElementById: id => els[id] || mkEl(),
  querySelectorAll: sel => {
    if (sel === '.prod-chk:checked') return productRows.filter(r => r.chk.checked).map(r => r.chk);
    if (sel === '.prod-chk') return productRows.map(r => r.chk);
    return [];
  },
  querySelector: sel => {
    const m = /\.prod-(chk|qty)\[data-product="([^"]+)"\]/.exec(sel);
    if (m) { const row = productRows.find(r => r.chk.dataset.product === m[2]); return row ? (m[1] === 'chk' ? row.chk : row.qty) : null; }
    return null;
  },
  createElement: () => mkEl(),
  addEventListener() {},
};

const storage = {};
const localStorage_ = {
  getItem: k => (k in storage ? storage[k] : null),
  setItem(k, v) { storage[k] = String(v); },
  removeItem(k) { delete storage[k]; },
};

// ---- a FAKE setTimeout we drive by hand --------------------------------------
let now = 0;
let timers = [];
let seq = 0;
const setTimeout_ = (fn, ms) => { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; };
const clearTimeout_ = (id) => { timers = timers.filter(t => t.id !== id); };
/** Advance the clock and fire everything due. */
function tick(ms) {
  now += ms;
  const due = timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at);
  timers = timers.filter(t => t.at > now);
  due.forEach(t => t.fn());
}

const posts = [];
const fetch_ = (u, o) => {
  if (o && o.body) { try { posts.push(JSON.parse(o.body)); } catch (e) { /* not ours */ } }
  return Promise.resolve({ json: async () => ({ ok: true, id: 'SRV_ID' }) });
};

const window_ = {
  editingVisitId: null, _visitDraftId: null, SHEET_DATA: { visits: [] }, currentKibbutzVisits: [],
  _certIssuedFor: {}, addEventListener() {},
};
const emitted = [];

function load(kibbutz) {
  const fn = new Function(
    'window', 'document', 'localStorage', 'fetch', 'alert', 'WRITE_ROUTER_URL', 'setBtnLoading',
    'certIssuedForVisit', 'readVisitEmsIntent', 'pushVisitToEms', 'refreshData', 'closeModal',
    'currentKibbutz', 'STOCK_HOLDERS', 'DEFECTIVE_LOCATION', 'POOL_LOCATION', 'computeStock', 'switchTab', 'onVisitorChange',
    'visitReturnedItems', 'renderReturnedItems', 'setTimeout', 'clearTimeout', 'getCurrentUser', 'sigmaEmit',
    src + '\nreturn { visitDraftSave, visitDraftTouch, visitDraftFlush, visitDraftFor, visitDraftRestore,'
        + ' visitDraftDiscard, visitDraftPayload, visitDraftHasContent, saveVisit,'
        + ' visitDraftsForPerson, draftMergeRows, draftKey };',
  );
  return fn(
    window_, document_, localStorage_, fetch_, () => {}, 'http://sheet.test', () => {},
    async () => 0, () => '', () => {}, () => {}, () => {},
    kibbutz || 'גבים', ['אביאם'], 'תקול', 'חברה', () => ({}), () => {}, () => {},
    [], () => {}, setTimeout_, clearTimeout_, () => 'אביאם',
    (name, detail) => emitted.push({ name, detail }),
  );
}

let mod;
check('09-visits evals with draft stubs', () => { mod = load(); assert.ok(mod && typeof mod.visitDraftSave === 'function'); });

if (mod) {
  const reset = () => {
    Object.keys(storage).forEach(k => delete storage[k]);
    posts.length = 0; emitted.length = 0; timers = []; now = 0;
    window_.editingVisitId = null; window_._visitDraftId = null;
    Object.values(els).forEach(el => { el.value = ''; el.checked = false; });
    setProducts([]);
  };
  const drafts = () => posts.filter(p => p.type === 'visitDraft');

  // ---- A. the debounce ----
  reset();
  els.visitSummary.value = 'ה';
  mod.visitDraftTouch();
  els.visitSummary.value = 'הו';
  mod.visitDraftTouch();
  els.visitSummary.value = 'הוח';
  mod.visitDraftTouch();
  check('A1 typing three characters schedules ONE save, not three', () => {
    tick(799);
    assert.equal(drafts().length, 0, 'saved before the 800 ms was up');
    tick(2);
    assert.equal(drafts().length, 1, 'expected exactly one save, got ' + drafts().length);
  });

  check('A2 the saved draft carries the LAST value typed', () => {
    assert.equal(drafts()[0].draft.payload.summary, 'הוח');
  });

  check('A3 the draft is keyed by the pre-minted visit id (the cert links to the same id)', () => {
    assert.ok(/^v_/.test(drafts()[0].draft.id), 'draft id v_… expected, got ' + drafts()[0].draft.id);
    assert.equal(drafts()[0].draft.id, window_._visitDraftId);
  });

  check('A4 a flush (tab switch / pagehide) saves immediately, with no pending timer left', () => {
    reset();
    els.visitSummary.value = 'חצי משפט';
    mod.visitDraftTouch();
    mod.visitDraftFlush();
    assert.equal(drafts().length, 1, 'flush did not save');
    tick(5000);
    assert.equal(drafts().length, 1, 'the pending timer fired again after the flush');
  });

  check('A5 an untouched form leaves NO draft (nothing to restore, nothing to offer)', () => {
    reset();
    mod.visitDraftFlush();
    assert.equal(drafts().length, 0);
    assert.equal(mod.visitDraftFor('גבים', 'אביאם', null), null);
  });

  check('A6 editing an existing visit never writes a draft — the visit IS the record', () => {
    reset();
    window_.editingVisitId = 'v_OLD';
    els.visitSummary.value = 'תיקון';
    mod.visitDraftTouch();
    tick(1000);
    mod.visitDraftFlush();
    assert.equal(drafts().length, 0);
  });

  // ---- B. the restore round-trip ----
  check('B1 everything typed comes back, products and quantities included', () => {
    reset();
    els.visitor.value = 'אביאם';
    els.visitSource.value = 'משרד';
    els.visitDate.value = '2026-09-18';
    els.visitDuration.value = '2.5';
    els.visitSummary.value = 'הוחלף בקר';
    els.visitOpenItems.value = 'CT חלופי למונה 133';
    els.visitContact.value = 'צביקה';
    els.visitProductsOther.value = 'כבל 3מ';
    setProducts([{ name: 'אנטנה', checked: true, qty: 2, max: 5 }, { name: 'Partner Sim', checked: false }]);
    mod.visitDraftFlush();

    const saved = mod.visitDraftFor('גבים', 'אביאם', '2026-09-18');
    assert.ok(saved, 'no draft found for the kibbutz/person/day that wrote it');

    // wipe the form, as a reload would
    ['visitSummary', 'visitOpenItems', 'visitContact', 'visitProductsOther', 'visitDuration'].forEach(id => { els[id].value = ''; });
    setProducts([{ name: 'אנטנה', checked: false, qty: '', max: 5 }, { name: 'Partner Sim', checked: false }]);

    assert.equal(mod.visitDraftRestore(), true, 'restore reported failure');
    assert.equal(els.visitSummary.value, 'הוחלף בקר');
    assert.equal(els.visitOpenItems.value, 'CT חלופי למונה 133');
    assert.equal(els.visitContact.value, 'צביקה');
    assert.equal(els.visitProductsOther.value, 'כבל 3מ');
    assert.equal(els.visitDuration.value, '2.5');
    const antenna = productRows.find(r => r.chk.dataset.product === 'אנטנה');
    assert.equal(antenna.chk.checked, true, 'the ticked product came back unticked');
    assert.equal(antenna.qty.value, '2', 'the quantity did not come back');
  });

  check('B2 a quantity larger than the stock still available is clamped on restore', () => {
    reset();
    els.visitSummary.value = 'x';
    setProducts([{ name: 'אנטנה', checked: true, qty: 9, max: 9 }]);
    mod.visitDraftFlush();
    // someone else took the stock in the meantime → the stepper's max is lower now
    setProducts([{ name: 'אנטנה', checked: false, qty: '', max: 3 }]);
    mod.visitDraftRestore();
    assert.equal(productRows[0].qty.value, '3');
  });

  check('B3 the workday flag survives the round-trip', () => {
    reset();
    els.visitWorkday.checked = true;
    els.visitSummary.value = 'יום שלם בשדה';
    mod.visitDraftFlush();
    els.visitWorkday.checked = false;
    mod.visitDraftRestore();
    assert.equal(els.visitWorkday.checked, true);
  });

  check('B4 a draft is only offered to the person / kibbutz / day that wrote it', () => {
    reset();
    els.visitDate.value = '2026-09-18';
    els.visitSummary.value = 'שלי';
    mod.visitDraftFlush();
    assert.ok(mod.visitDraftFor('גבים', 'אביאם', '2026-09-18'), 'own draft not found');
    assert.equal(mod.visitDraftFor('גבת', 'אביאם', '2026-09-18'), null, 'another kibbutz saw it');
    assert.equal(mod.visitDraftFor('גבים', 'ניתאי', '2026-09-18'), null, 'another person saw it');
    assert.equal(mod.visitDraftFor('גבים', 'אביאם', '2026-09-17'), null, 'another day saw it');
    assert.ok(mod.visitDraftFor(null, null, null), 'a wildcard lookup (the nav 🚚) found nothing');
  });

  check('B5 "התחל מחדש" clears both the store and the fields', () => {
    reset();
    els.visitSummary.value = 'טעות';
    mod.visitDraftFlush();
    mod.visitDraftDiscard(null, true);
    assert.equal(mod.visitDraftFor('גבים', 'אביאם', null), null, 'the draft survived a discard');
    assert.equal(els.visitSummary.value, '', 'the field was not cleared');
    assert.ok(posts.some(p => p.type === 'visitDraftDelete'), 'no delete was sent');
  });

  check('B6 every write announces itself once, so the card chip can follow', () => {
    reset();
    els.visitSummary.value = 'מ';
    mod.visitDraftFlush();
    assert.equal(emitted.filter(e => e.name === 'visit-draft-changed').length, 1);
  });

  // ── C. TWO KIBBUTZIM, ONE DAY (review fix 1) ──────────────────────────────
  // The regression that motivated the fix: the mirror was ONE slot, so starting a summary at
  // a second kibbutz on the same day silently destroyed the first one.
  check('C1 a draft at a second kibbutz does not destroy the first', () => {
    reset();
    const gvim = load('גבים');
    els.visitDate.value = '2026-09-18';
    els.visitSummary.value = 'בגבים: הוחלף בקר';
    gvim.visitDraftFlush();
    // …then גבת, same person, same day. A fresh load() mints a NEW draft id, exactly as a
    // second card opening the form does.
    window_._visitDraftId = null;
    const gvat = load('גבת');
    els.visitSummary.value = 'בגבת: נבדקו 4 מונים';
    gvat.visitDraftFlush();

    const mine = gvat.visitDraftsForPerson('אביאם');
    assert.equal(mine.length, 2, 'expected BOTH drafts, got ' + mine.length);
    assert.deepEqual(mine.map(r => r.kibbutz).sort(), ['גבים', 'גבת']);
  });

  check('C2 each kibbutz gets ITS OWN draft back, not the other one', () => {
    const m = load('גבת');
    const atGvim = m.visitDraftFor('גבים', 'אביאם', '2026-09-18');
    const atGvat = m.visitDraftFor('גבת', 'אביאם', '2026-09-18');
    assert.ok(atGvim && atGvat, 'one of the two lookups found nothing');
    assert.equal(atGvim.payload.summary, 'בגבים: הוחלף בקר');
    assert.equal(atGvat.payload.summary, 'בגבת: נבדקו 4 מונים');
    assert.notEqual(atGvim.id, atGvat.id, 'the two drafts share one id');
  });

  check('C3 restore picks the draft of the kibbutz on screen', () => {
    const m = load('גבים');
    els.visitSummary.value = '';
    m.visitDraftRestore();
    assert.equal(els.visitSummary.value, 'בגבים: הוחלף בקר');
  });

  check('C4 restore BY ID reaches a draft from another kibbutz (the prompt list)', () => {
    const m = load('גבים');
    const atGvat = m.visitDraftFor('גבת', 'אביאם', null);
    els.visitSummary.value = '';
    m.visitDraftRestore(atGvat.id);
    assert.equal(els.visitSummary.value, 'בגבת: נבדקו 4 מונים');
  });

  check('C5 discarding one draft leaves the other alone', () => {
    const m = load('גבת');
    const atGvat = m.visitDraftFor('גבת', 'אביאם', null);
    m.visitDraftDiscard(atGvat.id, false);
    assert.equal(m.visitDraftFor('גבת', 'אביאם', null), null, 'the discarded draft survived');
    assert.ok(m.visitDraftFor('גבים', 'אביאם', null), 'the OTHER draft was discarded too');
  });

  check('C6 a widened lookup (the nav 🚚) answers with the NEWEST, never an arbitrary one', () => {
    const m = load('גבת');
    const all = m.visitDraftsForPerson('אביאם');
    const wild = m.visitDraftFor(null, 'אביאם', null);
    assert.ok(wild, 'the wildcard lookup found nothing');
    assert.equal(wild.id, all[0].id, 'the wildcard lookup did not answer with the newest');
  });

  check('C7 a v1 single-slot draft is MIGRATED, not lost', () => {
    reset();
    storage['visitDraft_v1'] = JSON.stringify({
      id: 'v_OLD1', person: 'אביאם', kibbutz: 'חוקוק', date: '2026-09-18',
      payload: { kibbutz: 'חוקוק', summary: 'מהגרסה הקודמת' }, updated_at: '2026-09-18T08:00:00.000Z',
    });
    const m = load('חוקוק');
    const found = m.visitDraftFor('חוקוק', 'אביאם', '2026-09-18');
    assert.ok(found, 'the v1 draft was not migrated');
    assert.equal(found.payload.summary, 'מהגרסה הקודמת');
    assert.equal(storage['visitDraft_v1'], undefined, 'the v1 key was not cleaned up');
  });

  // ── D. the cross-device merge rule (review fix 2) ─────────────────────────
  const row = (o) => Object.assign({ person: 'אביאם', kibbutz: 'גבים', date: '2026-09-18' }, o);
  const KEY = 'אביאם|גבים|2026-09-18';

  check('D1 newest updated_at wins — remote over local', () => {
    const m = load('גבים');
    const mine = { [KEY]: row({ id: 'L', updated_at: '2026-09-18T10:00:00.000Z', payload: { summary: 'מקומי' } }) };
    const remote = [row({ id: 'R', updated_at: '2026-09-18T11:00:00.000Z', payload: { summary: 'מהמכשיר השני' } })];
    assert.equal(m.draftMergeRows(mine, remote)[KEY].payload.summary, 'מהמכשיר השני');
  });

  check('D2 …and local over remote when the local one is newer (offline typing is not lost)', () => {
    const m = load('גבים');
    const mine = { [KEY]: row({ id: 'L', updated_at: '2026-09-18T12:00:00.000Z', payload: { summary: 'מקומי חדש' } }) };
    const remote = [row({ id: 'R', updated_at: '2026-09-18T11:00:00.000Z', payload: { summary: 'מהמכשיר השני' } })];
    assert.equal(m.draftMergeRows(mine, remote)[KEY].payload.summary, 'מקומי חדש');
  });

  check('D3 a remote draft for a kibbutz this device never saw is ADDED', () => {
    const m = load('גבים');
    const merged = m.draftMergeRows({}, [row({ id: 'R2', kibbutz: 'יגור', updated_at: '2026-09-18T09:00:00.000Z' })]);
    assert.equal(Object.keys(merged).length, 1);
    assert.equal(merged['אביאם|יגור|2026-09-18'].id, 'R2');
  });

  check('D4 junk rows from the server are ignored, not merged', () => {
    const m = load('גבים');
    assert.deepEqual(m.draftMergeRows({}, [null, {}, { id: 'x' }, { kibbutz: 'y' }]), {});
  });

  check('D5 the merge never mutates the mirror it was handed', () => {
    const m = load('גבים');
    const mine = { k: { id: 'L', updated_at: '2026-01-01' } };
    const copy = JSON.parse(JSON.stringify(mine));
    m.draftMergeRows(mine, [row({ id: 'R', updated_at: '2030-01-01' })]);
    assert.deepEqual(mine, copy);
  });
}

console.log(failures === 0 ? '\nPASS — all visit-draft checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
