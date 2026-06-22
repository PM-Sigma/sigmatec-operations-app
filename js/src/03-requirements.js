  // ===== CUSTOMER REQUIREMENTS =====
  const REQ_STATUSES = {
    open:        { label: '🆕 פתוחה',    color: '#dc2626', bg: '#fee2e2' },
    in_progress: { label: '🔄 בטיפול',   color: '#f59e0b', bg: '#fef3c7' },
    fulfilled:   { label: '✅ סופקה',    color: '#10b981', bg: '#d1fae5' },
    cancelled:   { label: '❌ בוטלה',    color: '#64748b', bg: '#f1f5f9' }
  };
  let reqItems = [];

  function invRenderRequirements() {
    const root = document.getElementById('invRequirementsList');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const all = (window.SHEET_DATA && window.SHEET_DATA.requirements) || [];
    const localExtra = JSON.parse(localStorage.getItem('local_requirements_v1') || '[]');
    const requirements = [...all, ...localExtra.filter(r => !all.find(x => x.id === r.id))];
    const filter = document.getElementById('invReqFilter')?.value;
    // Default filter = 'open' (show open by default to make pending requirements salient)
    const effFilter = filter === undefined || filter === null ? 'open' : filter;
    const filtered = effFilter ? requirements.filter(r => (r.status || 'open') === effFilter) : requirements;
    if (filtered.length === 0) {
      root.innerHTML = `<div style="padding:20px;text-align:center;color:#64748b;">
        אין דרישות ${effFilter === 'open' ? 'פתוחות' : 'בסינון הזה'}. לחץ "+ דרישה חדשה"
      </div>`;
      return;
    }
    let html = '<table class="inv-table"><thead><tr><th>תאריך</th><th>סטטוס</th><th>קיבוץ</th><th>איש קשר</th><th>פריטים</th><th>נוצר ע"י</th><th>הערות</th><th>פעולות</th></tr></thead><tbody>';
    filtered.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).forEach(r => {
      const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('he-IL') : '—';
      const st = REQ_STATUSES[r.status || 'open'] || REQ_STATUSES.open;
      const itemsStr = (r.items || []).map(i => `${i.name} ×${i.qty}`).join('<br>');
      const fulfillBtn = (r.status === 'open' || r.status === 'in_progress')
        ? `<button class="inv-btn small" style="background:#d1fae5;color:#065f46;border:1px solid #10b981;" onclick="quickReqStatus('${r.id}','fulfilled',this)">✅ סופקה</button>` : '';
      html += `<tr>
        <td data-label="תאריך" style="white-space:nowrap;">${date}</td>
        <td data-label="סטטוס"><span class="status-pill-inv" style="background:${st.bg};color:${st.color};">${st.label}</span></td>
        <td data-label="קיבוץ">${r.kibbutz || '—'}</td>
        <td data-label="איש קשר">${r.contactName || '—'}</td>
        <td data-label="פריטים">${itemsStr || '—'}</td>
        <td data-label="נוצר ע&quot;י">${r.createdBy || '—'}</td>
        <td data-label="הערות" style="max-width:200px;font-size:11px;">${(r.notes||'').replace(/</g,'&lt;')}</td>
        <td class="actions-cell">${fulfillBtn} <button class="inv-btn small" onclick="invEditRequirement('${r.id}')">✏️ ערוך</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  function populateReqKibbutzDropdown() {
    const sel = document.getElementById('invReqKibbutz');
    if (!sel) return;
    const tasks = (window.SHEET_DATA && window.SHEET_DATA.tasks) || [];
    const names = Array.from(new Set(tasks.map(t => t.name).filter(Boolean)))
      .sort((a,b) => a.localeCompare(b,'he'));
    const current = sel.value;
    sel.innerHTML = '<option value="">-- בחר --</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (current) sel.value = current;
  }

  function renderReqItems() {
    const wrap = document.getElementById('invReqItems');
    if (!wrap) return;
    if (reqItems.length === 0) {
      wrap.innerHTML = '<div style="font-size:11px;color:#94a3b8;font-style:italic;text-align:center;">לחץ "+ הוסף פריט"</div>';
      return;
    }
    wrap.innerHTML = reqItems.map((it, idx) => `
      <div style="display:flex;gap:6px;align-items:center;margin:4px 0;background:white;padding:5px 8px;border-radius:6px;">
        <select onchange="reqItems[${idx}].name = this.value" style="flex:1;padding:4px 6px;border-radius:4px;border:1px solid #e2e8f0;">
          ${getActiveProducts().map(pr => pr.name).map(p => `<option value="${p}" ${it.name === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${it.qty}" onchange="reqItems[${idx}].qty = parseInt(this.value)||1" style="width:60px;padding:3px 6px;border-radius:4px;border:1px solid #e2e8f0;text-align:center;">
        <button type="button" onclick="reqItems.splice(${idx},1); renderReqItems();" style="background:#dc2626;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">×</button>
      </div>
    `).join('');
  }

  function addRequirementItemRow() {
    reqItems.push({ name: getActiveProducts()[0]?.name || 'מונה EM133', qty: 1 });
    renderReqItems();
  }

  function invNewRequirement() {
    if (!checkEditPermission()) return;
    window.invEditingReqId = null;
    reqItems = [];
    populateReqKibbutzDropdown();
    document.getElementById('invReqTitle').textContent = '📋 דרישה חדשה';
    document.getElementById('invReqKibbutz').value = '';
    document.getElementById('invReqContact').value = '';
    document.getElementById('invReqDate').value = todayYmd();
    document.getElementById('invReqNotes').value = '';
    document.getElementById('invReqStatus').value = 'open';
    renderReqItems();
    document.getElementById('invRequirementModal').classList.add('open');
  }

  function invEditRequirement(id) {
    if (!checkEditPermission()) return;
    const all = (window.SHEET_DATA?.requirements || []).concat(JSON.parse(localStorage.getItem('local_requirements_v1') || '[]'));
    const r = all.find(x => x.id === id);
    if (!r) return alert('לא נמצא');
    window.invEditingReqId = id;
    reqItems = [...(r.items || [])];
    populateReqKibbutzDropdown();
    document.getElementById('invReqTitle').textContent = '📋 ערוך דרישה';
    document.getElementById('invReqKibbutz').value = r.kibbutz || '';
    document.getElementById('invReqContact').value = r.contactName || '';
    document.getElementById('invReqDate').value = r.createdAt ? r.createdAt.slice(0,10) : todayYmd();
    document.getElementById('invReqNotes').value = r.notes || '';
    document.getElementById('invReqStatus').value = r.status || 'open';
    renderReqItems();
    document.getElementById('invRequirementModal').classList.add('open');
  }

  async function invSaveRequirement(btn) {
    const kibbutz = document.getElementById('invReqKibbutz').value;
    if (!kibbutz) { alert('בחר קיבוץ'); return; }
    if (reqItems.length === 0) { alert('הוסף לפחות פריט אחד'); return; }
    const createdBy = getCurrentUser() || 'אנונימי';
    const dateRaw = document.getElementById('invReqDate').value;
    const createdAt = dateRaw ? new Date(dateRaw + 'T12:00:00').toISOString() : new Date().toISOString();
    const body = {
      type: 'requirement',
      kibbutz: kibbutz,
      contactName: document.getElementById('invReqContact').value.trim(),
      createdAt: createdAt,
      createdBy: createdBy,
      items: reqItems,
      notes: document.getElementById('invReqNotes').value.trim(),
      status: document.getElementById('invReqStatus').value
    };
    if (window.invEditingReqId) body.id = window.invEditingReqId;

    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        // Auto-append to kibbutz status (similar to visits)
        const dateShort = new Date(createdAt).toLocaleDateString('he-IL');
        const contactPart = body.contactName ? ` (${body.contactName})` : '';
        const itemsShort = reqItems.map(i => `${i.qty}× ${i.name}`).join(', ');
        const reqLine = `🛒 דרישה ${dateShort}${contactPart}: ${itemsShort}`;
        autoAppendVisitToStatus(kibbutz, dateShort, createdBy, reqLine);
        document.getElementById('invRequirementModal').classList.remove('open');
        setTimeout(refreshData, 1000);
        const t = document.getElementById('toast');
        t.textContent = '✅ הדרישה נשמרה ועודכנה בסטטוס הקיבוץ';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
      } else if (data.error) {
        // Fallback to localStorage if Apps Script doesn't yet know type='requirement'
        const local = JSON.parse(localStorage.getItem('local_requirements_v1') || '[]');
        const id = body.id || ('req_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
        const idx = local.findIndex(x => x.id === id);
        const record = { ...body, id };
        if (idx >= 0) local[idx] = record; else local.push(record);
        localStorage.setItem('local_requirements_v1', JSON.stringify(local));
        document.getElementById('invRequirementModal').classList.remove('open');
        invRenderRequirements();
        const t = document.getElementById('toast');
        t.textContent = '⚠️ נשמר מקומית (Apps Script v5 לא פרוס עדיין)';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000);
      }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  async function quickReqStatus(id, newStatus, btn) {
    if (!checkEditPermission()) return;
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'requirement', id: id, status: newStatus })
      });
      const data = await res.json();
      if (data.ok) setTimeout(refreshData, 800);
      else { // localStorage fallback
        const local = JSON.parse(localStorage.getItem('local_requirements_v1') || '[]');
        const rec = local.find(x => x.id === id);
        if (rec) { rec.status = newStatus; localStorage.setItem('local_requirements_v1', JSON.stringify(local)); invRenderRequirements(); }
      }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

