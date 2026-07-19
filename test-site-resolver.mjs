// Self-check for the EMS site resolver (js/src/14-calendar.js) — exact match only, no fuzzy containment.
// Run: node test-site-resolver.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/14-calendar.js'), 'utf8');

let failures = 0, pending = 0;
function check(name, fn) {
  pending++;
  fn().then(() => console.log('  ok - ' + name))
      .catch(e => { failures++; console.log('  FAIL - ' + name + ': ' + e.message); })
      .finally(() => { if (--pending === 0) done(); });
}
function done() { console.log(failures ? `\n${failures} FAILED` : '\nall resolver checks passed'); process.exit(failures ? 1 : 0); }

// Extract the resolver helpers from the module, injecting their deps. Range starts at the
// `let _emsSites` declaration so the real getEmsSites (which populates the live cache via emsApi)
// is included — we stub emsApi('/sites') instead, mirroring real caching behaviour.
function load(sites, map) {
  const body = src.substring(src.indexOf('let _emsSites'), src.indexOf('// Admin-role users'));
  const fn = new Function('emsApi', 'kibbutzSiteIds',
    body + '\nreturn { emsNormName, emsSiteIdForKibbutz, kibbutzHasSite, emsSitesCached };');
  return fn(async () => sites, (name) => map[name] || []);
}

const SITES = [{ id: 'S_SHILUHOT', name: 'שלוחות' }, { id: 'S_DAFNA', name: 'דפנה' }, { id: 'S_GAT', name: 'גת' }];

check('exact live name match wins', async () => {
  const m = load(SITES, {});
  assert.strictEqual(await m.emsSiteIdForKibbutz('שלוחות'), 'S_SHILUHOT');
});
check('whitespace-normalized exact match', async () => {
  const m = load(SITES, {});
  assert.strictEqual(await m.emsSiteIdForKibbutz('  שלוחות '), 'S_SHILUHOT');
});
check('NO containment match (partial name does not resolve)', async () => {
  const m = load(SITES, {});
  assert.strictEqual(await m.emsSiteIdForKibbutz('שלו'), '');   // used to wrongly match "שלוחות"
});
check('offline (no live match) falls back to the map', async () => {
  const m = load([], { 'דפנה': ['490a865d-c4f4-4a4a-96da-14a273e7f03b'] });
  assert.strictEqual(await m.emsSiteIdForKibbutz('דפנה'), '490a865d-c4f4-4a4a-96da-14a273e7f03b');
});
check('no match anywhere → empty string', async () => {
  const m = load(SITES, {});
  assert.strictEqual(await m.emsSiteIdForKibbutz('קיבוץ דמיוני'), '');
});

// kibbutzHasSite (Task 2)
check('kibbutzHasSite: true when in the map (offline)', async () => {
  const m = load([], { 'דפנה': ['490a865d-c4f4-4a4a-96da-14a273e7f03b'] });
  assert.strictEqual(m.kibbutzHasSite('דפנה'), true);
});
check('kibbutzHasSite: false when unmapped and no live sites', async () => {
  const m = load([], {});
  assert.strictEqual(m.kibbutzHasSite('קיבוץ חדש'), false);
});
check('kibbutzHasSite: true via live exact match once sites are cached', async () => {
  const m = load(SITES, {});
  await m.emsSiteIdForKibbutz('גת');          // this call populates the live cache
  assert.strictEqual(m.kibbutzHasSite('גת'), true);
  assert.strictEqual(m.kibbutzHasSite('גת ב'), false);
});
