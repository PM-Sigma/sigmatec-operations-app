// Release guards (27.9 incident: merge-conflict markers reached prod in VERSION + sw.js).
// Fails if a tracked non-.md file has a conflict-marker line, sw.js is not valid JS, or
// VERSION is not a single semver-ish line.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(fileURLToPath(import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: root, maxBuffer: 1 << 28 }).toString('utf8');
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
// working-tree files that exist (a tracked file may be deleted locally), plus untracked-not-ignored
const extra = git('ls-files', '-z', '--others', '--exclude-standard').split('\0').filter(Boolean);
const files = [...new Set([...tracked, ...extra])].filter(f => extname(f).toLowerCase() !== '.md');
const BIN = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|xlsx|docx|mp3|mp4|wasm)$/i;
let n = 0;
const bad = [];
for (const f of files) {
  if (BIN.test(f)) continue;
  let txt; try { txt = readFileSync(resolve(root, f), 'utf8'); } catch { continue; }
  n++;
  txt.split(/\r?\n/).forEach((l, i) => {
    if (l.startsWith('<<<<<<< ') || l.startsWith('>>>>>>> ') || l === '=======') bad.push(`${f}:${i + 1}`);
  });
}
assert.equal(bad.length, 0, 'merge-conflict markers in: ' + bad.slice(0, 10).join(', '));
console.log(`ok - no conflict markers in ${n} tracked non-.md files`);

const chk = spawnSync(process.execPath, ['--check', 'sw.js'], { cwd: root, encoding: 'utf8' });
assert.equal(chk.status, 0, 'node --check sw.js failed: ' + chk.stderr);
console.log('ok - sw.js parses');

const ver = readFileSync(resolve(root, 'VERSION'), 'utf8').replace(/\r?\n$/, '');
assert.ok(/^\d+\.\d+(\.\d+)?([-+][\w.]+)?$/.test(ver), `VERSION is not a single semver-ish line: ${JSON.stringify(ver.slice(0, 60))}`);
console.log(`ok - VERSION = ${ver}`);
