/**
 * Delivery-cert Drive archive ETL — runs under the company Google Workspace account.
 *
 * Extract:   delivery_certs rows with doc_html present and archived_at null (Supabase REST).
 * Transform: the frozen HTML snapshot (exactly what was printed, incl. signature) → PDF
 *            via Google's HTML→PDF converter.
 * Load:      Drive folder  תעודות משלוח / <YYYY> / <MM> , then PATCH the row:
 *            drive_url = file link, archived_at = now, doc_html = '' (frees DB storage).
 *
 * ── Setup (once) ─────────────────────────────────────────────────────────────
 * 1. In the Apps Script project (script.google.com, company account):
 *    Project Settings → Script Properties →
 *      SUPABASE_URL         = https://wwqfcajnxinaxmobrgol.supabase.co
 *      SUPABASE_SERVICE_KEY = <service_role key — SERVER-SIDE ONLY, never in the repo/client>
 * 2. Paste this file, run setupArchiveTrigger() once (authorize Drive + UrlFetch).
 *    It installs an hourly trigger for archiveDeliveryCerts().
 * 3. Optional: run archiveDeliveryCerts() manually to backfill immediately.
 *
 * Note: the Drive PDF is the ARCHIVE copy (Google's converter; near-identical rendering).
 * The canonical print path in the app stays browser-native.
 */

var ROOT_FOLDER_NAME = 'תעודות משלוח';
var BATCH_LIMIT = 20;   // per run — hourly trigger drains any backlog quickly

function setupArchiveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'archiveDeliveryCerts') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('archiveDeliveryCerts').timeBased().everyHours(1).create();
  Logger.log('Hourly archive trigger installed.');
}

function sbConf_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('SUPABASE_URL'), key = p.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY script properties');
  return { url: url, headers: { apikey: key, Authorization: 'Bearer ' + key } };
}

function archiveDeliveryCerts() {
  var sb = sbConf_();
  var q = '/rest/v1/delivery_certs?select=id,cert_number,cert_date,kibbutz,status,doc_html'
        + '&archived_at=is.null&doc_html=neq.&order=cert_number&limit=' + BATCH_LIMIT;
  var rows = JSON.parse(UrlFetchApp.fetch(sb.url + q, { headers: sb.headers }).getContentText() || '[]');
  if (!rows.length) return;

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
      Logger.log('archived cert %s → %s', c.cert_number, file.getUrl());
    } catch (e) {
      Logger.log('cert %s failed: %s', c.cert_number, e && e.message);   // stays unarchived → retried next run
    }
  });
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
