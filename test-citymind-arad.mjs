// test-citymind-arad.mjs — CityMind (Arad) for many kibbutzim: config-only kibbutzim, raw stage A → stage B,
// several readings a day, per-kibbutz failure isolation, no data/secrets in logs. FAKE data only (public repo).
// The real 11.10 golden reads a LOCAL file outside the repo (CITYMIND_GOLDEN_CSV) and is skipped when absent.
// Run: node test-citymind-arad.mjs
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import {
  buildWater, decodeRaw, dailyValue, ingestMatrix, intradayDrop, parseCityMind, rawPath, reportUrl, validateIngest,
} from './supabase/functions/readings-fetch/citymind.mjs';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok', name); };
const FAKE = new URL('./qa/fixtures/citymind-ein-hamifratz-fake.csv', import.meta.url);
const fakeB64 = readFileSync(FAKE).toString('base64');
const EIN = { kibbutz: 'עין המפרץ', active: true, rules: { source: 'citymind', secrets: { user: 'EINHAMIFRATZ_CITYMIND_USER', pass: 'EINHAMIFRATZ_CITYMIND_PASS' }, daily_readings: 1 } };
const HULDA = { kibbutz: 'חולדה', active: true, rules: { energy_type_code: 1 } };

// ── 1. golden: the real 11.10 export (local only) ────────────────────────────
const GOLDEN = process.env.CITYMIND_GOLDEN_CSV ||
  'C:/Users/idann/Projects/Kibbutzim/עין המפרץ/תוצרים/2026-10-12 — גולמי משוחזר 11.10 לבדיקת golden/2026-10-11.csv';
if (existsSync(GOLDEN)) {
  await t('golden 11.10 (real raw, local): 496 rows → 495 ok, 1 blocked (skip-list), before the EMS check', () => {
    const { text } = decodeRaw(readFileSync(GOLDEN).toString('base64'));
    const rows = parseCityMind(text, '2026-10-11');
    assert.strictEqual(rows.length, 496);
    // the skip-list exactly as configured for the site (db/citymind_ein_hamifratz.sql)
    const skip = JSON.parse(/"skip": ({[^}]*})/.exec(readFileSync('db/citymind_ein_hamifratz.sql', 'utf8'))[1]);
    const b = buildWater({ day: '2026-10-11', rows, rules: { skip } });
    assert.deepStrictEqual([b.counts.ok, b.counts.blocked], [495, 1]);
    assert.strictEqual(b.seq.length, 496, 'one reading a day → the sequence sheet = the rows');
  });
} else console.log('  skip golden 11.10 (no local file — public CI)');

// ── 2. five readings a day ───────────────────────────────────────────────────
const five = (serial, values, o = {}) => values.map((ft, i) => ({ id: '9' + serial.slice(-3), serial, when: `09/10/2026 ${['04:00', '08:00', '12:00', '16:00', '23:30'][i]}`, ft, ...o }));
await t('5 a day: the upload takes the LAST of the day; every reading kept in time order (seq)', () => {
  const rows = [...five('T1000001', [10, 11, 12, 13, 14]), ...five('T1000002', [5, 5, 5, 6, 7])].reverse();   // export order is not time order
  const b = buildWater({ day: '2026-10-09', rows });
  assert.deepStrictEqual(b.upload.map((u) => [u[0], u[4]]).sort(), [['T1000001', 14], ['T1000002', 7]]);
  assert.strictEqual(b.seq.length, 10);
  assert.deepStrictEqual(b.seq.filter((r) => r[2] === 'T1000001').map((r) => r[4]), [10, 11, 12, 13, 14]);
  assert.deepStrictEqual(b.counts, { ok: 2, blocked: 0, warn: 0 });
});
await t('5 a day: a drop INSIDE the day blocks the meter (the sequence is checked)', () => {
  const b = buildWater({ day: '2026-10-09', rows: five('T1000003', [20, 21, 19, 22, 23]) });
  assert.strictEqual(b.counts.blocked, 1);
  assert.match(b.exceptions[0][6], /^ירידה בתוך היום: 21 \(08:00\) → 19 \(12:00\)$/);
  assert.strictEqual(intradayDrop([{ ft: 1 }, { ft: null }, { ft: 2 }]), null);
});
await t('time order is by the clock, not the string (9:05 before 10:00, single-digit day/month)', () => {
  const rows = [{ id: '1', serial: 'T1', when: '9/10/2026 10:00', ft: 2 }, { id: '1', serial: 'T1', when: '9/10/2026 9:05', ft: 1 }];
  assert.strictEqual(buildWater({ day: '2026-10-09', rows }).upload[0][4], 2);
});

