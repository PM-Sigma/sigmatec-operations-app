// createTask → the id a meeting note stores as `ems_task_id` (spec §3.3).
// Run: node test-ems-createtask.mjs
//
// WHY THIS EXISTS. `emsApi` returns `wrapped.body`, and EMS is inconsistent about whether a
// single resource sits at the top level (`{id}`) or under `data` (`{data:{id}}`) — the list
// paths in js/src/13-ems.js already unwrap both (`res.data || res`). The first cut of
// `emsWriteOrQueue` read `res.id` only, so a live create against the `{data:{id}}` shape
// yielded NO id and the bullet stayed stamped `pending:…` forever, with a 🔗 that could never
// open anything. Both shapes are pinned here, together with the queue path that later swaps
// `pending:<queueId>` for the real task id.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// js/app.js is ONE concatenated script at global scope, so 13-ems.js's top-level functions
// are `window.*` in production. Inside `new Function` they are locals, so the sandbox appends
// an epilogue that hands the functions under test out — the module itself stays clean.
const src = fs.readFileSync(path.join(__dirname, 'js/src/13-ems.js'), 'utf8') + [
  '', 'window.emsCreatedId = emsCreatedId;',
  'window.emsWriteOrQueue = emsWriteOrQueue;',
  'window.emsQueueFlush = emsQueueFlush;',
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

// ── load the module in a sandbox ────────────────────────────────────────────
// 13-ems.js is bare top-level code (build.mjs concatenates it), and every EMS primitive it
// leans on — emsApi, isEmsConnected, the toast, the user/site lookups — is declared in a
// SIBLING module. That makes them free identifiers here, so they inject straight in as
// `new Function` parameters: the transport is the only seam these tests need.
function loadModule({ connected = true, api = async () => ({}), sheet } = {}) {
  const win = {};
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
    // the Sheet transport (queue add / clear). Default: accepts and mints an id.
    fetch: sheet || (async () => ({ ok: true, json: async () => ({ ok: true, id: 'q-1' }) })),
    setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {},
    navigator: { userAgent: 'test', onLine: true },
    console: { log() {}, warn() {}, error() {} },
    alert: () => {}, confirm: () => true,
    sigmaEmit: (name, detail) => { emitted.push({ name, detail }); },
    // identity + EMS primitives from sibling modules
    getCurrentUser: () => 'עידן', isViewer: () => false, isIdan: () => true,
    emsApi: api,
    isEmsConnected: () => connected,
    emsToast: () => {},
    getEmsUsers: async () => [{ id: 'u1', firstName: 'אביאם', lastName: '' }],
    emsUserName: u => (u.firstName || '') + ' ' + (u.lastName || ''),
    emsSiteIdForKibbutz: async () => 'site-from-lookup',
    emsEsc: s => String(s),
    WRITE_ROUTER_URL: 'https://sheet.test/api',
    EMS_STATUS: { pending: 'ממתין', in_progress: 'בטיפול', completed: 'הושלם' },
    EMS_CLOSED: ['completed'],
  };
  const names = Object.keys(params);
  // eslint-disable-next-line no-new-func
  new Function(...names, src)(...names.map(n => params[n]));
  return { win, emitted, store };
}

// Module-load smoke first: if the sandbox stops matching 13-ems.js, everything after is noise.
const boot = loadModule();
check('module loads and exposes emsCreatedId + emsWriteOrQueue', () => {
  assert.strictEqual(typeof boot.win.emsCreatedId, 'function', 'emsCreatedId not exposed on window');
  assert.strictEqual(typeof boot.win.emsWriteOrQueue, 'function', 'emsWriteOrQueue not exposed on window');
});

// ── emsCreatedId: both EMS response shapes ──────────────────────────────────
check('flat shape {id} → the id', () => {
  assert.strictEqual(boot.win.emsCreatedId({ id: 'abc-123' }), 'abc-123');
});

check('wrapped shape {data:{id}} → the id (this is the shape that regressed)', () => {
  assert.strictEqual(boot.win.emsCreatedId({ data: { id: 'abc-123' } }), 'abc-123');
});

check('a numeric id comes back as a string (ems_task_id is a text column)', () => {
  assert.strictEqual(boot.win.emsCreatedId({ id: 4471 }), '4471');
  assert.strictEqual(boot.win.emsCreatedId({ data: { id: 4471 } }), '4471');
});

check('no id anywhere → null, never undefined or "undefined"', () => {
  [{}, null, undefined, { data: {} }, { data: null }].forEach(shape => {
    assert.strictEqual(boot.win.emsCreatedId(shape), null, JSON.stringify(shape));
  });
});

