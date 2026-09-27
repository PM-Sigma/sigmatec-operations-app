  // ===========================================================
  // DELIVERY CERTIFICATE (תעודת משלוח) — package I, task U10: the legacy modal/table UI is
  // gone (app/src/islands/InventoryCert.tsx owns it now, behind invOpen). This file keeps only
  // (a) the prefill trigger points still reached from live legacy markup (visit form / visit
  // history / EMS task / order / visits-report picker), which build a `pre` object and hand it
  // to the React sheet, (b) the public ?cert= view route (no React mount to reach), and (c) the
  // accounting range report, now delegating its HTML to SigmaInv.certRangeReportHtml.
  // ===========================================================

  // session cache: visit refId → issued cert number (fast path before certIssuedForVisit's DB round-trip)
  window._certIssuedFor = window._certIssuedFor || {};

  function certEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function certToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function certFmtDate(ymd) { if (!ymd) return '—'; const d = new Date(ymd + 'T12:00:00'); return isNaN(d) ? certEsc(ymd) : d.toLocaleDateString('he-IL'); }

  // pre = {kibbutz, date, items:[{name,qty}], contact, notes, source, refId, customer?, reissueOf?}
  // The React cert sheet (app/src/islands/InventoryCert.tsx) owns the whole flow now — this is
  // just the one door every trigger point below still knocks on.
  function openDeliveryCert(pre) {
    invOpen({ kind: 'cert', pre: pre || {} });
  }
  window.openDeliveryCert = openDeliveryCert;

  // Gate helper: has an ACTIVE cert been issued & linked to this visit? Returns a cert number or 0.
  async function certIssuedForVisit(visitId) {
    if (!visitId) return 0;
    if (window._certIssuedFor[visitId]) return window._certIssuedFor[visitId];
    if (typeof window._sbCertGet !== 'function') return 0;
    try {
      const rows = await window._sbCertGet('delivery_certs?select=cert_number&ref_id=eq.' + encodeURIComponent(visitId) + '&status=eq.active&order=cert_number.desc&limit=1');
      const n = (rows && rows[0] && rows[0].cert_number) || 0;
      if (n) window._certIssuedFor[visitId] = n;
      return n;
    } catch (e) { return 0; }
  }
  window.certIssuedForVisit = certIssuedForVisit;

  // Canonical public base for share links — recipients must always land on the LIVE app,
  // never on a localhost/preview origin.
  const CERT_VIEW_BASE = 'https://pm-sigma.github.io/sigmatec-operations-app/';
  function certViewUrl(id) { return CERT_VIEW_BASE + '?cert=' + encodeURIComponent(id); }

  // ---- the printed document (brand colors from the Sigmatec logo: lime/teal/dark-teal on navy text) ----
  // ONE generator for print window, in-app preview and the public view link — preview ≡ output by construction.
  // L6 (minimal): delegates to window.SigmaInv.certDocHtml (app/src/lib/certDoc.ts, re-exported
  // from inventory.ts) — byte-identical to the body this replaces, parameterized on opts.logo
  // (was the CERT_LOGO global) instead of a second copy of the printed document's markup.
  function certDocHtml(cert, opts) {
    // `${CERT_LOGO}` (not a bare reference): CERT_LOGO is a top-level const of the LATER file
    // 20-delivery-cert-logo.js, and certDocHtml is only ever reached from user actions well
    // after boot, never at eval-time — see test-concat-order.mjs's eval-time-only contract.
    const logo = `${CERT_LOGO}`;
    return SigmaInv.certDocHtml(cert, Object.assign({ logo }, opts || {}));
  }

  // ---- 🔗 public view route: ?cert=<uuid> renders the stored cert full-page (share-link target) ----
  // Replaces the whole app document — recipients see ONLY the certificate, exactly as issued,
  // with a print/save button.
  //
  // The read is `cert_by_id(uuid)` — a SECURITY DEFINER function that returns THAT ONE ROW
  // (db/rls_certs_checkins_lockdown.sql). It used to be an anon SELECT on the table, which
  // also made every certificate in the business enumerable with the public key that ships in
  // this bundle: customer names, ח.פ., item lines and the recipient's signature image
  // (controller ruling, 19.9). The link is a capability; the table is not a listing.
  //
  // ONE-VERSION FALLBACK: until the migration is applied the function does not exist (404/
  // PGRST202) and the old table read still works — so we try the RPC and fall back once.
  // TODO (remove with the next release after the migration lands): drop `certFetchRow`'s
  // second branch; after the migration the fallback can only ever return an empty list.
  async function certFetchRow(fetchFn, base, key, id) {
    const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
    try {
      const r = await fetchFn(base + '/rest/v1/rpc/cert_by_id',
        { method: 'POST', headers: headers, body: JSON.stringify({ p_id: id }) });
      if (r && r.ok !== false) {
        const rows = await r.json();
        // A SETOF/TABLE function comes back as an array; a 0-row answer is "no such cert",
        // which is a real answer and must NOT fall through to the legacy read.
        if (Array.isArray(rows)) return rows[0] || null;
      }
    } catch (e) { /* network / not deployed yet → try the legacy read below */ }
    const r2 = await fetchFn(base + '/rest/v1/delivery_certs?id=eq.' + id + '&select=*',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    return (await r2.json())[0] || null;
  }
  window._certFetchRow = certFetchRow;   // test handle (test-delivery-cert.mjs §16)
  (function certViewRoute() {
    if (typeof location === 'undefined') return;   // headless test harness — no route to serve
    const m = location.search.match(/[?&]cert=([0-9a-f-]{36})/i);
    if (!m) return;
    window._certViewMode = true;   // set SYNCHRONOUSLY — app timers (EMS nag etc.) survive document.write and must stand down
    (async () => {
      let html;
      try {
        const c = await certFetchRow(fetch, SB_URL, SB_ANON, m[1]);
        if (!c) throw new Error('not found');
        html = certDocHtml({
          number: c.cert_number, date: c.cert_date, kibbutz: c.kibbutz,
          customer: c.customer || {}, items: c.items || [], notes: c.notes || '',
          source: c.source, refId: c.ref_id, recipient: c.recipient || '', signature: c.signature || '',
          cancelled: c.status === 'cancelled', replacedBy: c.replaced_by || 0
        }, { screen: true });
      } catch (e) {
        html = '<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding-top:40vh;color:#dc2626;">התעודה לא נמצאה</body></html>';
      }
      document.open(); document.write(html); document.close();
    })();
  })();

  // ---- prefill helpers (the trigger points) — still reached from legacy markup outside
  // #inventoryLegacy (visit form, visit history rows, EMS task modal, visits-report picker). Each
  // just gathers a `pre` object and opens the React cert sheet.

  // from the visit-summary FORM (before/without saving): current kibbutz + checked products
  function certFromVisitForm() {
    const items = [];
    document.querySelectorAll('.prod-chk:checked').forEach(chk => {
      const q = document.querySelector('.prod-qty[data-product="' + chk.dataset.product + '"]');
      items.push({ name: chk.dataset.product, qty: parseInt(q && q.value) || 1 });
    });
    openDeliveryCert({
      kibbutz: window.currentKibbutz || '',
      date: (document.getElementById('visitDate') || {}).value || certToday(),
      contact: (document.getElementById('visitContact') || {}).value || '',
      items: items,
      source: 'visit',
      refId: window.editingVisitId || (typeof visitDraftId === 'function' ? visitDraftId() : '')
    });
  }
  window.certFromVisitForm = certFromVisitForm;

  // from a SAVED visit record (last-visit box / history rows / report picker)
  function certFromVisitObj(v) {
    if (!v) return;
    const items = (v.products || []).map(p => typeof p === 'string' ? { name: p, qty: 1 } : { name: p.name, qty: p.qty || 1 });
    openDeliveryCert({ kibbutz: v.kibbutz, date: (v.date || '').slice(0, 10), contact: v.contact || '', items: items, source: 'visit', refId: v.id || '' });
  }
  function certFromVisit(visitId) {
    const all = (typeof loadAllVisitsCombined === 'function') ? loadAllVisitsCombined() : [];
    certFromVisitObj(all.find(v => v.id === visitId) || (window.currentKibbutzVisits || []).find(v => v.id === visitId));
  }
  window.certFromVisit = certFromVisit;

  // ---- visits-report modal: pick a visit in range → cert ----
  function openVisitCertPicker() {
    const from = document.getElementById('visitsReportFrom').value;
    const to = document.getElementById('visitsReportTo').value;
    const who = document.getElementById('visitsReportVisitor').value;
    const fromT = from ? new Date(from).getTime() : 0;
    const toT = to ? new Date(to + 'T23:59:59').getTime() : Date.now();
    const seen = new Set();
    const visits = (typeof loadAllVisitsCombined === 'function' ? loadAllVisitsCombined() : []).filter(v => {
      const key = v.id || (v.kibbutz + '|' + v.date + '|' + v.visitor);
      if (seen.has(key)) return false; seen.add(key);
      const d = new Date(v.date).getTime();
      return d >= fromT && d <= toT && (!who || visitorsOf(v).indexOf(who) !== -1) && ((v.products || []).length || v.productsOther);
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let bd = document.getElementById('certPickerModal');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'modal-backdrop';
      bd.id = 'certPickerModal';
      bd.onclick = e => { if (e.target.id === 'certPickerModal') bd.classList.remove('open'); };
      document.body.appendChild(bd);
    }
    const rows = visits.length ? visits.map((v, i) => {
      const n = (v.products || []).length;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid #f1f5f9;font-size:12px;">
        <span>📅 ${new Date(v.date).toLocaleDateString('he-IL')} · <b>${certEsc(v.kibbutz)}</b> · 👤 ${certEsc(v.visitor)} · 📦 ${n} פריטים</span>
        <button class="inv-btn small" onclick="certPickVisit(${i})">🚚 הפק</button>
      </div>`;
    }).join('') : '<div style="padding:16px;text-align:center;color:#94a3b8;">אין ביקורים עם פריטים בטווח הזה</div>';
    window._certPickerVisits = visits;
    bd.innerHTML = `<div class="modal" onclick="event.stopPropagation()" style="max-width:520px;">
      <h3>🚚 תעודת משלוח מביקור</h3>
      <div class="modal-sub">ביקורים עם ציוד שסופק בטווח שנבחר</div>
      <div style="max-height:50vh;overflow-y:auto;">${rows}</div>
      <div class="modal-actions"><button class="btn btn-secondary" onclick="document.getElementById('certPickerModal').classList.remove('open')">סגור</button></div>
    </div>`;
    bd.classList.add('open');
  }
  window.openVisitCertPicker = openVisitCertPicker;
  window.certPickVisit = function (i) {
    document.getElementById('certPickerModal').classList.remove('open');
    certFromVisitObj((window._certPickerVisits || [])[i]);
  };

  // ---- send/download from the visit summary (Field.tsx islands call these by name) ----
  // certView/certSendOpen: with the flag always on, both are one line — open the React sheet.
  function certView(id) { invOpen({ kind: 'cert-view', id: id }); }
  window.certView = certView;
  function certSendOpen(certId) { invOpen({ kind: 'cert-send', id: certId }); }
  window.certSendOpen = certSendOpen;

  /** The visit summary's two buttons — both resolve the visit's ACTIVE certificate first.
   * _certRows is only ever filled by the retired legacy registry render (U10), so it starts
   * empty and stays empty — fall back to Supabase (like certIssuedForVisit) and cache the row
   * there, since certSendOpen/certView look it up by id. */
  async function certRowForVisit(visitId) {
    if (!visitId) return null;
    const hit = (_certRows || []).find(x => x.ref_id === visitId && x.status !== 'cancelled');
    if (hit) return hit;
    if (typeof window._sbCertGet !== 'function') return null;
    try {
      const rows = await window._sbCertGet('delivery_certs?select=*&ref_id=eq.' + encodeURIComponent(visitId) + '&status=eq.active&order=cert_number.desc&limit=1');
      const r = (rows && rows[0]) || null;
      if (r) _certRows.unshift(r);
      return r;
    } catch (e) { return null; }
  }
  async function certSendForVisit(visitId) {
    const r = await certRowForVisit(visitId);
    if (!r) { alert('התעודה עדיין לא נרשמה. נסה שוב בעוד רגע.'); return; }
    certSendOpen(r.id);
  }
  async function certDownloadForVisit(visitId) {
    const r = await certRowForVisit(visitId);
    if (!r) { alert('התעודה עדיין לא נרשמה. נסה שוב בעוד רגע.'); return; }
    certView(r.id);
  }
  window.certRowForVisit = certRowForVisit;
  window.certSendForVisit = certSendForVisit;
  window.certDownloadForVisit = certDownloadForVisit;

  // ---- 🧾 monthly/range report of ISSUED certs, grouped by kibbutz (for accounting) ----
  // Legacy mirrors of app/src/lib/certDoc.ts, held in lockstep by certDoc.test.ts — 21-excel-export.js
  // and the (React) certs tab both still reach these two by name.
  function certGroupName(c) { return SigmaInv.certGroupName(c || {}); }
  window.certGroupName = certGroupName;
  function certReportLabel(name) {
    const map = {};
    ((window.SHEET_DATA && window.SHEET_DATA.products) || []).forEach(p => { map[p.name] = p; });
    return (typeof productLabel === 'function') ? productLabel(map[name] || name, { forReport: true }) : name;
  }
  window.certReportLabel = certReportLabel;

  async function certRangeReportRange(from, to) {
    const w = window.open('', '_blank');
    if (!w) { alert('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים לאתר.'); return; }
    w.document.write('<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding-top:40vh;">⏳ טוען תעודות…</body></html>');
    let certs = [];
    try {
      if (typeof window._sbCertGet !== 'function') throw new Error('no supabase');
      certs = await window._sbCertGet('delivery_certs?select=*&cert_date=gte.' + from + '&cert_date=lte.' + to + '&order=cert_number');
    } catch (e) { w.document.body.innerHTML = 'שגיאה בטעינת התעודות: ' + certEsc(e.message); return; }
    const html = SigmaInv.certRangeReportHtml(certs, from, to, { logo: `${CERT_LOGO}`, label: certReportLabel, now: new Date().toLocaleString('he-IL') });
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
  window.certRangeReportRange = certRangeReportRange;

  // ---- monthly/range report entry points ----
  async function certRangeReport() {
    const from = document.getElementById('visitsReportFrom').value || '2000-01-01';
    const to = document.getElementById('visitsReportTo').value || certToday();
    return certRangeReportRange(from, to);
  }
  window.certRangeReport = certRangeReport;

  // Same report as certRangeReport, but sourced from the certs-tab (מלאי → תעודות משלוח) date filters.
  function certMonthlyFromTab() {
    const fromEl = document.getElementById('invCertsFrom');
    if (!fromEl) return certRangeReportRange('2000-01-01', certToday());   // React cert tab has no legacy #invCertsFrom
    if (!fromEl.value) { const d = new Date(); fromEl.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }
    const from = fromEl.value || '2000-01-01';
    const to = document.getElementById('invCertsTo').value || certToday();
    return certRangeReportRange(from, to);
  }
  window.certMonthlyFromTab = certMonthlyFromTab;
