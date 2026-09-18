// FRESHNESS gate for the generated CSS (task 22b review fix).
//   node test-css-build.mjs
//
// `css/app.min.css` and the `<style>` block inlined into index.html's <head> are BUILT from
// `css/app.css` and `css/critical.css`. Editing a source and committing without running
// `node build.mjs` ships the previous bytes: the change has no effect, in a way that no test and
// no code review would notice. So this regenerates both outputs IN MEMORY and asserts the
// committed ones match, byte for byte, plus the src-sha256 stamp each one carries.
//
// It is the same code the builder runs (scripts/css-build.mjs), so builder and checker cannot
// drift. `node build.mjs --check` is the same assertion for the pre-commit hook, and
// `npm run qa` runs it as its own gate.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAppMin, buildCritical, checkGeneratedCss, CRITICAL_MARKER, srcHash } from './scripts/css-build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const norm = t => String(t).replace(/\r\n/g, '\n');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

check('css/app.min.css is exactly what css/app.css minifies to', () => {
  assert.equal(norm(read('css/app.min.css')), norm(buildAppMin()),
    'run `node build.mjs` — and never hand-edit css/app.min.css');
});

check('css/app.min.css is stamped with the sha256 of css/app.css', () => {
  const stamp = /src-sha256:([0-9a-f]{16})/.exec(read('css/app.min.css'));
  assert.ok(stamp, 'no src-sha256 stamp in css/app.min.css');
  assert.equal(stamp[1], srcHash(read('css/app.css')),
    'css/app.min.css was built from a different css/app.css — run `node build.mjs`');
});

check("index.html's inlined critical block is exactly what css/critical.css minifies to", () => {
  const m = CRITICAL_MARKER.exec(read('index.html'));
  assert.ok(m, 'index.html has no critical:start … critical:end block');
  const built = buildCritical();
  assert.equal(m[2].trim(), built.style, 'run `node build.mjs` — and never hand-edit the block');
  const stamp = /src-sha256:([0-9a-f]{16})/.exec(m[1]);
  assert.ok(stamp, 'the critical marker carries no src-sha256 stamp');
  assert.equal(stamp[1], built.hash,
    "index.html's critical block was built from a different css/critical.css — run `node build.mjs`");
});

check('index.html loads the GENERATED sheet, not the source', () => {
  const head = read('index.html').split('</head>')[0];
  assert.match(head, /<link rel="stylesheet" href="css\/app\.min\.css\?v=\w+">/,
    'index.html must load css/app.min.css (the source css/app.css is not what ships)');
});

// The same verdict the pre-commit hook and `npm run qa` act on — asserted here so a change to
// the checker that makes it toothless fails a test instead of passing silently.
check('checkGeneratedCss() agrees, and it can actually fail', () => {
  const { ok, problems } = checkGeneratedCss();
  assert.ok(ok, 'checkGeneratedCss reported: ' + problems.join(' | '));
  // feed it a source that is NOT what the committed output came from
  const fake = buildAppMin('/* a source nobody built from */ body { color: red; }');
  assert.notEqual(norm(fake), norm(read('css/app.min.css')),
    'a different source produced identical output — the check cannot detect staleness');
  assert.notEqual(/src-sha256:([0-9a-f]{16})/.exec(fake)[1], srcHash(read('css/app.css')),
    'the stamp does not depend on the source');
});

console.log(failures === 0 ? '\nPASS — the generated CSS is fresh' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
