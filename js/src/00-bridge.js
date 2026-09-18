  // ═══════════════════════════════════════════════════════════════════════════
  // BRIDGE — the ONLY surface the React islands (ui/sigma.js) may touch (spec §7c).
  // Concatenated FIRST, so window.sigma exists before any island mounts. Every entry is a
  // lazy thunk: the legacy functions it forwards to are declared later in the bundle, and a
  // few are optional, so nothing is captured at definition time.
  //
  // Direction of traffic:
  //   React → legacy   window.sigma.<fn>()
  //   legacy → React   window.sigmaBus.dispatchEvent(new CustomEvent('<name>'))
  //                    events: user-changed · ems-cache-synced · visit-saved · theme-changed
//                            · visit-form-open (the legacy visit form just came on screen)
  // ═══════════════════════════════════════════════════════════════════════════
  window.sigmaBus = window.sigmaBus || new EventTarget();
  window.sigmaEmit = function (name, detail) {
    try { window.sigmaBus.dispatchEvent(new CustomEvent(name, { detail: detail })); }
    catch (e) { console.warn('[sigma] emit failed', name, e); }
  };

  // ───────────────────────── usage tracking (spec §7j) ─────────────────────────
  // The legacy half: stamp WHO / WHERE / WHEN and park the event in one shared array. The
  // React side (app/src/lib/track.ts) drains it and owns the only insert — legacy code never
  // touches Supabase for analytics, and if ui/sigma.js never loads the array just caps out.
  //
  // PII-light by construction: a person's name, the page, an action key and a short target
  // (a kibbutz name, a cert number, an id). NEVER free text a user typed, WITHOUT EXCEPTION
  // (review fix round 1): a search miss is recorded as "results:0,len:<n>", never the query.
  // The slice below is a backstop, not a licence — pass an id or a name, never user input.
  window.__sigmaTrack = window.__sigmaTrack || [];
  var TRACK_CAP = 200, TRACK_TARGET = 40;
  window.sigmaTrack = function (action, target, page) {
    try {
      if (!action) return;
      var q = window.__sigmaTrack;
      if (q.length >= TRACK_CAP) q.shift();          // a tab with no React bundle must not grow forever
      q.push({
        person: (typeof getCurrentUser === 'function' && getCurrentUser()) || null,
        page: page || window._currentPage || null,
        action: String(action),
        target: (target === null || target === undefined) ? null : String(target).slice(0, TRACK_TARGET),
        at: new Date().toISOString()
      });
    } catch (e) { /* tracking never affects the caller */ }
  };

  // Page views. showPage() is a top-level function declaration in the same concatenated
  // script, so it is HOISTED and already assignable here even though 02-init-attendance.js
  // comes later in the bundle. Wrapping it — rather than tracking inside sigma.showPage — is
  // what makes the legacy nav buttons, the deep links and the React nav all count once:
  // showPage is the single door every page change goes through. The DOMContentLoaded retry is
  // only a safety net for a bundle where the hoist did not happen.
  window.sigmaWrapShowPage = function () {
    if (window.__sigmaShowPageWrapped) return true;
    var orig = window.showPage;
    if (typeof orig !== 'function') return false;
    window.__sigmaShowPageWrapped = true;
    window.showPage = function (page) {
      var r = orig.apply(this, arguments);
      // AFTER the call: showPage rewrites `page` when a gate denies it, and what belongs in
      // the log is the page the user actually landed on (window._currentPage).
      window.sigmaTrack('view', null, window._currentPage || page);
      return r;
    };
    return true;
  };
  if (!window.sigmaWrapShowPage()) {
    document.addEventListener('DOMContentLoaded', function () { window.sigmaWrapShowPage(); });
  }

  (function () {
    var fn = function (name) { return typeof window[name] === 'function' ? window[name] : null; };
    var call = function (name, args, fallback) {
      var f = fn(name);
      if (!f) { console.warn('[sigma] legacy function missing: ' + name); return fallback; }
      return f.apply(window, args || []);
    };

    // The page gates showPage() applies. Kept in ONE place so the React bottom nav offers
    // exactly the pages the legacy nav would let the user open.
    function canShowPage(page) {
      switch (page) {
        case 'attendance': return !!call('canSeeAttendance', [], false);
        case 'ems':        return !!call('canUseEms', [], false);
        case 'staff':      return !!call('canManageStaff', [], false);
        case 'dev':        return !!call('canSeeDevTasks', [], false);
        case 'pushlog':    return !!call('isIdan', [], false);
        case 'inventory':  return call('getCurrentUser', [], '') !== 'מתניה';
        case 'kibbutz': case 'mytasks': case 'calendar': return true;
        default: return false;
      }
    }

    window.sigma = {
      // ---- identity / roles -------------------------------------------------
      getCurrentUser: function () { return call('getCurrentUser', [], ''); },
      getRole: function () { try { return localStorage.getItem('dashboard_role_v1') || ''; } catch (e) { return ''; } },
      isViewer: function () { return !!call('isViewer', [], false); },
      isIdan: function () { return !!call('isIdan', [], false); },
      // "admin" = the staff-management gate (עידן + עמיחי) — the app's only elevated group beyond isIdan.
      isAdmin: function () { return !!call('canManageStaff', [], false); },
      changeUser: function () { return call('changeUser'); },
      get ATT_PEOPLE() { return (typeof ATT_PEOPLE !== 'undefined' && ATT_PEOPLE) || []; },

      // ---- navigation -------------------------------------------------------
      // Page views are tracked by the showPage WRAPPER above, not here — otherwise a legacy
      // nav button would go unrecorded and a React nav click would be recorded twice.
      showPage: function (page) { return call('showPage', [page]); },
      canShowPage: canShowPage,

      // ---- usage analytics (spec §7j) ---------------------------------------
      // The same signature React's track() has; both land in the one queue.
      track: function (action, target, page) { return window.sigmaTrack(action, target, page); },

      // ---- EMS --------------------------------------------------------------
      emsApi: function () { return call('emsApi', Array.prototype.slice.call(arguments)); },
      isEmsConnected: function () { return !!call('isEmsConnected', [], false); },
      emsCacheData: function () { return call('emsCacheData', [], { tasks: [] }); },
      // Open tasks for one kibbutz card, from the shared cache — the exact filter (site
      // aggregation for merged sites, e.g. שדה אליהו + חקלאות) legacy code already owns; the
      // React widget (components/home/EmsTasks.tsx) reuses it instead of re-deriving site ids
      // in TS from the hardcoded KIBBUTZ_SITE_MAP.
      emsCacheTasksForKibbutz: function (name) { return call('emsCacheTasksForKibbutz', [name], []); },
      // The legacy EMS_STATUS/EMS_PRIORITY label maps (js/src/14-calendar.js) — single source
      // of truth for display text; app/src/lib/emsTasks.ts reads these first and only falls
      // back to its own mirror when the bridge isn't reachable.
      emsLabels: function () { return call('emsLabels', [], { status: {}, priority: {} }); },
      emsSiteIdForKibbutz: function (name) { return call('emsSiteIdForKibbutz', [name], Promise.resolve('')); },
      getEmsSites: function () { return call('getEmsSites', [], Promise.resolve([])); },
      kibbutzHasSite: function (name) {
        return Promise.resolve(call('emsSiteIdForKibbutz', [name], '')).then(function (id) { return !!id; }).catch(function () { return false; });
      },
      openKibbutzEmsTask: function (id) { return call('openKibbutzEmsTask', [id]); },
      // The raw EMS bearer. The ONLY consumer is the `github` Edge Function, which gates every
      // mode on a valid EMS login (js/src/18-dev-tasks.js passes the same token) — the 📣
      // feedback inbox needs it to open a dev-board card from a bug report.
      emsToken: function () { return call('getEmsToken', [], '') || ''; },

      // ---- kibbutz cards ----------------------------------------------------
      // The modal is opened from the CARD element (openEditModal reads data-name off it), so
      // React hands us a name and we find the card the legacy way. Works for a React card and
      // a legacy one alike — both are `.kibbutz[data-name]`.
      openKibbutzModal: function (name, tab) {
        var sel = (window.CSS && CSS.escape) ? CSS.escape(name) : String(name).replace(/"/g, '\\"');
        var card = document.querySelector('.kibbutz[data-name="' + sel + '"]');
        if (!card) { console.warn('[sigma] no card for', name); return; }
        call('openEditModal', [card]);
        if (tab) call('switchTab', [tab]);
      },
      // Re-run every legacy pass that decorates a card, after React replaced the card DOM.
      // All of them are idempotent (each clears its own nodes first) and all are optional —
      // a module that is not in the bundle simply skips.
      decorateCards: function () {
        var data = window.SHEET_DATA;
        if (data && typeof enrichCardsWithSheet === 'function') enrichCardsWithSheet(data);
        if (typeof injectCustomerCodes === 'function') injectCustomerCodes();
        // The on-card EMS-tasks widget is React now (components/home/EmsTasks.tsx,
        // task-3-brief) — applyCardEmsWidgets/renderCardEmsTasks are gone from js/src/13-ems.js.
        if (typeof applyCardSiteWarnings === 'function') applyCardSiteWarnings();
        if (typeof applyCardLastVisit === 'function') applyCardLastVisit();
        if (typeof renderCardNotes === 'function') renderCardNotes();
      },
      createTask: function (item) { return call('emsWriteOrQueue', [Object.assign({ kind: 'createTask' }, item || {})]); },

      // ---- supabase write pass ----------------------------------------------
      // Every write needs the AUTHENTICATED pass minted from the EMS session: the anon key
      // is read-only under RLS, so an island write without it comes back as
      // "row violates row-level security policy". Mint (or re-mint with force) and hand the
      // React side the token it should setSession() with. Null = no EMS session → no writes.
      // The pass as it stands RIGHT NOW, without minting — supabase-js asks for it on every
      // request (app/src/lib/supabase.ts), so this has to stay cheap and synchronous.
      sbPass: function () {
        return (window._sbToken && (window._sbTokenExp || 0) > Date.now())
          ? { token: window._sbToken, exp: window._sbTokenExp }
          : null;
      },
      sbAuthPass: function (force) {
        var fresh = function () { return !!window._sbToken && (window._sbTokenExp || 0) > Date.now(); };
        if (force) { window._sbToken = null; window._sbTokenExp = 0; }
        var mint = (!fresh() && typeof window._sbBridge === 'function')
          ? Promise.resolve().then(function () { return window._sbBridge(); }).catch(function () { return null; })
          : Promise.resolve(null);
        return mint.then(function () {
          return fresh() ? { token: window._sbToken, exp: window._sbTokenExp } : null;
        });
      },

      // ---- visits + delivery certificates ------------------------------------
      // With a kibbutz in hand this is ONE TAP: the visit form opens straight away with that
      // kibbutz, no picker in between (spec §3.3 — "סיכום ביקור כבר מלחיצה על קיבוץ"). That
      // also means switchTab('visit') — and with it the `visit-form-open` event the 🚚 quick
      // action waits for — fires now, instead of only after the user confirms a picker.
      // No name (the FAB) or no card for that name → the normal picker.
      openVisitQuick: function (kibbutz) {
        if (kibbutz) {
          var esc = (window.CSS && CSS.escape) ? CSS.escape(kibbutz) : String(kibbutz).replace(/"/g, '\\"');
          var card = document.querySelector('.kibbutz[data-name="' + esc + '"]');
          if (card && typeof window.openEditModal === 'function') {
            call('openEditModal', [card]);
            call('switchTab', ['visit']);
            var me = call('getCurrentUser', [], '');
            var visitorSel = document.getElementById('visitor');
            if (visitorSel && me) {
              visitorSel.value = me;
              if (typeof window.onVisitorChange === 'function') window.onVisitorChange(me);
            }
            try { localStorage.setItem('last_visit_kibbutz', kibbutz); } catch (e) { /* private mode */ }
            return;
          }
        }
        var r = call('openVisitQuick');
        if (kibbutz) {
          var sel = document.getElementById('visitQuickKibbutz');
          if (sel) sel.value = kibbutz;
        }
        return r;
      },
      getLastVisit: function (kibbutz) { return call('getLastVisit', [kibbutz], null); },

      // ---- visit drafts (spec §5.1c) ---------------------------------------
      // The legacy module is the only writer of a draft, so it is the only reader too: React
      // asks "is there one?" and never learns the payload's shape. `date` omitted = any day.
      visitDraftFor: function (kibbutz, person, date) { return call('visitDraftFor', [kibbutz, person, date], null); },
      visitDraftDiscard: function (id) { return call('visitDraftDiscard', [id, false]); },
      loadAllVisitsCombined: function () { return call('loadAllVisitsCombined', [], []); },
      openDeliveryCert: function (pre) { return call('openDeliveryCert', [pre || {}]); },
      certFromVisitForm: function () { return call('certFromVisitForm'); },
      certFromVisit: function (visitId) { return call('certFromVisit', [visitId]); },

      // ---- feedback ---------------------------------------------------------
      // Replaced by Sonner once #sigma-toaster mounts (islands.tsx writes sigma.toast back).
      // Until then (and if the island never mounts) fall back to the legacy #toast strip.
      toast: function (msg) {
        var t = document.getElementById('toast');
        if (!t) { console.log('[sigma] toast:', msg); return; }
        t.textContent = String(msg);
        t.classList.add('show');
        setTimeout(function () { t.classList.remove('show'); }, 3000);
      }
    };
  })();
