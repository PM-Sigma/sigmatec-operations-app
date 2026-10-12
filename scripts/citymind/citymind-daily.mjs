// CityMind (Arad) → readings-fetch `ingest` — one kibbutz per run (the GitHub matrix runs one job per kibbutz,
// .github/workflows/citymind-arad.yml). CityMind sits behind Cloudflare, which answers 403 to plain HTTP and to headless
// Chromium; plain headless FIREFOX works (proved 12.10.26). No proxies, no stealth: if Firefox is blocked the job FAILS
// and reports BLOCKED.
//
// STAGE A only: the export is sent RAW (its exact bytes, base64) — the function stores it, then parses and checks it
// (stage B), and can re-run stage B from the stored file without logging in here again.
//
// ⚠ THE REPO IS PUBLIC and Actions logs are world-readable: this script prints COUNTS AND ERROR CODES ONLY — never a
// reading, a meter number, a name, a URL with parameters, or a raw exception message (Playwright messages carry URLs).
// No artifacts.
//
// env: CITYMIND_KIBBUTZ (the reading_sites.kibbutz) · CITYMIND_USER, CITYMIND_PASS, READINGS_INGEST_KEY (required)
//      CITYMIND_DAILY (the report's "קריאות יומיות" value, from the site's config; default 1)
//      DRY_RUN=true (parse + checks + counts, no write) · CITYMIND_DATE=YYYY-MM-DD (default: yesterday, Israel)
//      PROBE=true: log in, print the "קריאות יומיות" filter's options and, per value in PROBE_VALUES (default 1,5,0),
//      how many readings per meter per day it returns — counts only; nothing is sent to the function.
//      PLAYWRIGHT_MODULE (path of an installed playwright)
import { readFileSync } from 'node:fs';
import { parseCityMind, reportUrl, CityMindError, safeErrorLine, CM_BASE as CM } from '../../supabase/functions/readings-fetch/citymind.mjs';
import { badRunDate, israelYesterday } from '../../supabase/functions/readings-fetch/helpers.js';

const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
const FN_URL = process.env.READINGS_FN_URL || SB_URL + '/functions/v1/readings-fetch';   // override: tests only
// the PUBLIC anon key (the Supabase gateway wants a JWT in front of every function call) — read from the app source
const SB_ANON = /const SB_ANON = '([^']+)'/.exec(readFileSync(new URL('../../js/src/01-data.js', import.meta.url), 'utf8'))?.[1] || '';

const log = (...a) => console.log('[citymind]', ...a);
const env = (k) => process.env[k] || '';
const dry = env('DRY_RUN').toLowerCase() === 'true';
const probe = env('PROBE').toLowerCase() === 'true';
const day = env('CITYMIND_DATE') || israelYesterday();
const kibbutz = env('CITYMIND_KIBBUTZ');
const daily = /^-?\d{1,3}$/.test(env('CITYMIND_DAILY')) ? env('CITYMIND_DAILY') : '1';

async function login(user, pass) {
  const { firefox } = await import(env('PLAYWRIGHT_MODULE') || 'playwright');
  const b = await firefox.launch({ headless: true });   // one browser per kibbutz (one job per kibbutz)
  const pg = await b.newPage();
  // never `networkidle`: the site polls in the background forever — wait for the fields themselves
  const first = await pg.goto(CM + '/default.aspx', { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => null);
  if (!first) throw new CityMindError('DOWN', 'login page did not load', { stage: 'login-page' });
  if (first.status() === 403 || first.status() === 503) throw new CityMindError('BLOCKED', 'blocked', { stage: 'login-page status ' + first.status() });
  const field = await pg.waitForSelector('input[name="AtusLogin$UserName"]', { timeout: 60000 }).catch(() => null);
  if (!field) {
    const t = (await pg.title().catch(() => '')) || '';
    const cf = /just a moment|attention required|cloudflare/i.test(t);
    throw new CityMindError(cf ? 'BLOCKED' : 'CHANGED', 'no login form', { stage: 'login-form not found (page: ' + (cf ? 'cloudflare challenge' : 'other') + ')' });
  }
  await pg.fill('input[name="AtusLogin$UserName"]', user);
  await pg.fill('input[name="AtusLogin$Password"]', pass);
  await pg.click('input[name="AtusLogin$LoginButton"]');
  const left = await pg.waitForURL((u) => !String(u).toLowerCase().includes('default.aspx'), { timeout: 90000 }).then(() => true, () => false);
  if (!left) throw new CityMindError('AUTH', 'login refused', { stage: 'login' });
  return { b, pg };
}

/** The report for `iso` with CF4 = value → the export's exact bytes as base64 (decoded nowhere here). */
async function exportRaw(pg, iso, value) {
  const rep = await pg.goto(reportUrl(iso, value), { waitUntil: 'load', timeout: 300000 }).catch(() => null);
  if (!rep) throw new CityMindError('DOWN', 'report did not load', { stage: 'report-page' });
  if (rep.status() === 403) throw new CityMindError('BLOCKED', 'blocked', { stage: 'report-page status 403' });
  const ready = await pg.waitForFunction('typeof ExecuteAJAXExportCall === "function"', null, { timeout: 120000 }).then(() => true, () => false);
  if (!ready) throw new CityMindError('CHANGED', 'no export on the report page', { stage: 'report-page export function missing' });
  // the export URL is one-shot; only base64 text crosses back
  const res = await pg.evaluate(async () => {
    const j = await (await fetch('/Pages/AplicateToEXLFile.aspx?rid=13')).json();
    if (!j || !j.success || !j.url) return [false, !j ? 'no-json' : !j.success ? 'success-false' : 'no-url'];
    const u8 = new Uint8Array(await (await fetch('/Pages/' + j.url)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return [true, btoa(bin)];
  }).catch(() => [false, 'download-failed']);
  if (!res[0]) throw new CityMindError('CHANGED', 'export refused', { stage: 'export refused (' + res[1] + ')' });
  return res[1];
}
const b64text = (b64) => new TextDecoder('windows-1255').decode(Buffer.from(b64, 'base64'));

async function post(payload) {
  const key = env('READINGS_INGEST_KEY');
  if (!key) throw new Error('READINGS_INGEST_KEY missing');
  const r = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'x-ingest-key': key },
    body: JSON.stringify({ mode: 'ingest', kibbutz, date: day, dry_run: dry, ...payload }),
  });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}

