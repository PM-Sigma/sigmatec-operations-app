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
console.log('built js/app.js from ' + files.length + ' modules (' + bundle.split('\n').length + ' lines): ' + files.join(', '));
