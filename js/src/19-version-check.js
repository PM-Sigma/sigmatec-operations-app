  // ===== New-version watcher =====
  // Polls the deployed index.html for a changed `app.js?v=` stamp (bumped on every build/deploy).
  // When a newer version is live:
  //   • ACTIVE user            → non-blocking top banner "🔄 עלתה גרסה חדשה — רענן".
  //   • IDLE ≥5 min OR hidden tab → auto-reload onto the new version.
  // A plain reload keeps them logged in (EMS token lives in localStorage; reload never clears it).
  (function versionWatcher() {
    var myV = '';
    try {
      var s = document.querySelector('script[src*="js/app.js"]');
      myV = s ? (new URL(s.src, location.href).searchParams.get('v') || '') : '';
    } catch (e) { /* */ }
    if (!myV) return;   // can't determine my own version → never risk a false reload

    var IDLE_MS = 5 * 60 * 1000;   // 5 min no interaction (or hidden tab) = idle
    var POLL_MS = 2 * 60 * 1000;   // check for a new deploy every 2 min
    var lastActivity = Date.now();
    var handled = false;           // a new version was already detected → stop re-acting
    var idleWatch = null;

    ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, function () { lastActivity = Date.now(); }, { passive: true });
    });
    function isIdle() { return document.hidden || (Date.now() - lastActivity) >= IDLE_MS; }

    function reloadNow() { try { location.reload(); } catch (e) { location.href = location.href; } }
    // auto path only: during a deploy the CDN can serve new index.html to the probe but the old
    // bundle on reload → cap auto-reloads per version so an idle tab never reload-loops. The
    // banner button (user click) always reloads.
    function autoReload(ver) {
      try {
        var k = 'ver_reload_' + ver, n = parseInt(sessionStorage.getItem(k) || '0', 10);
        if (n >= 2) { showBanner(ver); return; }
        sessionStorage.setItem(k, String(n + 1));
      } catch (e) {}
      reloadNow();
    }

    function showBanner(ver) {
      if (document.getElementById('newVerBanner') || !document.body) return;
      var b = document.createElement('div');
      b.id = 'newVerBanner';
      b.innerHTML =
        '<span>🔄 עלתה גרסה חדשה' + (ver ? ' (' + ver + ')' : '') + ' — רעננו כדי לעדכן.</span>' +
        '<button id="newVerReloadBtn" type="button">רענן עכשיו</button>';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100000;background:#1e293b;color:#fff;' +
        'display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;' +
        'font:600 13px Heebo,sans-serif;padding:9px 14px;box-shadow:0 2px 10px rgba(0,0,0,.35);';
      document.body.appendChild(b);
      var btn = document.getElementById('newVerReloadBtn');
      btn.style.cssText = 'background:#22c55e;color:#04210f;border:none;border-radius:8px;padding:6px 18px;' +
        'font-weight:800;cursor:pointer;font-size:13px;';
      btn.onclick = reloadNow;
    }

    function onNewVersion(ver) {
      if (handled) return;
      handled = true;
      if (isIdle()) { autoReload(ver); return; }        // not looking / idle → just bring them to the new version
      showBanner(ver);                                  // active → let them finish, nudge to refresh
      idleWatch = setInterval(function () {              // …and if they go idle later, auto-refresh
        if (isIdle()) { clearInterval(idleWatch); autoReload(ver); }
      }, 20000);
    }

    async function check() {
      if (handled) return;
      try {
        var r = await fetch('index.html?vc=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return;
        var html = await r.text();
        var m = html.match(/js\/app\.js\?v=([A-Za-z0-9]+)/);
        var liveV = m ? m[1] : '';
        if (liveV && liveV !== myV) onNewVersion(liveV);
      } catch (e) { /* offline/transient → retry next tick */ }
    }

    setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    // debug/verify hook (no effect in normal use)
    window._verWatch = { myV: myV, check: check, showBanner: showBanner, isIdle: isIdle };
  })();
