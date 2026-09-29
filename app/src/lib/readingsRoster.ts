// Who may pull meter readings (עידן 29.9): every signed-in staff member, never the view-only role.
// Mirrors canUseReadings() in supabase/functions/_shared/readingsRoster.js (which reads the bridge
// JWT claims); on the client the same facts are the current user's name and the viewer flag.
export const canUseReadings = (name: unknown, isViewer = false): boolean =>
  typeof name === 'string' && name.trim() !== '' && !isViewer;