// ── 3. a kibbutz is CONFIG, not code ─────────────────────────────────────────
const DUMMY = { kibbutz: 'קיבוץ דמה', active: true, rules: { source: 'citymind', secrets: { user: 'DUMMY_CITYMIND_USER', pass: 'DUMMY_CITYMIND_PASS' }, daily_readings: 5 } };
await t('matrix: active CityMind rows with both secret names; Hulda / inactive / no-secrets / bad names are left out', () => {
  const m = ingestMatrix([HULDA, EIN, DUMMY,
    { ...DUMMY, kibbutz: 'כבוי', active: false },
    { kibbutz: 'בלי סודות', active: true, rules: { source: 'citymind' } },
    { kibbutz: 'שם רע', active: true, rules: { source: 'citymind', secrets: { user: 'x; rm -rf', pass: 'GOOD_NAME' } } }]);
  assert.deepStrictEqual(m.map((s) => s.kibbutz).sort(), ['עין המפרץ', 'קיבוץ דמה'].sort());
  assert.deepStrictEqual(m.find((s) => s.kibbutz === 'קיבוץ דמה'), { kibbutz: 'קיבוץ דמה', user_secret: 'DUMMY_CITYMIND_USER', pass_secret: 'DUMMY_CITYMIND_PASS', daily: '5' });
});
await t('daily readings value: from config, default 1, never free text into the URL', () => {
  assert.strictEqual(dailyValue({}), '1');
  assert.strictEqual(dailyValue({ daily_readings: '5&x=1' }), '1');
  assert.match(reportUrl('2026-10-09', '5'), /CF4FID=223&CF4FVAL=5&/);
  assert.match(reportUrl('2026-10-09'), /CF3FVAL=09%2F10%2F2026\+00%3A00/);
});
await t('the workflow names no kibbutz and no secret: secrets come by name from the matrix; fail-fast off', () => {
  const wf = readFileSync(new URL('./.github/workflows/citymind-arad.yml', import.meta.url), 'utf8');
  assert.match(wf, /secrets\[matrix\.user_secret\]/);
  assert.match(wf, /secrets\[matrix\.pass_secret\]/);
  assert.match(wf, /fail-fast: false/);
  assert.doesNotMatch(wf, /EINHAMIFRATZ_|עין המפרץ|אור הנר|עין השופט/);
});
await t('the app tab is generic: siteMode(any citymind row) = automatic + check before download', async () => {
  const { siteMode } = await import('./app/src/lib/readingsLogic.ts').catch(() => ({}));
  if (!siteMode) { console.log('    (readingsLogic.ts not importable by plain node — covered by vitest)'); return; }
  assert.deepStrictEqual([siteMode(DUMMY).manual, siteMode(DUMMY).requireCheck], [false, true]);
});
await t('ingest gate: raw base64 accepted for ANY well-formed kibbutz name (the DB decides); rows + csv together refused', () => {
  const ok = validateIngest({ mode: 'ingest', kibbutz: 'קיבוץ דמה', date: '2026-10-09', csv_b64: fakeB64, dry_run: true }, 5000);
  assert.deepStrictEqual(ok, { ok: true, req: { kibbutz: 'קיבוץ דמה', date: '2026-10-09', csv_b64: fakeB64, dry_run: true } });
  assert.strictEqual(validateIngest({ mode: 'ingest', kibbutz: 'x', date: '2026-10-09', csv_b64: 'not base64!' }, 50).status, 400);
  assert.strictEqual(validateIngest({ mode: 'ingest', kibbutz: 'x', date: '2026-10-09', csv_b64: fakeB64, rows: [] }, 5000).status, 400);
});
await t('stage A → stage B: the stored raw bytes decode + parse + build without CityMind (rebuild path)', () => {
  const { bytes, text } = decodeRaw(fakeB64);
  assert.deepStrictEqual(Buffer.from(bytes), readFileSync(FAKE), 'stored byte for byte');
  const b = buildWater({ day: '2026-10-09', rows: parseCityMind(text, '2026-10-09') });
  assert.ok(b.counts.ok > 0);
  assert.strictEqual(rawPath('S', '2026-10-09'), 'S/2026-10-09/raw-citymind.csv');
});

