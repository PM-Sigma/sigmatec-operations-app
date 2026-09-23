// The EMS-cache slim mapper + stale-cache resync (task-3-brief, spec §4 Part C).
// Run: node test-ems-card.mjs
//
// WHY THIS EXISTS. The on-card EMS-tasks widget moved to React (EmsTasks.tsx), which reads
// `description` off the shared cache row — a field the mapper never carried before. This pins
// the mapper directly (no need to spin up the whole sync pipeline) and the EMS_CACHE_VER guard
// that resyncs a snapshot written by an older version, so field users don't get stuck on a
// stale cache without ever reconnecting to EMS themselves.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same sandboxing technique as test-ems-createtask.mjs: 13-ems.js is bare top-level code
// (build.mjs concatenates it) whose free identifiers come from sibling modules — inject them
// as `new Function` parameters and hand the functions under test out via a window.* epilogue.
const src = fs.readFileSync(path.join(__dirname, 'js/src/13-ems.js'), 'utf8') + [
  '', 'window.emsSlimTask = emsSlimTask;',
  'window.emsResyncIfStaleCache = emsResyncIfStaleCache;',
  'window.emsSyncCache = emsSyncCache;',
  'window.EMS_CACHE_VER = EMS_CACHE_VER;',
].join('\n');

let failures = 0, passes = 0;
const queue = [];
function check(name, fn) { queue.push([name, fn]); }
async function run() {
  for (const [name, fn] of queue) {
    try { await fn(); passes++; console.log('  ok - ' + name); }
    catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
  }
}

function loadModule({ connected = true, api = async () => ({ data: [] }), sheet, emsCache } = {}) {
  const win = { SHEET_DATA: { emsCache: emsCache || { tasks: [], syncedAt: '', syncedBy: '' } } };
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const emitted = [];
  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
    body: { appendChild() {} },
    addEventListener() {},
  };
  const params = {
    window: win,
    document: doc,
    localStorage,
    fetch: sheet || (async () => ({ ok: true, json: async () => ({ ok: true, cached: 0 }) })),
    setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {},
    navigator: { userAgent: 'test', onLine: true },
    console: { log() {}, warn() {}, error() {} },
    alert: () => {}, confirm: () => true,
    sigmaEmit: (name, detail) => { emitted.push({ name, detail }); },
    getCurrentUser: () => 'עידן', isViewer: () => false, isIdan: () => true,
    emsApi: api,
    isEmsConnected: () => connected,
    emsToast: () => {},
    getEmsUsers: async () => [],
    emsUserName: u => (u && u.firstName) || '',
    emsSiteIdForKibbutz: async () => '',
    kibbutzSiteIds: () => [],
    emsLinkIds: t => (t && t.linkedEntityIds) || [],
    emsEsc: s => String(s),
    WRITE_ROUTER_URL: 'https://sheet.test/api',
    EMS_STATUS: { new: 'חדשה', in_progress: 'בטיפול', done: 'בוצע' },
    EMS_PRIORITY: { normal: 'רגילה', high: 'גבוהה' },
    EMS_CLOSED: ['done'],
    // Hoisted to js/src/00-consts.js by the task-33 TDZ fix — 13-ems.js reads them but no
    // longer declares them, so the sandbox has to supply them like any other sibling symbol.
    EMS_CACHE_VER: 2,
    _emsStaleCacheChecked: false,
    EMS_BG_MIN_MS: 5 * 60 * 1000,
    EMS_BG_KEY: 'ems_bg_sync_at_v1',
    _emsBgInFlight: null,
    _emsBgInstalled: false,
  };
  const names = Object.keys(params);
  // eslint-disable-next-line no-new-func
  new Function(...names, src)(...names.map(n => params[n]));
  return { win, emitted, store };
}

const boot = loadModule();
check('module loads and exposes emsSlimTask + emsResyncIfStaleCache', () => {
  assert.strictEqual(typeof boot.win.emsSlimTask, 'function', 'emsSlimTask not exposed on window');
  assert.strictEqual(typeof boot.win.emsResyncIfStaleCache, 'function', 'emsResyncIfStaleCache not exposed on window');
});

// ── emsSlimTask: the field the whole task exists to add ─────────────────────
check('a row WITH a description → description carried through verbatim', () => {
  const slim = boot.win.emsSlimTask({ id: '1', title: 'תקן שעון', description: 'תקלה בלוח הראשי' });
  assert.strictEqual(slim.description, 'תקלה בלוח הראשי');
});

check('a row with NO description → empty string, never undefined (the React widget hides .t-desc on falsy)', () => {
  const slim = boot.win.emsSlimTask({ id: '2', title: 'בדוק מונה' });
  assert.strictEqual(slim.description, '');
  assert.notStrictEqual(slim.description, undefined);
});

