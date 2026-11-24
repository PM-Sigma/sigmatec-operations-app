// EMS users -> site_contacts sync (scripts/ems-contacts-sync.mjs): the pure mapping + the SQL + the safety guards.
//   node test-contacts-sync.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import { contactSyncPlan, deactivationSafe, CONTACT_ROLES } from './scripts/ems-contacts-sync.mjs';

const fx = JSON.parse(fs.readFileSync('qa/fixtures/ems-contacts.json', 'utf8'));
const plan = contactSyncPlan(fx.users, fx.kibbutzim, fx.existing);
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

ok('only site_manager / operations_manager, active, with an email, mapped to every kibbutz owning the site', () => {
  assert.deepStrictEqual(CONTACT_ROLES, ['site_manager', 'operations_manager']);
  const keys = plan.desired.map(d => d.kibbutz + '|' + d.email).sort();
  assert.deepStrictEqual(keys, [
    'גבים|dana@gvim.example', 'גבים|ron@ops.example', 'גניגר|ron@ops.example',
    'דגניה א|shared@x.example', 'דגניה ב|shared@x.example',
  ].sort());
});
ok('emails are lower-cased; name joins first+last; role kept as the EMS code', () => {
  const d = plan.desired.find(x => x.email === 'dana@gvim.example');
  assert.strictEqual(d.name, 'דנה כהן'); assert.strictEqual(d.role, 'site_manager'); assert.strictEqual(d.source, 'ems');
});
ok('new rows are inserted; a changed phone updates; an inactive ems row is re-activated', () => {
  assert.strictEqual(plan.insert.length, 2);
  const byId = Object.fromEntries(plan.update.map(u => [u.id, u.patch]));
  assert.deepStrictEqual(byId['1'], { phone: '050-111' });
  assert.deepStrictEqual(byId['4'], { active: true });
});
ok('an ems row whose user vanished is deactivated (never deleted)', () => {
  assert.deepStrictEqual(plan.deactivate, ['2']);
});
ok('manual rows are never touched: same address as a manual row is skipped, manual rows never deactivated', () => {
  assert.strictEqual(plan.skippedManual, 1);
  assert.ok(!plan.insert.some(r => r.kibbutz === 'גניגר'));
  assert.ok(![...plan.deactivate, ...plan.update.map(u => u.id)].includes('3'));
  const manualOnly = contactSyncPlan([], fx.kibbutzim, [{ id: '9', kibbutz: 'גבים', email: 'm@x', source: 'manual', active: true }]);
  assert.deepStrictEqual(manualOnly.deactivate, []);
});
ok('re-running on its own result is a no-op (idempotent)', () => {
  const after = fx.existing.filter(r => r.source === 'manual').concat(
    plan.desired.map((d, i) => ({ id: 'n' + i, ...d })));
  const again = contactSyncPlan(fx.users, fx.kibbutzim, after);
  assert.deepStrictEqual([again.insert.length, again.update.length, again.deactivate.length], [0, 0, 0]);
});
ok('safety: a crawl that found under half of the stored ems contacts must not deactivate', () => {
  const stored = Array.from({ length: 10 }, (_, i) => ({ id: 's' + i, kibbutz: 'גבים', email: 'u' + i + '@x', source: 'ems', active: true }));
  const scoped = contactSyncPlan([fx.users[0]], fx.kibbutzim, stored);
  assert.strictEqual(deactivationSafe(scoped, stored), false);
  assert.strictEqual(deactivationSafe(plan, fx.existing), true);
  assert.strictEqual(deactivationSafe({ desired: [] }, []), true);
});
ok('SQL: unique key (kibbutz, lower(email)), source + active columns, de-dup, backup + rollback notes', () => {
  const sql = fs.readFileSync('db/site_contacts_sync.sql', 'utf8');
  assert.match(sql, /unique index[\s\S]*\(kibbutz, lower\(email\)\)/i);
  assert.match(sql, /add column if not exists source/i);
  assert.match(sql, /add column if not exists active/i);
  assert.match(sql, /BACKUP/); assert.match(sql, /ROLLBACK/);
});
ok('the script logs counts only: no name / email / phone in any output call', () => {
  const src = fs.readFileSync('scripts/ems-contacts-sync.mjs', 'utf8');
  assert.doesNotMatch(src, /console\.log\([^)]*(email|phone|name)/);
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{20,}/);
});
console.log('\nPASS - ' + n + ' checks (ems-contacts-sync)');