check('a LIST response is not mistaken for a created resource', () => {
  assert.strictEqual(boot.win.emsCreatedId({ data: [{ id: 'x' }] }), null);
});

// ── emsWriteOrQueue: the shape app/src/components/home/MeetingNotes.tsx consumes ──
check('live createTask → {sent:true, id} for the flat shape', async () => {
  const { win } = loadModule({ api: async () => ({ id: 'live-1' }) });
  assert.deepStrictEqual(
    await win.emsWriteOrQueue({ kind: 'createTask', title: 't', kibbutz: 'גבים' }),
    { sent: true, id: 'live-1' });
});

check('live createTask → {sent:true, id} for the WRAPPED shape', async () => {
  const { win } = loadModule({ api: async () => ({ data: { id: 'live-2' } }) });
  assert.deepStrictEqual(
    await win.emsWriteOrQueue({ kind: 'createTask', title: 't', kibbutz: 'גבים' }),
    { sent: true, id: 'live-2' });
});

check('a real API rejection is surfaced, never queued', async () => {
  const { win } = loadModule({ api: async () => { throw new Error('(422) title is required'); } });
  const r = await win.emsWriteOrQueue({ kind: 'createTask', title: '' });
  assert.strictEqual(r.sent, false);
  assert.ok(!r.queued, 'a 4xx must NOT be queued — it would retry forever');
  assert.match(r.error, /422/);
});

check('offline createTask → {queued:true, queueId} so the note can store pending:<queueId>', async () => {
  const { win } = loadModule({ connected: false });
  const r = await win.emsWriteOrQueue({ kind: 'createTask', title: 't' });
  assert.strictEqual(r.queued, true);
  assert.strictEqual(r.queueId, 'q-1', 'the queue id is what pending:<id> is keyed on');
});

check('createTask body carries priority + siteId when the caller sets them', async () => {
  let sent = null;
  const { win } = loadModule({
    api: async (p, opts) => { sent = { path: p, body: JSON.parse(opts.body) }; return { id: 'x' }; },
  });
  await win.emsWriteOrQueue({
    kind: 'createTask', title: 'מאזן אנרגיה', description: 'd', siteId: 'site-9', priority: 'medium',
  });
  assert.strictEqual(sent.path, '/employee-tasks');
  assert.strictEqual(sent.body.priority, 'medium');
  assert.strictEqual(sent.body.siteId, 'site-9');
  assert.strictEqual(sent.body.title, 'מאזן אנרגיה');
  assert.strictEqual(sent.body.description, 'd');
});

check('priority defaults to normal when the caller sets none', async () => {
  let body = null;
  const { win } = loadModule({ api: async (_p, o) => { body = JSON.parse(o.body); return { id: 'x' }; } });
  await win.emsWriteOrQueue({ kind: 'createTask', title: 't' });
  assert.strictEqual(body.priority, 'normal');
});

// ── the queue flush resolves pending:<queueId> → the real task id ───────────
check('flushing a queued createTask emits ems-queue-flushed with queueId → taskId', async () => {
  const pending = [{ id: 'q-7', kind: 'createTask', title: 'מאזן אנרגיה', kibbutz: 'גבים' }];
  const { win, emitted } = loadModule({
    api: async () => ({ data: { id: 'real-99' } }),
    sheet: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  });
  win.SHEET_DATA = { emsQueue: pending };
  await win.emsQueueFlush();
  const ev = emitted.find(e => e.name === 'ems-queue-flushed');
  assert.ok(ev, 'no ems-queue-flushed event — a queued bullet would stay pending: forever');
  assert.deepStrictEqual(ev.detail.created, [{ queueId: 'q-7', taskId: 'real-99' }]);
});

check('flushing non-createTask items emits nothing to resolve', async () => {
  const { win, emitted } = loadModule({
    api: async () => ({ ok: true }),
    sheet: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  });
  win.SHEET_DATA = { emsQueue: [{ id: 'q-8', kind: 'comment', taskId: 't1', message: 'm' }] };
  await win.emsQueueFlush();
  assert.ok(!emitted.some(e => e.name === 'ems-queue-flushed'), 'nothing was created — no event');
});

await run();
console.log('');
if (failures) { console.log('FAIL — ' + failures + ' of ' + (failures + passes) + ' checks failed'); process.exit(1); }
console.log('PASS — all ' + passes + ' createTask checks passed');
