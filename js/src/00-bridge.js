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
      showPage: function (page) { return call('showPage', [page]); },
      canShowPage: canShowPage,

      // ---- EMS --------------------------------------------------------------
      emsApi: function () { return call('emsApi', Array.prototype.slice.call(arguments)); },
      isEmsConnected: function () { return !!call('isEmsConnected', [], false); },
      emsCacheData: function () { return call('emsCacheData', [], { tasks: [] }); },
      emsSiteIdForKibbutz: function (name) { return call('emsSiteIdForKibbutz', [name], Promise.resolve('')); },
      getEmsSites: function () { return call('getEmsSites', [], Promise.resolve([])); },
      kibbutzHasSite: function (name) {
        return Promise.resolve(call('emsSiteIdForKibbutz', [name], '')).then(function (id) { return !!id; }).catch(function () { return false; });
      },
      openKibbutzEmsTask: function (id) { return call('openKibbutzEmsTask', [id]); },

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
        if (typeof applyCardEmsWidgets === 'function') applyCardEmsWidgets();
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
