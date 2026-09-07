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
  B.filterRows = function (rows, f) {
    f = f || {};
    return rows.filter(function (r) {
      if (f.site && r.site !== f.site) return false;
      if (f.status && f.status !== 'all' && r.status !== f.status) return false;
      if (f.kind === 'CT' && !B.isCT(r)) return false;
      if (f.kind === 'PP' && B.isCT(r)) return false;
      return B.matches(r, f.q);
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
  // PURE-END
  window._burnLogic = B;
