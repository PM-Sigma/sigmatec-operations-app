  // ===== Visit Summary (Google Sheet, fallback to localStorage) =====
  const VISITS_KEY = 'kibbutzVisits_v1';

  const PRODUCT_LIST = [
    'מונה EM133','מונה PM135','מונה E360PP','מונה E360SP','מונה E360CT','מונה E570',
    'בקר Robustel','בקר PUSR',
    'סים Partner','סים Cellcom',
    'כרטיס תקשורת צרוב',
    'אנטנה',
    'ספק כוח פס-דין','ספק כוח שקע',
    'משנ"ז 250','משנ"ז 400'
  ];

  // 1 full work day ≈ this many hours (for the hours statistic). ponytail: single tunable knob.
  const WORKDAY_HOURS = 8;
  function toggleVisitWorkday() {
    const on = document.getElementById('visitWorkday').checked;
    const dur = document.getElementById('visitDuration');
    if (dur) { dur.disabled = on; dur.style.opacity = on ? '0.45' : ''; if (on) dur.value = ''; }
  }

  // Combined source: Sheet visits authoritative; local visits added only if NOT already in Sheet
  function loadAllVisitsCombined() {
    const sheetVisits = (window.SHEET_DATA && window.SHEET_DATA.visits) || [];
    const localVisits = loadAllVisits();
    const sheetKeys = new Set(sheetVisits.map(v => v.kibbutz + '|' + (v.date || '').slice(0,10) + '|' + v.visitor));
    const filteredLocal = localVisits.filter(v => {
      const key = v.kibbutz + '|' + (v.date || '').slice(0,10) + '|' + v.visitor;
      return !sheetKeys.has(key);
    });
    return [...sheetVisits, ...filteredLocal];
  }

  // Renders the products checklist DYNAMICALLY based on:
  //   - selected visitor → source location (auto, see onVisitorChange)
  //   - actual current stock at that source (computed from MOVEMENTS)
  //   - + items from the visit being edited (so edit flow shows what was already supplied)
  function renderProductsForVisitor() {
    const wrap = document.getElementById('visitProducts');
    if (!wrap) return;
    const visitor = document.getElementById('visitor')?.value || '';
    const source = document.getElementById('visitSource')?.value || 'משרד';

    if (!visitor) {
      wrap.innerHTML = '<div style="grid-column:1/-1;padding:14px;text-align:center;color:#94a3b8;font-style:italic;font-size:12px;background:white;border-radius:6px;">👤 בחר תחילה את המבקר כדי לראות את המלאי שלו</div>';
      return;
    }

    const stock = (typeof computeStock === 'function') ? computeStock() : {};
    const sourceStock = stock[source] || {};

    // Edit-mode: include items already in this visit (so user can adjust)
    let editingProducts = {};
    if (window.editingVisitId) {
      const allVisits = (typeof loadAllVisitsCombined === 'function') ? loadAllVisitsCombined() : [];
      const v = allVisits.find(x => x.id === window.editingVisitId);
      if (v && Array.isArray(v.products)) {
        v.products.forEach(p => {
          const name = typeof p === 'string' ? p : p.name;
          const qty  = typeof p === 'string' ? 1 : (p.qty || 1);
          editingProducts[name] = qty;
        });
      }
    }

    const itemNames = new Set();
    Object.entries(sourceStock).filter(([_, q]) => q > 0).forEach(([p]) => itemNames.add(p));
    Object.keys(editingProducts).forEach(p => itemNames.add(p));

    if (itemNames.size === 0) {
      wrap.innerHTML = `<div style="grid-column:1/-1;padding:12px;text-align:center;color:#92400e;background:#fef3c7;border-radius:6px;font-size:12px;">
        ⚠️ ב-${source} אין כרגע מלאי. השתמש בשדה "פריטים אחרים" למטה לפריטים מיוחדים.
      </div>`;
      return;
    }

    const sorted = Array.from(itemNames).sort((a, b) => a.localeCompare(b, 'he'));
    const header = `<div style="grid-column:1/-1;font-size:11px;color:#64748b;margin-bottom:4px;font-weight:700;">📦 מלאי זמין ב-${source}:</div>`;
    wrap.innerHTML = header + sorted.map(p => {
      const available  = sourceStock[p] || 0;
      const usedInVisit = editingProducts[p] || 0;
      const maxAllowed = available + usedInVisit;
      const checked  = usedInVisit > 0 ? 'checked' : '';
      const disabled = usedInVisit > 0 ? '' : 'disabled';
      const qtyValue = usedInVisit > 0 ? usedInVisit : '';
      const lowStock = available === 0 && usedInVisit === 0;
      return `
        <div style="display:flex;align-items:center;gap:6px;background:white;padding:4px 8px;border-radius:6px;${lowStock ? 'opacity:0.6;' : ''}">
          <input type="checkbox" class="prod-chk" data-product="${p}" ${checked} onchange="toggleProductQty(this)">
          <label style="font-size:12px;flex:1;">${p} <span style="color:#64748b;font-size:10px;">(${available} זמין)</span></label>
          <input type="number" class="prod-qty" data-product="${p}" data-max="${maxAllowed}" min="1" max="${maxAllowed}" step="1" placeholder="כמות" value="${qtyValue}" style="width:55px;padding:3px 6px;font-size:11px;" ${disabled}>
        </div>
      `;
    }).join('');
  }

  function toggleProductQty(chk) {
    const product = chk.dataset.product;
    const qtyInput = document.querySelector('.prod-qty[data-product="' + product + '"]');
    if (!qtyInput) return;
    if (chk.checked) {
      qtyInput.disabled = false;
      if (!qtyInput.value) qtyInput.value = '1';
      qtyInput.focus();
    } else {
      qtyInput.disabled = true;
      qtyInput.value = '';
    }
  }

  function loadAllVisits() {
    try {
      const raw = localStorage.getItem(VISITS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function saveAllVisits(visits) {
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  }

  function getLastVisit(kibbutzName) {
    const all = loadAllVisitsCombined().filter(v => v.kibbutz === kibbutzName);
    if (!all.length) return null;
    return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  }

  // Stash last 3 visits per kibbutz so they can be edited too
  window.currentKibbutzVisits = [];

  // Read-only "last visit report" text — shared by the visit tab and the edit tab.
  function lastVisitText(visit) {
    if (!visit) return '';
    const date = new Date(visit.date).toLocaleDateString('he-IL');
    const dur = visit.workday ? '🗓️ יום עבודה' : ('⏱️ ' + visit.duration + ' שעות');
    let text = `📅 ${date} | ${dur} | 👤 ${visit.visitor || '—'}\n`;
    if (visit.contact) text += `🤝 איש קשר: ${visit.contact}\n`;
    if (visit.products && visit.products.length) {
      const productsStr = visit.products.map(p =>
        typeof p === 'string' ? p : (p.qty && p.qty > 1 ? p.name + ' (×' + p.qty + ')' : p.name)).join(', ');
      text += `📦 מוצרים שסופקו: ${productsStr}\n`;
    }
    if (visit.productsOther) text += `📦 אחר: ${visit.productsOther}\n`;
    if (visit.summary) text += `\n${visit.summary}`;
    return text;
  }

  function renderLastVisit(kibbutzName) {
    // "ביקורים אחרונים" = visits within the last ~month. Trailing 31 days from midnight —
    // avoids the setMonth() rollover bug (e.g. May 31 → "Apr 31" → May 1 collapses the window).
    const monthAgo = new Date(); monthAgo.setHours(0, 0, 0, 0); monthAgo.setDate(monthAgo.getDate() - 31);
    const allForKibbutz = loadAllVisitsCombined()
      .filter(v => v.kibbutz === kibbutzName && v.date && new Date(v.date) >= monthAgo)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    window.currentKibbutzVisits = allForKibbutz;

    const box = document.getElementById('lastVisitBox');
    const content = document.getElementById('lastVisitContent');
    const editBtn = document.getElementById('editLastVisitBtn');
    const historyWrap = document.getElementById('visitsHistoryWrap');

    if (!allForKibbutz.length) {
      box.style.display = 'none';
      return;
    }

    const last = allForKibbutz[0];
    content.textContent = lastVisitText(last);
    editBtn.style.display = last.id ? 'inline-block' : 'none';
    editBtn.dataset.visitId = last.id || '';

    // Build history of older visits (up to 3 more)
    historyWrap.innerHTML = '';
    if (allForKibbutz.length > 1) {
      const olderTitle = document.createElement('div');
      olderTitle.style.cssText = 'font-weight:700;margin-top:10px;padding-top:8px;border-top:1px dashed #a7f3d0;font-size:11px;';
      olderTitle.textContent = '📚 ביקורים קודמים:';
      historyWrap.appendChild(olderTitle);
      allForKibbutz.slice(1, 4).forEach(v => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:4px 0;border-bottom:1px solid #a7f3d0;';
        const dt = new Date(v.date).toLocaleDateString('he-IL');
        row.innerHTML = `<span>📅 ${dt} · ⏱️ ${v.duration}ש · 👤 ${v.visitor || '—'}</span>` +
          (v.id ? `<button onclick="editVisit('${v.id}')" style="background:#10b981;color:white;border:none;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:10px;font-family:inherit;">✏️ ערוך</button>` : '<span style="color:#94a3b8;font-size:10px;">— לא ניתן לערוך</span>');
        historyWrap.appendChild(row);
      });
    }

    box.style.display = 'block';
  }

  function editLastVisit() {
    if (!window.currentKibbutzVisits.length) return;
    const last = window.currentKibbutzVisits[0];
    if (!last.id) { alert('הביקור הזה נשמר ללא ID — לא ניתן לערוך. נסה שוב אחרי שהדף סונכרן.'); return; }
    editVisit(last.id);
  }

  function editVisit(visitId) {
    const visit = window.currentKibbutzVisits.find(v => v.id === visitId);
    if (!visit) return;
    // Mark editing FIRST so renderProductsForVisitor can include the visit's items
    window.editingVisitId = visitId;
    // Pre-fill form with this visit's data
    document.getElementById('visitSummary').value = visit.summary || '';
    document.getElementById('visitProductsOther').value = visit.productsOther || '';
    document.getElementById('visitContact').value = visit.contact || '';
    document.getElementById('visitDuration').value = visit.workday ? '' : (visit.duration || '');
    const wdEl = document.getElementById('visitWorkday');
    if (wdEl) { wdEl.checked = !!visit.workday; toggleVisitWorkday(); }
    document.getElementById('visitor').value = visit.visitor || '';
    const d = visit.date ? new Date(visit.date) : new Date();
    document.getElementById('visitDate').value =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    // Restore returned items from visit (if any)
    visitReturnedItems = Array.isArray(visit.returnedItems) ? visit.returnedItems.slice() : [];
    renderReturnedItems();
    // Set source (auto by visitor) and re-render product list dynamically
    onVisitorChange(visit.visitor || '');
    switchTab('visit');
  }

  function saveVisit(btn) {
    const workday = !!(document.getElementById('visitWorkday') && document.getElementById('visitWorkday').checked);
    // Work day = either/or with hours: stored as the ~8h equivalent so hour-stats stay correct.
    const duration = workday ? WORKDAY_HOURS : parseFloat(document.getElementById('visitDuration').value);
    const visitor = document.getElementById('visitor').value;
    if (!visitor) { alert('נא לבחור מי ביקר'); return; }
    if (!workday && (isNaN(duration) || duration <= 0)) { alert('נא להזין משך ביקור בשעות, או לסמן "יום עבודה מלא"'); return; }
    const emsIntent = readVisitEmsIntent();   // EMS status is mandatory when an open task exists
    if (emsIntent === false) return;          // validation failed → stay in the form
    if (currentKibbutz) localStorage.setItem('last_visit_kibbutz', currentKibbutz); // for the quick-visit FAB default

    // Visual: show saving state on the save button
    const saveBtn = btn || (typeof event !== 'undefined' ? event.currentTarget : null);
    setBtnLoading(saveBtn, true);

    // Collect products with quantities (clamped to available stock)
    const products = [];
    document.querySelectorAll('.prod-chk:checked').forEach(chk => {
      const product = chk.dataset.product;
      const qtyInput = document.querySelector('.prod-qty[data-product="' + product + '"]');
      let qty = parseInt(qtyInput.value) || 1;
      const maxAllowed = parseInt(qtyInput.dataset.max);
      if (!isNaN(maxAllowed) && qty > maxAllowed) qty = maxAllowed;
      products.push({ name: product, qty: qty });
    });

    const dateInput = document.getElementById('visitDate').value;
    const visitDate = dateInput ? new Date(dateInput + 'T12:00:00').toISOString() : new Date().toISOString();
    const summary = document.getElementById('visitSummary').value.trim();

    const visit = {
      kibbutz: currentKibbutz,
      date: visitDate,
      visitor: visitor,
      duration: duration,
      contact: document.getElementById('visitContact').value.trim(),
      products: products,
      productsOther: document.getElementById('visitProductsOther').value.trim(),
      returnedItems: visitReturnedItems.filter(r => r.name && r.qty > 0),
      summary: summary,
      workday: workday
    };

    // Save locally as backup
    const all = loadAllVisits();
    all.push(visit);
    saveAllVisits(all);

    // Try to save to Google Sheet (Apps Script v5.3)
    const isEditing = !!window.editingVisitId;
    const reqBody = {
      type: 'visit',
      kibbutz: visit.kibbutz,
      date: visit.date,
      visitor: visit.visitor,
      duration: visit.duration,
      contact: visit.contact,
      products: visit.products,
      productsOther: visit.productsOther,
      returnedItems: visit.returnedItems,
      summary: visit.summary,
      workday: visit.workday
    };
    if (isEditing) {
      reqBody.id = window.editingVisitId;
    }
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(reqBody)
    }).then(r => r.json()).then(res => {
      if (res && res.ok) {
        visit.synced = true;
        saveAllVisits(loadAllVisits());

        // ----- Inventory movements (event-sourced) -----
        // NEW visit  → post full supply (source → kibbutz).
        // EDIT visit → post only the DELTA vs the previous products, so stock
        //              always matches reality instead of silently diverging.
        const sourceSelect = document.getElementById('visitSource');
        const source = (sourceSelect && sourceSelect.value) || visitor;
        const refId = res.id || window.editingVisitId || '';
        const movementPromises = [];
        const postMovement = (product, from, to, qty, reason) => {
          if (!product || qty <= 0) return;
          movementPromises.push(fetch(SHEET_API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ type: 'movement', product, fromLocation: from, toLocation: to, quantity: qty, reason, refId, createdBy: visitor })
          }).catch(e => console.warn('Movement failed:', e)));
        };

        // Previous products (only known when editing — loaded with the visit)
        const oldMap = {};
        if (isEditing) {
          const prev = (window.currentKibbutzVisits || []).find(v => v.id === window.editingVisitId);
          (prev?.products || []).forEach(p => { oldMap[p.name] = (oldMap[p.name] || 0) + (parseInt(p.qty) || 0); });
        }
        const newMap = {};
        products.forEach(p => { newMap[p.name] = (newMap[p.name] || 0) + (parseInt(p.qty) || 0); });

        new Set([...Object.keys(oldMap), ...Object.keys(newMap)]).forEach(name => {
          const delta = (newMap[name] || 0) - (oldMap[name] || 0);
          if (delta > 0)      postMovement(name, source, currentKibbutz, delta, isEditing ? 'visit_supply_edit' : 'visit_supply');
          else if (delta < 0) postMovement(name, currentKibbutz, source, -delta, 'visit_supply_edit'); // reverse over-supply
        });

        // Returns leave the kibbutz. "↩️ למלאי" (toStock) = intact → back to the VISITING employee's
        // available stock; otherwise defective → the 'תקול' bucket (stays out of available stock).
        // Only on a new visit: edits can't reliably diff returns (not loaded with the visit).
        if (!isEditing) {
          const visitorLoc = (typeof STOCK_HOLDERS !== 'undefined' && STOCK_HOLDERS.indexOf(visitor) !== -1) ? visitor : 'משרד';
          (visit.returnedItems || []).forEach(r => {
            if (r.toStock) postMovement(r.name, currentKibbutz, visitorLoc, parseInt(r.qty) || 0, 'return_restock');
            else postMovement(r.name, currentKibbutz, DEFECTIVE_LOCATION, parseInt(r.qty) || 0, 'return_defective');
          });
        }

        if (movementPromises.length) Promise.all(movementPromises).then(() => setTimeout(refreshData, 1500));
        else setTimeout(refreshData, 1500);
      }
    }).catch(e => {
      console.warn('Visit save to Sheet failed (will rely on localStorage):', e);
    }).finally(() => {
      setBtnLoading(saveBtn, false);
    });

    // Clear editing flag + reset returns list
    window.editingVisitId = null;
    visitReturnedItems = [];
    renderReturnedItems();

    // Auto-append visit info to the kibbutz status (clean, no WhatsApp)
    if (summary) {
      const dateShort = new Date(visitDate).toLocaleDateString('he-IL');
      autoAppendVisitToStatus(currentKibbutz, dateShort, visitor, summary);
    }

    closeModal({target: {id: 'modalBackdrop'}});
    const t = document.getElementById('toast');
    t.textContent = '✅ סיכום הביקור נשמר + הסטטוס עודכן';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);

    // Phase 2: push the summary as a comment + status to the chosen open EMS task
    // (captured in-form before the modal closed; sent live or queued if not connected).
    try { if (emsIntent && summary) pushVisitToEms(visit.kibbutz, visit, emsIntent); } catch (e) { console.warn('EMS visit push failed', e); }
  }

  // Append visit info to the kibbutz's status field in Google Sheet
  async function autoAppendVisitToStatus(kibbutzName, dateShort, visitor, summary) {
    if (!window.SHEET_DATA || !window.SHEET_DATA.tasks) return;
    const task = window.SHEET_DATA.tasks.find(t => t.name === kibbutzName);
    if (!task) return;

    const shortSummary = summary.length > 200 ? summary.slice(0, 200) + '…' : summary;
    const visitLine = '📍 ' + dateShort + ' (' + visitor + '): ' + shortSummary;
    const newStatus = task.status
      ? task.status + '\n' + visitLine
      : visitLine;

    try {
      await fetch(SHEET_API, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({
          row: task.row,
          status: newStatus,
          editor: visitor + ' (ביקור)',
          lastSeenTs: task.lastModified || ''
        })
      });
      setTimeout(refreshData, 1500);
    } catch(e) {
      console.error('Failed to append visit to status:', e);
    }
  }

  function buildVisitsReport(visitor, fromDate, toDate) {
    const all = loadAllVisitsCombined();
    // Dedupe by id (Sheet) or kibbutz+date+visitor (local)
    const seen = new Set();
    const uniq = all.filter(v => {
      const key = v.id || (v.kibbutz + '|' + v.date + '|' + v.visitor);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const from = fromDate ? new Date(fromDate).getTime() : 0;
    const to = toDate ? new Date(toDate + 'T23:59:59').getTime() : Date.now();

    const filtered = uniq.filter(v => {
      const d = new Date(v.date).getTime();
      if (d < from || d > to) return false;
      if (visitor && v.visitor !== visitor) return false;
      return true;
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (!filtered.length) {
      return `📍 דוח ביקורי שטח\n${visitor ? 'שולח: ' + visitor + '\n' : ''}📅 ${new Date().toLocaleString('he-IL')}\n\n✨ אין ביקורים בטווח הזה`;
    }

    let totalHours = 0;
    const byKibbutz = {};
    filtered.forEach(v => {
      totalHours += v.duration || 0;
      if (!byKibbutz[v.kibbutz]) byKibbutz[v.kibbutz] = [];
      byKibbutz[v.kibbutz].push(v);
    });

    let report = `*📍 דוח ביקורי שטח*\n`;
    if (visitor) report += `*שולח: ${visitor}*\n`;
    report += `📅 ${new Date().toLocaleString('he-IL')}\n`;
    report += `📊 ${filtered.length} ביקורים · ${totalHours.toFixed(1)} שעות סה״כ · ${Object.keys(byKibbutz).length} קיבוצים\n\n`;

    Object.entries(byKibbutz).sort((a, b) => a[0].localeCompare(b[0], 'he')).forEach(([kibbutz, visits]) => {
      const kibbutzHours = visits.reduce((s, v) => s + (v.duration || 0), 0);
      report += `*━━━ ${kibbutz} (${kibbutzHours.toFixed(1)} שעות) ━━━*\n`;
      visits.forEach(v => {
        const date = new Date(v.date).toLocaleDateString('he-IL');
        report += `📅 ${date} | ⏱️ ${v.duration}ש | 👤 ${v.visitor}\n`;
        if (v.contact) report += `  🤝 ${v.contact}\n`;
        if (v.products && v.products.length) {
          const productsStr = v.products.map(p => typeof p === 'string' ? p : (p.qty > 1 ? p.name + ' (×' + p.qty + ')' : p.name)).join(', ');
          report += `  📦 ${productsStr}${v.productsOther ? ' · ' + v.productsOther : ''}\n`;
        }
        if (v.summary) report += `  📝 ${v.summary}\n`;
      });
      report += '\n';
    });

    return report;
  }

  function openVisitsReportModal() {
    // Default: full previous calendar month
    const now = new Date();
    const firstOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfPrev = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 of next = last day of prev
    const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const fromInput = document.getElementById('visitsReportFrom');
    const toInput = document.getElementById('visitsReportTo');
    fromInput.value = fmt(firstOfPrev);
    toInput.value = fmt(lastOfPrev);
    fromInput.setAttribute('value', fmt(firstOfPrev));
    toInput.setAttribute('value', fmt(lastOfPrev));
    document.getElementById('visitsReportModal').classList.add('open');
  }

