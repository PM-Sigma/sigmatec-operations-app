// The `list` action's one-event mapper, pure so app/src/lib/calendarEventMap.test.ts can pin
// it. Round 5 · C4 adds attendees + organizer for the calendar's event detail sheet; every
// other field is exactly what index.ts returned before.
//
// Audit fix: never ship a raw email address to the client (every EMS role, viewer included,
// can read the `calendar` function's response). The label is resolved HERE, server-side —
// the display name when Google gave one, else the part of the address before '@' — and the
// email itself is dropped from the payload.
function label(p: any): string {
  const name = String((p && p.displayName) || '').trim();
  if (name) return name;
  const email = String((p && p.email) || '').trim();
  return email ? email.split('@')[0] : '';
}

export function mapGoogleEvent(ev: any) {
  const person = (p: any) => ({ name: label(p) });
  return {
    id: ev.id,
    title: ev.summary || "(ללא כותרת)",
    start: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
    end: (ev.end && (ev.end.dateTime || ev.end.date)) || null,
    allDay: !!(ev.start && ev.start.date),
    location: ev.location || "",
    description: ev.description || "",
    hangoutLink: ev.hangoutLink
      || (ev.conferenceData && Array.isArray(ev.conferenceData.entryPoints)
        && (ev.conferenceData.entryPoints.find((p: any) => p && p.entryPointType === "video") || {}).uri)
      || null,
    organizer: ev.organizer ? person(ev.organizer) : null,
    attendees: (Array.isArray(ev.attendees) ? ev.attendees : []).map((a: any) => ({
      ...person(a),
      self: !!a.self,
      declined: a.responseStatus === "declined",
    })),
  };
}
