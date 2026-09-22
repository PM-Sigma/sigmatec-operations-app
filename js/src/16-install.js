  // ═══════════════════════════════════════════════════════════════════════════
  // "Add to Home Screen" install button.
  // Android/desktop Chrome: captures beforeinstallprompt → native install dialog.
  // iOS Safari (no install API): shows the Share → "הוסף למסך הבית" steps.
  // Hidden when already installed (running standalone — no address bar there anyway).
  //
  // ⚙️ הגדרות (spec §7h) reads this through the bridge, so the three globals below are
  // ALWAYS defined — even on a page with no #installBtn and even inside an installed app.
  // The settings row needs to know which of the three states to show ("כבר מותקנת" /
  // "התקן" / the iOS steps), and an undefined function would leave it guessing.
  // ═══════════════════════════════════════════════════════════════════════════
  (function setupInstall() {
    var btn = document.getElementById('installBtn');
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    var deferred = null;
    var installed = standalone;

    if (btn) btn.style.display = standalone ? 'none' : '';   // visible whenever not yet installed
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
    window.addEventListener('appinstalled', function () {
      installed = true; deferred = null;
      if (btn) btn.style.display = 'none';
    });

    /** Already running as an installed app — there is nothing to offer. */
    window.isInstalled = function () { return !!installed; };
    /**
     * Can this device install at all? The native prompt if the browser offered one, and iOS,
     * where the steps are the install. Everything else can only be told where the menu is.
     */
    window.canInstall = function () { return !installed && (!!deferred || isIos); };

    window.appInstall = async function () {
      if (installed) return;
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (e) {}
        deferred = null; if (btn) btn.style.display = 'none';
        return;
      }
      if (isIos) {
        alert('להתקנה באייפון (Safari):\n\n1. הקש על כפתור השיתוף ⬆️ בתחתית המסך\n2. גלול ובחר "הוסף למסך הבית"\n3. הקש "הוסף"');
        return;
      }
      alert('להתקנה:\n\nפתח את תפריט הדפדפן (⋮) ובחר "התקן אפליקציה" / "הוסף למסך הבית".\n(אם כבר מותקנת, פתח אותה מהאייקון במסך הבית.)');
    };
  })();
