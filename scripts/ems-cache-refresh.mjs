// 🔄 The office-PC EMS cache refresh job (spec §7k #10, Task 20).
//
//   node scripts/ems-cache-refresh.mjs --dry-run
//   node scripts/ems-cache-refresh.mjs --dry-run --fixture qa/fixtures/ems-tasks.json
//   node scripts/ems-cache-refresh.mjs                 # the real run (Task Scheduler)
//
// Runbook — including the Task Scheduler setup (every 30 min, 07:00–20:00) and how to rotate
// the password: docs/ems-cache-refresh.md.
//
// WHY THIS EXISTS. The shared EMS snapshot (`ems_cache`) is what puts open tasks on a kibbutz
// card for people who never sign in to EMS at all. It is only ever refreshed by a browser that
// IS signed in, so on a day when no admin opens the app, everyone reads yesterday's tasks.
// This job is that browser, headless, from עידן's office PC — until the EMS issues a service
// token and the refresh can move server-side (spec §7k #10, "Later:").
//
// ── CREDENTIALS ──────────────────────────────────────────────────────────────────────────
// Read from a LOCAL, GIT-IGNORED `.env` at the repo root (`.env` is in .gitignore — verified
// by test-ems-refresh.mjs, which also greps this file for hardcoded secrets). Nothing in this
// repository contains them, and this script never prints them: it logs statuses and counts.
// A missing `.env` is not an error in --dry-run; it is exit 2 in a real run.
//
//   EMS_EMAIL / EMS_PASSWORD     עידן's EMS sign-in
//   EMS_TOKEN                    optional — skip the password step with a token from a real
//                                sign-in (the only way in if the account has 2FA)
//   EMS_API_BASE                 optional, default https://api.sigmatec-ems.com
//   EMS_SYNCED_BY                optional, what the app shows as "synced by", default 'משרד'
//   EMS_REFRESH_LOG              optional, overrides the log path
//
// ── THE WRITE PATH ───────────────────────────────────────────────────────────────────────
// `emsCacheWrite` looks like an Apps Script POST in js/src/13-ems.js, but js/src/01-data.js
// intercepts it: the real write is `POST /rest/v1/ems_cache?on_conflict=id` with
// `Prefer: resolution=merge-duplicates` and, since the RLS lockdown, the AUTHENTICATED bridge
// pass — the anon key is read-only. So this job walks the same three steps a browser does:
//   1. EMS sign-in                → an EMS bearer
//   2. POST functions/v1/ems-auth → a Supabase JWT minted from that bearer
//   3. upsert ems_cache id=1      → the snapshot everyone reads
// The Supabase project URL and the PUBLIC anon key are read out of js/src/01-data.js rather
// than duplicated here, so a redeployment moves this job with the app.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Exit codes. Task Scheduler shows the last one, and docs/ems-cache-refresh.md decodes them. */
export const EXIT = {
  OK: 0,          // refreshed (or a dry run that had nothing left to prove)
  UNEXPECTED: 1,  // a bug in this script
  CONFIG: 2,      // no .env / no credentials / the app constants could not be read
  LOGIN: 3,       // EMS rejected the sign-in, or it wants a 2FA code nobody can type
  FETCH: 4,       // signed in, but the task crawl failed
  WRITE: 5,       // crawled, but the shared cache could not be written
};

/** Must equal EMS_CACHE_VER in js/src/13-ems.js — pinned by test-ems-refresh.mjs. */
export const EMS_CACHE_VER = 2;
/** The open statuses, i.e. EMS_STATUS minus EMS_CLOSED (js/src/14-calendar.js). Pinned too. */
export const OPEN_STATUSES = ['new', 'in_progress', 'waiting_for_client', 'on_hold'];
export const PAGE_SIZE = 200;
export const PAGE_CAP = 20;
const DEFAULT_BASE = 'https://api.sigmatec-ems.com';

// ───────────────────────────── config ─────────────────────────────

/**
 * Pure .env parser — `KEY=value`, `#` comments, optional `export `, optional quotes. Small on
 * purpose: this job must not need `npm install` on a PC that only runs Task Scheduler.
 */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text == null ? '' : text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}

