// The office-PC EMS cache refresh job (spec §7k #10, Task 20).
//   node test-ems-refresh.mjs
//
// WHY THIS EXISTS. scripts/ems-cache-refresh.mjs writes the SAME `ems_cache.tasks` column the
// browser writes, and the kibbutz card renders whichever landed last. So the one thing that
// can really hurt is a mapper that drifts from the client's: a job that quietly drops
// `description` would blank the task text on every card for everyone, and nobody would
// connect it to a scheduled task on a PC in the office. The first check therefore runs the
// REAL `emsSlimTask` out of js/src/13-ems.js over the same fixture and diffs the two.
//
// It also pins the throttle arithmetic of the in-app background sync (§7k #10's other half)
// and the credential hygiene this job is built around: nothing hardcoded, `.env` git-ignored.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EMS_CACHE_VER, EXIT, OPEN_STATUSES, PAGE_SIZE,
  crawlDone, dedupeById, defaultLogPath, emsLinkIds, hasCredentials,
  loadConfig, main, parseArgs, parseEnv, readClientConstants, slimTask, tasksPath,
} from './scripts/ems-cache-refresh.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

let failures = 0;
const queue = [];
function check(name, fn) { queue.push([name, fn]); }

// ── the legacy side, lifted out of the real sources ──────────────────────────
// Same sandboxing technique as test-ems-card.mjs: 13-ems.js is bare top-level code whose free
// identifiers come from sibling modules. The difference here is that `emsLinkIds` is injected
// as the REAL implementation (lifted from js/src/14-calendar.js), not a stub — the mapper diff
// is only worth anything if both sides count links the same way.
function legacyConst(file, re, what) {
  const m = re.exec(read(file));
  assert.ok(m, 'could not find ' + what + ' in ' + file);
  // eslint-disable-next-line no-new-func
  return new Function('return (' + m[1] + ')')();
}

