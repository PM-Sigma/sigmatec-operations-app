// test-gen-schema.mjs — golden-output test for scripts/docs/gen-schema.mjs.
// Renders the fixture introspection JSON and diffs every file against the committed golden copy
// in scripts/docs/__fixtures__/golden/. A generator change that alters output must update the
// golden files in the same commit (regenerate with `node test-gen-schema.mjs --write-golden`).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { generate, parsePurposes, assertNoForbiddenData, tableDocId } from './scripts/docs/gen-schema.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'scripts/docs/__fixtures__/introspection.sample.json');
const GOLDEN_DIR = path.join(HERE, 'scripts/docs/__fixtures__/golden');

const files = generate({ inPath: FIXTURE, outDir: GOLDEN_DIR });

if (process.argv.includes('--write-golden')) {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(GOLDEN_DIR, name), content, 'utf8');
  console.log(`wrote ${files.size} golden files to ${GOLDEN_DIR}`);
  process.exit(0);
}

let failures = 0;
for (const [name, content] of files) {
  const p = path.join(GOLDEN_DIR, name);
  assert.ok(fs.existsSync(p), `missing golden file ${name} — run \`node test-gen-schema.mjs --write-golden\` and review it`);
  const golden = fs.readFileSync(p, 'utf8');
  try {
    assert.equal(content, golden, `gen-schema.mjs output for ${name} no longer matches the golden file`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}`);
    console.error(e.message);
  }
}
assert.equal(files.size, 5, `expected 5 rendered files (2 tables + _functions + _triggers-and-cron + README), got ${files.size}`);

// parsePurposes: a tiny overlay parser, worth its own direct assertion.
const parsed = parsePurposes('widgets: the physical stock catalogue\n# a comment\nwidgets.qty: on-hand count\n\nempty-ignored');
assert.equal(parsed.widgets, 'the physical stock catalogue');
assert.equal(parsed['widgets.qty'], 'on-hand count');
assert.equal(Object.keys(parsed).length, 2);

// tableDocId: bare name for public (matches fix_graph.py's own canonical id), schema-qualified
// otherwise — a mismatch here means a duplicate, unmerged `table:` node in the OPS GRAPH.
assert.equal(tableDocId('public', 'visits'), 'table:visits');
assert.equal(tableDocId('private', 'push_config'), 'table:private.push_config');

// assertNoForbiddenData: §10/§9.2 — refuse a cron command body or a function body outright.
assert.throws(() => assertNoForbiddenData({ cron_jobs: [{ jobname: 'x', command: 'select net.http_post(...)' }] }),
  /refusing to render.*cron job "x"/);
assert.throws(() => assertNoForbiddenData({ functions: [{ schema: 'public', name: 'f', prosrc: 'begin end' }] }),
  /refusing to render.*function "public\.f"/);
assert.doesNotThrow(() => assertNoForbiddenData({ cron_jobs: [{ jobname: 'x', schedule: '* * * * *' }], functions: [{ schema: 'public', name: 'f' }] }));

if (failures) { console.error(`${failures} golden mismatch(es)`); process.exit(1); }
console.log(`PASS — ${files.size} generated schema files match golden, parsePurposes/tableDocId/assertNoForbiddenData ok.`);
