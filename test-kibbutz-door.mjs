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
// D2 legacy era (no placeholder, no island) → legacy modal on the matching card
{
  const { sigma, calls } = load({ cards: ['יגור', 'חוקוק'] });
  sigma.openKibbutzModal('חוקוק', 'visit');
  assert.deepEqual(calls, [['legacy', 'חוקוק'], ['tab', 'visit']]);
}
// D3 unknown kibbutz in the legacy era → no throw, nothing opened
{
  const { sigma, calls } = load({ cards: ['יגור'] });
  sigma.openKibbutzModal('אין כזה');
  assert.deepEqual(calls, []);
}
// D4 a name a CSS selector would choke on
{
  const { sigma, calls } = load({ cards: ['יגור — רפת', 'בית "השיטה"'] });
  sigma.openKibbutzModal('בית "השיטה"');
  assert.deepEqual(calls[0], ['legacy', 'בית "השיטה"']);
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

console.log('test-kibbutz-door: 6 groups passed');
