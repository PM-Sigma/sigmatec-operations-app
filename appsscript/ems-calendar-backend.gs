/**
 * Sigmatec Operations — org backend (Apps Script · Option B, hardened)
 * ONE org-owned script: (1) EMS proxy (CORS bridge), (2) office calendar (read + add).
 * App DATA lives in Supabase — not here.
 *
 * SECURITY MODEL (why the public /exec URL is OK):
 *   • Calendar read + add REQUIRE a valid EMS token, verified live against the EMS API.
 *     Only a logged-in EMS user can read or add office-calendar events — same bar as the app.
 *   • The EMS proxy uses the CALLER'S OWN EMS token and is domain-locked to *.sigmatec-ems.com
 *     (no SSRF elsewhere). No token → EMS rejects.
 *   • Runs as the deploying account → holds only Calendar + external-fetch scopes (not Gmail/Drive).
 *
 * DEPLOY (sign in as information@sigmatec-energy.com, which owns/has the calendar):
 *   1. script.google.com → New project → paste this.
 *   2. Confirm CALENDAR_ID below.
 *   3. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone.
 *   4. Run `authorizeOnce` once from the editor (grants Calendar + external-fetch).
 *   5. Send the agent the /exec URL.
 */

var CALENDAR_ID = 'information@sigmatec-energy.com';   // office calendar
var EMS_BASE    = 'https://api.sigmatec-ems.com';      // for token validation

// ── entry points ─────────────────────────────────────────────────────────────
function doGet(e) {
  // The URL is public, so doGet returns NO calendar data — health check only.
  // The app reads the calendar via doPost {type:'calendarList', token} (token-gated).
  return _json({ ok: true, service: 'sigmatec-ops-backend' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return _json({ error: 'invalid JSON' }); }
  if (body.type === 'ems')          return emsProxy(body);                                   // caller's token + domain-locked
  if (body.type === 'calendarList') return guarded_(body, function () { return _json({ calendar: listCalendarEvents_(body.days || 90) }); });
  if (body.type === 'calendarAdd')  return guarded_(body, function () { return calendarAdd(body); });
  if (body.type === 'transcribe' || body.type === 'parseRequest') return _json({ error: body.type + ' is disabled' });
  return _json({ error: 'unknown type: ' + (body.type || '(none)') });
}

// ── auth: calendar ops require a live-valid EMS token ────────────────────────
function guarded_(body, fn) {
  if (!validateEmsToken_(body.token)) return _json({ error: 'unauthorized: valid EMS login required' });
  return fn();
}
function validateEmsToken_(token) {
  // ponytail: one extra EMS call per calendar op — fine for low-frequency calendar use; add a
  // short-lived token cache here only if calendar reads ever get hot.
  if (!token) return false;
  try {
    var resp = UrlFetchApp.fetch(EMS_BASE + '/v1/employee-tasks?take=1', {
      method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token }
    });
    return resp.getResponseCode() === 200;
  } catch (err) { return false; }
}

// ── EMS proxy (CORS bridge) ──────────────────────────────────────────────────
function emsProxy(body) {
  var base = String(body.base || EMS_BASE).replace(/\/+$/, '');
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
function authorizeOnce() { listCalendarEvents_(1); UrlFetchApp.fetch(EMS_BASE, { muteHttpExceptions: true }); }

function _json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
