  // ========== 📦 INVENTORY — legacy compat (round 5 package I, task U10) ==========
  // The legacy screens (06-products.js, 07-orders.js, 08-inventory.js) are deleted. The rules:
  // app/src/lib/inventory.ts (window.SigmaInv, injected by build.mjs). The screens:
  // app/src/islands/Inventory*.tsx. These are only the NAMES that legacy callers still reach.
  // Delete a line when its last caller is rewritten:
  //   getActiveProducts (00-bridge, 03, 05, 09) · computeStock/productCategoryMap (09, 21) · poolStockMap (00-bridge)
  //   orderType/orderKibbutz (10, 20) · productLabel & co (20, 21) · approveOrder (22) · invEditOrder/quickOrderStatus (00-bridge, 11)
  //   maybeShow* (10) · renderLowStockAlert (02, 10 → package R) · openStockChangeSheet · onVisitorChange (→ package V)
  const _sd = () => window.SHEET_DATA || {};
  function getActiveProducts() { return SigmaInv.activeProducts(_sd().products || [], typeof PRODUCT_LIST !== 'undefined' ? PRODUCT_LIST : []); }
  function computeStock() { return SigmaInv.stockByLocation(_sd().movements || []); }
  function poolStockMap() { return SigmaInv.poolStock(_sd().movements || []); }
  function productCategoryMap() { return SigmaInv.productCategoryMap(_sd().products || []); }
  function orderType(o) { return SigmaInv.orderType(o); }
  function orderKibbutz(o) { return SigmaInv.orderKibbutz(o, _sd().requirements || []); }
  function productLabel(p, opts) { return SigmaInv.productLabel(p, opts || {}); }
  function reportWiringOk(ps) { return SigmaInv.reportWiringOk(ps || []); }
  function reportPreview(p) { return SigmaInv.reportPreview(p); }
  window.productLabel = productLabel; window.reportWiringOk = reportWiringOk; window.reportPreview = reportPreview;
  function approveOrder(id) { invOpen({ kind: 'approve', id: id }); }
  function invEditOrder(id) { invOpen({ kind: 'order', id: id }); }
  function quickOrderStatus(id, status) { invOpen({ kind: 'status', id: id, status: status }); }
  function maybeShowAmichaiApprovalReminder() { invOpen({ kind: 'nudges' }); }
  function maybeShowOrderNotifications() { invOpen({ kind: 'nudges' }); }
  window.maybeShowAmichaiApprovalReminder = maybeShowAmichaiApprovalReminder;
  window.maybeShowOrderNotifications = maybeShowOrderNotifications;

  // ===== Low-stock "red line" ===== (08-inventory.js:18-87, moved verbatim)
  const METER_RULES = [
    { label: 'מונה Landis+Gyr E360PP', match: '360PP', min: 15 },
    { label: 'מונה Landis+Gyr E360SP', match: '360SP', min: 15 },
    { label: 'מונה E360CT', match: '360CT', min: 15 },
    { label: 'מונה E570',   match: 'E570',  min: 10 },
    { label: 'מונה PM135',  match: 'PM135',  min: 5  },
  ];
  // round 5 Phase 1: SIM is retired (items archived, no low-stock alert — עידן 23.9). SIM_MIN
  // and the per-type sims[] report are gone; meters keep their own company-wide red line.
  function lowStockReport() {
    // Company-wide means THE POOL now — what a kibbutz already holds is not our shortage.
    const companyTotal = poolStockMap();
    // Meters — company-wide, bucketed by rule.match (dedups name variants)
    const meters = METER_RULES.map(rule => {
      let total = 0, found = false;
      Object.entries(companyTotal).forEach(([p, q]) => {
        if (p.indexOf('מונה') === 0 && p.indexOf(rule.match) !== -1) { total += q; found = true; }
      });
      return { label: rule.label, match: rule.match, total, min: rule.min, found };
    }).filter(m => m.found && m.total < m.min);
    return { meters };
  }
  // Renders the red-line alert: a "company task" line for the company-wide meter shortages
  // (visible to all), plus a main-page banner whose content depends on who's logged in.
  function renderLowStockAlert() {
    const { meters } = lowStockReport();
    const me = getCurrentUser();

    // (1) company-task lines — meters are company-wide. SKIP for אביאם/עמיחי: they already get
    //     meters in the prominent red banner (2) below, so listing them here too made the alert
    //     "appear twice". Everyone else (עידן/מתניה/ניתאי) has no banner → the line is their signal.
    const ordersOl = document.querySelector('.company-task-group.orders ol');
    if (ordersOl) {
      ordersOl.querySelectorAll('li.low-stock-task').forEach(e => e.remove());
      if (me !== 'אביאם' && me !== 'עמיחי') meters.forEach(m => {
        const li = document.createElement('li');
        li.className = 'low-stock-task';
        li.style.cssText = 'color:#dc2626;font-weight:700;';
        li.textContent = `🔴 מלאי המונים בחברה ירד מתחת לקו האדום, ישנם ${m.total} מסוג "${m.label}" (קו אדום: ${m.min})`;
        ordersOl.appendChild(li);
      });
    }

    // (2) main-page banner — אביאם/עמיחי, the two who order. Both lines are about the pool
    //     now, so there is no "אצל מי" left to name (§1).
    const lines = [];
    if (me === 'אביאם' || me === 'עמיחי') {
      meters.forEach(m => lines.push(`${m.label}: נותרו ${m.total} (קו אדום ${m.min})`));
    }

    const view = document.getElementById('kibbutz-view');
    let banner = document.getElementById('lowStockBanner');
    if (!view || lines.length === 0) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'lowStockBanner';
      banner.style.cssText = 'background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:12px 14px;margin:0 0 14px;color:#991b1b;font-weight:600;box-shadow:0 2px 8px rgba(220,38,38,.18);';
      view.insertBefore(banner, view.firstChild);
    }
    banner.innerHTML = '🔴 <strong>התראת מלאי: מתחת לקו האדום</strong><br>' +
      lines.join('<br>') +
      ' <button onclick="document.getElementById(\'lowStockBanner\').remove()" style="float:left;background:none;border:none;font-size:16px;cursor:pointer;color:#991b1b;">✕</button>';
  }

  // ===== דיווח שינוי במלאי (§4b) ===== (08-inventory.js:89-119, moved verbatim)
  // The transfer form and the free "הוספה/הפחתה" card are GONE. There are no person-locations
  // to transfer between any more, and עידן's ruling (17.9) is that a stock change must always
  // be linked to something: a visit, an order, or an auditable recount. Both are replaced by
  // ONE button that opens the React sheet (app/src/islands/StockChange.tsx); it does the
  // routing and writes the `stock_recounts` row plus its movement.
  //
  // This shim is what the legacy button calls. If the island's chunk never landed, the button
  // says so rather than doing nothing.
  function openStockChangeSheet(product) {
    try {
      window.dispatchEvent(new CustomEvent('sigma-open-stock-change', { detail: { product: product || '' } }));
    } catch (e) { /* no DOM */ }
    // The island clears this flag when it handles the event; nothing else reads it.
    setTimeout(function () {
      if (!window.__sigmaStockChangeMounted) {
        alert('מסך דיווח שינוי במלאי עוד נטען. נסה שוב בעוד רגע.');
      }
    }, 600);
  }
  window.openStockChangeSheet = openStockChangeSheet;

  // Something wrote a movement — a visit supplied from the pool, a supplier delivery landed in
  // it, or the 🔢 sheet recorded a recount. Re-render the pool NOW instead of waiting for the
  // next data poll, so the number a person just changed is the number he is looking at.
  try {
    window.sigmaBus.addEventListener('stock-changed', function () {
      try { if (typeof invRenderStock === 'function') invRenderStock(); } catch (e) { /* page not open */ }
      try { if (typeof renderLowStockAlert === 'function') renderLowStockAlert(); } catch (e) { /* no banner */ }
    });
  } catch (e) { /* no DOM */ }

  // onVisitorChange: 07-orders.js:1124-1141, moved verbatim (package V deletes it with the legacy visit form).
  function onVisitorChange(visitor) {
    const src = document.getElementById('visitSource');
    if (!src) return;
    src.value = POOL_LOCATION;   // one pool, one source (inventory spec §1)
    if (typeof renderProductsForVisitor === 'function') renderProductsForVisitor();
    // Aviam: show day type selector; reset to field day
    const sel = document.getElementById('aviamDayTypeSelector');
    if (sel) {
      if (ATT_PEOPLE.indexOf(visitor) !== -1) {   // אביאם / ניתאי get the day-type selector
        sel.style.display = '';
        setAviamDayType(window.aviamDayType || 'field');
      } else {
        sel.style.display = 'none';
        document.getElementById('visitFieldForm').style.display = '';
        document.getElementById('visitSimpleForm').style.display = 'none';
      }
    }
  }

  // ============================================================
  // VOICE RECORDING → transcription (Gemini via Apps Script) → form
  // → package V: the legacy visit form still has a hidden 🎤 button (index.html `openVoice('visit')`,
  // O32). Moved verbatim from 07-orders.js:305-453 — package V deletes both when it retires the form.
  // ============================================================
  let _voiceRec = null, _voiceChunks = [], _voiceStream = null, _voiceTimerInt = null, _voiceSecs = 0;
  let _voiceTarget = 'visit', _voiceResult = null;
  window._voiceBusy = false;

  function pickRecorderMime() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const t of types) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; }
    return '';
  }

  function openVoice(target) {
    _voiceTarget = target || 'visit';
    _voiceResult = null;
    _voiceSecs = 0;
    document.getElementById('voiceTimer').textContent = '00:00';
    document.getElementById('voiceHint').textContent = 'לחץ כדי להתחיל להקליט';
    document.getElementById('voiceRecBtn').textContent = '🎤';
    document.getElementById('voiceRecBtn').style.background = '#dc2626';
    document.getElementById('voiceRecordStage').style.display = '';
    document.getElementById('voiceProcessStage').style.display = 'none';
    document.getElementById('voiceReviewStage').style.display = 'none';
    document.getElementById('voiceModal').classList.add('open');
  }
  function closeVoice() {
    if (_voiceRec && _voiceRec.state === 'recording') { try { _voiceRec.stop(); } catch(e){} }
    if (_voiceStream) { _voiceStream.getTracks().forEach(t => t.stop()); _voiceStream = null; }
    clearInterval(_voiceTimerInt);
    window._voiceBusy = false;
    document.getElementById('voiceModal').classList.remove('open');
  }
  function _fmtSecs(s) { return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }

  async function toggleVoiceRecording() {
    if (_voiceRec && _voiceRec.state === 'recording') { _voiceRec.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      alert('הדפדפן לא תומך בהקלטה. נסה Chrome עדכני.'); return;
    }
    try {
      _voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert('לא ניתן לגשת למיקרופון. אשר הרשאה ונסה שוב.'); return;
    }
    const mime = pickRecorderMime();
    _voiceChunks = [];
    _voiceRec = mime ? new MediaRecorder(_voiceStream, { mimeType: mime }) : new MediaRecorder(_voiceStream);
    _voiceRec.ondataavailable = e => { if (e.data.size > 0) _voiceChunks.push(e.data); };
    _voiceRec.onstop = () => {
      clearInterval(_voiceTimerInt);
      if (_voiceStream) { _voiceStream.getTracks().forEach(t => t.stop()); _voiceStream = null; }
      const blob = new Blob(_voiceChunks, { type: _voiceRec.mimeType || 'audio/webm' });
      sendVoiceForTranscription(blob, _voiceRec.mimeType || 'audio/webm');
    };
    _voiceRec.start();
    _voiceSecs = 0;
    document.getElementById('voiceTimer').textContent = '00:00';
    _voiceTimerInt = setInterval(() => { _voiceSecs++; document.getElementById('voiceTimer').textContent = _fmtSecs(_voiceSecs); }, 1000);
    const btn = document.getElementById('voiceRecBtn');
    btn.textContent = '⏹';
    btn.style.background = '#1b2a4a';
    document.getElementById('voiceHint').textContent = '🔴 מקליט... לחץ לעצירה';
  }

  function _fakeProgress() {
    const bar = document.getElementById('voiceBar'), pct = document.getElementById('voicePct');
    let p = 0;
    return setInterval(() => {
      p = Math.min(92, p + Math.max(1, (92 - p) * 0.08));
      bar.style.width = p.toFixed(0) + '%'; pct.textContent = p.toFixed(0) + '%';
    }, 250);
  }

  async function sendVoiceForTranscription(blob, mimeType) {
    window._voiceBusy = true;
    document.getElementById('voiceRecordStage').style.display = 'none';
    document.getElementById('voiceProcessStage').style.display = '';
    const prog = _fakeProgress();
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res(String(r.result).split(',')[1]);   // strip data: prefix
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const catalog = getActiveProducts().map(p => p.name);
      const cleanMime = (mimeType || 'audio/webm').split(';')[0];
      const res = await fetch(EMS_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'transcribe', audioBase64: base64, mimeType: cleanMime, catalog })
      }).then(r => r.json());
      clearInterval(prog);
      document.getElementById('voiceBar').style.width = '100%';
      document.getElementById('voicePct').textContent = '100%';
      if (res.error) { alert('שגיאת תמלול: ' + res.error); voiceRetry(); return; }
      _voiceResult = res;
      renderVoiceReview(res);
    } catch (e) {
      clearInterval(prog);
      alert('שגיאה: ' + e.message);
      voiceRetry();
    } finally {
      window._voiceBusy = false;
    }
  }

  function renderVoiceReview(res) {
    document.getElementById('voiceProcessStage').style.display = 'none';
    document.getElementById('voiceReviewStage').style.display = '';
    document.getElementById('voiceTranscript').value = res.transcript || '';
    const items = Array.isArray(res.items) ? res.items : [];
    const wrap = document.getElementById('voiceItemsWrap');
    if (!items.length) { wrap.innerHTML = '<div style="font-size:12px;color:#94a3b8;">לא זוהו פריטים בהקלטה.</div>'; window._voiceItems = []; return; }
    window._voiceItems = items;
    wrap.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">📦 פריטים שזוהו (יסומנו בטופס):</div>' +
      items.map(it => `<div style="font-size:13px;padding:4px 8px;background:var(--surface-2);color:var(--text);border-radius:6px;margin:3px 0;">${it.name} × ${it.qty}</div>`).join('');
  }

  function voiceRetry() {
    _voiceResult = null;
    document.getElementById('voiceProcessStage').style.display = 'none';
    document.getElementById('voiceReviewStage').style.display = 'none';
    document.getElementById('voiceRecordStage').style.display = '';
    document.getElementById('voiceTimer').textContent = '00:00';
    document.getElementById('voiceRecBtn').textContent = '🎤';
    document.getElementById('voiceRecBtn').style.background = '#dc2626';
    document.getElementById('voiceHint').textContent = 'לחץ כדי להתחיל להקליט';
  }

  function applyVoiceResult() {
    const transcript = document.getElementById('voiceTranscript').value.trim();
    if (_voiceTarget === 'visit') {
      const ta = document.getElementById('visitSummary');
      ta.value = (ta.value ? ta.value + '\n' : '') + transcript;
      // tick detected products + set quantities (clamped by the existing inputs)
      (window._voiceItems || []).forEach(it => {
        const chk = document.querySelector('.prod-chk[data-product="' + it.name + '"]');
        const qty = document.querySelector('.prod-qty[data-product="' + it.name + '"]');
        if (chk) chk.checked = true;
        if (qty && it.qty > 0) qty.value = it.qty;
      });
    }
    closeVoice();
    const t = document.getElementById('toast');
    t.textContent = '✅ התמלול הוחל לטופס';
    t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
  }
