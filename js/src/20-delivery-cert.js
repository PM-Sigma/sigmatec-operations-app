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

  // ---- 👁 in-app preview overlay (no download, no popup — mobile-friendly iframe) ----
  function certOverlayShow(html, certId, driveUrl) {
    let ov = document.getElementById('certViewOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'certViewOverlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:4000;background:#334155;display:flex;flex-direction:column;';
      ov.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#1b2a4a;">
          <button id="certOvPrint" class="btn btn-primary" style="padding:8px 14px;font-size:13px;min-height:40px;">🖨️ הדפס / PDF</button>
          <button id="certOvSend" class="btn btn-secondary" style="padding:8px 14px;font-size:13px;min-height:40px;">📤 שלח</button>
          <a id="certOvDrive" class="btn btn-secondary" target="_blank" rel="noopener" style="padding:8px 14px;font-size:13px;min-height:40px;text-decoration:none;display:none;align-items:center;background:#f59e0b;border-color:#f59e0b;color:#1b2a4a;">📁 הקובץ בדרייב</a>
          <span style="flex:1;"></span>
          <button onclick="document.getElementById('certViewOverlay').style.display='none'" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;min-width:40px;min-height:40px;">✕</button>
        </div>
        <!-- print-ok: the frame shows the PRINTED certificate (certDocHtml) — white paper -->
        <iframe id="certOvFrame" style="flex:1;border:none;background:#fff;width:100%;"></iframe>`;
      document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    document.getElementById('certOvFrame').srcdoc = html;
    document.getElementById('certOvPrint').onclick = () => { try { const f = document.getElementById('certOvFrame'); f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert('הדפסה נכשלה: ' + e.message); } };
    const sendBtn = document.getElementById('certOvSend');
    sendBtn.style.display = certId ? '' : 'none';
    if (certId) sendBtn.onclick = () => certSendOpen(certId);
    // archived cert → the official PDF copy lives in Drive; the overlay stays the exact preview
    const driveBtn = document.getElementById('certOvDrive');
    if (driveBtn) {
      const ok = driveUrl && /^https:\/\/(drive|docs)\.google\.com\//.test(driveUrl);
      driveBtn.style.display = ok ? 'flex' : 'none';
      if (ok) driveBtn.href = driveUrl;
    }
  }

  // Report-facing preview only (spec §3): 👁 from the reports hub, viewed as a viewer, prints
  // display names — a field-issued cert (the technical-name snapshot everyone else sees, and
  // what the recipient actually signed for) is never rewritten. Applied here only, not in
  // certReprint (the internal "reissue"/print-again path), which stays byte-identical to what
  // was issued.
  function certItemsForView(items) {
    if (!(typeof isViewer === 'function' && isViewer())) return items || [];
    const map = typeof xlProductMapFromSheet === 'function' ? xlProductMapFromSheet() : {};
    return (items || []).map(i => ({ name: typeof xlLabel === 'function' ? xlLabel(i.name, map) : i.name, qty: i.qty }));
  }

  // stored cert → overlay (registry 👁 button)
  function certView(id) {
    const c = _certRows.find(x => x.id === id);
    if (!c) return;
    certOverlayShow(certDocHtml({
      number: c.cert_number, date: c.cert_date, kibbutz: c.kibbutz,
      customer: c.customer || {}, items: certItemsForView(c.items || []), notes: c.notes || '',
      source: c.source, refId: c.ref_id, recipient: c.recipient || '', signature: c.signature || '',
      cancelled: c.status === 'cancelled', replacedBy: c.replaced_by || 0
    }, { screen: true }), id, c.drive_url || '');
  }
  window.certView = certView;

  // pre-issue preview from the edit modal — exactly what issuing would produce (as a draft, no number yet)
  function certPreviewDraft() {
    const cert = certCollect();
    if (!cert.items.length) { alert('אין פריטים בתעודה. הוסף לפחות פריט אחד.'); return; }
    cert.number = null;   // the running number is assigned only on issue
    certOverlayShow(certDocHtml(cert, { screen: true }), null);
  }
  window.certPreviewDraft = certPreviewDraft;

  // ---- 📤 send panel: site contacts (EMS managers) → email / WhatsApp with the view link ----
  const CERT_ROLE_HE = { site_manager: 'מנהל אתר', operations_manager: 'מנהל תפעול' };
  function certShareText(c) {
    return 'שלום, מצורפת תעודת משלוח מס\' ' + c.cert_number + ' מסיגמאטק עבור ' + ((c.customer || {}).name || c.kibbutz) +
      ' מתאריך ' + certFmtDate(c.cert_date) + '.\nלצפייה והדפסה: ' + certViewUrl(c.id);
  }
  // Legacy mirror of app/src/lib/certSend.ts `certSendPlan` — held in lockstep by
  // test-delivery-cert.mjs. Decides who can be emailed, who is ticked, and whether the panel
  // has to offer "הוסף איש קשר" instead of a dead end (QA round 2 · C7).
  function certIsEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v == null ? '' : v).trim()); }
  function certWaNumber(v) { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length >= 9 ? d : ''; }
  function certSendPlan(contacts) {
    const rows = (contacts || []).filter(function (c) { return !!c && c.active !== false; });
    const emailable = rows.filter(function (c) { return certIsEmail(c.email); });
    return {
      emailable: emailable,
      selected: emailable.map(function (c) { return String(c.email).trim(); }),
      canEmail: emailable.length > 0,
      needsContact: emailable.length === 0,
      whatsapp: rows.filter(function (c) { return !!certWaNumber(c.phone); })
    };
  }
  window.certSendPlan = certSendPlan;

  /**
   * 📤 THE send helper. Package E (the מלאי → תעודות משלוח tab) calls exactly this name with a
   * cert id; the visit summary reaches it through certSendForVisit() below. One panel, one place.
   */
  async function certSendOpen(certId) {
    const c = _certRows.find(x => x.id === certId);
    if (!c) return;
    let bd = document.getElementById('certSendModal');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'modal-backdrop';
      bd.id = 'certSendModal';
      bd.onclick = e => { if (e.target.id === 'certSendModal') bd.classList.remove('open'); };
      document.body.appendChild(bd);
    }
    bd.innerHTML = '<div class="modal" onclick="event.stopPropagation()" style="max-width:520px;"><h3>📤 שליחת תעודה ' + c.cert_number + '</h3><div style="padding:14px;color:#94a3b8;">⏳ טוען אנשי קשר…</div></div>';
    bd.classList.add('open');
    let contacts = [];
    try {
      if (typeof window._sbCertGet !== 'function') throw new Error('אין חיבור כרגע. בדוק רשת ונסה שוב');
      contacts = await window._sbCertGet('site_contacts?select=*&active=eq.true&kibbutz=eq.' + encodeURIComponent(c.kibbutz) + '&order=role,name');
    } catch (e) { /* table missing / anon (viewer) / offline → the inline add-contact row */ }
    const plan = certSendPlan(contacts);
    const text = certShareText(c);
    const rows = plan.emailable.map((p, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid #f1f5f9;">
        <input type="checkbox" class="cert-send-chk" data-i="${i}" checked style="min-width:22px;min-height:22px;">
        <div style="flex:1;font-size:13px;">${certEsc(p.name)} <span style="color:#64748b;font-size:11px;">· ${CERT_ROLE_HE[p.role] || certEsc(p.role)}</span>
          <div style="font-size:11px;color:#94a3b8;direction:ltr;text-align:right;">${certEsc(p.email || '—')}</div></div>
        ${certWaNumber(p.phone) ? `<a href="https://wa.me/${certWaNumber(p.phone)}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" class="inv-btn small" style="background:#16a34a;text-decoration:none;min-height:40px;display:inline-flex;align-items:center;">💬</a>` : ''}
      </div>`).join('');
    // The panel's context is the EMAILABLE list, so `data-i` and certEmailSelected() agree.
    window._certSendCtx = { contacts: plan.emailable, cert: c, text: text, plan: plan };
    // C7: nobody to email is not a dead end — the technician adds the contact right here and the
    // row is saved to site_contacts, so the next certificate for this kibbutz already has it.
    const addForm = `
      <details ${plan.needsContact ? 'open' : ''} style="margin-top:6px;border:1px solid #e2e8f0;border-radius:8px;">
        <summary style="cursor:pointer;padding:8px 10px;font-weight:700;font-size:13px;">➕ הוסף איש קשר</summary>
        <div style="padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px;">
          <input id="certNewContactName" class="sig-fi" placeholder="שם איש הקשר" style="min-height:40px;">
          <input id="certNewContactEmail" class="sig-fi" type="email" inputmode="email" placeholder="כתובת מייל" style="min-height:40px;direction:ltr;text-align:right;">
          <button type="button" class="btn btn-secondary" onclick="certAddContact(this)" style="min-height:40px;">שמור ושלח אליו</button>
        </div>
      </details>`;
    bd.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()" style="max-width:520px;">
        <h3>📤 שליחת תעודה ${c.cert_number}: ${certEsc(c.kibbutz)}</h3>
        <div class="modal-sub">הנמען מקבל קישור צפייה. התעודה נפתחת אצלו בדיוק כפי שהופקה, עם כפתור הדפסה/PDF.</div>
        <div style="max-height:38vh;overflow-y:auto;">${rows}${addForm}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('certSendModal').classList.remove('open')">סגור</button>
          <button class="btn btn-secondary" onclick="certCopyLink()">🔗 העתק קישור</button>
          ${plan.canEmail ? '<button class="btn btn-primary" onclick="certEmailSelected()">📧 מייל לנבחרים</button>' : ''}
        </div>
      </div>`;
    bd.classList.add('open');
  }

  /** The inline "➕ הוסף איש קשר": stored on the site, then the certificate goes out to him. */
  window.certAddContact = function (btn) {
    const ctx = window._certSendCtx; if (!ctx) return;
    const name = (document.getElementById('certNewContactName') || {}).value || '';
    const email = (document.getElementById('certNewContactEmail') || {}).value || '';
    if (!name.trim()) { alert('חסר שם איש הקשר.'); return; }
    if (!certIsEmail(email)) { alert('כתובת המייל לא נראית תקינה.'); return; }
    const row = { kibbutz: ctx.cert.kibbutz, name: name.trim(), email: email.trim(), active: true };
    const done = function () {
      // Send even if the row did not persist: the certificate is in his hand either way.
      location.href = 'mailto:' + row.email + '?subject=' + encodeURIComponent('תעודת משלוח ' + ctx.cert.cert_number + ': סיגמאטק התייעלות אנרגטית') + '&body=' + encodeURIComponent(ctx.text);
    };
    const tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : null;
    if (!tok || typeof SB_URL === 'undefined') { done(); return; }
    if (typeof setBtnLoading === 'function') setBtnLoading(btn, true);
    fetch(SB_URL + '/rest/v1/site_contacts', {
      method: 'POST', headers: { apikey: SB_ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    }).catch(function () { /* the send still happens */ })
      .finally(function () { if (typeof setBtnLoading === 'function') setBtnLoading(btn, false); done(); });
  };

  /** The visit summary's two buttons — both resolve the visit's ACTIVE certificate first. */
  function certRowForVisit(visitId) {
    if (!visitId) return null;
    return _certRows.find(x => x.ref_id === visitId && x.status !== 'cancelled') || null;
  }
  function certSendForVisit(visitId) {
    const r = certRowForVisit(visitId);
    if (!r) { alert('התעודה עדיין לא נרשמה. נסה שוב בעוד רגע.'); return; }
    certSendOpen(r.id);
  }
  function certDownloadForVisit(visitId) {
    const r = certRowForVisit(visitId);
    if (!r) { alert('התעודה עדיין לא נרשמה. נסה שוב בעוד רגע.'); return; }
    certView(r.id);
  }
  window.certRowForVisit = certRowForVisit;
  window.certSendForVisit = certSendForVisit;
  window.certDownloadForVisit = certDownloadForVisit;

  window.certSendOpen = certSendOpen;
  window.certCopyLink = function () {
    const ctx = window._certSendCtx; if (!ctx) return;
    const doToast = ok => { const t = document.getElementById('toast'); if (t) { t.textContent = ok ? '🔗 הקישור הועתק' : 'העתקה נכשלה. העתק ידנית: ' + certViewUrl(ctx.cert.id); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); } };
    try { navigator.clipboard.writeText(certViewUrl(ctx.cert.id)).then(() => doToast(true), () => doToast(false)); } catch (e) { doToast(false); }
  };
  window.certEmailSelected = function () {
    const ctx = window._certSendCtx; if (!ctx) return;
    const to = [...document.querySelectorAll('#certSendModal .cert-send-chk:checked')]
      .map(chk => (ctx.contacts[parseInt(chk.dataset.i)] || {}).email).filter(Boolean);
    if (!to.length) { alert('בחר לפחות איש קשר אחד עם מייל.'); return; }
    const subject = 'תעודת משלוח ' + ctx.cert.cert_number + ': סיגמאטק התייעלות אנרגטית';
    location.href = 'mailto:' + to.join(',') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(ctx.text);
  };

  // ---- 🧾 issued-certs management (מלאי → תעודות משלוח) ----
  // (_certRows moved to js/src/00-consts.js — reached from an earlier file at boot)

  function certSetRange(range) {
    const today = new Date();
    const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let from = '', to = '';
    if (range === 'thisMonth') {
      from = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
      to   = fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (range === 'lastMonth') {
      from = fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      to   = fmt(new Date(today.getFullYear(), today.getMonth(), 0));
    } else if (range === 'last7') {
      const start = new Date(today); start.setDate(start.getDate() - 6);
      from = fmt(start); to = fmt(today);
    } else if (range === 'last30') {
      const start = new Date(today); start.setDate(start.getDate() - 29);
      from = fmt(start); to = fmt(today);
    } else if (range === 'all') {
      from = '2000-01-01'; to = '2099-01-01';   // explicit — invRenderCerts defaults an EMPTY from to current month
    }
    document.getElementById('invCertsFrom').value = from;
    document.getElementById('invCertsTo').value = to;
    document.querySelectorAll('#inv-section-certs .btn-quick-date').forEach(b => b.classList.remove('active'));
    const active = document.querySelector('#inv-section-certs .btn-quick-date[data-range="' + range + '"]');
    if (active) active.classList.add('active');
    invRenderCerts(true);
  }
  window.certSetRange = certSetRange;

  // Chip matrix (sig-tile/sig-grid, round-2 item E2): single-select, "הכל" is the fallback —
  // tapping the already-active chip deselects it and returns to "הכל" instead of leaving no filter.
  // uses window._certRangeInited so this file also works when evaluated in isolation (tests)
  function certRangeTap(range) {
    const active = document.querySelector('#inv-section-certs .btn-quick-date[data-range="' + range + '"]');
    window._certRangeInited = true;
    if (range !== 'all' && active && active.classList.contains('active')) { certSetRange('all'); return; }
    certSetRange(range);
  }
  window.certRangeTap = certRangeTap;

  async function invRenderCerts(force) {
    const root = document.getElementById('invCertsList');
    const section = document.getElementById('inv-section-certs');
    if (!root || !section) return;
    if (!section.classList.contains('active') && !force) return;   // don't hit Supabase for a hidden tab
    if (typeof window._sbCertGet !== 'function') { root.innerHTML = '<div style="padding:16px;color:#94a3b8;">לא זמין במצב הדגמה</div>'; return; }
    const fromEl = document.getElementById('invCertsFrom');
    // first-ever render, nothing picked yet → the "הכל" chip is already shown active in the
    // markup; make the actual query match it instead of silently defaulting to the current month.
    if (!fromEl.value && !document.getElementById('invCertsTo').value && !window._certRangeInited) {
      window._certRangeInited = true;
      certSetRange('all');
      return;
    }
    if (!fromEl.value) { const d = new Date(); fromEl.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }   // default: current month
    const from = fromEl.value || '2000-01-01';
    const to = document.getElementById('invCertsTo').value || '2099-12-31';
    const fetchKey = from + '|' + to;
    // renderInventory() is also called on every 15s home-data poll and on every window resize
    // crossing the mobile/desktop breakpoint, so this ran (and repainted the whole table, losing
    // scroll position) on a timer even when nothing changed ("רענונים כל הזמן" — item P1). Only
    // show the loading placeholder / wipe the DOM on a first load or an actual filter change;
    // a background refetch that comes back identical to what's on screen is a silent no-op below.
    // kept on window (not a module-local) so an isolated eval of this file — e.g. the vitest/tap
    // harness that loads only this module's source — never throws a ReferenceError on first read.
    const isFreshQuery = fetchKey !== window._certsFetchKey;
    if (isFreshQuery) root.innerHTML = '<div style="padding:16px;color:#94a3b8;">⏳ טוען תעודות…</div>';
    let fetched;
    try {
      fetched = await window._sbCertGet('delivery_certs?select=*&cert_date=gte.' + from + '&cert_date=lte.' + to + '&order=cert_number.desc');
    } catch (e) { root.innerHTML = '<div style="padding:16px;color:#dc2626;">שגיאה בטעינה: ' + certEsc(e.message) + '</div>'; return; }
    const fetchedJSON = JSON.stringify(fetched);
    const searchVal = (document.getElementById('invCertsSearch').value || '').trim();
    // data + filters unchanged since the last paint → skip the repaint entirely (render once per
    // data change, per spec). A force call (range/search change, cert action) always repaints.
    if (!force && !isFreshQuery && fetchedJSON === window._certsRawJSON && root.dataset.certsSearch === searchVal) {
      return;
    }
    window._certsRawJSON = fetchedJSON;
    window._certsFetchKey = fetchKey;
    _certRows = fetched;
    root.dataset.certsSearch = searchVal;
    const q = searchVal;
    const rows = q ? _certRows.filter(c => (c.kibbutz || '').includes(q) || ((c.customer || {}).name || '').includes(q) || String(c.cert_number).includes(q)) : _certRows;
    const srcLabel = { visit: '📍 ביקור', order: '🧾 הזמנה', ems: '🔧 משימת EMS', manual: '✍️ ידני' };
    const vw = typeof isViewer === 'function' && isViewer();
    const nb = document.getElementById('invCertsNew'); if (nb) nb.style.display = vw ? 'none' : '';
    if (!rows.length) { root.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;">אין תעודות בטווח/בחיפוש</div>'; return; }
    root.innerHTML = '<div class="scroll-x"><table class="inv-table"><thead><tr><th>מס\'</th><th>תאריך</th><th>לקוח</th><th>פריטים</th><th>מקור</th><th>הופק ע"י</th><th>חתימה</th><th style="text-align:left;">פעולות</th></tr></thead><tbody>' +
      rows.map(c => {
        const cancelled = c.status === 'cancelled';
        const idArg = certEsc(String(c.id)).replace(/'/g, '');
        return `<tr${cancelled ? ' style="opacity:.55;"' : ''}>
        <td data-label="מס'" style="font-weight:700;">${cancelled ? '<s>' + c.cert_number + '</s><div style="font-size:10px;color:#dc2626;white-space:nowrap;">🚫 מבוטלת' + (c.replaced_by ? ' → ' + c.replaced_by : '') + '</div>' : c.cert_number + '<div style="font-size:10px;color:#059669;white-space:nowrap;">✅ נופקה</div>'}</td>
        <td data-label="תאריך" style="white-space:nowrap;">${certFmtDate(c.cert_date)}</td>
        <td data-label="לקוח">${certEsc(((c.customer || {}).name) || c.kibbutz)}</td>
        <td data-label="פריטים" style="font-size:11px;">${(c.items || []).map(i => certEsc(i.name) + ' ×' + i.qty).join('<br>')}</td>
        <td data-label="מקור" style="white-space:nowrap;">${srcLabel[c.source] || certEsc(c.source)}</td>
        <td data-label="הופק ע&quot;י">${certEsc(c.created_by)}</td>
        <td data-label="חתימה">${c.signature ? '✅ ' + certEsc(c.recipient || '') : '—'}</td>
        <td class="actions-cell" style="white-space:nowrap;text-align:left;">
          <button class="inv-btn small" onclick="certView('${idArg}')" title="תצוגה מקדימה, בלי להוריד; הדפסה מתוך התצוגה">👁 הצג</button>
          ${c.drive_url ? `<a class="inv-btn small" style="background:#f59e0b;text-decoration:none;display:inline-block;" href="${certEsc(c.drive_url)}" target="_blank" rel="noopener" title="עותק ה-PDF בדרייב">📁</a>` : ''}
          ${vw ? '' : `<button class="inv-btn small" style="background:#16a34a;" onclick="certSendOpen('${idArg}')" title="שליחה במייל / וואטסאפ לאנשי הקשר של האתר">📤</button>`}
          ${(!vw && (typeof window.certSendOpen === 'function' || typeof window.certSendByEmail === 'function')) ? `<button class="inv-btn small" style="background:#0369a1;" onclick="(typeof window.certSendOpen === 'function' ? window.certSendOpen : window.certSendByEmail)('${idArg}')" title="שליחה מהירה במייל לאיש הקשר האחרון">✉️</button>` : ''}
          ${(cancelled || vw) ? '' : `<button class="inv-btn small" style="background:#0e7490;" onclick="certReissue('${idArg}')" title="פתח לעריכה, הפק תעודה חדשה ובטל את זו אוטומטית">📝 הפק מתוקנת</button>
          <button class="inv-btn small" style="background:#dc2626;" onclick="certCancel('${idArg}', this)">🚫 בטל</button>`}
        </td>
      </tr>`; }).join('') + '</tbody></table></div>' +
      `<div style="font-size:11px;color:#64748b;margin-top:6px;">${rows.length} תעודות · ${rows.filter(c => c.status !== 'cancelled').length} פעילות</div>`;
  }
  window.invRenderCerts = invRenderCerts;

  // Reprint an ISSUED cert — renders the stored snapshot exactly (incl. signature); no new number.
  // A cancelled cert prints with a מבוטלת watermark + the replacing cert's number.
  function certReprint(id) {
    const c = _certRows.find(x => x.id === id);
    if (!c) return;
    const w = window.open('', '_blank');
    if (!w) { alert('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים לאתר.'); return; }
    w.document.write(certDocHtml({
      number: c.cert_number, date: c.cert_date, kibbutz: c.kibbutz,
      customer: c.customer || {}, items: c.items || [], notes: c.notes || '',
      source: c.source, refId: c.ref_id, recipient: c.recipient || '', signature: c.signature || '',
      cancelled: c.status === 'cancelled', replacedBy: c.replaced_by || 0
    }));
    w.document.close();
  }
  window.certReprint = certReprint;

  // Correction flow: open the stored cert for editing → issuing the new one auto-cancels this one.
  function certReissue(id) {
    const c = _certRows.find(x => x.id === id);
    if (!c) return;
    openDeliveryCert({
      kibbutz: c.kibbutz, date: certToday(), customer: c.customer || {},
      items: (c.items || []).map(i => ({ name: i.name, qty: i.qty })),
      notes: c.notes || '', source: c.source, refId: c.ref_id,
      reissueOf: { id: c.id, certNumber: c.cert_number }
    });
  }
  window.certReissue = certReissue;

  // Manual cancel (no replacement) — e.g. a delivery that never happened.
  // F12: cancelling a certificate writes to the sheet — the בטל button is the pending
  // state, and the failure is a Sonner error with נסה שוב instead of a blocking alert (F20).
  function certCancel(id, btn) {
    const c = _certRows.find(x => x.id === id);
    if (!c) return;
    if (!confirm('לבטל את תעודת משלוח ' + c.cert_number + '?\nהתעודה תישאר ברישום כמבוטלת (לא נמחקת) ולא תיספר בדוחות.')) return;
    return runOnce(btn, 'מבטל…', async function () {
      try {
        await fetch(WRITE_ROUTER_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'deliveryCertCancel', id: c.id }) });
        if (c.ref_id && window._certIssuedFor && window._certIssuedFor[c.ref_id]) delete window._certIssuedFor[c.ref_id];
        invRenderCerts(true);
      } catch (e) { sigmaError('שגיאה בביטול: ' + e.message, function () { certCancel(id, btn); }); }
    });
  }
  window.certCancel = certCancel;

  // ---- prefill helpers (the trigger points) ----
  // certFromVisitForm (the legacy visit form's own trigger) removed, round 5 V-U3 — the form
  // is gone; the chapters sheet (Field.tsx) opens the cert screen through openDeliveryCert
  // itself.

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