/** The real environment wins over `.env`, so a one-off run can override without editing it. */
export function loadConfig(root = ROOT, env = process.env) {
  const file = join(root, '.env');
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const pick = k => (env[k] != null && env[k] !== '' ? env[k] : fromFile[k]) || '';
  return {
    envFileFound: existsSync(file),
    base: (pick('EMS_API_BASE') || DEFAULT_BASE).replace(/\/$/, ''),
    email: pick('EMS_EMAIL'),
    password: pick('EMS_PASSWORD'),
    token: pick('EMS_TOKEN'),
    syncedBy: pick('EMS_SYNCED_BY') || 'משרד',
    logPath: pick('EMS_REFRESH_LOG'),
  };
}

/** Pure: is there any way to authenticate at all? (Never reports WHICH secret is missing.) */
export function hasCredentials(cfg) {
  return !!(cfg && (cfg.token || (cfg.email && cfg.password)));
}

export function parseArgs(argv) {
  const out = { dryRun: false, fixture: '', log: '', quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') out.dryRun = true;
    else if (a === '--quiet' || a === '-q') out.quiet = true;
    else if (a === '--fixture') out.fixture = argv[++i] || '';
    else if (a.startsWith('--fixture=')) out.fixture = a.slice(10);
    else if (a === '--log') out.log = argv[++i] || '';
    else if (a.startsWith('--log=')) out.log = a.slice(6);
  }
  // A fixture run is offline by definition: it exercises the mapper, nothing else.
  if (out.fixture) out.dryRun = true;
  return out;
}

/**
 * The Supabase project URL + PUBLIC anon key, lifted from the client bundle source so there is
 * exactly one copy in the repo. Throws with a clear message if the shape ever changes.
 */
export function readClientConstants(root = ROOT) {
  const src = readFileSync(join(root, 'js', 'src', '01-data.js'), 'utf8');
  const url = /const SB_URL\s*=\s*'([^']+)'/.exec(src);
  const anon = /const SB_ANON\s*=\s*'([^']+)'/.exec(src);
  if (!url || !anon) throw new Error('could not read SB_URL / SB_ANON from js/src/01-data.js');
  return { sbUrl: url[1].replace(/\/$/, ''), sbAnon: anon[1] };
}

// ───────────────────────────── the mapper ─────────────────────────────

/** Mirror of `emsLinkIds` (js/src/14-calendar.js) — the string form really does occur. */
export function emsLinkIds(t) {
  let x = t && (t.linkedEntityIds || t.linked_entity_ids);
  if (!x) return [];
  if (typeof x === 'string') {
    try { x = JSON.parse(x); }
    catch { x = x.replace(/[[\]"]/g, '').split(',').map(s => s.trim()).filter(Boolean); }
  }
  return Array.isArray(x) ? x : [];
}

/**
 * THE contract with the client: byte-identical to `emsSlimTask` in js/src/13-ems.js, because
 * both write the same `ems_cache.tasks` column and the card widget reads whichever landed
 * last. test-ems-refresh.mjs runs the real `emsSlimTask` out of the legacy source over the
 * same fixture and diffs the two — that test is the reason this duplication is safe.
 */
export function slimTask(t) {
  return {
    id: t.id, title: t.title, status: t.status, priority: t.priority, type: t.type,
    site: t.site ? { id: t.site.id, name: t.site.name } : null,
    expectedCompletionDate: t.expectedCompletionDate || '',
    assignee: t.assignee ? { id: t.assignee.id, firstName: t.assignee.firstName, lastName: t.assignee.lastName } : null,
    description: t.description || '',
    linkType: (t.linkType || t.link_type || ''), linkCount: emsLinkIds(t).length,
  };
}

/** Clamping / overlapping pages repeat tasks — the same de-dup `emsSyncCache` does. */
export function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const t of rows || []) {
    if (!t || !t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/** Pure: the querystring for one page of open tasks. */
export function tasksPath(page, take = PAGE_SIZE, statuses = OPEN_STATUSES) {
  const p = new URLSearchParams({ page: String(page), take: String(take) });
  for (const s of statuses) p.append('status', s);
  return '/v1/employee-tasks?' + p.toString();
}

/** Pure: stop the crawl? Mirrors the break conditions in `emsSyncCache`. */
export function crawlDone(batchLength, collected, total, page, take = PAGE_SIZE, cap = PAGE_CAP) {
  if (batchLength < take) return 'short-page';
  if (total != null && collected >= total) return 'reached-total';
  if (page >= cap) return 'page-cap';
  return '';
}

// ───────────────────────────── network ─────────────────────────────

class StepError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function postJson(url, body, headers = {}, timeoutMs = 30_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, ok: res.ok, json, text };
  } finally { clearTimeout(t); }
}

/**
 * EMS sign-in. A `type: '2FA'` answer means the account mails a code — there is nobody at the
 * keyboard at 07:30, so that is a hard stop with the workaround named, not a retry loop.
 * The password is never echoed, and the token is never logged.
 */
export async function emsLogin(base, email, password) {
  const r = await postJson(base + '/v1/auth/login/password', { login: email, password });
  const data = r.json || {};
  if (data.accessToken && data.type === '2FA') {
    throw new StepError(EXIT.LOGIN, 'the EMS account requires a 2FA code — a headless job cannot complete it. Put a token from a real sign-in in .env as EMS_TOKEN, or ask the EMS team for a service account (docs/ems-cache-refresh.md).');
  }
  if (!data.accessToken) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'no accessToken in the reply');
    throw new StepError(EXIT.LOGIN, 'EMS sign-in failed (' + r.status + '): ' + msg);
  }
  return data.accessToken;
}

