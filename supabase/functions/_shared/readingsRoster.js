// Who may pull meter readings (readings-fetch). Dependency-free, like github/lineage.js,
// so the node test can import it and the Edge Function can too.
export const READINGS_USERS = ['עידן', 'עמיחי', 'מתניה'];
export const canUseReadings = (name) => typeof name === 'string' && READINGS_USERS.includes(name.trim());
