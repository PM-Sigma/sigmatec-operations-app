#!/usr/bin/env node
// scripts/seed-staff-identities.mjs — X-L1, one-time seed for db/staff_identities.sql.
//
// Run BY HAND, once, when עידן pastes an EMS token for this one run (X-L3 step 3).
// It never connects to Supabase and never writes to disk: it reads every ACTIVE EMS user with a
// @sigmatec-energy.com account (not only admins — a lockout risk is any active staff member
// with no row; not customer contacts — a customer named עידן or מתניה must never earn a roster
// row) and PRINTS the `insert … on conflict do update` SQL for עידן to review before it runs
// anywhere. Aborts, printing nothing, if a roster name ever matches more than one EMS id.
//
//   EMS_TOKEN=<pasted token> node scripts/seed-staff-identities.mjs
//
// The token is read from the environment for this one run and is never written to a file, a
// log, or a git-tracked place.
import { pathToFileURL } from 'node:url';
import { ROSTER, resolveName } from '../supabase/functions/ems-auth/identity.js';

const EMS_API_BASE = process.env.EMS_API_BASE || 'https://api.sigmatec-ems.com';
const TOKEN = process.env.EMS_TOKEN || '';
// import.meta.main-style guard (Node has no built-in equivalent): only the CLI run — never a
// test importing the pure exports below — needs a token or should touch the network at all.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

/** Only a company account can be staff. A customer contact happening to be named עידן or
 * מתניה in the EMS must never earn a roster row — this is the ONE gate that keeps that safe,
 * so it runs before either name-matching path (firstName or the email alias). */
export const STAFF_DOMAIN = '@sigmatec-energy.com';
export function isStaffEmail(email) {
  return String(email || '').trim().toLowerCase().endsWith(STAFF_DOMAIN);
}

/** The same email→name mapping ems-auth uses at sign-in, so the seed and the live path never disagree. */
export function nameFor(user) {
  if (!isStaffEmail(user?.email)) return null;
  const first = String(user?.firstName || '').trim();
  if (first && ROSTER.includes(first)) return first;
  return resolveName(null, user?.email || null);
}

/**
 * The pure heart of the seed: EMS users in → either the printable rows, or the ambiguity that
 * must abort the run. No network, no process.exit — testable directly.
 */
export function rowsFrom(users) {
  const rows = [];
  const seenNames = new Set();
  const idsByName = new Map();
  for (const u of users || []) {
    const id = String(u?.id ?? u?.userId ?? '').trim();
    if (!id) continue;
    const name = nameFor(u);
    if (!name) continue; // not in the roster, or not a @sigmatec-energy.com account — not printed, not guessed
    rows.push({ ems_user_id: id, name, email: String(u?.email || '').trim() || null });
    seenNames.add(name);
    (idsByName.get(name) || idsByName.set(name, new Set()).get(name)).add(id);
  }
  // Safety abort: a roster name matching TWO different EMS ids is exactly the ambiguity this
  // seed must never guess through — it would be silent identity confusion, not a lockout, and
  // printing SQL for either guess risks minting the wrong person's claim.
  const ambiguous = [...idsByName].filter(([, ids]) => ids.size > 1);
  if (ambiguous.length) return { ok: false, ambiguous };
  return { ok: true, rows, seenNames };
}

async function main() {
  // Audit fix (Opus 24.9): ALL active users, not only roles=admin — the lockout risk this
  // seed exists to close is any ACTIVE staff member with no row, admin or not. ems-auth no
  // longer learns a name at sign-in (that path is deleted), so a person this seed misses stays
  // name-less until someone re-runs it — the roster filter (nameFor) is what keeps this safe
  // even with the wider query: an EMS account that is not one of the seven roster names is
  // simply never printed.
  const url = `${EMS_API_BASE}/v1/users?statuses=active&take=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    console.error(`EMS /v1/users returned ${res.status}.`);
    process.exit(1);
  }
  const body = await res.json();
  const users = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);

  const result = rowsFrom(users);
  if (!result.ok) {
    // Refuses to print anything until עידן resolves the ambiguity by hand.
    console.error('ABORT: more than one EMS account maps to the same roster name — resolve by hand, nothing printed:');
    for (const [name, ids] of result.ambiguous) console.error(`  ${name}: ${[...ids].join(', ')}`);
    process.exit(1);
  }
  const { rows, seenNames } = result;

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

if (isMain) {
  if (!TOKEN) {
    console.error('Usage: EMS_TOKEN=<admin token, pasted for this one run> node scripts/seed-staff-identities.mjs');
    process.exit(1);
  }
  main().catch(e => { console.error(String(e?.message || e)); process.exit(1); });
}
