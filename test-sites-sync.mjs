// EMS sites -> new kibbutz cards (scripts/ems-sites-sync.mjs): pure plan + safety + workflow.
//   node test-sites-sync.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mergeReport } from './scripts/ems-contacts-sync.mjs';
import { sitesSyncPlan, normName, MAX_CREATE } from './scripts/ems-sites-sync.mjs';

const fx = JSON.parse(fs.readFileSync('qa/fixtures/ems-sites.json', 'utf8'));
const plan = sitesSyncPlan(fx.sites, fx.kibbutzim);
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

ok('an unknown active site becomes a "new" card with name, ems_site_ids=[id], no region', () => {
  const c = plan.create.find(r => r.name === 'צמח מפעלים');
  assert.deepStrictEqual(c, { name: 'צמח מפעלים', section: 'new', kind: 'kibbutz', ems_site_ids: ['site-new'], created_by: 'EMS sync' });
});
ok('known ids (incl. an archived card), inactive sites, blank and 2-letter names are never created', () => {
  assert.deepStrictEqual(plan.create.map(r => r.name), ['צמח מפעלים']);
});
ok('a site named like an existing card is reported as a possible link, never created', () => {
  const byName = Object.fromEntries(plan.possibleLinks.map(l => [l.site, l.cards]));
  assert.deepStrictEqual(byName['דגניה ב'], ["דגניה ב'"]);
  assert.deepStrictEqual(byName['ניר עציון - מפעל'], ['ניר עציון']);
});
ok('two EMS sites with the same name make ONE card (the second is a possible link to the first)', () => {
  assert.strictEqual(plan.create.length, 1);
  assert.ok(plan.possibleLinks.some(l => l.site === 'צמח מפעלים' && l.cards.includes('צמח מפעלים')));
});
ok('existing cards are never part of the output (no edit, no delete)', () => {
  assert.deepStrictEqual(Object.keys(plan).sort(), ['create', 'known', 'possibleLinks']);
  assert.ok(plan.create.every(r => !fx.kibbutzim.some(k => k.name === r.name)));
});
ok('idempotent: after creating, a re-run creates nothing', () => {
  assert.strictEqual(sitesSyncPlan(fx.sites, fx.kibbutzim.concat(plan.create)).create.length, 0);
});
ok('normName ignores punctuation / spacing / case', () => {
  assert.strictEqual(normName("דגניה ב'"), normName('דגניה  ב'));
  assert.strictEqual(normName('Ein-Gedi'), 'eingedi');
});
ok('source: cap exists, no JWT, no service key', () => {
  assert.ok(MAX_CREATE > 0 && MAX_CREATE <= 20);
  const src = fs.readFileSync('scripts/ems-sites-sync.mjs', 'utf8');
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(src, /service_role/i);
});
ok('workflow: daily cron + dispatch dry_run (default true), secrets only via secrets.*, both syncs, no service key', () => {
  const raw = fs.readFileSync('.github/workflows/ems-sync.yml', 'utf8');
  assert.match(raw, /cron: '\d+ \d+ \* \* \*'/);
  assert.match(raw, /dry_run:[\s\S]*?default: true/);
  assert.match(raw, /\$\{\{ secrets\.EMS_SYNC_EMAIL \}\}/); assert.match(raw, /\$\{\{ secrets\.EMS_SYNC_PASSWORD \}\}/);
  assert.match(raw, /ems-contacts-sync\.mjs/); assert.match(raw, /ems-sites-sync\.mjs/);
  assert.doesNotMatch(raw, /SERVICE_ROLE/i);
  assert.doesNotMatch(raw, /echo[^\n]*(PASSWORD|EMAIL)/);
});
ok('CI log is counts only (no site names); a local run still prints names', () => {
  const run = env => JSON.parse(execFileSync(process.execPath, ['scripts/ems-sites-sync.mjs', '--fixture', 'qa/fixtures/ems-sites.json'], { env: { ...process.env, ...env } }).toString());
  const ci = run({ CI: 'true' });
  assert.strictEqual(ci.create, 1); assert.strictEqual(ci.possibleLinks, 3);
  assert.ok(!JSON.stringify(ci).includes('צמח') && !JSON.stringify(ci).includes('דגניה'));
  const local = run({ CI: '' });
  assert.deepStrictEqual(local.wouldCreate, ['צמח מפעלים']);
});
ok('report row: each job merges its own section, at/dryRun follow the latest writer', () => {
  const a = mergeReport(null, 'contacts', { insert: 1 }, true, 't1');
  const b = mergeReport(a, 'sites', { created: ['x'] }, false, 't2');
  assert.deepStrictEqual(b, { at: 't2', dryRun: false, contacts: { insert: 1 }, sites: { created: ['x'] } });
});
ok('both scripts write the ems_sync_report row in dry-run and live', () => {
  for (const f of ['scripts/ems-sites-sync.mjs', 'scripts/ems-contacts-sync.mjs']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.match(src, /writeSyncReport\([^)]*, true\)/); assert.match(src, /writeSyncReport\([^)]*, false\)/);
  }
});
console.log('\nPASS - ' + n + ' checks (ems-sites-sync)');