const LEGACY_STATUS = legacyConst('js/src/14-calendar.js', /const EMS_STATUS\s*=\s*(\{[\s\S]*?\});/, 'EMS_STATUS');
const LEGACY_CLOSED = legacyConst('js/src/14-calendar.js', /const EMS_CLOSED\s*=\s*(\[[^\]]*\]);/, 'EMS_CLOSED');
const legacyLinkIds = (() => {
  const m = /function emsLinkIds\(t\)\s*\{[\s\S]*?\n/.exec(read('js/src/14-calendar.js'));
  assert.ok(m, 'could not find emsLinkIds in js/src/14-calendar.js');
  // eslint-disable-next-line no-new-func
  return new Function(m[0] + '; return emsLinkIds;')();
})();

function loadLegacyEms() {
  const src = read('js/src/13-ems.js') + [
    '', 'window.emsSlimTask = emsSlimTask;',
    'window.emsBackgroundSync = emsBackgroundSync;',
    'window.emsBgDue = emsBgDue;',
    'window.EMS_CACHE_VER = EMS_CACHE_VER;',
  ].join('\n');
  const win = { SHEET_DATA: { emsCache: { tasks: [], syncedAt: '', syncedBy: '' } } };
  const store = {};
  const params = {
    window: win,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {},
    navigator: { userAgent: 'test', onLine: true },
    console: { log() {}, warn() {}, error() {} },
    alert: () => {}, confirm: () => true,
    sigmaEmit: () => {},
    getCurrentUser: () => 'עידן', isViewer: () => false, isIdan: () => true,
    emsApi: async () => ({ data: [] }),
    isEmsConnected: () => false,
    emsToast: () => {},
    getEmsUsers: async () => [],
    emsUserName: u => (u && u.firstName) || '',
    emsSiteIdForKibbutz: async () => '',
    kibbutzSiteIds: () => [],
    emsLinkIds: legacyLinkIds,
    emsEsc: s => String(s),
    openEmsTask: () => {},
    SHEET_API: 'https://sheet.test/api',
    EMS_STATUS: LEGACY_STATUS,
    EMS_PRIORITY: { normal: 'רגילה' },
    EMS_CLOSED: LEGACY_CLOSED,
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
  return { win, store };
}

const legacy = loadLegacyEms();
const FIXTURE = JSON.parse(read('qa/fixtures/ems-tasks.json'));

/** What actually reaches the database — `undefined` fields simply are not there. */
const asStored = v => JSON.parse(JSON.stringify(v));

// ══════════════════════════════════════════════════════════════════════════════
// 1. THE CONTRACT — the job's mapper vs the client's, over the same fixture
// ══════════════════════════════════════════════════════════════════════════════

check('the legacy module still exposes emsSlimTask (the thing we are diffing against)', () => {
  assert.strictEqual(typeof legacy.win.emsSlimTask, 'function');
});

check('slimTask produces the SAME slim row as js/src/13-ems.js emsSlimTask, for every fixture row', () => {
  const mine = FIXTURE.map(t => asStored(slimTask(t)));
  const theirs = FIXTURE.map(t => asStored(legacy.win.emsSlimTask(t)));
  assert.deepStrictEqual(mine, theirs);
});

check('…and the same KEYS in the same order (the column is compared as JSON in review)', () => {
  for (const t of FIXTURE) {
    assert.deepStrictEqual(Object.keys(slimTask(t)), Object.keys(legacy.win.emsSlimTask(t)), 'key order drifted for ' + t.id);
  }
});

check('the fixture exercises the shapes that actually differ between EMS answers', () => {
  const rows = FIXTURE.map(slimTask);
  assert.ok(rows.some(r => r.site === null), 'no site-less task in the fixture');
  assert.ok(rows.some(r => r.assignee === null), 'no unassigned task in the fixture (§7k #6 cares)');
  assert.ok(rows.some(r => r.description), 'no task with a description');
  assert.ok(rows.some(r => r.linkCount === 3), 'no task with links');
  assert.ok(FIXTURE.some(t => typeof t.linked_entity_ids === 'string' && t.linked_entity_ids.startsWith('[')), 'no JSON-string link list');
  assert.ok(FIXTURE.some(t => typeof t.linked_entity_ids === 'string' && !t.linked_entity_ids.startsWith('[')), 'no comma-string link list');
});

check('emsLinkIds mirrors the legacy one on all three encodings EMS really sends', () => {
  const cases = [
    { linkedEntityIds: ['a', 'b'] },
    { linked_entity_ids: '["a","b"]' },
    { linked_entity_ids: 'a, b ,c' },
    { linked_entity_ids: '' },
    {},
  ];
  for (const c of cases) assert.deepStrictEqual(emsLinkIds(c), legacyLinkIds(c), JSON.stringify(c));
});

check('description is never undefined — the card widget hides .t-desc on falsy, not on missing', () => {
  const slim = slimTask({ id: 'x', title: 't' });
  assert.strictEqual(slim.description, '');
  assert.strictEqual(slim.expectedCompletionDate, '');
});

check('EMS_CACHE_VER matches js/src/13-ems.js — a mismatch makes every client resync forever', () => {
  assert.strictEqual(EMS_CACHE_VER, legacy.win.EMS_CACHE_VER);
});

check('OPEN_STATUSES = EMS_STATUS minus EMS_CLOSED, exactly as emsOpenStatuses() computes it', () => {
  const expected = Object.keys(LEGACY_STATUS).filter(s => LEGACY_CLOSED.indexOf(s) === -1);
  assert.deepStrictEqual(OPEN_STATUSES, expected);
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. the crawl — same pagination rules as emsSyncCache
// ══════════════════════════════════════════════════════════════════════════════

check('tasksPath asks for every open status, one `status` param each', () => {
  const p = tasksPath(2);
  assert.ok(p.startsWith('/v1/employee-tasks?'), p);
  assert.match(p, /page=2/);
  assert.match(p, new RegExp('take=' + PAGE_SIZE));
  for (const s of OPEN_STATUSES) assert.ok(p.includes('status=' + s), 'missing status ' + s);
});

check('crawlDone stops on a short page, on reaching the total, and at the page cap', () => {
  assert.strictEqual(crawlDone(PAGE_SIZE, 200, 1000, 1), '');
  assert.strictEqual(crawlDone(13, 13, null, 1), 'short-page');
  assert.strictEqual(crawlDone(PAGE_SIZE, 400, 400, 2), 'reached-total');
  assert.strictEqual(crawlDone(PAGE_SIZE, 4000, 999999, 20), 'page-cap');
});

check('dedupeById drops the repeats that overlapping pages produce', () => {
  assert.deepStrictEqual(dedupeById(FIXTURE).map(t => t.id), ['t-1001', 't-1002', 't-1003', 't-1004']);
  assert.deepStrictEqual(dedupeById([null, { id: '' }, { id: 'a' }, { id: 'a' }]).map(t => t.id), ['a']);
  assert.deepStrictEqual(dedupeById(undefined), []);
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. the in-app background sync throttle (js/src/13-ems.js, the other half of #10)
// ══════════════════════════════════════════════════════════════════════════════

check('emsBgDue: never synced → due; inside the window → not due; past it → due', () => {
  const due = legacy.win.emsBgDue;
  const MIN = 5 * 60 * 1000;
  assert.strictEqual(due(1_000_000, 0, MIN), true, 'never synced must be due');
  assert.strictEqual(due(1_000_000, 1_000_000 - 60_000, MIN), false, '1 minute ago is not due');
  assert.strictEqual(due(1_000_000, 1_000_000 - MIN, MIN), true, 'exactly the window is due');
  assert.strictEqual(due(1_000_000, 1_000_000 - MIN - 1, MIN), true);
});

check('emsBgDue: a clock that jumped BACKWARDS is due, not parked for hours', () => {
  assert.strictEqual(legacy.win.emsBgDue(1_000, 9_999_999, 5 * 60 * 1000), true);
});

check('emsBackgroundSync resolves false while disconnected (never throws at a caller)', async () => {
  const r = await legacy.win.emsBackgroundSync(true);
  assert.strictEqual(r, false);
});

check('the bridge exposes emsSync, and it forces past the throttle', () => {
  const bridge = read('js/src/00-bridge.js');
  assert.match(bridge, /emsSync:\s*function/, 'sigma.emsSync is not on the bridge');
  assert.match(bridge, /call\('emsBackgroundSync',\s*\[!!force\]/, 'emsSync does not pass `force` through');
  assert.match(read('app/src/bridge.ts'), /emsSync\?\(force\?: boolean\): Promise<boolean>/, 'the typed bridge is missing emsSync');
});

check('the background sync is actually installed on boot (js/src/01-data.js)', () => {
  assert.match(read('js/src/01-data.js'), /emsBgSyncInstall\(\)/, 'nothing calls emsBgSyncInstall — the sync would never run');
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. configuration + credential hygiene
// ══════════════════════════════════════════════════════════════════════════════

check('parseEnv reads the forms a person actually types into a .env', () => {
  const env = parseEnv([
    '# a comment',
    '',
    'EMS_EMAIL=pm@sigmatec-energy.com',
    'export EMS_API_BASE=https://api.sigmatec-ems.com',
    "EMS_SYNCED_BY='משרד'",
    'EMS_TOKEN="ab.cd.ef"',
    'WITH_TRAILING=value   # why',
    'not a line at all',
  ].join('\n'));
  assert.strictEqual(env.EMS_EMAIL, 'pm@sigmatec-energy.com');
  assert.strictEqual(env.EMS_API_BASE, 'https://api.sigmatec-ems.com');
  assert.strictEqual(env.EMS_SYNCED_BY, 'משרד');
  assert.strictEqual(env.EMS_TOKEN, 'ab.cd.ef');
  assert.strictEqual(env.WITH_TRAILING, 'value');
  assert.strictEqual(Object.keys(env).length, 5);
});

check('parseEnv survives junk without throwing', () => {
  assert.deepStrictEqual(parseEnv(''), {});
  assert.deepStrictEqual(parseEnv(null), {});
  assert.deepStrictEqual(parseEnv('#############'), {});
});

check('hasCredentials: a token alone is enough; half a password pair is not', () => {
  assert.strictEqual(hasCredentials({ token: 'x' }), true);
  assert.strictEqual(hasCredentials({ email: 'a@b.c', password: 'p' }), true);
  assert.strictEqual(hasCredentials({ email: 'a@b.c' }), false);
  assert.strictEqual(hasCredentials({ password: 'p' }), false);
  assert.strictEqual(hasCredentials({}), false);
  assert.strictEqual(hasCredentials(null), false);
});

check('parseArgs: --dry-run / --fixture / --log / --quiet, and a fixture forces dry-run', () => {
  assert.deepStrictEqual(parseArgs([]), { dryRun: false, fixture: '', log: '', quiet: false });
  assert.strictEqual(parseArgs(['--dry-run']).dryRun, true);
  assert.strictEqual(parseArgs(['-n']).dryRun, true);
  assert.strictEqual(parseArgs(['--log', 'x.log']).log, 'x.log');
  assert.strictEqual(parseArgs(['--log=x.log']).log, 'x.log');
  const f = parseArgs(['--fixture=qa/fixtures/ems-tasks.json']);
  assert.strictEqual(f.fixture, 'qa/fixtures/ems-tasks.json');
  assert.strictEqual(f.dryRun, true, 'a fixture run must never touch the network');
});

check('NO credential is hardcoded in the job — it only ever names the env keys', () => {
  const src = read('scripts/ems-cache-refresh.mjs');
  // an assignment of a literal to anything that smells like a secret
  const bad = /(password|passwd|secret|EMS_TOKEN|apikey|api_key)\s*[:=]\s*['"][^'"]{6,}['"]/i.exec(src);
  assert.strictEqual(bad, null, 'looks like a hardcoded secret: ' + (bad && bad[0]));
  // it must read them from the environment, not carry them
  assert.match(src, /pick\('EMS_PASSWORD'\)/);
  assert.match(src, /pick\('EMS_TOKEN'\)/);
});

check('.env is git-ignored (the whole credential story depends on this one line)', () => {
  const ignore = read('.gitignore').split(/\r?\n/).map(l => l.trim());
  assert.ok(ignore.includes('.env') || ignore.includes('*.env'), '.env is not in .gitignore');
});

check('no .env is tracked by git in this checkout', () => {
  assert.strictEqual(fs.existsSync(path.join(__dirname, '.env')), false,
    'a .env exists in the repo root — it is git-ignored, but this test run cannot prove the job works without one');
});

check('the Supabase constants come from the client bundle, not a second copy', () => {
  const { sbUrl, sbAnon } = readClientConstants(__dirname);
  assert.match(sbUrl, /^https:\/\/[a-z0-9]+\.supabase\.co$/, sbUrl);
  assert.ok(sbAnon.split('.').length === 3, 'the anon key is not a JWT');
  const src = read('scripts/ems-cache-refresh.mjs');
  assert.ok(!src.includes(sbAnon), 'the anon key is duplicated into the job instead of being read from js/src/01-data.js');
  assert.ok(!src.includes(sbUrl), 'the project URL is duplicated into the job');
});

check('loadConfig defaults: the real EMS host, ver 2, and a syncedBy a human can recognise', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-refresh-'));
  const saved = {};
  for (const k of ['EMS_EMAIL', 'EMS_PASSWORD', 'EMS_TOKEN', 'EMS_API_BASE', 'EMS_SYNCED_BY']) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    const cfg = loadConfig(tmp, {});
    assert.strictEqual(cfg.envFileFound, false);
    assert.strictEqual(cfg.base, 'https://api.sigmatec-ems.com');
    assert.strictEqual(cfg.syncedBy, 'משרד');
    assert.strictEqual(hasCredentials(cfg), false);
  } finally { for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v; }
});

check('the real environment overrides .env, so a one-off run needs no file edit', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-refresh-'));
  fs.writeFileSync(path.join(tmp, '.env'), 'EMS_API_BASE=https://from-file.example\nEMS_TOKEN=from-file\n', 'utf8');
  const cfg = loadConfig(tmp, { EMS_API_BASE: 'https://from-env.example' });
  assert.strictEqual(cfg.base, 'https://from-env.example');
  assert.strictEqual(cfg.token, 'from-file');
});

check('the log lands OUTSIDE the repo by default (a scheduled job must not dirty git status)', () => {
  const p = defaultLogPath();
  assert.ok(!p.startsWith(__dirname), 'the default log path is inside the repo: ' + p);
  assert.match(p, /ems-cache-refresh\.log$/);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. main() — exit codes and the log line, without touching the network
// ══════════════════════════════════════════════════════════════════════════════

function tmpLog() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ems-refresh-')), 'run.log'); }

/** Run main() with no EMS_* in the ambient environment, so the machine cannot change a result. */
async function runMain(argv, root = __dirname) {
  const keys = ['EMS_EMAIL', 'EMS_PASSWORD', 'EMS_TOKEN', 'EMS_API_BASE', 'EMS_SYNCED_BY', 'EMS_REFRESH_LOG'];
  const saved = {};
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  try { return await main(argv, root); }
  finally { for (const k of keys) if (saved[k] !== undefined) process.env[k] = saved[k]; }
}

check('--fixture maps the file through the real mapper, writes a log line, and exits 0', async () => {
  const log = tmpLog();
  const code = await runMain(['--fixture', 'qa/fixtures/ems-tasks.json', '--log', log, '--quiet']);
  assert.strictEqual(code, EXIT.OK);
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1, 'expected exactly one log line');
  const rec = JSON.parse(lines[0]);
  assert.strictEqual(rec.mode, 'fixture');
  assert.strictEqual(rec.read, FIXTURE.length);
  assert.strictEqual(rec.mapped, 4, 'the duplicate id should have been dropped');
  assert.strictEqual(rec.ver, EMS_CACHE_VER);
  assert.deepStrictEqual(rec.statuses, OPEN_STATUSES);
  assert.ok(!('error' in rec), rec.error);
  assert.ok(!JSON.stringify(rec).toLowerCase().includes('password'), 'the log mentions a password');
});

check('--dry-run with no credentials is a clean configuration check (exit 0, nothing sent)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-refresh-'));
  const log = tmpLog();
  const code = await runMain(['--dry-run', '--log', log, '--quiet'], tmp);
  assert.strictEqual(code, EXIT.OK);
  const rec = JSON.parse(fs.readFileSync(log, 'utf8').trim());
  assert.strictEqual(rec.mode, 'dry-run');
  assert.strictEqual(rec.credentials, 'absent');
  assert.match(rec.blocked, /EMS_EMAIL/);
  assert.ok(!('wrote' in rec), 'a dry run must not report a write');
});

check('a LIVE run with no credentials fails loudly with the config exit code (2)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-refresh-'));
  const log = tmpLog();
  const code = await runMain(['--log', log, '--quiet'], tmp);
  assert.strictEqual(code, EXIT.CONFIG);
  const rec = JSON.parse(fs.readFileSync(log, 'utf8').trim());
  assert.strictEqual(rec.exit, EXIT.CONFIG);
  assert.match(rec.error, /credentials/);
});

check('--dry-run WITH credentials still sends nothing (it only says what it would do)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-refresh-'));
  // A fake token, in a temp dir, for a run that is asserted to make no request.
  fs.writeFileSync(path.join(tmp, '.env'), 'EMS_TOKEN=not-a-real-token\n', 'utf8');
  fs.mkdirSync(path.join(tmp, 'js', 'src'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'js', 'src', '01-data.js'), path.join(tmp, 'js', 'src', '01-data.js'));
  const log = tmpLog();
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('the dry run must not make a request'); };
  try {
    const code = await runMain(['--dry-run', '--log', log, '--quiet'], tmp);
    assert.strictEqual(code, EXIT.OK);
    assert.strictEqual(calls, 0, 'the dry run made ' + calls + ' request(s)');
    const rec = JSON.parse(fs.readFileSync(log, 'utf8').trim());
    assert.strictEqual(rec.credentials, 'present');
    assert.match(rec.wouldDo, /upsert ems_cache/);
    assert.ok(!JSON.stringify(rec).includes('not-a-real-token'), 'the log leaked the token');
  } finally { globalThis.fetch = realFetch; }
});

