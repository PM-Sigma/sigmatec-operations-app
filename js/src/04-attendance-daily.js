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

  // ───────────────────────── 🕎 holidays (spec §7e) ─────────────────────────
  // ONE list per session, shared by everything that has to know whether a day was a work
  // day: this report, the red missing rows (22-push.js), the React island and the calendar.
  // It lives on SHEET_DATA like every other shared table, and a failure to load it is not an
  // error — the screen falls back to "weekdays are work days", which is what it did before.
  window.attHolidaysLoaded = window.attHolidaysLoaded || null;
  function attHolidays() { return ((window.SHEET_DATA || {}).holidays) || []; }
  window.attHolidays = attHolidays;

  function attLoadHolidays() {
    if (window.attHolidaysLoaded) return window.attHolidaysLoaded;
    window.attHolidaysLoaded = Promise.resolve()
      .then(function () {
        if (typeof window._sbGet !== 'function') return [];
        return window._sbGet('company_holidays?select=date,name,kind,required&order=date');
      })
      .then(function (rows) {
        var list = (rows || []).map(function (h) {
          return { date: String(h.date || '').slice(0, 10), name: h.name || '', kind: h.kind || 'holiday', required: !!h.required };
        }).filter(function (h) { return h.date; });
        window.SHEET_DATA = window.SHEET_DATA || {};
        window.SHEET_DATA.holidays = list;
        try { if (window.sigmaEmit) window.sigmaEmit('holidays-loaded', { count: list.length }); } catch (e) {}
        return list;
      })
      .catch(function () {
        window.SHEET_DATA = window.SHEET_DATA || {};
        window.SHEET_DATA.holidays = window.SHEET_DATA.holidays || [];
        return [];
      });
    return window.attHolidaysLoaded;
  }
  window.attLoadHolidays = attLoadHolidays;

  // ───────────────────────── the save path, without the DOM ─────────────────────────
  // saveAttendance() below reads the legacy form; THIS is the same write with the values
  // handed in. The React island (app/src/islands/Attendance.tsx) goes through the bridge to
  // here — `sigma.attSave` — rather than posting on its own, so the endpoint, the optimistic
  // SHEET_DATA update and the report refresh stay in ONE place and the monthly reports keep
  // seeing exactly the rows they always saw.
  function attSaveRow(entry) {
    var e = entry || {};
    var dateVal = String(e.date || '').slice(0, 10);
    var dayType = e.dayType || 'office';
    var note = String(e.note || '').trim();
    var person = e.person || (typeof attPerson === 'function' ? attPerson() : '');
    if (!dateVal) return Promise.reject(new Error('חסר תאריך'));
    if (!person) return Promise.reject(new Error('חסר עובד'));
    if (dayType === 'other' && !note) return Promise.reject(new Error('נא לפרט מה היה ביום (אחר)'));
    var isoDate = new Date(dateVal + 'T12:00:00').toISOString();
    return fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'attendance', person: person, dayType: dayType, note: note, date: isoDate })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'שמירה נכשלה');
      var row = { id: res.id, person: person, dayType: dayType, note: note, date: isoDate };
      if (window.SHEET_DATA) {
        window.SHEET_DATA.attendance = window.SHEET_DATA.attendance || [];
        window.SHEET_DATA.attendance.push(row);
      }
      try { if (window.sigmaEmit) window.sigmaEmit('attendance-saved', row); } catch (e2) {}
      return row;
    });
  }
  window.attSaveRow = attSaveRow;

  // The month a person actually has, merged one-row-per-day — the same merge the table and
  // the exports use, handed to the island as plain ISO rows. `month` is 0-based here (the
  // legacy convention); the island converts once, at the bridge.
  function attRowsFor(person, year, month) {
    var who = person || (typeof attPerson === 'function' ? attPerson() : '');
    var data = window.SHEET_DATA || {};
    var inMonth = function (d) { return d.getFullYear() === year && d.getMonth() === month; };
    var attRows = (data.attendance || [])
      .filter(function (a) { return a.person === who; })
      .map(function (a) { return { date: new Date(a.date), type: a.dayType, kibbutz: '', duration: 0, note: a.note || '' }; })
      .filter(function (a) { return !isNaN(a.date) && inMonth(a.date); });
    var fieldRows = (data.visits || [])
      .filter(function (v) { return v.visitor === who; })
      .map(function (v) {
        return { date: new Date(v.date), type: 'field', kibbutz: v.kibbutz || '', duration: parseFloat(v.duration) || 0,
                 summary: v.summary || '', id: v.id || '', workday: !!v.workday };
      })
      .filter(function (v) { return !isNaN(v.date) && inMonth(v.date); });
    return mergeAttendanceByDate(attRows.concat(fieldRows)).map(function (r) {
      var d = r.date;
      return {
        date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
        type: r.type,
        kibbutz: r.kibbutz || '',
        hours: r.duration || 0,
        note: r.note || '',
        source: r.type === 'field' ? 'visit' : 'manual',
        visits: r.visits || []
      };
    });
  }
  window.attRowsFor = attRowsFor;

  // The holiday row for a date, or null — used for the 🕎 marker on a day someone worked
  // anyway, and for the violet חג label on an empty one.
  function attHolidayOn(dateKey) {
    var list = attHolidays();
    for (var i = 0; i < list.length; i++) if (list[i].date === dateKey) return list[i];
    return null;
  }
  window.attHolidayOn = attHolidayOn;
  // 🕎 only for a day that was NOT required and was filled in anyway (spec §7e).
  function attHolidayMark(dateKey) {
    var h = attHolidayOn(dateKey);
    return (h && !h.required) ? '🕎' : '';
  }
  window.attHolidayMark = attHolidayMark;
  function attYmd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  window.attYmd = attYmd;

  function saveAttendance(btn) {
    const dateVal = document.getElementById('aviamSimpleDate').value;
    if (!dateVal) { alert('נא לבחור תאריך'); return; }
    const dayType = window.aviamDayType || 'office';
    const note = (dayType === 'other') ? (document.getElementById('aviamOtherText').value || '').trim() : '';
    if (dayType === 'other' && !note) { alert('נא לפרט מה היה ביום (אחר)'); return; }
    const person = (document.getElementById('visitor') && document.getElementById('visitor').value) || attPerson();
    setBtnLoading(btn, true);
    attSaveRow({ person: person, date: dateVal, dayType: dayType, note: note }).then(() => {
      const t = document.getElementById('toast');
      t.textContent = '✅ ' + ATT_LABELS[dayType] + (note ? ' (' + note + ')' : '') + ' נשמר';
      t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
      closeModal();
      if (document.getElementById('attendance-view').style.display !== 'none') renderAttendanceReport();
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
    // First paint of the session happens before the holiday list has landed. Rather than
    // block the report on a network call, draw it now and redraw once — the only visible
    // difference is that a חג stops being a red "missing" row.
    if (!window.attHolidaysLoaded) {
      attLoadHolidays().then(function () {
        if (document.getElementById('attendance-view') &&
            document.getElementById('attendance-view').style.display !== 'none') renderAttendanceReport();
      });
    }
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
      if (isIdan() || (typeof isViewer === 'function' && isViewer())) { toggle.style.display = 'flex';
        const people = Array.from(new Set(ATT_PEOPLE.concat(((window.SHEET_DATA && window.SHEET_DATA.attendance) || []).map(a => a.person).filter(Boolean)))).sort((a, b) => a.localeCompare(b, 'he'));
        toggle.innerHTML = people.map(p => '<button class="day-type-btn ' + (p === who ? 'active' : '') + '" onclick="setAttPerson(\'' + p + '\')">' + p + '</button>').join('');
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

    // Table — real rows + missing-weekday RED rows (🔔 per row, accumulating; see 22-push.js)
    const tableEl = document.getElementById('attendanceTable');
    if (!tableEl) return;
    const missingDays = (typeof attMissingDays === 'function')
      ? attMissingDays(((window.SHEET_DATA || {}).attendance) || [], ((window.SHEET_DATA || {}).visits) || [],
          who, year, month, new Date(), attHolidays())
      : [];
    if (!all.length && !missingDays.length) {
      tableEl.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">אין נתונים לחודש זה</div>';
      return;
    }
    const display = all.map((r, i) => ({ r: r, i: i, date: r.date }))
      .concat(missingDays.map(k => ({ missingKey: k, date: new Date(k + 'T00:00:00') })))
      .sort((x, y) => x.date - y.date);
    const rows = display.map(entry => {
      if (entry.missingKey) return (typeof attMissingRowHtml === 'function') ? attMissingRowHtml(entry.missingKey) : '';
      const r = entry.r, i = entry.i;
      const [bg,color] = ATT_COLORS[r.type] || ['#f3f4f6','#374151'];
      const dateStr = r.date.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', weekday:'short' });
      // 🕎 — this day was a חג / חול המועד / סגירת חברה and he worked it anyway. It counts
      // as a work day; the marker is so whoever reads the report knows why it is there.
      const hol = attHolidayOn(attYmd(r.date));
      const holMark = (hol && !hol.required) ? ` <span title="${hol.name}" style="font-size:12px;">🕎</span>` : '';
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
        <td>${dateStr}${holMark}</td>
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
      const hol = attHolidayOn(attYmd(r.date));
      const holMark = (hol && !hol.required) ? ' 🕎' : '';
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
      return `<tr><td>${dateStr}${holMark}</td><td>${ATT_LABELS[r.type]}</td><td>${r.kibbutz || '—'}</td><td style="text-align:center;">${dur}</td><td>${detail}</td></tr>`;
    }).join('');
    const counts = {};
    rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    const totalWorkdays = rows.reduce((s, r) => s + (r.workdays || 0), 0);
    const totalLooseHours = rows.reduce((s, r) => s + (r.hourHours || 0), 0);
    const approxTotal = Math.round((totalLooseHours + totalWorkdays * WORKDAY_HOURS) * 100) / 100;
    const hoursSegs = [];
    if (totalWorkdays) hoursSegs.push(`${totalWorkdays} ימי עבודה`);
    if (totalLooseHours) hoursSegs.push(`${totalLooseHours}ש'`);
    const holidayWorked = rows.filter(r => { const h = attHolidayOn(attYmd(r.date)); return h && !h.required; }).length;
    const chips = Object.keys(ATT_LABELS).filter(k => counts[k])
      .map(k => `${ATT_LABELS[k]}: ${counts[k]}`).join(' · ') +
      (hoursSegs.length ? ` · ⏱️ ${hoursSegs.join(' + ')} (≈${approxTotal}ש')` : '') +
      (holidayWorked ? ` · 🕎 ${holidayWorked} ימי עבודה בחג` : '');
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

