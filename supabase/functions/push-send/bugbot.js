// push-send/bugbot.js - PURE, dependency-free (Node tests + Deno import the same file).
// The 🤖 bug bot's push to עידן ONLY: short Hebrew, status emoji first. The recipient is fixed
// in index.ts (never taken from the request); the caller only says WHICH bug and WHAT state.
export const BUGBOT_RECIPIENTS = ['עידן'];
export const BUGBOT_TITLES = {
  merged: '✅ תוקן ועלה',
  needs_approval: '🟡 דורש את אישורך',
  not_reproduced: '❓ לא שוחזר',
  failed: '⚠️ הבוט נכשל',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** -> { title, body, tag, path } | null (bad state / bad id: nothing is sent). `path` is the hash deep link. */
export function bugbotPush({ id, state, note } = {}) {
  const title = BUGBOT_TITLES[state];
  if (!title || !UUID.test(String(id || ''))) return null;
  const body = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'פתח את התיבה לפרטים';
  return { title, body, tag: 'bugbot-' + id, path: '#feedback-inbox?id=' + id };
}
