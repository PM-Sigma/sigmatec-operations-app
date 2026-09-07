  // ===========================================================
  // 🔥 צריבות (METER BURNS) — field tracker: which Landis E360 generation meters were burned, per kibbutz,
  // linked solar systems per meter, grouping under generators. Data: Supabase `meter_burns` + `generators`
  // (anon read; writes with the bridge token, like dev_status_log). The app NEVER writes to the EMS here.
  // Spec: superpowers/specs/2026-09-06-meter-burn-tracker-design.md · Tests: test-meter-burns.mjs (runs the PURE block).
  // ===========================================================
  var B = {};
  // PURE-START
  B.isCT = function (r) { return r.meter_type === 'E360CT'; };
  B.rowState = function (r) {
    if (r.status === 'issue') return 'issue';
    if (r.status === 'burned') return B.isCT(r) ? 'burned-ct' : 'burned';
    return 'pending';
  };
  B.normalize = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); };
  B.matches = function (r, q, gens) {
    var nq = B.normalize(q); if (!nq) return true;
    var gen = (gens || []).filter(function (g) { return g.id === r.generator_id; })[0];
    var hay = B.normalize([r.site, r.serial, r.address, r.solar_names, gen && gen.name].join(' '));
    return hay.indexOf(nq) !== -1;
  };
  B.filterRows = function (rows, f, gens) {
    f = f || {};
    return rows.filter(function (r) {
      if (f.site && r.site !== f.site) return false;
      if (f.status && f.status !== 'all' && r.status !== f.status) return false;
      if (f.kind === 'CT' && !B.isCT(r)) return false;
      if (f.kind === 'PP' && B.isCT(r)) return false;
      return B.matches(r, f.q, gens);
    });
  };
  var STATE_ORDER = { pending: 0, issue: 1, burned: 2 };
  B.sortRows = function (rows) {
    return rows.slice().sort(function (a, b) {
      var d = (STATE_ORDER[a.status] || 0) - (STATE_ORDER[b.status] || 0); if (d) return d;
      d = (B.isCT(a) ? 0 : 1) - (B.isCT(b) ? 0 : 1); if (d) return d;
      return String(a.serial).localeCompare(String(b.serial));
    });
  };
  B.totals = function (rows) {
    var t = { total: rows.length, pending: 0, burned: 0, issue: 0 };
    rows.forEach(function (r) { if (t[r.status] != null) t[r.status]++; });
    return t;
  };
  B.groupBySite = function (rows) {
    var by = {};
    rows.forEach(function (r) {
      var g = by[r.site] || (by[r.site] = { site: r.site, rows: [], total: 0, pending: 0, burned: 0, issue: 0, ct: 0, pp: 0 });
      g.rows.push(r); g.total++; if (g[r.status] != null) g[r.status]++; if (B.isCT(r)) g.ct++; else g.pp++;
    });
    return Object.keys(by).map(function (k) { by[k].rows = B.sortRows(by[k].rows); return by[k]; })
      .sort(function (a, b) { return (b.pending - a.pending) || a.site.localeCompare(b.site, 'he'); });
  };
  B.groupByGenerator = function (rows, gens) {
    var byId = {}; (gens || []).forEach(function (g) { byId[g.id] = g; });
    var groups = {}, order = [];
    B.sortRows(rows).forEach(function (r) {
      var key = (r.generator_id && byId[r.generator_id]) ? r.generator_id : '';
      if (!groups[key]) { groups[key] = { gen: key ? byId[key] : null, rows: [] }; order.push(key); }
      groups[key].rows.push(r);
    });
    return order.sort(function (a, b) { return (a === '' ? 1 : 0) - (b === '' ? 1 : 0) || (byId[a].name).localeCompare(byId[b].name, 'he'); })
      .map(function (k) { return groups[k]; });
  };
  B.burnPatch   = function (user, now) { return { status: 'burned', burned_by: user, burned_at: now, updated_at: now }; };
  B.unburnPatch = function (now)       { return { status: 'pending', burned_by: null, burned_at: null, updated_at: now }; };
  B.issuePatch  = function (note, now) { return { status: 'issue', note: note, updated_at: now }; };
  B.assignPatch = function (genId, now){ return { generator_id: genId || null, updated_at: now }; };
  B.clearIssuePatch = function (now) { return { status: 'pending', note: null, updated_at: now }; };
  B.xs = function (v) { return String(v == null ? '' : v).replace(/[‎‏‪-‮]/g, '').replace(/\r?\n/g, ' ').trim(); };
  var XL_STATE = { pending: 'ממתין', burned: 'נצרב', 'burned-ct': 'נצרב · מוכן לעיסוק', issue: 'בעיה' };
  B.xlsxSpec = function (rows, gens) {
    var byId = {}; (gens || []).forEach(function (g) { byId[g.id] = g; });
    var columns = [
      { header: 'קיבוץ', type: 's', width: 16 }, { header: 'גנרטור', type: 's', width: 14 }, { header: 'סוג', type: 's', width: 9 },
      { header: "מס' מונה", type: 's', width: 12 }, { header: 'כתובת', type: 's', width: 26 }, { header: 'מערכות מקושרות', type: 's', width: 26 },
      { header: 'יחס CT', type: 'n', width: 8 }, { header: 'מונה אב', type: 's', width: 12 }, { header: 'סטטוס', type: 's', width: 18 },
      { header: 'נצרב ע"י', type: 's', width: 10 }, { header: 'תאריך צריבה', type: 'd', width: 12 }, { header: 'הערה', type: 's', width: 24 }
    ];
    var out = [], keys = [];
    B.groupBySite(rows).forEach(function (g, gi) {
      g.rows.forEach(function (r) {
        var gen = byId[r.generator_id];
        out.push([B.xs(r.site), B.xs(gen ? gen.name : ''), B.xs(r.meter_type), B.xs(r.serial), B.xs(r.address), B.xs(r.solar_names),
                  r.ct_ratio != null ? Number(r.ct_ratio) : null, B.xs(r.parent_serial), XL_STATE[B.rowState(r)],
                  B.xs(r.burned_by), r.burned_at ? (function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })(new Date(r.burned_at)) : null, B.xs(r.note)]);
        keys.push(gi);
      });
    });
    return { sheet: 'צריבות', columns: columns, rows: out, groupKeys: keys };
  };
  B.genSummary = function (gens, rows) {
    var cnt = {}; (rows || []).forEach(function (r) { if (r.generator_id) cnt[r.generator_id] = (cnt[r.generator_id] || 0) + 1; });
    return (gens || []).map(function (g) { return { id: g.id, site: g.site, name: g.name, device_serial: g.device_serial || '', count: cnt[g.id] || 0 }; })
      .sort(function (a, b) { return a.site.localeCompare(b.site, 'he') || a.name.localeCompare(b.name, 'he'); });
  };
  // ---- EMS live refresh (spec §7): raw EMS /meters + /solars payloads → the EMS-owned columns of meter_burns ----
  B.emsMeterType = function (m) {   // meter_types.key looks like 'landis_e360pp' (name 'Landis E360PP') → 'E360PP' | null
    var k = String((m && m.type && (m.type.key || m.type.name)) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var x = /E360(PP|SP|CT)/.exec(k); return x ? 'E360' + x[1] : null;
  };
  B.emsSolarNames = function (solars) {   // meter id → 'שם · שם' (deduped, he-sorted), from solar.solarMeters[].meter.id
    var by = {};
    (solars || []).forEach(function (s) { (s && s.solarMeters || []).forEach(function (sm) {
      var id = sm && sm.meter && sm.meter.id; if (!id || !s.name) return; (by[id] = by[id] || []).push(String(s.name).trim()); }); });
    Object.keys(by).forEach(function (k) {
      by[k] = by[k].filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort(function (a, b) { return a.localeCompare(b, 'he'); }).join(' · ');
    });
    return by;
  };
  B.emsToBurnRows = function (meters, solars) {
    var names = B.emsSolarNames(solars), rows = [], skipped = 0;
    (meters || []).forEach(function (m) {
      var t = B.emsMeterType(m);
      if (!t || !m.id || !m.serialNumber || !(m.site && m.site.name)) { skipped++; return; }   // not an E360 / unusable row
      rows.push({
        meter_id: m.id, serial: String(m.serialNumber), site: String(m.site.name).trim(), site_id: m.site.id || null, meter_type: t,
        address: m.address || null, role_code: (m.role && m.role.code != null) ? Number(m.role.code) : null,
        ct_ratio: m.currentMultiplier != null ? Number(m.currentMultiplier) : null,
        parent_serial: (m.parent && m.parent.serialNumber) ? String(m.parent.serialNumber) : null, solar_names: names[m.id] || null
      });
    });
    return { rows: rows, skipped: skipped };
  };
  // PURE-END
  window._burnLogic = B;

  // ---------- data ----------
  var burnState = { rows: null, gens: [], f: { q: '', status: 'all', kind: 'all', site: '' }, open: {}, sel: {}, loading: false, err: null, syncing: false };
  try { var _sf = JSON.parse(localStorage.getItem('burn_filter_v1') || 'null'); if (_sf) burnState.f = Object.assign(burnState.f, _sf); } catch (e) {}
  // ponytail: rollout gate — עידן only (2026-09-07). Widen when approved: see = everyone but מתניה; write = אביאם/ניתאי/עידן/עמיחי (non-viewer).
  function burnCanSee()  { return typeof getCurrentUser === 'function' && getCurrentUser() === 'עידן'; }
  function burnCanWrite(){ return burnCanSee() && !(typeof isViewer === 'function' && isViewer()); }
  function burnEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function burnAttr(s) { return burnEsc(s).replace(/'/g, "\\'"); }
  function burnHdr(write) {
    var tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : null;
    if (write && !tok) throw new Error('אין חיבור מאומת — התחבר ל-EMS מחדש ואז נסה שוב');
    return { apikey: SB_ANON, Authorization: 'Bearer ' + (tok || SB_ANON), 'Content-Type': 'application/json' };
  }
  async function burnLoad() {
    burnState.loading = true; burnState.err = null;
    try {
      var [r1, r2] = await Promise.all([
        fetch(SB_URL + '/rest/v1/meter_burns?select=*&order=site,serial', { headers: burnHdr(false) }),
        fetch(SB_URL + '/rest/v1/generators?select=*&order=site,name', { headers: burnHdr(false) })
      ]);
      if (!r1.ok) throw new Error('meter_burns ' + r1.status);
      if (!r2.ok) throw new Error('generators ' + r2.status);
      burnState.rows = await r1.json(); burnState.gens = await r2.json();
    } catch (e) { burnState.err = e.message; }
    burnState.sel = {};
    burnState.loading = false;
  }
  async function burnPatchRow(id, patch) {
    var r = await fetch(SB_URL + '/rest/v1/meter_burns?meter_id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: Object.assign(burnHdr(true), { Prefer: 'return=minimal' }), body: JSON.stringify(patch)
    });
    if (!r.ok) throw new Error('שמירה נכשלה (' + r.status + ')');
    var row = burnState.rows.find(function (x) { return x.meter_id === id; });
    if (row) Object.assign(row, patch);
  }
  async function burnCreateGenerator(site, name) {
    var r = await fetch(SB_URL + '/rest/v1/generators?on_conflict=site,name', {
      method: 'POST', headers: Object.assign(burnHdr(true), { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({ site: site, name: name, created_by: getCurrentUser() })
    });
    if (!r.ok) throw new Error('יצירת גנרטור נכשלה (' + r.status + ')');
    var g = (await r.json())[0];
    if (!burnState.gens.some(function (x) { return x.id === g.id; })) burnState.gens.push(g);
    return g;
  }

  // ---------- EMS live refresh (spec §7) ----------
  // The seed is only the bootstrap: opening the tab (per device, ≥12h apart) and the ⟳ EMS button pull the current generation
  // meters straight from the EMS through the existing emsApi proxy and upsert the EMS-owned columns by meter_id. Tracking columns
  // (status/burned_*/generator_id/note) are never in the payload, so they survive; new meters arrive as 'pending'. Read-only on the EMS.
  // ponytail: meters that vanish from the EMS (role changed / archived) stay listed — add a seen_at column + filter if that bites.
  var BURN_SYNC_KEY = 'burn_ems_synced_v1', BURN_SYNC_MS = 12 * 60 * 60 * 1000;
  function burnSyncedAt() { try { return parseInt(localStorage.getItem(BURN_SYNC_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  async function burnEmsAll(path) {   // walk EMS pagination (take ≤ 200); tolerant to [..] / {data,meta.total} / {items,total}
    var out = [], page = 1, total = Infinity;
    while (out.length < total && page <= 25) {
      var res = await emsApi(path + (path.indexOf('?') === -1 ? '?' : '&') + 'take=200&page=' + page);
      var items = Array.isArray(res) ? res : ((res && (res.data || res.items)) || []);
      var t = (res && !Array.isArray(res)) ? ((res.meta && res.meta.total != null) ? res.meta.total : res.total) : null;
      out = out.concat(items);
      if (!items.length) break;
      if (t != null) total = Number(t); else if (items.length < 200) break;
      page++;
    }
    return out;
  }
  async function burnRefreshFromEms(manual) {
    if (!burnCanWrite() || burnState.syncing) return;
    if (!(typeof isEmsConnected === 'function' && isEmsConnected())) { if (manual) emsToast('⚠️ אין חיבור ל-EMS — התחבר ואז נסה שוב'); return; }
    burnState.syncing = true; burnRepaint();
    try {
      var both = await Promise.all([burnEmsAll('/meters?roleCodes=20,21,22,23,24'), burnEmsAll('/solars')]);
      var out = B.emsToBurnRows(both[0], both[1]);
      if (!out.rows.length) throw new Error('ה-EMS החזיר 0 מוני ייצור E360 — לא עודכן דבר');
      var known = {}; (burnState.rows || []).forEach(function (r) { known[r.meter_id] = 1; });
      var fresh = out.rows.filter(function (r) { return !known[r.meter_id]; }).length;
      var r = await fetch(SB_URL + '/rest/v1/meter_burns?on_conflict=meter_id', {
        method: 'POST', headers: Object.assign(burnHdr(true), { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(out.rows)
      });
      if (!r.ok) throw new Error('עדכון מה-EMS נכשל (' + r.status + ')');
      try { localStorage.setItem(BURN_SYNC_KEY, String(Date.now())); } catch (e) {}
      await burnLoad();
      emsToast('✅ עודכן מה-EMS: ' + out.rows.length + ' מונים' + (fresh ? ' · ' + fresh + ' חדשים' : '') + (out.skipped ? ' · ' + out.skipped + ' לא-E360 הושמטו' : ''));
    } catch (e) { emsToast('⚠️ ' + e.message); }
    burnState.syncing = false; burnRender();
  }

  // ---------- render ----------
  var BURN_STATE_UI = {
    pending:     { icon: '⬜', label: 'ממתין',        cls: 'burn-pending' },
    burned:      { icon: '✅', label: 'נצרב',         cls: 'burn-burned' },
    'burned-ct': { icon: '🟣', label: 'מוכן לעיסוק',  cls: 'burn-burned-ct' },
    issue:       { icon: '⚠️', label: 'בעיה',         cls: 'burn-issue' }
  };
  function burnKindTag(r) {
    return B.isCT(r) ? '<span class="burn-tag burn-tag-ct">🧲 CT' + (r.ct_ratio && Number(r.ct_ratio) !== 1 ? ' ×' + Number(r.ct_ratio) : '') + '</span>'
                     : '<span class="burn-tag burn-tag-pp">🔌 ' + burnEsc(String(r.meter_type || '').replace('E360', '')) + '</span>';
  }
  function burnWarn(r) {
    var w = [];
    if (!r.parent_serial) w.push('⚠️ אין מונה אב');
    if (B.isCT(r) && (!r.ct_ratio || Number(r.ct_ratio) === 1)) w.push('🔴 יחס CT חסר ב-EMS');
    return w.length ? '<div class="burn-warn">' + w.join(' · ') + '</div>' : '';
  }
  function burnRowHtml(r, write) {
    var st = BURN_STATE_UI[B.rowState(r)];
    var sel = burnState.sel[r.meter_id] ? ' checked' : '';
    var chk = write ? '<input type="checkbox" class="burn-chk" aria-label="בחר"' + sel + ' onclick="event.stopPropagation();burnSelect(\'' + burnAttr(r.meter_id) + '\', this.checked)">' : '';
    var btn = write ? '<button class="inv-btn small burn-btn ' + (r.status === 'burned' ? 'burn-btn-on' : '') + '" onclick="event.stopPropagation();burnToggle(\'' + burnAttr(r.meter_id) + '\')">' + (r.status === 'burned' ? '↩ בטל' : '✅ נצרב') + '</button>' +
                      '<button class="inv-btn small burn-btn-issue" title="דווח בעיה" onclick="event.stopPropagation();burnIssue(\'' + burnAttr(r.meter_id) + '\')">⚠</button>' : '';
    return '<div class="burn-row ' + st.cls + '" onclick="burnOpen(\'' + burnAttr(r.meter_id) + '\')">' +
      chk + burnKindTag(r) +
      '<div class="burn-main"><div class="burn-serial"><bdi>' + burnEsc(r.serial) + '</bdi> <span class="burn-addr">' + burnEsc(r.address || '') + '</span></div>' +
      '<div class="burn-sub">' + (r.solar_names ? '☀️ ' + burnEsc(r.solar_names) : '<span class="burn-muted">ללא מערכת מקושרת</span>') +
      (r.note ? ' · 📝 ' + burnEsc(r.note) : '') + '</div>' + burnWarn(r) + '</div>' +
      '<span class="burn-state">' + st.icon + ' ' + st.label + '</span>' +
      '<div class="burn-actions">' + btn + '</div></div>';
  }
  function burnSiteHtml(g, write) {
    var open = burnState.open[g.site] || !!burnState.f.q || !!burnState.f.site;
    var pct = g.total ? Math.round(100 * (g.burned) / g.total) : 0;
    var groups = B.groupByGenerator(g.rows, burnState.gens);
    var body = groups.map(function (gg) {
      var head = gg.gen ? '⚡ ' + burnEsc(gg.gen.name) + (gg.gen.device_serial ? ' <span class="burn-muted">(' + burnEsc(gg.gen.device_serial) + ')</span>' : '')
                        : '<span class="burn-muted">לא משובץ לגנרטור</span>';
      return (groups.length > 1 || gg.gen ? '<div class="burn-gen">' + head + ' · ' + gg.rows.length + '</div>' : '') + gg.rows.map(function (r) { return burnRowHtml(r, write); }).join('');
    }).join('');
    return '<section class="burn-site' + (open ? ' open' : '') + '">' +
      '<header class="burn-site-head" onclick="burnToggleSite(\'' + burnAttr(g.site) + '\')">' +
        '<span class="burn-caret">' + (open ? '▼' : '▶') + '</span><h3>' + burnEsc(g.site) + '</h3>' +
        '<span class="burn-left' + (g.pending ? '' : ' done') + '">נותרו ' + g.pending + '/' + g.total + '</span>' +
        '<span class="burn-mini">CT ' + g.ct + ' · PP ' + g.pp + (g.issue ? ' · ⚠️ ' + g.issue : '') + '</span>' +
        '<div class="burn-bar"><i style="width:' + pct + '%"></i></div>' +
      '</header>' + (open ? '<div class="burn-site-body">' + body + '</div>' : '') + '</section>';
  }
  function burnRenderTiles() {
    var el = document.getElementById('burnTiles'); if (!el) return;
    var t = B.totals(burnState.rows || []);
    el.innerHTML =
        '<div class="push-tile" style="--c:#334155"><div class="push-tile-n">' + t.total + '</div><div class="push-tile-l">סה״כ</div></div>' +
        '<div class="push-tile" style="--c:#b45309"><div class="push-tile-n">' + t.pending + '</div><div class="push-tile-l">נותרו</div></div>' +
        '<div class="push-tile" style="--c:#059669"><div class="push-tile-n">' + t.burned + '</div><div class="push-tile-l">נצרבו</div></div>' +
        '<div class="push-tile" style="--c:#b91c1c"><div class="push-tile-n">' + t.issue + '</div><div class="push-tile-l">בעיות</div></div>';
  }
  function burnRenderResults() {
    var el = document.getElementById('burnResults'); if (!el) return;
    var write = burnCanWrite(), f = burnState.f;
    var rows = B.filterRows(burnState.rows || [], f, burnState.gens);
    var t = B.totals(burnState.rows || []), groups = B.groupBySite(rows);
    var nSel = Object.keys(burnState.sel).filter(function (k) { return burnState.sel[k]; }).length;
    el.innerHTML =
      (write && nSel ? '<div class="burn-selbar">' + nSel + ' נבחרו · <button class="inv-btn small" onclick="burnBurnSelected()">✅ סמן כנצרבו</button> <button class="inv-btn small" onclick="burnAssignSelected()">⚡ שבץ לגנרטור</button> <button class="inv-btn small" style="background:#64748b" onclick="burnClearSel()">✖</button></div>' : '') +
      (groups.length ? groups.map(function (g) { return burnSiteHtml(g, write); }).join('') : '<div class="dev-empty">אין מונים שמתאימים לחיפוש.</div>') +
      '<div class="push-foot">מציג ' + rows.length + ' מתוך ' + t.total + ' מונים · ' + (burnSyncedAt() ? 'עודכן מה-EMS ' + new Date(burnSyncedAt()).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'נתוני EMS מ-7.9.26 (טעינה ראשונית)') + '</div>' +
      (burnState.err && burnState.rows ? '<div class="push-foot">⚠️ הנתונים המוצגים עשויים להיות לא מעודכנים</div>' : '');
    burnRenderTiles();
  }
  function burnRender() {
    var el = document.getElementById('burnsContent'); if (!el) return;
    if (!burnCanSee()) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">אין הרשאה לעמוד זה.</div></div>'; return; }
    if (burnState.loading && !burnState.rows) { el.innerHTML = '<div class="dev-wrap"><div class="dev-loading">⏳ טוען מונים…</div></div>'; return; }
    if (burnState.err && !burnState.rows) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">⚠️ ' + burnEsc(burnState.err) + ' <button class="inv-btn small" onclick="renderBurns(true)">🔄 נסה שוב</button></div></div>'; return; }
    var f = burnState.f;
    var sites = B.groupBySite(burnState.rows || []).map(function (g) { return g.site; });
    var seg = function (key, opts) { return '<div class="burn-seg">' + opts.map(function (o) { return '<button class="' + (f[key] === o[0] ? 'on' : '') + '" onclick="burnSetFilter(\'' + key + '\',\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>'; };
    el.innerHTML = '<div class="dev-wrap burn-wrap">' +
      '<div class="push-head"><h2 class="push-title">🔥 צריבות — Landis E360 ייצור</h2>' +
        '<div><button class="inv-btn small xl-export-btn" onclick="burnExportXlsx()" style="' + (typeof canExportExcel === 'function' && canExportExcel() ? '' : 'display:none') + '">📗 Excel</button> ' +
        (burnCanManageGens() ? '<button class="inv-btn small" onclick="burnGensOpen()">⚡ גנרטורים</button> ' : '') +
        (burnCanWrite() ? '<button class="inv-btn small" onclick="burnRefreshFromEms(true)" title="עדכון נתוני המונים מה-EMS"' + (burnState.syncing ? ' disabled' : '') + '>' + (burnState.syncing ? '⏳ EMS…' : '⟳ EMS') + '</button> ' : '') +
        '<button class="inv-btn small" onclick="renderBurns(true)" title="רענן">🔄</button>' +
        (burnState.loading && burnState.rows ? ' <span class="burn-muted">⏳</span>' : '') + '</div></div>' +
      '<div class="push-tiles" id="burnTiles"></div>' +
      '<div class="burn-filters">' +
        '<input id="burnSearch" class="burn-search" type="search" placeholder="🔍 קיבוץ / מס\' מונה / כתובת / מערכת" value="' + burnEsc(f.q) + '" oninput="burnSetFilter(\'q\', this.value)" onkeydown="if(event.key===\'Enter\')burnEnter()">' +
        '<select class="burn-site-sel" onchange="burnSetFilter(\'site\', this.value)"><option value="">כל הקיבוצים</option>' + sites.map(function (s) { return '<option' + (f.site === s ? ' selected' : '') + '>' + burnEsc(s) + '</option>'; }).join('') + '</select>' +
        seg('status', [['all', 'הכול'], ['pending', 'נותרו'], ['burned', 'נצרבו'], ['issue', 'בעיות']]) +
        seg('kind', [['all', 'PP+CT'], ['PP', '🔌 PP'], ['CT', '🧲 CT']]) + '</div>' +
      '<div id="burnResults"></div></div>';
    burnRenderResults();
  }
  async function renderBurns(force) {
    if (force || !burnState.rows) {
      burnState.loading = true; burnRender(); await burnLoad();
      if (burnState.err && burnState.rows) emsToast('⚠️ רענון נכשל: ' + burnState.err);
    }
    burnRender();
    if (burnState.rows && !burnState.err && Date.now() - burnSyncedAt() > BURN_SYNC_MS) burnRefreshFromEms(false);   // stale → pull from EMS in the background
  }

  // ---------- actions ----------
  var _burnSearchT = null;
  function burnRepaint() { if (document.getElementById('burnResults')) burnRenderResults(); else burnRender(); }
  function burnSetFilter(k, v) {
    burnState.f[k] = v;
    burnState.sel = {};
    try { localStorage.setItem('burn_filter_v1', JSON.stringify(burnState.f)); } catch (e) {}
    if (k === 'q') { clearTimeout(_burnSearchT); _burnSearchT = setTimeout(burnRenderResults, 120); } else burnRender();
  }
  function burnEnter() {  // single hit → open its card
    var rows = B.filterRows(burnState.rows || [], burnState.f, burnState.gens);
    if (rows.length === 1) burnOpen(rows[0].meter_id);
  }
  function burnToggleSite(site) { burnState.open[site] = !burnState.open[site]; burnRepaint(); }
  function burnSelect(id, on) { burnState.sel[id] = !!on; burnRepaint(); }
  function burnClearSel() { burnState.sel = {}; burnRepaint(); }
  function burnNow() { return new Date().toISOString(); }
  async function burnSafe(fn) { try { await fn(); } catch (e) { emsToast('⚠️ ' + e.message); } burnRepaint(); }
  function burnToggle(id) {
    var r = burnState.rows.find(function (x) { return x.meter_id === id; }); if (!r) return;
    if (r.status === 'burned' && !confirm('לבטל את סימון הצריבה של מונה ' + r.serial + '?')) return;
    burnSafe(function () { return burnPatchRow(id, r.status === 'burned' ? B.unburnPatch(burnNow()) : B.burnPatch(getCurrentUser(), burnNow())); });
  }
  function burnIssue(id) {
    var r = burnState.rows.find(function (x) { return x.meter_id === id; }); if (!r) return;
    var note = prompt('מה הבעיה במונה ' + r.serial + '?', r.note || ''); if (note === null) return;
    note = note.trim();
    if (!note) {
      if (r.status === 'issue') burnSafe(function () { return burnPatchRow(id, B.clearIssuePatch(burnNow())); });
      else emsToast('לא נשמרה בעיה ריקה');
      return;
    }
    burnSafe(function () { return burnPatchRow(id, B.issuePatch(note, burnNow())); });
  }
  function burnBurnSelected() {
    var filtered = B.filterRows(burnState.rows || [], burnState.f, burnState.gens);
    var filteredIds = {}; filtered.forEach(function (r) { filteredIds[r.meter_id] = true; });
    var ids = Object.keys(burnState.sel).filter(function (k) { return burnState.sel[k] && filteredIds[k]; });
    if (!ids.length) return;
    var sites = ids.map(function (id) { var r = filtered.find(function (x) { return x.meter_id === id; }); return r && r.site; })
      .filter(function (s, i, a) { return s && a.indexOf(s) === i; });
    if (!confirm('לסמן ' + ids.length + ' מונים ב' + sites.join(', ') + ' כנצרבו?')) return;
    burnSafe(async function () { for (var i = 0; i < ids.length; i++) await burnPatchRow(ids[i], B.burnPatch(getCurrentUser(), burnNow())); burnState.sel = {}; emsToast('✅ ' + ids.length + ' מונים סומנו כנצרבו'); });
  }
  // assign: all selected rows must be in ONE site; datalist of that site's generators; new name → create
  function burnAssignSelected(singleId) {
    var filtered = B.filterRows(burnState.rows || [], burnState.f, burnState.gens);
    var filteredIds = {}; filtered.forEach(function (r) { filteredIds[r.meter_id] = true; });
    var ids = singleId ? [singleId] : Object.keys(burnState.sel).filter(function (k) { return burnState.sel[k] && filteredIds[k]; });
    var rows = ids.map(function (id) { return burnState.rows.find(function (x) { return x.meter_id === id; }); }).filter(Boolean);
    if (!rows.length) return;
    var sites = rows.map(function (r) { return r.site; }).filter(function (s, i, a) { return a.indexOf(s) === i; });
    if (sites.length > 1) { emsToast('⚠️ שיבוץ לגנרטור הוא בתוך קיבוץ אחד בלבד'); return; }
    var site = sites[0], gens = burnState.gens.filter(function (g) { return g.site === site; });
    var m = document.getElementById('burnAssignModal'), c = document.getElementById('burnAssignContent');
    c.innerHTML = '<h3>⚡ שיבוץ לגנרטור — ' + burnEsc(site) + '</h3><p class="burn-muted">' + rows.length + ' מונים. בחר גנרטור קיים או הקלד שם חדש.</p>' +
      '<input id="burnGenName" list="burnGenList" class="burn-search" placeholder="שם הגנרטור" autocomplete="off"><datalist id="burnGenList">' + gens.map(function (g) { return '<option value="' + burnEsc(g.name) + '">'; }).join('') + '</datalist>' +
      '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-start;"><button class="inv-btn" onclick="burnAssignSave(\'' + burnAttr(site) + '\')">שמור</button>' +
      '<button class="inv-btn" style="background:#64748b" onclick="burnAssignSave(\'' + burnAttr(site) + '\', true)">הסר שיבוץ</button>' +
      '<button class="inv-btn" style="background:#94a3b8" onclick="document.getElementById(\'burnAssignModal\').classList.remove(\'open\')">ביטול</button></div>';
    m.dataset.ids = JSON.stringify(ids); m.classList.add('open'); setTimeout(function () { document.getElementById('burnGenName').focus(); }, 50);
  }
  function burnAssignSave(site, clear) {
    var m = document.getElementById('burnAssignModal'), ids = JSON.parse(m.dataset.ids || '[]');
    var name = (document.getElementById('burnGenName').value || '').trim();
    if (!clear && !name) { emsToast('הקלד שם גנרטור'); return; }
    burnSafe(async function () {
      var gid = null;
      if (!clear) { var g = burnState.gens.find(function (x) { return x.site === site && x.name === name; }) || await burnCreateGenerator(site, name); gid = g.id; }
      for (var i = 0; i < ids.length; i++) await burnPatchRow(ids[i], B.assignPatch(gid, burnNow()));
      burnState.sel = {}; m.classList.remove('open'); emsToast(clear ? 'השיבוץ הוסר' : '⚡ שובצו תחת ' + name);
    });
  }
  // meter card (read-only details + per-meter actions)
  function burnOpen(id) {
    var r = burnState.rows.find(function (x) { return x.meter_id === id; }); if (!r) return;
    var gen = burnState.gens.find(function (g) { return g.id === r.generator_id; });
    var st = BURN_STATE_UI[B.rowState(r)], write = burnCanWrite();
    var row = function (k, v) { return '<tr><th>' + k + '</th><td>' + (v == null || v === '' ? '—' : v) + '</td></tr>'; };
    var m = document.getElementById('burnCardModal'), c = document.getElementById('burnCardContent');
    c.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><h3 style="margin:0;">' + burnKindTag(r) + ' <bdi>' + burnEsc(r.serial) + '</bdi></h3>' +
      '<span class="burn-state ' + st.cls + '">' + st.icon + ' ' + st.label + '</span></div>' + burnWarn(r) +
      '<table class="burn-card">' +
        row('קיבוץ', burnEsc(r.site)) + row('כתובת', burnEsc(r.address)) + row('סוג', burnEsc(r.meter_type)) +
        row('תפקיד (קוד)', r.role_code != null ? r.role_code : null) +
        row('יחס CT', r.ct_ratio != null ? Number(r.ct_ratio) : null) + row('מונה אב', r.parent_serial ? '<bdi>' + burnEsc(r.parent_serial) + '</bdi>' : null) +
        row('מערכות מקושרות', r.solar_names ? burnEsc(r.solar_names).split(' · ').map(function (s) { return '☀️ ' + s; }).join('<br>') : null) +
        row('גנרטור', gen ? '⚡ ' + burnEsc(gen.name) + (gen.device_serial ? ' (' + burnEsc(gen.device_serial) + ')' : '') : null) +
        row('נצרב', r.burned_at ? new Date(r.burned_at).toLocaleDateString('he-IL') + ' · ' + burnEsc(r.burned_by) : null) +
        row('הערה', burnEsc(r.note)) +
      '</table>' +
      '<div style="margin-top:10px;"><a href="https://sigmatec-ems.com/admin/meters/' + burnEsc(r.meter_id) + '" target="_blank" rel="noopener" class="burn-link">פתח ב-EMS ↗</a></div>' +
      (write ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">' +
        '<button class="inv-btn" onclick="burnToggle(\'' + burnAttr(id) + '\');document.getElementById(\'burnCardModal\').classList.remove(\'open\')">' + (r.status === 'burned' ? '↩ בטל צריבה' : '✅ נצרב') + '</button>' +
        '<button class="inv-btn" style="background:#b45309" onclick="burnIssue(\'' + burnAttr(id) + '\');document.getElementById(\'burnCardModal\').classList.remove(\'open\')">⚠ בעיה</button>' +
        '<button class="inv-btn" style="background:#475569" onclick="document.getElementById(\'burnCardModal\').classList.remove(\'open\');burnAssignSelected(\'' + burnAttr(id) + '\')">⚡ גנרטור</button></div>' : '');
    m.classList.add('open');
  }
  function burnExportXlsx() {
    if (typeof xlDownload !== 'function') { emsToast('ייצוא אקסל לא זמין'); return; }
    var rows = B.filterRows(burnState.rows || [], burnState.f, burnState.gens);
    xlDownload(B.xlsxSpec(rows, burnState.gens), 'צריבות-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }
  function burnCanManageGens() { return ['עידן', 'עמיחי'].indexOf(getCurrentUser()) !== -1; }
  function burnGensOpen() {
    if (!burnCanManageGens()) return;
    var m = document.getElementById('burnCardModal'), c = document.getElementById('burnCardContent');
    var list = B.genSummary(burnState.gens, burnState.rows || []);
    c.innerHTML = '<h3 style="margin:0 0 8px;">⚡ גנרטורים (' + list.length + ')</h3><p class="burn-muted" style="margin:0 0 8px;">מספר מונה/בקר של הגנרטור — נשמר ביציאה מהשדה.</p>' +
      (list.length ? '<div style="overflow-x:auto;"><table class="inv-table"><thead><tr><th>קיבוץ</th><th>שם</th><th>מונה/בקר</th><th>מונים</th></tr></thead><tbody>' +
      list.map(function (g) { return '<tr><td>' + burnEsc(g.site) + '</td><td>' + burnEsc(g.name) + '</td><td><input class="burn-search" style="min-height:34px;padding:4px 8px;width:130px;" value="' + burnEsc(g.device_serial) + '" onblur="burnGenSaveSerial(\'' + burnAttr(g.id) + '\', this.value)"></td><td>' + g.count + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<div class="dev-empty">עדיין לא נוצרו גנרטורים — שבץ מונה מהרשימה כדי ליצור.</div>');
    m.classList.add('open');
  }
  function burnGenSaveSerial(id, v) {
    var g = burnState.gens.find(function (x) { return x.id === id; }); if (!g || (g.device_serial || '') === v.trim()) return;
    burnSafe(async function () {
      var r = await fetch(SB_URL + '/rest/v1/generators?id=eq.' + id, { method: 'PATCH', headers: Object.assign(burnHdr(true), { Prefer: 'return=minimal' }), body: JSON.stringify({ device_serial: v.trim() || null }) });
      if (!r.ok) throw new Error('שמירת הגנרטור נכשלה (' + r.status + ')');
      g.device_serial = v.trim() || null;
      emsToast('✅ נשמר');
    });
  }
  window.burnGensOpen = burnGensOpen; window.burnGenSaveSerial = burnGenSaveSerial; window.burnCanManageGens = burnCanManageGens;
  window.renderBurns = renderBurns; window.burnCanSee = burnCanSee; window.burnCanWrite = burnCanWrite;
  window.burnSetFilter = burnSetFilter; window.burnEnter = burnEnter; window.burnToggleSite = burnToggleSite;
  window.burnSelect = burnSelect; window.burnClearSel = burnClearSel; window.burnToggle = burnToggle; window.burnIssue = burnIssue;
  window.burnBurnSelected = burnBurnSelected; window.burnAssignSelected = burnAssignSelected; window.burnAssignSave = burnAssignSave; window.burnOpen = burnOpen;
  window.burnExportXlsx = burnExportXlsx; window.burnRefreshFromEms = burnRefreshFromEms;
