// CityMind (Arad) → readings-fetch `ingest` — עין המפרץ daily water readings. Runs on GitHub Actions
// (.github/workflows/citymind-ein-hamifratz.yml): CityMind sits behind Cloudflare, which answers 403 to plain HTTP and
// to headless Chromium; plain headless FIREFOX works (proved 12.10.26). No proxies, no stealth: if Firefox is blocked
// the job FAILS and reports BLOCKED.
//
// ⚠ THE REPO IS PUBLIC and Actions logs are world-readable: this script prints COUNTS AND ERROR CODES ONLY — never a
// reading, a meter number, a name, a URL with parameters, or a raw exception message (Playwright messages carry URLs).
// No artifacts. The parsed rows go straight to the function, authenticated by READINGS_INGEST_KEY.
//
// env: CITYMIND_USER, CITYMIND_PASS, READINGS_INGEST_KEY (required) · DRY_RUN=true (parse + checks + counts, no write)
//      CITYMIND_DATE=YYYY-MM-DD (default: yesterday, Israel) · PLAYWRIGHT_MODULE (path of an installed playwright)
import { readFileSync } from 'node:fs';
import { parseCityMind, CityMindError } from '../../supabase/functions/readings-fetch/citymind.js';
import { badRunDate, israelYesterday } from '../../supabase/functions/readings-fetch/helpers.js';

const CM = 'https://www.city-mind.com';
const KIBBUTZ = 'עין המפרץ';
const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
// the PUBLIC anon key (the Supabase gateway wants a JWT in front of every function call) — read from the app source
const SB_ANON = /const SB_ANON = '([^']+)'/.exec(readFileSync(new URL('../../js/src/01-data.js', import.meta.url), 'utf8'))?.[1] || '';

const log = (...a) => console.log('[citymind]', ...a);
const dry = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const day = process.env.CITYMIND_DATE || israelYesterday();

/** CityMind report URL for "reading time from D", "daily readings = 1" (stage 2: CF4 = all readings of the day). */
function reportUrl(iso) {
  const d = iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) + ' 00:00';
  const q = new URLSearchParams({
    rid: '13', CF1FID: '-1', CF1OP: '0', CF1FVAL: '', LOP: '0',
    CF3FID: '232', CF3FVAL: d, CF3OP: '111',
    CF4FID: '223', CF4FVAL: '1', CF4OP: '0',
    TOSHOW: 'true', from: 'm',
  });
  return CM + '/Pages/ReadReport.aspx?' + q.toString();
}

async function exportCsv(user, pass, iso) {
  const { firefox } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const b = await firefox.launch({ headless: true });
  try {
    const pg = await b.newPage();
    // never `networkidle`: the site polls in the background forever — wait for the fields themselves
    const first = await pg.goto(CM + '/default.aspx', { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => null);
    if (!first) throw new CityMindError('DOWN', 'login page did not load');
    if (first.status() === 403 || first.status() === 503) throw new CityMindError('BLOCKED', 'status ' + first.status());
    const field = await pg.waitForSelector('input[name="AtusLogin$UserName"]', { timeout: 60000 }).catch(() => null);
    if (!field) {
      const t = (await pg.title().catch(() => '')) || '';
      throw new CityMindError(/just a moment|attention required|cloudflare/i.test(t) ? 'BLOCKED' : 'CHANGED', 'no login form');
    }
    await pg.fill('input[name="AtusLogin$UserName"]', user);
    await pg.fill('input[name="AtusLogin$Password"]', pass);
    await pg.click('input[name="AtusLogin$LoginButton"]');
    const left = await pg.waitForURL((u) => !String(u).toLowerCase().includes('default.aspx'), { timeout: 90000 }).then(() => true, () => false);
    if (!left) throw new CityMindError('AUTH', 'login refused');
    const rep = await pg.goto(reportUrl(iso), { waitUntil: 'load', timeout: 300000 }).catch(() => null);
    if (!rep) throw new CityMindError('DOWN', 'report did not load');
    if (rep.status() === 403) throw new CityMindError('BLOCKED', 'status 403');
    const ready = await pg.waitForFunction('typeof ExecuteAJAXExportCall === "function"', null, { timeout: 120000 }).then(() => true, () => false);
    if (!ready) throw new CityMindError('CHANGED', 'no export on the report page');
    // the export URL is one-shot; the CSV is windows-1255 — decoded in the page, so only text crosses back
    const res = await pg.evaluate(async () => {
      const j = await (await fetch('/Pages/AplicateToEXLFile.aspx?rid=13')).json();
      if (!j || !j.success || !j.url) return [false, ''];
      const buf = await (await fetch('/Pages/' + j.url)).arrayBuffer();
      return [true, new TextDecoder('windows-1255').decode(buf)];
    });
    if (!res[0]) throw new CityMindError('CHANGED', 'export refused');
    return res[1];
  } finally {
    await b.close();
  }
}

async function post(payload) {
  const key = process.env.READINGS_INGEST_KEY || '';
  if (!key) throw new Error('READINGS_INGEST_KEY missing');
  const r = await fetch(SB_URL + '/functions/v1/readings-fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'x-ingest-key': key },
    body: JSON.stringify({ mode: 'ingest', kibbutz: KIBBUTZ, date: day, dry_run: dry, ...payload }),
  });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}

/** Only numbers and fixed words from the function's answer reach the log. */
const counts = (d) => Object.fromEntries(Object.entries(d || {}).filter(([k, v]) =>
  ['ok', 'blocked', 'warn', 'rows', 'replacements', 'existing', 'dry_run', 'status', 'error'].includes(k) &&
  (typeof v === 'number' || typeof v === 'boolean' || /^[A-Za-z_ -]{0,40}$/.test(String(v)))));

async function main() {
  if (badRunDate(day)) { log('bad date'); process.exit(2); }
  const user = process.env.CITYMIND_USER || '', pass = process.env.CITYMIND_PASS || '';
  if (!user || !pass) { log('CityMind credentials are not configured'); process.exit(2); }
  log('mode', dry ? 'DRY-RUN (nothing is written)' : 'live');
  let rows;
  try {
    rows = parseCityMind(await exportCsv(user, pass, day), day);
  } catch (e) {
    const code = e instanceof CityMindError ? e.code : 'DOWN';
    log('fetch failed:', code);
    const r = await post({ failed: true, error_code: code }).catch(() => null);
    log('reported failure, function status', r ? r.status : 'unreachable');
    process.exit(1);
  }
  log('rows for the day:', rows.length);
  const r = await post({ rows });
  log('function status', r.status, JSON.stringify(counts(r.d)));
  if (r.status !== 200) process.exit(1);
}

main().catch((e) => { log('unexpected error:', e?.name || 'Error'); process.exit(1); });
