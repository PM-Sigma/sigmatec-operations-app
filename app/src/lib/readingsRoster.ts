// Who may pull meter readings. A copy of supabase/functions/_shared/readingsRoster.js — the
// React bundle cannot reach outside app/, so readingsRoster.test.ts asserts the two files (and
// the legacy gate in js/src/00-bridge.js) stay equal.
export const READINGS_USERS = ['עידן', 'עמיחי', 'מתניה'];
export const canUseReadings = (name: unknown): boolean =>
  typeof name === 'string' && READINGS_USERS.includes(name.trim());
