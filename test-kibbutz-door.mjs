// test-kibbutz-door.mjs: the ONE door to a kibbutz (round 5, package K-L3).
//   node test-kibbutz-door.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./js/src/00-bridge.js', import.meta.url), 'utf8');

function load({ detail = null, placeholder = false, cards = [] } = {}) {
  const calls = [];
  const cardEls = cards.map(n => ({ dataset: { name: n } }));
  const window = {
    sigmaKibbutzDetail: detail,
    sigmaBus: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
    openEditModal: card => calls.push(['legacy', card.dataset.name]),
    switchTab: t => calls.push(['tab', t]),
  };
  const document = {
    querySelectorAll: sel => (sel === '.kibbutz[data-name]' ? cardEls : []),
    querySelector: () => null, addEventListener() {},
    getElementById: id => (placeholder && id === 'sigma-kibbutz-detail' ? {} : null),
  };
  const ctx = vm.createContext({ window, document, console, CSS: { escape: s => s }, setTimeout, localStorage: { getItem() { return null; }, setItem() {} } });
  ctx.self = window; ctx.globalThis = ctx;
  vm.runInContext(src, ctx);
  return { sigma: window.sigma, window, calls };
}

// D1 island mounted → it opens, tab mapped
{
  const opened = [];
  const { sigma } = load({ detail: { open: (n, t) => opened.push([n, t]) } });
  sigma.openKibbutzModal('חוקוק');
  sigma.openKibbutzModal('חוקוק', 'meetings');
  sigma.openKibbutzModal('חוקוק', 'visit');
  assert.deepEqual(opened, [['חוקוק', 'status'], ['חוקוק', 'status'], ['חוקוק', 'visits']]);
}
// D2-D4 (round 5, V-U3): the pre-K-U1 legacy-modal fallback is gone — #sigma-kibbutz-detail is
// always in the DOM now, so an island not yet landed always QUEUES the open, never touches a
// card or the legacy modal, whatever the tab name or the kibbutz name.
{
  const { sigma, calls, window } = load({ cards: ['יגור', 'חוקוק'] });
  sigma.openKibbutzModal('חוקוק', 'visit');
  assert.deepEqual(calls, []);
  assert.deepEqual(window._kibbutzDoorQueue, { name: 'חוקוק', tab: 'visits' });
}
{
  const { sigma, window } = load({ cards: ['יגור — רפת', 'בית "השיטה"'] });
  sigma.openKibbutzModal('בית "השיטה"');
  assert.deepEqual(window._kibbutzDoorQueue, { name: 'בית "השיטה"', tab: 'status' });
}
// D5 placeholder present, chunk not landed yet → queued (last wins), never the legacy modal
{
  const { sigma, window, calls } = load({ placeholder: true, cards: ['יגור'] });
  sigma.openKibbutzModal('יגור');
  sigma.openKibbutzModal('חוקוק', 'visit');
  assert.deepEqual(calls, []);
  assert.deepEqual(window._kibbutzDoorQueue, { name: 'חוקוק', tab: 'visits' });
}
// D6 createEmsTaskFor hands the NAME to createEmsTaskForKibbutz (no reliance on the modal's currentKibbutz)
await (async () => {
  const got = [];
  const { sigma, window } = load();
  window.createEmsTaskForKibbutz = n => { got.push(n); return Promise.resolve(); };
  await sigma.createEmsTaskFor('יגור');
  assert.deepEqual(got, ['יגור']);
})();
// D6b createEmsTaskFor is a no-op for the viewer — never creates a task
await (async () => {
  const got = [];
  const { sigma, window } = load();
  window.isViewer = () => true;
  window.createEmsTaskForKibbutz = n => { got.push(n); return Promise.resolve(); };
  await sigma.createEmsTaskFor('יגור');
  assert.deepEqual(got, []);
})();

console.log('test-kibbutz-door: 7 groups passed');
