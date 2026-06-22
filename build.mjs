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
fs.writeFileSync(idxUrl, idx);
console.log('built js/app.js from ' + files.length + ' modules; stamped assets v=' + ver);
