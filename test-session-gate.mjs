// Session & access hardening (spec §7n) — the LEGACY half.
//   node test-session-gate.mjs
//
// Three things are pinned here, all of them in js/src:
//   1. the 401 funnel (js/src/00-bridge.js `sigmaSessionExpired`): many concurrent 401s →
//      ONE `session-expired`, the re-login sheet is the surface, a public cert link is exempt;
//   2. `sigmaBeginReLogin` keeps the page + the scroll position and opens the sign-in;
//   3. the contracts the React side cannot see: `?login=0` is host-gated, the re-mint timer
//      math matches app/src/lib/remint.ts, no 401 path jumps to the retired EMS page, and the
//      bridge JWT is minted for 180 min.
//
// The bridge module is eval'd inside a function scope with browser-global stubs — the same
// approach as test-viewer-gate.mjs.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ───────────────────────── the funnel, really run ─────────────────────────

function loadBridge({ certView = false, withSheet = true, page = 'inventory', scrollY = 240 } = {}) {
  const events = [];
  const sheetOpens = [];
  const legacyModalOpens = [];
  const session = new Map();
  const gateEl = { style: {} };

  const window_ = {
    _currentPage: page,
    scrollY,
    _certViewMode: certView,
    sigmaBus: {
      dispatchEvent(e) { events.push({ type: e.type, detail: e.detail }); },
      // the module subscribes to visit-form-open / visit-saved (the in-place restore flag)
      addEventListener() {}, removeEventListener() {},
    },
    emsRequireLogin: () => legacyModalOpens.push(1),
    location: { reload() { window_.reloaded = true; }, hostname: 'pm-sigma.github.io', search: '' },
  };
  if (withSheet) window_.sigmaOpenReLogin = () => sheetOpens.push(1);

  const document_ = {
    getElementById: id => (id === 'emsLoginGate' ? gateEl : null),
    addEventListener() {},
  };
  const sessionStorage_ = {
    getItem: k => (session.has(k) ? session.get(k) : null),
    setItem: (k, v) => session.set(k, String(v)),
    removeItem: k => session.delete(k),
  };
  const src = read('js/src/00-bridge.js');
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'window', 'document', 'sessionStorage', 'localStorage', 'CustomEvent', 'console', 'location',
    '(function(){' + src + '})();',
  );
  fn(
    window_, document_, sessionStorage_,
    { getItem: () => null, setItem() {}, removeItem() {} },
    class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    console, window_.location,
  );
  return { window_, events, sheetOpens, legacyModalOpens, session, gateEl };
}

console.log('\n── 401 funnel: one expiry, whatever fired it');

check('five concurrent 401s raise exactly ONE session-expired', () => {
  const { window_, events, sheetOpens } = loadBridge();
  const results = [1, 2, 3, 4, 5].map(() => window_.sigmaSessionExpired('sb-401'));
  assert.strictEqual(results.filter(Boolean).length, 1, 'more than one expiry announced');
  assert.strictEqual(events.filter(e => e.type === 'session-expired').length, 1);
  assert.strictEqual(sheetOpens.length, 1, 'the sheet must open exactly once');
  assert.strictEqual(events[0].detail.reason, 'sb-401');
});

check('the sheet is the surface; the legacy modal is only the fallback', () => {
  const withSheet = loadBridge({ withSheet: true });
  withSheet.window_.sigmaSessionExpired('ems-401');
  assert.strictEqual(withSheet.legacyModalOpens.length, 0);

  const noSheet = loadBridge({ withSheet: false });
  noSheet.window_.sigmaSessionExpired('ems-401');
  assert.strictEqual(noSheet.legacyModalOpens.length, 1);
});

check('a public certificate link never sees a sign-in', () => {
  const { window_, events, sheetOpens } = loadBridge({ certView: true });
  assert.strictEqual(window_.sigmaSessionExpired('sb-401'), false);
  assert.deepStrictEqual(events, []);
  assert.strictEqual(sheetOpens.length, 0);
});

console.log('\n── handing over to the sign-in keeps the place');

check('the page and the scroll position are remembered, and the gate opens', () => {
  const { window_, session, gateEl } = loadBridge({ page: 'inventory', scrollY: 640 });
  window_.sigmaBeginReLogin();
  assert.strictEqual(session.get('ems_return_page_v1'), 'inventory');
  assert.strictEqual(session.get('ems_return_scroll_v1'), '640');
  assert.strictEqual(gateEl.style.display, 'flex');
});

