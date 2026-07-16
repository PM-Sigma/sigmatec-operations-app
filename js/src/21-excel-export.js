  // ========== 📗 EXCEL EXPORTS (aggregate reports) ==========
  // Spec: docs/superpowers/specs/2026-07-16-viewer-excel-exports-design.md
  // Pure builders (data → {sheet, columns, rows}) + one SheetJS writer + thin DOM adapters.
  // Builders are DOM/Supabase-free so test-exports.mjs can run them in Node.
  // Gate: 📗 buttons are visible to עידן + viewer only (writes are unaffected — exports read).

  function canExportExcel() {
    return (typeof isIdan === 'function' && isIdan()) || (typeof isViewer === 'function' && isViewer());
  }

  // ---- cell sanitizers — the builders' contract: no newlines, no RTL marks, typed cells ----
  function xlStr(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/[‎‏‪-‮]/g, '')   // strip bidi control marks
      .replace(/\s*[\r\n]+\s*/g, '; ')               // flatten newlines — no multi-line cells
      .trim();
  }
  function xlNum(v) {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    return isFinite(n) ? n : '';
  }
  // Local date from 'YYYY-MM-DD…' / Date — built from Y/M/D parts (no timezone slide)
  function xlDate(v) {
    if (!v) return '';
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  const XL_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  function xlDayLetter(d) { return d instanceof Date ? XL_DAY_LETTERS[d.getDay()] : ''; }

  // ---- builders ----
  // 1. דוח ביקורי שטח — one row per supplied item (visit fields repeated; no-product visit = one row)
  function xlBuildVisits(visits) {
    const columns = [
      { header: 'תאריך', type: 'd', width: 12 }, { header: 'יום', type: 's', width: 6 },
      { header: 'קיבוץ', type: 's', width: 16 }, { header: 'מבקר', type: 's', width: 10 },
      { header: 'משך (שעות)', type: 'n', width: 12 }, { header: 'איש קשר', type: 's', width: 14 },
      { header: 'סיכום', type: 's', width: 40 }, { header: 'פריט שסופק', type: 's', width: 26 },
      { header: 'כמות', type: 'n', width: 8 }
    ];
    const rows = [];
    (visits || []).forEach(v => {
      const d = xlDate(v.date);
      const base = [d, xlDayLetter(d), xlStr(v.kibbutz), xlStr(v.visitor), xlNum(v.duration),
                    xlStr(v.contact), xlStr(v.summary)];
      const products = (v.products || []).map(p => typeof p === 'string' ? { name: p, qty: 1 } : p).filter(p => p && p.name);
      if (products.length === 0) {
        rows.push(base.concat([xlStr(v.productsOther), v.productsOther ? xlNum(1) : '']));
      } else {
        products.forEach(p => rows.push(base.concat([xlStr(p.name), xlNum(p.qty || 1)])));
      }
    });
    return { sheet: 'ביקורי שטח', columns: columns, rows: rows };
  }

  // 2. דוח נוכחות חודשי — one row per merged day (input: window._attendanceRows shape)
  function xlBuildAttendance(rows, person, labels) {
    const columns = [
      { header: 'תאריך', type: 'd', width: 12 }, { header: 'יום', type: 's', width: 6 },
      { header: 'עובד', type: 's', width: 10 }, { header: 'סוג יום', type: 's', width: 12 },
      { header: 'קיבוץ', type: 's', width: 18 }, { header: 'ימי עבודה', type: 'n', width: 10 },
      { header: 'שעות', type: 'n', width: 8 }, { header: 'פירוט', type: 's', width: 44 }
    ];
    const out = (rows || []).map(r => {
      const d = xlDate(r.date);
      let detail = '';
      if (r.type === 'field' && (r.visits || []).length) {
        detail = r.visits.map(v => (v.kibbutz || '—') + ': ' + (v.summary || '')).join(' | ');
      } else if (r.note) { detail = r.note; }
      return [d, xlDayLetter(d), xlStr(person), xlStr((labels || {})[r.type] || r.type), xlStr(r.kibbutz),
              xlNum(r.workdays || 0), xlNum(r.type === 'field' ? (r.hourHours || 0) : (r.duration || 0)),
              xlStr(detail)];
    });
    return { sheet: 'נוכחות — ' + xlStr(person), columns: columns, rows: out };
  }

  // 3. דוח תעודות משלוח (טווח) — one row per item per cert; cancelled kept, marked מבוטלת
  const XL_CERT_SRC = { visit: 'ביקור', order: 'הזמנה', ems: 'משימת EMS', manual: 'ידני' };
  function xlBuildCerts(certs) {
    const columns = [
      { header: "מס' תעודה", type: 'n', width: 10 }, { header: 'תאריך', type: 'd', width: 12 },
      { header: 'קיבוץ', type: 's', width: 16 }, { header: 'פריט', type: 's', width: 28 },
      { header: 'כמות', type: 'n', width: 8 }, { header: 'הופק ע"י', type: 's', width: 10 },
      { header: 'מקור', type: 's', width: 12 }, { header: 'סטטוס', type: 's', width: 10 }
    ];
    const rows = [];
    (certs || []).forEach(c => {
      const status = c.status === 'cancelled' ? 'מבוטלת' : 'הופקה';
      const base = [xlNum(c.cert_number), xlDate(c.cert_date),
                    xlStr(((c.customer || {}).name) || c.kibbutz), null, null,
                    xlStr(c.created_by), xlStr(XL_CERT_SRC[c.source] || c.source), status];
      const items = (c.items || []).filter(i => i && i.name);
      if (items.length === 0) {
        const r = base.slice(); r[3] = ''; r[4] = ''; rows.push(r);
      } else {
        items.forEach(i => { const r = base.slice(); r[3] = xlStr(i.name); r[4] = xlNum(i.qty || 1); rows.push(r); });
      }
    });
    return { sheet: 'תעודות משלוח', columns: columns, rows: rows };
  }

  // 4. סיכום חודשי תעודות — aggregate per kibbutz+item; cancelled EXCLUDED (matches the print report)
  function xlBuildCertSummary(certs) {
    const columns = [
      { header: 'קיבוץ', type: 's', width: 16 }, { header: 'פריט', type: 's', width: 28 },
      { header: 'סה"כ כמות', type: 'n', width: 10 }, { header: "מס' תעודות", type: 'n', width: 12 }
    ];
    const agg = {};   // kibbutz|item → {qty, certNos:Set}
    (certs || []).filter(c => c.status !== 'cancelled').forEach(c => {
      const kib = xlStr(((c.customer || {}).name) || c.kibbutz);
      (c.items || []).filter(i => i && i.name).forEach(i => {
        const k = kib + '|' + i.name;
        if (!agg[k]) agg[k] = { kibbutz: kib, item: xlStr(i.name), qty: 0, certs: {} };
        agg[k].qty += Number(i.qty) || 1;
        agg[k].certs[c.cert_number] = 1;
      });
    });
    const rows = Object.values(agg)
      .sort((a, b) => a.kibbutz.localeCompare(b.kibbutz, 'he') || a.item.localeCompare(b.item, 'he'))
      .map(a => [a.kibbutz, a.item, xlNum(a.qty), xlNum(Object.keys(a.certs).length)]);
    return { sheet: 'סיכום תעודות', columns: columns, rows: rows };
  }

  // 5. מלאי לפי מיקום — product rows × location columns (zero-across-all products dropped)
  function xlBuildStockByLocation(stock, locations, catMap) {
    const columns = [{ header: 'קטגוריה', type: 's', width: 12 }, { header: 'פריט', type: 's', width: 28 }]
      .concat((locations || []).map(l => ({ header: xlStr(l), type: 'n', width: 9 })))
      .concat([{ header: 'סה"כ', type: 'n', width: 9 }]);
    const products = {};
    (locations || []).forEach(loc => Object.keys((stock || {})[loc] || {}).forEach(p => { products[p] = 1; }));
    const rows = Object.keys(products)
      .filter(p => (locations || []).some(loc => ((stock[loc] || {})[p] || 0) !== 0))
      .sort((a, b) => {
        const ca = (catMap || {})[a] || 'אחר', cb = (catMap || {})[b] || 'אחר';
        return ca.localeCompare(cb, 'he') || a.localeCompare(b, 'he');
      })
      .map(p => {
        let total = 0;
        const cells = (locations || []).map(loc => { const q = (stock[loc] || {})[p] || 0; total += q; return xlNum(q); });
        return [xlStr((catMap || {})[p] || 'אחר'), xlStr(p)].concat(cells, [xlNum(total)]);
      });
    return { sheet: 'מלאי לפי מיקום', columns: columns, rows: rows };
  }

  // 6. מלאי לפי קיבוץ — kibbutz rows × product columns
  function xlBuildStockByKibbutz(stock, kibbutzim) {
    const products = {};
    (kibbutzim || []).forEach(k => Object.keys((stock || {})[k] || {}).forEach(p => { products[p] = 1; }));
    const productList = Object.keys(products)
      .filter(p => (kibbutzim || []).some(k => ((stock[k] || {})[p] || 0) !== 0))
      .sort((a, b) => a.localeCompare(b, 'he'));
    const columns = [{ header: 'קיבוץ', type: 's', width: 16 }]
      .concat(productList.map(p => ({ header: xlStr(p), type: 'n', width: 12 })))
      .concat([{ header: 'סה"כ', type: 'n', width: 9 }]);
    const rows = (kibbutzim || []).slice().sort((a, b) => a.localeCompare(b, 'he')).map(k => {
      let total = 0;
      const cells = productList.map(p => { const q = (stock[k] || {})[p] || 0; total += q; return xlNum(q); });
      return [xlStr(k)].concat(cells, [xlNum(total)]);
    });
    return { sheet: 'מלאי לפי קיבוץ', columns: columns, rows: rows };
  }

  // ---- writer — lazy-loads the vendored SheetJS on first use, then spec → .xlsx download ----
  let _xlLibPromise = null;
  function xlLib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlLibPromise) return _xlLibPromise;
    _xlLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/xlsx.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { _xlLibPromise = null; reject(new Error('טעינת ספריית האקסל נכשלה')); };
      document.head.appendChild(s);
    });
    return _xlLibPromise;
  }
  function xlSpecToWorkbook(XLSX, spec) {
    const aoa = [spec.columns.map(c => c.header)].concat(spec.rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    // date format on 'd' columns
    spec.columns.forEach((col, ci) => {
      if (col.type !== 'd') return;
      for (let r = 1; r <= spec.rows.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r: r, c: ci })];
        if (cell && cell.t === 'd') cell.z = 'dd/mm/yyyy';
      }
    });
    ws['!cols'] = spec.columns.map(c => ({ wch: c.width || 12 }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: spec.rows.length, c: spec.columns.length - 1 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, spec.sheet.slice(0, 31));
    wb.Workbook = { Views: [{ RTL: true }] };
    return wb;
  }
  function xlDownload(spec, filename) {
    if (!spec.rows.length) { alert('אין נתונים לייצוא בטווח שנבחר'); return Promise.resolve(false); }
    return xlLib().then(XLSX => {
      XLSX.writeFile(xlSpecToWorkbook(XLSX, spec), filename, { cellDates: true });
      return true;
    }).catch(e => { alert('שגיאה בייצוא: ' + e.message); return false; });
  }

  // ---- DOM adapters (thin — collect data, call builder, download) ----
  function xlVisitsInRange(visitor, fromDate, toDate) {
    const all = (typeof loadAllVisitsCombined === 'function' ? loadAllVisitsCombined() : []);
    const seen = {};
    const from = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : 0;
    const to = toDate ? new Date(toDate + 'T23:59:59').getTime() : Date.now();
    return all.filter(v => {
      const key = v.id || (v.kibbutz + '|' + v.date + '|' + v.visitor);
      if (seen[key]) return false; seen[key] = 1;
      const d = new Date(v.date).getTime();
      return d >= from && d <= to && (!visitor || v.visitor === visitor);
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  function xlExportVisits(visitor, from, to) {
    return xlDownload(xlBuildVisits(xlVisitsInRange(visitor, from, to)),
      'דוח_ביקורי_שטח_' + (from || '') + '_' + (to || '') + '.xlsx');
  }
  function xlExportVisitsFromModal() {
    xlExportVisits(document.getElementById('visitsReportVisitor').value,
      document.getElementById('visitsReportFrom').value,
      document.getElementById('visitsReportTo').value);
  }
  function xlExportAttendanceCurrent() {   // uses the rendered month (attendance page or hub-driven render)
    const rows = window._attendanceRows || [];
    const lbl = (document.getElementById('attendanceMonthLabel') || {}).textContent || '';
    xlDownload(xlBuildAttendance(rows, attPerson(), typeof ATT_LABELS !== 'undefined' ? ATT_LABELS : {}),
      ('דוח_נוכחות_' + attPerson() + '_' + lbl).replace(/\s+/g, '_') + '.xlsx');
  }
  async function xlFetchCerts(from, to) {
    if (typeof window._sbCertGet !== 'function') { alert('ייצוא תעודות זמין רק במצב Supabase'); return null; }
    try {
      return await window._sbCertGet('delivery_certs?select=*&cert_date=gte.' + (from || '2000-01-01') +
        '&cert_date=lte.' + (to || '2099-12-31') + '&order=cert_number.asc');
    } catch (e) { alert('שגיאה בטעינת תעודות: ' + e.message); return null; }
  }
  async function xlExportCerts(from, to) {
    const certs = await xlFetchCerts(from, to);
    if (certs) xlDownload(xlBuildCerts(certs), 'דוח_תעודות_משלוח_' + (from || '') + '_' + (to || '') + '.xlsx');
  }
  function xlExportCertsFromTab() {
    xlExportCerts(document.getElementById('invCertsFrom').value, document.getElementById('invCertsTo').value);
  }
  async function xlExportCertSummary(from, to) {
    const certs = await xlFetchCerts(from, to);
    if (certs) xlDownload(xlBuildCertSummary(certs), 'סיכום_תעודות_' + (from || '') + '_' + (to || '') + '.xlsx');
  }
  function xlExportCertSummaryFromTab() {
    xlExportCertSummary(document.getElementById('invCertsFrom').value, document.getElementById('invCertsTo').value);
  }
  function xlExportStockXlsx() {
    xlDownload(xlBuildStockByLocation(computeStock(), INV_LOCATIONS, productCategoryMap()), 'מלאי_לפי_מיקום.xlsx');
  }
  function xlExportKibbutzXlsx() {
    const stock = computeStock();
    const kibbutzim = Object.keys(stock).filter(loc => !NON_KIBBUTZ_LOCATIONS.includes(loc) && loc);
    xlDownload(xlBuildStockByKibbutz(stock, kibbutzim), 'מלאי_לפי_קיבוץ.xlsx');
  }

  // ---- 📊 viewer reports hub (home page, viewer-only) ----
  function xlMonthRange(ym) {   // 'YYYY-MM' → [from, to]
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) { const d = new Date(); ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); return xlMonthRange(ym); }
    const y = +m[1], mo = +m[2];
    const last = new Date(y, mo, 0).getDate();
    return [ym + '-01', ym + '-' + String(last).padStart(2, '0')];
  }
  function xlHubInit() {
    const hub = document.getElementById('viewerReportsHub');
    if (!hub || typeof isViewer !== 'function' || !isViewer()) return;
    const d = new Date();
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const first = ym + '-01';
    const today = first.slice(0, 8) + String(d.getDate()).padStart(2, '0');
    [['xlHubVisitsFrom', first], ['xlHubVisitsTo', today], ['xlHubCertsFrom', first], ['xlHubCertsTo', today]]
      .forEach(([id, val]) => { const el = document.getElementById(id); if (el && !el.value) el.value = val; });
    [['xlHubAttMonth', ym], ['xlHubSumMonth', ym]].forEach(([id, val]) => {
      const el = document.getElementById(id); if (el && !el.value) el.value = val;
    });
    const sel = document.getElementById('xlHubAttPerson');
    if (sel && !sel.options.length) {
      const people = Array.from(new Set((typeof ATT_PEOPLE !== 'undefined' ? ATT_PEOPLE : [])
        .concat(((window.SHEET_DATA && window.SHEET_DATA.attendance) || []).map(a => a.person).filter(Boolean))))
        .sort((a, b) => a.localeCompare(b, 'he'));
      sel.innerHTML = people.map(p => '<option value="' + p + '">' + p + '</option>').join('');
    }
  }
  window.xlHubInit = xlHubInit;
  function xlHubAttApply() {   // set person+month, render the (hidden) attendance report → rows ready
    const person = document.getElementById('xlHubAttPerson').value;
    const ym = (document.getElementById('xlHubAttMonth').value || '').match(/^(\d{4})-(\d{2})$/);
    if (person) window._attPerson = person;
    if (ym) { window.attendanceViewYear = +ym[1]; window.attendanceViewMonth = +ym[2] - 1; }
    renderAttendanceReport();
  }
  function xlHubAttPdf() { xlHubAttApply(); downloadAttendancePDF(); }
  function xlHubAttXlsx() { xlHubAttApply(); xlExportAttendanceCurrent(); }
  function xlHubVisitsPdf() {
    openVisitsReportHTMLView('', document.getElementById('xlHubVisitsFrom').value, document.getElementById('xlHubVisitsTo').value);
  }
  function xlHubVisitsXlsx() {
    xlExportVisits('', document.getElementById('xlHubVisitsFrom').value, document.getElementById('xlHubVisitsTo').value);
  }
  function xlHubCertsPdf() {
    certRangeReportRange(document.getElementById('xlHubCertsFrom').value, document.getElementById('xlHubCertsTo').value);
  }
  function xlHubCertsXlsx() {
    xlExportCerts(document.getElementById('xlHubCertsFrom').value, document.getElementById('xlHubCertsTo').value);
  }
  function xlHubSumPdf() { const r = xlMonthRange(document.getElementById('xlHubSumMonth').value); certRangeReportRange(r[0], r[1]); }
  function xlHubSumXlsx() { const r = xlMonthRange(document.getElementById('xlHubSumMonth').value); xlExportCertSummary(r[0], r[1]); }

  // expose adapters used from HTML onclick
  window.canExportExcel = canExportExcel;
  window.xlExportVisitsFromModal = xlExportVisitsFromModal;
  window.xlExportAttendanceCurrent = xlExportAttendanceCurrent;
  window.xlExportCertsFromTab = xlExportCertsFromTab;
  window.xlExportCertSummaryFromTab = xlExportCertSummaryFromTab;
  window.xlExportStockXlsx = xlExportStockXlsx;
  window.xlExportKibbutzXlsx = xlExportKibbutzXlsx;
  window.xlHubVisitsPdf = xlHubVisitsPdf; window.xlHubVisitsXlsx = xlHubVisitsXlsx;
  window.xlHubAttPdf = xlHubAttPdf; window.xlHubAttXlsx = xlHubAttXlsx;
  window.xlHubCertsPdf = xlHubCertsPdf; window.xlHubCertsXlsx = xlHubCertsXlsx;
  window.xlHubSumPdf = xlHubSumPdf; window.xlHubSumXlsx = xlHubSumXlsx;
