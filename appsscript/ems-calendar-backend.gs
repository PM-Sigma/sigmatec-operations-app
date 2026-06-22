/**
 * Sigmatec Operations — org backend (Apps Script · Option B)
 * ONE org-owned script that does: (1) EMS proxy (CORS bridge to the EMS API),
 * (2) the office calendar (read + add events on information@sigmatec-energy.com).
 * Replaces the legacy personal-Gmail script. App DATA lives in Supabase — not here.
 *
 * DEPLOY (sign in as an @sigmatec-energy.com account that can access the calendar):
 *   1. script.google.com → New project → paste this.
 *   2. Set CALENDAR_ID below (the office Calendar ID, e.g. information@sigmatec-energy.com).
 *   3. Deploy → New deployment → type "Web app" → Execute as: Me · Who has access: Anyone.
 *   4. Run `authorizeOnce` once from the editor to grant Calendar + external-fetch permission.
 *   5. Send the agent the /exec URL → it repoints the app + wires the calendar UI.
 */

var CALENDAR_ID = 'information@sigmatec-energy.com';   // ← set to the office Calendar ID

// ── entry points ───────────────────────────────────────────────────────────
function doGet(e) {
  // The app pulls office-calendar events from here (everything else is in Supabase).
  try { return _json({ calendar: listCalendarEvents_(90) }); }
  catch (err) { return _json({ calendar: [], error: String(err) }); }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return _json({ error: 'invalid JSON' }); }
  if (body.type === 'ems')          return emsProxy(body);
  if (body.type === 'calendarAdd')  return calendarAdd(body);
  if (body.type === 'calendarList') return _json({ calendar: listCalendarEvents_(body.days || 90) });
  if (body.type === 'transcribe' || body.type === 'parseRequest') return _json({ error: body.type + ' is disabled' });
  return _json({ error: 'unknown type: ' + (body.type || '(none)') });
}

// ── EMS proxy (CORS bridge) — same logic as the legacy script ────────────────
function emsProxy(body) {
  var base = String(body.base || 'https://api.sigmatec-ems.com').replace(/\/+$/, '');
  var allowed = /^https?:\/\/([a-z0-9-]+\.)*sigmatec-ems\.com(:\d+)?(\/[^\s]*)?$/i.test(base) ||
                /^https?:\/\/localhost(:\d+)?(\/[^\s]*)?$/i.test(base);
  if (!allowed) return _json({ error: 'EMS base URL not allowed: ' + base });
  var options = { method: String(body.method || 'GET').toLowerCase(), contentType: 'application/json', muteHttpExceptions: true, headers: {} };
  if (body.token) options.headers['Authorization'] = 'Bearer ' + body.token;
  if (body.payload != null) options.payload = JSON.stringify(body.payload);
  try {
    var resp = UrlFetchApp.fetch(base + (body.path || ''), options);
    var text = resp.getContentText(); var parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = text; }
    return _json({ status: resp.getResponseCode(), body: parsed });
  } catch (err) { return _json({ error: 'EMS request failed: ' + err.message }); }
}

// ── Office calendar ──────────────────────────────────────────────────────────
function cal_() {
  var c = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!c) throw new Error('Calendar not found / not shared with this account: ' + CALENDAR_ID);
  return c;
}
function listCalendarEvents_(days) {
  var now = new Date();
  var end = new Date(now.getTime() + (days || 90) * 86400000);
  return cal_().getEvents(now, end).map(function (ev) {
    return {
      id: ev.getId(), title: ev.getTitle(),
      start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString(),
      allDay: ev.isAllDayEvent(), location: ev.getLocation() || '', description: ev.getDescription() || ''
    };
  });
}
function calendarAdd(body) {
  try {
    var title = String(body.title || 'אירוע');
    var start = new Date(body.start);
    if (isNaN(start.getTime())) return _json({ error: 'bad start date' });
    var end = body.end ? new Date(body.end) : new Date(start.getTime() + 60 * 60000);
    var opts = { description: String(body.description || ''), location: String(body.location || '') };
    var ev = body.allDay ? cal_().createAllDayEvent(title, start, opts) : cal_().createEvent(title, start, end, opts);
    return _json({ ok: true, id: ev.getId() });
  } catch (err) { return _json({ error: 'calendar add failed: ' + String(err) }); }
}

// Run once from the editor to grant Calendar + external-request permissions.
function authorizeOnce() { listCalendarEvents_(1); UrlFetchApp.fetch('https://api.sigmatec-ems.com', { muteHttpExceptions: true }); }

function _json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
