  // ===== AVIAM DAILY ATTENDANCE =====
  const ATT_LABELS = { field:'🌾 יום שטח', office:'🏢 משרד', wfh:'🏠 מהבית', reserve:'🪖 מילואים', vacation:'🌴 חופש', off:'🚫 לא בעבודה', other:'➕ אחר' };
  const ATT_COLORS = { field:['#d1fae5','#065f46'], office:['#dbeafe','#1e40af'], wfh:['#ede9fe','#4c1d95'], reserve:['#fee2e2','#991b1b'], vacation:['#fef3c7','#92400e'], off:['#f1f5f9','#475569'], other:['#e0e7ff','#3730a3'] };
  window.aviamDayType = 'field';
  window.attendanceViewYear  = new Date().getFullYear();
  window.attendanceViewMonth = new Date().getMonth();

  function setAviamDayType(type) {
    window.aviamDayType = type;
    document.querySelectorAll('.day-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const isField = type === 'field';
    document.getElementById('visitFieldForm').style.display = isField ? '' : 'none';
    document.getElementById('visitSimpleForm').style.display = isField ? 'none' : '';
    const otherWrap = document.getElementById('aviamOtherWrap');
    if (otherWrap) otherWrap.style.display = (type === 'other') ? '' : 'none';
    if (!isField) {
      const d = document.getElementById('aviamSimpleDate');
      if (d && !d.value) d.value = todayYmd();
    }
  }

  function saveAttendance(btn) {
    const dateVal = document.getElementById('aviamSimpleDate').value;
    if (!dateVal) { alert('נא לבחור תאריך'); return; }
    const dayType = window.aviamDayType || 'office';
    const note = (dayType === 'other') ? (document.getElementById('aviamOtherText').value || '').trim() : '';
    if (dayType === 'other' && !note) { alert('נא לפרט מה היה ביום (אחר)'); return; }
    const person = (document.getElementById('visitor') && document.getElementById('visitor').value) || attPerson();
    setBtnLoading(btn, true);
    const isoDate = new Date(dateVal + 'T12:00:00').toISOString();
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'attendance', person: person, dayType, note, date: isoDate })
    }).then(r => r.json()).then(res => {
      if (res && res.ok) {
        if (window.SHEET_DATA) {
          window.SHEET_DATA.attendance = window.SHEET_DATA.attendance || [];
          window.SHEET_DATA.attendance.push({ id: res.id, person: person, dayType, note, date: isoDate });
        }
        const t = document.getElementById('toast');
        t.textContent = '✅ ' + ATT_LABELS[dayType] + (note ? ' (' + note + ')' : '') + ' נשמר';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
        closeModal();
        if (document.getElementById('attendance-view').style.display !== 'none') renderAttendanceReport();
      }
    }).catch(() => {
      const t = document.getElementById('toast');
      t.textContent = '⚠️ שגיאה בשמירה'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
    }).finally(() => setBtnLoading(btn, false));
  }

  function changeAttendanceMonth(delta) {
    window.attendanceViewMonth += delta;
    if (window.attendanceViewMonth > 11) { window.attendanceViewMonth = 0; window.attendanceViewYear++; }
    if (window.attendanceViewMonth < 0)  { window.attendanceViewMonth = 11; window.attendanceViewYear--; }
    renderAttendanceReport();
  }

  function renderAttendanceReport() {
    const year  = window.attendanceViewYear;
    const month = window.attendanceViewMonth;
    const heMonths = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const lbl = document.getElementById('attendanceMonthLabel');
    if (lbl) lbl.textContent = heMonths[month] + ' ' + year;

    const who = attPerson();   // אביאם / ניתאי — each report is private to that person
    const titleEl = document.getElementById('attendanceTitle');
    if (titleEl) titleEl.textContent = '📅 נוכחות חודשית — ' + who;
    // עידן may switch between people; field users see only themselves
    const toggle = document.getElementById('attPersonToggle');
    if (toggle) {
      if (isIdan()) { toggle.style.display = 'flex';
        toggle.innerHTML = ATT_PEOPLE.map(p => '<button class="day-type-btn ' + (p === who ? 'active' : '') + '" onclick="setAttPerson(\'' + p + '\')">' + p + '</button>').join('');
      } else { toggle.style.display = 'none'; }
    }

    // Non-field days from ATTENDANCE tab (carry the "אחר" note)
    const attRows = ((window.SHEET_DATA && window.SHEET_DATA.attendance) || [])
      .filter(a => a.person === who)
      .map(a => ({ date: new Date(a.date), type: a.dayType, kibbutz: '', duration: 0, note: a.note || '' }))
      .filter(a => a.date.getFullYear() === year && a.date.getMonth() === month);

    // Field days from VISITS (carry the summary so it can be expanded under the row)
    const fieldRows = ((window.SHEET_DATA && window.SHEET_DATA.visits) || [])
      .filter(v => v.visitor === who)
      .map(v => ({ date: new Date(v.date), type: 'field', kibbutz: v.kibbutz || '', duration: parseFloat(v.duration) || 0, summary: v.summary || '', id: v.id || '', workday: !!v.workday }))
      .filter(v => v.date.getFullYear() === year && v.date.getMonth() === month);

    // Merge by calendar date — same day with 2 kibbutzim → ONE row (like the visits report).
    const all = mergeAttendanceByDate([...attRows, ...fieldRows]);
    window._attendanceRows = all; // snapshot for the PDF export

    // Summary — count by merged-day type (a day counts once), hours summed across field visits
    const counts = {};
    all.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    // Hours stat: work days counted as ~8h, shown alongside the loose hours.
    const totalWorkdays = all.reduce((s, r) => s + (r.workdays || 0), 0);
    const totalLooseHours = all.reduce((s, r) => s + (r.hourHours || 0), 0);
    const approxTotal = Math.round((totalLooseHours + totalWorkdays * WORKDAY_HOURS) * 100) / 100;
    let hoursChip = '';
    if (totalWorkdays || totalLooseHours) {
      const segs = [];
      if (totalWorkdays) segs.push(totalWorkdays + ' ימי עבודה');
      if (totalLooseHours) segs.push(totalLooseHours + "ש'");
      hoursChip = `<span class="att-chip" style="background:#f0f9ff;color:#1e40af;">⏱️ ${segs.join(' + ')} (≈${approxTotal}ש' סה"כ)</span>`;
    }
    const summaryEl = document.getElementById('attendanceSummary');
    if (summaryEl) {
      summaryEl.innerHTML = Object.keys(ATT_LABELS)
        .filter(k => counts[k])
        .map(k => {
          const [bg,color] = ATT_COLORS[k];
          return `<span class="att-chip" style="background:${bg};color:${color};">${ATT_LABELS[k]}: ${counts[k]}</span>`;
        }).join('') +
        hoursChip +
        (totalWorkdays ? `<span class="att-chip" style="background:#eef2ff;color:#3730a3;font-size:10px;">יום עבודה ≈ ${WORKDAY_HOURS}ש'</span>` : '') +
        `<span class="att-chip" style="background:#f3f4f6;color:#374151;">סה"כ ימים: ${all.length}</span>` +
        // Reserve-duty form 3010 — rendered to the left of "סה"כ ימים" (RTL: appended last)
        `<a href="https://www.miluim.idf.il/personalzone/milforms/form-3010" target="_blank" rel="noopener"
            class="att-chip" style="background:#1b2a4a;color:white;text-decoration:none;font-weight:700;">🪖 הפקת 3010</a>`;
    }

    // Table
    const tableEl = document.getElementById('attendanceTable');
    if (!tableEl) return;
    if (!all.length) {
      tableEl.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">אין נתונים לחודש זה</div>';
      return;
    }
    const rows = all.map((r, i) => {
      const [bg,color] = ATT_COLORS[r.type] || ['#f3f4f6','#374151'];
      const dateStr = r.date.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', weekday:'short' });
      const kib = r.kibbutz ? `<span style="color:#475569;">${r.kibbutz}</span>` : '—';
      // hours column: work days shown as "יום עבודה" (priced as a day), loose hours as Xש'
      let dur;
      if (r.type === 'field') {
        const segs = [];
        if (r.workdays) segs.push(r.workdays === 1 ? 'יום עבודה' : r.workdays + ' ימי עבודה');
        if (r.hourHours > 0) segs.push(r.hourHours + "ש'");
        dur = segs.join(' + ') || '—';
      } else {
        dur = r.duration > 0 ? r.duration + "ש'" : '—';
      }
      // expandable when a field day has visit summaries, or an "אחר" day has a note
      const fieldDetail = (r.visits || []).filter(v => v.summary);
      const hasDetail = (r.type === 'field' && fieldDetail.length) || (r.type === 'other' && r.note);
      const expandCell = hasDetail
        ? `<button onclick="toggleAttDetail(${i})" id="attToggle-${i}" style="background:#eef2ff;color:#3730a3;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;font-weight:700;">+</button>`
        : '';
      const mainRow = `<tr>
        <td>${dateStr}</td>
        <td><span class="att-badge" style="background:${bg};color:${color};">${ATT_LABELS[r.type]}</span></td>
        <td>${kib}</td>
        <td style="text-align:center;">${dur}</td>
        <td style="text-align:center;">${expandCell}</td>
      </tr>`;
      let detailHtml = '';
      if (r.type === 'field' && fieldDetail.length) {
        detailHtml = (r.visits || []).map(v =>
          `<div style="margin-bottom:6px;"><strong>🏘 ${(v.kibbutz||'—')}${v.workday ? ' (יום עבודה)' : (v.duration ? ' ('+v.duration+'ש\')' : '')}:</strong> ${(v.summary||'').replace(/</g,'&lt;') || '<span style="color:#94a3b8;">ללא סיכום</span>'}</div>`
        ).join('');
      } else if (r.type === 'other' && r.note) {
        detailHtml = `<strong>➕ פירוט:</strong> ${r.note.replace(/</g,'&lt;')}`;
      }
      const detailRow = hasDetail
        ? `<tr id="attDetail-${i}" style="display:none;"><td colspan="5" style="background:#f8fafc;text-align:right;padding:10px 14px;color:#334155;font-size:13px;line-height:1.6;border-right:3px solid #6366f1;">${detailHtml}</td></tr>`
        : '';
      return mainRow + detailRow;
    }).join('');
    tableEl.innerHTML = `<table class="att-table">
      <thead><tr><th>תאריך</th><th>סוג יום</th><th>קיבוץ</th><th>שעות</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Merge attendance/field entries by calendar date → one row per day.
  // A day with field visits becomes a field row (kibbutzim joined, hours summed, per-visit
  // detail kept); otherwise it's the non-field attendance type (with its "אחר" note).
  function mergeAttendanceByDate(entries) {
    const byDay = {};
    entries.forEach(e => {
      const k = e.date.getFullYear() + '-' + e.date.getMonth() + '-' + e.date.getDate();
      if (!byDay[k]) byDay[k] = { date: e.date, fields: [], others: [] };
      if (e.type === 'field') byDay[k].fields.push(e); else byDay[k].others.push(e);
    });
    return Object.values(byDay).map(d => {
      if (d.fields.length) {
        const kibbutzim = [...new Set(d.fields.map(f => f.kibbutz).filter(Boolean))];
        const workdays = d.fields.filter(f => f.workday).length;
        const hourHours = d.fields.filter(f => !f.workday).reduce((s, f) => s + (f.duration || 0), 0);
        return {
          date: d.date, type: 'field',
          kibbutz: kibbutzim.join(', '),
          workdays: workdays,
          hourHours: hourHours,
          duration: hourHours + workdays * WORKDAY_HOURS,   // ≈ total hours (work day ≈ 8h)
          visits: d.fields.map(f => ({ kibbutz: f.kibbutz, summary: f.summary, duration: f.duration, workday: f.workday })),
          note: ''
        };
      }
      const o = d.others[0];
      return { date: d.date, type: o.type, kibbutz: '', duration: 0, visits: [], note: o.note || '' };
    }).sort((a, b) => a.date - b.date);
  }

  // Expand/collapse a field-day's visit summary under its row
  function toggleAttDetail(i) {
    const row = document.getElementById('attDetail-' + i);
    const btn = document.getElementById('attToggle-' + i);
    if (!row) return;
    const open = row.style.display !== 'none';
    row.style.display = open ? 'none' : '';
    if (btn) btn.textContent = open ? '+' : '−';
  }

  // Export the current month's attendance to a printable PDF (browser "Save as PDF")
  function downloadAttendancePDF() {
    const rows = window._attendanceRows || [];
    if (!rows.length) { alert('אין נתונים להורדה בחודש זה'); return; }
    const monthLabel = document.getElementById('attendanceMonthLabel')?.textContent || '';
    const body = rows.map(r => {
      const dateStr = r.date.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', weekday:'short' });
      let dur;
      if (r.type === 'field') {
        const segs = [];
        if (r.workdays) segs.push(r.workdays === 1 ? 'יום עבודה' : r.workdays + ' ימי עבודה');
        if (r.hourHours > 0) segs.push(r.hourHours + " ש'");
        dur = segs.join(' + ') || '—';
      } else { dur = r.duration > 0 ? r.duration + " ש'" : '—'; }
      // Field day: per-visit detail (kibbutz + hours + summary). "אחר" day: the note.
      let detail = '';
      if (r.type === 'field' && (r.visits || []).length) {
        detail = r.visits.map(v => `<div><strong>${(v.kibbutz||'—')}${v.duration ? ' ('+v.duration+"ש')" : ''}:</strong> ${(v.summary||'').replace(/</g,'&lt;')}</div>`).join('');
      } else if (r.type === 'other' && r.note) {
        detail = r.note.replace(/</g,'&lt;');
      }
      return `<tr><td>${dateStr}</td><td>${ATT_LABELS[r.type]}</td><td>${r.kibbutz || '—'}</td><td style="text-align:center;">${dur}</td><td>${detail}</td></tr>`;
    }).join('');
    const counts = {};
    rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    const totalWorkdays = rows.reduce((s, r) => s + (r.workdays || 0), 0);
    const totalLooseHours = rows.reduce((s, r) => s + (r.hourHours || 0), 0);
    const approxTotal = Math.round((totalLooseHours + totalWorkdays * WORKDAY_HOURS) * 100) / 100;
    const hoursSegs = [];
    if (totalWorkdays) hoursSegs.push(`${totalWorkdays} ימי עבודה`);
    if (totalLooseHours) hoursSegs.push(`${totalLooseHours}ש'`);
    const chips = Object.keys(ATT_LABELS).filter(k => counts[k])
      .map(k => `${ATT_LABELS[k]}: ${counts[k]}`).join(' · ') +
      (hoursSegs.length ? ` · ⏱️ ${hoursSegs.join(' + ')} (≈${approxTotal}ש')` : '');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
      <title>נוכחות ${attPerson()} — ${monthLabel}</title>
      <style>
        body{font-family:Arial,'Heebo',sans-serif;padding:24px;color:#1b2a4a;}
        h1{font-size:20px;margin:0 0 4px;} .sub{color:#64748b;font-size:13px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:13px;} th,td{border:1px solid #e2e8f0;padding:7px 9px;text-align:right;}
        th{background:#1b2a4a;color:white;} tr:nth-child(even) td{background:#f8fafc;}
      </style></head><body>
      <h1>📅 דוח נוכחות — ${attPerson()}</h1>
      <div class="sub">${monthLabel} · ${chips}</div>
      <table><thead><tr><th>תאריך</th><th>סוג יום</th><th>קיבוץ</th><th>שעות</th><th>סיכום ביקור</th></tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    w.document.close();
  }

