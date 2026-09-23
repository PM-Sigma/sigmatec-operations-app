// test-doc-tooling.mjs — unit coverage for the small shared DOC-0 building blocks:
// scripts/docs/matter.mjs, gen-blocks.mjs, gen-edge-functions.mjs's extractors, and
// gen-module-inventory.mjs's graph-to-inventory logic. gen-schema.mjs has its own golden test
// (test-gen-schema.mjs); this file covers everything else that doesn't warrant a whole fixture.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import matter from './scripts/docs/matter.mjs';
import { setBlock, getBlock, seedFromTemplate } from './scripts/docs/gen-blocks.mjs';
import { extractModes, extractSecrets, extractTables, extractOutboundHosts, authForMode } from './scripts/docs/gen-edge-functions.mjs';
import { matchOwned, buildInventory, renderInventoryBlock, renderTestsBlock, generateOne as genInventoryOne } from './scripts/docs/gen-module-inventory.mjs';
import { reportForDoc } from './scripts/docs/stale.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok - ${name}`); };

// ── matter.mjs ──
test('matter: scalars, null, inline array, inline object, block list', () => {
  const raw = `---
doc_id: module:visits
doc_type: module
generated: false
code:
  - app/src/islands/Field.tsx
  - app/src/lib/field.ts
tables: [visits, visit_drafts]
last_validated: { date: 2026-10-01, branch: main, commit: abc1234 }
requirement_source: null
---
# body
line two
`;
  const { data, content } = matter(raw);
  assert.equal(data.doc_id, 'module:visits');
  assert.equal(data.generated, false);
  assert.deepEqual(data.code, ['app/src/islands/Field.tsx', 'app/src/lib/field.ts']);
  assert.deepEqual(data.tables, ['visits', 'visit_drafts']);
  assert.deepEqual(data.last_validated, { date: '2026-10-01', branch: 'main', commit: 'abc1234' });
  assert.equal(data.requirement_source, null);
  assert.ok(content.includes('# body'));
});

test('matter: content with no front-matter passes through untouched', () => {
  const { data, content } = matter('# just a doc\n');
  assert.deepEqual(data, {});
  assert.equal(content, '# just a doc\n');
});

// ── gen-blocks.mjs ──
test('gen-blocks: setBlock replaces only the marked region, getBlock reads it back', () => {
  const doc = 'before\n<!-- GENERATED:x -->\nold\n<!-- /GENERATED:x -->\nafter\n';
  const next = setBlock(doc, 'x', 'new content');
  assert.equal(getBlock(next, 'x'), 'new content');
  // idempotency: re-applying the SAME body must be a no-op (this is exactly the bug that once
  // grew an extra blank line every time gen-edge-functions.mjs's --check re-derived a doc that
  // already existed on disk — caught by test-docs-generators-check.mjs's own repo-level run).
  assert.equal(setBlock(next, 'x', 'new content'), next);
  assert.ok(next.startsWith('before\n'));
  assert.ok(next.endsWith('after\n'));
  assert.ok(!next.includes('old'));
});

test('gen-blocks: setBlock throws on a missing marker (fail loud, no silent no-op)', () => {
  assert.throws(() => setBlock('no markers here', 'x', 'y'), /no <!-- GENERATED:x -->/);
});

test('gen-blocks: seedFromTemplate substitutes REPLACE_ME everywhere', () => {
  const tplPath = path.join(HERE, 'docs/system/_templates/edge_function.md');
  const seeded = seedFromTemplate(tplPath, 'push-send');
  assert.ok(seeded.includes('doc_id: edge_function:push-send'));
  assert.ok(!seeded.includes('REPLACE_ME'));
});

// ── gen-edge-functions.mjs extractors (inline fixtures, not real files) ──
test('extractModes: mode === and case branches, first occurrence line', () => {
  const src = `line1\nif (body.mode === "gapReminder") {\n  x\n}\nswitch (m) {\n  case "timerStale":\n    y\n}\n`;
  const modes = extractModes(src);
  assert.deepEqual([...modes.entries()], [['gapReminder', 2], ['timerStale', 6]]);
});

test('extractSecrets: unique Deno.env.get names, first line each', () => {
  const src = `const a = Deno.env.get("CRON_SECRET");\nconst b = Deno.env.get("CRON_SECRET");\nconst c = Deno.env.get("VAPID_PUBLIC");\n`;
  const s = extractSecrets(src);
  assert.deepEqual([...s.keys()], ['CRON_SECRET', 'VAPID_PUBLIC']);
  assert.equal(s.get('CRON_SECRET'), 1);
});

test('extractTables: .from("table") call sites', () => {
  const src = `await sb.from('visits').select('*');\nawait sb.from("orders").insert(x);\n`;
  assert.deepEqual([...extractTables(src).keys()], ['visits', 'orders']);
});

test('extractOutboundHosts: dedup + sorted hostnames', () => {
  const src = `fetch("https://api.sigmatec-ems.com/x"); fetch('https://api.sigmatec-ems.com/y');`;
  assert.deepEqual(extractOutboundHosts(src), ['api.sigmatec-ems.com']);
});

