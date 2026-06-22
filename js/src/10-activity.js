  // ===== Daily Activity Tracker — non-migration changes =====
  // Tracks "who's using the dashboard" by looking at:
  //  1. Visits added (VISITS sheet)
  //  2. Task field updates (lastModified + editor in tasks sheet)
  //  Excludes auto-pushed system markers (e.g., 'idan_bulk_proc')
  function openActivityModal() {
    document.getElementById('activityRange').value = 'today';
    document.getElementById('activityModal').classList.add('open');
    renderActivity();
  }

  function getRangeStart(range) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === 'today') return today.getTime();
    if (range === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return y.getTime();
    }
    if (range === 'week') {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return w.getTime();
    }
    return 0;
  }

  function getRangeEnd(range) {
    const now = new Date();
    if (range === 'yesterday') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return today.getTime() - 1;
    }
    return Date.now();
  }

  function collectActivities(range) {
    const from = getRangeStart(range);
    const to = getRangeEnd(range);
    const activities = [];

    // Visits
    loadAllVisitsCombined().forEach(v => {
      const ts = new Date(v.createdAt || v.date).getTime();
      if (ts < from || ts > to) return;
      activities.push({
        time: ts,
        actor: v.visitor || 'לא ידוע',
        type: '📍 ביקור',
        kibbutz: v.kibbutz,
        details: (v.summary ? v.summary.slice(0, 80) : '') + (v.duration ? ' · ' + v.duration + ' שעות' : ''),
        source: 'visit'
      });
    });

    // Task updates (status/expectedTask/owners changed in dashboard)
    const tasks = (window.SHEET_DATA && window.SHEET_DATA.tasks) || [];
    tasks.forEach(t => {
      if (!t.lastModified) return;
      const ts = new Date(t.lastModified).getTime();
      if (ts < from || ts > to) return;
      const editor = String(t.editor || '').trim();
      // Filter out automated/migration-related editors
      if (!editor || /bulk|migration|seed|auto|init/i.test(editor)) return;
      activities.push({
        time: ts,
        actor: editor.replace(/\s*\(ביקור\)\s*$/, ''),
        type: editor.includes('(ביקור)') ? '📍 עדכון סטטוס מביקור' : '✏️ עדכון כרטיס',
        kibbutz: t.name,
        details: t.status ? t.status.split('\n').slice(-1)[0].slice(0, 80) : '',
        source: 'task'
      });
    });

    return activities.sort((a, b) => b.time - a.time);
  }

  function renderActivity() {
    const range = document.getElementById('activityRange').value;
    const activities = collectActivities(range);
    document.getElementById('activityCount').textContent = activities.length + ' פעולות';

    if (!activities.length) {
      document.getElementById('activityContent').innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;font-style:italic;">אין פעילות בתקופה הזו</div>';
      return;
    }

    // Group by actor
    const byActor = {};
    activities.forEach(a => {
      if (!byActor[a.actor]) byActor[a.actor] = [];
      byActor[a.actor].push(a);
    });

    let html = '';
    Object.entries(byActor).sort((a, b) => b[1].length - a[1].length).forEach(([actor, items]) => {
      html += '<div style="background:#f9fafb;border-right:3px solid #8b5cf6;padding:10px 14px;border-radius:8px;margin-bottom:10px;">';
      html += '<div style="font-weight:700;font-size:14px;color:#6d28d9;margin-bottom:6px;">👤 ' + actor + ' <span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:10px;font-size:11px;margin-right:6px;">' + items.length + ' פעולות</span></div>';
      items.forEach(a => {
        const t = new Date(a.time);
        const timeStr = t.toLocaleDateString('he-IL') + ' ' + t.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
        html += '<div style="padding:4px 0;border-bottom:1px solid #e5e7eb;font-size:12px;">';
        html += '<span style="color:#94a3b8;">' + timeStr + '</span> · ';
        html += '<strong>' + a.type + '</strong> · ';
        html += '<span style="color:#1e40af;">' + a.kibbutz + '</span>';
        if (a.details) html += ' <span style="color:#475569;">— ' + a.details.replace(/</g,'&lt;') + '</span>';
        html += '</div>';
      });
      html += '</div>';
    });
    document.getElementById('activityContent').innerHTML = html;
  }

  function copyActivityReport() {
    const range = document.getElementById('activityRange').value;
    const rangeLabels = { today: 'היום', yesterday: 'אתמול', week: '7 ימים אחרונים', all: 'הכל' };
    const activities = collectActivities(range);
    let text = '📊 דוח פעילות במערכת (' + rangeLabels[range] + ')\n';
    text += '📅 נוצר: ' + new Date().toLocaleString('he-IL') + '\n';
    text += 'סה״כ ' + activities.length + ' פעולות\n\n';

    const byActor = {};
    activities.forEach(a => {
      if (!byActor[a.actor]) byActor[a.actor] = [];
      byActor[a.actor].push(a);
    });
    Object.entries(byActor).sort((a, b) => b[1].length - a[1].length).forEach(([actor, items]) => {
      text += '👤 ' + actor + ' (' + items.length + ' פעולות):\n';
      items.forEach(a => {
        const t = new Date(a.time);
        text += '  · ' + t.toLocaleString('he-IL') + ' — ' + a.type + ' — ' + a.kibbutz;
        if (a.details) text += ' — ' + a.details;
        text += '\n';
      });
      text += '\n';
    });

    navigator.clipboard.writeText(text).then(() => {
      const t = document.getElementById('toast');
      t.textContent = '✅ הדוח הועתק לקליפבורד';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    });
  }

  function setReportRange(range) {
    const today = new Date();
    const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let from = '', to = '';
    if (range === 'thisMonth') {
      from = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
      to   = fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (range === 'lastMonth') {
      from = fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      to   = fmt(new Date(today.getFullYear(), today.getMonth(), 0));
    } else if (range === 'last7') {
      const start = new Date(today); start.setDate(start.getDate() - 6);
      from = fmt(start); to = fmt(today);
    } else if (range === 'last30') {
      const start = new Date(today); start.setDate(start.getDate() - 29);
      from = fmt(start); to = fmt(today);
    } else if (range === 'all') {
      from = '2025-01-01'; to = '2099-01-01';
    }
    document.getElementById('visitsReportFrom').value = from;
    document.getElementById('visitsReportTo').value = to;
    document.querySelectorAll('.btn-quick-date').forEach(b => b.classList.remove('active'));
    const active = Array.from(document.querySelectorAll('.btn-quick-date')).find(b => b.getAttribute('onclick')?.includes("'" + range + "'"));
    if (active) active.classList.add('active');
  }

  function generateVisitsReport(action) {
    const visitor = document.getElementById('visitsReportVisitor').value;
    const from = document.getElementById('visitsReportFrom').value;
    const to = document.getElementById('visitsReportTo').value;
    const report = buildVisitsReport(visitor, from, to);

    // Close the modal first so user isn't stuck behind it
    document.getElementById('visitsReportModal').classList.remove('open');

    if (action === 'preview') {
      openVisitsReportHTMLView(visitor, from, to);
    } else if (action === 'copy') {
      navigator.clipboard.writeText(report).then(() => {
        const t = document.getElementById('toast');
        t.textContent = '✅ הדוח הועתק';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
      }).catch(err => {
        alert('שגיאה בהעתקה: ' + err.message);
      });
    } else if (action === 'whatsapp') {
      const contact = visitor && CONTACTS[visitor] ? CONTACTS[visitor] : { phone: '972544649833' };
      window.open('https://wa.me/' + (contact.phone || '972544649833') + '?text=' + encodeURIComponent(report), '_blank');
    }
  }

  // Build a date list from 'from' to 'to' (inclusive)
  function dateRange(fromStr, toStr) {
    const out = [];
    if (!fromStr || !toStr) return out;
    const start = new Date(fromStr + 'T00:00:00');
    const end = new Date(toStr + 'T00:00:00');
    const d = new Date(start);
    while (d <= end) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  const DAY_LETTERS = ['א','ב','ג','ד','ה','ו','ש'];

  function openVisitsReportHTMLView(visitor, fromDate, toDate) {
    const all = loadAllVisitsCombined();
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

    // Group visits by their YYYY-MM-DD
    const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const visitsByDay = {};
    filtered.forEach(v => {
      const k = dayKey(new Date(v.date));
      if (!visitsByDay[k]) visitsByDay[k] = [];
      visitsByDay[k].push(v);
    });

    // Stats
    const totalHours = filtered.reduce((s, v) => s + (v.duration || 0), 0);
    const uniqueKibbutzim = new Set(filtered.map(v => v.kibbutz));
    const uniqueVisitors = new Set(filtered.map(v => v.visitor || 'לא ידוע'));
    const byVisitor = {};
    filtered.forEach(v => {
      const vis = v.visitor || 'לא ידוע';
      if (!byVisitor[vis]) byVisitor[vis] = { count: 0, hours: 0 };
      byVisitor[vis].count++;
      byVisitor[vis].hours += v.duration || 0;
    });

    const allDates = dateRange(fromDate, toDate);
    const fromLabel = fromDate ? new Date(fromDate).toLocaleDateString('he-IL') : '—';
    const toLabel = toDate ? new Date(toDate).toLocaleDateString('he-IL') : '—';
    const monthYearLabel = fromDate ? new Date(fromDate).toLocaleDateString('he-IL', {month:'long', year:'numeric'}) : '';

    // Build calendar table rows — only days with visits
    const tableRows = [];
    allDates.forEach(d => {
      const k = dayKey(d);
      const dayLetter = DAY_LETTERS[d.getDay()];
      const isWeekend = d.getDay() === 5 || d.getDay() === 6;
      const dateText = d.getDate() + '.' + (d.getMonth() + 1);
      const visits = visitsByDay[k] || [];

      if (visits.length === 0) {
        return; // skip empty days
      }
      {
        // For each visit, create product rows
        // First, compute total rowspan for day/date cell
        let totalRowspan = 0;
        visits.forEach(v => {
          const products = (v.products || []).filter(Boolean);
          const productCount = products.length;
          totalRowspan += Math.max(1, productCount);
        });

        let isFirstRowOfDay = true;
        visits.forEach((v, vi) => {
          const products = (v.products || []).map(p => typeof p === 'string' ? { name: p, qty: 1 } : p);
          const productCount = products.length;
          const visitRowspan = Math.max(1, productCount);
          let isFirstRowOfVisit = true;

          if (productCount === 0) {
            // One row, no products
            const rowDayCell = isFirstRowOfDay ? `<td class="day" rowspan="${totalRowspan}">${dayLetter}</td><td class="date" rowspan="${totalRowspan}">${dateText}</td>` : '';
            tableRows.push(`<tr class="${isWeekend ? 'weekend-row' : ''}">
              ${rowDayCell}
              <td><strong>${v.kibbutz || '—'}</strong></td>
              <td><span class="chip visitor">${v.visitor || '—'}</span></td>
              <td class="num">${v.duration || 0}</td>
              <td>${v.contact || '<span class="muted">—</span>'}</td>
              <td class="summary">${(v.summary || '').replace(/</g,'&lt;').replace(/\n/g,'<br>') || '<span class="muted">—</span>'}</td>
              <td>${v.productsOther ? v.productsOther : '<span class="muted">—</span>'}</td>
              <td class="num"><span class="muted">—</span></td>
            </tr>`);
            isFirstRowOfDay = false;
          } else {
            products.forEach((p, pi) => {
              const rowDayCell = isFirstRowOfDay ? `<td class="day" rowspan="${totalRowspan}">${dayLetter}</td><td class="date" rowspan="${totalRowspan}">${dateText}</td>` : '';
              const visitCells = isFirstRowOfVisit ? `
                <td rowspan="${visitRowspan}"><strong>${v.kibbutz || '—'}</strong></td>
                <td rowspan="${visitRowspan}"><span class="chip visitor">${v.visitor || '—'}</span></td>
                <td rowspan="${visitRowspan}" class="num">${v.duration || 0}</td>
                <td rowspan="${visitRowspan}">${v.contact || '<span class="muted">—</span>'}</td>
                <td rowspan="${visitRowspan}" class="summary">${(v.summary || '').replace(/</g,'&lt;').replace(/\n/g,'<br>') || '<span class="muted">—</span>'}</td>
              ` : '';
              tableRows.push(`<tr class="${isWeekend ? 'weekend-row' : ''}">
                ${rowDayCell}
                ${visitCells}
                <td>${p.name}</td>
                <td class="num">${p.qty || 1}</td>
              </tr>`);
              isFirstRowOfDay = false;
              isFirstRowOfVisit = false;
            });
            // If there's productsOther free text, add it as one more row at the bottom of the visit block
            if (v.productsOther) {
              // It's already rolled into the LAST product row above via separate cell? Actually no — let me handle as appended row to summary
              // Skipping for clean layout — productsOther is shown only when there are no checkbox products (covered above)
            }
          }
        });
      }
    });

    // Generate CSV for download
    const csvRows = [];
    csvRows.push(['יום','תאריך','קיבוץ','מבקר','משך (שעות)','איש קשר','סיכום ביקור','פריט','כמות','אחר']);
    allDates.forEach(d => {
      const k = dayKey(d);
      const dayLetter = DAY_LETTERS[d.getDay()];
      const dateText = d.toLocaleDateString('he-IL');
      const visits = visitsByDay[k] || [];
      if (visits.length === 0) {
        return; // skip empty days in CSV
      }
      {
        visits.forEach(v => {
          const products = (v.products || []).map(p => typeof p === 'string' ? { name: p, qty: 1 } : p);
          if (products.length === 0) {
            csvRows.push([dayLetter, dateText, v.kibbutz || '', v.visitor || '', v.duration || 0, v.contact || '', (v.summary || '').replace(/\n/g, ' '), '', '', v.productsOther || '']);
          } else {
            products.forEach((p, pi) => {
              csvRows.push([dayLetter, dateText, pi === 0 ? (v.kibbutz || '') : '', pi === 0 ? (v.visitor || '') : '', pi === 0 ? (v.duration || 0) : '', pi === 0 ? (v.contact || '') : '', pi === 0 ? (v.summary || '').replace(/\n/g, ' ') : '', p.name, p.qty || 1, pi === 0 ? (v.productsOther || '') : '']);
            });
          }
        });
      }
    });
    const csv = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const csvBlob = btoa(unescape(encodeURIComponent('﻿' + csv)));

    const visitorRows = Object.entries(byVisitor).sort((a, b) => b[1].count - a[1].count)
      .map(([n, s]) => `<tr><td><strong>${n}</strong></td><td>${s.count}</td><td>${s.hours.toFixed(1)}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head>
      <meta charset="UTF-8"><title>סיכום ביקורי שטח</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Heebo',Tahoma,sans-serif;background:#f8fafc;color:#1e293b;padding:20px;line-height:1.4}
        .container{max-width:1400px;margin:0 auto}
        header{background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:20px 28px;border-radius:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;box-shadow:0 4px 16px rgba(30,64,175,0.18)}
        h1{font-size:22px}
        .sub{font-size:13px;opacity:0.9;margin-top:4px}
        .actions{display:flex;gap:8px}
        .actions button{background:white;color:#1e40af;padding:8px 14px;border-radius:8px;font-weight:700;font-size:13px;border:none;cursor:pointer}
        .actions button:hover{background:#e0e7ff}
        .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
        .kpi{background:white;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-right:3px solid #3b82f6;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
        .kpi .label{font-size:11px;color:#64748b;font-weight:600;margin-bottom:3px}
        .kpi .value{font-size:26px;font-weight:800;line-height:1}
        .kpi.green{border-right-color:#10b981}.kpi.green .value{color:#10b981}
        .kpi.orange{border-right-color:#f59e0b}.kpi.orange .value{color:#f59e0b}
        .visitor-panel{background:white;border-radius:10px;border:1px solid #e2e8f0;padding:14px 18px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
        .visitor-panel h3{font-size:14px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
        .visitor-panel table{width:100%;max-width:500px;font-size:12px}
        table.calendar{width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04);font-size:12.5px}
        table.calendar th{text-align:right;padding:8px 10px;background:#1e293b;color:white;font-weight:700;font-size:12px}
        table.calendar td{padding:7px 10px;border-bottom:1px solid #e2e8f0;border-right:1px solid #f1f5f9;vertical-align:top}
        table.calendar .day{text-align:center;width:32px;font-weight:800;color:#475569;background:#f8fafc}
        table.calendar .date{text-align:center;width:56px;font-weight:700;color:#1e40af;background:#f8fafc;white-space:nowrap}
        table.calendar .num{text-align:center;width:54px}
        table.calendar .summary{max-width:280px;line-height:1.5}
        table.calendar tr.weekend td{background:#fef9c3 !important;color:#854d0e}
        table.calendar tr.weekend-row td{background:#fefce8}
        table.calendar tr.weekend-row .day,table.calendar tr.weekend-row .date{background:#fef08a}
        table.calendar .empty-cell{color:#94a3b8;font-style:italic;text-align:center}
        table.calendar tr.empty-day td:not(.day):not(.date){background:#fafafa}
        .chip{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
        .chip.visitor{background:#d1fae5;color:#065f46}
        .muted{color:#94a3b8;font-style:italic}
        .empty-state{text-align:center;padding:60px;color:#94a3b8;font-style:italic;background:white;border-radius:12px;border:1px solid #e2e8f0}
        @media print{
          body{background:white;padding:0;font-size:11px}
          header{box-shadow:none;background:#1e40af !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .actions{display:none}
          table.calendar{box-shadow:none;font-size:10.5px}
          table.calendar th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
          tr{page-break-inside:avoid}
          .kpi,.visitor-panel{box-shadow:none}
          .kpis{grid-template-columns:repeat(4,1fr)}
        }
      </style></head><body>
      <div class="container">
        <header>
          <div>
            <h1>📍 סיכום ביקורי שטח — ${monthYearLabel || (fromLabel + ' → ' + toLabel)}</h1>
            <div class="sub">${visitor ? '👤 ' + visitor + ' · ' : ''}${filtered.length} ביקורים · ${totalHours.toFixed(1)} שעות · ${uniqueKibbutzim.size} קיבוצים</div>
          </div>
          <div class="actions">
            <button onclick="window.print()">🖨 הדפס / PDF</button>
            <button onclick="downloadCSV()">📊 הורד Excel</button>
          </div>
        </header>

        ${filtered.length === 0 ? '<div class="empty-state">אין ביקורים בתקופה זו</div>' : `
        <div class="kpis">
          <div class="kpi"><div class="label">📊 ביקורים</div><div class="value">${filtered.length}</div></div>
          <div class="kpi green"><div class="label">⏱ שעות</div><div class="value">${totalHours.toFixed(1)}</div></div>
          <div class="kpi orange"><div class="label">🏘 קיבוצים</div><div class="value">${uniqueKibbutzim.size}</div></div>
          <div class="kpi"><div class="label">👥 מבקרים</div><div class="value">${uniqueVisitors.size}</div></div>
        </div>
        ${uniqueVisitors.size > 1 ? `<div class="visitor-panel">
          <h3>👥 פירוט לפי מבקר</h3>
          <table><thead><tr><th>שם</th><th>ביקורים</th><th>שעות</th></tr></thead><tbody>${visitorRows}</tbody></table>
        </div>` : ''}
        `}

        <table class="calendar">
          <thead>
            <tr>
              <th class="day">יום</th>
              <th class="date">תאריך</th>
              <th>קיבוץ</th>
              <th>מבקר</th>
              <th class="num">משך</th>
              <th>איש קשר</th>
              <th>סיכום ביקור</th>
              <th>פריט שסופק</th>
              <th class="num">כמות</th>
            </tr>
          </thead>
          <tbody>${tableRows.join('')}</tbody>
        </table>
      </div>

      <` + `script>
        const CSV_B64 = "${csvBlob}";
        const FILENAME = "visits_${(fromDate || 'all').replace(/-/g, '')}_${(toDate || '').replace(/-/g, '')}.csv";
        function downloadCSV() {
          const binary = atob(CSV_B64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = FILENAME;
          a.click();
          URL.revokeObjectURL(url);
        }
      <\/` + `script>
    </body></html>`;

    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) {
        alert('הדפדפן חסם את פתיחת הדוח. אנא אפשר חלונות קופצים לאתר זה.');
        return;
      }
      // Cleanup the object URL after the new tab loads
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      alert('שגיאה ביצירת הדוח: ' + e.message);
    }
  }

  function openEditModal(card) {
    const name = card.dataset.name;
    currentKibbutz = name;
    const task = (window.SHEET_DATA && window.SHEET_DATA.tasks || []).find(t => t.name === name);

    document.getElementById('modalSub').textContent = 'קיבוץ: ' + name + (task && task.code ? ' (#' + task.code + ')' : '');
    // merged status field — fold any legacy expectedTask into the status text
    document.getElementById('editStatus').value = [task && task.status, task && task.expectedTask]
      .map(x => String(x || '').trim()).filter(x => x && x !== '-').join('\n');
    document.getElementById('editTask').value = '';
    document.getElementById('editOwner1').value = (task && task.owners && task.owners[0]) || '';
    document.getElementById('editOwner2').value = (task && task.owners && task.owners[1]) || '';
    document.getElementById('editorName').value = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    // Setup progress: parse from task field or use card defaults
    const parsedT = task ? parseTaskField(task.task) : {step:null, note:''};
    const cardStep = card.dataset.step ? parseInt(card.dataset.step) : null;
    const cardNote = card.querySelector('.kibbutz-note')?.textContent || '';
    document.getElementById('editStep').value = parsedT.step || cardStep || '';
    document.getElementById('editSetupNote').value = parsedT.note || cardNote || '';
    document.getElementById('editCategory').value = '';
    document.getElementById('editEngagement').value = parsedT.type || '';
    window.currentEditTask = task || null;
    // Reset visit form
    window.editingVisitId = null;
    document.getElementById('visitSummary').value = '';
    document.getElementById('visitProductsOther').value = '';
    document.getElementById('visitContact').value = '';
    document.getElementById('visitDuration').value = '';
    const wdReset = document.getElementById('visitWorkday');
    if (wdReset) { wdReset.checked = false; toggleVisitWorkday(); }
    document.getElementById('visitor').value = '';
    if (typeof prepVisitEmsBlock === 'function') prepVisitEmsBlock(name);   // Phase 2: in-form EMS update
    if (typeof prepModalEmsSection === 'function') prepModalEmsSection(name);   // update tab: open task / create-new below status
    // Default date to today
    const today = new Date();
    document.getElementById('visitDate').value =
      today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    // Reset product list (visitor cleared → placeholder will show)
    window.editingVisitId = null;
    visitReturnedItems = [];
    renderReturnedItems();
    applyUserRestrictions();
    renderProductsForVisitor();
    renderLastVisit(name);
    // Read-only last-visit report above the status (renderLastVisit populated currentKibbutzVisits)
    const elvBox = document.getElementById('editLastVisitBox');
    const elvContent = document.getElementById('editLastVisitContent');
    const lastV = (window.currentKibbutzVisits && window.currentKibbutzVisits[0]) || null;
    if (elvBox && elvContent) {
      if (lastV) { elvContent.textContent = lastVisitText(lastV); elvBox.style.display = 'block'; }
      else { elvBox.style.display = 'none'; }
    }
    switchTab('edit');
    document.getElementById('modalBackdrop').classList.add('open');
  }

  // Override the existing card click handler
  document.querySelectorAll('.kibbutz').forEach(card => {
    const newCard = card.cloneNode(true);
    card.parentNode.replaceChild(newCard, card);
  });
  document.querySelectorAll('.kibbutz').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(card);
    });
  });

  async function saveTask() {
    if (!checkEditPermission()) return;
    const task = window.currentEditTask;
    const editorName = document.getElementById('editorName').value.trim();
    if (!editorName) { alert('נא לבחור מי מעדכן'); return; }

    const owners = [
      document.getElementById('editOwner1').value,
      document.getElementById('editOwner2').value
    ].filter(Boolean);

    // task may be null when the kibbutz exists as a card but has no sheet row yet
    const currentParsed = task ? parseTaskField(task.task) : { proc: null, step: null, note: '', cat: null, type: null };
    const stepVal = parseInt(document.getElementById('editStep').value);
    const noteVal = document.getElementById('editSetupNote').value.trim();
    const catSelected = document.getElementById('editCategory').value;
    const finalCat = catSelected || currentParsed.cat || null;
    const engagementSelected = document.getElementById('editEngagement').value;
    const finalType = engagementSelected || currentParsed.type || null;
    const newTaskField = serializeTaskField(
      currentParsed.proc,
      isNaN(stepVal) ? null : stepVal,
      noteVal,
      finalCat,
      finalType
    );

    // Move card locally for immediate feedback
    if (catSelected && CATEGORIES[catSelected]) {
      const card = document.querySelector('.kibbutz[data-name="' + currentKibbutz + '"]');
      if (card) moveCardToCategory(card, catSelected);
    }

    const body = {
      name: currentKibbutz,
      row: task && task.row ? task.row : null,
      status: document.getElementById('editStatus').value,
      expectedTask: '',   // merged into status — keep this column empty going forward
      owners: owners,
      task: newTaskField,
      editor: editorName,
      lastSeenTs: (task && task.lastModified) ? task.lastModified : ''
    };

    try {
      const r = await fetch(SHEET_API, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(body)
      });
      const res = await r.json();
      if (res.conflict) {
        if (!confirm('השדה עודכן על-ידי משתמש אחר. להחליף בכל זאת?')) return;
        body.lastSeenTs = '';
        await fetch(SHEET_API, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(body)});
      }
      closeModal({target: {id: 'modalBackdrop'}});
      const t = document.getElementById('toast');
      t.textContent = res.created ? '✅ נוסף לגיליון בהצלחה' : '✅ נשמר לגיליון בהצלחה';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
      setTimeout(refreshData, 1500);
    } catch (e) {
      alert('שגיאה בשמירה: ' + e.message);
    }
  }

  // Recompute the compact stats row from the actual cards (was hardcoded before)
  // Single source of truth for every displayed count — counts the actual cards
  // in each section grid (so numbers always reflect reality, never hardcoded HTML).
  function updateStatsFromCards() {
    const gridCount = id => {
      const g = document.getElementById(id);
      return g ? g.querySelectorAll('.kibbutz').length : 0;
    };
    const c = {
      priority:  gridCount('grid-priority'),
      newClient: gridCount('grid-new_client'),
      done:      gridCount('grid-done'),
      pending:   gridCount('grid-pending')
    };
    const total = c.priority + c.newClient + c.done + c.pending;
    if (!total) return; // cards not rendered yet — keep placeholders

    // Section-count badges (next to each section header)
    const setSection = (gridId, n) => {
      const grid = document.getElementById(gridId);
      const badge = grid && grid.closest('.section')?.querySelector('.section-count');
      if (badge) badge.textContent = n;
    };
    setSection('grid-priority',   c.priority);
    setSection('grid-new_client', c.newClient);
    setSection('grid-done',       c.done);
    setSection('grid-pending',    c.pending);

    // Compact stat cards
    const setVal = (selector, val) => {
      const el = document.querySelector(selector + ' .stat-value');
      if (el) el.textContent = val;
    };
    setVal('.stats-compact .stat.done',    c.done);
    setVal('.stats-compact .stat.track',   c.priority);
    setVal('.stats-compact .stat.dev',     c.newClient);
    setVal('.stats-compact .stat.pending', c.pending);

    // Overall progress = live / total
    const pct = Math.round((c.done / total) * 100);
    const pctEl = document.querySelector('.progress-percent');
    if (pctEl) pctEl.textContent = pct + '%';
    const bar = document.querySelector('.progress-bar');
    if (bar) {
      const w = n => (n / total * 100).toFixed(1) + '%';
      const segDone  = bar.querySelector('.seg-done');
      const segTrack = bar.querySelector('.seg-track');
      const segThird = bar.children[2];
      if (segDone)  segDone.style.width  = w(c.done);
      if (segTrack) segTrack.style.width = w(c.priority);
      if (segThird) segThird.style.width = w(c.newClient);
    }
  }

  // "ביקור אחרון" line on each card (latest visit from VISITS). Always rendered; prominent in meeting mode.
  function applyCardLastVisit() {
    const visits = (window.SHEET_DATA && window.SHEET_DATA.visits) || [];
    const latest = {};
    visits.forEach(v => { if (!v.kibbutz || !v.date) return; if (!latest[v.kibbutz] || new Date(v.date) > new Date(latest[v.kibbutz].date)) latest[v.kibbutz] = v; });
    document.querySelectorAll('.kibbutz[data-name]').forEach(card => {
      card.querySelectorAll('.card-last-visit').forEach(e => e.remove());
      const v = latest[card.dataset.name];
      if (!v) return;
      const d = new Date(v.date).toLocaleDateString('he-IL');
      const el = document.createElement('div');
      el.className = 'card-last-visit excel-injected';
      el.textContent = '📍 ביקור אחרון: ' + d + (v.visitor ? ' · ' + v.visitor : '') + (v.summary ? ' — ' + String(v.summary).slice(0, 70) : '');
      card.appendChild(el);
    });
  }

  function reorderCards() {
    const TOP_CLASSES = ['kibbutz-name-row','kibbutz-name','kibbutz-meta','excel-status','card-ems','card-ems-new','card-last-visit','owners-row','marketing-badge'];
    const BOTTOM_CLASSES = ['kibbutz-note','ready-flow-flag','flow-active-flag','urgent-flag','manual-flow-flag','new-client-flag','flow-bug-flag','bug-details','stepper','current-step-label','proc-btn','calendar-event'];

    document.querySelectorAll('.kibbutz').forEach(card => {
      // Remove existing divider
      card.querySelectorAll('.card-divider').forEach(d => d.remove());

      const top = [], bottom = [], comment = [];
      Array.from(card.children).forEach(child => {
        if (child.classList.contains('priority-flag')) return;
        if (child.classList.contains('comment-hint')) { comment.push(child); return; }
        const cls = Array.from(child.classList);
        if (cls.some(c => TOP_CLASSES.includes(c))) top.push(child);
        else if (cls.some(c => BOTTOM_CLASSES.includes(c))) bottom.push(child);
      });

      // Re-order in place. appendChild MOVES an existing child (no detach gap), so a
      // partial failure or a concurrent re-render can never leave a card blank.
      // (Detaching everything first was the cause of cards vanishing on EMS connect.)
      top.forEach(c => card.appendChild(c));
      if (bottom.length > 0) {
        const div = document.createElement('div');
        div.className = 'card-divider';
        card.appendChild(div);
        bottom.forEach(c => card.appendChild(c));
      }
      comment.forEach(c => card.appendChild(c));
    });
  }

  async function refreshData() {
    const data = await fetchSheetData();
    if (data) {
      window.dataLoaded = true;
      enrichCardsWithSheet(data);
      renderPotentials(data);
      injectCustomerCodes();
      injectSteppers();
      applyCardLastVisit();
      reorderCards();
      updateStatsFromCards();
      renderCompanyTasks();
      maybeShowAttendanceReminder();
      if (typeof renderLowStockAlert === 'function') renderLowStockAlert();
      const lastMod = maxLastModified(data);
      if (lastMod) renderLastUpdated(lastMod);
      // Re-render inventory views if user has them open
      const invView = document.getElementById('inventory-view');
      if (invView && invView.style.display !== 'none' && typeof renderInventory === 'function') {
        renderInventory();
      }
    }
  }

  // Run once on load + poll every 10 seconds
  // Helper: today as YYYY-MM-DD (for default values on <input type="date">)
  function todayYmd() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

