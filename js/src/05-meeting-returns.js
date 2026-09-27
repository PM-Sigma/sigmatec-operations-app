  // מצב ישיבה (the search-field boost) retired 22.9 (עידן): after 2.00 it only enlarged the
  // search box. ▶ מצב ישיבה (islands/Presenter.tsx) is a different feature and stays.
  // Always permits edit — meeting mode is now a personal boost, not a lock.
  function checkEditPermission() {
    if (typeof isViewer === 'function' && isViewer()) { alert('👁 משתמש צפייה, אין הרשאת עריכה (דוחות בלבד)'); return false; }
    return true;
  }

  // applyUserRestrictions (locked editorName + visitor to the current user, legacy visit form)
  // is gone — round 5 V-U3. It had zero remaining callers once the form's #editorNameWrap /
  // #visitorFieldWrap / #editorName / #visitor elements were retired from index.html, and it
  // was the only caller of onVisitorChange (07-orders.js), also removed.

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
    visitReturnedItems.push({ name: getActiveProducts()[0]?.name || 'מונה Landis+Gyr E360PP', qty: 1, reason: '' });
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
      <div style="display:flex;gap:6px;align-items:center;margin:4px 0;background:var(--card);padding:5px 8px;border-radius:6px;">
        <select onchange="visitReturnedItems[${idx}].name = this.value" style="flex:1;padding:3px 6px;border-radius:4px;border:1px solid #fecaca;font-size:11px;">
          ${getActiveProducts().map(pr => pr.name).map(p => `<option value="${p}" ${r.name === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${r.qty}" onchange="visitReturnedItems[${idx}].qty = parseInt(this.value)||1" style="width:50px;padding:3px;border-radius:4px;border:1px solid #fecaca;text-align:center;font-size:11px;">
        <input type="text" value="${(r.reason||'').replace(/"/g,'&quot;')}" placeholder="סיבה (קצר)" onchange="visitReturnedItems[${idx}].reason = this.value" style="flex:1.5;padding:3px 6px;border-radius:4px;border:1px solid #fecaca;font-size:11px;">
        <label title="תקין: להחזיר למלאי העובד המבקר. לא מסומן = תקול (יוצא מהמלאי)." style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:#15803d;white-space:nowrap;cursor:pointer;">
          <input type="checkbox" ${r.toStock ? 'checked' : ''} onchange="visitReturnedItems[${idx}].toStock = this.checked" style="cursor:pointer;">↩️ למלאי
        </label>
        <button type="button" onclick="visitReturnedItems.splice(${idx},1); renderReturnedItems();" style="background:#dc2626;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;">×</button>
      </div>
    `).join('');
  }

  // invRenderReturns/returnToStock/markReturnDefective (legacy returns tab) deleted — U10.
  // Replaced by app/src/islands/InventoryReturns.tsx (U5).

  // The save-button loading state lives in js/src/00-guard.js now (fix round 3, F15):
  // ONE helper, a `label` argument instead of a hard-coded שומר..., shared by every module.

