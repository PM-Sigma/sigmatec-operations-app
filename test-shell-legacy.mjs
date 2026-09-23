// Legacy-side guards for package S (round 5).
import assert from 'node:assert/strict';
import fs from 'node:fs';
let failures = 0;
const check = (name, fn) => { try { fn(); console.log('  ✓ ' + name); } catch (e) { failures++; console.log('  ✗ ' + name + '\n    ' + e.message); } };
const data = fs.readFileSync(new URL('./js/src/01-data.js', import.meta.url), 'utf8');

check('renderLastUpdated publishes sigma-last-updated BEFORE the #lastUpdated early return', () => {
  const body = data.slice(data.indexOf('function renderLastUpdated'), data.indexOf('renderLastUpdated();'));
  const pub = body.indexOf("'sigma-last-updated'");
  const early = body.indexOf('if (!el) return');
  assert.ok(pub !== -1, 'no sigma-last-updated dispatch');
  assert.ok(early === -1 || pub < early, 'the dispatch sits after the early return, so it never fires once the header element is gone');
});
check('no data-source pill mentions the retired Sheet', () => {
  assert.doesNotMatch(data, /חי מהגיליון/);
});

console.log(failures === 0 ? '\nPASS' : '\nFAIL — ' + failures);
process.exit(failures === 0 ? 0 : 1);
