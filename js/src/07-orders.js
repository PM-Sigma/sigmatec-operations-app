  // ===== Quick status actions for orders =====
  // Returns the next-step quick action for the given status (or null if none)
  // ============================================================
  // CUSTOMER-REQUEST INTAKE  (paste → parse → confirm → pending-approval order)
  // ============================================================
  // Aliases: normalized fragment that may appear in a customer message → a hint
  // string expected to appear in the catalog product name. Deterministic, offline.
  const INTAKE_ALIASES = {
    '360sp':'360sp', '360pp':'360pp', '360ct':'360ct', 'e570':'570', '570':'570',
    'em133':'em133', '133':'133', 'בקר':'בקר', 'בקרים':'בקר', 'robustel':'robustel',
    'רובסטל':'robustel', 'סים':'סים', 'סימים':'סים', 'sim':'סים', 'מונה':'מונה', 'מונים':'מונה'
  };
  const HE_NUMWORDS = { 'אחד':1,'אחת':1,'שני':2,'שתי':2,'שניים':2,'שתיים':2,'שלוש':3,'שלושה':3,
    'ארבע':4,'ארבעה':4,'חמש':5,'חמישה':5,'שש':6,'שישה':6,'שבע':7,'שבעה':7,'שמונה':8,'תשע':9,'תשעה':9,'עשר':10,'עשרה':10 };

  function intakeNormalize(s) {
    return (s || '')
      .replace(/[֑-ׇ]/g, '')   // strip niqqud
      .replace(/['"`׳״]/g, '')           // unify geresh/gershayim/quotes
      .replace(/\s+/g, ' ')
      .toLowerCase().trim();
  }
  function intakeQtyNear(norm, idx) {
    const win = norm.slice(Math.max(0, idx - 18), idx + 18);
    const d = win.match(/(\d{1,3})/);
    if (d) return { value: parseInt(d[1]), uncertain: false };
    for (const [w, n] of Object.entries(HE_NUMWORDS)) {
      if (win.indexOf(intakeNormalize(w)) !== -1) return { value: n, uncertain: false };
    }
    return { value: 1, uncertain: true };   // unknown qty → default 1 but FLAG for manual check
  }

  function openIntake() {
    const sel = document.getElementById('intakeKibbutz');
    const names = Array.from(document.querySelectorAll('.kibbutz')).map(c => c.dataset.name)
      .filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'));
    sel.innerHTML = '<option value="">-- בחר קיבוץ --</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
    document.getElementById('intakeContact').value = '';
    document.getElementById('intakeRaw').value = '';
    document.getElementById('intakeStep1').style.display = '';
    document.getElementById('intakeStep2').style.display = 'none';
    window.intakeItems = [];
    document.getElementById('intakeModal').classList.add('open');
  }
  function intakeBackToStep1() {
    document.getElementById('intakeStep1').style.display = '';
    document.getElementById('intakeStep2').style.display = 'none';
  }
  // AI-first parse (Gemini, with meter-type rules). Falls back to the local
  // keyword matcher if Gemini is unavailable (no key / offline / error).
  async function intakeParse() {
    if (!document.getElementById('intakeKibbutz').value) { alert('נא לבחור קיבוץ'); return; }
    const raw = document.getElementById('intakeRaw').value.trim();
    if (!raw) { alert('נא להדביק את טקסט הבקשה'); return; }
    const btn = document.getElementById('intakeParseBtn');
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '🧠 מנתח עם AI...'; }
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'parseRequest', text: raw, catalog: getActiveProducts().map(p => p.name) })
      }).then(r => r.json());
      if (res && res.ok && Array.isArray(res.items)) {
        window.intakeItems = res.items
          .filter(it => it.name && it.qty > 0)
          .map(it => ({ name: it.name, qty: parseInt(it.qty) || 1, uncertain: false }));
      } else {
        intakeParseLocal(raw);   // AI returned an error → fallback
      }
    } catch (e) {
      intakeParseLocal(raw);     // network/offline → fallback
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
    renderIntakeGrid();
    document.getElementById('intakeStep1').style.display = 'none';
    document.getElementById('intakeStep2').style.display = '';
  }

  // Deterministic keyword/alias matcher against the catalog → [{name,qty,uncertain}].
  function parseLocalToItems(raw) {
    const norm = intakeNormalize(raw);
    const catalog = getActiveProducts().map(p => p.name);
    const items = [];
    catalog.forEach(prodName => {
      const normProd = intakeNormalize(prodName);
      let idx = -1;
      for (const t of normProd.split(' ').filter(t => t.length >= 2)) {
        const at = norm.indexOf(t);
        if (at !== -1) { idx = at; break; }
      }
      if (idx === -1) {
        for (const [alias, hint] of Object.entries(INTAKE_ALIASES)) {
          if (normProd.indexOf(intakeNormalize(hint)) !== -1) {
            const at = norm.indexOf(alias);
            if (at !== -1) { idx = at; break; }
          }
        }
      }
      if (idx !== -1) {
        const q = intakeQtyNear(norm, idx);
        items.push({ name: prodName, qty: q.value, uncertain: q.uncertain });
      }
    });
    const seen = new Set();
    return items.filter(it => { if (seen.has(it.name)) return false; seen.add(it.name); return true; });
  }
  // Offline fallback: keep the old name for the intake modal.
  function intakeParseLocal(raw) { window.intakeItems = parseLocalToItems(raw); }

  // AI-first (Gemini via Apps Script) with local fallback. Returns [{name,qty,uncertain}].
  // ponytail: AI quota-blocked → falls back to the deterministic matcher; wire-through stays.
  async function parseRawToItems(raw) {
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'parseRequest', text: raw, catalog: getActiveProducts().map(p => p.name) })
      }).then(r => r.json());
      if (res && res.ok && Array.isArray(res.items)) {
        return res.items.filter(it => it.name && it.qty > 0).map(it => ({ name: it.name, qty: parseInt(it.qty) || 1, uncertain: false }));
      }
    } catch (e) { /* offline/no-key → fallback */ }
    return parseLocalToItems(raw);
  }
  function renderIntakeGrid() {
    const catalog = getActiveProducts().map(p => p.name);
    const grid = document.getElementById('intakeGrid');
    if (!window.intakeItems || !window.intakeItems.length) {
      grid.innerHTML = '<div style="color:#94a3b8;font-style:italic;padding:8px;">לא זוהו פריטים. הוסף ידנית למטה 👇</div>';
      return;
    }
    grid.innerHTML = window.intakeItems.map((it, i) => `
      <div style="display:flex;gap:6px;align-items:center;margin:4px 0;padding:6px 8px;border-radius:6px;background:${it.uncertain ? '#fef9c3' : '#f8fafc'};border:1px solid ${it.uncertain ? '#fde047' : '#e2e8f0'};">
        <select onchange="window.intakeItems[${i}].name=this.value" style="flex:1;padding:4px;border-radius:4px;border:1px solid #e2e8f0;">
          ${catalog.map(p => `<option value="${p}" ${it.name === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${it.qty}" style="width:64px;padding:4px;text-align:center;border-radius:4px;border:1px solid ${it.uncertain ? '#f59e0b' : '#e2e8f0'};"
          onchange="window.intakeItems[${i}].qty=parseInt(this.value)||1; window.intakeItems[${i}].uncertain=false; renderIntakeGrid();">
        ${it.uncertain ? '<span style="color:#b45309;font-size:11px;white-space:nowrap;">⚠️ כמות?</span>' : ''}
        <button onclick="window.intakeItems.splice(${i},1); renderIntakeGrid();" style="background:#dc2626;color:white;border:none;border-radius:4px;width:24px;height:24px;cursor:pointer;">×</button>
      </div>`).join('');
  }
  function intakeAddRow() {
    window.intakeItems = window.intakeItems || [];
    window.intakeItems.push({ name: getActiveProducts()[0]?.name || '', qty: 1, uncertain: false });
    renderIntakeGrid();
  }
  async function intakeSave(btn) {
    const kibbutz = document.getElementById('intakeKibbutz').value;
    const contact = document.getElementById('intakeContact').value.trim();
    const raw = document.getElementById('intakeRaw').value.trim();
    const items = (window.intakeItems || []).filter(it => it.name && it.qty > 0).map(it => ({ name: it.name, qty: it.qty }));
    if (!kibbutz) { alert('נא לבחור קיבוץ'); return; }
    if (!items.length) { alert('אין פריטים — הוסף לפחות פריט אחד'); return; }
    setBtnLoading(btn, true);
    const createdBy = getCurrentUser() || '';
    const post = body => fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(r => r.json());
    try {
      // 1) customer requirement (open) — keeps per-kibbutz attribution + the raw request
      const reqRes = await post({ type: 'requirement', kibbutz, contactName: contact, items, status: 'open', createdBy, notes: '📥 נקלט מבקשת לקוח:\n' + raw });
      // 2) purchase order awaiting Idan's approval (creates NO stock movement)
      const ordRes = await post({ type: 'order', status: 'pending_approval', items, createdBy, supplier: '', notes: 'בקשת לקוח — ' + kibbutz + (contact ? ' (' + contact + ')' : '') });
      // 3) link them
      if (reqRes?.id && ordRes?.id) {
        await post({ type: 'requirement', id: reqRes.id, status: 'in_progress', linkedOrderId: ordRes.id });
      }
      document.getElementById('intakeModal').classList.remove('open');
      const t = document.getElementById('toast');
      t.textContent = isIdan() ? '✅ נוצרה הזמנה ממתינה לאישור' : '✅ נשלח — ממתין לאישור עידן';
      t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3500);
      setTimeout(refreshData, 1200);
    } catch (e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ============================================================
  // VOICE RECORDING → transcription (Gemini via Apps Script) → form
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
      const res = await fetch(SHEET_API, {
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
      items.map(it => `<div style="font-size:13px;padding:4px 8px;background:#f1f5f9;border-radius:6px;margin:3px 0;">${it.name} × ${it.qty}</div>`).join('');
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

  function getOrderQuickAction(status) {
    switch(status) {
      case 'pending':    return { next: 'in_transit', label: '🔵 הוזמן',  bg: '#dbeafe', fg: '#1e40af' };
      case 'in_transit': return { next: 'at_port',    label: '🟡 בנמל',   bg: '#fef3c7', fg: '#92400e' };
      case 'at_port':    return { next: 'arrived',    label: '📦 התקבל',  bg: '#fce7f3', fg: '#9d174d' };
      case 'stuck':      return { next: 'arrived',    label: '📦 התקבל',  bg: '#fce7f3', fg: '#9d174d' };
      case 'arrived':    return { next: 'distribute',label: '🎯 חלק',   bg: '#d1fae5', fg: '#065f46' };
      default:           return null; // delivered → no quick action
    }
  }
  // Only אביאם / עמיחי may approve orders.
  function canApproveOrders() { return ['אביאם','עמיחי'].indexOf(getCurrentUser()) !== -1; }
  // Approve a pending_approval order → moves it to 'pending' (ready to order)
  async function approveOrder(orderId, btn) {
    if (!canApproveOrders()) { alert('רק אביאם או עמיחי יכולים לאשר הזמנות.'); return; }
    if (!confirm('לאשר את ההזמנה? תעבור לסטטוס "ממתין להזמנה".')) return;
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'order', id: orderId, status: 'pending' })
      });
      const data = await res.json();
      if (data.ok) {
        const t = document.getElementById('toast');
        t.textContent = '✅ ההזמנה אושרה';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000);
        setTimeout(refreshData, 800);
      } else { alert('שגיאה: ' + JSON.stringify(data)); }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  async function quickOrderStatus(orderId, newStatus, btn) {
    if (!checkEditPermission()) return;
    // Special: 'distribute' opens the edit modal and jumps to distribution section
    if (newStatus === 'distribute') {
      invEditOrder(orderId);
      setTimeout(() => {
        const wrap = document.getElementById('invDistributionWrap');
        if (wrap && wrap.style.display !== 'none') {
          wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
      return;
    }
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'order', id: orderId, status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        const t = document.getElementById('toast');
        t.textContent = '✅ סטטוס עודכן';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
        setTimeout(refreshData, 800);
      } else { alert('שגיאה: ' + JSON.stringify(data)); }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  // ========== ORDERS ==========
  function invRenderOrders() {
    const root = document.getElementById('invOrdersList');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const allOrders = (window.SHEET_DATA && window.SHEET_DATA.orders) || [];
    // Hide deleted orders from default view
    const orders = allOrders.filter(o => o.status !== 'deleted');
    const filter = document.getElementById('invOrdersFilter')?.value || '';
    const filtered = filter ? orders.filter(o => o.status === filter) : orders;
    if (filtered.length === 0) {
      root.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">אין הזמנות. לחץ "+ הזמנה חדשה"</div>';
      return;
    }
    let html = '<table class="inv-table"><thead><tr><th>תאריך</th><th>סטטוס</th><th>ספק</th><th>פריטים</th><th>נוצר ע"י</th><th>הערות</th><th>פעולות</th></tr></thead><tbody>';
    filtered.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach(o => {
      const date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('he-IL') : '—';
      const status = ORDER_STATUSES[o.status] || { label: o.status, color: '#94a3b8' };
      const itemsStr = (o.items || []).map(i => `${i.name} ×${i.qty}`).join('<br>');
      const quick = getOrderQuickAction(o.status);
      const quickBtn = quick
        ? `<button class="inv-btn small" style="background:${quick.bg};color:${quick.fg};border:1px solid ${quick.fg};" onclick="quickOrderStatus('${o.id}','${quick.next}',this)">${quick.label}</button>`
        : '';
      const stuckBtn = (o.status !== 'delivered' && o.status !== 'stuck' && o.status !== 'pending_approval')
        ? `<button class="inv-btn small" style="background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:10px;" onclick="quickOrderStatus('${o.id}','stuck',this)" title="סמן כתקוע">🟠</button>`
        : '';
      // Orders awaiting approval: only אביאם / עמיחי can approve; others see a waiting chip.
      let approvalCell = '';
      if (o.status === 'pending_approval') {
        approvalCell = canApproveOrders()
          ? `<button class="inv-btn small" style="background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;font-weight:700;" onclick="approveOrder('${o.id}',this)">✅ אשר</button>`
          : `<span style="font-size:10px;color:#7c3aed;">🔔 ממתין לאישור אביאם/עמיחי</span>`;
      }
      html += `<tr>
        <td data-label="תאריך" style="white-space:nowrap;">${date}</td>
        <td data-label="סטטוס"><span class="status-pill-inv status-${o.status}">${status.label}</span></td>
        <td data-label="ספק">${o.supplier || '—'}</td>
        <td data-label="פריטים">${itemsStr || '—'}</td>
        <td data-label="נוצר ע&quot;י">${o.createdBy || '—'}</td>
        <td data-label="הערות" style="max-width:200px;font-size:11px;">${(o.notes || '').replace(/</g,'&lt;')}</td>
        <td class="actions-cell" style="white-space:nowrap;">${approvalCell} ${quickBtn} ${stuckBtn} <button class="inv-btn small" onclick="invEditOrder('${o.id}')">✏️ ערוך</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  let invOrderItems = [];
  function invNewOrder() {
    if (!checkEditPermission()) return;
    window.invEditingOrderId = null;
    invOrderItems = [];
    window.invDistribution = {};
    window.invDistributionTouched = false;
    window.invOrigOrderStatus = null;
    window.invImportedReqIds = [];
    window.invOrigDistribution = {};
    document.getElementById('invOrderTitle').textContent = '🧾 הזמנה חדשה';
    document.getElementById('invOrderSupplier').value = '';
    document.getElementById('invOrderExpected').value = todayYmd();
    document.getElementById('invOrderNotes').value = '';
    document.getElementById('invOrderStatus').value = 'pending';
    document.getElementById('invOrderCreatedBy').value = (typeof getCurrentUser === 'function' ? getCurrentUser() : '') || '';
    const rawEl = document.getElementById('invOrderRaw');
    if (rawEl) rawEl.value = '';
    // New orders ALWAYS open as "ממתינה לאישור" — hide the status picker, show the note + raw box.
    document.getElementById('invOrderStatusWrap').style.display = 'none';
    document.getElementById('invOrderNewStatusNote').style.display = '';
    document.getElementById('invOrderRawWrap').style.display = '';
    renderOrderItems();
    invToggleDistribution();
    document.getElementById('invOrderModal').classList.add('open');
  }

  function invEditOrder(id) {
    if (!checkEditPermission()) return;
    const o = (window.SHEET_DATA.orders || []).find(x => x.id === id);
    if (!o) return;
    window.invEditingOrderId = id;
    window.invImportedReqIds = [];
    invOrderItems = [...(o.items || [])];
    document.getElementById('invOrderTitle').textContent = '🧾 ערוך הזמנה';
    document.getElementById('invOrderSupplier').value = o.supplier || '';
    document.getElementById('invOrderExpected').value = o.expectedDate ? o.expectedDate.slice(0,10) : '';
    document.getElementById('invOrderNotes').value = o.notes || '';
    // 'arrived' is shown as 'delivered' in the dropdown (it's a derived sub-state)
    document.getElementById('invOrderStatus').value = (o.status === 'arrived') ? 'delivered' : (o.status || 'pending');
    document.getElementById('invOrderCreatedBy').value = o.createdBy || '';
    window.invDistribution = o.distribution || {};
    // Snapshot the saved distribution so we can post only the correction delta on re-save
    window.invOrigDistribution = JSON.parse(JSON.stringify(o.distribution || {}));
    // If order was already 'delivered' (green) — distribution was confirmed before; otherwise reset touched
    window.invDistributionTouched = (o.status === 'delivered');
    // Remember original status — prevents duplicate movements when re-saving an already-delivered order
    window.invOrigOrderStatus = o.status || 'pending';
    // Editing: the status picker is available; the raw-requirement box + new-order note are hidden.
    document.getElementById('invOrderStatusWrap').style.display = '';
    document.getElementById('invOrderNewStatusNote').style.display = 'none';
    document.getElementById('invOrderRawWrap').style.display = 'none';
    renderOrderItems();
    invToggleDistribution();
    document.getElementById('invOrderModal').classList.add('open');
  }

  function renderOrderItems() {
    const wrap = document.getElementById('invOrderItems');
    if (invOrderItems.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:8px;font-style:italic;">אין פריטים. לחץ "+ הוסף פריט"</div>';
      return;
    }
    const products = getActiveProducts();
    const options = products.map(p => p.name).filter((n,i,a) => a.indexOf(n) === i);
    wrap.innerHTML = invOrderItems.map((it, idx) => `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;background:white;padding:5px 8px;border-radius:6px;">
        <select onchange="invOrderItems[${idx}].name = this.value" style="flex:1;padding:4px 6px;border-radius:4px;border:1px solid #e2e8f0;">
          ${options.map(n => `<option value="${n}" ${it.name === n ? 'selected' : ''}>${n}</option>`).join('')}
          ${options.includes(it.name) ? '' : `<option selected value="${it.name}">${it.name}</option>`}
        </select>
        <input type="number" min="1" value="${it.qty}" onchange="invOrderItems[${idx}].qty = parseInt(this.value) || 1" style="width:70px;padding:3px 6px;border-radius:4px;border:1px solid #e2e8f0;text-align:center;">
        <button onclick="invOrderItems.splice(${idx}, 1); renderOrderItems(); invToggleDistribution();" style="background:#dc2626;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">×</button>
      </div>
    `).join('');
  }

  // Import open requirements: sum quantities per product across all open requirements
  function importOpenRequirements() {
    const all = (window.SHEET_DATA?.requirements || []).concat(
      JSON.parse(localStorage.getItem('local_requirements_v1') || '[]')
    );
    const open = all.filter(r => (r.status || 'open') === 'open');
    if (open.length === 0) { alert('אין דרישות פתוחות.'); return; }
    // Sum per product
    const totals = {};
    open.forEach(r => (r.items || []).forEach(it => {
      totals[it.name] = (totals[it.name] || 0) + (parseInt(it.qty) || 0);
    }));
    const lines = Object.entries(totals).sort((a,b) => a[0].localeCompare(b[0],'he'))
      .map(([n, q]) => `• ${n} × ${q}`).join('\n');
    const summary = `נמצאו ${open.length} דרישות פתוחות.\n\nסה"כ פריטים נדרשים:\n${lines}\n\nלהוסיף הכל להזמנה?`;
    if (!confirm(summary)) return;
    Object.entries(totals).forEach(([name, qty]) => {
      const exists = invOrderItems.find(i => i.name === name);
      if (exists) exists.qty += qty;
      else invOrderItems.push({ name, qty });
    });
    // Remember which requirements fed this order → link + advance them when the order is saved
    window.invImportedReqIds = (window.invImportedReqIds || [])
      .concat(open.map(r => r.id).filter(Boolean));
    renderOrderItems();
    invToggleDistribution();
  }

  function invAddItemRow() {
    const products = getActiveProducts();
    invOrderItems.push({ name: products[0]?.name || 'מונה 360PP', qty: 1 });
    renderOrderItems();
    invToggleDistribution();
  }

  // Parse the raw customer-requirement text into order items (AI when available, local fallback).
  async function orderParseRaw(btn) {
    const raw = (document.getElementById('invOrderRaw').value || '').trim();
    if (!raw) { alert('הדבק תחילה את טקסט הדרישה'); return; }
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '🧠 מנתח...'; }
    try {
      const items = await parseRawToItems(raw);
      if (!items.length) { alert('לא זוהו פריטים מהטקסט — הוסף ידנית.'); return; }
      items.forEach(it => {
        const exists = invOrderItems.find(i => i.name === it.name);
        if (exists) exists.qty += it.qty;
        else invOrderItems.push({ name: it.name, qty: it.qty });
      });
      renderOrderItems();
      invToggleDistribution();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  }

  function onVisitorChange(visitor) {
    const src = document.getElementById('visitSource');
    if (!src) return;
    src.value = STOCK_HOLDERS.includes(visitor) ? visitor : 'משרד';
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

  // Ensures distribution defaults to {משרד: totalQty} for each item if not set yet
  function ensureDistributionDefaults() {
    if (!window.invDistribution) window.invDistribution = {};
    invOrderItems.forEach(it => {
      if (!window.invDistribution[it.name]) {
        window.invDistribution[it.name] = { 'משרד': it.qty };
      } else {
        // Always recompute משרד = total - sum(others) (in case items qty changed)
        const others = INV_LOCATIONS.filter(l => l !== 'משרד')
          .reduce((s, l) => s + (parseInt(window.invDistribution[it.name][l]) || 0), 0);
        window.invDistribution[it.name]['משרד'] = it.qty - others;
      }
    });
  }

  // Called when user changes a non-משרד location qty. Validates and rebalances משרד.
  function invDistChange(itemName, location, rawValue) {
    const it = invOrderItems.find(i => i.name === itemName);
    if (!it) return;
    let v = parseInt(rawValue) || 0;
    if (v < 0) v = 0;
    if (v > it.qty) v = it.qty;
    if (!window.invDistribution[itemName]) window.invDistribution[itemName] = {};
    window.invDistribution[itemName][location] = v;
    window.invDistributionTouched = true;
    // Recompute משרד
    const others = INV_LOCATIONS.filter(l => l !== 'משרד')
      .reduce((s, l) => s + (parseInt(window.invDistribution[itemName][l]) || 0), 0);
    const msrad = it.qty - others;
    if (msrad < 0) {
      // Block: revert this change. Should not happen due to max clamp, but defensive.
      alert(`לא ניתן להקצות יותר מהכמות הכוללת (${it.qty}). נסה להקטין מיקומים אחרים קודם.`);
      window.invDistribution[itemName][location] = Math.max(0, v - (-msrad));
    }
    window.invDistribution[itemName]['משרד'] = it.qty - INV_LOCATIONS.filter(l => l !== 'משרד')
      .reduce((s, l) => s + (parseInt(window.invDistribution[itemName][l]) || 0), 0);
    invToggleDistribution();
  }

  function invToggleDistribution() {
    const status = document.getElementById('invOrderStatus').value;
    const wrap = document.getElementById('invDistributionWrap');
    if (status !== 'delivered' || invOrderItems.length === 0) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';
    ensureDistributionDefaults();
    const dist = window.invDistribution;
    const list = document.getElementById('invDistributionList');
    list.innerHTML = invOrderItems.map(it => {
      const itemDist = dist[it.name] || {};
      const others = INV_LOCATIONS.filter(l => l !== 'משרד');
      const usedByOthers = others.reduce((s, l) => s + (parseInt(itemDist[l]) || 0), 0);
      const msradQty = it.qty - usedByOthers;
      const rows = INV_LOCATIONS.map(loc => {
        if (loc === 'משרד') {
          return `
          <div style="display:flex;gap:6px;align-items:center;margin:3px 0;background:#fef3c7;padding:3px 6px;border-radius:4px;">
            <span style="flex:1;font-size:12px;font-weight:700;">🏢 משרד:</span>
            <span style="width:60px;text-align:center;font-weight:700;color:${msradQty === 0 ? '#10b981' : '#0f172a'};">${msradQty}</span>
          </div>`;
        }
        const v = parseInt(itemDist[loc]) || 0;
        const max = it.qty - (usedByOthers - v); // can fill up to remaining + own current
        return `
          <div style="display:flex;gap:6px;align-items:center;margin:3px 0;">
            <span style="flex:1;font-size:12px;">${loc}:</span>
            <input type="number" min="0" max="${max}" value="${v}"
              oninput="invDistChange('${it.name.replace(/'/g, "\\'")}', '${loc}', this.value)"
              style="width:60px;padding:3px;border-radius:4px;border:1px solid #e2e8f0;text-align:center;">
          </div>`;
      }).join('');
      return `<div style="background:white;padding:8px 10px;border-radius:6px;margin-bottom:6px;">
        <div style="font-weight:700;font-size:12px;margin-bottom:4px;">
          ${it.name} (סה"כ: ${it.qty})
        </div>
        ${rows}
      </div>`;
    }).join('');
  }

  async function invSaveOrder(btn) {
    if (invOrderItems.length === 0) { alert('הוסף לפחות פריט אחד'); return; }
    const createdBy = document.getElementById('invOrderCreatedBy').value;
    if (!createdBy && !window.invEditingOrderId) { alert('נא לבחור מי יוצר את ההזמנה'); return; }
    setBtnLoading(btn, true);
    let status = document.getElementById('invOrderStatus').value;
    if (!window.invEditingOrderId) {
      status = 'pending_approval';   // ponytail: new orders are ALWAYS hardcoded to await approval
    } else if (status === 'delivered' && !window.invDistributionTouched) {
      // If "סופקה" was chosen but the distribution was never touched → save as 'arrived' (pink) — no movements yet
      status = 'arrived';
    }
    let notes = document.getElementById('invOrderNotes').value.trim();
    const rawReq = (document.getElementById('invOrderRaw')?.value || '').trim();
    if (!window.invEditingOrderId && rawReq) {
      notes = (notes ? notes + '\n\n' : '') + '📥 דרישת לקוח גולמית:\n' + rawReq;
    }
    const body = {
      type: 'order',
      supplier: document.getElementById('invOrderSupplier').value.trim(),
      expectedDate: document.getElementById('invOrderExpected').value,
      notes: notes,
      status: status,
      items: invOrderItems,
      createdBy: createdBy
    };
    if (window.invEditingOrderId) body.id = window.invEditingOrderId;
    if (status === 'delivered' && window.invDistribution) body.distribution = window.invDistribution;

    try {
      const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      const res = await r.json();
      if (!res.ok) { alert('שגיאה: ' + JSON.stringify(res)); return; }

      // If delivered (green), create movement events. 'arrived' (pink) does NOT create movements.
      // Skip if the order was ALREADY delivered before this edit — movements exist, don't duplicate.
      if (status === 'delivered' && body.distribution && window.invOrigOrderStatus !== 'delivered') {
        const movementPromises = [];
        Object.entries(body.distribution).forEach(([productName, locs]) => {
          Object.entries(locs).forEach(([loc, qty]) => {
            if (qty > 0) {
              movementPromises.push(fetch(SHEET_API, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                  type: 'movement',
                  product: productName,
                  fromLocation: '', // from external (supplier)
                  toLocation: loc,
                  quantity: qty,
                  reason: 'order_delivered',
                  refId: res.id,
                  createdBy: createdBy
                })
              }));
            }
          });
        });
        await Promise.all(movementPromises);
      }
      // Editing an ALREADY-delivered order → post only the correction delta vs the
      // previously-saved distribution, so stock stays accurate instead of diverging silently.
      else if (status === 'delivered' && body.distribution && window.invOrigOrderStatus === 'delivered') {
        const oldD = window.invOrigDistribution || {};
        const newD = body.distribution;
        const corrections = [];
        new Set([...Object.keys(oldD), ...Object.keys(newD)]).forEach(prod => {
          const locs = new Set([...Object.keys(oldD[prod] || {}), ...Object.keys(newD[prod] || {})]);
          locs.forEach(loc => {
            const delta = (parseInt(newD[prod]?.[loc]) || 0) - (parseInt(oldD[prod]?.[loc]) || 0);
            if (delta > 0)      corrections.push({ product: prod, fromLocation: '',  toLocation: loc, quantity: delta });
            else if (delta < 0) corrections.push({ product: prod, fromLocation: loc, toLocation: '',  quantity: -delta });
          });
        });
        await Promise.all(corrections.map(c => fetch(SHEET_API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ type: 'movement', reason: 'order_correction', refId: res.id || window.invEditingOrderId, createdBy }, c))
        }).catch(e => console.warn('Correction movement failed:', e))));
      }

      // ----- Requirement ↔ order linkage (closes the customer-request chain) -----
      const orderId = res.id || window.invEditingOrderId;
      const reqPost = (id, fields) => fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ type: 'requirement', id }, fields))
      }).catch(e => console.warn('Req link failed:', e));

      // Requirements just imported into this order → link them + advance status
      if (Array.isArray(window.invImportedReqIds) && window.invImportedReqIds.length && orderId) {
        const reqStatus = (status === 'delivered') ? 'fulfilled' : 'in_progress';
        await Promise.all(window.invImportedReqIds.map(rid =>
          reqPost(rid, { status: reqStatus, linkedOrderId: orderId })));
      }
      // On delivery, mark every requirement already linked to this order as fulfilled
      if (status === 'delivered' && orderId) {
        const linked = (window.SHEET_DATA?.requirements || [])
          .filter(r => r.linkedOrderId === orderId && r.status !== 'fulfilled');
        await Promise.all(linked.map(r => reqPost(r.id, { status: 'fulfilled' })));
      }
      window.invImportedReqIds = [];

      document.getElementById('invOrderModal').classList.remove('open');
      setTimeout(refreshData, 1500);
    } catch(e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setBtnLoading(btn, false);
    }
  }

