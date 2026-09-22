  // ═══════════════════════════════════════════════════════════════════════════
  // THE ONE PENDING-STATE HELPER + THE ONE MODAL DISMISS OWNER
  // (task 31 fix round 3 — F1 · F4 · F7 · F8 · F10 · F15 · F20)
  //
  // Concatenated right after 00-bridge.js, so `attrEsc` exists and everything declared here
  // is in scope for every later module. Nothing in this file renders a screen; it is the
  // shared behaviour that `docs/ux-loading-patterns.md` and spec §7p say must exist once.
  // ═══════════════════════════════════════════════════════════════════════════

  // ───────────────────────── pending state (rule 6) ─────────────────────────
  // This used to live inside js/src/05-meeting-returns.js and hard-code "שומר..." for
  // approve, send, analyse and export alike (F15). It takes the label now, and it is the
  // only legacy pending idiom left.
  function setBtnLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
      if (btn.dataset.origText == null) btn.dataset.origText = btn.innerHTML;
      // The label STAYS (rule 4): a bare spinner drops the button's accessible name.
      btn.innerHTML = '<span class="btn-spinner"></span> ' + attrEsc(label || 'שומר…');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.dataset.loading = 'true';
      btn.style.opacity = '0.7';
    } else {
      if (btn.dataset.origText != null) { btn.innerHTML = btn.dataset.origText; delete btn.dataset.origText; }
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      delete btn.dataset.loading;
      btn.style.opacity = '';
    }
  }
  window.setBtnLoading = setBtnLoading;

  /**
   * Single-flight. The same button cannot start a second run while the first is in flight
   * (F7/F8 — a double-tapped nag sent two pushes, a double-tapped "כן, הפעל" subscribed
   * twice). Returns the job's promise, or `null` when the tap was refused.
   */
  function runOnce(btn, label, job) {
    if (btn && btn.dataset && btn.dataset.loading === 'true') return null;
    setBtnLoading(btn, true, label);
    var p;
    try { p = Promise.resolve(job()); }
    catch (e) { setBtnLoading(btn, false); return Promise.reject(e); }
    return p.then(
      function (v) { setBtnLoading(btn, false); return v; },
      function (e) { setBtnLoading(btn, false); throw e; }
    );
  }
  window.runOnce = runOnce;

  /**
   * `fetch` with a deadline and the app's Hebrew timeout message (rule 2). EMS reads already
   * had one (js/src/12-reports.js); the `github` edge-fn writes and `push-send` did not
   * (F6/F7).
   */
  function fetchWithTimeout(url, opts, ms) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms || 20000);
    var o = Object.assign({}, opts || {}, { signal: ctl.signal });
    return fetch(url, o).then(
      function (r) { clearTimeout(t); return r; },
      function (e) {
        clearTimeout(t);
        if (e && e.name === 'AbortError') throw new Error('תם הזמן — נסה שוב');
        throw e;
      }
    );
  }
  window.fetchWithTimeout = fetchWithTimeout;

  /** F20: a legacy failure is a Sonner error with a retry, never a blocking `alert()`. */
  function sigmaError(msg, retry) {
    var text = String(msg || 'הפעולה נכשלה');
    try {
      if (window.sigma && typeof window.sigma.toast === 'function') {
        window.sigma.toast(text, retry ? { action: { label: 'נסה שוב', onClick: retry } } : undefined);
        return;
      }
    } catch (e) { /* fall through to the console */ }
    console.warn('[sigma] ' + text);
  }
  window.sigmaError = sigmaError;

  // ═══════════════════════════════════════════════════════════════════════════
  // §7p — the ONE modal dismiss owner (F1 / F4)
  //
  // Before this there were TWO competing global Esc listeners (js/src/01-data.js closed
  // #modalBackdrop unconditionally, bypassing the skip list in 02-init-attendance.js) and a
  // dozen copy-pasted `onclick="if(event.target.id==='x') this.classList.remove('open')"`
  // backdrop handlers. Now there is ONE keydown listener and ONE delegated click listener,
  // and both ask the same three questions: blocking? busy? dirty?
  //
  //   modalGuard('emsTaskModal', isDirtyFn, { onSave, onDiscard, block })
  //
  // A dirty modal does not close — it asks "יש שינויים שלא נשמרו — לשמור / לבטל /
  // להמשיך לערוך". A clean one closes exactly as it always did.
  // ═══════════════════════════════════════════════════════════════════════════
  var MODAL_GUARDS = Object.create(null);

  /** Blocking flows: a gate, or a promise-bound question that must resolve via its buttons. */
  var MODAL_NEVER_DISMISS = {
    loginModal: 1, authGate: 1, emsLoginGate: 1, orderQModal: 1, emsReloginModal: 1,
  };

  function modalGuard(id, isDirtyFn, opts) {
    var g = { dirty: isDirtyFn || function () { return false; } };
    if (opts) { for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) g[k] = opts[k]; }
    MODAL_GUARDS[String(id)] = g;
  }
  window.modalGuard = modalGuard;

  function modalIsDirty(id) {
    var g = MODAL_GUARDS[id];
    if (!g) return false;
    try { return !!g.dirty(); } catch (e) { return false; }
  }
  window.modalIsDirty = modalIsDirty;

  /** Close without asking — what "לבטל" and a completed save both end up calling. */
  function modalForceClose(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
    modalPromptClose();
  }
  window.modalForceClose = modalForceClose;

  /**
   * The guarded dismiss: every ACCIDENTAL dismiss path goes through here (backdrop tap, Esc,
   * and a "ביטול" that would otherwise drop a draft). Returns true when it really closed.
   */
  function modalDismiss(id) {
    if (!id || MODAL_NEVER_DISMISS[id]) return false;
    var g = MODAL_GUARDS[id];
    if (g && g.block) { try { if (g.block()) return false; } catch (e) { /* not blocked */ } }
    if (modalIsDirty(id)) { modalPrompt(id); return false; }
    modalForceClose(id);
    return true;
  }
  window.modalDismiss = modalDismiss;

  // ── the three-way prompt (§7p copy, shared with app/src/lib/useUnsavedGuard.tsx) ────────
  var UNSAVED_TITLE = 'יש שינויים שלא נשמרו';
  var UNSAVED_BODY = 'יש שינויים שלא נשמרו — לשמור / לבטל / להמשיך לערוך';

  function modalPromptClose() {
    var p = document.getElementById('sigmaUnsavedPrompt');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }
  window.modalPromptClose = modalPromptClose;

  function modalPrompt(id) {
    modalPromptClose();
    var g = MODAL_GUARDS[id] || {};
    var host = document.getElementById(id);

    var wrap = document.createElement('div');
    wrap.id = 'sigmaUnsavedPrompt';
    wrap.className = 'modal-backdrop open';
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-label', UNSAVED_TITLE);
    wrap.setAttribute('data-testid', 'unsaved-guard');
    wrap.style.zIndex = '2000';

    var box = document.createElement('div');
    box.className = 'modal';
    box.style.maxWidth = '380px';
    var h = document.createElement('h3');
    h.textContent = UNSAVED_TITLE;
    var sub = document.createElement('div');
    sub.className = 'modal-sub';
    sub.textContent = UNSAVED_BODY;
    var acts = document.createElement('div');
    acts.className = 'modal-actions';
    acts.style.flexDirection = 'column';

    var mk = function (text, cls, testid, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = text;
      b.setAttribute('data-testid', testid);
      b.style.width = '100%';
      b.addEventListener('click', onClick);
      return b;
    };

    // "לשמור" is the modal's own save path: an explicit `onSave`, or the form's primary
    // button. A modal with neither gets only "להמשיך לערוך" / "לבטל" — never a button that
    // pretends to save and does nothing.
    var primary = host && host.querySelector('.modal-actions .btn-primary, .modal-actions .sig-btn.p');
    var save = g.onSave || (primary ? function () { primary.click(); } : null);
    if (save) {
      acts.appendChild(mk('לשמור', 'btn btn-primary', 'unsaved-save', function () {
        modalPromptClose();
        try { save(); } catch (e) { sigmaError(e && e.message); }
      }));
    }
    acts.appendChild(mk('להמשיך לערוך', 'btn btn-secondary', 'unsaved-keep', function () { modalPromptClose(); }));
    acts.appendChild(mk('לבטל', 'btn btn-secondary', 'unsaved-discard', function () {
      modalPromptClose();
      try { if (g.onDiscard) g.onDiscard(); } catch (e) { /* closing anyway */ }
      modalForceClose(id);
    }));

    box.appendChild(h);
    box.appendChild(sub);
    box.appendChild(acts);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
  }
  window.modalPrompt = modalPrompt;

  // ── the ONE Esc dispatcher (was two — F4) ───────────────────────────────────────────────
  /**
   * The topmost DISMISSIBLE modal: highest stacking order wins, DOM order breaks a tie.
   * Document order alone is not "topmost" — #emsTaskModal sits above #modalBackdrop on
   * screen (z-index 1160) while appearing BEFORE it in index.html, so an Esc used to close
   * the one underneath and leave the one the person was looking at.
   */
  function topmostDismissible() {
    var open = document.querySelectorAll('.modal-backdrop.open');
    var best = null, bestZ = -Infinity;
    for (var i = 0; i < open.length; i++) {
      var el = open[i];
      if (MODAL_NEVER_DISMISS[el.id]) continue;   // a gate is never the topmost dismissible one
      var z = parseInt(window.getComputedStyle(el).zIndex, 10);
      if (!isFinite(z)) z = 0;
      if (z >= bestZ) { bestZ = z; best = el; }   // >= so a later sibling wins an exact tie
    }
    return best;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.getElementById('sigmaUnsavedPrompt')) { modalPromptClose(); return; }  // Esc = "להמשיך לערוך"
    var top = topmostDismissible();
    if (top) modalDismiss(top.id);               // one layer per Esc, always
  });

  // ── every dialog has a way out (עידן 22.9 — A1/A2) ─────────────────────────────────────
  // On a phone `.modal` fills the whole backdrop (css/app.css ≤768px), so the backdrop tap the
  // dispatcher below answers has nothing to land on, and a dialog whose buttons are all
  // actions (🔥 צריבות: the meter card, the generator picker) had no exit at all. The ✕ is the
  // one exit that exists at every size. It goes through modalDismiss, so a dirty form still
  // gets the §7p question and a blocking gate still gets nothing.
  function modalEnsureClose(bd) {
    if (!bd || !bd.id || MODAL_NEVER_DISMISS[bd.id] || bd.id === 'sigmaUnsavedPrompt') return;
    var box = bd.querySelector('.modal');
    if (!box || box.querySelector('.modal-x')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'modal-x';
    b.setAttribute('aria-label', 'סגור');
    b.setAttribute('data-testid', 'modal-x');
    b.textContent = '✕';
    b.addEventListener('click', function (e) { e.stopPropagation(); modalDismiss(bd.id); });
    box.insertBefore(b, box.firstChild);
  }
  function modalEnsureCloseAll() {
    var all = document.querySelectorAll('.modal-backdrop');
    for (var i = 0; i < all.length; i++) modalEnsureClose(all[i]);
  }
  window.modalEnsureClose = modalEnsureClose;
  if (document.readyState !== 'loading') modalEnsureCloseAll();
  else document.addEventListener('DOMContentLoaded', modalEnsureCloseAll);
  // Dialogs built at runtime (the EMS queue list, a delivery-note send box) arrive later.
  try {
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'attributes' && r.target.classList && r.target.classList.contains('modal-backdrop')) modalEnsureClose(r.target);
        for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (n.classList.contains('modal-backdrop')) modalEnsureClose(n);
          else if (n.querySelectorAll) { var inner = n.querySelectorAll('.modal-backdrop'); for (var k = 0; k < inner.length; k++) modalEnsureClose(inner[k]); }
        }
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  } catch (e) { /* no MutationObserver — the static dialogs already have their ✕ */ }

  // ── the phone's Back button closes what is open, then goes back a page (A3/A7) ─────────
  // showPage() (02-init-attendance.js) pushes one history entry per page switch. Back with a
  // dialog open closes the dialog and re-arms the entry, so the page under it stays put; Back
  // with nothing open pops to the previous page instead of leaving the app.
  window.addEventListener('popstate', function (e) {
    var top = topmostDismissible();
    var sheet = document.querySelector('[data-sigma-portal] [role="dialog"][data-state="open"]');
    if (top || sheet) {
      if (top) modalDismiss(top.id);
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      try { history.pushState({ sigmaPage: window._currentPage || 'kibbutz' }, ''); } catch (err) { /* */ }
      return;
    }
    var p = e.state && e.state.sigmaPage;
    if (typeof showPage === 'function') showPage(p || 'kibbutz', { fromHistory: true });
  });

  // ── the header slides away while reading, back on the first scroll up (B1) ────────────
  // Same manners as a browser's address bar. It stays put near the top of the page and while
  // a dialog is open (the page under a dialog does not scroll).
  (function () {
    var last = 0, hidden = false;
    function set(h) { if (h === hidden) return; hidden = h; document.body.classList.toggle('hdr-hidden', h); }
    window.addEventListener('scroll', function () {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      var dy = y - last; last = y;
      if (y < 48) { set(false); return; }
      if (dy > 6) set(true); else if (dy < -6) set(false);
    }, { passive: true });
  })();

  // ── the ONE backdrop-tap dispatcher ─────────────────────────────────────────────────────
  // Replaces the per-modal inline `onclick` handlers that index.html used to carry. A tap
  // INSIDE the dialog never reaches here: its target is the `.modal`, not the backdrop.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('modal-backdrop')) return;
    if (t.id === 'sigmaUnsavedPrompt') return;   // the prompt itself is not backdrop-dismissible
    if (!t.classList.contains('open')) return;
    modalDismiss(t.id);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // The legacy half of the popup inventory (audit D, §16). Every modal below holds user
  // input, so every one of them now refuses an accidental dismiss.
  //
  // Dirtiness is read from the FIELDS rather than from per-modal state on purpose: it is one
  // rule, it cannot drift away from the markup, and a field the form adds later is covered
  // the day it is added. `defaultValue` is what the modal was opened with, so a prefilled
  // date or a preselected kibbutz is not "unsaved input".
  // ═══════════════════════════════════════════════════════════════════════════
  function modalDirtyByFields(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    var fields = el.querySelectorAll('input, textarea, select');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.disabled || f.type === 'hidden' || f.type === 'button' || f.type === 'submit') continue;
      if (f.type === 'checkbox' || f.type === 'radio') { if (f.checked !== f.defaultChecked) return true; continue; }
      if (f.tagName === 'SELECT') {
        // Only when the markup states a default. A <select> whose options carry no `selected`
        // attribute has one anyway — the browser picks the first — and reading that as an
        // edit made every modal with a plain dropdown permanently "dirty".
        var hasDefault = false;
        for (var j = 0; j < f.options.length; j++) if (f.options[j].defaultSelected) hasDefault = true;
        if (hasDefault) {
          for (var k2 = 0; k2 < f.options.length; k2++) {
            if (f.options[k2].selected !== f.options[k2].defaultSelected) return true;
          }
        }
        continue;
      }
      var now = String(f.value == null ? '' : f.value);
      var was = String(f.defaultValue == null ? '' : f.defaultValue);
      if (now !== was && now.trim() !== '') return true;
    }
    return false;
  }
  window.modalDirtyByFields = modalDirtyByFields;

  var GUARDED_INPUT_MODALS = [
    'modalBackdrop',        // סיכום ביקור / כרטיס קיבוץ — autosaved to visit_drafts, and still not silently droppable
    'attEditModal',         // עדכון נוכחות
    'emsTaskModal',         // משימה חדשה ב-EMS
    'visitQuickModal',      // ביקור מהיר
    'intakeModal',          // קליטת הזמנה
    'invOrderModal',        // הזמנה
    'invRequirementModal',  // דרישה
    'invProductModal'       // מוצר
  ];
  for (var gi = 0; gi < GUARDED_INPUT_MODALS.length; gi++) {
    (function (id) { modalGuard(id, function () { return modalDirtyByFields(id); }); })(GUARDED_INPUT_MODALS[gi]);
  }

  // הקלטה — not "dirty" but BUSY: a hot microphone must not be dismissed out from under itself.
  // (This is the condition the inline backdrop handler in index.html used to carry.)
  modalGuard('voiceModal', function () { return false; }, { block: function () { return !!window._voiceBusy; } });
