import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PUSH_EVENT_LABEL, pushLogTiles, pushLogLine, pushLogCanSee } from './pushLog';

const rows = [
  { sent_at: '2026-09-23T11:02:00Z', event: 'visitCron', status: 'sent', where_txt: 'גבים', qty: 1, recipient: 'אביאם', error: null, actor: null },
  { sent_at: '2026-09-23T10:00:00Z', event: 'pending', status: 'failed', where_txt: 'לקיבוץ חוקוק', qty: 3, recipient: 'עמיחי', error: '410 Gone', actor: 'אביאם' },
  { sent_at: '2026-09-22T06:00:00Z', event: 'someNewMode', status: 'expired', where_txt: null, qty: null, recipient: 'ניתאי', error: null, actor: null },
];

/** The real mode list, lifted from the edge function itself (not retyped here) so a new mode
 *  added to push-send without a PUSH_EVENT_LABEL entry fails THIS test instead of silently
 *  showing a raw key on someone's phone. Two literal shapes carry an event name: an object
 *  field (`event: "attendanceCron"`, the cron/digest modes) and a comparison (`event === "pending"`,
 *  the order modes, whose value arrives on the request body). */
function pushSendModes(): string[] {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../supabase/functions/push-send/index.ts'), 'utf8');
  return [...new Set([...src.matchAll(/event\s*(?:===|:)\s*"([a-zA-Z]+)"/g)].map(m => m[1]))];
}

describe('push log', () => {
  it('names every mode push-send has today', () => {
    const modes = pushSendModes();
    expect(modes.length).toBeGreaterThan(0);   // the extraction itself must find something
    for (const m of modes) expect(PUSH_EVENT_LABEL[m], m).toBeTruthy();
  });
  it('tiles', () => expect(pushLogTiles(rows as any)).toEqual({ total: 3, sent: 1, failed: 1, expired: 1 }));
  it('a line', () => expect(pushLogLine(rows[1] as any)).toEqual({
    when: '23.9 13:00', what: 'הזמנה ממתינה', where: 'לקיבוץ חוקוק · 3', who: 'עמיחי',
    status: { label: 'נכשלה', role: 'danger' }, error: '410 Gone', actor: 'אביאם' }));
  it('an unknown mode shows the neutral Hebrew fallback, never a raw key or empty', () => expect(pushLogLine(rows[2] as any).what).toBe('התראה אחרת'));
  it('עידן only', () => {
    expect(pushLogCanSee('עידן', true)).toBe(true);
    expect(pushLogCanSee('עמיחי', false)).toBe(false);
    expect(pushLogCanSee('', false)).toBe(false);
  });
});
