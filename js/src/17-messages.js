  // ═══════════════════════════════════════════════════════════════════════════
  // ✉️ הודעה לעובד — the Supabase `messages` table.
  // ---------------------------------------------------------------------------
  // Extracted verbatim from the retired js/src/17-staff.js (spec §7m R5, controller ruling 4,
  // 19.9): the עובדים PAGE is gone, the messaging is not. It never depended on that page —
  // `staffCheckMessages()` fires unconditionally on every load and shows the current user their
  // unread messages once per session, which is the half of this feature people actually notice.
  //
  // What changed: only WHERE a message is composed. The page's `#msgTo_<person>` inputs are
  // gone; the compose is one ⋯ עוד row (app/src/islands/MessageSheet.tsx, round 5 X-L7 — moved
  // out of Ctrl+K before it was deleted → `sigma.staffSendMessage`).
  // The four data functions and the popup below are byte-identical to what 17-staff.js shipped.
  // ═══════════════════════════════════════════════════════════════════════════

  function _staffHeaders(json) {
    const tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : SB_ANON;
    const h = { apikey: SB_ANON, Authorization: 'Bearer ' + tok };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  function _staffEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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

  // Send + tell the sender it went. The TEXT is an argument now: it used to be read out of the
  // staff page's `#msgTo_<person>` input, and that page is retired.
  async function staffSendMessageUI(person, text) {
    const msg = String(text == null ? '' : text).trim();
    if (!msg) { alert('נא לכתוב הודעה'); return false; }
    try {
      await staffSendMessage(person, msg);
      if (typeof emsToast === 'function') emsToast('✉️ ההודעה נשלחה ל' + person); else alert('ההודעה נשלחה');
      return true;
    } catch (e) {
      alert('שגיאה בשליחה: ' + e.message);
      return false;
    }
  }

  // Login-time popup: show the current user their unread messages, once per session.
  //
  // round 5, L4: once `StaffMessages.tsx` (U13) is up it sets `window.__sigmaStaffMessagesReady`
  // and listens for `sigma-staff-unread` — this function then hands it the rows instead of
  // building the DOM popup itself, and the island decides how to show them and when to call
  // `staffMarkRead`. Until that chunk lands (or if it fails to), the legacy popup is still the
  // fallback: a failed lazy import must never leave unread messages unseen.
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

    if (window.__sigmaStaffMessagesReady) {
      try { window.dispatchEvent(new CustomEvent('sigma-staff-unread', { detail: { messages: msgs } })); } catch (e) { /* no DOM */ }
      return;
    }

    var _ex = document.getElementById('msgPopup'); if (_ex) _ex.remove();
    const ids = msgs.map(m => m.id);
    const ov = document.createElement('div');
    ov.id = 'msgPopup';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = `<div style="background:var(--card);color:var(--text);border-radius:16px;max-width:440px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="margin:0 0 12px;">✉️ יש לך ${msgs.length} הודעות חדשות</h3>
      <div style="max-height:50vh;overflow:auto;">${msgs.map(m => `<div style="background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:14px;white-space:pre-wrap;">${_staffEsc(m.text)}</div>
        <div style="font-size:11px;color:var(--text-light);margin-top:4px;">מאת ${_staffEsc(m.from_person || '?')} · ${new Date(m.created_at).toLocaleString('he-IL')}</div>
      </div>`).join('')}</div>
      <button class="inv-btn" style="margin-top:8px;width:100%;" onclick="document.getElementById('msgPopup').remove();staffMarkRead([${ids.join(',')}]);">קראתי, סגור</button>
    </div>`;
    document.body.appendChild(ov);
    } finally { window._msgsChecking = false; }
  }

  window.staffSendMessage = staffSendMessage;
  window.staffSendMessageUI = staffSendMessageUI;
  window.staffCheckMessages = staffCheckMessages;
  window.staffFetchMessages = staffFetchMessages;
  window.staffMarkRead = staffMarkRead;
  // returning sessions (identity already stored): check shortly after the snapshot loads.
  setTimeout(function () { try { staffCheckMessages(); } catch (e) {} }, 2500);
