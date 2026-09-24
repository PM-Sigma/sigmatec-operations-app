// ✉️ הודעה לעובד — the pure half of the round-5 compose (L4). The legacy send/fetch/mark-read
// calls stay in `js/src/17-messages.js` (exposed on `window`, package convention); this file
// only decides who may be messaged, whether a draft is fit to send, and the copy.
import { APP_PEOPLE, VIEWER_NAME } from '@/lib/people';

/** The most a message may hold — matched by the sheet's own `<bdi>N/500</bdi>` counter. */
export const MESSAGE_MAX = 500;

/** Every person who can sign in, minus the viewer and minus the sender himself. */
export function recipientsFor(me: string): string[] {
  return APP_PEOPLE.filter(p => p !== me && p !== VIEWER_NAME);
}

/** What the compose sheet must satisfy before "שליחה" is live; `[]` = fine. */
export function validateMessage(to: string, text: string): string[] {
  const errs: string[] = [];
  if (!String(to ?? '').trim()) errs.push('יש לבחור נמען');
  const t = String(text ?? '').trim();
  if (!t) errs.push('ההודעה ריקה');
  else if (t.length > MESSAGE_MAX) errs.push(`ההודעה ארוכה מ-${MESSAGE_MAX} תווים`);
  return errs;
}

/** The unread sheet's title — one message reads differently from "N messages". */
export function unreadTitle(n: number): string {
  return n === 1 ? 'הודעה חדשה' : `${n} הודעות חדשות`;
}
