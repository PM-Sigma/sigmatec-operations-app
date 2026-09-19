  // ========== PRODUCTS — synced with visit checkboxes ==========
  function getActiveProducts() {
    const fromSheet = (window.SHEET_DATA && window.SHEET_DATA.products) || [];
    if (fromSheet.length === 0) return PRODUCT_LIST.map(name => ({ name, active: true, category: '' }));
    return fromSheet.filter(p => p.active);
  }

  function invRenderProducts() {
    const root = document.getElementById('invProductsList');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const products = (window.SHEET_DATA && window.SHEET_DATA.products) || [];
    if (products.length === 0) {
      root.innerHTML = `<div style="padding:20px;text-align:center;color:#64748b;">
        אין פריטים בגיליון עדיין. הפריטים בסיכום ביקור משתמשים ברשימה זמנית.<br>
        לחץ "+ פריט חדש" כדי לבנות את הקטלוג.
      </div>`;
      return;
    }
    // "שם לדוחות" is deliberately set aside — hairline border, muted header — because it is
    // edited once by עידן and only ever READ by the report generator (spec §3 placement rule).
    let html = '<table class="inv-table"><thead><tr><th>שם טכני</th><th>קטגוריה</th><th>פעיל</th>' +
      '<th style="border-right:1px solid #e2e8f0;color:#94a3b8;font-weight:500;">ניהולי · חד-פעמי<br>שם לדוחות</th>' +
      '<th>תצוגה בדוח</th><th>פעולות</th></tr></thead><tbody>';
    const wired = typeof reportWiringOk === 'function' ? reportWiringOk(products.filter(p => p.active)) : true;
    products.sort((a,b) => a.name.localeCompare(b.name, 'he')).forEach(p => {
      const preview = typeof reportPreview === 'function' ? reportPreview(p) : (p.display_name || p.name);
      html += `<tr>
        <td data-label="שם טכני"><strong>${p.name}</strong></td>
        <td data-label="קטגוריה">${p.category || '<span style="color:#94a3b8;">—</span>'}</td>
        <td data-label="פעיל">${p.active ? '✅' : '❌'}</td>
        <td data-label="שם לדוחות" style="border-right:1px solid #e2e8f0;color:#64748b;">${p.display_name && p.display_name !== p.name ? p.display_name : '<span style="color:#cbd5e1;">—</span>'}</td>
        <td data-label="תצוגה בדוח" style="font-size:12px;color:#64748b;">${preview}</td>
        <td class="actions-cell">
          <button class="inv-btn small" onclick="invEditProduct('${p.id}')">✏️ ערוך</button>
          <button class="inv-btn small ${p.active ? 'warning' : 'success'}" onclick="invToggleProductActive('${p.id}', ${!p.active})">${p.active ? 'השבת' : 'הפעל'}</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    // 🔗 status: computed from the SAME productLabel logic the exports use — red if any active
    // product would still render its technical name in a viewer export (spec §3 "make the wiring visible").
    html += `<div style="margin-top:8px;font-size:12px;font-weight:600;color:${wired ? '#16a34a' : '#dc2626'};">
      ${wired ? '🔗 מחובר למחולל הדוחות ✓' : '🔗 מחובר למחולל הדוחות — יש פריטים פעילים בלי שם לדוחות'}
    </div>`;
    root.innerHTML = html;
  }

  // Legacy mirror of app/src/lib/productLabel.ts — kept in lockstep by test-exports.mjs.
  function reportWiringOk(products) {
    return (products || []).every(p => !!(p.display_name && p.display_name.trim()));
  }
  function productLabel(p, opts) {
    opts = opts || {};
    const name = typeof p === 'string' ? p : ((p && p.name) || '');
    const display = typeof p === 'string' ? undefined : (p && p.display_name);
    // ONE viewer spelling (window.VIEWER_NAME) — audit A · A5. The old literal 'צופה' is
    // never what the login gate stores, so this branch could never fire.
    // ONE viewer spelling (window.VIEWER_NAME, js/src/00-bridge.js) — audit A · A5. The old
    // literal 'צופה' is never what the login gate stores, so that branch could never fire.
    // `opts.role &&` is load-bearing: without a bundle window.VIEWER_NAME is undefined, and
    // `undefined === undefined` would make EVERY call a report call.
    const viewerName = window.VIEWER_NAME || 'צפייה';
    const wantsDisplay = !!opts.forReport || (!!opts.role && (opts.role === 'viewer' || opts.role === viewerName));
    if (wantsDisplay && display && display.trim()) return display.trim();
    return name;
  }
  function reportPreview(p) { return productLabel(p, { forReport: true }); }
  window.productLabel = productLabel;
  window.reportWiringOk = reportWiringOk;
  window.reportPreview = reportPreview;

  // display_name is עידן-only (spec §3) — the row/field is present for everyone (so they can
  // SEE what a report will print) but only editable when isIdan().
  function invApplyDisplayNameGate() {
    const idan = typeof isIdan === 'function' && isIdan();
    const row = document.getElementById('invProductDisplayNameRow');
    const input = document.getElementById('invProductDisplayName');
    if (input) input.disabled = !idan;
    if (row) row.title = idan ? '' : 'עריכת שם לדוחות זמינה לעידן בלבד';
  }

  function invNewProduct() {
    if (!checkEditPermission()) return;
    window.invEditingProductId = null;
    document.getElementById('invProductTitle').textContent = '📋 פריט חדש';
    document.getElementById('invProductName').value = '';
    document.getElementById('invProductCategory').value = '';
    document.getElementById('invProductActive').checked = true;
    const dn = document.getElementById('invProductDisplayName'); if (dn) dn.value = '';
    invApplyDisplayNameGate();
    document.getElementById('invProductModal').classList.add('open');
  }

  function invEditProduct(id) {
    if (!checkEditPermission()) return;
    const p = (window.SHEET_DATA.products || []).find(x => x.id === id);
    if (!p) return;
    window.invEditingProductId = id;
    document.getElementById('invProductTitle').textContent = '📋 ערוך: ' + p.name;
    document.getElementById('invProductName').value = p.name;
    document.getElementById('invProductCategory').value = p.category || '';
    document.getElementById('invProductActive').checked = p.active;
    const dn = document.getElementById('invProductDisplayName');
    if (dn) dn.value = (p.display_name && p.display_name !== p.name) ? p.display_name : '';
    invApplyDisplayNameGate();
    document.getElementById('invProductModal').classList.add('open');
  }

  function invToggleProductActive(id, makeActive) {
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'product', id: id, active: makeActive })
    }).then(() => setTimeout(refreshData, 1000));
  }

  function invSaveProduct(btn) {
    const name = document.getElementById('invProductName').value.trim();
    if (!name) { alert('נא להזין שם פריט'); return; }
    const body = {
      type: 'product',
      name: name,
      category: document.getElementById('invProductCategory').value,
      active: document.getElementById('invProductActive').checked
    };
    // Only עידן's own edits carry display_name — a non-עידן save must never overwrite it
    // (the field is disabled client-side, but the network body is the real gate).
    if (typeof isIdan === 'function' && isIdan()) {
      const dnEl = document.getElementById('invProductDisplayName');
      const dn = dnEl ? dnEl.value.trim() : '';
      body.display_name = dn || name;
    }
    if (window.invEditingProductId) body.id = window.invEditingProductId;
    setBtnLoading(btn, true);
    fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          document.getElementById('invProductModal').classList.remove('open');
          setTimeout(refreshData, 1000);
        } else alert('שגיאה: ' + JSON.stringify(res));
      })
      .finally(() => setBtnLoading(btn, false));
  }

