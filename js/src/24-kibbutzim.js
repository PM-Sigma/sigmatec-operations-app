  // ═══════════════════════════════════════════════════════════════════════════
  // KIBBUTZIM — the card list as DATA (spec §7b). Until "סיגמה 2.00" every card was
  // static markup in index.html; adding one meant a commit. Now the `kibbutzim` table
  // is the source of truth and this module renders the two sections from it.
  //
  // Contract kept for the existing decorating passes (01-data.js / 13-ems.js):
  //   the card root is `.kibbutz[data-name]` and holds a `.kibbutz-name-row` they
  //   insert after. Everything else on a card is appended by those passes.
  //
  // Paint order: the localStorage cache paints instantly on DOMContentLoaded, then
  // kibbutzimLoad() re-renders with the server rows.
  // ═══════════════════════════════════════════════════════════════════════════
  (function () {
    const CACHE_KEY = 'kibbutzim_v1';

    // North → south. The first six are the regions the `tasks` table actually uses
    // (same list as 12-reports.js); the finer-grained names after them are accepted
    // too, so a hand-typed region still sorts sensibly instead of landing in the
    // "unknown" bucket. Anything else sorts after the list, alphabetically; '' last.
    // The FIVE regions the table actually holds, north → south (עידן, spec §2). Kept
    // byte-identical to REGION_ORDER in app/src/lib/kibbutzim.ts — both renderers group by it.
    const REGION_ORDER = [
      'גליל וגולן', 'העמקים', 'מישור החוף והשרון', 'שפלה ומרכז', 'דרום, עוטף עזה והנגב'
    ];
    const NO_REGION_LABEL = 'ללא איזור';

    const ENERGY_LABEL = { electric: '⚡ חשמל', water: '💧 מים', gas: '🔥 גז' };

    const esc = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const label = row => String((row && (row.display_name || row.name)) || '');
    const energyText = row => ((row && row.energy) || ['electric'])
      .map(e => ENERGY_LABEL[e] || ENERGY_LABEL.electric).join(' + ');

    // ---- pure: one card ----
    function buildCardHtml(row) {
      const section = row.section === 'new' ? 'new' : 'active';
      const marketing = !!row.marketing;
      const isSub = row.kind === 'subsite' && row.parent;
      return '<div class="kibbutz ' + section + '" data-name="' + esc(row.name) + '"' +
        ' data-section="' + section + '" data-marketing="' + (marketing ? 'true' : 'false') + '"' +
        (isSub ? ' data-parent="' + esc(row.parent) + '"' : '') +
        ' data-region="' + esc(row.region || '') + '">' +
        '<div class="kibbutz-name-row">' +
        '<div class="kibbutz-name">' + esc(label(row)) + '</div>' +
        // The region (עידן 20.9 #1). It used to be a label row BETWEEN the cards; every card
        // now says where it is, and the grouping survives as the sort order. Kept beside the
        // energy badge so the two read as one row of card metadata.
        '<span class="region-chip">' + esc(row.region || NO_REGION_LABEL) + '</span>' +
        '<span class="energy-badge">' + esc(energyText(row)) + '</span>' +
        (isSub ? '<span class="tag-subsite">↳ תת-אתר של ' + esc(row.parent) + '</span>' : '') +
        (marketing ? '<span class="tag-marketing">🤝 בתהליך שיווקי</span>' : '') +
        '</div></div>';
    }

    // ---- pure: rows → {new:[{region,rows}], active:[…]} ----
    function groupBySection(rows) {
      const out = { new: [], active: [] };
      const byLabel = {};
      (rows || []).forEach(r => { byLabel[r.name] = label(r); });

      // A sub-site sorts under its parent: it borrows the parent's sort key and then
      // comes right after it (kind tiebreak), so the pair never drifts apart.
      const sortKey = r => (r.kind === 'subsite' && r.parent) ? (byLabel[r.parent] || r.parent) : label(r);
      const cmp = (a, b) =>
        sortKey(a).localeCompare(sortKey(b), 'he') ||
        ((a.kind === 'subsite' ? 1 : 0) - (b.kind === 'subsite' ? 1 : 0)) ||
        label(a).localeCompare(label(b), 'he');

      ['new', 'active'].forEach(section => {
        const mine = (rows || []).filter(r => (r.section === 'new' ? 'new' : 'active') === section);
        const byRegion = {};
        mine.forEach(r => {
          const reg = String(r.region || '');
          (byRegion[reg] = byRegion[reg] || []).push(r);
        });
        const known = REGION_ORDER.filter(r => byRegion[r]);
        const unknown = Object.keys(byRegion)
          .filter(r => r && REGION_ORDER.indexOf(r) === -1)
          .sort((a, b) => a.localeCompare(b, 'he'));
        const ordered = known.concat(unknown);
        if (byRegion['']) ordered.push('');            // "ללא איזור" always last
        out[section] = ordered.map(reg => ({ region: reg, rows: byRegion[reg].slice().sort(cmp) }));
      });
      return out;
    }

    // ---- render ----
    function renderKibbutzCards(rows) {
      // The React island (#sigma-home) owns the card list once it has mounted; this renderer
      // stays in the bundle as the fallback for when ui/sigma.js fails to load or is offline.
      // The model + cache are still updated below the guard so legacy readers stay correct.
      if (typeof document !== 'undefined' && document.body &&
          document.body.classList.contains('sigma-home-ready')) {
        if (Array.isArray(rows)) {
          window.KIBBUTZIM = rows;
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch (e) { /* ignore */ }
        }
        return;
      }
      if (Array.isArray(rows)) {
        window.KIBBUTZIM = rows;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch (e) { /* private mode / quota */ }
      }
      const all = (window.KIBBUTZIM || []).filter(r => r && r.name && !r.archived_at);
      const groups = groupBySection(all);

      ['new', 'active'].forEach(section => {
        const grid = document.getElementById('grid-' + section);
        if (!grid) return;
        const gs = groups[section];
        // No standalone region rows (עידן 20.9 #1) — the grouping is still real, it is just
        // carried by the order plus each card's own chip instead of by a row of its own.
        grid.innerHTML = gs.map(g => g.rows.map(buildCardHtml).join('')).join('');
        const sec = grid.closest ? grid.closest('.section') : null;
        const badge = sec ? sec.querySelector('.section-count') : null;
        if (badge) badge.textContent = String(gs.reduce((n, g) => n + g.rows.length, 0));
      });

      const n = s => all.filter(r => (r.section === 'new' ? 'new' : 'active') === s).length;
      const setCnt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
      setCnt('cnt-all', all.length);
      setCnt('cnt-new', n('new'));
      setCnt('cnt-active', n('active'));
      setCnt('cnt-marketing', all.filter(r => r.marketing).length);

      if (typeof applyFilters === 'function') applyFilters();
    }

    // ---- the canonical list for every picker ----
    // Legacy code used to read the kibbutz list off the card DOM. The React island only
    // renders the cards that pass the current chip/search, so on a filtered page those
    // pickers (visit-quick, order intake, customer order) silently lost options. The MODEL
    // is the source of truth; the DOM stays as the fallback for the moment before the model
    // has loaded (very first paint with an empty cache).
    function kibbutzOptions() {
      const rows = (window.KIBBUTZIM || []).filter(r => r && r.name && !r.archived_at);
      if (rows.length) {
        return rows
          .map(r => ({ value: r.name, label: String(r.display_name || r.name) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'he'));
      }
      const seen = {};
      return Array.prototype.slice.call(document.querySelectorAll('.kibbutz[data-name]'))
        .map(c => c.dataset.name)
        .filter(n => { if (!n || seen[n]) return false; seen[n] = 1; return true; })
        .sort((a, b) => a.localeCompare(b, 'he'))
        .map(n => ({ value: n, label: n }));
    }
    function kibbutzNames() { return kibbutzOptions().map(o => o.value); }

    function kibbutzByName(name) {
      if (!name) return undefined;
      const list = window.KIBBUTZIM || [];
      return list.find(r => r.name === name) || list.find(r => r.display_name === name);
    }

    // ---- load ----
    const SB_KIB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
    const SB_KIB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';
    // 01-data.js exposes its closure-local sbGet as window._sbGet; the plain-fetch
    // fallback keeps this module usable when that router is off (?sb=0) or in tests.
    function kibGet(path) {
      if (typeof window._sbGet === 'function') return window._sbGet(path);
      return fetch(SB_KIB_URL + '/rest/v1/' + path, { headers: { apikey: SB_KIB_ANON, Authorization: 'Bearer ' + SB_KIB_ANON } })
        .then(r => { if (!r.ok) throw new Error('kibbutzim GET ' + r.status); return r.json(); });
    }

    async function kibbutzimLoad() {
      const rows = await kibGet('kibbutzim?select=*&order=region,name&archived_at=is.null');
      window.KIBBUTZIM = rows;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch (e) { /* ignore */ }
      return rows;
    }

    function kibbutzimCached() {
      try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; }
      catch (e) { return null; }
    }

    // First paint from cache — before Supabase answers, so the page is never empty.
    function kibbutzimFirstPaint() {
      const cached = kibbutzimCached();
      if (cached && cached.length) renderKibbutzCards(cached);
    }

    // This module sits at the END of the bundle, so the app's init (11-search-login.js) has
    // already run its first refreshData() by the time we get here — that call could not see
    // kibbutzimLoad yet. Boot ourselves: paint the cache, then fetch once. Waiting for the
    // 15s poll instead would leave the page empty on load.
    // A repaint replaces the grid innerHTML, so whatever decorated the old cards is gone.
    // Re-run the card passes against the snapshot already in memory (refreshData does the
    // same after its own fetch; both are idempotent).
    function kibbutzimDecorate() {
      if (!window.SHEET_DATA) return;
      if (typeof enrichCardsWithSheet === 'function') enrichCardsWithSheet(window.SHEET_DATA);
      if (typeof injectCustomerCodes === 'function') injectCustomerCodes();
      // applyCardLastVisit / reorderCards dropped (round 5, K-U3): the closed card now renders
      // its own last-visit line in React (KibbutzCard.tsx's LastVisitRow) in the right order
      // already, so the legacy DOM-append pass would only duplicate it. The functions stay
      // defined (K-U5 deletes them) — nothing else still calls them.
    }

    function kibbutzimBoot() {
      kibbutzimFirstPaint();
      kibbutzimDecorate();
      kibbutzimLoad()
        .then(rows => { renderKibbutzCards(rows); kibbutzimDecorate(); })
        .catch(e => console.warn('[kibbutzim] initial load failed — showing the cached list', e));
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
      // deferred bundle (task 22b): a macrotask, never inline — see 02-init-attendance.js.
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kibbutzimBoot);
      else setTimeout(kibbutzimBoot, 0);
    }

    window.KIBBUTZIM = window.KIBBUTZIM || [];
    window.REGION_ORDER_KIB = REGION_ORDER;
    window.buildCardHtml = buildCardHtml;
    window.groupBySection = groupBySection;
    window.renderKibbutzCards = renderKibbutzCards;
    window.kibbutzByName = kibbutzByName;
    window.kibbutzOptions = kibbutzOptions;
    window.kibbutzNames = kibbutzNames;
    window.kibbutzimLoad = kibbutzimLoad;
    window.kibbutzimCached = kibbutzimCached;
    window.kibbutzimFirstPaint = kibbutzimFirstPaint;
  })();
