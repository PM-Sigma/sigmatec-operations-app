// Self-check for the visit-draft store in js/src/09-visits.js (spec §5.1c).
//   node test-visit-drafts.mjs
//
// Round 5, V-U3: the legacy form's own autosave (the debounce + the DOM restore round-trip,
// groups A/B of the pre-V-U3 version of this file) is retired with the form. What is left is
// the DATA-shaped store the chapters sheet writes through instead (`visitDraftPut`,
// `app/src/lib/visitDraft.ts` on the React side) — this file now only pins:
//  C. the mirror is a MAP keyed by (person, kibbutz, date), not one slot (review fix 1);
//  D. the cross-device merge rule, newest `updated_at` wins (review fix 2).
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

const storage = {};
const localStorage_ = {
  getItem: k => (k in storage ? storage[k] : null),
  setItem(k, v) { storage[k] = String(v); },
  removeItem(k) { delete storage[k]; },
};
const posts = [];
const fetch_ = (u, o) => {
  if (o && o.body) { try { posts.push(JSON.parse(o.body)); } catch (e) { /* not ours */ } }
  return Promise.resolve({ json: async () => ({ ok: true, id: 'SRV_ID' }) });
};
const emitted = [];
const window_ = { editingVisitId: null, _visitDraftId: null, SHEET_DATA: { visits: [] }, addEventListener() {} };
const document_ = { getElementById: () => null, addEventListener() {} };

function load(kibbutz) {
  const fn = new Function(
    'window', 'document', 'localStorage', 'fetch', 'WRITE_ROUTER_URL', 'setBtnLoading',
    'currentKibbutz', 'getCurrentUser', 'sigmaEmit',
    src + '\nreturn { visitDraftPut, visitDraftFor, visitDraftDiscard, visitDraftsForPerson,'
        + ' draftMergeRows, draftKey };',
  );
  return fn(
    window_, document_, localStorage_, fetch_, 'http://sheet.test', () => {},
    kibbutz || 'גבים', () => 'אביאם',
    (name, detail) => emitted.push({ name, detail }),
  );
}

let mod;
check('09-visits evals with draft stubs', () => { mod = load(); assert.ok(mod && typeof mod.visitDraftPut === 'function'); });

if (mod) {
  const reset = () => {
    Object.keys(storage).forEach(k => delete storage[k]);
    posts.length = 0; emitted.length = 0;
    window_.editingVisitId = null; window_._visitDraftId = null;
  };
  const put = (m, o) => m.visitDraftPut(Object.assign({ person: 'אביאם', kibbutz: 'גבים', date: '2026-09-18', payload: {} }, o));

  check('P1 a put is offered back to the person / kibbutz / day that wrote it', () => {
    reset();
    const m = load('גבים');
    put(m, { payload: { summary: 'שלי' } });
    assert.ok(m.visitDraftFor('גבים', 'אביאם', '2026-09-18'), 'own draft not found');
    assert.equal(m.visitDraftFor('גבת', 'אביאם', '2026-09-18'), null, 'another kibbutz saw it');
    assert.equal(m.visitDraftFor('גבים', 'ניתאי', '2026-09-18'), null, 'another person saw it');
    assert.equal(m.visitDraftFor('גבים', 'אביאם', '2026-09-17'), null, 'another day saw it');
    assert.ok(m.visitDraftFor(null, null, null), 'a wildcard lookup (the nav 🚚) found nothing');
  });

  check('P2 every write announces itself once, so the card chip can follow', () => {
    reset();
    put(load(), {});
    assert.equal(emitted.filter(e => e.name === 'visit-draft-changed').length, 1);
  });

  // ── C. TWO KIBBUTZIM, ONE DAY (review fix 1) ──────────────────────────────
  // The regression that motivated the fix: the mirror was ONE slot, so starting a summary at
  // a second kibbutz on the same day silently destroyed the first one.
  check('C1 a draft at a second kibbutz does not destroy the first', () => {
    reset();
    const gvim = load('גבים');
    put(gvim, { id: 'v_1', kibbutz: 'גבים', payload: { summary: 'בגבים: הוחלף בקר' } });
    const gvat = load('גבת');
    put(gvat, { id: 'v_2', kibbutz: 'גבת', payload: { summary: 'בגבת: נבדקו 4 מונים' } });

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

  check('C3 discarding one draft leaves the other alone', () => {
    const m = load('גבת');
    const atGvat = m.visitDraftFor('גבת', 'אביאם', null);
    m.visitDraftDiscard(atGvat.id, false);
    assert.equal(m.visitDraftFor('גבת', 'אביאם', null), null, 'the discarded draft survived');
    assert.ok(m.visitDraftFor('גבים', 'אביאם', null), 'the OTHER draft was discarded too');
  });

  check('C4 a widened lookup (the nav 🚚) answers with the NEWEST, never an arbitrary one', () => {
    reset();
    const m = load('גבת');
    put(m, { id: 'v_old', kibbutz: 'גבת', date: '2026-09-10', payload: {}, updated_at: '2026-09-10T08:00:00.000Z' });
    put(m, { id: 'v_new', kibbutz: 'גבים', date: '2026-09-18', payload: {} });
    const all = m.visitDraftsForPerson('אביאם');
    const wild = m.visitDraftFor(null, 'אביאם', null);
    assert.ok(wild, 'the wildcard lookup found nothing');
    assert.equal(wild.id, all[0].id, 'the wildcard lookup did not answer with the newest');
  });

  check('C5 a v1 single-slot draft is MIGRATED, not lost', () => {
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
process.exit(failures ? 1 : 0);