/** Crawl every open task, exactly the way `emsSyncCache` does. Returns the RAW rows. */
export async function emsFetchOpenTasks(base, token, onPage = () => {}) {
  const open = [];
  let page = 1;
  for (;;) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 60_000);
    let res;
    try {
      res = await fetch(base + tasksPath(page), {
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        signal: ac.signal,
      });
    } finally { clearTimeout(t); }
    if (res.status === 401) throw new StepError(EXIT.LOGIN, 'EMS answered 401 — the token is not valid (expired, or rotated).');
    if (!res.ok) throw new StepError(EXIT.FETCH, 'EMS /employee-tasks answered ' + res.status);
    const body = await res.json().catch(() => null);
    const batch = (body && body.data) || (Array.isArray(body) ? body : []);
    open.push(...batch);
    const total = body && body.meta && (body.meta.total != null ? body.meta.total : body.meta.count);
    onPage({ page, got: batch.length, collected: open.length, total: total ?? null });
    const stop = crawlDone(batch.length, open.length, total ?? null, page);
    if (stop) return { rows: open, pages: page, stoppedBecause: stop, total: total ?? null };
    page++;
  }
}

/** Trade the EMS bearer for the Supabase pass — the same `ems-auth` call the browser makes. */
export async function mintSupabasePass(sbUrl, sbAnon, emsToken) {
  const r = await postJson(sbUrl + '/functions/v1/ems-auth', { emsToken }, { apikey: sbAnon, Authorization: 'Bearer ' + sbAnon });
  if (!r.json || !r.json.token) {
    throw new StepError(EXIT.WRITE, 'ems-auth did not mint a pass (' + r.status + '): ' + ((r.json && r.json.error) || 'no token'));
  }
  return r.json.token;
}

/** The write itself: `ems_cache` id=1, the row js/src/01-data.js builds for `emsCacheWrite`. */
export async function writeSharedCache(sbUrl, sbAnon, pass, tasks, syncedBy) {
  const r = await postJson(
    sbUrl + '/rest/v1/ems_cache?on_conflict=id',
    { id: 1, tasks, synced_at: new Date().toISOString(), synced_by: syncedBy, ver: EMS_CACHE_VER },
    { apikey: sbAnon, Authorization: 'Bearer ' + pass, Prefer: 'resolution=merge-duplicates,return=minimal' },
  );
  if (!r.ok) throw new StepError(EXIT.WRITE, 'ems_cache upsert answered ' + r.status + ' ' + String(r.text || '').slice(0, 200));
  return tasks.length;
}

// ───────────────────────────── logging ─────────────────────────────

/**
 * Outside the repo by default: Task Scheduler runs this every half hour and a log file inside
 * a git checkout is noise in `git status` forever.
 */
export function defaultLogPath() {
  const base = process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || os.tmpdir();
  return join(base, 'Sigmatec', 'ems-cache-refresh.log');
}

const LOG_MAX_BYTES = 1_000_000;

