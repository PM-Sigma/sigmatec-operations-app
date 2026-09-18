// Build step: concatenate the per-domain source modules in js/src/ (sorted by the
// numeric filename prefix) into the single deployed js/app.js. Run before committing
// after editing anything in js/src/:   node build.mjs
import fs from 'fs';
import { execSync } from 'node:child_process';
import esbuild from 'esbuild';
import { buildAppMin, buildCritical, checkGeneratedCss, inlineCritical } from './scripts/css-build.mjs';

// `node build.mjs --check` — verify, never write. The pre-commit hook and `npm run qa` use it so
// a hand-edited or stale generated file cannot be committed. See scripts/css-build.mjs.
if (process.argv.includes('--check')) {
  const { ok, problems } = checkGeneratedCss();
  if (!ok) {
    console.error('build.mjs --check: the generated CSS is STALE or hand-edited:');
    for (const p of problems) console.error('  · ' + p);
    process.exit(1);
  }
  console.log("build.mjs --check: css/app.min.css and index.html's critical block match their sources.");
  process.exit(0);
}

// One cache-bust stamp per build, shared by index.html's asset URLs AND the island chunks'
// own import specifiers (see the ui/ block below — the two MUST agree).
const ver = Date.now().toString(36);

// ===== React islands (app/) =====
// The islands are built FIRST and their output committed into ui/ — GitHub Pages is static,
// same convention as js/app.js. Skip with SKIP_UI=1 when iterating on legacy modules only.
if (!process.env.SKIP_UI) {
  if (!fs.existsSync(new URL('./app/node_modules/', import.meta.url))) {
    console.error('build.mjs: app/node_modules is missing — run `npm --prefix app ci` first (or set SKIP_UI=1 to build the legacy bundle only).');
    process.exit(1);
  }
  console.log('building React islands (app/) …');
  try {
    execSync('npm --prefix app run build', { stdio: 'inherit' });
  } catch (e) {
    console.error('build.mjs: the React island build failed (see the Vite output above).');
    process.exit(1);
  }
  // The island build is CODE-SPLIT (the card home is a lazy chunk), so copy every artefact,
  // not just the entry pair — and drop stale chunks from a previous build so ui/ is exactly
  // what app/dist/ says it is. ui/manifest.json lists them for the service worker to precache.
  const uiDir = new URL('./ui/', import.meta.url);
  fs.mkdirSync(uiDir, { recursive: true });
  const dist = fs.readdirSync(new URL('./app/dist/', import.meta.url)).filter(f => /\.(js|css)$/.test(f));
  for (const f of fs.readdirSync(uiDir)) {
    if (/\.(js|css)$/.test(f) && !dist.includes(f)) fs.unlinkSync(new URL(f, uiDir));
  }
  for (const f of dist) {
    fs.copyFileSync(new URL('./app/dist/' + f, import.meta.url), new URL(f, uiDir));
  }
  // ── stamp the module graph CONSISTENTLY ────────────────────────────────────
  // index.html loads the entry as `ui/sigma.js?v=<ver>`, but Vite emits the chunks importing
  // it back as a bare `./sigma.js`. Two URLs for one module = the browser evaluates the entry
  // TWICE: two boot()s, two TanStack queryClients over one localStorage key, and every island
  // mounted twice (the 🗓 ישיבות tab really did render its panel twice). So every relative
  // `./sigma*.js` specifier inside ui/*.js gets the SAME stamp index.html uses — including the
  // ones in Vite's `__vite__mapDeps` array, which the modulepreload links are built from, so
  // nothing is downloaded twice either.
  // The service worker is unaffected: it keys its cache on the path WITHOUT the query and
  // matches with `ignoreSearch`, so ui/manifest.json stays unstamped.
  const SPEC = /(["'])(\.\/)?(sigma(?:-[A-Za-z0-9_.-]+)?\.js)\1/g;
  let stamped = 0;
  for (const f of dist.filter(x => x.endsWith('.js'))) {
    const u = new URL(f, uiDir);
    const before = fs.readFileSync(u, 'utf8');
    const after = before.replace(SPEC, (m, q, dot, name) => {
      stamped++;
      return q + (dot || './') + name + '?v=' + ver + q;
    });
    if (after !== before) fs.writeFileSync(u, after);
  }
  fs.writeFileSync(new URL('manifest.json', uiDir), JSON.stringify(dist.map(f => './ui/' + f), null, 2) + '\n');
  console.log('ui/: ' + dist.join(', ') + ' (' + stamped + ' module specifiers stamped v=' + ver + ')');
}

const dir = new URL('./js/src/', import.meta.url);
const out = new URL('./js/app.js', import.meta.url);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
let bundle = '';
for (const f of files) bundle += fs.readFileSync(new URL(f, dir), 'utf8');
// MINIFY the legacy bundle (task 22b / Lighthouse gate): 661 kB of concatenated source, ~200 kB
// of it whitespace, was "Minify JavaScript ~300 ms" + a chunk of "unused JavaScript" on every
// boot. esbuild's TRANSFORM api is used on purpose (not `bundle`): it leaves TOP-LEVEL names
// alone, which is the whole contract of this file — index.html's inline `onclick="showPage(…)"`
// handlers and the ui/ islands both reach the legacy code through globals. `keepNames` keeps
// `fn.name` intact for the few places that log it. The map is emitted next to the bundle and
// is gitignored (devtools-only; GitHub Pages simply 404s it).
const min = esbuild.transformSync(bundle, {
  minify: true,
  target: 'es2017',
  keepNames: true,
  sourcemap: true,
  sourcefile: 'app.src.js',
  legalComments: 'none',
});
fs.writeFileSync(out, min.code + `\n//# sourceMappingURL=app.js.map\n`);
fs.writeFileSync(new URL('./js/app.js.map', import.meta.url), min.map);
console.log('js/app.js: ' + (bundle.length / 1024).toFixed(0) + ' kB source → ' + (min.code.length / 1024).toFixed(0) + ' kB minified');
// cache-bust: stamp a fresh version onto the asset URLs in index.html every build,
// so a new deploy can never be masked by a cached bundle (SW or CDN).
const idxUrl = new URL('./index.html', import.meta.url);
let idx = fs.readFileSync(idxUrl, 'utf8');
idx = idx.replace(/(js\/app\.js\?v=)[^"]*/, '$1' + ver).replace(/(css\/app\.min\.css\?v=)[^"]*/, '$1' + ver)
         .replace(/(ui\/sigma\.js\?v=)[^"']*/g, '$1' + ver).replace(/(ui\/sigma\.css\?v=)[^"]*/, '$1' + ver);
// ── the GENERATED CSS (task 22b) ────────────────────────────────────────────────────────────
// css/app.min.css is what index.html loads (css/app.css stays the hand-written source, and its
// /* @tokens-only */ regions are what test-theme.mjs reads); the critical subset is inlined into
// <head>. Both carry the sha256 of their source, so `node build.mjs --check`, test-css-build.mjs
// and the pre-commit hook can tell a stale output from a fresh one. The generation itself lives
// in scripts/css-build.mjs, so the builder and the checker can never drift apart.
const appMin = buildAppMin();
fs.writeFileSync(new URL('./css/app.min.css', import.meta.url), appMin);
const crit = buildCritical();
idx = inlineCritical(idx, crit);
console.log('css/app.min.css: ' + (appMin.length / 1024).toFixed(0) + ' kB · critical: '
  + (crit.style.length / 1024).toFixed(1) + ' kB inlined (src-sha256:' + crit.hash + ')');
// force phones to refresh on every deploy: bump the SW cache name so sw.js bytes change → the browser
// installs the new SW (skipWaiting + clients.claim), the page hears 'controllerchange' and reloads once.
const swUrl = new URL('./sw.js', import.meta.url);
const sw = fs.readFileSync(swUrl, 'utf8').replace(/(const CACHE = 'sigmatec-ops-)[^']*'/, '$1' + ver + "'");
fs.writeFileSync(swUrl, sw);
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
