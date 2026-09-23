import { describe, it, expect } from 'vitest';
import { PUSH_EVENT_LABEL, pushLogTiles, pushLogLine, pushLogCanSee } from './pushLog';

const rows = [
  { sent_at: '2026-09-23T11:02:00Z', event: 'visitCron', status: 'sent', where_txt: 'גבים', qty: 1, recipient: 'אביאם', error: null, actor: null },
  { sent_at: '2026-09-23T10:00:00Z', event: 'pending', status: 'failed', where_txt: 'לקיבוץ חוקוק', qty: 3, recipient: 'עמיחי', error: '410 Gone', actor: 'אביאם' },
  { sent_at: '2026-09-22T06:00:00Z', event: 'someNewMode', status: 'expired', where_txt: null, qty: null, recipient: 'ניתאי', error: null, actor: null },
];

describe('push log', () => {
  it('names every mode push-send has today', () => {
    for (const m of ['pending', 'approved', 'attendanceCron', 'attendanceReminder', 'gapReminder', 'timerStale', 'visitCron',
                     'usageDigest', 'inventoryAlert', 'inventoryDigest', 'feedbackNew'])
      expect(PUSH_EVENT_LABEL[m], m).toBeTruthy();
  });
  it('tiles', () => expect(pushLogTiles(rows as any)).toEqual({ total: 3, sent: 1, failed: 1, expired: 1 }));
  it('a line', () => expect(pushLogLine(rows[1] as any)).toEqual({
    when: '23.9 13:00', what: 'הזמנה ממתינה', where: 'לקיבוץ חוקוק · 3', who: 'עמיחי',
    status: { label: 'נכשלה', role: 'danger' }, error: '410 Gone', actor: 'אביאם' }));
  it('an unknown mode shows its raw name, never empty', () => expect(pushLogLine(rows[2] as any).what).toBe('someNewMode'));
  it('עידן only', () => {
    expect(pushLogCanSee('עידן', true)).toBe(true);
    expect(pushLogCanSee('עמיחי', false)).toBe(false);
    expect(pushLogCanSee('', false)).toBe(false);
  });
});
