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
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
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
  const document_ = { getElementById: (id) => (elements[id] || (elements[id] = makeEl())) };
  const fetch_ = async () => ({ ok: false, json: async () => ({}) });
  const getRole_ = () => localStorage_.getItem(ROLE_KEY) || '';
  const getEmsToken_ = () => '';
  const isAuthed_ = () => false;

  const fn = new Function(
    'window', 'document', 'localStorage', 'location', 'fetch',
    'LOGIN_FLAG', 'USER_KEY', 'ROLE_KEY', 'AUTH_KEY', 'SB_URL', 'SB_ANON',
    'getEmsToken', 'getRole', 'isAuthed', 'console',
    gateSrc
  );
  fn(
    window_, document_, localStorage_, location_, fetch_,
    true, USER_KEY, ROLE_KEY, AUTH_KEY, '', '',
    getEmsToken_, getRole_, isAuthed_, console
  );

  return { window_, document_, elements, localStorage_, location_ };
}

let ctx;
check('module evals without throwing (outer IIFE runs — touches emsLoginGate + isAuthed)', () => {
  ctx = runGate();
  assert.equal(typeof ctx.window_.gateViewerLogin, 'function', 'expected window.gateViewerLogin to be installed');
  assert.equal(typeof ctx.window_.gateViewerToggle, 'function', 'expected window.gateViewerToggle to be installed');
});

if (ctx) {
  // ---- (i) wrong PIN ----
  check('wrong PIN (6210): gateError text set, no user/role/auth stored, no reload', () => {
    const errEl = ctx.document_.getElementById('gateError');
    const pinEl = ctx.document_.getElementById('gateViewerPin');
    errEl.textContent = '';
    pinEl.value = '6210';
    ctx.window_.gateViewerLogin();
    assert.ok(errEl.textContent && errEl.textContent.length > 0, 'expected an error message in gateError');
    assert.equal(ctx.localStorage_.getItem(USER_KEY), null, 'no user should be stored on a wrong PIN');
    assert.equal(ctx.localStorage_.getItem(ROLE_KEY), null, 'no role should be stored on a wrong PIN');
    assert.equal(ctx.localStorage_.getItem(AUTH_KEY), null, 'no auth flag should be stored on a wrong PIN');
    assert.equal(ctx.location_.reloaded, false, 'must not reload after a failed PIN attempt');
  });

  // ---- (ii) correct PIN ----
  check('correct PIN (0540): stores viewer identity (user/role/auth) and reloads', () => {
    const pinEl = ctx.document_.getElementById('gateViewerPin');
    pinEl.value = '0540';
    ctx.window_.gateViewerLogin();
    assert.equal(ctx.localStorage_.getItem(USER_KEY), 'צפייה', 'expected the viewer display name to be stored');
    assert.equal(ctx.localStorage_.getItem(ROLE_KEY), 'viewer', 'expected role=viewer to be stored');
    assert.equal(ctx.localStorage_.getItem(AUTH_KEY), 'ok', 'expected auth=ok to be stored');
    assert.equal(ctx.location_.reloaded, true, 'expected location.reload() to be called on success');
  });

  // ---- surrounding surface: leading/trailing whitespace in the PIN input is trimmed ----
  check('PIN input is trimmed before comparison (" 0540 " still succeeds)', () => {
    // fresh gate instance so this doesn't ride on state left over from the checks above
    const fresh = runGate();
    const pinEl = fresh.document_.getElementById('gateViewerPin');
    pinEl.value = '  0540  ';
    fresh.window_.gateViewerLogin();
    assert.equal(fresh.localStorage_.getItem(ROLE_KEY), 'viewer', 'expected whitespace-padded correct PIN to still succeed');
  });
}

console.log(failures === 0 ? '\nPASS — all viewer-gate checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
