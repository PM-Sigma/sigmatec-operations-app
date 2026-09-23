import { describe, expect, it } from 'vitest';
// Extensionless on purpose: the app's tsconfig has no allowImportingTsExtensions. Deno's
// index.ts imports the same file as "./map.ts".
import { mapGoogleEvent } from '../../../supabase/functions/calendar/map';

describe('the calendar edge function’s list mapper', () => {
  it('keeps today’s fields and adds attendees + organizer', () => {
    const out = mapGoogleEvent({
      id: 'g1', summary: 'ישיבה', start: { dateTime: '2026-09-24T10:00:00+03:00' }, end: { dateTime: '2026-09-24T11:00:00+03:00' },
      location: 'משרד', description: 'x',
      conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc' }] },
      organizer: { displayName: 'עמיחי', email: 'a@x.com' },
      attendees: [{ displayName: 'אביאם', email: 'b@x.com', self: true }, { email: 'c@x.com', responseStatus: 'declined' }],
    });
    expect(out).toEqual({
      id: 'g1', title: 'ישיבה', start: '2026-09-24T10:00:00+03:00', end: '2026-09-24T11:00:00+03:00',
      allDay: false, location: 'משרד', description: 'x', hangoutLink: 'https://meet.google.com/abc',
      organizer: { name: 'עמיחי', email: 'a@x.com' },
      attendees: [
        { name: 'אביאם', email: 'b@x.com', self: true, declined: false },
        { name: '', email: 'c@x.com', self: false, declined: true },
      ],
    });
  });
  it('an event with no title, no attendees and an all-day date', () => {
    const out = mapGoogleEvent({ id: 'g2', start: { date: '2026-09-24' }, end: { date: '2026-09-25' } });
    expect(out).toMatchObject({ title: '(ללא כותרת)', allDay: true, attendees: [], organizer: null, hangoutLink: null });
  });
});
