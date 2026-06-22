  // ========== STOCK (by location) ==========
  function computeStock() {
    const movements = (window.SHEET_DATA && window.SHEET_DATA.movements) || [];
    const stock = {}; // stock[location][product] = qty
    movements.forEach(m => {
      const qty = parseFloat(m.quantity) || 0;
      const prod = m.product || '';
      if (!prod) return;
      if (m.fromLocation) {
        if (!stock[m.fromLocation]) stock[m.fromLocation] = {};
        stock[m.fromLocation][prod] = (stock[m.fromLocation][prod] || 0) - qty;
      }
      if (m.toLocation) {
        if (!stock[m.toLocation]) stock[m.toLocation] = {};
        stock[m.toLocation][prod] = (stock[m.toLocation][prod] || 0) + qty;
      }
    });
    return stock;
  }

  // ===== Low-stock "red line" =====
  // Meters: company-wide total PER TYPE (matched by substring so two name spellings of the
  // same meter — e.g. "מונה E360PP" / "מונה 360PP" — collapse into ONE bucket, no duplicate).
  // SIMs: per holder, against that holder's OWN location stock (his bag), since a field user
  // can be low even if his manager אביאם holds plenty.
  const METER_RULES = [
    { label: 'מונה E360PP', match: '360PP', min: 15 },
    { label: 'מונה E360SP', match: '360SP', min: 15 },
    { label: 'מונה E360CT', match: '360CT', min: 15 },
    { label: 'מונה E570',   match: 'E570',  min: 10 },
    { label: 'מונה PM',     match: 'PM',     min: 5  },
  ];
  const SIM_HOLDERS = [ { person: 'אביאם', min: 15 }, { person: 'ניתאי', min: 10 } ];

  function lowStockReport() {
    const stock = computeStock();
    const companyTotal = {};
    Object.values(stock).forEach(locObj => Object.entries(locObj).forEach(([p, q]) => {
      companyTotal[p] = (companyTotal[p] || 0) + q;
    }));
    // Meters — company-wide, bucketed by rule.match (dedups name variants)
    const meters = METER_RULES.map(rule => {
      let total = 0, found = false;
      Object.entries(companyTotal).forEach(([p, q]) => {
        if (p.indexOf('מונה') === 0 && p.indexOf(rule.match) !== -1) { total += q; found = true; }
      });
      return { label: rule.label, match: rule.match, total, min: rule.min, found };
    }).filter(m => m.found && m.total < m.min);
    // SIMs — per holder, their own location stock; each SIM type checked separately
    const sims = [];
    SIM_HOLDERS.forEach(h => {
      Object.entries(stock[h.person] || {}).forEach(([p, q]) => {
        if (p.indexOf('סים') === 0 && q < h.min) sims.push({ person: h.person, type: p, qty: q, min: h.min });
      });
    });
    return { meters, sims };
  }

  // Renders the red-line alert: a "company task" line for the company-wide meter shortages
  // (visible to all), plus a main-page banner whose content depends on who's logged in.
  function renderLowStockAlert() {
    const { meters, sims } = lowStockReport();

    // (1) company-task lines — meters are company-wide → visible to everyone
    const ordersOl = document.querySelector('.company-task-group.orders ol');
    if (ordersOl) {
      ordersOl.querySelectorAll('li.low-stock-task').forEach(e => e.remove());
      meters.forEach(m => {
        const li = document.createElement('li');
        li.className = 'low-stock-task';
        li.style.cssText = 'color:#dc2626;font-weight:700;';
        li.textContent = `🔴 מלאי המונים בחברה ירד מתחת לקו האדום, ישנם ${m.total} מסוג "${m.label}" (קו אדום: ${m.min})`;
        ordersOl.appendChild(li);
      });
    }

    // (2) main-page banner — אביאם/עמיחי see meters; SIMs are per-person (אביאם, as manager,
    //     also sees ניתאי's — named, since the stock may be in אביאם's bag).
    const me = getCurrentUser();
    const lines = [];
    if (me === 'אביאם' || me === 'עמיחי') {
      meters.forEach(m => lines.push(`${m.label}: נותרו ${m.total} (קו אדום ${m.min})`));
    }
    sims.forEach(s => {
      if (s.person === me || me === 'אביאם') {
        lines.push(`${s.type} אצל ${s.person}: נותרו ${s.qty} (קו אדום ${s.min})`);
      }
    });

    const view = document.getElementById('kibbutz-view');
    let banner = document.getElementById('lowStockBanner');
    if (!view || lines.length === 0) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'lowStockBanner';
      banner.style.cssText = 'background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:12px 14px;margin:0 0 14px;color:#991b1b;font-weight:600;box-shadow:0 2px 8px rgba(220,38,38,.18);';
      view.insertBefore(banner, view.firstChild);
    }
    banner.innerHTML = '🔴 <strong>התראת מלאי — מתחת לקו האדום</strong><br>' +
      lines.join('<br>') +
      ' <button onclick="document.getElementById(\'lowStockBanner\').remove()" style="float:left;background:none;border:none;font-size:16px;cursor:pointer;color:#991b1b;">✕</button>';
  }

  // ===== Stock transfer between locations =====
  function populateTransferDropdowns() {
    const stock = computeStock();
    const from = document.getElementById('transferFrom');
    const to   = document.getElementById('transferTo');
    if (!from || !to) return;
    // Preserve user's current selection across re-renders (the 10s data poll)
    const prevFrom = from.value;
    const prevTo   = to.value;
    const prevProduct = document.getElementById('transferProduct')?.value || '';
    const prevQty     = document.getElementById('transferQty')?.value || '';

    const fromLocs = INV_LOCATIONS.filter(loc => Object.values(stock[loc] || {}).some(q => q > 0));
    from.innerHTML = '<option value="">-- בחר --</option>' +
      fromLocs.sort((a,b) => a.localeCompare(b,'he')).map(l => `<option value="${l}">${l}</option>`).join('');
    to.innerHTML = '<option value="">-- בחר --</option>' +
      INV_LOCATIONS.slice().sort((a,b) => a.localeCompare(b,'he')).map(l => `<option value="${l}">${l}</option>`).join('');

    if (prevFrom && Array.from(from.options).some(o => o.value === prevFrom)) from.value = prevFrom;
    if (prevTo   && Array.from(to.options).some(o => o.value === prevTo))     to.value = prevTo;
    renderTransferProducts();
    // Restore product + qty after products dropdown re-rendered
    const prodSel = document.getElementById('transferProduct');
    if (prodSel && prevProduct && Array.from(prodSel.options).some(o => o.value === prevProduct)) {
      prodSel.value = prevProduct;
      renderTransferMax();
    }
    const qtyEl = document.getElementById('transferQty');
    if (qtyEl && prevQty) qtyEl.value = prevQty;
  }
  function renderTransferProducts() {
    const fromLoc = document.getElementById('transferFrom')?.value;
    const sel = document.getElementById('transferProduct');
    if (!sel) return;
    if (!fromLoc) {
      sel.innerHTML = '<option value="">-- בחר תחילה מקור --</option>';
      renderTransferMax(); return;
    }
    const stock = computeStock()[fromLoc] || {};
    const items = Object.entries(stock).filter(([_, q]) => q > 0)
      .sort((a,b) => a[0].localeCompare(b[0],'he'));
    sel.innerHTML = '<option value="">-- בחר פריט --</option>' +
      items.map(([p, q]) => `<option value="${p}" data-qty="${q}">${p} (${q})</option>`).join('');
    renderTransferMax();
  }
  function renderTransferMax() {
    const sel = document.getElementById('transferProduct');
    const qty = document.getElementById('transferQty');
    const hint = document.getElementById('transferHint');
    if (!sel || !qty || !hint) return;
    const opt = sel.options[sel.selectedIndex];
    const max = opt && opt.dataset.qty ? parseInt(opt.dataset.qty) : 0;
    qty.max = max || '';
    qty.placeholder = max ? `מקס ${max}` : 'כמות';
    hint.textContent = max ? `📦 זמין במקור: ${max}` : '';
  }
  async function doStockTransfer(btn) {
    if (!checkEditPermission()) return;
    const from    = document.getElementById('transferFrom').value;
    const to      = document.getElementById('transferTo').value;
    const product = document.getElementById('transferProduct').value;
    const qty     = parseInt(document.getElementById('transferQty').value) || 0;
    if (!from || !to)   { alert('בחר מקור ויעד'); return; }
    if (from === to)    { alert('המקור והיעד זהים'); return; }
    if (!product)       { alert('בחר פריט'); return; }
    if (qty <= 0)       { alert('הזן כמות חיובית'); return; }
    const maxOpt = document.querySelector(`#transferProduct option[value="${product}"]`);
    const max = maxOpt ? parseInt(maxOpt.dataset.qty) : 0;
    if (qty > max)      { alert(`לא ניתן להעביר ${qty}. זמין רק ${max}.`); return; }
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          type: 'movement',
          product: product,
          fromLocation: from,
          toLocation: to,
          quantity: qty,
          reason: 'transfer'
        })
      });
      const data = await res.json();
      if (data.ok) {
        const t = document.getElementById('toast');
        t.textContent = `✅ הועברו ${qty}× ${product}: ${from} → ${to}`;
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
        document.getElementById('transferQty').value = '';
        document.getElementById('transferProduct').value = '';
        setTimeout(refreshData, 1000);
      } else { alert('שגיאה: ' + JSON.stringify(data)); }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  function invRenderStock() {
    const root = document.getElementById('invStockMatrix');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    populateTransferDropdowns();
    const stock = computeStock();
    // red-line helpers: meter types (company-wide) red everywhere; SIM cells red per-holder
    const _lsr = lowStockReport();
    const _lowMeterMatches = _lsr.meters.map(m => m.match);
    const isLowMeter = name => name.indexOf('מונה') === 0 && _lowMeterMatches.some(mm => name.indexOf(mm) !== -1);
    const lowSimCells = new Set(_lsr.sims.map(s => s.type + '|' + s.person));

    if (window.innerWidth < 768) {
      // Mobile: accordion per location (NO scrolling table)
      let html = '';
      INV_LOCATIONS.forEach(loc => {
        const locStock = stock[loc] || {};
        const items = Object.entries(locStock).filter(([_, q]) => q !== 0)
          .sort((a, b) => a[0].localeCompare(b[0], 'he'));
        const totalUnits = items.reduce((s, [_, q]) => s + q, 0);
        if (items.length === 0) {
          html += `<details class="inv-loc-card" style="opacity:0.55;">
            <summary class="inv-loc-head"><span class="loc-name">${loc}</span><span class="loc-count" style="background:#f1f5f9;color:#64748b;">ריק</span></summary>
          </details>`;
          return;
        }
        html += `<details class="inv-loc-card" ${totalUnits > 0 ? 'open' : ''}>
          <summary class="inv-loc-head">
            <span class="loc-name">${loc}</span>
            <span class="loc-count">${totalUnits} יח׳ · ${items.length} פריטים</span>
          </summary>
          <div class="inv-loc-items">
            ${items.map(([p, q]) => `
              <div class="item-row ${q < 0 ? 'neg' : ''}" ${(isLowMeter(p) || lowSimCells.has(p + '|' + loc)) ? 'style="color:#dc2626;font-weight:700;"' : ''}>
                <span>${(isLowMeter(p) || lowSimCells.has(p + '|' + loc)) ? '🔴 ' : ''}${p}</span><span class="qty">${q}</span>
              </div>
            `).join('')}
          </div>
        </details>`;
      });
      root.innerHTML = html || '<div style="padding:20px;text-align:center;color:#64748b;">עוד אין מלאי במיקומים</div>';
      return;
    }

    // Desktop: full matrix. Hide products whose net across all INV_LOCATIONS is 0
    // (these are typically catalog renames or fully-countered demo data).
    const products = Object.keys(stock).reduce((acc, loc) => {
      Object.keys(stock[loc]).forEach(p => acc.add(p));
      return acc;
    }, new Set());
    const productList = Array.from(products)
      .filter(p => INV_LOCATIONS.some(loc => ((stock[loc] && stock[loc][p]) || 0) !== 0))
      .sort((a,b) => a.localeCompare(b, 'he'));

    if (productList.length === 0) {
      root.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">עוד אין מלאי במיקומים. הוסף הזמנה עם סטטוס "סופקה" וחלוקה.</div>';
      return;
    }
    let html = '<div style="overflow-x:auto;"><table class="matrix-table"><thead><tr><th>פריט</th>';
    INV_LOCATIONS.forEach(loc => { html += `<th>${loc}</th>`; });
    html += '<th>סה"כ</th></tr></thead><tbody>';
    productList.forEach(p => {
      let total = 0;
      const low = isLowMeter(p);   // company-wide meter type below its red line
      html += `<tr${low ? ' style="background:#fef2f2;"' : ''}><td>${low ? '🔴 ' : ''}${p}</td>`;
      INV_LOCATIONS.forEach(loc => {
        const q = (stock[loc] && stock[loc][p]) || 0;
        total += q;
        const simLow = lowSimCells.has(p + '|' + loc);   // this holder's SIM below his red line
        const cls = q === 0 ? 'matrix-zero' : (q < 0 ? 'matrix-neg' : '');
        html += `<td class="${cls}"${simLow ? ' style="background:#fef2f2;color:#dc2626;font-weight:700;"' : ''}>${q}</td>`;
      });
      html += `<td style="font-weight:700;${low ? 'color:#dc2626;' : ''}">${total}</td></tr>`;
    });
    html += '</tbody></table></div>';
    root.innerHTML = html;
  }

  // ========== KIBBUTZ INVENTORY ==========
  function invRenderKibbutzInventory() {
    const root = document.getElementById('invKibbutzMatrix');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const stock = computeStock();
    const kibbutzLocations = Object.keys(stock).filter(loc => !NON_KIBBUTZ_LOCATIONS.includes(loc) && loc);
    if (kibbutzLocations.length === 0) {
      root.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">עדיין לא סופקו מוצרים לקיבוצים דרך ביקור.</div>';
      return;
    }

    if (window.innerWidth < 768) {
      // Mobile: accordion per kibbutz
      let html = '';
      kibbutzLocations.sort((a,b) => a.localeCompare(b, 'he')).forEach(kib => {
        const items = Object.entries(stock[kib] || {}).filter(([_, q]) => q !== 0)
          .sort((a, b) => a[0].localeCompare(b[0], 'he'));
        const totalUnits = items.reduce((s, [_, q]) => s + q, 0);
        if (items.length === 0) return;
        html += `<details class="inv-loc-card">
          <summary class="inv-loc-head">
            <span class="loc-name">🏘 ${kib}</span>
            <span class="loc-count">${totalUnits} יח׳</span>
          </summary>
          <div class="inv-loc-items">
            ${items.map(([p, q]) => `
              <div class="item-row ${q < 0 ? 'neg' : ''}">
                <span>${p}</span><span class="qty">${q}</span>
              </div>
            `).join('')}
          </div>
        </details>`;
      });
      root.innerHTML = html || '<div style="padding:20px;text-align:center;color:#64748b;">אין נתונים</div>';
      return;
    }

    // Desktop: matrix. Hide products with zero net across all kibbutzim.
    const products = kibbutzLocations.reduce((acc, kib) => {
      Object.keys(stock[kib]).forEach(p => acc.add(p));
      return acc;
    }, new Set());
    const productList = Array.from(products)
      .filter(p => kibbutzLocations.some(kib => ((stock[kib] && stock[kib][p]) || 0) !== 0))
      .sort((a,b) => a.localeCompare(b, 'he'));

    let html = '<div style="overflow-x:auto;"><table class="matrix-table"><thead><tr><th>קיבוץ</th>';
    productList.forEach(p => { html += `<th>${p}</th>`; });
    html += '<th>סה"כ</th></tr></thead><tbody>';
    kibbutzLocations.sort((a,b) => a.localeCompare(b, 'he')).forEach(kib => {
      let total = 0;
      html += `<tr><td>${kib}</td>`;
      productList.forEach(p => {
        const q = (stock[kib] && stock[kib][p]) || 0;
        total += q;
        const cls = q === 0 ? 'matrix-zero' : '';
        html += `<td class="${cls}">${q}</td>`;
      });
      html += `<td style="font-weight:700;">${total}</td></tr>`;
    });
    html += '</tbody></table></div>';
    root.innerHTML = html;
  }

  function invExportStock() {
    const stock = computeStock();
    const products = Array.from(Object.keys(stock).reduce((acc, loc) => {
      Object.keys(stock[loc]).forEach(p => acc.add(p));
      return acc;
    }, new Set())).sort((a,b) => a.localeCompare(b, 'he'));
    const rows = [['פריט', ...INV_LOCATIONS, 'סה"כ']];
    products.forEach(p => {
      const row = [p];
      let total = 0;
      INV_LOCATIONS.forEach(loc => {
        const q = (stock[loc] && stock[loc][p]) || 0;
        total += q;
        row.push(q);
      });
      row.push(total);
      rows.push(row);
    });
    invDownloadCSV(rows, 'inventory_by_location.csv');
  }

  function invExportKibbutzInventory() {
    const stock = computeStock();
    const kibbutzLocations = Object.keys(stock).filter(loc => !NON_KIBBUTZ_LOCATIONS.includes(loc) && loc);
    const products = Array.from(kibbutzLocations.reduce((acc, kib) => {
      Object.keys(stock[kib]).forEach(p => acc.add(p));
      return acc;
    }, new Set())).sort((a,b) => a.localeCompare(b, 'he'));
    const rows = [['קיבוץ', ...products, 'סה"כ']];
    kibbutzLocations.sort((a,b) => a.localeCompare(b, 'he')).forEach(kib => {
      const row = [kib];
      let total = 0;
      products.forEach(p => {
        const q = (stock[kib] && stock[kib][p]) || 0;
        total += q;
        row.push(q);
      });
      row.push(total);
      rows.push(row);
    });
    invDownloadCSV(rows, 'inventory_by_kibbutz.csv');
  }

  function invDownloadCSV(rows, filename) {
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

