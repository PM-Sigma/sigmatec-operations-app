// Self-check for the view-only PIN entry in the EMS login gate (js/src/15-login-gate.js).
// Run: node test-viewer-gate.mjs
// Evals the module inside a function scope with minimal browser-global stubs (mirroring
// test-delivery-cert.mjs's approach). Only the viewer-PIN path (gateViewerLogin) is exercised —
// the full EMS email/password/OTP flow needs a live EMS proxy and isn't covered here.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gateSrc = fs.readFileSync(path.join(__dirname, 'js/src/15-login-gate.js'), 'utf8');

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ---- fake localStorage (Map-backed) ----
function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

// ---- permissive DOM element stub — every getElementById returns one of these, whatever the id ----
function makeEl() {
  return {
    value: '', textContent: '', innerHTML: '',
    style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }
  };
}

const USER_KEY = 'dashboard_user_v1';
const ROLE_KEY = 'dashboard_role_v1';
const AUTH_KEY = 'dashboard_auth_v4';

function runGate() {
  const localStorage_ = makeLocalStorage();
  const location_ = { reloaded: false, reload() { this.reloaded = true; } };
  const window_ = {};
  const elements = {};
  // lazily creates+caches a permissive stub for ANY id — the outer IIFE touches 'emsLoginGate'
  // at eval time, and gateViewerLogin/gateViewerToggle touch gateError/gateViewerBox/gateViewerPin.
  const document_ = {
    getElementById: (id) => (elements[id] || (elements[id] = makeEl())),
    // the module registers a `visibilitychange` listener for the pass re-mint (spec §7n)
    addEventListener() {}, removeEventListener() {}, visibilityState: 'visible',
  };
  // Scriptable fetch: the viewer sign-in now ASKS ems-auth to check the code (review fix 2),
  // so the test drives what the function answers instead of comparing a PIN in the client.
  const calls = [];
  let reply = { status: 401, body: { error: 'קוד צפייה שגוי' } };
  const fetch_ = async (url, opts) => {
    calls.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null });
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  };
  const setReply = (r) => { reply = r; };
  const sessionStore = new Map();
  const sessionStorage_ = {
    getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
    setItem: (k, v) => { sessionStore.set(k, String(v)); },
    removeItem: (k) => { sessionStore.delete(k); },
  };
  const getRole_ = () => localStorage_.getItem(ROLE_KEY) || '';
  const getEmsToken_ = () => '';
  const isAuthed_ = () => false;

  const fn = new Function(
    'window', 'document', 'localStorage', 'sessionStorage', 'location', 'fetch',
    'LOGIN_FLAG', 'USER_KEY', 'ROLE_KEY', 'AUTH_KEY', 'SB_URL', 'SB_ANON',
    'getEmsToken', 'getRole', 'isAuthed', 'console',
    gateSrc
  );
  fn(
    window_, document_, localStorage_, sessionStorage_, location_, fetch_,
    true, USER_KEY, ROLE_KEY, AUTH_KEY, '', '',
    getEmsToken_, getRole_, isAuthed_, console
  );

  return { window_, document_, elements, localStorage_, sessionStorage_, location_, calls, setReply };
}

let ctx;
await check('module evals without throwing (outer IIFE runs — touches emsLoginGate + isAuthed)', () => {
  ctx = runGate();
  assert.equal(typeof ctx.window_.gateViewerLogin, 'function', 'expected window.gateViewerLogin to be installed');
  assert.equal(typeof ctx.window_.gateViewerToggle, 'function', 'expected window.gateViewerToggle to be installed');
});

