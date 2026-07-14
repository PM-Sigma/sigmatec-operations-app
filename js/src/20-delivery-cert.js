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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;">
          <div><label for="certCustName">🧑‍🌾 לקוח:</label><input type="text" id="certCustName"></div>
          <div><label for="certCustCompanyId">🆔 ח.פ./ע.מ.:</label><input type="text" id="certCustCompanyId" placeholder="—"></div>
          <div><label for="certCustAddress">📍 כתובת:</label><input type="text" id="certCustAddress" placeholder="—"></div>
          <div><label for="certCustContact">🤝 איש קשר:</label><input type="text" id="certCustContact" placeholder="—"></div>
        </div>
        <label for="certDate">📅 תאריך:</label><input type="date" id="certDate">
        <label>📦 פריטים (ללא מחירים):</label>
        <div id="certItems"></div>
        <button type="button" class="btn btn-secondary" style="padding:4px 12px;font-size:12px;margin-top:4px;" onclick="certAddItemRow('',1)">+ הוסף פריט</button>
        <datalist id="certProductList"></datalist>
        <label for="certNotes">📝 הערות:</label>
        <textarea id="certNotes" rows="2" placeholder="למשל: לא לחיוב"></textarea>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('certModal').classList.remove('open')">ביטול</button>
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
      <input type="text" class="cert-item-name" list="certProductList" placeholder="פריט" value="${certEsc(name)}" style="flex:1;">
      <input type="number" class="cert-item-qty" min="1" step="1" value="${parseInt(qty) || 1}" style="width:70px;">
      <button type="button" onclick="this.parentNode.remove()" style="background:none;border:none;color:#dc2626;font-size:16px;cursor:pointer;">✕</button>`;
    wrap.appendChild(row);
  }
  window.certAddItemRow = certAddItemRow;

  // pre = {kibbutz, date, items:[{name,qty}], contact, notes, source, refId}
  async function openDeliveryCert(pre) {
    pre = pre || {};
    certEnsureModal();
    const det = (await certKibbutzDetails())[pre.kibbutz] || {};
    document.getElementById('certCustName').value = det.legal_name || pre.kibbutz || '';
    document.getElementById('certCustCompanyId').value = det.company_id || '';
    document.getElementById('certCustAddress').value = det.address || '';
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
      refId: modal.dataset.refId || ''
    };
  }

  async function issueDeliveryCert(btn) {
    const cert = certCollect();
    if (!cert.items.length) { alert('אין פריטים בתעודה — הוסף לפחות פריט אחד.'); return; }
    if (!cert.customer.name) { alert('חסר שם לקוח.'); return; }
    // open the window SYNCHRONOUSLY on the click (popup blockers), fill after the number arrives
    const w = window.open('', '_blank');
    if (!w) { alert('הדפדפן חסם את חלון ההדפסה — אפשר חלונות קופצים לאתר.'); return; }
    w.document.write('<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding-top:40vh;">⏳ מפיק תעודה…</body></html>');
    if (typeof setBtnLoading === 'function') setBtnLoading(btn, true);
    try {
      cert.number = null;
      try {
        const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'deliveryCert', cert: cert, createdBy: (typeof getCurrentUser === 'function' && getCurrentUser()) || '' }) });
        const res = await r.json();
        if (res && res.ok) cert.number = res.certNumber;
      } catch (e) { console.warn('cert persist failed — issuing as draft', e); }
      w.document.open();
      w.document.write(certDocHtml(cert));
      w.document.close();
      document.getElementById('certModal').classList.remove('open');
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = cert.number ? ('✅ הופקה תעודת משלוח ' + cert.number) : '⚠️ הופקה טיוטה ללא מספר (אין חיבור) — הפק שוב כשיש חיבור';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000);
      }
    } finally {
      if (typeof setBtnLoading === 'function') setBtnLoading(btn, false);
    }
  }
  window.issueDeliveryCert = issueDeliveryCert;

  // ---- the printed document (brand colors from the Sigmatec logo: lime/teal/dark-teal on navy text) ----
  function certDocHtml(cert) {
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
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1b2a4a; width: 210mm; height: 296mm; padding: 14mm 14mm 30mm; position: relative; overflow: hidden; }
  .bg { position: absolute; inset: 0; overflow: hidden; z-index: 0; }
  .circ { position: absolute; border-radius: 50%; }
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
    <div class="circ" style="width:65mm;height:65mm;background:#a9c938;top:-28mm;left:-20mm;opacity:.9;"></div>
    <div class="circ" style="width:20mm;height:20mm;background:#3fb4c4;top:14mm;left:40mm;opacity:.85;"></div>
    <div class="circ" style="width:10mm;height:10mm;background:#175860;top:30mm;left:30mm;"></div>
    <div class="circ" style="width:22mm;height:22mm;background:#175860;top:-8mm;right:-8mm;"></div>
    <div class="circ" style="width:12mm;height:12mm;background:#a9c938;bottom:-5mm;left:34mm;"></div>
    <div class="circ" style="width:8mm;height:8mm;background:#3fb4c4;bottom:3mm;right:42mm;opacity:.8;"></div>
  </div>
  <div class="content">
    <img class="logo" src="${CERT_LOGO}" alt="Sigmatec">
    <h1>תעודת משלוח ${certEsc(num)}</h1>
    <div class="computed">מסמך ממוחשב${cert.number ? '' : ' — טיוטה (ללא מספר)'}</div>
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
    <div>שם המקבל: <span>&nbsp;</span></div>
    <div>חתימה: <span>&nbsp;</span></div>
  </div>
  <div class="foot">
    <span>תעודת משלוח ${certEsc(num)} · הופקה באפליקציית התפעול של סיגמאטק${cert.refId ? ' · ' + certEsc(cert.source) + ':' + certEsc(cert.refId) : ''}</span>
    <span>© ${new Date().getFullYear()} ${certEsc(CERT_COMPANY.name)}</span>
  </div>
  <scr` + `ipt>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</scr` + `ipt>
</body></html>`;
  }

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
      refId: window.editingVisitId || ''
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
    const w = window.open('', '_blank');
    if (!w) { alert('הדפדפן חסם את חלון ההדפסה — אפשר חלונות קופצים לאתר.'); return; }
    w.document.write('<!doctype html><html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding-top:40vh;">⏳ טוען תעודות…</body></html>');
    let certs = [];
    try {
      if (typeof window._sbCertGet !== 'function') throw new Error('no supabase');
      certs = await window._sbCertGet('delivery_certs?select=*&cert_date=gte.' + from + '&cert_date=lte.' + to + '&order=cert_number');
    } catch (e) { w.document.body.innerHTML = 'שגיאה בטעינת התעודות: ' + certEsc(e.message); return; }
    const byK = {};
    certs.forEach(cr => { (byK[cr.kibbutz || '—'] = byK[cr.kibbutz || '—'] || []).push(cr); });
    const groups = Object.keys(byK).sort((a, b) => a.localeCompare(b, 'he')).map(k => {
      const list = byK[k];
      const totals = {};
      list.forEach(cr => (cr.items || []).forEach(i => { totals[i.name] = (totals[i.name] || 0) + (parseInt(i.qty) || 0); }));
      const rows = list.map(cr => `<tr>
        <td>${cr.cert_number}</td><td>${certFmtDate(cr.cert_date)}</td>
        <td>${(cr.items || []).map(i => certEsc(i.name) + ' ×' + i.qty).join('<br>')}</td>
        <td>${certEsc(cr.created_by)}</td><td>${certEsc(cr.notes)}</td></tr>`).join('');
      const totalRows = Object.keys(totals).sort((a, b) => a.localeCompare(b, 'he')).map(n => `<tr><td>${certEsc(n)}</td><td class="c">${totals[n]}</td></tr>`).join('');
      return `<h2>${certEsc(k)} <small>(${list.length} תעודות)</small></h2>
        <table><thead><tr><th>מס' תעודה</th><th>תאריך</th><th>פריטים</th><th>הופק ע"י</th><th>הערות</th></tr></thead><tbody>${rows}</tbody></table>
        <table class="tot"><thead><tr><th>סה"כ לפי פריט</th><th class="c">כמות</th></tr></thead><tbody>${totalRows}</tbody></table>`;
    }).join('');
    w.document.open();
    w.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>דוח תעודות משלוח ${from} — ${to}</title>
<style>
  body { font-family:'Segoe UI',Arial,sans-serif; color:#1b2a4a; padding:14mm; font-size:12.5px; }
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
  window.certRangeReport = certRangeReport;
