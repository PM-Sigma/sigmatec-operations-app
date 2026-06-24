  // ===== MEETING MODE — personal UX boost for Idan during the team meeting =====
  // Doesn't lock anyone out. Just makes updates faster locally for the active user.
  function isMeetingMode() { return localStorage.getItem('meeting_mode_v1') === '1'; }
  function toggleMeetingMode() {
    const cur = isMeetingMode();
    localStorage.setItem('meeting_mode_v1', cur ? '0' : '1');
    document.body.classList.toggle('meeting-mode', !cur);
    updateMeetingBadge();
    if (!cur) {
      // Entering meeting mode: auto-expand all collapsed sections for fast scanning
      document.querySelectorAll('.section-body.collapsed').forEach(b => b.classList.remove('collapsed'));
      document.querySelectorAll('.section-toggle').forEach(t => t.textContent = '▼');
      if (typeof applyCardLastVisit === 'function') applyCardLastVisit();   // ensure last-visit lines are present
      setTimeout(() => { const s = document.getElementById('searchInput'); if (s) s.focus(); }, 100);   // fast find
    }
    const t = document.getElementById('toast');
    t.textContent = cur ? '🔓 מצב ישיבה כובה' : '🚀 מצב ישיבה הופעל — הטופס מהיר יותר';
    t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
  }
  function updateMeetingBadge() {
    const btn = document.getElementById('meetingBadge');
    if (!btn) return;
    btn.textContent = isMeetingMode() ? '🚀 מצב ישיבה' : '💬 ישיבה';
    btn.style.background = isMeetingMode() ? '#10b981' : '';
    btn.style.color = isMeetingMode() ? 'white' : '';
  }
  // Always permits edit — meeting mode is now a personal boost, not a lock.
  function checkEditPermission() { return true; }

  // Lock editorName + visitor to the current user for everyone except Idan.
  // Idan can pick any name from the dropdowns.
  function applyUserRestrictions() {
    const user = getCurrentUser();
    const idan = isIdan();

    const editorWrap   = document.getElementById('editorNameWrap');
    const editorDisplay = document.getElementById('editorNameDisplay');
    const visitorWrap   = document.getElementById('visitorFieldWrap');
    const visitorDisplay = document.getElementById('visitorFieldDisplay');

    if (idan) {
      // Idan keeps free choice, but the fields DEFAULT to him (editable) so he
      // isn't forced to pick himself every time.
      if (editorWrap)   editorWrap.style.display   = 'none';   // [F] editor is always the logged-in user — never shown/picked
      if (editorDisplay) editorDisplay.style.display = 'none';
      if (visitorWrap)  visitorWrap.style.display   = '';
      if (visitorDisplay) visitorDisplay.style.display = 'none';
      const ed = document.getElementById('editorName');
      if (ed) ed.value = user;
      const vi = document.getElementById('visitor');
      if (vi && !vi.value) { vi.value = user; onVisitorChange(user); }
    } else {
      if (editorWrap)   editorWrap.style.display   = 'none';
      if (editorDisplay) editorDisplay.style.display = 'none';   // [F] no need to show who updates — always the logged-in user
      document.getElementById('editorName').value = user;

      if (visitorWrap)  visitorWrap.style.display   = 'none';
      if (visitorDisplay) {
        visitorDisplay.style.display = '';
        visitorDisplay.textContent   = '👤 מי ביקר: ' + (user || '—');
      }
      document.getElementById('visitor').value = user;
      onVisitorChange(user);
    }
  }

  // Returns the standard "loading" placeholder if data not yet loaded; null otherwise
  function invLoadingPlaceholder() {
    if (window.dataLoaded) return null;
    return '<div style="padding:30px;text-align:center;color:#64748b;"><span class="btn-spinner" style="color:#2563eb;width:18px;height:18px;border-width:3px;"></span><div style="margin-top:8px;font-size:13px;">⏳ טוען נתונים מהגיליון...</div></div>';
  }

  // ===== Returned defective equipment =====
  // Logged to the RETURNS sheet AND, on a new visit, moved out of the kibbutz to the
  // 'תקול' bucket (so the kibbutz matrix stops overstating; defective units don't re-enter available stock).
  let visitReturnedItems = [];
  function addReturnedItemRow() {
    visitReturnedItems.push({ name: getActiveProducts()[0]?.name || 'מונה E360PP', qty: 1, reason: '' });
    renderReturnedItems();
  }
  function renderReturnedItems() {
    const wrap = document.getElementById('visitReturnedList');
    if (!wrap) return;
    if (visitReturnedItems.length === 0) {
      wrap.innerHTML = '<div style="font-size:11px;color:#94a3b8;font-style:italic;">אין פריטים תקולים שהוחזרו</div>';
      return;
    }
    wrap.innerHTML = visitReturnedItems.map((r, idx) => `
      <div style="display:flex;gap:6px;align-items:center;margin:4px 0;background:white;padding:5px 8px;border-radius:6px;">
        <select onchange="visitReturnedItems[${idx}].name = this.value" style="flex:1;padding:3px 6px;border-radius:4px;border:1px solid #fecaca;font-size:11px;">
          ${getActiveProducts().map(pr => pr.name).map(p => `<option value="${p}" ${r.name === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${r.qty}" onchange="visitReturnedItems[${idx}].qty = parseInt(this.value)||1" style="width:50px;padding:3px;border-radius:4px;border:1px solid #fecaca;text-align:center;font-size:11px;">
        <input type="text" value="${(r.reason||'').replace(/"/g,'&quot;')}" placeholder="סיבה (קצר)" onchange="visitReturnedItems[${idx}].reason = this.value" style="flex:1.5;padding:3px 6px;border-radius:4px;border:1px solid #fecaca;font-size:11px;">
        <label title="תקין — להחזיר למלאי העובד המבקר. לא מסומן = תקול (יוצא מהמלאי)." style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:#15803d;white-space:nowrap;cursor:pointer;">
          <input type="checkbox" ${r.toStock ? 'checked' : ''} onchange="visitReturnedItems[${idx}].toStock = this.checked" style="cursor:pointer;">↩️ למלאי
        </label>
        <button type="button" onclick="visitReturnedItems.splice(${idx},1); renderReturnedItems();" style="background:#dc2626;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;">×</button>
      </div>
    `).join('');
  }

  function invRenderReturns() {
    const root = document.getElementById('invReturnsList');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const returns = (window.SHEET_DATA && window.SHEET_DATA.returns) || [];
    if (returns.length === 0) {
      root.innerHTML = `<div style="padding:24px;text-align:center;color:#64748b;">
        עדיין אין ציוד שהוחזר במעקב.<br>
        <small>כשיירשם בסיכום ביקור (תחת "🔧 ציוד שהוחזר"), הוא יופיע כאן — ותוכל להחזיר פריטים תקינים למלאי או לסמן כתקולים.</small>
      </div>`;
      return;
    }
    const open = returns.filter(r => (r.status || 'open') === 'open');
    const totalOpen = open.reduce((s,r) => s + (parseInt(r.qty)||0), 0);
    let html = `<div style="background:#eff6ff;padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:13px;">
      <strong>🔧 ממתינים להחלטה:</strong> ${totalOpen} פריטים. החזר פריט תקין למלאי, או סמן כתקול (נשאר מחוץ למלאי).
    </div>`;
    const STATUS_LABEL = { open: '🕒 ממתין', restocked: '✅ הוחזר למלאי', defective: '🔧 תקול' };
    html += '<table class="inv-table"><thead><tr><th>תאריך</th><th>קיבוץ</th><th>פריט</th><th>כמות</th><th>החזיר</th><th>סטטוס</th><th>פעולות</th></tr></thead><tbody>';
    returns.slice().sort((a,b) => (b.date||'').localeCompare(a.date||'')).forEach(r => {
      const st = r.status || 'open';
      const actions = (st === 'open')
        ? `<button class="inv-btn small success" onclick="returnToStock('${r.id}')">✅ החזר למלאי</button>
           <button class="inv-btn small warning" onclick="markReturnDefective('${r.id}')">🔧 תקול</button>`
        : '—';
      html += `<tr>
        <td data-label="תאריך" style="white-space:nowrap;">${r.date ? new Date(r.date).toLocaleDateString('he-IL') : '—'}</td>
        <td data-label="קיבוץ">${r.kibbutz || '—'}</td>
        <td data-label="פריט"><strong>${r.product || '—'}</strong></td>
        <td data-label="כמות">${r.qty || 0}</td>
        <td data-label="החזיר">${r.visitor || '—'}</td>
        <td data-label="סטטוס">${STATUS_LABEL[st] || st}</td>
        <td class="actions-cell" style="white-space:nowrap;">${actions}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  // Returned item is GOOD → add it back to available stock at a chosen location + mark restocked.
  async function returnToStock(retId) {
    if (!checkEditPermission()) return;
    const r = ((window.SHEET_DATA && window.SHEET_DATA.returns) || []).find(x => x.id === retId);
    if (!r) { alert('פריט החזרה לא נמצא'); return; }
    const qty = parseInt(r.qty) || 0;
    if (qty <= 0) { alert('כמות לא תקינה'); return; }
    const loc = prompt('לאיזה מיקום להחזיר את "' + r.product + '" (×' + qty + ')?\n' + INV_LOCATIONS.join(' / '), 'משרד');
    if (!loc) return;
    if (INV_LOCATIONS.indexOf(loc) === -1) { alert('מיקום לא מוכר. בחר מתוך: ' + INV_LOCATIONS.join(', ')); return; }
    try {
      const by = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
      await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'movement', product: r.product, fromLocation: '', toLocation: loc, quantity: qty, reason: 'return_restock', refId: retId, createdBy: by }) });
      await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'return', id: retId, status: 'restocked' }) });
      if (r) r.status = 'restocked';
      const t = document.getElementById('toast'); t.textContent = '✅ הוחזר למלאי (' + loc + ')';
      t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200);
      setTimeout(refreshData, 1000);
    } catch (e) { alert('שגיאה: ' + e.message); }
  }
  // Returned item is defective → stays out of stock; just record the decision.
  async function markReturnDefective(retId) {
    if (!checkEditPermission()) return;
    if (!confirm('לסמן את הפריט כתקול? הוא יישאר מחוץ למלאי הזמין.')) return;
    try {
      await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'return', id: retId, status: 'defective' }) });
      const r = ((window.SHEET_DATA && window.SHEET_DATA.returns) || []).find(x => x.id === retId);
      if (r) r.status = 'defective';
      setTimeout(refreshData, 800);
    } catch (e) { alert('שגיאה: ' + e.message); }
  }

  // ===== Save-button loading state =====
  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.origText = btn.innerHTML;
      btn.innerHTML = '<span class="btn-spinner"></span> שומר...';
      btn.disabled = true;
      btn.style.opacity = '0.7';
    } else {
      if (btn.dataset.origText) btn.innerHTML = btn.dataset.origText;
      btn.disabled = false;
      btn.style.opacity = '';
    }
  }

