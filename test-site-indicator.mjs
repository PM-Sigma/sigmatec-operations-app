// Self-check for applyCardSiteWarnings (js/src/13-ems.js) — ⚠️ chip only on site-less cards.
// Run: node test-site-indicator.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/13-ems.js'), 'utf8');

// minimal card DOM double
function mkCard(name) {
  const kids = [];
  return {
    dataset: { name },
    _kids: kids,
    querySelectorAll: () => ({ forEach() {} }),           // no stale chips
    querySelector: () => null,
    appendChild(el) { kids.push(el); },
    insertAdjacentElement(_pos, el) { kids.push(el); },
    get chipCount() { return kids.filter(k => (k.className || '').includes('card-no-site')).length; }
  };
}
const cards = [mkCard('דפנה'), mkCard('שלוחות')];
const orphan = mkCard('מקום ללא אתר');
cards.push(orphan);
const document_ = { querySelectorAll: () => cards, createElement: () => ({ className: '', innerHTML: '', style: {} }) };

const fn = new Function('document', 'window', 'kibbutzIsUnlinked', 'emsEsc',
  src.substring(src.indexOf('function applyCardSiteWarnings'), src.indexOf('window.applyCardSiteWarnings')) +
  '\nreturn applyCardSiteWarnings;');
// The one rule (spec 2026-09-23 ems-session §4), extracted from js/src/01-data.js: linked iff the
// `kibbutzim` row's `ems_site_ids` is non-empty — the same rule the bell uses (lib/kibbutzim.ts).
const data = fs.readFileSync(path.join(__dirname, 'js/src/01-data.js'), 'utf8');
const emsIdsUnlinked = new Function(
  data.substring(data.indexOf('function emsIdsUnlinked'), data.indexOf('function kibbutzIsUnlinked')) +
  '\nreturn emsIdsUnlinked;')();
const rows = {
  'דפנה': { ems_site_ids: ['490a'] },
  'שלוחות': { ems_site_ids: '["9a0b"]' },
  'מקום ללא אתר': { ems_site_ids: [] },
};
fn(document_, {}, (n) => emsIdsUnlinked(rows[n]), s => s)();

let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };
// goldens for the rule itself
t('rule: [] → unlinked', emsIdsUnlinked({ ems_site_ids: [] }) === true);
t('rule: null ids → unlinked', emsIdsUnlinked({ ems_site_ids: null }) === true);
t('rule: [""] → unlinked', emsIdsUnlinked({ ems_site_ids: [''] }) === true);
t('rule: one id → linked', emsIdsUnlinked({ ems_site_ids: ['x'] }) === false);
t('rule: JSON string id → linked', emsIdsUnlinked({ ems_site_ids: '["x"]' }) === false);
t('rule: archived → no warning', emsIdsUnlinked({ ems_site_ids: [], archived_at: '2026-09-01' }) === false);
t('rule: no row → no warning', emsIdsUnlinked(null) === false);
t('linked cards get no chip', cards[0].chipCount === 0 && cards[1].chipCount === 0);
t('site-less card gets the ⚠️ chip', orphan.chipCount === 1);
console.log(failures ? `\n${failures} FAILED` : '\nindicator checks passed');
process.exit(failures ? 1 : 0);
