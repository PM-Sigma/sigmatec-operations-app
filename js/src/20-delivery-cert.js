  // ===========================================================
  // DELIVERY CERTIFICATE (תעודת משלוח) — brand-styled, price-less, editable before issue.
  // Flow: any trigger (visit form / saved visit / EMS task / customer order / report picker)
  //   → openDeliveryCert(prefill)  = editable preview modal (fix anything before issuing)
  //   → issueDeliveryCert()        = persist to Supabase delivery_certs (running number, from 1001)
  //   → print window               = browser-native "save as PDF" (RTL-safe, zero PDF libs).
  // Issued certs are immutable; accounting pulls certRangeReport() monthly, grouped by kibbutz.
  // Customer block details come from Supabase kibbutz_details (seeded from the EMS sites table);
  // until seeded, the fields are editable blanks — nothing blocks.
  // ===========================================================

  // session cache: visit refId → issued cert number (fast path before certIssuedForVisit's DB round-trip)
  window._certIssuedFor = window._certIssuedFor || {};

  const CERT_COMPANY = {
    name: 'סיגמאטק התייעלות אנרגטית בע"מ',
    sub: 'מיקרוגריד - מערכות מניית חשמל',
    reg: 'עוסק מורשה/ח.פ.: 515923084',
    address: 'עמק איילון 30, גבעת זאב 9093030, ישראל',
    email: 'office@sigmatec-energy.com',
    web: 'www.sigmatec-energy.com'
  };

  function certEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function certToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function certFmtDate(ymd) { if (!ymd) return '—'; const d = new Date(ymd + 'T12:00:00'); return isNaN(d) ? certEsc(ymd) : d.toLocaleDateString('he-IL'); }

  // kibbutz_details cache — one fetch per session; {} when unavailable (sb=0 / table not created yet)
  let _certDetails = null;
  async function certKibbutzDetails() {
    if (_certDetails) return _certDetails;
    _certDetails = {};
    try {
      if (typeof window._sbCertGet === 'function') {
        (await window._sbCertGet('kibbutz_details?select=*')).forEach(r => { _certDetails[r.kibbutz] = r; });
      }
    } catch (e) { console.warn('kibbutz_details load failed', e); }
    return _certDetails;
  }

  // ---- editable preview modal (injected once) ----
  function certEnsureModal() {
    if (document.getElementById('certModal')) return;
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.id = 'certModal';
    bd.onclick = e => { if (e.target.id === 'certModal') bd.classList.remove('open'); };
    bd.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()" style="max-width:560px;">
        <h3>🚚 תעודת משלוח</h3>
        <div class="modal-sub">בדוק וערוך את הפרטים לפני ההפקה — התעודה מקבלת מספר רץ ונשמרת.</div>
        <div class="cert-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;">
          <div><label for="certCustName">🧑‍🌾 לקוח:</label><input type="text" id="certCustName"></div>
          <div><label for="certCustCompanyId">🆔 ח.פ./ע.מ.:</label><input type="text" id="certCustCompanyId" placeholder="—"></div>
          <div><label for="certCustAddress">📍 כתובת:</label><input type="text" id="certCustAddress" placeholder="—"></div>
          <div><label for="certCustContact">🤝 איש קשר:</label><input type="text" id="certCustContact" placeholder="—"></div>
        </div>
        <label for="certDate">📅 תאריך:</label><input type="date" id="certDate">
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0 2px;">
          <button type="button" class="btn btn-secondary" style="padding:9px 14px;font-size:13px;min-height:40px;" onclick="certSignOpen()">✍️ חתימת מקבל במקום</button>
          <span id="certSigStatus" style="font-size:11px;color:#64748b;"></span>
        </div>
        <label>📦 פריטים (ללא מחירים):</label>
        <div id="certItems"></div>
        <button type="button" class="btn btn-secondary" style="padding:8px 14px;font-size:13px;margin-top:4px;min-height:40px;" onclick="certAddItemRow('',1)">+ הוסף פריט</button>
        <datalist id="certProductList"></datalist>
        <label for="certNotes">📝 הערות:</label>
        <textarea id="certNotes" rows="2" placeholder="למשל: לא לחיוב"></textarea>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('certModal').classList.remove('open')">ביטול</button>
          <button class="btn btn-secondary" onclick="certPreviewDraft()" title="בדיוק מה שיופק — לפני הקצאת מספר">👁 תצוגה מקדימה</button>
          <button class="btn btn-primary" onclick="issueDeliveryCert(this)">🖨️ הפק תעודה (PDF)</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
  }

  function certAddItemRow(name, qty) {
    const wrap = document.getElementById('certItems');
    const row = document.createElement('div');
    row.className = 'cert-item-row';
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;';
    row.innerHTML = `
      <input type="text" class="cert-item-name" list="certProductList" placeholder="פריט" value="${certEsc(name)}" style="flex:1;min-height:40px;">
      <input type="number" class="cert-item-qty" min="1" step="1" value="${parseInt(qty) || 1}" style="width:70px;min-height:40px;">
      <button type="button" onclick="this.parentNode.remove()" title="הסר פריט" style="background:none;border:none;color:#dc2626;font-size:18px;cursor:pointer;min-width:40px;min-height:40px;">✕</button>`;
    wrap.appendChild(row);
  }
  window.certAddItemRow = certAddItemRow;

  // On-the-spot recipient signature: the technician hands over the phone, the recipient types
  // their name + signs on the canvas → embedded in the PDF and persisted with the cert.
  let _certSig = { name: '', data: '' };
  function certSigStatusPaint() {
    const el = document.getElementById('certSigStatus');
    if (!el) return;
    el.innerHTML = _certSig.data
      ? '✅ נחתם' + (_certSig.name ? ' ע"י ' + certEsc(_certSig.name) : '') + ' <button type="button" onclick="certSignReset()" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:12px;text-decoration:underline;min-height:36px;padding:6px 8px;">הסר</button>'
      : 'לא נחתם — יודפס קו ריק לחתימה ידנית';
  }
  window.certSignReset = function () { _certSig = { name: '', data: '' }; certSigStatusPaint(); };

  function certSignOpen() {
    let bd = document.getElementById('certSignModal');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'modal-backdrop';
      bd.id = 'certSignModal';
      bd.innerHTML = `
        <div class="modal" onclick="event.stopPropagation()" style="max-width:520px;">
          <h3>✍️ אישור קבלה וחתימה</h3>
          <div class="modal-sub">מסור את המכשיר למקבל: שם מלא + חתימה באצבע בתוך המסגרת.</div>
          <label for="certSignName">👤 שם המקבל:</label>
          <input type="text" id="certSignName" placeholder="שם מלא">
          <label>✍️ חתימה:</label>
          <!-- print-ok: a signature pad is PAPER — ink on white, like the certificate it goes on -->
          <canvas id="certSignCanvas" style="width:100%;height:180px;border:2px dashed #94a3b8;border-radius:10px;background:#fff;touch-action:none;display:block;"></canvas>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="document.getElementById('certSignModal').classList.remove('open')">ביטול</button>
            <button class="btn btn-secondary" onclick="certSignClear()">🧹 נקה</button>
            <button class="btn btn-primary" onclick="certSignConfirm()">✅ אשר חתימה</button>
          </div>
        </div>`;
      document.body.appendChild(bd);
    }
    document.getElementById('certSignName').value = _certSig.name || document.getElementById('certCustContact').value || '';
    bd.classList.add('open');
    // (re)bind the canvas at the size it's actually displayed at (DPR-scaled for crisp strokes)
    const cv = document.getElementById('certSignCanvas');
    setTimeout(() => {
      const dpr = window.devicePixelRatio || 1;
      const r = cv.getBoundingClientRect();
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2a4a';
      cv._hasInk = false;
      if (cv._bound) return; cv._bound = true;
      let drawing = false;
      const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
      cv.addEventListener('pointerdown', e => { drawing = true; cv._hasInk = true; const [x, y] = pos(e); const c = cv.getContext('2d'); c.beginPath(); c.moveTo(x, y); try { cv.setPointerCapture(e.pointerId); } catch (e2) {} });
      cv.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = pos(e); const c = cv.getContext('2d'); c.lineTo(x, y); c.stroke(); });
      const up = () => { drawing = false; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    }, 60);
  }
  window.certSignOpen = certSignOpen;
  window.certSignClear = function () {
    const cv = document.getElementById('certSignCanvas');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    cv._hasInk = false;
  };
  window.certSignConfirm = function () {
    const cv = document.getElementById('certSignCanvas');
    if (!cv._hasInk) { alert('חסרה חתימה — יש לחתום בתוך המסגרת.'); return; }
    _certSig = { name: document.getElementById('certSignName').value.trim(), data: cv.toDataURL('image/png') };
    document.getElementById('certSignModal').classList.remove('open');
    certSigStatusPaint();
  };

  // pre = {kibbutz, date, items:[{name,qty}], contact, notes, source, refId, customer?, reissueOf?}
  // customer  — full stored block (reissue path: overrides the kibbutz_details lookup)
  // reissueOf — {id, certNumber} of the cert being corrected; on successful issue the old one is auto-cancelled
  // (_certReissueOf moved to js/src/00-consts.js — reached from an earlier file at boot)
  async function openDeliveryCert(pre) {
    pre = pre || {};
    certEnsureModal();
    _certSig = { name: '', data: '' };   // a new cert starts unsigned
    _certReissueOf = pre.reissueOf || null;
    certSigStatusPaint();
    const det = pre.customer
      ? { legal_name: pre.customer.name, company_id: pre.customer.company_id, address: pre.customer.address, contact: pre.customer.contact }
      : ((await certKibbutzDetails())[pre.kibbutz] || {});
    document.getElementById('certCustName').value = det.legal_name || pre.kibbutz || '';
    document.getElementById('certCustCompanyId').value = det.company_id || '';
    document.getElementById('certCustAddress').value = det.address || pre.kibbutz || '';   // no address in EMS → the site name is the delivery address
    document.getElementById('certCustContact').value = pre.contact || det.contact || '';
    document.getElementById('certDate').value = pre.date || certToday();
    document.getElementById('certNotes').value = pre.notes || '';
    const cat = ((window.SHEET_DATA && window.SHEET_DATA.products) || []).filter(p => p.active !== false).map(p => p.name);
    document.getElementById('certProductList').innerHTML = (cat.length ? cat : (typeof PRODUCT_LIST !== 'undefined' ? PRODUCT_LIST : [])).map(n => '<option value="' + certEsc(n) + '">').join('');
    document.getElementById('certItems').innerHTML = '';
    const items = (pre.items || []).filter(i => i && i.name);
    if (items.length) items.forEach(i => certAddItemRow(i.name, i.qty)); else certAddItemRow('', 1);
    const modal = document.getElementById('certModal');
    modal.dataset.kibbutz = pre.kibbutz || '';
    modal.dataset.source = pre.source || 'manual';
    modal.dataset.refId = pre.refId || '';
    // QA round 2 · C7: the visit-summary flow issues WITHOUT printing — the certificate lands in
    // the in-app overlay with שלח / הורד beside it. The manual and EMS paths keep the print
    // window they have always had.
    modal.dataset.noPrint = pre.noPrint ? '1' : '';
    modal.classList.add('open');
  }
  window.openDeliveryCert = openDeliveryCert;

  function certCollect() {
    const modal = document.getElementById('certModal');
    const items = [];
    modal.querySelectorAll('.cert-item-row').forEach(r => {
      const name = r.querySelector('.cert-item-name').value.trim();
      const qty = parseInt(r.querySelector('.cert-item-qty').value) || 0;
      if (name && qty > 0) items.push({ name: name, qty: qty });
    });
    return {
      kibbutz: modal.dataset.kibbutz || document.getElementById('certCustName').value.trim(),
      date: document.getElementById('certDate').value || certToday(),
      customer: {
        name: document.getElementById('certCustName').value.trim(),
        company_id: document.getElementById('certCustCompanyId').value.trim(),
        address: document.getElementById('certCustAddress').value.trim(),
        contact: document.getElementById('certCustContact').value.trim()
      },
      items: items,
      notes: document.getElementById('certNotes').value.trim(),
      source: modal.dataset.source || 'manual',
      refId: modal.dataset.refId || '',
      recipient: _certSig.name || '',
      signature: _certSig.data || ''
    };
  }

  async function issueDeliveryCert(btn) {
    // viewer = reports only; issuing consumes a cert number (a write) — blocked (the range report stays open to them)
    if (typeof isViewer === 'function' && isViewer()) { alert('👁 משתמש צפייה — הפקת תעודות חדשות חסומה. דוח תעודות המשלוח זמין ממסך דוח הביקורים.'); return; }
    const cert = certCollect();
    if (!cert.items.length) { alert('אין פריטים בתעודה — הוסף לפחות פריט אחד.'); return; }
    if (!cert.customer.name) { alert('חסר שם לקוח.'); return; }
    // open the window SYNCHRONOUSLY on the click (popup blockers), fill after the number arrives.
    // C7: not in the visit flow — there the certificate opens in the in-app overlay instead.
    const noPrint = document.getElementById('certModal').dataset.noPrint === '1';
    const w = noPrint ? null : window.open('', '_blank');
    if (!noPrint && !w) { alert('הדפדפן חסם את חלון ההדפסה — אפשר חלונות קופצים לאתר.'); return; }
    if (w) w.document.write('<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding-top:40vh;">⏳ מפיק תעודה…</body></html>');
    if (typeof setBtnLoading === 'function') setBtnLoading(btn, true);
    try {
      cert.number = null; cert.id = null;
      try {
        const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'deliveryCert', cert: cert, createdBy: (typeof getCurrentUser === 'function' && getCurrentUser()) || '' }) });
        const res = await r.json();
        if (res && res.ok) { cert.number = res.certNumber; cert.id = res.id || null; }
      } catch (e) { console.warn('cert persist failed — issuing as draft', e); }
      if (cert.number && cert.source === 'visit' && cert.refId) {
        window._certIssuedFor[cert.refId] = cert.number;
        try { if (typeof paintVisitCertStatus === 'function') paintVisitCertStatus(); } catch (e) {}
      }
      // Drive-archive ETL: store the frozen printable snapshot (needs the assigned number, so it's a
      // follow-up PATCH). Best-effort — before db/delivery_certs_drive.sql runs this 400s silently
      // and the cert simply isn't archived; everything else works.
      if (cert.id && cert.number) {
        try {
          await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ type: 'deliveryCertDoc', id: cert.id, docHtml: certDocHtml(cert) }) });
        } catch (e) { console.warn('cert snapshot for Drive archive failed (non-blocking)', e); }
      }
      if (w) {
        w.document.open();
        w.document.write(certDocHtml(cert));
        w.document.close();
      } else {
        // no printing: the technician reads it on the phone and sends it from there.
        try { certOverlayShow(certDocHtml(cert, { screen: true }), cert.id || null, ''); } catch (e) { console.warn('cert overlay', e); }
      }
      // correction flow: the new cert is issued → auto-cancel the one it replaces (best-effort;
      // if the cancel fails the old cert stays active and can be cancelled from the certs tab)
      let cancelledOld = 0;
      if (cert.number && _certReissueOf) {
        const prevRow = _certRows.find(x => x.id === _certReissueOf.id);
        try {
          await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ type: 'deliveryCertCancel', id: _certReissueOf.id, replacedBy: cert.number }) });
          cancelledOld = _certReissueOf.certNumber;
          // the new cert may target the same visit and already re-populated the map above —
          // only drop the cache entry if it still holds the OLD cert number.
          if (prevRow && prevRow.ref_id && window._certIssuedFor[prevRow.ref_id] === prevRow.cert_number) delete window._certIssuedFor[prevRow.ref_id];
        } catch (e) { console.warn('cancel of replaced cert failed', e); }
      }
      _certReissueOf = null;
      // cert born from an EMS task → drop a comment on the task (live or queued; file attach isn't
      // supported by the EMS API, so the comment carries the public view link instead)
      if (cert.number && cert.source === 'ems' && cert.refId && typeof emsWriteOrQueue === 'function') {
        try {
          emsWriteOrQueue({ kind: 'comment', taskId: cert.refId,
            message: '🚚 הופקה תעודת משלוח מס\' ' + cert.number + (cert.recipient ? ' · נחתמה ע"י ' + cert.recipient : '') + (cert.id ? '\nלצפייה: ' + certViewUrl(cert.id) : '') });
        } catch (e) { console.warn('EMS cert comment failed', e); }
      }
      // make the fresh cert immediately viewable/sendable (before the registry re-fetches)
      if (cert.id) {
        _certRows.unshift({ id: cert.id, cert_number: cert.number, cert_date: cert.date, kibbutz: cert.kibbutz,
          customer: cert.customer, items: cert.items, notes: cert.notes, source: cert.source, ref_id: cert.refId,
          created_by: (typeof getCurrentUser === 'function' && getCurrentUser()) || '', recipient: cert.recipient || '', signature: cert.signature || '', status: 'active', replaced_by: 0 });
      }
      if (cert.number && typeof sigmaTrack === 'function') sigmaTrack('cert-issued', cert.number);   // 📈 שימוש (spec §7j)
      document.getElementById('certModal').classList.remove('open');
      // natural next step in the field: send it. In the no-print flow the overlay is already up
      // with 📤 שלח on it, so a second modal on top of it would only hide the certificate.
      if (cert.id && !noPrint) { try { certSendOpen(cert.id); } catch (e) {} }
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = cert.number
          ? (cancelledOld ? ('✅ הופקה תעודה מתוקנת ' + cert.number + ' · תעודה ' + cancelledOld + ' בוטלה') : ('✅ הופקה תעודת משלוח ' + cert.number))
          : '⚠️ הופקה טיוטה ללא מספר (אין חיבור) — הפק שוב כשיש חיבור';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000);
      }
      if (typeof invRenderCerts === 'function') invRenderCerts();   // refresh the registry if its tab is open
    } finally {
      if (typeof setBtnLoading === 'function') setBtnLoading(btn, false);
    }
  }
  window.issueDeliveryCert = issueDeliveryCert;

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
  // opts.screen: no auto-print; instead a floating 🖨️ button (hidden in the actual printout via @media print).
  function certDocHtml(cert, opts) {
    const num = cert.number ? String(cert.number) : 'טיוטה';
    const rows = cert.items.map(i =>
      `<tr><td>${certEsc(i.name)}</td><td class="qty">${i.qty}</td></tr>`).join('');
    const totalQty = cert.items.reduce((s, i) => s + i.qty, 0);
    const c = cert.customer;
    return `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>תעודת משלוח ${certEsc(num)} — ${certEsc(c.name)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Assistant','Segoe UI',Arial,sans-serif; color: #1b2a4a; width: 210mm; height: 296mm; padding: 14mm 14mm 30mm; position: relative; overflow: hidden; }
  .bg { position: absolute; inset: 0; overflow: hidden; z-index: 0; }
  .circ { position: absolute; border-radius: 50%; }
  .ring { position: absolute; border-radius: 50%; background: none !important; }
  .strip { position: absolute; left: 0; right: 0; background: linear-gradient(90deg, #175860 0%, #3fb4c4 45%, #a9c938 100%); }
  .grad { background: linear-gradient(135deg, #2fb0c9 0%, #7fc93e 100%); }
  .content { position: relative; z-index: 1; }
  .logo { display: block; margin: 0 auto 4mm; width: 62mm; }
  h1 { font-size: 24px; margin: 8mm 0 1mm; }
  .computed { font-size: 11px; color: #64748b; margin-bottom: 8mm; }
  .blocks { display: flex; justify-content: space-between; gap: 10mm; font-size: 12.5px; line-height: 1.8; }
  .blocks b { font-size: 13.5px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 10mm; font-size: 13px; }
  table.items th { text-align: right; border-top: 2px solid #1b2a4a; border-bottom: 2px solid #1b2a4a; padding: 6px 4px; }
  table.items td { padding: 8px 4px; border-bottom: 1px solid #e2e8f0; }
  table.items .qty { width: 70px; text-align: center; }
  .total { display: inline-block; margin-top: 6mm; background: #8fbe3f; color: #fff; font-weight: 700; font-size: 13px; padding: 6px 16px; border-radius: 2px; }
  .notes { margin-top: 10mm; font-size: 12.5px; }
  .notes b { display: block; margin-bottom: 1mm; }
  .sig { position: absolute; bottom: 22mm; right: 14mm; left: 14mm; font-size: 13px; display: flex; gap: 18mm; }
  .sig span { border-bottom: 1px solid #1b2a4a; min-width: 45mm; display: inline-block; padding: 0 2mm 2px; }
  .foot { position: absolute; bottom: 8mm; right: 14mm; left: 14mm; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 2mm; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="bg">
    <div class="strip" style="top:0;height:3.5mm;"></div>
    <div class="strip" style="bottom:0;height:2mm;"></div>
    <div class="ring" style="width:34mm;height:34mm;border:1.4mm solid #a9c938;top:9mm;left:7mm;opacity:.55;"></div>
    <div class="circ grad" style="width:19mm;height:19mm;top:17mm;left:22mm;opacity:.92;"></div>
    <div class="circ" style="width:6.5mm;height:6.5mm;background:#175860;top:37mm;left:15mm;"></div>
    <div class="ring" style="width:11mm;height:11mm;border:1mm solid #3fb4c4;top:11mm;right:10mm;opacity:.5;"></div>
    <div class="circ grad" style="width:8mm;height:8mm;bottom:16mm;left:10mm;opacity:.8;"></div>
    <div class="ring" style="width:5.5mm;height:5.5mm;border:.8mm solid #a9c938;bottom:23mm;left:21mm;opacity:.7;"></div>
  </div>
  ${cert.cancelled ? '<div style="position:absolute;top:38%;left:0;right:0;text-align:center;transform:rotate(-16deg);font-size:58px;font-weight:900;color:rgba(220,38,38,.30);z-index:3;letter-spacing:10px;">מבוטלת</div>' : ''}
  <div class="content">
    <img class="logo" src="${CERT_LOGO}" alt="Sigmatec">
    <h1>תעודת משלוח ${certEsc(num)}</h1>
    <div class="computed">מסמך ממוחשב${cert.number ? '' : ' — טיוטה (ללא מספר)'}${cert.cancelled ? ' · <b style="color:#dc2626;">תעודה מבוטלת' + (cert.replacedBy ? ' — הוחלפה בתעודה מס\' ' + certEsc(cert.replacedBy) : '') + '</b>' : ''}</div>
    <div class="blocks">
      <div>
        שם הלקוח: <b>${certEsc(c.name)}</b><br>
        ${c.company_id ? 'ת.ז./ע.מ.: ' + certEsc(c.company_id) + '<br>' : ''}
        ${c.address ? 'כתובת: ' + certEsc(c.address) + '<br>' : ''}
        ${c.contact ? 'איש קשר: ' + certEsc(c.contact) + '<br>' : ''}
        תאריך: ${certFmtDate(cert.date)}
      </div>
      <div style="text-align:left;">
        <b>${certEsc(CERT_COMPANY.name)}</b><br>
        ${certEsc(CERT_COMPANY.sub)}<br>
        ${certEsc(CERT_COMPANY.reg)}<br>
        כתובת: ${certEsc(CERT_COMPANY.address)}<br>
        דוא"ל: ${certEsc(CERT_COMPANY.email)}<br>
        אתר: ${certEsc(CERT_COMPANY.web)}
      </div>
    </div>
    <table class="items">
      <thead><tr><th>פירוט</th><th class="qty">כמות</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total">סה"כ פריטים: ${totalQty}</div>
    ${cert.notes ? '<div class="notes"><b>הערות</b>' + certEsc(cert.notes).replace(/\n/g, '<br>') + '</div>' : ''}
  </div>
  <div class="sig">
    <div>שם המקבל: ${cert.recipient ? '<b>' + certEsc(cert.recipient) + '</b>' : '<span>&nbsp;</span>'}</div>
    <div>חתימה: ${(cert.signature && /^data:image\//.test(cert.signature)) ? '<span style="border-bottom:1px solid #1b2a4a;"><img src="' + cert.signature + '" style="height:15mm;vertical-align:bottom;"></span>' : '<span>&nbsp;</span>'}</div>
  </div>
  <div class="foot">
    <span>תעודת משלוח ${certEsc(num)} · הופקה באפליקציית התפעול של סיגמאטק${cert.refId ? ' · ' + certEsc(cert.source) + ':' + certEsc(cert.refId) : ''}</span>
    <span>© ${new Date().getFullYear()} ${certEsc(CERT_COMPANY.name)}</span>
  </div>
  ${(opts && opts.screen)
    ? '<button class="print-fab" onclick="window.print()" style="position:fixed;bottom:18px;left:18px;z-index:9;background:#1b2a4a;color:#fff;border:none;border-radius:12px;padding:14px 20px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);">🖨️ הדפס / שמור PDF</button><style>@media print { .print-fab { display:none; } }</style>'
    : '<scr' + 'ipt>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</scr' + 'ipt>'}
</body></html>`;
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
    if (!cert.items.length) { alert('אין פריטים בתעודה — הוסף לפחות פריט אחד.'); return; }
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
      if (typeof window._sbCertGet !== 'function') throw new Error('אין חיבור כרגע — בדוק רשת ונסה שוב');
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
        <h3>📤 שליחת תעודה ${c.cert_number} — ${certEsc(c.kibbutz)}</h3>
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
      location.href = 'mailto:' + row.email + '?subject=' + encodeURIComponent('תעודת משלוח ' + ctx.cert.cert_number + ' — סיגמאטק התייעלות אנרגטית') + '&body=' + encodeURIComponent(ctx.text);
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
    const doToast = ok => { const t = document.getElementById('toast'); if (t) { t.textContent = ok ? '🔗 הקישור הועתק' : 'העתקה נכשלה — העתק ידנית: ' + certViewUrl(ctx.cert.id); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); } };
    try { navigator.clipboard.writeText(certViewUrl(ctx.cert.id)).then(() => doToast(true), () => doToast(false)); } catch (e) { doToast(false); }
  };
  window.certEmailSelected = function () {
    const ctx = window._certSendCtx; if (!ctx) return;
    const to = [...document.querySelectorAll('#certSendModal .cert-send-chk:checked')]
      .map(chk => (ctx.contacts[parseInt(chk.dataset.i)] || {}).email).filter(Boolean);
    if (!to.length) { alert('בחר לפחות איש קשר אחד עם מייל.'); return; }
    const subject = 'תעודת משלוח ' + ctx.cert.cert_number + ' — סיגמאטק התייעלות אנרגטית';
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

  async function invRenderCerts(force) {
    const root = document.getElementById('invCertsList');
    const section = document.getElementById('inv-section-certs');
    if (!root || !section) return;
    if (!section.classList.contains('active') && !force) return;   // don't hit Supabase for a hidden tab
    if (typeof window._sbCertGet !== 'function') { root.innerHTML = '<div style="padding:16px;color:#94a3b8;">לא זמין במצב הדגמה</div>'; return; }
    const fromEl = document.getElementById('invCertsFrom');
    if (!fromEl.value) { const d = new Date(); fromEl.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }   // default: current month
    const from = fromEl.value || '2000-01-01';
    const to = document.getElementById('invCertsTo').value || '2099-12-31';
    root.innerHTML = '<div style="padding:16px;color:#94a3b8;">⏳ טוען תעודות…</div>';
    try {
      _certRows = await window._sbCertGet('delivery_certs?select=*&cert_date=gte.' + from + '&cert_date=lte.' + to + '&order=cert_number.desc');
    } catch (e) { root.innerHTML = '<div style="padding:16px;color:#dc2626;">שגיאה בטעינה: ' + certEsc(e.message) + '</div>'; return; }
    const q = (document.getElementById('invCertsSearch').value || '').trim();
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
          <button class="inv-btn small" onclick="certView('${idArg}')" title="תצוגה מקדימה — בלי להוריד; הדפסה מתוך התצוגה">👁 הצג</button>
          ${c.drive_url ? `<a class="inv-btn small" style="background:#f59e0b;text-decoration:none;display:inline-block;" href="${certEsc(c.drive_url)}" target="_blank" rel="noopener" title="עותק ה-PDF בדרייב">📁</a>` : ''}
          ${vw ? '' : `<button class="inv-btn small" style="background:#16a34a;" onclick="certSendOpen('${idArg}')" title="שליחה במייל / וואטסאפ לאנשי הקשר של האתר">📤</button>`}
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
    if (!w) { alert('הדפדפן חסם את חלון ההדפסה — אפשר חלונות קופצים לאתר.'); return; }
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
        await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'deliveryCertCancel', id: c.id }) });
        if (c.ref_id && window._certIssuedFor && window._certIssuedFor[c.ref_id]) delete window._certIssuedFor[c.ref_id];
        invRenderCerts(true);
      } catch (e) { sigmaError('שגיאה בביטול: ' + e.message, function () { certCancel(id, btn); }); }
    });
  }
  window.certCancel = certCancel;

  // ---- prefill helpers (the trigger points) ----

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

  // from the open EMS task (detail modal) — items parsed from the "• name ×qty" description lines
  function certFromEmsTask() {
    const t = window._emsCurrentTask;
    if (!t) return;
    const items = [];
    String(t.description || '').split('\n').forEach(line => {
      const m = line.match(/^\s*•\s*(.+?)\s*×\s*(\d+)\s*$/);
      if (m) items.push({ name: m[1], qty: parseInt(m[2]) });
    });
    openDeliveryCert({ kibbutz: (t.site && t.site.name) || '', date: certToday(), items: items, source: 'ems', refId: t.id || '' });
  }
  window.certFromEmsTask = certFromEmsTask;

  // from a customer order (orders table)
  function certFromOrder(orderId) {
    const o = ((window.SHEET_DATA && window.SHEET_DATA.orders) || []).find(x => x.id === orderId);
    if (!o) return;
    openDeliveryCert({
      kibbutz: (typeof orderKibbutz === 'function' ? orderKibbutz(o) : o.kibbutz) || '',
      date: (o.deliveredAt || '').slice(0, 10) || certToday(),
      items: (o.items || []).map(i => ({ name: i.name, qty: parseInt(i.qty) || 1 })),
      source: 'order',
      refId: o.id
    });
  }
  window.certFromOrder = certFromOrder;

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
      return d >= fromT && d <= toT && (!who || v.visitor === who) && ((v.products || []).length || v.productsOther);
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

  // ---- monthly/range report of ISSUED certs, grouped by kibbutz (for accounting) ----
  async function certRangeReport() {
    const from = document.getElementById('visitsReportFrom').value || '2000-01-01';
    const to = document.getElementById('visitsReportTo').value || certToday();
    return certRangeReportRange(from, to);
  }
  window.certRangeReport = certRangeReport;

  // Mirrors xlCertGroupName in js/src/21-excel-export.js: the PDF and the Excel of the SAME
  // report must name the customer identically (audit B · F-08).
  function certGroupName(c) {
    return (((c || {}).customer || {}).name) || (c || {}).kibbutz || '';
  }
  window.certGroupName = certGroupName;
  // A REPORT prints display names (spec §3). The single field certificate at certDocHtml
  // deliberately keeps the technical name — that is what the recipient signs for — but this
  // report was leaking it too (audit B · F-07).
  function certReportLabel(name) {
    const map = {};
    ((window.SHEET_DATA && window.SHEET_DATA.products) || []).forEach(p => { map[p.name] = p; });
    return (typeof productLabel === 'function')
      ? productLabel(map[name] || name, { forReport: true }) : name;
  }
  window.certReportLabel = certReportLabel;

  async function certRangeReportRange(from, to) {
    const w = window.open('', '_blank');
    if (!w) { alert('הדפדפן חסם את חלון ההדפסה — אפשר חלונות קופצים לאתר.'); return; }
    w.document.write('<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding-top:40vh;">⏳ טוען תעודות…</body></html>');
    let certs = [];
    try {
      if (typeof window._sbCertGet !== 'function') throw new Error('no supabase');
      certs = await window._sbCertGet('delivery_certs?select=*&cert_date=gte.' + from + '&cert_date=lte.' + to + '&order=cert_number');
    } catch (e) { w.document.body.innerHTML = 'שגיאה בטעינת התעודות: ' + certEsc(e.message); return; }
    const byK = {};
    certs.forEach(cr => { const k = certGroupName(cr) || '—'; (byK[k] = byK[k] || []).push(cr); });
    const groups = Object.keys(byK).sort((a, b) => a.localeCompare(b, 'he')).map(k => {
      const list = byK[k];
      const totals = {};
      list.filter(cr => cr.status !== 'cancelled')   // cancelled certs stay listed but never counted
        .forEach(cr => (cr.items || []).forEach(i => { totals[i.name] = (totals[i.name] || 0) + (parseInt(i.qty) || 0); }));
      const rows = list.map(cr => {
        const cancelled = cr.status === 'cancelled';
        return `<tr${cancelled ? ' style="opacity:.55;text-decoration:line-through;"' : ''}>
        <td>${cr.cert_number}${cancelled ? ' 🚫' + (cr.replaced_by ? '→' + cr.replaced_by : '') : ''}</td><td>${certFmtDate(cr.cert_date)}</td>
        <td>${(cr.items || []).map(i => certEsc(certReportLabel(i.name)) + ' ×' + i.qty).join('<br>')}</td>
        <td>${certEsc(cr.created_by)}</td><td>${certEsc(cr.notes)}</td></tr>`; }).join('');
      const totalRows = Object.keys(totals).sort((a, b) => a.localeCompare(b, 'he')).map(n => `<tr><td>${certEsc(certReportLabel(n))}</td><td class="c">${totals[n]}</td></tr>`).join('');
      return `<h2>${certEsc(k)} <small>(${list.length} תעודות)</small></h2>
        <table><thead><tr><th>מס' תעודה</th><th>תאריך</th><th>פריטים</th><th>הופק ע"י</th><th>הערות</th></tr></thead><tbody>${rows}</tbody></table>
        <table class="tot"><thead><tr><th>סה"כ לפי פריט</th><th class="c">כמות</th></tr></thead><tbody>${totalRows}</tbody></table>`;
    }).join('');
    w.document.open();
    w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>דוח תעודות משלוח ${from} — ${to}</title>
<style>
  body { font-family:'Assistant','Segoe UI',Arial,sans-serif; color:#1b2a4a; padding:14mm; font-size:12.5px; }
  h1 { font-size:20px; margin-bottom:2mm; } .sub { color:#64748b; font-size:11px; margin-bottom:8mm; }
  h2 { font-size:15px; border-bottom:2px solid #a9c938; padding-bottom:2px; margin:8mm 0 3mm; }
  h2 small { color:#64748b; font-weight:400; font-size:11px; }
  table { width:100%; border-collapse:collapse; margin-bottom:4mm; }
  th { text-align:right; background:#f1f5f9; padding:5px 6px; border-bottom:2px solid #1b2a4a; font-size:11.5px; }
  td { padding:5px 6px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  .tot { width:60%; } .c { text-align:center; width:60px; }
  img.logo { width:40mm; float:left; }
</style></head><body>
<img class="logo" src="${CERT_LOGO}">
<h1>דוח תעודות משלוח לפי קיבוץ</h1>
<div class="sub">טווח: ${certFmtDate(from)} — ${certFmtDate(to)} · ${certs.length} תעודות · הופק ${new Date().toLocaleString('he-IL')}</div>
${groups || '<div style="color:#94a3b8;">אין תעודות בטווח הזה</div>'}
<scr` + `ipt>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</scr` + `ipt>
</body></html>`);
    w.document.close();
  }
  window.certRangeReportRange = certRangeReportRange;

  // Same report as certRangeReport, but sourced from the certs-tab (מלאי → תעודות משלוח) date filters.
  function certMonthlyFromTab() {
    const fromEl = document.getElementById('invCertsFrom');
    if (!fromEl.value) { const d = new Date(); fromEl.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }   // default: current month
    const from = fromEl.value || '2000-01-01';
    const to = document.getElementById('invCertsTo').value || certToday();
    return certRangeReportRange(from, to);
  }
  window.certMonthlyFromTab = certMonthlyFromTab;
