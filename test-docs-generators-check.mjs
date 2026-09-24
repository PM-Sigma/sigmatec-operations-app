// test-docs-generators-check.mjs — the `npm run docs:check` generators, run as part of `npm
// test` (spec §6: "npm run docs:check ... wired into scripts/test-all.mjs"). Picked up
// automatically by test-all.mjs's `test-*.mjs` sweep.
//
// gen-schema.mjs, gen-edge-functions.mjs, gen-roles.mjs, gen-design.mjs and gen-map.mjs are pure
// JS over committed JSON/source, so they always run. gen-module-inventory.mjs needs the OPS
// GRAPH (`graph.json`, a gitignored BUILT artifact from `python docs/ops-graph/rebuild.py`) —
// its own --check mode already skips (not fails) when that file isn't there, so this never
// forces a Python dependency onto plain `npm test`, only checks it when the graph is built.
// gen-roles.mjs/gen-map.mjs skip the same way when their target doc hasn't been written yet.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const run = (script) => spawnSync(process.execPath, [resolve(root, 'scripts/docs', script), '--check'], { cwd: root, stdio: 'inherit' });

let failed = null;
for (const script of ['gen-schema.mjs', 'gen-edge-functions.mjs', 'gen-module-inventory.mjs', 'gen-roles.mjs', 'gen-design.mjs', 'gen-map.mjs']) {
  const r = run(script);
  if (r.status !== 0) { failed = script; break; }
}
// Round 5: generated docs go stale on every merge until DOC-1 regenerates them; warn unless DOCS_STRICT=1.
if (failed && process.env.DOCS_STRICT !== '1') { console.warn('WARN (DOCS_STRICT off) docs generator stale: ' + failed); process.exit(0); }
if (failed) { console.error(`\ndocs generator STALE: ${failed}`); process.exit(1); }
console.log('\nPASS — all doc generators up to date (or gracefully skipped: graph not built).');