check('the retired EMS page is never the destination', () => {
  const { window_, session } = loadBridge({ page: 'ems' });
  window_.sigmaBeginReLogin();
  assert.ok(!session.get('ems_return_page_v1'), 'must not send anyone back to the EMS page');
});

check('the bridge exposes the funnel and the one mint promise to the islands', () => {
  const { window_ } = loadBridge();
  for (const fn of ['sessionExpired', 'beginReLogin', 'ensurePass', 'remintOnce', 'passPending']) {
    assert.strictEqual(typeof window_.sigma[fn], 'function', fn + ' is missing from the bridge');
  }
});

console.log('\n── a cold boot is not an expiry (review fix 1)');

check('a 401 while the pass is still being minted is ignored', () => {
  const { window_, events, sheetOpens } = loadBridge();
  window_._sbPassPending = true;
  assert.strictEqual(window_.sigmaSessionExpired('sb-read-401'), false);
  assert.deepStrictEqual(events, []);
  assert.strictEqual(sheetOpens.length, 0);
});

check('a 401 that crossed a fresh mint (< 2 s) is ignored', () => {
  const { window_, events } = loadBridge();
  window_._sbPassPending = false;
  window_._sbPassMintedAt = Date.now();
  assert.strictEqual(window_.sigmaSessionExpired('sb-read-401'), false);
  assert.deepStrictEqual(events, []);
});

check('once the mint is old, a real 401 IS an expiry', () => {
  const { window_, events } = loadBridge();
  window_._sbPassMintedAt = Date.now() - 5000;
  assert.strictEqual(window_.sigmaSessionExpired('sb-read-401'), true);
  assert.strictEqual(events.length, 1);
});

