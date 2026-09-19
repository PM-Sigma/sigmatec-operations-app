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

  // The ONE pool (inventory spec §1): `{product: qty}` at `חברה`. Mirrors
  // app/src/lib/inventory.ts `poolStock` — test-inventory-pool.mjs holds them to one golden.
  // Zero nets are dropped: a catalog rename is not "0 in stock", it is nothing at all.
  function poolStockMap() {
    const at = computeStock()[POOL_LOCATION] || {};
    const out = {};
    Object.keys(at).forEach(p => { if (at[p] !== 0) out[p] = at[p]; });
    return out;
  }

  // ===== Low-stock "red line" =====
  // Meters: company-wide total PER TYPE (matched by substring so two name spellings of the
  // same meter — e.g. "מונה Landis+Gyr E360PP" / legacy "מונה 360PP" — collapse into ONE bucket).
  // SIMs: per holder, against that holder's OWN location stock (his bag), since a field user
  // can be low even if his manager אביאם holds plenty.
  const METER_RULES = [
    { label: 'מונה Landis+Gyr E360PP', match: '360PP', min: 15 },
    { label: 'מונה Landis+Gyr E360SP', match: '360SP', min: 15 },
    { label: 'מונה E360CT', match: '360CT', min: 15 },
    { label: 'מונה E570',   match: 'E570',  min: 10 },
    { label: 'מונה PM135',  match: 'PM135',  min: 5  },
  ];
  // SIMs used to be checked per holder, against that person's own bag. There are no bags any
  // more (§1), so one company-wide red line per SIM type, like the meters.
  const SIM_MIN = 15;

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
    // SIMs — one line per type, against the pool.
    const sims = [];
    Object.entries(companyTotal).forEach(([p, q]) => {
      if (p.indexOf('סים') === 0 && q < SIM_MIN) sims.push({ person: POOL_LOCATION, type: p, qty: q, min: SIM_MIN });
    });
    return { meters, sims };
  }

  // Renders the red-line alert: a "company task" line for the company-wide meter shortages
  // (visible to all), plus a main-page banner whose content depends on who's logged in.
  function renderLowStockAlert() {
    const { meters, sims } = lowStockReport();
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
      sims.forEach(s => lines.push(`${s.type}: נותרו ${s.qty} (קו אדום ${s.min})`));
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
    banner.innerHTML = '🔴 <strong>התראת מלאי — מתחת לקו האדום</strong><br>' +
      lines.join('<br>') +
      ' <button onclick="document.getElementById(\'lowStockBanner\').remove()" style="float:left;background:none;border:none;font-size:16px;cursor:pointer;color:#991b1b;">✕</button>';
  }

  // ===== דיווח שינוי במלאי (§4b) =====
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
        alert('מסך דיווח שינוי במלאי עוד נטען — נסה שוב בעוד רגע.');
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

  // Category grouping for the stock views — minimal visual separation between item types
  // (מונה/בקר/סים/...). Order is fixed so groups don't jump around between renders.
  const STOCK_CATEGORY_ORDER = ['מונה', 'בקר', 'סים', 'משנ"ז', 'אנטנה', 'ספק כוח', 'כרטיס תקשורת'];
  function productCategoryMap() {
    const m = {};
    ((window.SHEET_DATA && window.SHEET_DATA.products) || []).forEach(p => { m[p.name] = p.category || 'אחר'; });
    return m;
  }
  function sortByCategoryThenName(names, catMap) {
    return names.slice().sort((a, b) => {
      const ca = catMap[a] || 'אחר', cb = catMap[b] || 'אחר';
      if (ca !== cb) {
        const ia = STOCK_CATEGORY_ORDER.indexOf(ca), ib = STOCK_CATEGORY_ORDER.indexOf(cb);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || ca.localeCompare(cb, 'he');
      }
      return a.localeCompare(b, 'he');
    });
  }

  // 📦 The pool view (§6). One column — `חברה` — on every viewport: the matrix collapsed to a
  // single number per product, so the screen finally says what the company HAS instead of
  // four half-true bags. The KPI tiles above it are tappable filters (§6 עידן 17.9):
  // "פריטים במאגר" clears them, "מלאי נמוך" keeps only what is below its red line.
  let invStockFilter = '';   // '' | 'low'
  function invSetStockFilter(f) {
    invStockFilter = (invStockFilter === f) ? '' : f;
    invRenderStock();
  }
  window.invSetStockFilter = invSetStockFilter;

  function invRenderStock() {
    const root = document.getElementById('invStockMatrix');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }

    const pool = poolStockMap();
    const _lsr = lowStockReport();
    const _lowMeterMatches = _lsr.meters.map(m => m.match);
    const lowSimTypes = new Set(_lsr.sims.map(s => s.type));
    const isLow = name =>
      (name.indexOf('מונה') === 0 && _lowMeterMatches.some(mm => name.indexOf(mm) !== -1)) || lowSimTypes.has(name);

    const catMap = productCategoryMap();
    let names = sortByCategoryThenName(Object.keys(pool), catMap);
    if (invStockFilter === 'low') names = names.filter(isLow);

    const totalUnits = names.reduce((sum, p) => sum + pool[p], 0);
    const lowCount = Object.keys(pool).filter(isLow).length;
    const canReport = typeof checkEditPermission === 'function' ? !(typeof isViewer === 'function' && isViewer()) : true;

    // KPI row + the one write button on this screen. The tiles are FILTERS (spec §6,
    // עידן 17.9): פריטים במאגר clears them, מלאי נמוך keeps only what is below its red
    // line. The handlers are bound after the innerHTML rather than written into it — an
    // inline onclick with a quoted argument is how this file used to grow escaping bugs.
    const kpi = (key, n, label, on) =>
      '<button type="button" class="inv-kpi' + (on ? ' active' : '') + '" data-kpi="' + key + '">' +
      '<span class="inv-kpi-n"><bdi>' + n + '</bdi></span>' +
      '<span class="inv-kpi-l">' + label + '</span></button>';
    let html = '<div class="inv-pool-kpis" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
      kpi('all', Object.keys(pool).length, 'פריטים במאגר', invStockFilter === '') +
      kpi('all', totalUnits, 'יחידות', false) +
      kpi('low', lowCount, 'מלאי נמוך', invStockFilter === 'low') +
      (canReport ? '<button type="button" class="inv-btn success" id="invReportChange">🔢 דווח שינוי</button>' : '') +
      '</div>';

    // Bound once, after whichever branch below writes the markup.
    const bindPoolControls = () => {
      root.querySelectorAll('[data-kpi]').forEach(b => {
        b.addEventListener('click', () => invSetStockFilter(b.getAttribute('data-kpi') === 'low' ? 'low' : ''));
      });
      const rep = root.querySelector('#invReportChange');
      if (rep) rep.addEventListener('click', () => openStockChangeSheet(''));
    };

    if (names.length === 0) {
      root.innerHTML = html + '<div style="padding:20px;text-align:center;color:var(--text-light);">' +
        (invStockFilter === 'low' ? 'אין פריטים מתחת לקו האדום.' : 'אין מלאי במאגר החברה.') + '</div>';
      bindPoolControls();
      return;
    }

    // One list, grouped by category. The same markup on phone and desktop — with a single
    // column there is nothing left to scroll sideways.
    let lastCat = null, rows = '';
    names.forEach(p => {
      const cat = catMap[p] || 'אחר';
      if (cat !== lastCat) { rows += `<div class="item-cat-label">${cat}</div>`; lastCat = cat; }
      const q = pool[p];
      const low = isLow(p);
      rows += `<div class="item-row ${q < 0 ? 'neg' : ''}"${low ? ' style="color:#dc2626;font-weight:700;"' : ''}>` +
        `<span>${low ? '🔴 ' : ''}${p}</span><span class="qty"><bdi>${q}</bdi></span></div>`;
    });
    html += `<div class="inv-loc-card" data-pool="1" data-testid="inv-pool"><div class="inv-loc-head">` +
      `<span class="loc-name">🏢 ${POOL_LOCATION}</span>` +
      `<span class="loc-count"><bdi>${totalUnits}</bdi> יח׳ · <bdi>${names.length}</bdi> פריטים</span></div>` +
      `<div class="inv-loc-items">${rows}</div></div>`;
    root.innerHTML = html;
    bindPoolControls();
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
    // The pool, one row per product — there is no second column to export any more (§6).
    const pool = poolStockMap();
    const rows = [['פריט', POOL_LOCATION]];
    Object.keys(pool).sort((a, b) => a.localeCompare(b, 'he')).forEach(p => rows.push([p, pool[p]]));
    invDownloadCSV(rows, 'inventory_pool.csv');
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

