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
  //                            · session-expired (one 401 anywhere → one re-login sheet, §7n)
  // ═══════════════════════════════════════════════════════════════════════════
  // ───────────────────────── a role that outlived its page ─────────────────────────
  // `canManageStaff()` used to live in js/src/17-staff.js. That module WAS the עובדים page and
  // retired with it (spec §7m R5) — the gate it defined did not. It is the app's elevated group
  // (עידן + עמיחי) and it decides 💻 פיתוח, 📥 ייבוא, 📣 the feedback inbox and ➕ קיבוץ, so it
  // lives here, in the file concatenated FIRST, where nothing can reference it too early.
  function canManageStaff() {
    var me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    return (typeof isIdan === 'function' && isIdan()) || me === 'עמיחי';
  }
  window.canManageStaff = canManageStaff;
  // The people a message can be left for (was 17-staff.js's STAFF_PEOPLE — עמיחי is the CEO,
  // not a managed employee). Read by the ✉️ הודעה לעובד action in Ctrl+K.
  window.STAFF_PEOPLE = ['עידן', 'אביאם', 'ניתאי', 'מתניה'];

  window.sigmaBus = window.sigmaBus || new EventTarget();
  window.sigmaEmit = function (name, detail) {
    try { window.sigmaBus.dispatchEvent(new CustomEvent(name, { detail: detail })); }
    catch (e) { console.warn('[sigma] emit failed', name, e); }
  };

  // ───────────────────── session expiry — ONE experience (spec §7n) ─────────────────────
  // Every 401 in the app funnels in here: an EMS call (js/src/12-reports.js emsApi), a legacy
  // REST read (js/src/01-data.js), a supabase-js read/write (app/src/lib/supabase.ts). The
  // debouncer lives HERE and not on the React side because both halves have to share it — a
  // screen that fired five requests must show ONE sheet, whichever half noticed first.
  //
  // Returns true when this call actually announced an expiry (the tests assert on that).
  var SIGMA_EXPIRY_WINDOW_MS = 4000;
  // A cold boot mints the pass asynchronously (js/src/15-login-gate.js `sbEnsurePass`). A 401
  // that was already on the wire while that was happening — or that crossed a fresh mint by a
  // hair — is the boot racing itself, NOT an expired session, and the caller retries it once.
  // Without this the very first visit of the day showed a re-login sheet on a valid session
  // (review fix 1).
  var SIGMA_MINT_GRACE_MS = 2000;
  window._sigmaExpiryAt = window._sigmaExpiryAt || 0;
  window.sigmaSessionExpired = function (reason) {
    try { if (window._certViewMode) return false; } catch (e) {}
    var now = Date.now();
    if (window._sbPassPending) return false;
    if (window._sbPassMintedAt && (now - window._sbPassMintedAt) < SIGMA_MINT_GRACE_MS) return false;
    if (window._sigmaExpiryAt && (now - window._sigmaExpiryAt) < SIGMA_EXPIRY_WINDOW_MS) return false;
    window._sigmaExpiryAt = now;
    window.sigmaEmit('session-expired', { reason: reason || 'unknown' });
    // The React sheet is the surface. Without it (a page whose island never loaded) the
    // legacy re-login modal is the fallback — never a page jump, never a per-page toast.
    try {
      if (typeof window.sigmaOpenReLogin === 'function') window.sigmaOpenReLogin();
      else if (typeof window.emsRequireLogin === 'function') window.emsRequireLogin();
    } catch (e) { console.warn('[sigma] re-login surface failed', e); }
    return true;
  };

  // Hand over to the sign-in, keeping the place the person was in: the page, the scroll
  // position and the draft the visit form has already saved. The gate restores both after a
  // successful sign-in (js/src/15-login-gate.js).
  window.sigmaBeginReLogin = function () {
    try {
      var page = window._currentPage || '';
      if (page && page !== 'ems') sessionStorage.setItem('ems_return_page_v1', page);
      sessionStorage.setItem('ems_return_scroll_v1', String(window.scrollY || 0));
    } catch (e) {}
    var gate = document.getElementById('emsLoginGate');
    if (gate) { gate.style.display = 'flex'; return; }
    // No gate markup on this page → a reload lands on it (the gate is the front door).
    try { location.reload(); } catch (e) {}
  };

  // Is the person in the middle of the visit form? The gate reads this to restore the screen
  // in place after a re-login instead of reloading it away from under him (review fix, minors).
  window.sigmaBus.addEventListener('visit-form-open', function () { window._visitFormOpen = true; });
  window.sigmaBus.addEventListener('visit-saved', function () { window._visitFormOpen = false; });

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
        case 'dev':        return !!call('canSeeDevTasks', [], false);
        case 'pushlog':    return !!call('isIdan', [], false);
        case 'inventory':  return call('getCurrentUser', [], '') !== 'מתניה';
        case 'kibbutz': case 'calendar': return true;
        // 'ems' / 'mytasks' / 'staff' are retired (§7m R1/R2/R5) — they fall through to false,
        // so a stale deep link or a remembered landing lands on 🏘 קיבוצים instead of nowhere.
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

      // The briefing's "לפני שיוצאים" leftovers (spec §5.1b). React never touches the legacy
      // form's DOM, so it hands the text over here and we write it the moment the form is on
      // screen — ONCE, and only while the field is still empty, so a draft that already has
      // his own words in it is never overwritten. The `input` event is what makes the visit
      // form's autosave pick the text up as part of the draft.
      prefillOpenItems: function (kibbutz, text) {
        var value = String(text == null ? '' : text).trim();
        if (!value) return;
        var done = false;
        var fill = function () {
          if (done) return;
          done = true;
          window.sigmaBus.removeEventListener('visit-form-open', fill);
          setTimeout(function () {
            var el = document.getElementById('visitOpenItems');
            if (!el || String(el.value || '').trim()) return;   // his own text always wins
            el.value = value;
            try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
          }, 60);
        };
        window.sigmaBus.addEventListener('visit-form-open', fill);
        // Already open (he pressed 📍 from a form that was on screen) — no event is coming.
        if (window._visitFormOpen) fill();
        setTimeout(function () { window.sigmaBus.removeEventListener('visit-form-open', fill); }, 120000);
      },

      // ---- visit drafts (spec §5.1c) ---------------------------------------
      // The legacy module is the only writer of a draft, so it is the only reader too: React
      // asks "is there one?" and never learns the payload's shape. `date` omitted = any day.
      visitDraftFor: function (kibbutz, person, date) { return call('visitDraftFor', [kibbutz, person, date], null); },
      visitDraftDiscard: function (id) { return call('visitDraftDiscard', [id, false]); },
      loadAllVisitsCombined: function () { return call('loadAllVisitsCombined', [], []); },
      openDeliveryCert: function (pre) { return call('openDeliveryCert', [pre || {}]); },
      certFromVisitForm: function () { return call('certFromVisitForm'); },
      certFromVisit: function (visitId) { return call('certFromVisit', [visitId]); },

      // ---- session (spec §7n) -----------------------------------------------
      // One funnel for every 401 and one way to hand over to the sign-in. Islands call these
      // through app/src/lib/session.ts; nothing else may open a login surface.
      sessionExpired: function (reason) { return window.sigmaSessionExpired(reason); },
      beginReLogin: function () { return window.sigmaBeginReLogin(); },
      // The ONE mint promise (review fix 1). Islands await it before their first request, so a
      // cold boot never reads anon against the authenticated-only tables.
      ensurePass: function () {
        return (typeof window.sbEnsurePass === 'function') ? window.sbEnsurePass() : Promise.resolve(false);
      },
      remintOnce: function () {
        return (typeof window.sbRemintOnce === 'function') ? window.sbRemintOnce() : Promise.resolve(false);
      },
      passPending: function () { return !!window._sbPassPending; },

      // ---- attendance + holidays (spec §7e) ---------------------------------
      // The island renders the month; the WRITE stays here. `attSave` is the same call the
      // legacy form makes (js/src/04-attendance-daily.js attSaveRow), so the Apps Script
      // endpoint, the optimistic SHEET_DATA push and the monthly PDF/Excel all keep seeing
      // one shape — a second writer is how a report starts disagreeing with a screen.
      attSave: function (entry) {
        var f = fn('attSaveRow');
        if (!f) return Promise.reject(new Error('attendance save unavailable'));
        return f(entry);
      },
      // One merged row per day for (person, year, month). `month` is 1-12 HERE — the island
      // and app/src/lib/attendance.ts speak ISO months; the legacy 0-based month stops at
      // this line.
      attRows: function (person, year, month) { return call('attRowsFor', [person, year, (month || 1) - 1], []); },
      // The session's holiday list, already loaded (or []). `attHolidaysLoad()` is the
      // promise, for an island that mounts before the legacy fetch finished.
      attHolidays: function () { return call('attHolidays', [], []); },
      attHolidaysLoad: function () { return call('attLoadHolidays', [], Promise.resolve([])); },
      // Who the report is about (עידן may switch people; a field worker cannot).
      attPerson: function () { return call('attPerson', [], ''); },
      setAttPerson: function (name) { return call('setAttPerson', [name]); },
      canSeeAttendance: function () { return !!call('canSeeAttendance', [], false); },
      attRefresh: function () { return call('renderAttendanceReport'); },
      attExportPdf: function () { return call('downloadAttendancePDF'); },
      attExportExcel: function () { return call('xlExportAttendanceCurrent'); },

      // ---- 🗓️ calendar (spec §7f, Task 13) ----------------------------------
      // The island reads day_plans / calendar_absences itself (supabase-js). These three are
      // what it CANNOT reach: the office Google Calendar (an Edge Function that needs the
      // live EMS bearer) and the EMS write path, which stays a single writer.
      calFetchEvents: function (range) { return call('calFetchEvents', [range], Promise.resolve([])); },
      calAddEvent: function (ev) { return call('calAddEvent', [ev], Promise.resolve({ error: 'unavailable' })); },
      emsPatchTask: function (id, body) {
        var f = fn('emsPatchTask');
        if (!f) return Promise.reject(new Error('EMS write unavailable'));
        return f(id, body);
      },
      // A whole שיבוץ (or its undo) in one call — one cache resync for the batch, not N.
      emsPatchTasks: function (patches) {
        var f = fn('emsPatchTasks');
        if (!f) return Promise.reject(new Error('EMS write unavailable'));
        return f(patches);
      },
      // The legacy month grid steps aside the moment the island mounts (same contract the
      // attendance island has with #attendanceLegacy).
      calIslandMounted: function () {
        window.__sigmaCalendarIsland = true;
        var legacy = document.getElementById('calendarLegacy');
        if (legacy) legacy.style.display = 'none';
      },

      // ---- רשימה — the calendar's third view (spec §7g, Task 14) ------------
      // The retired משימות and 📋 EMS pages had these behind their own buttons. They are
      // behaviours, not screens, so they survive as bridge entries the list view (and Ctrl+K)
      // calls — there is no second copy of any of them anywhere.
      //
      // ✓ סיים goes through `changeEmsStatus`, which is QUEUE-AWARE: offline the change is
      // parked and applied on the next connect, exactly like closing a task from the visit form.
      //
      // `canUseEms` is WHO may act on EMS at all (js/src/11-search-login.js `EMS_USERS`). Until
      // now the only thing that asked was `showPage('ems')`; with that page retired the Ctrl+K
      // actions that replaced its two header buttons ask the same question, so retiring a screen
      // cannot quietly hand anyone a capability they did not have.
      canUseEms: function () { return !!call('canUseEms', [], false); },
      emsSetStatus: function (id, status) { return call('changeEmsStatus', [id, status]); },
      emsCreateTask: function (siteId) { return call('emsCreateTaskModal', [siteId || '']); },
      emsDisconnect: function () { return call('emsDisconnect'); },
      openVisitsReport: function () { return call('openVisitsToolsModal'); },   // renamed with the retired דוח ביקורים — the cert/Excel tools live on נוכחות now
      openActivity: function () { return call('openActivityModal'); },
      contactPhone: function (person) { return call('contactPhone', [person], ''); },
      // The retired home block's three lists — the FALLBACK source for the "חברה" group until
      // the one-shot migration into `internal_tasks` has run (§7m R3, db/internal_tasks.sql).
      companyTasks: function () {
        try {
          var s = window.SHEET_DATA && window.SHEET_DATA.settings;
          return (s && s.companyTasks) || null;
        } catch (e) { return null; }
      },
      staffSendMessage: function (toPerson, text) {
        var f = fn('staffSendMessage');
        if (!f) return Promise.reject(new Error('messaging unavailable'));
        return f(toPerson, text);
      },
      get STAFF_PEOPLE() { return window.STAFF_PEOPLE || []; },

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
