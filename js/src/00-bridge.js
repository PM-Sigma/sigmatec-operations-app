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
      createTask: function (item) { return call('emsWriteOrQueue', [Object.assign({ kind: 'createTask' }, item || {})]); },

      // ---- visits + delivery certificates ------------------------------------
      openVisitQuick: function (kibbutz) {
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
