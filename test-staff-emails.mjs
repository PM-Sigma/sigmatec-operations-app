// test-staff-emails.mjs — every staff EMS email → the roster name and the app role (עידן 12.10).
// The 17.9 תל קציר visit was saved under 'technician@sigmatec-energy.com' because ניתאי's login email
// was not mapped. Three copies must agree: the client login gate (js/src/15-login-gate.js), the
// server identity (supabase/functions/ems-auth/identity.js) and the contacts map (js/src/12-reports.js).
//   node test-staff-emails.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import { EMS_EMAIL_ALIASES, resolveName } from './supabase/functions/ems-auth/identity.js';

const STAFF = {
  'pm@sigmatec-energy.com': 'עידן',
  'ankor@sigmatec-energy.com': 'עמיחי',
  'engsupport@sigmatec-energy.com': 'אביאם',
  'technician@sigmatec-energy.com': 'ניתאי',
  'microgrid@sigmatec-energy.com': 'אבצן',
  'dev@sigmatec-energy.com': 'מתניה',
  'rnddev@sigmatec-energy.com': 'אליה',
};

// ── the client gate: run its real alias map + lookup expression ──
const gate = fs.readFileSync('js/src/15-login-gate.js', 'utf8');
const lit = gate.match(/const EMS_EMAIL_ALIASES = (\{[\s\S]*?\n\s*\});/)[1];
const clientMap = vm.runInNewContext('(' + lit + ')');
assert.match(gate, /EMS_EMAIL_ALIASES\[\(email \|\| ''\)\.toLowerCase\(\)\.trim\(\)\]/, 'the gate looks emails up lower-cased and trimmed');
const clientResolve = (email) => clientMap[(email || '').toLowerCase().trim()] || '';
// the role rule the gate writes on every resolve path
const roleRules = gate.match(/setItem\(ROLE_KEY, (?:person|name) === 'עידן' \? 'idan' : 'team'\)/g) || [];
assert.ok(roleRules.length >= 2, 'both resolve paths write the role from the name');
const roleOf = (name) => (name === 'עידן' ? 'idan' : 'team');

let n = 0;
for (const [email, name] of Object.entries(STAFF)) {
  for (const variant of [email, email.toUpperCase(), '  ' + email + ' ', email.replace(/^./, (c) => c.toUpperCase())]) {
    assert.strictEqual(clientResolve(variant), name, `client: ${variant} → ${name}`);
    assert.strictEqual(resolveName(null, variant), name, `server: ${variant} → ${name}`);
    n++;
  }
  assert.strictEqual(roleOf(clientResolve(email)), name === 'עידן' ? 'idan' : 'team', `role for ${name}`);
}
// the server map is exactly the staff list; the client may carry extra legacy logins (מתניה's gmail ones)
assert.deepStrictEqual(EMS_EMAIL_ALIASES, STAFF, 'identity.js = the staff list');
for (const [email, name] of Object.entries(STAFF)) assert.strictEqual(clientMap[email], name, 'client has ' + email);
for (const [email, name] of Object.entries(clientMap)) {
  if (email.endsWith('@sigmatec-energy.com')) assert.strictEqual(STAFF[email], name, 'no stray company alias: ' + email);
}
assert.strictEqual(clientResolve('someone@example.com'), '', 'unknown email → no alias');

// ── contacts: each person's email ──
const rep = fs.readFileSync('js/src/12-reports.js', 'utf8');
const contacts = vm.runInNewContext('(' + rep.match(/const CONTACTS = (\{[\s\S]*?\n\s*\});/)[1] + ')');
for (const [email, name] of Object.entries(STAFF)) assert.strictEqual(contacts[name].email, email, 'CONTACTS ' + name);

console.log(`test-staff-emails: ${n} email variants + roles + contacts ok`);
