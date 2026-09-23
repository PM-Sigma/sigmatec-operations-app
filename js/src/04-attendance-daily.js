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

  // ONE marker for "worked on a day the company was closed" — the summary line used to say
  // 🕯️ while the row right above it, the month grid and the Excel all said 🕎, i.e. two glyphs
  // for one concept inside a single document (audit B · F-09). Mirrored in
  // app/src/lib/attendance.ts as HOLIDAY_MARK; test-exports.mjs asserts nothing else is used.
  var ATT_HOLIDAY_MARK = '🕎';
  window.ATT_HOLIDAY_MARK = ATT_HOLIDAY_MARK;

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
    // company_holidays is `to authenticated` only since db/rls_2_00_lockdown.sql (22.9): a
    // read that goes out before the EMS→Supabase pass has minted comes back 200 with an EMPTY
    // array (RLS silently drops the rows for a role the policy does not name — it is not a
    // 401, so the usual "session lapsed" funnel never fires and nothing throws). Memoizing
    // THAT forever is why holidays/eves/חול המועד "disappeared": once cached empty, no later
    // call ever tried again for the rest of the session. So: wait for the pass first when one
    // is mintable, and — belt and braces — never lock in an empty result; only a real list (or
    // a session that was never going to authenticate, e.g. ?sb=0/no EMS token) gets memoized.
    window.attHolidaysLoaded = Promise.resolve()
      .then(function () {
        return (typeof window.sbEnsurePass === 'function') ? window.sbEnsurePass() : true;
      })
      .catch(function () { return false; })
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
        // An empty list while a pass is still pending (or never came) is "try again next
        // time", not "there are no holidays" — drop the memo so the next attLoadHolidays()
        // call (e.g. the calendar opening after נוכחות already warmed the pass) re-fetches.
        if (!list.length && window._sbPassPending) window.attHolidaysLoaded = null;
        try { if (window.sigmaEmit) window.sigmaEmit('holidays-loaded', { count: list.length }); } catch (e) {}
        return list;
      })
      .catch(function () {
        window.SHEET_DATA = window.SHEET_DATA || {};
        window.SHEET_DATA.holidays = window.SHEET_DATA.holidays || [];
        window.attHolidaysLoaded = null;
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
    return (h && !h.required) ? ATT_HOLIDAY_MARK : '';
  }
  window.attHolidayMark = attHolidayMark;
  // attYmd itself is declared further down (the robust version that also accepts an ISO string
  // and returns '' for a bad date) — one declaration for the whole module; hoisting makes it
  // available to every caller above it.

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
    if (titleEl) titleEl.textContent = '📅 נוכחות חודשית: ' + who;
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
      .map(a => ({ id: a.id, date: new Date(a.date), type: a.dayType, kibbutz: '', duration: 0, note: a.note || '' }))   // id kept → the row can be edited (openAttEdit)
      .filter(a => a.date.getFullYear() === year && a.date.getMonth() === month);

    // Field days from VISITS (carry the summary so it can be expanded under the row)
    const fieldRows = ((window.SHEET_DATA && window.SHEET_DATA.visits) || [])
      .filter(v => v.visitor === who)
      // contact/products carried so the monthly PDF can stand in for the retired visits report
      .map(v => ({ date: new Date(v.date), type: 'field', kibbutz: v.kibbutz || '', duration: parseFloat(v.duration) || 0, summary: v.summary || '', id: v.id || '', workday: !!v.workday, contact: v.contact || '', products: v.products || [], productsOther: v.productsOther || '' }))
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
      const holMark = (hol && !hol.required) ? ` <span title="${attEsc(hol.name)}" style="font-size:12px;">${ATT_HOLIDAY_MARK}</span>` : '';
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
      const canEd = canEditAttendanceOf(who);
      // A field day is made of VISITS — each editable one carries a visitId.
      const editableVisits = (r.visits || []).filter(v => v.visitId);
      // expandable when a field day has visit summaries or needs a visit PICKER (2 kibbutzim in one
      // day → the ✏️ can't know which visit you meant), or an "אחר" day has a note
      const fieldDetail = (r.visits || []).filter(v => v.summary);
      const hasDetail = (r.type === 'field' && (fieldDetail.length || (canEd && editableVisits.length > 1)))
        || (r.type === 'other' && r.note);
      const expandCell = hasDetail
        ? `<button onclick="toggleAttDetail(${i})" id="attToggle-${i}" style="background:#eef2ff;color:#3730a3;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;font-weight:700;">+</button>`
        : '';
      // ✏️ goes INSIDE the existing last cell, not a new column, so the detail row's colspan=5 stays
      // correct. Two kinds of row, two editors:
      //   • attendance row (r.id)  → the attendance editor (date / day type / "אחר" note)
      //   • field day (visits)     → the VISIT editor; one visit opens straight, several expand to pick
      let editCell = '';
      if (canEd && r.id) {
        editCell = `<button onclick="openAttEdit('${attJsStr(r.id)}')" title="עריכת הדיווח" style="background:#fef3c7;color:#92400e;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;margin-right:4px;">✏️</button>`;
      } else if (canEd && editableVisits.length) {
        const single = editableVisits.length === 1;
        const act = single ? `openVisitFromAttendance('${attJsStr(editableVisits[0].visitId)}')` : `toggleAttDetail(${i})`;
        const tip = single ? 'עריכת דוח הביקור (תאריך, סיכום, מוצרים)' : 'יש כמה ביקורים ביום הזה. פתח ובחר איזה לערוך';
        editCell = `<button onclick="${act}" title="${tip}" style="background:#fef3c7;color:#92400e;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;margin-right:4px;">✏️</button>`;
      }
      const mainRow = `<tr>
        <td>${dateStr}${holMark}</td>
        <td><span class="att-badge" style="background:${bg};color:${color};">${ATT_LABELS[r.type]}</span></td>
        <td>${kib}</td>
        <td style="text-align:center;">${dur}</td>
        <td style="text-align:center;white-space:nowrap;">${expandCell}${editCell}</td>
      </tr>`;
      let detailHtml = '';
      if (r.type === 'field' && hasDetail) {
        detailHtml = (r.visits || []).map(v => {
          // per-visit ✏️ — this is how a day with 2 kibbutzim picks WHICH visit to edit
          const vEdit = (canEd && v.visitId)
            ? ` <button onclick="openVisitFromAttendance('${attJsStr(v.visitId)}')" title="עריכת דוח הביקור הזה" style="background:#fef3c7;color:#92400e;border:none;border-radius:5px;padding:1px 6px;cursor:pointer;font-size:11px;font-family:inherit;">✏️ ערוך</button>`
            : '';
          return `<div style="margin-bottom:6px;"><strong>🏘 ${(v.kibbutz||'—')}${v.workday ? ' (יום עבודה)' : (v.duration ? ' ('+v.duration+'ש\')' : '')}:</strong> ${(v.summary||'').replace(/</g,'&lt;') || '<span style="color:#94a3b8;">ללא סיכום</span>'}${vEdit}</div>`;
        }).join('');
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
          // visitId carried so a field day can be opened for editing from נוכחות (openVisitFromAttendance).
          // NOTE: the row itself still gets NO `id` — that field means "an attendance-table row" and drives
          // the attendance editor. A field day is a VISIT and takes the visit editor instead.
          visits: d.fields.map(f => ({ kibbutz: f.kibbutz, summary: f.summary, duration: f.duration, workday: f.workday, visitId: f.id || '',
                                       contact: f.contact || '', products: f.products || [], productsOther: f.productsOther || '' })),
          note: ''
        };
      }
      // id carried so the row gets an ✏️ (field rows above deliberately have none — they're VISITS,
      // edited through the visit form). Only others[0] is shown/editable, as before.
      const o = d.others[0];
      return { date: d.date, type: o.type, kibbutz: '', duration: 0, visits: [], note: o.note || '', id: o.id };
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

  // ===== Edit an existing attendance report (עריכת דיווח נוכחות) =====
  // No backend work needed: the write router (01-data.js) upserts `attendance` on `id`, so POSTing the
  // usual attendance body WITH an id PATCHes that row instead of inserting a new one. Before this, a
  // mis-dated day could not be fixed at all — re-entering it just left the wrong row alongside the right
  // one (mergeAttendanceByDate groups by date). Spec: docs/superpowers/specs/2026-08-02-attendance-edit-design.md
  // 'field' is deliberately absent: a field day is a VISIT, not an attendance row (edit it in the visit form).
  const ATT_EDIT_TYPES = ['office', 'wfh', 'reserve', 'vacation', 'off', 'other'];

  // Each person edits their OWN entries; עידן/עמיחי may fix anyone's. Viewer never (also hard-blocked
  // at the write choke point in 01-data.js — this just hides the button).
  function canEditAttendanceOf(person) {
    if (typeof isViewer === 'function' && isViewer()) return false;
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    if (!me || !person) return false;
    return me === person || (typeof isIdan === 'function' && isIdan()) || me === 'עמיחי';
  }

  // escape an id for embedding inside a single-quoted inline onclick
  function attJsStr(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  // ---- Open a field day's VISIT report for editing, straight from the נוכחות page ----
  // נוכחות is the hub: a field row is derived from a visit, so fixing the visit (usually its date)
  // is what corrects the attendance report. editVisit() reads window.currentKibbutzVisits, which is
  // only populated for the OPEN kibbutz card — so we resolve the visit globally, open its kibbutz
  // card (that fills currentKibbutzVisits via renderLastVisit), then hand over to the normal editor.
  function openVisitFromAttendance(visitId) {
    const all = (typeof loadAllVisitsCombined === 'function') ? loadAllVisitsCombined() : ((window.SHEET_DATA || {}).visits || []);
    const v = all.find(x => String(x.id) === String(visitId));
    if (!v) { alert('דוח הביקור לא נמצא. רענן את הדף ונסה שוב'); return; }
    if (!canEditAttendanceOf(v.visitor)) { alert('אין לך הרשאה לערוך את הביקור של ' + (v.visitor || '—')); return; }
    const card = document.querySelector('.kibbutz[data-name="' + String(v.kibbutz || '').replace(/"/g, '\\"') + '"]');
    if (!card) { alert('הקיבוץ "' + (v.kibbutz || '—') + '" לא נמצא בכרטיסים, לא ניתן לפתוח את הביקור מכאן'); return; }
    if (typeof openEditModal !== 'function' || typeof editVisit !== 'function') { alert('טופס הביקור לא זמין'); return; }
    openEditModal(card);                 // fills currentKibbutzVisits + clears the (now default-less) date
    if (typeof switchTab === 'function') switchTab('visit');
    editVisit(String(visitId));           // prefills the form with THIS visit, incl. its real date
  }

  // yyyy-mm-dd from LOCAL date parts — toISOString() would shift the day across a timezone offset.
  function attYmd(d) {
    const x = new Date(d); if (isNaN(x.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }
  window.attYmd = attYmd;

  window._attEdit = null;   // { id, person, type } while the modal is open

  function openAttEdit(id) {
    const e = ((window.SHEET_DATA && window.SHEET_DATA.attendance) || []).find(a => String(a.id) === String(id));
    if (!e) { alert('הדיווח לא נמצא. רענן את הדף ונסה שוב'); return; }
    if (!canEditAttendanceOf(e.person)) { alert('אין לך הרשאה לערוך את הדיווח של ' + e.person); return; }
    window._attEdit = { id: String(e.id), person: e.person, type: '' };
    document.getElementById('attEditDate').value = attYmd(e.date);
    document.getElementById('attEditNote').value = e.note || '';
    const whoEl = document.getElementById('attEditWho');
    if (whoEl) whoEl.textContent = '👤 ' + e.person;
    attEditSetType(ATT_EDIT_TYPES.indexOf(e.dayType) !== -1 ? e.dayType : 'other');
    document.getElementById('attEditModal').classList.add('open');
  }

  function attEditSetType(type) {
    if (!window._attEdit) return;
    window._attEdit.type = type;
    document.querySelectorAll('#attEditTypes .day-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const w = document.getElementById('attEditOtherWrap');
    if (w) w.style.display = (type === 'other') ? '' : 'none';
  }

  // §7p: ביטול on a form with edits asks first (js/src/00-guard.js). `force` is what the
  // successful save passes — there is nothing left to lose once the row is written.
  function closeAttEdit(force) {
    if (!force && typeof modalDismiss === 'function' && !modalDismiss('attEditModal')) return;
    window._attEdit = null;
    if (force) modalForceClose('attEditModal');
  }

  function attToast(msg, ms) {
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), ms || 2500);
  }

  function saveAttEdit(btn) {
    const st = window._attEdit; if (!st) return;
    const dateVal = document.getElementById('attEditDate').value;
    if (!dateVal) { alert('נא לבחור תאריך'); return; }
    const dayType = st.type;
    if (ATT_EDIT_TYPES.indexOf(dayType) === -1) { alert('נא לבחור סוג יום'); return; }
    const note = (dayType === 'other') ? (document.getElementById('attEditNote').value || '').trim() : '';
    if (dayType === 'other' && !note) { alert('נא לפרט מה היה ביום (אחר)'); return; }
    setBtnLoading(btn, true, 'שומר…');
    const isoDate = new Date(dateVal + 'T12:00:00').toISOString();   // noon anchor: a TZ offset can't roll the day back
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // id → UPDATE (upsert-by-id). person is the ORIGINAL owner: an edit must never reassign whose day
      // this is, and the upsert writes the full row, so omitting it would blank the column.
      body: JSON.stringify({ type: 'attendance', id: st.id, person: st.person, dayType, note, date: isoDate })
    }).then(r => r.json()).then(res => {
      if (res && res.ok) {
        const row = ((window.SHEET_DATA && window.SHEET_DATA.attendance) || []).find(a => String(a.id) === st.id);
        if (row) { row.date = isoDate; row.dayType = dayType; row.note = note; }   // patch in place, don't push a duplicate
        attToast('✅ הדיווח עודכן: ' + ATT_LABELS[dayType]);
        closeAttEdit(true);
        renderAttendanceReport();
      } else {
        attToast('⚠️ ' + ((res && res.error) || 'העדכון נכשל'), 3000);
      }
    }).catch(() => attToast('⚠️ שגיאה בעדכון', 3000))
      .finally(() => setBtnLoading(btn, false));
  }

  /**
   * The one escaper for everything this file interpolates into HTML — the on-screen report
   * (innerHTML) and the printable PDF (document.write into a new window) alike.
   *
   * It escapes `"` and `'` as well as `& < >`, because two of the call sites put the value
   * inside an ATTRIBUTE (`title="…"`), where `<` is harmless and a quote is what breaks out.
   * Both values come from data a person typed — a holiday name from `company_holidays`, a
   * kibbutz name from the `kibbutzim` table — so "it is our own data" is not a defence: it is
   * OUR PEOPLE'S data, and one apostrophe in a name was enough to mangle the report. Task 18.
   */
  function attEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Export the current month's attendance to a printable PDF (browser "Save as PDF")
  function downloadAttendancePDF() {
    const rows = window._attendanceRows || [];
    if (!rows.length) { alert('אין נתונים להורדה בחודש זה'); return; }
    const monthLabel = document.getElementById('attendanceMonthLabel')?.textContent || '';
    const body = rows.map(r => {
      const dateStr = r.date.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', weekday:'short' });
      const hol = attHolidayOn(attYmd(r.date));
      const holMark = (hol && !hol.required) ? ' ' + ATT_HOLIDAY_MARK : '';
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
        // Full visit detail — this is what makes the נוכחות PDF a replacement for the old
        // standalone דוח ביקורים: kibbutz, hours, contact, products and the summary.
        detail = r.visits.map(v => {
          const esc = attEsc;
          const hrs = v.workday ? 'יום עבודה' : (v.duration ? v.duration + "ש'" : '');
          const prods = (v.products || []).map(p => (typeof p === 'string' ? p : (p.qty > 1 ? p.name + ' ×' + p.qty : p.name))).join(', ');
          const extra = [prods, v.productsOther].filter(Boolean).join(' · ');
          let s = `<div style="margin-bottom:4px;"><strong>${esc(v.kibbutz) || '—'}${hrs ? ' (' + hrs + ')' : ''}:</strong> ${esc(v.summary)}`;
          if (v.contact) s += `<div style="color:#475569;font-size:12px;">🤝 ${esc(v.contact)}</div>`;
          if (extra)     s += `<div style="color:#475569;font-size:12px;">📦 ${esc(extra)}</div>`;
          return s + '</div>';
        }).join('');
      } else if (r.note) {
        // ANY day's note, not only `other` — an office/home/מילואים note used to be dropped
        // from the PDF while the Excel printed it, so the two documents for the same month
        // disagreed (audit B · F-10). Same condition as js/src/21-excel-export.js.
        detail = attEsc(r.note);
      }
      return `<tr><td>${dateStr}${holMark}</td><td>${ATT_LABELS[r.type]}</td><td>${attEsc(r.kibbutz) || '—'}</td><td style="text-align:center;">${dur}</td><td>${detail}</td></tr>`;
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
    // Visit totals — carried over from the retired דוח ביקורים so the numbers it gave still exist.
    const allVisits = rows.reduce((a, r) => a.concat(r.visits || []), []);
    const visitKibs = [...new Set(allVisits.map(v => v.kibbutz).filter(Boolean))];
    const chips = Object.keys(ATT_LABELS).filter(k => counts[k])
      .map(k => `${ATT_LABELS[k]}: ${counts[k]}`).join(' · ') +
      (hoursSegs.length ? ` · ⏱️ ${hoursSegs.join(' + ')} (≈${approxTotal}ש')` : '') +
      (allVisits.length ? ` · 📍 ${allVisits.length} ביקורים ב-${visitKibs.length} קיבוצים` : '') +
      (holidayWorked ? ` · ${ATT_HOLIDAY_MARK} ${holidayWorked} ימי עבודה בחג` : '');
    // No dangling separators when the page has no month label: the <title> IS the default
    // PDF filename, and "נוכחות אביאם — " is what the user then has to rename (audit B · F-11).
    const docTitle = [['נוכחות', attPerson()].filter(Boolean).join(' '), monthLabel]
      .filter(Boolean).join(' — ');
    const subLine = [monthLabel, chips].filter(Boolean).join(' · ');
    const w = window.open('', '_blank');
    // A blocked popup used to throw a TypeError and the user saw nothing at all
    // (audit B · F-24) — the same guard js/src/20-delivery-cert.js already has.
    if (!w) { alert('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים לאתר.'); return; }
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=swap" rel="stylesheet">
      <title>${attEsc(docTitle)}</title>
      <style>
        body{font-family:'Assistant','Segoe UI',Arial,sans-serif;padding:24px;color:#1b2a4a;}
        h1{font-size:20px;margin:0 0 4px;} .sub{color:#64748b;font-size:13px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:13px;} th,td{border:1px solid #e2e8f0;padding:7px 9px;text-align:right;}
        th{background:#1b2a4a;color:white;} tr:nth-child(even) td{background:#f8fafc;}
      </style></head><body>
      <h1>📅 דוח נוכחות: ${attPerson()}</h1>
      <div class="sub">${subLine}</div>
      <table><thead><tr><th>תאריך</th><th>סוג יום</th><th>קיבוץ</th><th>שעות</th><th>סיכום ביקור</th></tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    w.document.close();
  }