test('authForMode: cron / EMS / both / neither, scanned from the branch line', () => {
  const lines = [
    'if (body.mode === "gapReminder") {',
    '  const secret = Deno.env.get("CRON_SECRET");',
    '  const byCron = cronKey === secret;',
    '  if (!byCron && !(await emsValid(token))) return 401;',
    '}',
  ];
  assert.equal(authForMode(lines, 1), 'cron (`CRON_SECRET`) or EMS login (`emsValid`)');
  assert.equal(authForMode(['if (x) { doStuff(); }'], 1), '*(no guard found near this branch — verify by hand)*');
});

// ── gen-module-inventory.mjs ──
test('matchOwned: glob patterns partition real file lists', () => {
  const files = ['app/src/islands/Field.tsx', 'app/src/islands/Home.tsx', 'app/src/lib/field.ts'];
  assert.deepEqual(matchOwned(['app/src/islands/Field.tsx'], files), ['app/src/islands/Field.tsx']);
  assert.deepEqual(matchOwned(['app/src/lib/*.ts'], files), ['app/src/lib/field.ts']);
});

test('buildInventory + render: symbols, tables, dependents and tests from graph edges', () => {
  const graphPath = path.join(HERE, 'scripts/docs/__fixtures__/graph.sample.json');
  const g = JSON.parse(require('node:fs').readFileSync(graphPath, 'utf8'));
  const nodes = new Map(g.nodes.map((x) => [x.id, x]));
  const inv = buildInventory({ nodes, links: g.links }, ['app/src/islands/Field.tsx']);
  assert.deepEqual(inv.files, ['app/src/islands/Field.tsx']);
  assert.deepEqual(inv.symbols, ['saveVisit()']);
  assert.deepEqual(inv.tables, ['visits']);
  assert.deepEqual(inv.dependents, ['Home.tsx']);
  assert.deepEqual(inv.tests, ['test-field.mjs']);
  const invBlock = renderInventoryBlock(inv);
  assert.ok(invBlock.includes('`app/src/islands/Field.tsx`'));
  assert.ok(invBlock.includes('[visits](../schema/public.visits.md)'));
  assert.equal(renderTestsBlock(inv), '- `test-field.mjs`');
});

test('generateOne: rewrites a module doc\'s Inventory + Tests blocks from front-matter code: globs', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const graphPath = path.join(HERE, 'scripts/docs/__fixtures__/graph.sample.json');
  const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const graph = { nodes: new Map(g.nodes.map((x) => [x.id, x])), links: g.links };
  const docPath = path.join(os.tmpdir(), `test-module-inventory-${process.pid}.md`);
  fs.writeFileSync(docPath, [
    '---', 'doc_id: module:field', 'doc_type: module', 'code:', '  - app/src/islands/Field.tsx', '---',
    '## 12. Inventory', '<!-- GENERATED:inventory -->', 'stale', '<!-- /GENERATED:inventory -->',
    '## 10. Tests', '<!-- GENERATED:tests -->', 'stale', '<!-- /GENERATED:tests -->', '',
  ].join('\n'));
  const next = genInventoryOne(docPath, graph, ['app/src/islands/Field.tsx', 'app/src/islands/Home.tsx']);
  fs.unlinkSync(docPath);
  assert.ok(next.includes('`test-field.mjs`'));
  assert.ok(next.includes('[visits](../schema/public.visits.md)'));
  assert.ok(!next.includes('stale'));
});

// ── stale.mjs ──
test('reportForDoc: generated docs are skipped (they self-check via --check)', () => {
  assert.deepEqual(reportForDoc({ generated: true }, () => { throw new Error('should not be called'); }), { status: 'generated', changed: [] });
});

test('reportForDoc: no last_validated.commit yet → never-validated', () => {
  assert.equal(reportForDoc({ code: ['app/src/lib/x.ts'] }, () => []).status, 'never-validated');
});

test('reportForDoc: no code: globs → no-code-globs, current otherwise', () => {
  assert.equal(reportForDoc({ last_validated: { commit: 'abc' } }, () => []).status, 'no-code-globs');
});

test('reportForDoc: git diff empty → current, non-empty → stale with the changed paths', () => {
  const doc = { last_validated: { commit: 'abc' }, code: ['app/src/lib/x.ts'] };
  const current = reportForDoc(doc, () => []);
  assert.equal(current.status, 'current');
  const stale = reportForDoc(doc, () => ['app/src/lib/x.ts']);
  assert.equal(stale.status, 'stale');
  assert.deepEqual(stale.changed, ['app/src/lib/x.ts']);
});

test('reportForDoc: unresolvable baseline commit → unknown, not silently current', () => {
  assert.equal(reportForDoc({ last_validated: { commit: 'deadbeef' }, code: ['x'] }, () => null).status, 'unknown (bad baseline commit)');
});

console.log(`\nPASS — ${n} checks.`);
