// Who may use readings-fetch (עידן 29.9: ALL signed-in staff, never the view-only role).
// ems-auth mints the `name` claim only for rostered staff (staff_identities) and gives the viewer
// pass `viewer: true` and no name, so "has a name AND is not a viewer" is the whole rule.
// Dependency-free so the node test can import it and the Edge Function can too.
// db/readings_pull.sql is_readings_user() must say the same thing (test-readings-roster.mjs).
export const canUseReadings = (payload) => {
  const p = payload || {};
  return typeof p.name === 'string' && p.name.trim() !== '' && p.viewer !== true;
};
