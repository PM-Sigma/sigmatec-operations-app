// The `list` action's one-event mapper, pure so app/src/lib/calendarEventMap.test.ts can pin
// it. Round 5 · C4 adds attendees + organizer for the calendar's event detail sheet; every
// other field is exactly what index.ts returned before.
export function mapGoogleEvent(ev: any) {
  const person = (p: any) => ({ name: String((p && p.displayName) || ''), email: String((p && p.email) || '') });
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