check('the cold-boot read sequence: one mint, one retry, no sheet', async () => {
  // The real shape of the bug: kibbutzimBoot fires while the mint is in flight. `sbGet` now
  // awaits the ONE memoized promise, so the read goes out WITH the pass; and if a 401 still
  // comes back it buys one forced re-mint + retry before anyone is asked to sign in.
  const src = read('js/src/01-data.js');
  assert.match(src, /const sbGet = async \(path, retried\) => \{\s*\n\s*await sbEnsure\(\);/,
    'every read must await the pass BEFORE the request');
  assert.match(src, /if \(r\.status === 401 && !retried[\s\S]{0,200}sbRemintOnce/, 'one retry per read');
  assert.match(src, /if \(status !== 401\) return;/, 'only a 401 may reach the funnel');
  // the writes wait on the same promise instead of their own ad-hoc mint
  assert.match(src, /try \{ await sbEnsure\(\); \} catch/);
  const gate = read('js/src/15-login-gate.js');
  assert.match(gate, /function sbEnsurePass\(\)/);
  assert.match(gate, /if \(_ensureInflight\) return _ensureInflight;/, 'the mint must be memoized');
  assert.match(gate, /window\._sbPassMintedAt = Date\.now\(\);/, 'the grace stamp');
});

console.log('\n── the view-only entry holds a pass like everyone else (review fix 2)');

check('the access code is no longer a constant in the client bundle', () => {
  const gate = read('js/src/15-login-gate.js');
  assert.doesNotMatch(gate, /VIEWER_PIN\s*=\s*['"]/, 'the PIN must not be a client constant any more');
  assert.match(gate, /mode: 'viewer', pin: pin/, 'the gate asks the function to check the code');
  assert.match(gate, /window\._sbToken = d\.token/, 'a viewer must end up holding a pass');
});

check('the function checks the code itself and fails closed until the secret is set', () => {
  const fn = read('supabase/functions/ems-auth/index.ts');
  assert.match(fn, /Deno\.env\.get\("VIEWER_PIN"\)/);
  assert.match(fn, /setup: "VIEWER_PIN"/, 'an unset secret must say so, not fall back');
  assert.match(fn, /mintPass\("viewer", \{ viewer: true \}\)/);
});

check('a logout drops the pass and everything that would renew it', () => {
  const gate = read('js/src/15-login-gate.js');
  const logout = gate.slice(gate.indexOf('window.gateLogout'));
  assert.match(logout, /clearTimeout\(window\._sbRefreshTimer\)/);
  assert.match(logout, /window\._sbToken = null/);
  assert.match(logout, /removeItem\(window\.VIEWER_CODE_KEY\)/);
});

check('a re-login inside the visit form restores in place instead of reloading', () => {
  const gate = read('js/src/15-login-gate.js');
  assert.match(gate, /if \(window\._visitFormOpen\)[\s\S]{0,900}return;/);
  assert.match(read('js/src/00-bridge.js'), /'visit-form-open', function \(\) \{ window\._visitFormOpen = true;/);
});

check('the sheet offers back only THIS person\'s draft', () => {
  assert.match(read('app/src/components/ReLoginSheet.tsx'), /visitDraftFor\?\.\(null, me\)/);
});

// ───────────────────────── source contracts ─────────────────────────

console.log('\n── contracts');

check('?login=0 is honoured only on a developer machine / branch preview', () => {
  const src = read('js/src/11-search-login.js');
  assert.match(src, /function mockHostAllowed/, 'the host rule must live next to LOGIN_FLAG');
  assert.match(src, /LOGIN_FLAG = !\(location\.search\.indexOf\('login=0'\) !== -1 && mockHostAllowed\(\)\)/);
  assert.match(src, /githack\\?\.com/, 'the githack preview must be allowed');
  // and the production origin must NOT be in the allow-list
  assert.doesNotMatch(src, /pm-sigma\.github\.io/);
});

check('the re-mint math matches app/src/lib/remint.ts', () => {
  const legacy = read('js/src/15-login-gate.js');
  const ts = read('app/src/lib/remint.ts');
  for (const [name, re] of [
    ['180 min pass', /180 \* 60/],
    ['50 min re-mint', /50 \* 60/],
    ['10 min margin', /10 \* 60/],
  ]) {
    assert.match(legacy, re, 'legacy: ' + name);
  }
  assert.match(ts, /PASS_TTL_MS = 180 \* 60_000/);
  assert.match(ts, /REMINT_EVERY_MS = 50 \* 60_000/);
  assert.match(ts, /REMINT_MARGIN_MS = 10 \* 60_000/);
  assert.match(legacy, /visibilitychange/, 'a tab coming back must re-mint');
});

check('the 180 min pass is what the function actually mints', () => {
  const fnSrc = read('supabase/functions/ems-auth/index.ts');
  assert.match(fnSrc, /TTL_SECONDS = 180 \* 60/);
  assert.match(fnSrc, /expiresIn: TTL_SECONDS/);
});

check('every 401 path goes through the funnel, none of them changes the page', () => {
  const reports = read('js/src/12-reports.js');
  assert.match(reports, /sigmaSessionExpired\('ems-401'\)/);
  assert.match(reports, /sigmaSessionExpired\('ems-max-session'\)/);
  assert.doesNotMatch(reports, /emsRequireLogin.*\n?.*showPage\('ems'\)/);
  assert.match(read('js/src/01-data.js'), /sigmaSessionExpired\('sb-read-/);
  // the one supabase-js interceptor
  assert.match(read('app/src/lib/supabase.ts'), /global: \{ fetch: sessionAwareFetch/);
});

check('the returning session flushes the queue and arms the cap (G2)', () => {
  const gate = read('js/src/15-login-gate.js');
  const returning = gate.slice(gate.indexOf('returning session'));
  assert.match(returning, /emsOnConnected/);
  assert.match(returning, /scheduleEmsExpiry/);
});

check('the re-login sheet is mounted on every page, not lazily', () => {
  assert.match(read('index.html'), /id="sigma-relogin"/);
  const main = read('app/src/main.tsx');
  assert.match(main, /mountReLoginSheet\(\)/);
  assert.doesNotMatch(main, /import\('@\/components\/ReLoginSheet'\)/);
});

check('every island renders the gate instead of its content', () => {
  for (const f of ['Home', 'KibbutzDetail', 'Feedback', 'FeedbackInbox', 'Usage', 'ImportNotes', 'Settings', 'MessageSheet']) {
    const src = read('app/src/islands/' + f + '.tsx');
    assert.match(src, /<EmsGate>/, f + ' is not gated');
  }
});

console.log('\n' + (failures ? failures + ' FAILURES' : 'all session-gate checks passed'));
process.exit(failures ? 1 : 0);