if (ctx) {
  const CODE = '1234';   // whatever the person types — the VALUE is the function's business now
  const viewerEls = (c) => ({
    err: c.document_.getElementById('gateError'),
    pin: c.document_.getElementById('gateViewerPin'),
  });

  // ---- (i) the function refuses the code ----
  await check('a refused code: the message is shown, nothing is stored, no reload', async () => {
    const c = runGate();
    const { err, pin } = viewerEls(c);
    c.setReply({ status: 401, body: { error: 'קוד צפייה שגוי' } });
    pin.value = CODE;
    await c.window_.gateViewerLogin();
    assert.ok(err.textContent && err.textContent.indexOf('שגוי') !== -1, 'expected the refusal to be shown');
    assert.equal(c.localStorage_.getItem(USER_KEY), null, 'no user on a refused code');
    assert.equal(c.localStorage_.getItem(ROLE_KEY), null, 'no role on a refused code');
    assert.equal(c.localStorage_.getItem(AUTH_KEY), null, 'no auth flag on a refused code');
    assert.equal(c.location_.reloaded, false, 'must not reload after a refused code');
    assert.equal(c.window_._sbToken || null, null, 'no pass on a refused code');
  });

  // ---- (ii) the function accepts it and hands back a pass ----
  await check('an accepted code: identity + PASS stored, the code kept for the session, reload', async () => {
    const c = runGate();
    const { pin } = viewerEls(c);
    c.setReply({ status: 200, body: { token: 'viewer-pass', expiresIn: 10800 } });
    pin.value = '  ' + CODE + '  ';        // the input is still trimmed before it is sent
    await c.window_.gateViewerLogin();
    assert.deepStrictEqual(c.calls[c.calls.length - 1].body, { mode: 'viewer', pin: CODE },
      'the code must be sent to the function, trimmed, with mode=viewer');
    assert.equal(c.localStorage_.getItem(USER_KEY), 'צפייה', 'expected the viewer display name to be stored');
    assert.equal(c.localStorage_.getItem(ROLE_KEY), 'viewer', 'expected role=viewer to be stored');
    assert.equal(c.localStorage_.getItem(AUTH_KEY), 'ok', 'expected auth=ok to be stored');
    // THE fix: a viewer now holds a pass, so the authenticated-only tables answer him
    assert.equal(c.window_._sbToken, 'viewer-pass', 'expected the viewer to hold a write pass');
    assert.ok((c.window_._sbTokenExp || 0) > Date.now() + 60 * 60 * 1000, 'the pass must be good for hours');
    assert.equal(c.sessionStorage_.getItem('viewer_code_v1'), CODE, 'the code is kept for the silent re-mint');
    assert.equal(c.location_.reloaded, true, 'expected location.reload() on success');
  });

  // ---- (iii) the secret is not set yet → fails closed with the setup message ----
  await check('the secret not set yet: fails closed, and says so', async () => {
    const c = runGate();
    const { err } = viewerEls(c);
    c.setReply({ status: 503, body: { error: 'כניסת הצפייה עוד לא הופעלה — עידן צריך להגדיר את קוד הצפייה', setup: 'VIEWER_PIN' } });
    viewerEls(c).pin.value = CODE;
    await c.window_.gateViewerLogin();
    assert.ok(err.textContent && err.textContent.indexOf('הופעלה') !== -1, 'expected the setup message');
    assert.equal(c.localStorage_.getItem(ROLE_KEY), null, 'nothing stored while the entry is disabled');
    assert.equal(c.window_._sbToken || null, null, 'no pass while the entry is disabled');
  });

  // ---- (iv) an empty box never reaches the network ----
  await check('an empty code box asks for the code instead of calling out', async () => {
    const c = runGate();
    viewerEls(c).pin.value = '   ';
    await c.window_.gateViewerLogin();
    assert.equal(c.calls.length, 0, 'an empty box must not call the function');
    assert.ok(viewerEls(c).err.textContent.length > 0, 'expected a prompt for the code');
  });

  // ---- (v) a logout drops the pass, the timer and the kept code ----
  await check('a logout drops the pass, the re-mint timer and the kept code', async () => {
    const c = runGate();
    c.setReply({ status: 200, body: { token: 'viewer-pass', expiresIn: 10800 } });
    viewerEls(c).pin.value = CODE;
    await c.window_.gateViewerLogin();
    c.window_.gateLogout();
    assert.equal(c.window_._sbToken, null, 'the pass must be dropped');
    assert.equal(c.window_._sbTokenExp, 0, 'the pass expiry must be cleared');
    assert.equal(c.window_._sbRefreshTimer, null, 'the re-mint timer must be cleared');
    assert.equal(c.sessionStorage_.getItem('viewer_code_v1'), null, 'the kept code must be gone');
  });
}

console.log(failures === 0 ? '\nPASS — all viewer-gate checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
