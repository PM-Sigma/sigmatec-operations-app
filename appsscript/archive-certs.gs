/**
 * Delivery-cert Drive archive ETL — runs under the company Google Workspace account.
 *
 * DESIGN (עידן, 2026-07-15): the PDF snapshots (doc_html) LIVE IN SUPABASE for the current month.
 * Archiving to Drive is MONTHLY: on the 15th, every cert of months that have fully ended
 * (e.g. on Aug 15 → all of July and older) is converted to PDF, filed in Drive under
 * תעודות משלוח/<YYYY>/<MM>, and its doc_html is CLEARED from the DB (frees the free tier).
 * After archiving, the app keeps full preview (re-rendered from the data row) + a 📁 Drive link.
 *
 * Manual quick upload: run archiveMonth('2026-07') anytime to push a stored month immediately.
 *
 * ── Setup (once, when Drive is connected — deferred for now) ────────────────
 * 1. script.google.com (company account) → paste this file.
 * 2. Project Settings → Script Properties:
 *      SUPABASE_URL         = https://wwqfcajnxinaxmobrgol.supabase.co
 *      SUPABASE_SERVICE_KEY = <service_role key — SERVER-SIDE ONLY, never in the repo/client>
 * 3. Run setupArchiveTrigger() once (authorizes Drive + UrlFetch; installs the monthly trigger,
 *    day 15 at ~03:00).
 * 4. Optional backfill: archiveDueCerts() manually.
 *
 * Note: the Drive PDF is the ARCHIVE copy (Google's HTML→PDF converter; near-identical rendering).
 * The canonical print path in the app stays browser-native.
 */

var ROOT_FOLDER_NAME = 'תעודות משלוח';
var BATCH_LIMIT = 100;   // per run; a monthly batch is typically well under this

function setupArchiveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'archiveDueCerts') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('archiveDueCerts').timeBased().onMonthDay(15).atHour(3).create();
  Logger.log('Monthly archive trigger installed (day 15, ~03:00).');
}

// Scheduled entry: archive everything from BEFORE the current month (on the 15th, the previous
// month ended ≥15 days ago — exactly the requested cadence).
function archiveDueCerts() {
  var now = new Date();
  var firstOfCurrent = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), 'GMT+3', 'yyyy-MM-dd');
  archiveWhere_('&cert_date=lt.' + firstOfCurrent);
}

// Manual quick upload of one stored month, e.g. archiveMonth('2026-07').
function archiveMonth(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) throw new Error("archiveMonth('YYYY-MM') — e.g. archiveMonth('2026-07')");
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  var from = ym + '-01';
  var to = Utilities.formatDate(new Date(y, m, 1), 'GMT+3', 'yyyy-MM-dd');   // first of next month
  archiveWhere_('&cert_date=gte.' + from + '&cert_date=lt.' + to);
}

function sbConf_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('SUPABASE_URL'), key = p.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY script properties');
  return { url: url, headers: { apikey: key, Authorization: 'Bearer ' + key } };
}

function archiveWhere_(dateFilter) {
  var sb = sbConf_();
  var q = '/rest/v1/delivery_certs?select=id,cert_number,cert_date,kibbutz,status,doc_html'
        + '&archived_at=is.null&doc_html=neq.' + dateFilter
        + '&order=cert_number&limit=' + BATCH_LIMIT;
  var rows = JSON.parse(UrlFetchApp.fetch(sb.url + q, { headers: sb.headers }).getContentText() || '[]');
  Logger.log('%s certs to archive', rows.length);
  var done = 0;
  rows.forEach(function (c) {
    try {
      var d = new Date(c.cert_date + 'T12:00:00');
      var folder = subFolder_(subFolder_(rootFolder_(), String(d.getFullYear())), pad2_(d.getMonth() + 1));
      var name = (c.status === 'cancelled' ? 'מבוטלת - ' : '') +
        'תעודת משלוח ' + c.cert_number + ' - ' + c.kibbutz + ' - ' + c.cert_date + '.pdf';
      var pdf = Utilities.newBlob(c.doc_html, MimeType.HTML, name.replace(/\.pdf$/, '.html')).getAs(MimeType.PDF).setName(name);
      var file = folder.createFile(pdf);
      var patch = UrlFetchApp.fetch(sb.url + '/rest/v1/delivery_certs?id=eq.' + encodeURIComponent(c.id), {
        method: 'patch',
        headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, sb.headers),
        payload: JSON.stringify({ drive_url: file.getUrl(), archived_at: new Date().toISOString(), doc_html: '' }),
        muteHttpExceptions: true
      });
      if (patch.getResponseCode() >= 300) {
        // DB not updated → remove the file so the next run retries cleanly (no orphan duplicates)
        file.setTrashed(true);
        throw new Error('PATCH failed ' + patch.getResponseCode() + ': ' + patch.getContentText());
      }
      done++;
    } catch (e) {
      Logger.log('cert %s failed: %s', c.cert_number, e && e.message);   // stays unarchived → retried next run
    }
  });
  Logger.log('archived %s/%s', done, rows.length);
}

function rootFolder_() {
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
}
function subFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function pad2_(n) { return ('0' + n).slice(-2); }
