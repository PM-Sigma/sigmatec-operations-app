#!/usr/bin/env node
// scripts/seed-staff-identities.mjs — X-L1, one-time seed for db/staff_identities.sql.
//
// Run BY HAND, once, when עידן pastes his EMS admin token for this one run (X-L3 step 3).
// It never connects to Supabase and never writes to disk: it reads the EMS admin roster and
// PRINTS the `insert … on conflict do update` SQL for עידן to review before it runs anywhere.
//
//   EMS_TOKEN=<pasted token> node scripts/seed-staff-identities.mjs
//
// The token is read from the environment for this one run and is never written to a file, a
// log, or a git-tracked place.
import { ROSTER, resolveName } from '../supabase/functions/ems-auth/identity.js';

const EMS_API_BASE = process.env.EMS_API_BASE || 'https://api.sigmatec-ems.com';
const TOKEN = process.env.EMS_TOKEN || '';

if (!TOKEN) {
  console.error('Usage: EMS_TOKEN=<admin token, pasted for this one run> node scripts/seed-staff-identities.mjs');
  process.exit(1);
}

/** The same email→name mapping ems-auth uses at sign-in, so the seed and the live path never disagree. */
function nameFor(user) {
  const first = String(user?.firstName || '').trim();
  if (first && ROSTER.includes(first)) return first;
  return resolveName(null, user?.email || null);
}

async function main() {
  const url = `${EMS_API_BASE}/v1/users?roles=admin&statuses=active&take=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    console.error(`EMS /v1/users returned ${res.status}. Needs an admin token.`);
    process.exit(1);
  }
  const body = await res.json();
  const users = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);

  const rows = [];
  const seenNames = new Set();
  for (const u of users) {
    const id = String(u?.id ?? u?.userId ?? '').trim();
    if (!id) continue;
    const name = nameFor(u);
    if (!name) continue; // not in the roster — not printed, not guessed
    rows.push({ ems_user_id: id, name, email: String(u?.email || '').trim() || null });
    seenNames.add(name);
  }

  if (!rows.length) {
    console.error('No roster names matched any EMS user. Nothing printed — check EMS_API_BASE and the token\'s role.');
    process.exit(1);
  }

  const missing = ROSTER.filter(n => !seenNames.has(n));
  if (missing.length) {
    console.error(`# Note: no EMS account matched: ${missing.join(', ')} — add them by hand if needed.`);
  }

  const esc = s => "'" + String(s).replace(/'/g, "''") + "'";
  console.log('-- Paste into the Supabase SQL editor after עידן confirms the ' + rows.length + ' rows below.');
  console.log('insert into public.staff_identities (ems_user_id, name, email) values');
  console.log(rows.map(r => `  (${esc(r.ems_user_id)}, ${esc(r.name)}, ${r.email ? esc(r.email) : 'null'})`).join(',\n') + '\n' +
    'on conflict (ems_user_id) do update set name = excluded.name, email = excluded.email, updated_at = now();');

  console.error(`\n# ${rows.length} row(s) for: ${[...seenNames].join(', ')}`);
}

main().catch(e => { console.error(String(e?.message || e)); process.exit(1); });