export function writeLogLine(path, line) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    // Keep the tail when it grows past ~1 MB: half a year of half-hourly runs fits easily,
    // and nobody ever prunes a log file by hand.
    try {
      if (statSync(path).size > LOG_MAX_BYTES) {
        const keep = readFileSync(path, 'utf8').split('\n').slice(-2000).join('\n');
        writeFileSync(path, keep, 'utf8');
      }
    } catch { /* no file yet */ }
    appendFileSync(path, line + '\n', 'utf8');
    return true;
  } catch { return false; }   // a job that cannot log still has to do its job
}

// ───────────────────────────── main ─────────────────────────────

export async function main(argv = process.argv.slice(2), root = ROOT) {
  const args = parseArgs(argv);
  const cfg = loadConfig(root);
  const logPath = args.log || cfg.logPath || defaultLogPath();
  const started = Date.now();
  const report = {
    at: new Date().toISOString(),
    mode: args.fixture ? 'fixture' : args.dryRun ? 'dry-run' : 'live',
    base: cfg.base,
    statuses: OPEN_STATUSES,
    ver: EMS_CACHE_VER,
    syncedBy: cfg.syncedBy,
    envFile: cfg.envFileFound ? '.env found' : '.env not present',
    credentials: hasCredentials(cfg) ? 'present' : 'absent',
    log: logPath,
  };

  const finish = (code, extra) => {
    Object.assign(report, extra, { exit: code, ms: Date.now() - started });
    const line = JSON.stringify(report);
    report.logged = writeLogLine(logPath, line);
    if (!args.quiet) console.log(JSON.stringify(report, null, 2));
    return code;
  };

  try {
    // ── the mapper, offline: --fixture runs the real slimTask over raw EMS rows on disk.
    if (args.fixture) {
      const raw = JSON.parse(readFileSync(resolve(root, args.fixture), 'utf8'));
      const rows = Array.isArray(raw) ? raw : (raw.data || []);
      const slim = dedupeById(rows).map(slimTask);
      return finish(EXIT.OK, {
        fixture: args.fixture,
        read: rows.length,
        mapped: slim.length,
        bytes: JSON.stringify(slim).length,
        sample: slim.slice(0, 2),
        note: 'mapper only — no EMS request, no cache write',
      });
    }

    if (!hasCredentials(cfg)) {
      const why = 'no EMS credentials — put EMS_EMAIL + EMS_PASSWORD (or EMS_TOKEN) in a local .env (docs/ems-cache-refresh.md)';
      // A dry run is a CONFIGURATION CHECK. Reporting "nothing to sign in with" is a complete
      // answer to it, so it is exit 0; the live job treats the same state as exit 2.
      if (args.dryRun) return finish(EXIT.OK, { wouldDo: 'sign in → crawl open tasks → upsert ems_cache id=1', blocked: why });
      return finish(EXIT.CONFIG, { error: why });
    }

    const { sbUrl, sbAnon } = readClientConstants(root);
    report.supabase = sbUrl;

    if (args.dryRun) {
      return finish(EXIT.OK, { wouldDo: 'sign in → crawl open tasks → upsert ems_cache id=1', note: 'dry run — no request was sent' });
    }

    const emsToken = cfg.token || await emsLogin(cfg.base, cfg.email, cfg.password);
    report.auth = cfg.token ? 'EMS_TOKEN from .env' : 'password sign-in';

    const pages = [];
    const crawl = await emsFetchOpenTasks(cfg.base, emsToken, p => pages.push(p));
    const slim = dedupeById(crawl.rows).map(slimTask);
    report.pages = crawl.pages;
    report.stoppedBecause = crawl.stoppedBecause;
    report.fetched = crawl.rows.length;
    report.tasks = slim.length;
    if (crawl.stoppedBecause === 'page-cap') report.warning = 'hit the page cap — the snapshot may be truncated';

    const pass = await mintSupabasePass(sbUrl, sbAnon, emsToken);
    await writeSharedCache(sbUrl, sbAnon, pass, slim, cfg.syncedBy);
    return finish(EXIT.OK, { wrote: slim.length });
  } catch (e) {
    const code = e instanceof StepError ? e.code : EXIT.UNEXPECTED;
    return finish(code, { error: String((e && e.message) || e) });
  }
}

// Only when RUN, never when imported by the test.
const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(e => {
    console.error(String((e && e.message) || e));
    process.exitCode = EXIT.UNEXPECTED;
  });
}
