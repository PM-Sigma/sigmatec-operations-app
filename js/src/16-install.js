  // ═══════════════════════════════════════════════════════════════════════════
  // "Add to Home Screen" install button.
  // Android/desktop Chrome: captures beforeinstallprompt → native install dialog.
  // iOS Safari (no install API): shows the Share → "הוסף למסך הבית" steps.
  // Hidden when already installed (running standalone — no address bar there anyway).
  // ═══════════════════════════════════════════════════════════════════════════
  (function setupInstall() {
    var btn = document.getElementById('installBtn');
    if (!btn) return;
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    if (standalone) { btn.style.display = 'none'; return; }   // already an installed app
    var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    var deferred = null;
    btn.style.display = '';   // visible whenever not yet installed
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
    window.addEventListener('appinstalled', function () { btn.style.display = 'none'; deferred = null; });
    window.appInstall = async function () {
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (e) {}
        deferred = null; btn.style.display = 'none';
        return;
      }
      if (isIos) {
        alert('להתקנה באייפון (Safari):\n\n1. הקש על כפתור השיתוף ⬆️ בתחתית המסך\n2. גלול ובחר "הוסף למסך הבית"\n3. הקש "הוסף"');
        return;
      }
      alert('להתקנה:\n\nפתח את תפריט הדפדפן (⋮) ובחר "התקן אפליקציה" / "הוסף למסך הבית".\n(אם כבר מותקנת — פתח אותה מהאייקון במסך הבית.)');
    };
  })();
