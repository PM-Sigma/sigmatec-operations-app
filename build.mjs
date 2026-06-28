// Build step: concatenate the per-domain source modules in js/src/ (sorted by the
// numeric filename prefix) into the single deployed js/app.js. Run before committing
// after editing anything in js/src/:   node build.mjs
import fs from 'fs';
const dir = new URL('./js/src/', import.meta.url);
const out = new URL('./js/app.js', import.meta.url);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
let bundle = '';
for (const f of files) bundle += fs.readFileSync(new URL(f, dir), 'utf8');
fs.writeFileSync(out, bundle);
// cache-bust: stamp a fresh version onto the asset URLs in index.html every build,
// so a new deploy can never be masked by a cached bundle (SW or CDN).
const idxUrl = new URL('./index.html', import.meta.url);
let idx = fs.readFileSync(idxUrl, 'utf8');
const ver = Date.now().toString(36);
idx = idx.replace(/(js\/app\.js\?v=)[^"]*/, '$1' + ver).replace(/(css\/app\.css\?v=)[^"]*/, '$1' + ver);
// visible version: every deploy is visibly newer. Scheme — a plain '·N' counter up to 100, then a
// MAJOR.MINOR line: after ·100 it rolls to 1.01 and the MINOR auto-increments each build (1.01, 1.02 …).
// The whole ·NN + 1.xx history is "major 1"; a big, sweeping update bumps the MAJOR via
// `node build.mjs major` (→ 2.00, then 2.01 …). See docs/operations.md → Versioning.
function nextVersion(cur, major) {
  const pad2 = n => String(n).padStart(2, '0');
  if (major) {                                   // big update → next whole major (·NN + 1.xx era = major 1)
    const m = /\./.test(cur) ? parseInt(cur.split('.')[0], 10) : 1;
    return (m + 1) + '.00';
  }
  if (/^\d+$/.test(cur)) {                        // legacy integer counter
    const n = (parseInt(cur, 10) || 29) + 1;
    return n > 100 ? '1.01' : String(n);          // ·100 is the last integer; the next build rolls to 1.01
  }
  const [mj, mn] = cur.split('.');                // decimal M.mm → bump the minor
  return mj + '.' + pad2((parseInt(mn, 10) || 0) + 1);
}
const verFile = new URL('./VERSION', import.meta.url);
const verStr = nextVersion(fs.readFileSync(verFile, 'utf8').trim(), process.argv.includes('major'));
fs.writeFileSync(verFile, verStr + '\n');
const today = new Date().toISOString().slice(0, 10);
idx = idx.replace(/גרסה \d{4}-\d{2}-\d{2}·[\d.]+/, 'גרסה ' + today + '·' + verStr);
fs.writeFileSync(idxUrl, idx);
console.log('built js/app.js from ' + files.length + ' modules; stamped assets v=' + ver + ' · גרסה ' + today + '·' + verStr);
