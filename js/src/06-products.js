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
    let html = '<table class="inv-table"><thead><tr><th>שם</th><th>קטגוריה</th><th>פעיל</th><th>פעולות</th></tr></thead><tbody>';
    products.sort((a,b) => a.name.localeCompare(b.name, 'he')).forEach(p => {
      html += `<tr>
        <td data-label="שם"><strong>${p.name}</strong></td>
        <td data-label="קטגוריה">${p.category || '<span style="color:#94a3b8;">—</span>'}</td>
        <td data-label="פעיל">${p.active ? '✅' : '❌'}</td>
        <td class="actions-cell">
          <button class="inv-btn small" onclick="invEditProduct('${p.id}')">✏️ ערוך</button>
          <button class="inv-btn small ${p.active ? 'warning' : 'success'}" onclick="invToggleProductActive('${p.id}', ${!p.active})">${p.active ? 'השבת' : 'הפעל'}</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  function invNewProduct() {
    if (!checkEditPermission()) return;
    window.invEditingProductId = null;
    document.getElementById('invProductTitle').textContent = '📋 פריט חדש';
    document.getElementById('invProductName').value = '';
    document.getElementById('invProductCategory').value = '';
    document.getElementById('invProductActive').checked = true;
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