check('the exit-code table is the one docs/ems-cache-refresh.md documents', () => {
  assert.deepStrictEqual(EXIT, { OK: 0, UNEXPECTED: 1, CONFIG: 2, LOGIN: 3, FETCH: 4, WRITE: 5 });
  const doc = read('docs/ems-cache-refresh.md');
  for (const [name, code] of Object.entries(EXIT)) {
    assert.ok(new RegExp('\\b' + code + '\\b').test(doc), 'exit code ' + code + ' (' + name + ') is not in the runbook');
  }
});

check('the runbook documents the schedule and the rotation, and carries NO secret', () => {
  const doc = read('docs/ems-cache-refresh.md');
  assert.match(doc, /30/, 'the 30-minute cadence is not in the runbook');
  assert.match(doc, /07:00/);
  assert.match(doc, /20:00/);
  assert.match(doc, /schtasks|Task Scheduler/i);
  assert.match(doc, /EMS_PASSWORD/, 'the runbook never says which key to rotate');
  // the runbook may NAME the keys; it may never carry a value for one
  const leak = /(EMS_PASSWORD|EMS_TOKEN)\s*=\s*\S+/.exec(doc.replace(/EMS_(PASSWORD|TOKEN)\s*=\s*(<[^>]*>|\.{3}|…)/g, ''));
  assert.strictEqual(leak, null, 'the runbook contains a credential VALUE: ' + (leak && leak[0]));
});

// ══════════════════════════════════════════════════════════════════════════════

const run = async () => {
  let passes = 0;
  for (const [name, fn] of queue) {
    try { await fn(); passes++; console.log('  ok - ' + name); }
    catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
  }
  console.log(failures === 0
    ? '\nPASS — ' + passes + ' checks (ems-cache-refresh + the in-app background sync)'
    : '\nFAIL — ' + failures + ' check(s) failed');
  process.exit(failures === 0 ? 0 : 1);
};
run();
