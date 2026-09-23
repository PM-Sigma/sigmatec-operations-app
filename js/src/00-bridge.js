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
  // ───────────────────────── escaping for generated HTML ─────────────────────────
  // Two helpers, because there are two different contexts and mixing them up is exactly how
  // audit C #6/#7 happened. This file is concatenated FIRST, so both are in scope everywhere.
  //
  // The rule that makes this subtle: inside an attribute the browser DECODES HTML entities
  // FIRST and only then parses the result (as JavaScript, for an on*-handler). So a JS-string
  // escape must survive that decode as a literal character — which means a quote that is part
  // of the JS syntax must NOT become an entity.

  /**
   * Safe inside any plain HTML attribute value: `data-product="${attrEsc(name)}"`,
   * `aria-label="בחר ${attrEsc(name)}"`, and safe in text content too. Every entity decodes
   * back to the original character, so `el.dataset.product` still reads the real name.
   */
  function attrEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Safe as ONE ARGUMENT of an inline handler: `onclick="stepProductQty('${jsArgEsc(p)}', 1)"`.
   * Order matters: entity-escape `&`/`<`/`>` (never the quotes), then JS-escape the backslash
   * and the apostrophe so they survive HTML decoding as real characters, then close the
   * attribute hole by turning `"` into `&quot;` — a product or kibbutz name containing a double
   * quote (`מונה "ראשי"`) used to end the attribute early and scatter the rest into the tag.
   * Identical to `devArg()` in js/src/18-dev-tasks.js, which is where this pattern was first
   * written; that copy stays so the dev page keeps its own local reading.
   */
  function jsArgEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;');
  }
  window.attrEsc = attrEsc;
  window.jsArgEsc = jsArgEsc;

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
  // ───────────────────────── ONE roster (audit A · A4/A5/A12) ─────────────────────────
  // There used to be four person lists with four different memberships (the login roster in
  // index.html, EMS_USERS, MEETING_PEOPLE, STAFF_PEOPLE) — אליה and אבצן fell through the
  // cracks and nobody could be sent them a message. This is the single source: exactly the
  // names the login screen offers, in the order it offers them. `test-roster.mjs` asserts the
  // login roster, MEETING_PEOPLE and EMS_USERS all agree with it (EMS_USERS is a declared
  // subset — an EMS account is a fact about a person, not a permission we choose here).
  window.APP_PEOPLE = ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'מתניה', 'אליה'];

  // The view-only identity. STORED by the login gate under `dashboard_user_v1`, so every
  // by-name viewer check must compare against THIS string and no other spelling ('צופה' was
  // the second spelling that never matched anything — audit A · A5). Mirrored in
  // app/src/lib/landing.ts as VIEWER_NAME; test-roster.mjs asserts the two agree.
  window.VIEWER_NAME = 'צפייה';

  // The people a message can be left for. Everyone who can log in is addressable — the old
  // list dropped אליה and אבצן entirely, and excluded עמיחי "because he is the CEO", which
  // only meant nobody could ever message him. Read by ✉️ הודעה לעובד in Ctrl+K.
  window.STAFF_PEOPLE = window.APP_PEOPLE.slice();

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

  // A legacy surface found no EMS session where it needs one (spec 2026-09-23 ems-session):
  // there is no "connect to EMS" step any more — staff are signed in WITH EMS — so a missing
  // token means the session lapsed. Freeze the app through the one funnel and return the one
  // sentence a caller may show inline. Mock mode (?login=0 on a dev host) never freezes.
  window.SIGMA_SESSION_LOST_MSG = 'ההתחברות פגה. צריך להתחבר מחדש';
  window.sigmaSessionLost = function (reason) {
    try {
      var h = String(location.hostname || '').toLowerCase();
      var mockHost = h === 'localhost' || h === '127.0.0.1' || /\.localhost$/.test(h) || /(^|\.)githack\.com$/.test(h);
      if (!(location.search.indexOf('login=0') !== -1 && mockHost)) window.sigmaSessionExpired(reason || 'no-session');
    } catch (e) {}
    return window.SIGMA_SESSION_LOST_MSG;
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
  // The last 30 actions, kept for the crash card's bug report (22.9, K4). Separate from the
  // upload queue above, which the React side drains — this one is never emptied.
  window.__sigmaTrail = window.__sigmaTrail || [];
  var TRACK_CAP = 200, TRACK_TARGET = 40, TRAIL_CAP = 30;
  window.sigmaTrack = function (action, target, page) {
    try {
      if (!action) return;
      var q = window.__sigmaTrack;
      if (q.length >= TRACK_CAP) q.shift();          // a tab with no React bundle must not grow forever
      var row = {
        person: (typeof getCurrentUser === 'function' && getCurrentUser()) || null,
        page: page || window._currentPage || null,
        action: String(action),
        target: (target === null || target === undefined) ? null : String(target).slice(0, TRACK_TARGET),
        at: new Date().toISOString()
      };
      q.push(row);
      var tr = window.__sigmaTrail; if (tr.length >= TRAIL_CAP) tr.shift(); tr.push(row);
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
        // D-L5: inline (was canSeeDevTasks() in the retiring js/src/18-dev-tasks.js) — עידן +
        // עמיחי (admin, via canManageStaff) + מתניה + אליה (the two developers).
        case 'dev': { var _d = call('getCurrentUser', [], ''); return _d === 'מתניה' || _d === 'אליה' || !!call('canManageStaff', [], false); }
        case 'pushlog':    return !!call('isIdan', [], false);
        case 'inventory':  return call('getCurrentUser', [], '') !== 'מתניה';
        case 'kibbutz': case 'calendar': return true;
        // 🔥 צריבות (Task 23; gate moved off 24-meter-burns.js in round 5 G-L4) — a temporary
        // project page: the same audience app/src/lib/burns.ts BURN_WRITERS/BURN_HIDDEN use,
        // and false for everyone once BURNS_PROJECT_ACTIVE (js/src/00-consts.js) goes false.
        case 'burns': {
          if (window.BURNS_PROJECT_ACTIVE === false) return false;
          if (call('isViewer', [], false)) return true;
          var _b = call('getCurrentUser', [], '');
          if (['מתניה', 'אליה'].indexOf(_b) !== -1) return false;            // BURN_HIDDEN (burns.ts)
          return ['אביאם', 'ניתאי', 'עידן', 'עמיחי'].indexOf(_b) !== -1;     // BURN_WRITERS (burns.ts)
        }
        // ⏱ שעות מול לקוחות (22.9, E2): עידן · עמיחי · מתניה, and the viewer reads it.
        case 'hours': {
          if (call('isViewer', [], false)) return true;
          var _u = call('getCurrentUser', [], '');
          return ['עידן', 'עמיחי', 'מתניה'].indexOf(_u) !== -1;
        }
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
      // ---- catalogs (the grounding lists the day-log parser is given) --------
      // Names only, and always the LIVE lists: an AI that is handed a stale catalog invents
      // the difference. Both are safe before their sources load — an empty list simply means
      // the parser grounds on less, never that it grounds on something wrong.
      kibbutzNames: function () {
        try {
          return (window.KIBBUTZIM || []).filter(function (r) { return r && r.name && !r.archived_at; })
            .map(function (r) { return String(r.name); });
        } catch (e) { return []; }
      },
      productNames: function () {
        try { return (call('getActiveProducts', [], []) || []).map(function (p) { return String(p && p.name || ''); }).filter(Boolean); }
        catch (e) { return []; }
      },

      emsApi: function () { return call('emsApi', Array.prototype.slice.call(arguments)); },
      isEmsConnected: function () { return !!call('isEmsConnected', [], false); },
      emsCacheData: function () { return call('emsCacheData', [], { tasks: [] }); },
      // Refresh the SHARED EMS snapshot now (spec §7k #10). `force` skips the 5-minute
      // background throttle — that is the pull-to-refresh path (app/src/lib/query.ts
      // refreshAll); called bare it is a polite nudge the throttle may decline. Resolves
      // false when there is nothing to do (not connected, throttled, or the crawl failed)
      // and NEVER rejects: a refresh gesture must not become an unhandled rejection.
      emsSync: function (force) {
        return Promise.resolve(call('emsBackgroundSync', [!!force], false)).catch(function () { return false; });
      },
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
      // ONE door to a kibbutz (round 5, package K). React KibbutzDetail when it is mounted; a queued open while its
      // lazy chunk is still landing; the legacy modal only in the pre-K-U1 era. Found by NAME equality, never by a
      // CSS selector: names carry quotes and dashes.
      openKibbutzModal: function (name, tab) {
        var key = (tab === 'visit' || tab === 'visits') ? 'visits' : 'status';
        var api = window.sigmaKibbutzDetail;
        if (api && typeof api.open === 'function') { api.open(name, key); return; }
        if (document.getElementById('sigma-kibbutz-detail')) { window._kibbutzDoorQueue = { name: name, tab: key }; return; }
        var card = Array.prototype.find.call(document.querySelectorAll('.kibbutz[data-name]'),
          function (c) { return c.dataset && c.dataset.name === name; });
        if (!card) { console.warn('[sigma] no card for', name); return; }
        call('openEditModal', [card]);
        // Map the DOOR's tab vocabulary back to the legacy one — a caller may already speak
        // 'status'/'visits' (K-U1 or a test) even in the pre-K-U1 era.
        if (tab) call('switchTab', [key === 'visits' ? 'visit' : 'meetings']);
      },
      // ➕ משימת EMS for a kibbutz (round 5, K-L4) — no modal in between. The viewer writes
      // nothing (review fix, round 5): never reaches createEmsTaskForKibbutz for that role.
      createEmsTaskFor: function (kibbutz) {
        if (call('isViewer', [], false)) return Promise.resolve();
        return Promise.resolve(call('createEmsTaskForKibbutz', [kibbutz])).catch(function (e) { console.warn('[sigma] ems create', e); });
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
      // The queue-aware write primitive behind EmsGateway's createTask/updateTask/addComment
      // (spec §7o: "the offline queue becomes a gateway concern — queued OPERATIONS replay
      // through whichever adapter is active"). `createTask` above stays as the legacy
      // shorthand; both land in the one `emsWriteOrQueue`, so the queue semantics are
      // unchanged by the gateway.
      emsWrite: function (item) { return call('emsWriteOrQueue', [item || {}], Promise.resolve({ sent: false })); },

      // `sigma.ems` — the typed EmsGateway (app/src/lib/ems/gateway.ts). NOT implemented here
      // on purpose: the React bundle INSTALLS the one instance on boot (installEmsBridge), so
      // legacy and React share a single implementation and can never drift. Undefined until
      // ui/sigma.js has evaluated — legacy callers must guard (`sigma.ems && …`).

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
      // Round 5 V-L4b: the ONE door into a visit summary, anywhere in the app — new, edit or cert.
      // Never opens the legacy form. The Field chunk is a lazy React island, so this retries for
      // 3 s (12 x 250 ms, the pattern 22-push.js's pushact=visit fallback used) before it gives up
      // with a toast, instead of ever falling back to #modalBackdrop.
      openVisitEditor: function (opts) {
        opts = opts || {};
        if (!opts.kibbutz) return false;
        var tries = 0;
        var go = function () {
          var ch = window.sigmaVisitChapters;
          if (ch && typeof ch.open === 'function') { ch.open(opts.kibbutz, opts); return; }
          if (++tries < 12) { setTimeout(go, 250); return; }
          if (window.sigma && typeof window.sigma.toast === 'function') window.sigma.toast('סיכום הביקור עוד נטען. אפשר לנסות שוב בעוד רגע.');
        };
        go();
        return true;
      },
      // Every legacy caller of the old picker/form lands here now (spec blast-radius table):
      // a kibbutz in hand → straight into the sheet; the FAB (no name) → the arrival picker.
      openVisitQuick: function (kibbutz) {
        return kibbutz
          ? window.sigma.openVisitEditor({ kibbutz: kibbutz })
          : !!(window.sigmaField && window.sigmaField.openManual && window.sigmaField.openManual());
      },
      // The snapshot rows are camelCase (`openItems`); the briefing's VisitRow reads the table's
      // `open_items`. Hand both, or "נשאר פתוח מהביקור הקודם" never reaches the next visit.
      getLastVisit: function (kibbutz) {
        var v = call('getLastVisit', [kibbutz], null);
        if (!v) return v;
        return Object.assign({}, v, { open_items: v.open_items || v.openItems || '' });
      },

      // ---- 📦 מלאי אחוד (inventory spec §1, §4b) ---------------------------------
      // The ONE pool, as `{product: qty}` — the same map js/src/08-inventory.js renders. The
      // React sheet asks for it on every open rather than keeping a copy, because the legacy
      // snapshot refreshes on its own every few seconds.
      poolStock: function () { return call('poolStockMap', [], {}); },
      // The catalog rows (name + category + active), for the product picker in 🔢 דווח שינוי.
      products: function () { return call('getActiveProducts', [], []) || []; },
      // The supplier orders a 🧾 עלייה can be booked against, and the two flows the sheet
      // routes INTO instead of writing itself (§4b): the order modal and the delivery status.
      orders: function () { try { return (window.SHEET_DATA && window.SHEET_DATA.orders) || []; } catch (e) { return []; } },
      openOrder: function (id) { return call('invEditOrder', [id]); },
      markOrderDelivered: function (id) { return call('quickOrderStatus', [id, 'delivered', null]); },
      // Re-read the shared snapshot after a write, so the pool number is right immediately.
      refreshData: function () { return call('refreshData'); },

      // 📝 יומן היום (spec §7i) — one confirmed card → one visit record, without the form.
      // The legacy `saveVisitFromData` (js/src/09-visits.js) is the form's own save path with
      // the values handed in, so the delivery-cert gate, the stock movement and the
      // `visit-saved` event all apply exactly as they do when a person types the form.
      // Resolves { ok:true, id } or { ok:false, error } — it NEVER rejects, because the caller
      // is saving several cards in a row and one bad card must not abort the rest.
      saveVisitFromData: function (visit) {
        return Promise.resolve(call('saveVisitFromData', [visit], { ok: false, error: 'שמירת ביקור אינה זמינה' }))
          .catch(function (e) { return { ok: false, error: (e && e.message) || 'השמירה נכשלה' }; });
      },
      // Post a comment on an EMS task (the day log's matched tasks; js/src/14-calendar.js).
      // Queued when there is no connection, so a comment written in the field is not lost.
      emsAddComment: function (taskId, text, meta) {
        return Promise.resolve(call('emsAddCommentTo', [taskId, text, meta], { ok: false, error: 'EMS לא זמין' }))
          .catch(function (e) { return { ok: false, error: (e && e.message) || 'שליחת העדכון נכשלה' }; });
      },

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
      // §7p chapters: the React stepper owns its own fields, so "שמור וסגור" hands the row
      // over here instead of typing into a form that is not on screen. Same stores, same
      // event — a chapters draft and a form draft are indistinguishable afterwards.
      visitDraftPut: function (row) { return call('visitDraftPut', [row], null); },
      // The PRE-MINTED visit id, so the draft, the certificate issued from it and the saved
      // visit are ONE identity from the first keystroke (js/src/09-visits.js `visitDraftId`).
      visitDraftId: function () { return call('visitDraftId', [], ''); },
      // "Is a delivery certificate already linked to this visit id?" — the number, or 0.
      certIssuedForVisit: function (visitId) {
        return Promise.resolve(call('certIssuedForVisit', [visitId], 0)).catch(function () { return 0; });
      },
      loadAllVisitsCombined: function () { return call('loadAllVisitsCombined', [], []); },
      openDeliveryCert: function (pre) { return call('openDeliveryCert', [pre || {}]); },
      certFromVisitForm: function () { return call('certFromVisitForm'); },
      certFromVisit: function (visitId) { return call('certFromVisit', [visitId]); },

      // Round 5 V-L4b: SHEET_DATA.returns as is — visitToChapters (app/src/lib/visitEdit.ts) reads
      // a filed visit's own returned-equipment rows by visitId when the sheet opens in edit/cert mode.
      visitReturnsRaw: function () {
        try { return (window.SHEET_DATA && window.SHEET_DATA.returns) || []; } catch (e) { return []; }
      },

      // ---- round 5 package V: apply the attendance plan a visit save produced ----------
      // app/src/lib/visitSave.ts builds the AttOp[] (app/src/lib/visitAttendance.ts planVisitAttendance);
      // this only carries it to the one legacy writer (js/src/04-attendance-daily.js attApplyOps).
      attApply: function (ops) {
        return Promise.resolve(call('attApplyOps', [ops], { ok: false, failed: (ops || []).length }));
      },
      // SHEET_DATA.attendance as is (source included once the loader maps it) — visitSave.ts's
      // planVisitAttendance reads the day's existing rows from here before deciding what to write.
      attRowsRaw: function () {
        try { return (window.SHEET_DATA && window.SHEET_DATA.attendance) || []; } catch (e) { return []; }
      },

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

      // ---- ⚙️ הגדרות: install + notifications (spec §7h) --------------------
      // Both live in the legacy bundle because both are BROWSER state, not app state: the
      // install prompt is an event the page must have captured before React existed, and the
      // push subscription is tied to the service worker the legacy boot registered. The
      // settings island only ASKS and RENDERS.
      isInstalled: function () { return !!call('isInstalled', [], false); },
      canInstall: function () { return !!call('canInstall', [], false); },
      appInstall: function () { return call('appInstall', [], Promise.resolve()); },
      /** 'granted' | 'denied' | 'default' | 'ios-needs-install' | 'unsupported'. */
      pushState: function () { return call('pushState', [], 'unsupported'); },
      /** Must be called from a real user gesture — a browser ignores any other request. */
      pushEnable: function () { return call('pushEnable', [], Promise.resolve('unsupported')); },
      pushTest: function () { return call('pushTest', [], Promise.resolve(false)); },
      pushDeviceCount: function () { return call('pushDeviceCount', [], Promise.resolve(0)); },
      /** 📋 הפערים: 🔔 on a person's row (עמיחי / the viewer). The server decides the words. */
      gapNag: function (person, count) { return call('gapNag', [person, count], Promise.resolve(false)); },

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
