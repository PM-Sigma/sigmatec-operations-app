// Self-check for the version-stamp scheme (mirrors nextVersion in build.mjs).
// Run: node test-version.mjs
// Scheme: '·N' counter up to 100, then rolls to 1.01 and the MINOR auto-increments (1.01, 1.02 …).
// The ·NN + 1.xx era is "major 1"; a big sweeping update bumps the MAJOR (`node build.mjs major` → 2.00).
import assert from 'node:assert';

function nextVersion(cur, major) {
  const pad2 = n => String(n).padStart(2, '0');
  if (major) { const m = /\./.test(cur) ? parseInt(cur.split('.')[0], 10) : 1; return (m + 1) + '.00'; }
  if (/^\d+$/.test(cur)) { const n = (parseInt(cur, 10) || 29) + 1; return n > 100 ? '1.01' : String(n); }
  const [mj, mn] = cur.split('.');
  return mj + '.' + pad2((parseInt(mn, 10) || 0) + 1);
}

const eq = (a, b) => assert.equal(a, b, `${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

// legacy integer counter keeps counting up to 100
eq(nextVersion('97', false), '98');
eq(nextVersion('99', false), '100');
// the build AFTER 100 rolls into the decimal line
eq(nextVersion('100', false), '1.01');
// decimal minor auto-increments, zero-padded
eq(nextVersion('1.01', false), '1.02');
eq(nextVersion('1.09', false), '1.10');
// big sweeping update → next whole major. ·NN era and 1.xx both count as major 1 → 2.00
eq(nextVersion('97', true), '2.00');
eq(nextVersion('1.05', true), '2.00');
eq(nextVersion('2.07', true), '3.00');

console.log('✅ test-version: version-stamp scheme verified');