// ── 4. the runner: one kibbutz fails, the others succeed; logs carry no data / secrets ──
const posts = [];
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const j = JSON.parse(body);
    posts.push({ key: req.headers['x-ingest-key'], ...j });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(j.failed ? { run_id: 'r', status: 'failed' } : { run_id: 'r', rows: 6, ok: 4, blocked: 2, warn: 0 }));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const runKibbutz = (kibbutz, pass) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['scripts/citymind/citymind-daily.mjs'], {
    env: { ...process.env, CITYMIND_KIBBUTZ: kibbutz, CITYMIND_USER: 'user-' + kibbutz, CITYMIND_PASS: pass, CITYMIND_DAILY: '5',
      READINGS_INGEST_KEY: 'ingest-key-xyz', CITYMIND_DATE: '2026-10-09', DRY_RUN: 'true',
      READINGS_FN_URL: `http://127.0.0.1:${srv.address().port}/`, PLAYWRIGHT_MODULE: new URL('./qa/fixtures/playwright-citymind-stub.mjs', import.meta.url).href },
  });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ code, out }));
});
const [good, bad, good2] = await Promise.all([runKibbutz('קיבוץ א', 'good-pass'), runKibbutz('קיבוץ ב', 'WRONG-pass-123'), runKibbutz('קיבוץ ג', 'good-pass')]);
srv.close();
await t('one kibbutz with a wrong password fails (AUTH, exit 1); the others post their raw export (exit 0)', () => {
  assert.strictEqual(good.code, 0, good.out);
  assert.strictEqual(good2.code, 0, good2.out);
  assert.strictEqual(bad.code, 1, bad.out);
  const by = Object.fromEntries(posts.map((p) => [p.kibbutz, p]));
  assert.deepStrictEqual([by['קיבוץ ב'].failed, by['קיבוץ ב'].error_code], [true, 'AUTH']);
  for (const k of ['קיבוץ א', 'קיבוץ ג']) {
    assert.strictEqual(by[k].csv_b64, fakeB64, 'the raw bytes, unchanged');
    assert.strictEqual(by[k].rows, undefined, 'no parsed rows travel — stage B is the function');
    assert.strictEqual(by[k].dry_run, true);
  }
  assert.ok(posts.every((p) => p.key === 'ingest-key-xyz'));
});
await t('secret + data scan of the runner logs: no password, user, key, serial, reading or URL', () => {
  const fake = parseCityMind(decodeRaw(fakeB64).text, '2026-10-09');
  const logs = good.out + bad.out + good2.out;
  for (const s of ['good-pass', 'WRONG-pass-123', 'user-קיבוץ', 'ingest-key-xyz', 'http', 'example/secret', ...fake.map((r) => r.serial).filter(Boolean)]) {
    assert.ok(!logs.includes(s), 'log leaks: ' + (s.length > 3 ? s.slice(0, 3) + '…' : s));
  }
  for (const r of fake) if (r.ft !== null && r.ft > 99) assert.ok(!logs.includes(String(r.ft)), 'log leaks a reading');
  assert.match(bad.out, /fetch failed: AUTH/);
});
await t('secret + data scan of this feature\'s committed files: no real serial (from the local golden), no password-like literal', () => {
  const files = ['scripts/citymind/citymind-daily.mjs', 'scripts/citymind/sites.mjs', 'supabase/functions/readings-fetch/citymind.mjs',
    '.github/workflows/citymind-arad.yml', 'db/citymind_arad_multi.sql', 'qa/fixtures/playwright-citymind-stub.mjs', 'test-citymind-arad.mjs',
    'docs/superpowers/specs/2026-10-12-arad-multi-kibbutz-design.md'].filter((f) => existsSync(f));
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  // secret NAMES (capitals, e.g. "pass": "X_CITYMIND_PASS") are fine; a value-looking literal is not
  const pw = [...all.matchAll(/(password|passwd|pass)['"]?\s*[:=]\s*['"]([^'"$]{6,})['"]/gi)].map((m) => m[2]).filter((v) => !/^(<[A-Z]+>|[A-Z])[A-Z0-9_]+$/.test(v));   // X_CITYMIND_PASS / <PREFIX>_CITYMIND_PASS
  assert.strictEqual(pw.length, 0, 'password-like literal');
  assert.doesNotMatch(all, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'no JWT');
  if (existsSync(GOLDEN)) {
    const real = parseCityMind(decodeRaw(readFileSync(GOLDEN).toString('base64')).text, '2026-10-11').map((r) => r.serial).filter((s) => s.length >= 7);
    const hit = real.filter((s) => all.includes(s));
    assert.deepStrictEqual(hit.length, 0, hit.length + ' real serials in committed files');
  }
});

console.log(`test-citymind-arad: ${n} passed`);
