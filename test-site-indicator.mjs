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

const fn = new Function('document', 'window', 'kibbutzHasSite', 'emsEsc',
  src.substring(src.indexOf('function applyCardSiteWarnings'), src.indexOf('function applyCardEmsWidgets')) +
  '\nreturn applyCardSiteWarnings;');
const linked = new Set(['דפנה', 'שלוחות']);
fn(document_, {}, (n) => linked.has(n), s => s)();

let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };
t('linked cards get no chip', cards[0].chipCount === 0 && cards[1].chipCount === 0);
t('site-less card gets the ⚠️ chip', orphan.chipCount === 1);
console.log(failures ? `\n${failures} FAILED` : '\nindicator checks passed');
process.exit(failures ? 1 : 0);
