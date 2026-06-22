  // ===========================================================
  // STAFF MANAGEMENT — עידן + עמיחי only (gated by canManageStaff()).
  // Per-employee: task load + breakdown, system-usage by actions, upcoming vacations,
  // progress, and leave-a-message (shown to the employee on their next login).
  // Analytics come from the loaded snapshot (window.SHEET_DATA); messages use a small
  // Supabase `messages` table via REST. No EMS dependency.
  // ===========================================================
  const STAFF_PEOPLE = ['עידן', 'אביאם', 'ניתאי', 'מתניה'];   // עמיחי (CEO) excluded — not a managed employee

  function canManageStaff() {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    return (typeof isIdan === 'function' && isIdan()) || me === 'עמיחי';
  }

  function _staffHeaders(json) {
    const tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : SB_ANON;
    const h = { apikey: SB_ANON, Authorization: 'Bearer ' + tok };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  async function staffSendMessage(toPerson, text) {
    const from = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    const r = await fetch(SB_URL + '/rest/v1/messages', {
      method: 'POST', headers: Object.assign(_staffHeaders(true), { Prefer: 'return=minimal' }),
      body: JSON.stringify({ to_person: toPerson, from_person: from, text: text })
    });
    if (!r.ok) throw new Error('שמירה נכשלה (' + r.status + ')');
  }
  async function staffFetchMessages(toPerson, unreadOnly) {
    let q = 'messages?select=*&to_person=eq.' + encodeURIComponent(toPerson) + '&order=created_at.desc';
    if (unreadOnly) q += '&read_at=is.null';
    const r = await fetch(SB_URL + '/rest/v1/' + q, { headers: _staffHeaders(false) });
    if (!r.ok) return [];
    return r.json();
  }
  async function staffMarkRead(ids) {
    if (!ids || !ids.length) return;
    try {
      await fetch(SB_URL + '/rest/v1/messages?id=in.(' + ids.join(',') + ')', {
        method: 'PATCH', headers: Object.assign(_staffHeaders(true), { Prefer: 'return=minimal' }),
        body: JSON.stringify({ read_at: new Date().toISOString() })
      });
    } catch (e) { /* best effort */ }
  }

  function staffStats(person) {
    const data = window.SHEET_DATA || {};
    const myTasks = (data.tasks || []).filter(t => (t.owners || []).indexOf(person) !== -1);
    const cats = { priority: 0, done: 0, pending: 0, new_client: 0 };
    myTasks.forEach(t => {
      const c = (typeof parseTaskField === 'function') ? (parseTaskField(t.task).cat || 'pending') : 'pending';
      cats[c] = (cats[c] || 0) + 1;
    });
    const visits = (data.visits || []).filter(v => v.visitor === person);
    const attendance = (data.attendance || []).filter(a => a.person === person);
    const edits = (data.tasks || []).filter(t => t.editor === person).length;
    const since30 = Date.now() - 30 * 86400000;
    const recentVisits = visits.filter(v => v.date && new Date(v.date).getTime() >= since30).length;
    const today0 = new Date(new Date().toDateString()).getTime();
    const upcomingVac = attendance
      .filter(a => (a.dayType === 'vacation' || a.dayType === 'reserve') && a.date && new Date(a.date).getTime() >= today0)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const total = myTasks.length;
    const progress = total ? Math.round((cats.done / total) * 100) : 0;
    return { total, cats, visits: visits.length, recentVisits, attendance: attendance.length, edits, upcomingVac, progress };
  }

  function _staffEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  const STAFF_ROLES = {
    'עידן':  { kind: 'ops',   title: 'מנהל מוצר ותפעול' },
    'אביאם': { kind: 'field', title: 'ראש צוות שטח' },
    'ניתאי': { kind: 'field', title: 'טכנאי שטח' },
    'מתניה': { kind: 'dev',   title: 'מפתח (משרד)' }
  };
  // company-wide go-live pipeline — counts from the rendered card grids (the real categorization)
  function staffPipeline() {
    const g = id => { const el = document.getElementById(id); return el ? el.querySelectorAll('.kibbutz').length : 0; };
    const live = g('grid-done'), priority = g('grid-priority'), pending = g('grid-pending'), nw = g('grid-new_client');
    const total = live + priority + pending + nw;
    return { live, priority, pending, new_client: nw, total, pctLive: total ? Math.round(live / total * 100) : 0 };
  }

  async function renderStaff() {
    const el = document.getElementById('staffContent');
    if (!el) return;
    if (!canManageStaff()) { el.innerHTML = '<div style="color:#991b1b;">אין הרשאה לעמוד זה.</div>'; return; }
    const CATL = { priority: '🔴 עדיפות', done: '✅ באוויר', pending: '⬜ ממתין', new_client: '🆕 חדש' };

    // unread message counts per person (best effort; empty if the table isn't created yet)
    const unreadByPerson = {};
    try {
      const r = await fetch(SB_URL + '/rest/v1/messages?select=to_person,read_at', { headers: _staffHeaders(false) });
      if (r.ok) (await r.json()).forEach(m => { if (!m.read_at) unreadByPerson[m.to_person] = (unreadByPerson[m.to_person] || 0) + 1; });
    } catch (e) { /* table may not exist yet */ }

    const pipe = staffPipeline();

    el.innerHTML = STAFF_PEOPLE.map(p => {
      const role = STAFF_ROLES[p] || { kind: 'field', title: '' };
      const s = staffStats(p);
      const e = _staffEsc(p);
      const ub = unreadByPerson[p] || 0;
      const vac = s.upcomingVac.length
        ? s.upcomingVac.slice(0, 3).map(v => (v.dayType === 'reserve' ? '🪖' : '🌴') + ' ' + new Date(v.date).toLocaleDateString('he-IL')).join(' · ')
        : '<span style="color:#94a3b8;">אין</span>';

      let body = '';
      if (role.kind === 'ops') {
        body = `
        <div style="font-size:12px;color:#64748b;margin:4px 0 6px;">צנרת העלאה לאוויר — כל החברה</div>
        <div style="background:#e2e8f0;border-radius:6px;height:10px;overflow:hidden;"><div style="background:#10b981;height:100%;width:${pipe.pctLive}%;"></div></div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">${pipe.live}/${pipe.total} עלו לאוויר (${pipe.pctLive}%)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-top:12px;font-size:13px;">
          <div>✅ באוויר: <strong>${pipe.live}</strong></div>
          <div>🔴 בעדיפות: <strong>${pipe.priority}</strong></div>
          <div>⬜ ממתינים: <strong>${pipe.pending}</strong></div>
          <div>🆕 חדשים: <strong>${pipe.new_client}</strong></div>
          <div>📝 עדכוני סטטוס שלי: <strong>${s.edits}</strong></div>
        </div>`;
      } else if (role.kind === 'field') {
        body = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:8px;font-size:13px;">
          <div>🚗 ביקורים: <strong>${s.visits}</strong> <span style="color:#94a3b8;">(${s.recentVisits} ב-30 יום)</span></div>
          <div>📋 קיבוצים באחריותי: <strong>${s.total}</strong></div>
          <div>📅 רישומי נוכחות: <strong>${s.attendance}</strong></div>
        </div>
        <div style="margin-top:10px;font-size:13px;">פירוט עומס: ${Object.keys(CATL).map(c => `${CATL[c]} <strong>${s.cats[c] || 0}</strong>`).join(' · ')}</div>
        <div style="margin-top:8px;font-size:13px;">חופשות/מילואים קרובים: ${vac}</div>${p === 'אביאם' ? '\n        <div style="margin-top:6px;font-size:12px;color:#64748b;">👥 מנהל את ניתאי</div>' : ''}`;
      } else {
        body = `
        <div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.8;">
          🧑‍💻 עומס משימות פיתוח — <span style="color:#94a3b8;">תצוגה בהמשך (ממתין למקור משימות הפיתוח)</span><br>
          🧾 תמיכה בעידן בסגירת חשבונות לקוחות בסוף חודש.
        </div>`;
      }

      return `<div class="card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <h3 style="margin:0;">👤 ${e} ${ub ? `<span class="badge priority">${ub} שלא נקראו</span>` : ''}</h3>
          <div style="font-size:12px;color:#64748b;">${_staffEsc(role.title)}</div>
        </div>
        ${body}
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">
          <input id="msgTo_${e}" placeholder="השאר הודעה ל${e} (תוצג בכניסה הבאה שלו)" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit;font-size:13px;">
          <button class="inv-btn small" onclick="staffSendMessageUI('${e}')">✉️ שלח</button>
        </div>
      </div>`;
    }).join('');
  }

  async function staffSendMessageUI(person) {
    const inp = document.getElementById('msgTo_' + person);
    if (!inp) return;
    const text = (inp.value || '').trim();
    if (!text) { alert('נא לכתוב הודעה'); return; }
    try {
      await staffSendMessage(person, text);
      inp.value = '';
      if (typeof emsToast === 'function') emsToast('✉️ ההודעה נשלחה ל' + person); else alert('ההודעה נשלחה');
      renderStaff();
    } catch (e) {
      alert('שגיאה בשליחה: ' + e.message + '\n(ייתכן שטבלת ההודעות עדיין לא נוצרה ב-Supabase)');
    }
  }

  // Login-time popup: show the current user their unread messages, once per session.
  async function staffCheckMessages() {
    if (window._msgsChecked || window._msgsChecking) return;
    window._msgsChecking = true;
    try {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    if (!me) return;
    let msgs;
    try { msgs = await staffFetchMessages(me, true); } catch (e) { return; }
    if (!msgs || !msgs.length) return;
    window._msgsChecked = true;
    var _ex = document.getElementById('msgPopup'); if (_ex) _ex.remove();
    const ids = msgs.map(m => m.id);
    const ov = document.createElement('div');
    ov.id = 'msgPopup';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:440px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="margin:0 0 12px;color:#1e40af;">✉️ יש לך ${msgs.length} הודעות חדשות</h3>
      <div style="max-height:50vh;overflow:auto;">${msgs.map(m => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:14px;white-space:pre-wrap;">${_staffEsc(m.text)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">מאת ${_staffEsc(m.from_person || '?')} · ${new Date(m.created_at).toLocaleString('he-IL')}</div>
      </div>`).join('')}</div>
      <button class="inv-btn" style="margin-top:8px;width:100%;" onclick="document.getElementById('msgPopup').remove();staffMarkRead([${ids.join(',')}]);">קראתי, סגור</button>
    </div>`;
    document.body.appendChild(ov);
    } finally { window._msgsChecking = false; }
  }

  window.staffSendMessageUI = staffSendMessageUI;
  window.staffCheckMessages = staffCheckMessages;
  window.staffMarkRead = staffMarkRead;
  // returning sessions (identity already stored): check shortly after the snapshot loads.
  setTimeout(function () { try { staffCheckMessages(); } catch (e) {} }, 2500);