check('the rest of the slim shape is unchanged (id/title/status/priority/site/assignee/due/link)', () => {
  const slim = boot.win.emsSlimTask({
    id: '3', title: 't', status: 'new', priority: 'high', type: 'fixing_fault',
    site: { id: 's1', name: 'דפנה', extra: 'dropped' },
    expectedCompletionDate: '2026-10-01',
    assignee: { id: 'u1', firstName: 'ניתאי', lastName: 'לוי', extra: 'dropped' },
    linkType: 'requirement', linkedEntityIds: ['a', 'b'],
  });
  assert.deepStrictEqual(slim, {
    id: '3', title: 't', status: 'new', priority: 'high', type: 'fixing_fault',
    site: { id: 's1', name: 'דפנה' },
    expectedCompletionDate: '2026-10-01',
    assignee: { id: 'u1', firstName: 'ניתאי', lastName: 'לוי' },
    description: '', linkType: 'requirement', linkCount: 2,
  });
});

check('no site / no assignee → both null, never throw', () => {
  const slim = boot.win.emsSlimTask({ id: '4', title: 't' });
  assert.strictEqual(slim.site, null);
  assert.strictEqual(slim.assignee, null);
});

// ── emsResyncIfStaleCache: the migration guard (real `ver`, not a description sniff) ─────────
check('EMS_CACHE_VER is exposed and is the real, read version marker', () => {
  assert.strictEqual(boot.win.EMS_CACHE_VER, 2);
});

check('cache with NO ver (pre-migration snapshot) + connected → resyncs once', async () => {
  let calls = 0;
  const { win } = loadModule({
    connected: true,
    api: async () => { calls++; return { data: [{ id: 'x', title: 't', description: 'd' }] }; },
    emsCache: { tasks: [{ id: '1', title: 't' /* no ver on the snapshot at all */ }], syncedAt: '2026-01-01', syncedBy: '' },
  });
  await win.emsResyncIfStaleCache();
  // emsSyncCache is async and fire-and-forget from the guard — give its microtasks a tick.
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(calls, 1, 'a stale, connected cache must trigger exactly one resync');
});

check('cache at an OLDER ver (1) + connected → resyncs once', async () => {
  let calls = 0;
  const { win } = loadModule({
    connected: true,
    api: async () => { calls++; return { data: [] }; },
    emsCache: { tasks: [{ id: '1', title: 't' }], syncedAt: '2026-01-01', syncedBy: '', ver: 1 },
  });
  await win.emsResyncIfStaleCache();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(calls, 1);
});

check('a resync writes the CURRENT ver onto the in-memory cache (no more staleness to find)', async () => {
  const { win } = loadModule({
    connected: true,
    api: async () => ({ data: [{ id: 'x', title: 't' }] }),
    emsCache: { tasks: [{ id: '1', title: 't' }], syncedAt: '2026-01-01', syncedBy: '' },
  });
  await win.emsResyncIfStaleCache();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(win.SHEET_DATA.emsCache.ver, boot.win.EMS_CACHE_VER);
});

check('stale cache but NOT connected → no resync (nothing to fetch with)', async () => {
  let calls = 0;
  const { win } = loadModule({
    connected: false,
    api: async () => { calls++; return { data: [] }; },
    emsCache: { tasks: [{ id: '1', title: 't' }], syncedAt: '2026-01-01', syncedBy: '' },
  });
  await win.emsResyncIfStaleCache();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(calls, 0);
});

check('cache already at the CURRENT ver → no resync, even when connected', async () => {
  let calls = 0;
  const { win } = loadModule({
    connected: true,
    api: async () => { calls++; return { data: [] }; },
    emsCache: { tasks: [{ id: '1', title: 't' }], syncedAt: '2026-01-01', syncedBy: '', ver: 2 },
  });
  await win.emsResyncIfStaleCache();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(calls, 0);
});

check('called twice in one session → resyncs at most once (the guard flag — no loop)', async () => {
  let calls = 0;
  const { win } = loadModule({
    connected: true,
    api: async () => { calls++; return { data: [] }; },
    emsCache: { tasks: [{ id: '1', title: 't' }], syncedAt: '2026-01-01', syncedBy: '' },
  });
  await win.emsResyncIfStaleCache();
  await win.emsResyncIfStaleCache();
  await win.emsResyncIfStaleCache();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(calls, 1);
});

check('no open tasks at all → never resyncs, ver or not (nothing to fix)', async () => {
  let calls = 0;
  const { win } = loadModule({
    connected: true,
    api: async () => { calls++; return { data: [] }; },
    emsCache: { tasks: [], syncedAt: '', syncedBy: '' },
  });
  await win.emsResyncIfStaleCache();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(calls, 0);
});

await run();
console.log('');
if (failures) { console.log('FAIL — ' + failures + ' of ' + (failures + passes) + ' checks failed'); process.exit(1); }
console.log('PASS — all ' + passes + ' EMS-card checks passed');