/** Only numbers and fixed words from the function's answer reach the log. */
const counts = (d) => Object.fromEntries(Object.entries(d || {}).filter(([k, v]) =>
  ['ok', 'blocked', 'warn', 'rows', 'replacements', 'existing', 'dry_run', 'status', 'error', 'index', 'field', 'reason', 'failed'].includes(k) &&
  (typeof v === 'number' || typeof v === 'boolean' || /^[A-Za-z_ -]{0,40}$/.test(String(v)))));

/** PROBE: which "קריאות יומיות" values exist, and how many readings per meter per day each returns. Counts only. */
async function runProbe(pg) {
  await pg.goto(reportUrl(day, '1'), { waitUntil: 'load', timeout: 300000 }).catch(() => null);
  // option labels of the report's small dropdowns (a filter UI word or a number — never data); ≤ 12 options, short text
  const opts = await pg.evaluate(() => [...document.querySelectorAll('select')].filter((s) => s.options.length <= 12)
    .map((s) => [...s.options].map((o) => [o.value, o.text.trim()]))).catch(() => []);
  const safe = (x) => (/^[\w֐-׿ ."'-]{0,20}$/.test(x) ? x : '?');
  opts.forEach((o, i) => log('dropdown', i + 1, o.map(([v, t]) => safe(v) + '=' + safe(t)).join(' | ')));
  for (const v of (env('PROBE_VALUES') || '1,5,0').split(',').map((x) => x.trim()).filter((x) => /^-?\d{1,3}$/.test(x))) {
    try {
      const rows = parseCityMind(b64text(await exportRaw(pg, day, v)), day);
      const per = new Map();
      for (const r of rows) per.set(r.serial, (per.get(r.serial) || 0) + 1);
      const n = [...per.values()];
      log(`CF4=${v}: ${rows.length} rows for the day, ${per.size} meters, readings per meter max ${Math.max(...n)} / min ${Math.min(...n)}`);
    } catch (e) { log(`CF4=${v}:`, e instanceof CityMindError ? safeErrorLine(e) : 'failed'); }
  }
}

async function main() {
  if (badRunDate(day)) { log('bad date'); process.exit(2); }
  if (!kibbutz) { log('CITYMIND_KIBBUTZ is not set'); process.exit(2); }
  const user = env('CITYMIND_USER'), pass = env('CITYMIND_PASS');
  if (!user || !pass) { log('CityMind credentials are not configured for this kibbutz'); process.exit(2); }
  log('mode', probe ? 'PROBE (nothing is sent)' : dry ? 'DRY-RUN (nothing is written)' : 'live', '· daily readings value', daily);
  let session = null, b64;
  try {
    session = await login(user, pass);
    if (probe) { await runProbe(session.pg); return; }
    b64 = await exportRaw(session.pg, day, daily);
  } catch (e) {
    const code = e instanceof CityMindError ? e.code : 'DOWN';
    log('fetch failed:', e instanceof CityMindError ? safeErrorLine(e) : code);
    if (probe) process.exit(1);
    const r = await post({ failed: true, error_code: code }).catch(() => null);
    log('reported failure, function status', r ? r.status : 'unreachable');
    process.exit(1);
  } finally {
    await session?.b.close().catch(() => {});
  }
  // a local parse only for the log line; the function parses the stored raw itself
  try { log('rows for the day:', parseCityMind(b64text(b64), day).length); } catch (e) { log('local parse:', e instanceof CityMindError ? safeErrorLine(e) : 'failed'); }
  const r = await post({ csv_b64: b64 });
  log('function status', r.status, JSON.stringify(counts(r.d)));
  if (r.status !== 200 || r.d?.status === 'failed') process.exit(1);
}

main().catch((e) => { log('unexpected error:', e?.name || 'Error'); process.exit(1); });
