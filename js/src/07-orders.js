  // ===== Quick status actions for orders =====
  // Returns the next-step quick action for the given status (or null if none)
  // ============================================================
  // CUSTOMER-REQUEST INTAKE  (paste → parse → confirm → pending-approval order)
  // ============================================================
  // Aliases: normalized fragment that may appear in a customer message → a hint
  // string expected to appear in the catalog product name. Deterministic, offline.
  const INTAKE_ALIASES = {
    '360sp':'360sp', '360pp':'360pp', '360ct':'360ct', 'e570':'570', '570':'570',
    'em133':'em133', '133':'em133', 'satec':'em133', 'סאטק':'em133',
    // לנדיס phrasings → the E360 family (mirrors the AI glossary in supabase/functions/parse-order)
    'לנדיס ישיר':'e360pp', 'ישיר לקו':'e360pp', 'חד פאזי':'e360sp', 'לנדיס חד':'e360sp', 'לנדיס תלת':'e360pp',
    // "מונה משנ\"ז" (with the word מונה) → the E360CT meter; a bare "משנ\"ז 250" stays the physical CT product.
    // 'משנה זרם' spelled out also → E360CT (e.g. "מונה תלת פאזי משנה זרם" — the words aren't adjacent).
    'מונה משנה זרם':'e360ct', 'מונה משנז':'e360ct', 'משנה זרם':'e360ct',
    // Carlo Gavachi E341
    'carlo':'carlo', 'קרלו':'carlo', 'e341':'carlo', 'gavazzi':'carlo',
    // PM135 — SATEC CT/transformer meter (more specific than generic 'סאטק')
    'pm135':'pm135', 'מונה שנאי':'pm135', 'מונה מקביל':'pm135',
    // PURS controller (ASIC meters) / ROBUSTEL (SATEC meters)
    'purs':'purs',
    'בקר':'בקר', 'בקרים':'בקר', 'robustel':'robustel',
    'רובסטל':'robustel', 'סים':'סים', 'סימים':'סים', 'sim':'סים'
    // NOTE: removed generic 'מונה'/'מונים' — they matched EVERY meter (all names contain "מונה").
    // A generic "מונה לנדיס" with no variant becomes an E360PP default in parseLocalToItems().
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
    // Hebrew orders put the quantity right BEFORE the term ("5 סאטק", "3 משנז 400") — read the nearest
    // LEADING number (not a ±window, which used to grab a neighbouring item's number).
    const before = norm.slice(Math.max(0, idx - 14), idx);
    const mb = before.match(/(\d{1,3})\D*$/);
    if (mb) return { value: parseInt(mb[1]), uncertain: false };
    for (const [w, n] of Object.entries(HE_NUMWORDS)) {
      if (before.indexOf(intakeNormalize(w)) !== -1) return { value: n, uncertain: false };
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

  // Generic category words that appear in MANY product names — must NOT be match tokens on their own
  // (otherwise any text with "מונה" matched every meter). The discriminating token (e360pp, em133…) matches.
  const INTAKE_STOP = ['מונה', 'מונים'];

  // Customer-order accessory MODEL (pure counts; unit-tested in test-autoadd.mjs):
  //   • Landis meter (E360*/E570) — built-in comm → 1 SIM directly. No controller / antenna / power-supply.
  //   • Any OTHER meter (Satec, Carlo, …) — needs 1 controller each (type is a user choice).
  //   • Every controller (added + explicitly-ordered) → 1 SIM + 1 antenna + 1 power-supply (type is a user choice).
  //   • SIM total = Landis meters + all controllers. Antenna = controllers. Power-supply = controllers.
  // Returns counts only; the conversational flow (finalizeCustomerAccessories) asks the choices and adds rows.
  function accessoryPlan(items) {
    var sumQty = function (pred) { return items.filter(function (it) { return pred(it.name); }).reduce(function (s, it) { return s + (parseInt(it.qty) || 0); }, 0); };
    var isLandis = function (n) { return /landis|e360|e570/i.test(n); };
    var isMeter  = function (n) { return isLandis(n) || /satec|em133|pm135|carlo|e341/i.test(n); };
    var isCtrl   = function (n) { return /robustel|pusr|purs/i.test(n); };
    var landisQty = sumQty(isLandis);
    var nonLandisMeterQty = sumQty(function (n) { return isMeter(n) && !isLandis(n); });
    var explicitControllers = sumQty(isCtrl);
    var controllersToAdd = nonLandisMeterQty;                 // one controller per non-Landis meter in the order
    var totalControllers = explicitControllers + controllersToAdd;
    return {
      landisQty: landisQty,
      nonLandisMeterQty: nonLandisMeterQty,
      controllersToAdd: controllersToAdd,
      totalControllers: totalControllers,
      simQty: landisQty + totalControllers,
      antennaQty: totalControllers,
      psQty: totalControllers,
    };
  }

  // Deterministic keyword/alias matcher against the catalog → [{name,qty,uncertain}].
  function parseLocalToItems(raw, orderType) {
    const norm = intakeNormalize(raw);
    const catalog = getActiveProducts().map(p => p.name);
    const items = [];
    catalog.forEach(prodName => {
      const normProd = intakeNormalize(prodName);
      const tokens = normProd.split(' ').filter(t => t.length >= 2 && INTAKE_STOP.indexOf(t) === -1);
      // Products distinguished ONLY by a number (משנ"ז 250 vs 400) must have THAT number in the text —
      // otherwise both matched on the shared word "משנז".
      const numToks = tokens.filter(t => /^\d{2,4}$/.test(t));
      if (numToks.length && !numToks.some(n => norm.indexOf(n) !== -1)) return;
      let idx = -1;
      for (const t of tokens) {
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
        // A "quantity" that is really a MODEL number ("מונה סאטק 133 משנז" → the 133) must not be
        // trusted: known model numbers that also appear in the product's own name → qty 1, flagged.
        if (!q.uncertain && /^(133|135|250|400|485|360)$/.test(String(q.value)) && normProd.replace(/[^0-9]/g, '').indexOf(String(q.value)) !== -1) {
          q.value = 1; q.uncertain = true;
        }
        items.push({ name: prodName, qty: q.value, uncertain: q.uncertain });
      }
    });
    // Default-meter rule: the GENERAL default for meters is Landis E360PP — both "מונה לנדיס" with no
    // variant AND a brand-less "מונים תלת פזי"/"מונים" request (Satec only when סאטק/133 is explicit).
    // A CT (משנה-זרם) match alone doesn't suppress the default — one email often asks for both
    // ("4 מונים תלת פזי" + "מונה משנה זרם" → 4×PP + 1×CT). Quantity from the number near "מונה/מונים".
    const _genericMeterAsk = /לנדיס/.test(norm) ||
      (/מונ/.test(norm) && !/סאטק|satec|133|קרלו|carlo|pm135|e341|חד פאזי|חד פזי/.test(norm));
    if (_genericMeterAsk && !items.some(it => /E360PP|E360SP|E570|EM133|PM135|E341/i.test(it.name))) {
      const def = catalog.find(n => /E360PP/i.test(n));
      if (def) {
        // qty anchor priority: a number-adjacent "מונ" after "סה"כ" (the explicit total beats the
        // per-line partials) → any number-adjacent "מונ" → the first "מונ" → "לנדיס".
        let firstAny = -1, firstNum = -1, totalNum = -1, at = -1;
        const totalAt = norm.indexOf('סהכ');   // intakeNormalize strips the gershayim from סה"כ
        while ((at = norm.indexOf('מונ', at + 1)) !== -1) {
          if (firstAny === -1) firstAny = at;
          if (!intakeQtyNear(norm, at).uncertain) {
            if (firstNum === -1) firstNum = at;
            if (totalAt !== -1 && at > totalAt && totalNum === -1) totalNum = at;
          }
        }
        const anchor = totalNum !== -1 ? totalNum : (firstNum !== -1 ? firstNum : (firstAny !== -1 ? firstAny : norm.indexOf('לנדיס')));
        const q = intakeQtyNear(norm, anchor);
        items.push({ name: def, qty: q.value, uncertain: q.uncertain });
      }
    }
    // "מונה משנ\"ז" (the word מונה adjacent to משנ"ז) = the E360CT METER → drop the bare physical CT products.
    if (/מונה\s*משנ/.test(norm)) {
      for (let i = items.length - 1; i >= 0; i--) { if (/^משנ/.test(intakeNormalize(items[i].name))) items.splice(i, 1); }
    }
    // "סאטק משני זרם" / PM135 → prefer PM135 over generic EM133 match (local fallback only).
    if (/pm135|סאטק.*(משני.?זרם|שנאי)|מונה שנאי/.test(norm) && items.some(it => /pm135/i.test(it.name))) {
      for (var _ii = items.length - 1; _ii >= 0; _ii--) {
        if (/em133/i.test(intakeNormalize(items[_ii].name))) items.splice(_ii, 1);
      }
    }
    // "EM133" + bare "משנ\"ז" (one word, not "משני זרם" — that's PM135 above) → keep only the
    // EM133-משנ"ז variant, drop the plain Satec EM133 match (same collision as PM135/EM133).
    if (/משנז/.test(norm) && !/משני\s*זרם/.test(norm) && /em133|133/.test(norm)) {
      for (var _jj = items.length - 1; _jj >= 0; _jj--) {
        if (intakeNormalize(items[_jj].name) === intakeNormalize('Satec EM133')) items.splice(_jj, 1);
      }
    }
    // The EM133-משנ"ז variant needs BOTH contexts in the text (סאטק/133 AND משנ"ז) — it shares the
    // '133' alias with Satec EM133 and the 'משנז' token with the physical CTs, so either alone
    // over-matches ("5 סאטק 133" / "2 משנז 250" must not pull it in).
    if (!(/em133|133|סאטק|satec/.test(norm) && /משנז|משנה זרם/.test(norm))) {
      for (var _kk = items.length - 1; _kk >= 0; _kk--) {
        var _nk = intakeNormalize(items[_kk].name);
        if (/em133/.test(_nk) && /משנז/.test(_nk)) items.splice(_kk, 1);
      }
    }
    // NOTE: accessory auto-add (controllers/SIM/antenna) is applied centrally in orderParseRaw AFTER parsing,
    // so it runs identically for the AI path and this offline path. Keep this matcher to pure parsing.
    const seen = new Set();
    return items.filter(it => { if (seen.has(it.name)) return false; seen.add(it.name); return true; });
  }
  // Offline fallback: keep the old name for the intake modal.
  function intakeParseLocal(raw) { window.intakeItems = parseLocalToItems(raw); }

  // AI-first via the `parse-order` Edge Function (Gemini + few-shot from past corrections), with a
  // deterministic local fallback. Until the function is deployed + GEMINI_API_KEY is set, the call
  // returns no items (404/503) → we fall back to the catalog matcher, so intake never breaks.
  async function parseRawToItems(raw, orderType) {
    window._lastParseSource = '';   // who answered: AI provider string (e.g. "gemini:…") or 'local'
    try {
      var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
      // 15s abort: cold function + AI chain can take a while, but never leave the user staring silently
      var ac = new AbortController(); var tt = setTimeout(function () { ac.abort(); }, 15000);
      var r = await fetch(SB_URL + '/functions/v1/parse-order', {
        method: 'POST', signal: ac.signal,
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok, text: raw, catalog: getActiveProducts().map(p => p.name), orderType: orderType || 'supplier' })
      });
      clearTimeout(tt);
      var res = await r.json().catch(function () { return {}; });
      // EMS token expired mid-session → the fn 401s. Prompt re-login instead of silently degrading forever
      if (r.status === 401 && typeof emsRequireLogin === 'function') { try { emsRequireLogin(); } catch (e2) {} }
      if (r.ok && res && Array.isArray(res.items) && res.items.length) {
        window._lastParseSource = res.provider || 'ai';
        return res.items.filter(function (it) { return it.name && (parseInt(it.qty) || 0) > 0; })
          .map(function (it) { return { name: it.name, qty: parseInt(it.qty) || 1, uncertain: false }; });
      }
    } catch (e) { /* function not deployed / no key / offline → deterministic fallback below */ }
    window._lastParseSource = 'local';
    return parseLocalToItems(raw, orderType);
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
      const ordRes = await post({ type: 'order', status: 'pending_approval', orderType: 'customer', kibbutz: kibbutz, items, createdBy, supplier: '', notes: 'בקשת לקוח — ' + kibbutz + (contact ? ' (' + contact + ')' : '') });
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
  // ===== Two order types: ספק (raises stock) · לקוח (consumes stock → EMS "אספקת ציוד" task) =====
  function orderTotalQty(o) { return (o.items || []).reduce(function (s, i) { return s + (parseInt(i.qty) || 0); }, 0); }
  function orderType(o) { return o.orderType || (/בקשת לקוח/.test(o.notes || '') ? 'customer' : 'supplier'); }
  // customer order's kibbutz: explicit field → parsed from notes → linked requirement
  function orderKibbutz(o) {
    if (o.kibbutz) return o.kibbutz;
    var m = (o.notes || '').match(/בקשת לקוח\s*[—-]\s*([^\n(]+)/);
    if (m) return m[1].trim();
    var req = (window.SHEET_DATA && window.SHEET_DATA.requirements || []).find(function (r) { return r.linkedOrderId === o.id && r.kibbutz; });
    return req ? req.kibbutz : '';
  }
  // supplier >10 items → עמיחי; supplier ≤10 → אביאם; customer → אביאם/ניתאי. עמיחי may approve anything.
  function orderNeedsAmichai(o) { return orderType(o) === 'supplier' && orderTotalQty(o) > 10; }
  function canApproveThisOrder(o) {
    var me = getCurrentUser();
    if (me === 'עמיחי') return true;
    if (orderType(o) === 'customer') return ['אביאם', 'ניתאי'].indexOf(me) !== -1;
    return orderTotalQty(o) <= 10 && me === 'אביאם';
  }
  function approvalWaitingMsg(o) {
    if (orderType(o) === 'customer') return '🔔 ממתין לאישור אביאם/ניתאי';
    return orderNeedsAmichai(o) ? '🔔 מעל 10 פריטים — ממתין לאישור עמיחי' : '🔔 ממתין לאישור אביאם';
  }
  function canApproveOrders() { return ['אביאם', 'עמיחי', 'ניתאי'].indexOf(getCurrentUser()) !== -1; }   // any approver (legacy callers)

  // Route approval by type.
  async function approveOrder(orderId, btn) {
    var o = (window.SHEET_DATA && window.SHEET_DATA.orders || []).find(function (x) { return x.id === orderId; });
    if (!o) { alert('הזמנה לא נמצאה'); return; }
    if (!canApproveThisOrder(o)) { alert('אין לך הרשאה לאשר הזמנה זו.\n' + approvalWaitingMsg(o)); return; }
    if (orderType(o) === 'customer') return approveCustomerOrder(o, btn);
    return approveSupplierOrder(o, btn);
  }

  // Supplier approval → "ממתין להזמנה" (continues the existing purchase flow that later raises stock).
  async function approveSupplierOrder(o, btn) {
    if (!confirm('לאשר הזמנת ספק? תעבור ל"ממתין להזמנה".')) return;
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ type: 'order', id: o.id, status: 'pending' }) });
      const data = await res.json();
      if (data.ok) { orderNotifMarkSeen([o.id]); const t = document.getElementById('toast'); t.textContent = '✅ הזמנת הספק אושרה'; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2000); setTimeout(refreshData, 800); }
      else alert('שגיאה: ' + JSON.stringify(data));
    } catch (e) { alert('שגיאה: ' + e.message); } finally { setBtnLoading(btn, false); }
  }

  // Customer approval (אביאם/ניתאי) → deduct from the approver's stock → the kibbutz, open an EMS
  // "אספקת ציוד" task (queued if offline), keep the order row as "סופק ללקוח".
  async function approveCustomerOrder(o, btn) {
    var me = getCurrentUser();
    var kibbutz = orderKibbutz(o);
    // עידן can hand the responsibility at creation → the EMS task is assigned to them and the stock
    // leaves THEIR bag (they're the one physically supplying). Default: the approver, as before.
    var responsible = o.assignee || me;
    var items = (o.items || []).filter(function (i) { return i.name && (parseInt(i.qty) || 0) > 0; });
    if (!items.length) { alert('אין פריטים בהזמנה.'); return; }
    if (!kibbutz) { alert('לא זוהה קיבוץ להזמנה — לא ניתן לאשר אספקת לקוח.'); return; }
    if (!confirm('לאשר אספקת לקוח?\nירד מהמלאי של ' + responsible + ' → "' + kibbutz + '", ותיפתח משימת "אספקת ציוד" ב-EMS' + (o.assignee ? ' באחריות ' + o.assignee : '') + '.')) return;
    setBtnLoading(btn, true);
    try {
      // 1) stock: responsible → kibbutz (deduct from his bag, credit the kibbutz).
      // Idempotency: if a previous attempt posted the movements but failed before step 3, a re-click
      // must NOT deduct twice. ponytail: checked against SHEET_DATA (refreshes ≤15s) — a same-second
      // double-click is still covered by the disabled button; server-side unique refId if it ever bites.
      var alreadyMoved = (window.SHEET_DATA && window.SHEET_DATA.movements || []).some(function (m) { return m.refId === o.id && m.reason === 'customer_supply'; });
      if (!alreadyMoved) await Promise.all(items.map(function (it) {
        return fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'movement', product: it.name, fromLocation: responsible, toLocation: kibbutz, quantity: it.qty, reason: 'customer_supply', refId: o.id, createdBy: me }) });
      }));
      // 2) EMS "אספקת ציוד" task — live if connected, else queued for the next connect (field staff rarely connect)
      var desc = 'אספקת ציוד ל' + kibbutz + ' — אושר ע"י ' + me + (o.assignee ? ' · אחראי: ' + o.assignee : '') + '\n' + items.map(function (i) { return '• ' + i.name + ' ×' + i.qty; }).join('\n');
      var emsRes = {};
      if (typeof emsWriteOrQueue === 'function') {
        emsRes = await emsWriteOrQueue({ kind: 'createTask', kibbutz: kibbutz, title: 'אספקת ציוד — ' + kibbutz, description: desc, assigneeName: responsible });
        // sent live → refresh the shared cache so the new task shows on kibbutz cards NOW (not next session)
        if (emsRes && emsRes.sent && typeof emsAfterWrite === 'function') { try { await emsAfterWrite(); } catch (e2) {} }
      }
      // 3) close the order row + the linked requirement
      await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ type: 'order', id: o.id, status: 'supplied' }) });
      var linked = (window.SHEET_DATA && window.SHEET_DATA.requirements || []).filter(function (r) { return r.linkedOrderId === o.id && r.status !== 'fulfilled'; });
      await Promise.all(linked.map(function (r) { return fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ type: 'requirement', id: r.id, status: 'fulfilled' }) }).catch(function () {}); }));
      orderNotifMarkSeen([o.id]);   // the approver shouldn't be notified about the order they just approved
      const t = document.getElementById('toast');
      t.textContent = (emsRes && emsRes.queued) ? '✅ סופק · משימת EMS תיפתח בהתחברות הבאה' : '✅ סופק ללקוח · נפתחה משימת EMS';
      t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 3500);
      setTimeout(refreshData, 1000);
    } catch (e) { alert('שגיאה: ' + e.message); } finally { setBtnLoading(btn, false); }
  }

  // עמיחי floating reminder — supplier orders >10 awaiting his approval (mirrors the attendance nudge).
  function maybeShowAmichaiApprovalReminder() {
    if (getCurrentUser() !== 'עמיחי') return;
    if (window._amichaiApprovalShown) return;
    var pend = (window.SHEET_DATA && window.SHEET_DATA.orders || []).filter(function (o) { return o.status === 'pending_approval' && orderNeedsAmichai(o); });
    if (!pend.length) return;
    var listEl = document.getElementById('amichaiApprovalList');
    var modal = document.getElementById('amichaiApprovalModal');
    if (!listEl || !modal) return;
    listEl.innerHTML = pend.map(function (o) {
      return '<div>📦 ' + orderTotalQty(o) + ' פריטים' + (o.supplier ? ' · ' + String(o.supplier).replace(/</g, '&lt;') : '') + (o.createdBy ? ' · ' + o.createdBy : '') + '</div>';
    }).join('');
    modal.classList.add('open');
    window._amichaiApprovalShown = true;
  }
  window.maybeShowAmichaiApprovalReminder = maybeShowAmichaiApprovalReminder;

  // ===== Approved-order notifications for the field/CEO group (אביאם · ניתאי · עמיחי) =====
  // Informational: when one of them approves an order, the OTHERS see it on their next open with a
  // "show orders" button. Lazy & device-local (no schema change): a per-user "seen" set in localStorage;
  // the approver marks the order seen on approval (no self-notify); everyone else in the group who hasn't
  // seen it (and didn't create it) gets the modal once. First run seeds the set so it never floods.
  const ORDER_NOTIF_GROUP = ['אביאם', 'ניתאי', 'עמיחי'];
  function orderNotifKey() { return 'orders_notif_seen_' + (getCurrentUser() || ''); }
  function orderNotifSeen() { try { return JSON.parse(localStorage.getItem(orderNotifKey()) || 'null'); } catch (e) { return null; } }
  function orderNotifMarkSeen(ids) {
    var cur = orderNotifSeen() || [];
    (ids || []).forEach(function (id) { if (id && cur.indexOf(id) === -1) cur.push(id); });
    try { localStorage.setItem(orderNotifKey(), JSON.stringify(cur.slice(-800))); } catch (e) {}
  }
  function isApprovedOrder(o) { return o && o.status && ['pending_approval', 'deleted'].indexOf(o.status) === -1; }
  window.orderNotifMarkSeen = orderNotifMarkSeen;

  function maybeShowOrderNotifications() {
    var me = getCurrentUser();
    if (ORDER_NOTIF_GROUP.indexOf(me) === -1) return;
    if (window._orderNotifShown) return;
    var orders = (window.SHEET_DATA && window.SHEET_DATA.orders || []).filter(isApprovedOrder);
    var seen = orderNotifSeen();
    if (seen === null) { orderNotifMarkSeen(orders.map(function (o) { return o.id; })); return; }   // first run → seed, never flood
    var fresh = orders.filter(function (o) { return seen.indexOf(o.id) === -1 && o.createdBy !== me; });
    if (!fresh.length) return;
    window._orderNotifShown = true;
    showOrderNotifModal(fresh);
    orderNotifMarkSeen(fresh.map(function (o) { return o.id; }));
  }
  window.maybeShowOrderNotifications = maybeShowOrderNotifications;

  function showOrderNotifModal(orders) {
    if (document.getElementById('orderNotifModal')) return;
    var rows = orders.slice(0, 10).map(function (o) {
      var cust = orderType(o) === 'customer';
      var where = cust ? ('לקיבוץ ' + (orderKibbutz(o) || '—')) : ('מספק' + (o.supplier ? ' ' + String(o.supplier).replace(/</g, '&lt;') : ''));
      return '<div style="padding:6px 9px;background:#f8fafc;border-radius:8px;">' +
        (cust ? '🧑‍🌾 לקוח' : '🏭 ספק') + ' · ' + where + ' · ' + orderTotalQty(o) + ' פריטים</div>';
    }).join('');
    var more = orders.length > 10 ? '<div style="font-size:12px;color:#64748b;">+ עוד ' + (orders.length - 10) + '</div>' : '';
    var title = orders.length === 1 ? 'הזמנה חדשה אושרה' : (orders.length + ' הזמנות חדשות אושרו');
    var wrap = document.createElement('div');
    wrap.id = 'orderNotifModal';
    wrap.className = 'modal-backdrop open';   // shared modal system → inherits animation + mobile sizing
    wrap.style.zIndex = '100001';
    wrap.innerHTML = '<div class="modal" style="max-width:390px;text-align:center;">' +
      '<div style="font-size:32px;">🔔</div>' +
      '<h3 style="margin:6px 0 4px;color:#1d4ed8;">' + title + '</h3>' +
      '<div style="font-size:13px;color:#475569;margin-bottom:12px;">יש הזמנות חדשות לטיפול:</div>' +
      '<div style="text-align:right;display:flex;flex-direction:column;gap:5px;max-height:230px;overflow:auto;font-size:13px;font-weight:600;color:#334155;">' + rows + more + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;">' +
      '<button id="orderNotifShow" style="flex:1;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:11px;font-weight:800;cursor:pointer;font-size:14px;">📦 הצג הזמנות</button>' +
      '<button id="orderNotifClose" style="background:#f1f5f9;color:#475569;border:none;border-radius:8px;padding:11px 14px;font-weight:700;cursor:pointer;">סגור</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    document.getElementById('orderNotifShow').onclick = function () { wrap.remove(); if (typeof showPage === 'function') showPage('inventory'); };
    document.getElementById('orderNotifClose').onclick = function () { wrap.remove(); };
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
    let html = '<div style="overflow-x:auto;"><table class="inv-table"><thead><tr><th>תאריך</th><th>סוג</th><th>סטטוס</th><th>ספק / קיבוץ</th><th>פריטים</th><th>נוצר ע"י</th><th>הערות</th><th style="text-align:left;">פעולות על ההזמנה — שנה סטטוס ל:</th></tr></thead><tbody>';
    filtered.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach(o => {
      const date = (o.expectedDate || o.createdAt) ? new Date(o.expectedDate || o.createdAt).toLocaleDateString('he-IL') : '—';
      const delivered = o.deliveredAt ? '<div style="font-size:10px;color:#059669;white-space:nowrap;">📦 סופק: ' + new Date(o.deliveredAt).toLocaleDateString('he-IL') + '</div>' : '';
      const status = ORDER_STATUSES[o.status] || { label: o.status, color: '#94a3b8' };
      const itemsStr = (o.items || []).map(i => `${i.name} ×${i.qty}`).join('<br>');
      const isCust = orderType(o) === 'customer';
      const typeChip = isCust
        ? '<span style="font-size:10px;font-weight:700;color:#0369a1;background:#e0f2fe;border-radius:8px;padding:2px 7px;white-space:nowrap;">🧑‍🌾 לקוח</span>'
        : `<span style="font-size:10px;font-weight:700;color:#9a3412;background:#ffedd5;border-radius:8px;padding:2px 7px;white-space:nowrap;">🏭 ספק${orderNeedsAmichai(o) ? ' 10+' : ''}</span>`;
      const who = (isCust ? ('🧑‍🌾 ' + ((orderKibbutz(o) || 'לקוח').replace(/</g, '&lt;'))) : (o.supplier ? o.supplier.replace(/</g, '&lt;') : '—'))
        + (isCust && o.assignee ? '<div style="font-size:10px;color:#5b21b6;white-space:nowrap;">👤 אחראי: ' + String(o.assignee).replace(/</g, '&lt;') + '</div>' : '');
      // customer orders never enter the supplier pipeline (their terminal state is 'supplied' via approval)
      const quick = isCust ? null : getOrderQuickAction(o.status);
      const quickBtn = quick
        ? `<button class="inv-btn small" style="background:${quick.bg};color:${quick.fg};border:1px solid ${quick.fg};" onclick="quickOrderStatus('${o.id}','${quick.next}',this)">${quick.label}</button>`
        : '';
      const stuckBtn = (!isCust && o.status !== 'delivered' && o.status !== 'supplied' && o.status !== 'stuck' && o.status !== 'pending_approval')
        ? `<button class="inv-btn small" style="background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:10px;" onclick="quickOrderStatus('${o.id}','stuck',this)" title="סמן כתקוע">🟠</button>`
        : '';
      // Awaiting approval: only the right approver (per type/size) sees the button; others see who it waits for.
      let approvalCell = '';
      if (o.status === 'pending_approval') {
        approvalCell = canApproveThisOrder(o)
          ? `<button class="inv-btn small" style="background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;font-weight:700;" onclick="approveOrder('${o.id}',this)">✅ ${isCust ? 'אשר ואספק' : 'אשר'}</button>`
          : `<span style="font-size:10px;color:#7c3aed;">${approvalWaitingMsg(o)}</span>`;
      }
      html += `<tr>
        <td data-label="תאריך" style="white-space:nowrap;">${date}${delivered}</td>
        <td data-label="סוג">${typeChip}</td>
        <td data-label="סטטוס"><span class="status-pill-inv status-${o.status}">${status.label}</span></td>
        <td data-label="ספק / קיבוץ">${who}</td>
        <td data-label="פריטים">${itemsStr || '—'}</td>
        <td data-label="נוצר ע&quot;י">${o.createdBy || '—'}</td>
        <td data-label="הערות" style="max-width:200px;font-size:11px;">${(o.notes || '').replace(/</g,'&lt;')}</td>
        <td class="actions-cell" style="white-space:nowrap;text-align:left;">${approvalCell} ${quickBtn} ${stuckBtn} ${isCust ? `<button class="inv-btn small" style="background:#1b2a4a;" onclick="certFromOrder('${o.id}')" title="תעודת משלוח">🚚</button>` : ''} <button class="inv-btn small" onclick="invEditOrder('${o.id}')">✏️ ערוך</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  let invOrderItems = [];
  // fill the customer-order kibbutz picker from the live cards (same source as the intake flow)
  function invPopulateOrderKibbutz(selected) {
    var ksel = document.getElementById('invOrderKibbutz');
    if (!ksel) return;
    var names = Array.from(document.querySelectorAll('.kibbutz')).map(function (c) { return c.dataset.name; }).filter(Boolean).sort(function (a, b) { return a.localeCompare(b, 'he'); });
    ksel.innerHTML = '<option value="">-- בחר קיבוץ --</option>' + names.map(function (n) { return '<option value="' + n + '"' + (n === selected ? ' selected' : '') + '>' + n + '</option>'; }).join('');
  }
  // ספק vs לקוח toggle → show the right fields (supplier name vs kibbutz; raw-request box only for a new לקוח)
  window.invSetOrderType = function (t) {
    window._invOrderType = t;
    document.querySelectorAll('.inv-ordtype-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.t === t); });
    var isCust = t === 'customer';
    var sw = document.getElementById('invOrderSupplierWrap'); if (sw) sw.style.display = isCust ? 'none' : '';
    var kw = document.getElementById('invOrderKibbutzWrap'); if (kw) kw.style.display = isCust ? '' : 'none';
    // אחראי picker — customer orders, עידן/עמיחי only (they hand the supply responsibility; default = approver)
    var aw = document.getElementById('invOrderAssigneeWrap'); if (aw) aw.style.display = (isCust && typeof getCurrentUser === 'function' && ['עידן', 'עמיחי'].indexOf(getCurrentUser()) !== -1) ? '' : 'none';
    var rw = document.getElementById('invOrderRawWrap'); if (rw) rw.style.display = (!window.invEditingOrderId) ? '' : 'none';   // AI text box on every new order (ספק + לקוח)
    // customer orders never enter the supplier pipeline — hide those statuses in the edit picker
    // (otherwise setting 'delivered'+distribution would post INBOUND stock for goods that left)
    var st = document.getElementById('invOrderStatus');
    if (st) {
      var suppOnly = { pending: 1, in_transit: 1, stuck: 1, at_port: 1, arrived: 1, delivered: 1 };
      Array.prototype.forEach.call(st.options, function (op) { var h = isCust && !!suppOnly[op.value]; op.hidden = h; op.disabled = h; });
    }
  };
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
    document.getElementById('invOrderDate').value = todayYmd();
    document.getElementById('invOrderNotes').value = '';
    document.getElementById('invOrderStatus').value = 'pending';
    document.getElementById('invOrderCreatedBy').value = (typeof getCurrentUser === 'function' ? getCurrentUser() : '') || '';
    const rawEl = document.getElementById('invOrderRaw');
    if (rawEl) rawEl.value = '';
    const srcEl = document.getElementById('invParseSource'); if (srcEl) srcEl.innerHTML = '';   // clear stale parse-source badge
    // New orders ALWAYS open as "ממתינה לאישור" — hide the status picker, show the note + raw box.
    document.getElementById('invOrderStatusWrap').style.display = 'none';
    document.getElementById('invOrderNewStatusNote').style.display = '';
    var _ttr = document.querySelector('.inv-ordtype-row'); if (_ttr) _ttr.style.display = '';   // type toggle — new orders only
    var _asg = document.getElementById('invOrderAssignee'); if (_asg) _asg.value = '';
    invPopulateOrderKibbutz('');
    invSetOrderType('supplier');   // default; controls supplier/kibbutz/raw-box visibility
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
    document.getElementById('invOrderDate').value = (o.orderDate || o.expectedDate || o.createdAt || '').slice(0,10);
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
    var _ttr2 = document.querySelector('.inv-ordtype-row'); if (_ttr2) _ttr2.style.display = 'none';   // type is fixed on edit
    var _asg2 = document.getElementById('invOrderAssignee'); if (_asg2) _asg2.value = o.assignee || '';
    invPopulateOrderKibbutz(orderKibbutz(o));
    invSetOrderType(orderType(o));
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
    const myStock = updaterStockMap();   // current stock of whoever is filling the order — shown per existing item
    wrap.innerHTML = invOrderItems.map((it, idx) => {
      // Unresolved "choose by click" row (e.g. power supply: פס-דין / שקע) — pick by button, no dropdown.
      if (Array.isArray(it.choose) && !it.name) {
        return `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;background:#fff7ed;border:1px solid #fdba74;padding:6px 8px;border-radius:6px;flex-wrap:wrap;">
        <span style="font-weight:700;font-size:12px;color:#9a3412;flex:1;min-width:120px;">⚡ ${it.label || 'בחר סוג'}:</span>
        ${it.choose.map((c, ci) => `<button type="button" onclick="invChooseProduct(${idx}, ${ci})" style="font-size:12px;font-weight:700;background:#fff;color:#9a3412;border:1px solid #fb923c;border-radius:6px;padding:4px 12px;cursor:pointer;">${psLabel(c)}</button>`).join('')}
        <input type="number" min="1" value="${it.qty}" onchange="invOrderItems[${idx}].qty = parseInt(this.value) || 1" style="width:64px;padding:3px 6px;border-radius:4px;border:1px solid #fb923c;text-align:center;" title="כמות">
        <button onclick="invOrderItems.splice(${idx}, 1); renderOrderItems(); invToggleDistribution();" style="background:#dc2626;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">×</button>
      </div>`;
      }
      const inCatalog = options.includes(it.name);
      const have = inCatalog ? (myStock[it.name] || 0) : null;   // updater's current stock for this item
      const stockBadge = have !== null
        ? `<span title="במלאי של ${(orderUpdater() || 'הממלא').replace(/"/g,'')}" style="font-size:11px;font-weight:700;white-space:nowrap;color:${have > 0 ? '#0369a1' : '#b91c1c'};background:${have > 0 ? '#e0f2fe' : '#fee2e2'};border-radius:8px;padding:2px 7px;">📦 ${have}</span>`
        : '';
      return `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;background:${inCatalog ? 'white' : '#fffbeb'};border:1px solid ${inCatalog ? 'transparent' : '#fcd34d'};padding:5px 8px;border-radius:6px;">
        ${inCatalog ? '' : '<span title="פריט שאינו בקטלוג — לא יקושר למלאי. בחר מהרשימה או הוסף אותו במסך המוצרים." style="cursor:help;font-size:14px;">⚠️</span>'}
        <select onchange="invOrderItems[${idx}].name = this.value" style="flex:1;padding:4px 6px;border-radius:4px;border:1px solid #e2e8f0;">
          ${options.map(n => `<option value="${n}" ${it.name === n ? 'selected' : ''}>${n}</option>`).join('')}
          ${inCatalog ? '' : `<option selected value="${it.name}">${it.name} — לא בקטלוג</option>`}
        </select>
        ${stockBadge}
        <input type="number" min="1" value="${it.qty}" onchange="invOrderItems[${idx}].qty = parseInt(this.value) || 1" style="width:70px;padding:3px 6px;border-radius:4px;border:1px solid #e2e8f0;text-align:center;">
        <button onclick="invOrderItems.splice(${idx}, 1); renderOrderItems(); invToggleDistribution();" style="background:#dc2626;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">×</button>
      </div>`;
    }).join('');
  }
  // Short button label for a power-supply (or other choose) candidate.
  function psLabel(name) {
    if (/פס.?דין/.test(name)) return '📥 פס-דין';
    if (/שקע/.test(name)) return '🔌 שקע';
    return name.replace(/^ספק כוח\s*/, '') || name;
  }
  // Who is filling/updating this order (the "createdBy" select, else the logged-in user).
  function orderUpdater() {
    return ((document.getElementById('invOrderCreatedBy') || {}).value || '').trim()
      || (typeof getCurrentUser === 'function' ? (getCurrentUser() || '') : '');
  }
  // The updater's current stock as { productName: qty } (their own bag/location from movements).
  function updaterStockMap() {
    try { return (typeof computeStock === 'function' ? (computeStock()[orderUpdater()] || {}) : {}); }
    catch (e) { return {}; }
  }
  // Badge showing which engine parsed the text: Gemini (spark) / Groq / Offline. src = window._lastParseSource.
  function parseSourceBadge(src) {
    src = src || '';
    var model = src.indexOf(':') !== -1 ? src.split(':')[1] : '';
    var pill = function (bg, fg, icon, label) {
      return '<span style="display:inline-flex;align-items:center;gap:5px;background:' + bg + ';color:' + fg +
        ';border-radius:10px;padding:3px 10px;font-weight:700;font-size:11px;line-height:1.4;">' + icon +
        '<span>' + label + (model ? ' · ' + model : '') + '</span></span>';
    };
    if (/^gemini/i.test(src)) {
      var spark = '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style="flex:none;">' +
        '<defs><linearGradient id="gemSpark" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#4285F4"/><stop offset=".5" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/>' +
        '</linearGradient></defs><path d="M12 2c.4 4.9 3.1 7.6 8 8-4.9.4-7.6 3.1-8 8-.4-4.9-3.1-7.6-8-8 4.9-.4 7.6-3.1 8-8z" fill="url(#gemSpark)"/></svg>';
      return pill('#eef2ff', '#3730a3', spark, 'Gemini');
    }
    if (/^groq/i.test(src)) {
      var q = '<span style="font-weight:800;color:#fff;background:#f55036;border-radius:4px;padding:0 4px;font-size:10px;flex:none;">q</span>';
      return pill('#fff1ed', '#b3340f', q, 'Groq');
    }
    if (!src) return '';   // nothing parsed yet
    return pill('#f1f5f9', '#475569', '📴', 'Offline — מנתח מקומי');
  }
  // Resolve a "choose by click" row to the picked product.
  window.invChooseProduct = function (itemIdx, choiceIdx) {
    var it = invOrderItems[itemIdx];
    if (!it || !Array.isArray(it.choose)) return;
    it.name = it.choose[choiceIdx];
    delete it.choose; delete it.label;
    renderOrderItems();
    invToggleDistribution();
  };
  function ctrlLabel(name) {
    if (/robustel/i.test(name)) return '🛰️ Robustel';
    if (/pusr|purs/i.test(name)) return '📟 PUSR';
    return name;
  }

  // ===== Conversational question modal — "the app asks, you tap" (replaces dropdowns for choices) =====
  let _orderQResolve = null;
  // opts: { title, question, options:[{label,value,hint}], progress }. Resolves to the chosen value (or null).
  function askChoice(opts) {
    return new Promise(function (resolve) {
      _orderQResolve = resolve;
      window._orderQOptions = opts.options || [];
      document.getElementById('orderQProgress').textContent = opts.progress || '';
      document.getElementById('orderQTitle').textContent = opts.title || '';
      document.getElementById('orderQText').textContent = opts.question || '';
      document.getElementById('orderQOptions').innerHTML = (opts.options || []).map(function (o, i) {
        return '<button type="button" onclick="_orderQPick(' + i + ')" ' +
          'style="text-align:right;width:100%;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;padding:12px 14px;cursor:pointer;transition:.15s;" ' +
          'onmouseover="this.style.borderColor=\'#6366f1\';this.style.background=\'#eef2ff\';" onmouseout="this.style.borderColor=\'#e2e8f0\';this.style.background=\'#f8fafc\';">' +
          '<div style="font-weight:800;font-size:15px;color:#1e293b;">' + o.label + '</div>' +
          (o.hint ? '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + o.hint + '</div>' : '') +
          '</button>';
      }).join('');
      document.getElementById('orderQModal').classList.add('open');
    });
  }
  window._orderQPick = function (i) {
    var o = (window._orderQOptions || [])[i];
    document.getElementById('orderQModal').classList.remove('open');
    var r = _orderQResolve; _orderQResolve = null;
    if (r) r(o ? o.value : null);
  };

  // Customer orders: derive accessories from the meters, asking the user for the controller + power-supply TYPE.
  // Idempotent: strips its own previously-added rows (tagged auto) and recomputes, so re-parsing is safe.
  async function finalizeCustomerAccessories() {
    invOrderItems = invOrderItems.filter(function (it) { return !it.auto; });
    const catalog = getActiveProducts().map(function (p) { return p.name; });
    const _st = updaterStockMap();   // updater's current stock — shown as a hint on each controller option
    const plan = accessoryPlan(invOrderItems);
    const pushAuto = function (name, qty) { if (name && qty > 0) invOrderItems.push({ name: name, qty: qty, auto: true }); };

    // 1) controller (type chosen) — one per non-Landis meter
    if (plan.controllersToAdd > 0) {
      const ctrlOpts = catalog.filter(function (n) { return /robustel|pusr|purs/i.test(n); });
      let chosen = ctrlOpts[0];
      if (ctrlOpts.length >= 2) {
        chosen = await askChoice({
          title: '🎛️ בחירת בקר', progress: 'שאלה 1 מ-2',
          question: 'יש ' + plan.nonLandisMeterQty + ' מונים שאינם לנדיס — לכל אחד נדרש בקר. איזה בקר להוסיף?',
          options: ctrlOpts.map(function (c) { return { label: ctrlLabel(c), value: c, hint: c + ' · במלאי שלך: ' + (_st[c] || 0) }; }),
        });
      }
      pushAuto(chosen, plan.controllersToAdd);
    }
    // 2) SIM (Partner default) — Landis meters + all controllers
    pushAuto(catalog.find(function (n) { return /סים|\bsim\b/i.test(n) && !/cellcom/i.test(n); }), plan.simQty);
    // 3) antenna — per controller
    pushAuto(catalog.find(function (n) { return /אנטנה|antenna/i.test(n); }), plan.antennaQty);
    // 4) power supply (type chosen) — per controller
    if (plan.psQty > 0) {
      const psOpts = catalog.filter(function (n) { return /ספק כוח/.test(n); });
      let chosen = psOpts[0];
      if (psOpts.length >= 2) {
        chosen = await askChoice({
          title: '⚡ בחירת ספק כוח', progress: 'שאלה 2 מ-2',
          question: 'נדרש ספק כוח ל-' + plan.totalControllers + ' בקרים. איזה סוג?',
          options: psOpts.map(function (p) { return { label: psLabel(p), value: p, hint: p }; }),
        });
      }
      pushAuto(chosen, plan.psQty);
    }
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

  // "סאטק" with no model → ambiguous → ask which Satec (EM133 / PM135). "רגיל"/"133"/"שנאי" etc. = not ambiguous.
  async function resolveAmbiguousSatec(raw) {
    const norm = intakeNormalize(raw);
    if (!/סאטק|satec/.test(norm)) return;
    if (/133|135|em133|pm135|שנאי|מקביל|רגיל|תלת|חד/.test(norm)) return;   // a qualifier was given → no need to ask
    const satecItem = invOrderItems.find(it => /satec|em133|pm135/i.test(it.name) && !it.auto);
    if (!satecItem) return;
    const opts = getActiveProducts().map(p => p.name).filter(n => /satec|em133|pm135/i.test(n));
    if (opts.length < 2) return;
    const _st = updaterStockMap();
    const chosen = await askChoice({
      title: '🔌 איזה סאטק?', progress: 'הבהרה',
      question: 'ביקשת "סאטק" בלי לציין דגם. איזה מונה התכוונת?',
      options: opts.map(o => ({ label: o, value: o, hint: (/pm135/i.test(o) ? 'מונה שנאי / משני-זרם' : 'תלת-פאזי רגיל') + ' · במלאי שלך: ' + (_st[o] || 0) })),
    });
    if (chosen) invOrderItems.forEach(it => { if (/satec|em133|pm135/i.test(it.name) && !it.auto) it.name = chosen; });
  }

  // Parse the raw customer-requirement text into order items (AI when available, local fallback).
  async function orderParseRaw(btn) {
    const raw = (document.getElementById('invOrderRaw').value || '').trim();
    if (!raw) { alert('הדבק תחילה את טקסט הדרישה'); return; }
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '🧠 מנתח...'; }
    try {
      const otype = window._invOrderType || 'supplier';
      const items = await parseRawToItems(raw, otype);
      // Show which engine answered — a persistent badge (Gemini / Groq / Offline) + a brief toast.
      var _src = window._lastParseSource || '';
      var _badge = document.getElementById('invParseSource');
      if (_badge) _badge.innerHTML = parseSourceBadge(_src);
      var _t = document.getElementById('toast');
      if (_t) {
        _t.textContent = (_src && _src !== 'local') ? ('🤖 נותח ע"י AI — ' + _src) : '📴 נותח מקומית (ללא AI — לא מחובר/שגיאה)';
        _t.classList.add('show'); setTimeout(function () { _t.classList.remove('show'); }, 3500);
      }
      if (!items.length) { alert('לא זוהו פריטים מהטקסט — הוסף ידנית.'); return; }
      items.forEach(it => {
        const exists = invOrderItems.find(i => i.name === it.name && !i.auto);
        if (exists) exists.qty += it.qty;
        else invOrderItems.push({ name: it.name, qty: it.qty });
      });
      await resolveAmbiguousSatec(raw);   // ask "איזה סאטק?" if the text was generic (both order types)
      // Customer orders: derive accessories conversationally (controller + power-supply are user choices).
      if (otype === 'customer') await finalizeCustomerAccessories();
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
    if (status !== 'delivered' || invOrderItems.length === 0 || window._invOrderType === 'customer') {
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
    if (invOrderItems.some(it => !it.name || (it.choose && it.choose.length))) { alert('יש שורת ספק כוח שטרם נבחר סוגה — בחר פס-דין או שקע'); return; }
    const createdBy = document.getElementById('invOrderCreatedBy').value;
    if (!createdBy && !window.invEditingOrderId) { alert('נא לבחור מי יוצר את ההזמנה'); return; }
    const otype = window._invOrderType || 'supplier';
    const okib = ((document.getElementById('invOrderKibbutz') || {}).value || '').trim();
    if (otype === 'customer' && !window.invEditingOrderId && !okib) { alert('נא לבחור קיבוץ להזמנת לקוח'); return; }
    // Reconcile non-catalog items conversationally: add each to the catalog, or drop the line.
    const _catNames = getActiveProducts().map(p => p.name);
    const _unknown = [...new Set(invOrderItems.filter(it => it.name && _catNames.indexOf(it.name) === -1).map(it => it.name))];
    const _toCatalog = [];
    for (const nm of _unknown) {
      const ans = await askChoice({
        title: '🆕 פריט שאינו בקטלוג', progress: 'אישור פריטים',
        question: 'הפריט "' + nm + '" לא קיים בקטלוג המוצרים. מה לעשות?',
        options: [
          { label: '➕ הוסף לקטלוג', value: 'add', hint: 'יישמר ויינוהל במלאי מעכשיו' },
          { label: '🗑️ הסר מההזמנה', value: 'remove', hint: 'השורה תימחק וההזמנה תימשך כרגיל' },
        ],
      });
      if (ans === 'add') _toCatalog.push(nm);
      else { for (let i = invOrderItems.length - 1; i >= 0; i--) { if (invOrderItems[i].name === nm) invOrderItems.splice(i, 1); } }
    }
    if (!invOrderItems.length) { alert('לא נותרו פריטים בהזמנה.'); renderOrderItems(); invToggleDistribution(); return; }
    // Create the approved new products so they enter inventory management.
    for (const nm of _toCatalog) {
      try { await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ type: 'product', name: nm, category: '', active: true }) }); } catch (e) { /* non-blocking */ }
    }
    setBtnLoading(btn, true);
    let status = document.getElementById('invOrderStatus').value;
    if (!window.invEditingOrderId) {
      status = 'pending_approval';   // ponytail: new orders are ALWAYS hardcoded to await approval
    } else if (status === 'delivered' && !window.invDistributionTouched) {
      // "סופקה" chosen but distribution never set → no stock movements would post. Confirm instead of
      // SILENTLY downgrading to 'arrived', so the user knows the stock won't update (and can cancel to
      // set the distribution first).
      if (!confirm('סימנת "סופקה" אך לא הגדרת חלוקה — המלאי לא יתעדכן.\nלשמור כ"התקבל" (ללא עדכון מלאי)?\nבטל כדי להגדיר חלוקה ואז לשמור.')) { setBtnLoading(btn, false); return; }
      status = 'arrived';   // saved as 'arrived' (pink) — no movements yet
    }
    let notes = document.getElementById('invOrderNotes').value.trim();
    const rawReq = (document.getElementById('invOrderRaw')?.value || '').trim();
    if (!window.invEditingOrderId && rawReq) {
      notes = (notes ? notes + '\n\n' : '') + '📥 דרישת לקוח גולמית:\n' + rawReq;
    }
    const body = {
      type: 'order',
      orderType: otype,
      supplier: document.getElementById('invOrderSupplier').value.trim(),
      expectedDate: document.getElementById('invOrderDate').value,   // persisted to the existing expected_date column = "תאריך הזמנה"
      notes: notes,
      status: status,
      items: invOrderItems.map(it => ({ name: it.name, qty: it.qty })),
      createdBy: createdBy
    };
    if (window.invEditingOrderId) body.id = window.invEditingOrderId;
    if (otype === 'customer' && okib) body.kibbutz = okib;
    // אחראי (עידן's picker) — sent only when non-empty, so order saves keep working until
    // db/orders_schedule_fields.sql adds the `assignee` column (setting one before that errors loudly).
    var _asgVal = (document.getElementById('invOrderAssignee') || {}).value || '';
    if (otype === 'customer' && _asgVal) body.assignee = _asgVal;
    if (status === 'delivered' && window.invDistribution) body.distribution = window.invDistribution;

    try {
      const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      const res = await r.json();
      if (!res.ok) { alert('שגיאה: ' + JSON.stringify(res)); return; }

      // LEARN: every text-based order → save {raw → accepted BASE items} as a parse-order few-shot example.
      // Exclude auto-added accessories (the AI should output base products only; the app derives accessories).
      // A newly catalog-added product is a base item → it's in the example, so the AI learns to recognise it.
      if (rawReq) {
        try {
          const learnItems = invOrderItems.filter(it => !it.auto && it.name).map(i => ({ name: i.name, qty: i.qty }));
          if (learnItems.length) fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ type: 'parseCorrection', rawText: rawReq, items: learnItems, createdBy: createdBy }) });
        } catch (e) { /* non-blocking */ }
      }

      // If delivered (green), create movement events. 'arrived' (pink) does NOT create movements.
      // Skip if the order was ALREADY delivered before this edit — movements exist, don't duplicate.
      if (status === 'delivered' && body.distribution && window.invOrigOrderStatus !== 'delivered') {
        const movementPromises = [];
        Object.entries(body.distribution).forEach(([productName, locs]) => {
          Object.entries(locs).forEach(([loc, qty]) => {
            if (productName && qty > 0) {   // skip empty/blank product names → no orphan movement rows
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
      // On a FRESH delivery, mark every requirement already linked to this order as fulfilled.
      // Skip when the order was already delivered before this edit — they're already fulfilled,
      // so re-saving shouldn't re-POST them.
      if (status === 'delivered' && orderId && window.invOrigOrderStatus !== 'delivered') {
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

