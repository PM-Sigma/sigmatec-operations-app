// identity.js — resolves the EMS user to a roster name (X-L1).
//
// Dependency-free on purpose: ems-auth/index.ts imports it directly in Deno, and
// test-ems-auth-claims.mjs imports the SAME file in Node. No '@/…' imports, no types-only
// syntax that a plain `node --experimental` run couldn't parse.
//
// The claim is always one of ROSTER, or absent — never "PM", never an email, never anything a
// client could have chosen. `resolveName` is the one place that decides.

/** The roster spelling (mirrors app/src/lib/people.ts APP_PEOPLE — test-ems-auth-claims.mjs pins it). */
export const ROSTER = ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'מתניה', 'אליה'];

/** Known EMS-email → app-person overrides (ported from js/src/15-login-gate.js:247). */
const EMS_EMAIL_ALIASES = { 'pm@sigmatec-energy.com': 'עידן' };

/**
 * The table wins when it names a roster person. Otherwise the email alias. Otherwise no claim
 * at all — never a guess, never a non-roster string.
 *
 * @param {{ name?: string } | null} row   a staff_identities row, if one exists
 * @param {string | null} email            the EMS account email, if known
 * @returns {string | null}
 */
export function resolveName(row, email) {
  const tableName = row && typeof row.name === 'string' ? row.name.trim() : '';
  if (tableName && ROSTER.indexOf(tableName) !== -1) return tableName;

  const key = String(email || '').trim().toLowerCase();
  const alias = key ? EMS_EMAIL_ALIASES[key] : undefined;
  if (alias && ROSTER.indexOf(alias) !== -1) return alias;

  return null;
}
