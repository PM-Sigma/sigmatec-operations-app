  // ===== Visit Summary (Google Sheet, fallback to localStorage) =====
  const VISITS_KEY = 'kibbutzVisits_v1';

  // Mirrors the live Sheet catalog names (confirmed 2026-06-24) so offline/mock mode matches production.
  const PRODUCT_LIST = [
    'Satec EM133','Satec PM135','מונה Landis+Gyr E360PP','מונה Landis+Gyr E360SP','Landis+Gyr E360CT','Landis+Gyr E570',
    'Robustel Controller','PUSR Controller',
    'Partner Sim','Cellcom Sim',
    'כרטיס תקשורת צרוב(E350)',
    'אנטנה',
    'ספק כוח פס-דין','ספק כוח שקע',
    'משנ"ז 250','משנ"ז 400'
  ];

  // 1 full work day ≈ this many hours (for the hours statistic). ponytail: single tunable knob.
  const WORKDAY_HOURS = 8;

  // Pre-minted id for a NEW (not-yet-saved) visit — lets the delivery-cert gate link a cert
  // to this visit before saveVisit ever hits the network. Same id shape as the data layer's genId('v').
  function visitDraftId() {
    if (!window._visitDraftId) window._visitDraftId = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    return window._visitDraftId;
  }
  window.visitDraftId = visitDraftId;
  function toggleVisitWorkday() {
    const on = document.getElementById('visitWorkday').checked;
    const dur = document.getElementById('visitDuration');
    if (dur) { dur.disabled = on; dur.style.opacity = on ? '0.45' : ''; if (on) dur.value = ''; }
    syncVisitDurationChips();
  }

  // ── duration: quick chips + a יום שלם chip + the exact-hours input (spec §6, task-4 5b).
  // The chips are PURE UI: they write into #visitDuration / #visitWorkday, the two fields
  // saveVisit() has always read, so the save path and its gate test are untouched.
  function setVisitHours(h) {
    setVisitWorkday(false);
    const dur = document.getElementById('visitDuration');
    if (!dur) return;
    // Tapping the chip that is already on clears it — otherwise a wrong tap could only be
    // corrected by typing, which on a phone in the field is the worst of both worlds.
    dur.value = (parseFloat(dur.value) === h) ? '' : String(h);
    syncVisitDurationChips();
    visitDraftTouch();
  }

  /** `on` omitted = toggle. יום שלם and hours are either/or, exactly as before. */
  function setVisitWorkday(on) {
    const wd = document.getElementById('visitWorkday');
    if (!wd) return;
    wd.checked = (on === undefined) ? !wd.checked : !!on;
    toggleVisitWorkday();
    visitDraftTouch();
  }

  /** Paint the chip row from the two real fields — the only place chip state is decided. */
  function syncVisitDurationChips() {
    const wrap = document.getElementById('visitDurationChips');
    if (!wrap) return;
    const workday = !!(document.getElementById('visitWorkday') || {}).checked;
    const hours = parseFloat((document.getElementById('visitDuration') || {}).value);
    wrap.querySelectorAll('button[data-hours]').forEach(b => {
      b.classList.toggle('on', !workday && parseFloat(b.dataset.hours) === hours);
      b.disabled = workday;
    });
    const chip = document.getElementById('visitWorkdayChip');
    if (chip) chip.classList.toggle('on', workday);
  }
  window.setVisitHours = setVisitHours;
  window.setVisitWorkday = setVisitWorkday;
  window.syncVisitDurationChips = syncVisitDurationChips;

  // Combined source: Sheet visits authoritative; local visits added only if NOT already in Sheet
  function loadAllVisitsCombined() {
    const sheetVisits = (window.SHEET_DATA && window.SHEET_DATA.visits) || [];
    const localVisits = loadAllVisits();
    const sheetKeys = new Set(sheetVisits.map(v => v.kibbutz + '|' + (v.date || '').slice(0,10) + '|' + v.visitor));
    const filteredLocal = localVisits.filter(v => {
      const key = v.kibbutz + '|' + (v.date || '').slice(0,10) + '|' + v.visitor;
      return !sheetKeys.has(key);
    });
    return [...sheetVisits, ...filteredLocal];
  }

  // Renders the products checklist DYNAMICALLY based on:
  //   - the ONE company pool as the source (inventory spec §1 — no personal bags)
  //   - actual current stock in it (computed from MOVEMENTS)
  //   - + items from the visit being edited (so edit flow shows what was already supplied)
  // ── איש קשר מלווה — chips from `site_contacts`, a free name is added to them (J5) ──────────
  var _visitContacts = [];
  async function visitContactsRender(kibbutz) {
    var wrap = document.getElementById('visitContactChips'); if (!wrap) return;
    wrap.innerHTML = '';
    _visitContacts = [];
    if (!kibbutz || typeof window._sbCertGet !== 'function') return;
    try {
      var rows = await window._sbCertGet('site_contacts?select=name,role&active=eq.true&kibbutz=eq.' + encodeURIComponent(kibbutz) + '&order=name');
      _visitContacts = (rows || []).map(function (r) { return String(r.name || '').trim(); }).filter(Boolean);
    } catch (e) { _visitContacts = []; }
    visitContactChipsPaint();
  }
  function visitContactChipsPaint() {
    var wrap = document.getElementById('visitContactChips'); if (!wrap) return;
    var cur = (document.getElementById('visitContact') || {}).value || '';
    wrap.innerHTML = _visitContacts.map(function (n) {
      return '<button type="button" class="sig-chip' + (n === cur.trim() ? ' on' : '') + '" onclick="visitContactPick(\'' + jsArgEsc(n) + '\')">' + attrEsc(n) + '</button>';
    }).join('');
  }
  function visitContactPick(name) {
    var el = document.getElementById('visitContact'); if (!el) return;
    el.value = (el.value.trim() === name) ? '' : name;
    visitContactChipsPaint(); visitDraftTouch();
    var box = el.closest('.sig-frm'); if (box) box.classList.remove('sig-req-miss');
  }
  function visitContactTyped() { visitContactChipsPaint(); }
  function visitContactPersist(kibbutz, name) {
    if (!kibbutz || !name || _visitContacts.indexOf(name) !== -1) return;
    var tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : null;
    if (!tok || typeof SB_URL === 'undefined') return;
    fetch(SB_URL + '/rest/v1/site_contacts', {
      method: 'POST', headers: { apikey: SB_ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ kibbutz: kibbutz, name: name, active: true })
    }).then(function () { _visitContacts.push(name); }).catch(function () { /* next time */ });
  }
  window.visitContactsRender = visitContactsRender;
  window.visitContactPick = visitContactPick;
  window.visitContactTyped = visitContactTyped;

  // ── מוצרים נוספים — the catalog as suggestions; a name not in it can be added to it (J4) ──
  function visitCatalogNames() {
    return (typeof getActiveProducts === 'function' ? getActiveProducts() : []).map(function (p) { return p.name; });
  }
  function visitOtherProductChanged(v) {
    var list = document.getElementById('visitCatalogList');
    if (list && !list.children.length) list.innerHTML = visitCatalogNames().map(function (n) { return '<option value="' + attrEsc(n) + '">'; }).join('');
    var btn = document.getElementById('visitAddToCatalog'); if (!btn) return;
    var t = String(v || '').trim();
    var known = visitCatalogNames().some(function (n) { return n.toLowerCase() === t.toLowerCase(); });
    btn.style.display = (t.length >= 2 && !known && typeof invNewProduct === 'function') ? '' : 'none';
  }
  function visitAddOtherToCatalog() {
    var t = (document.getElementById('visitProductsOther').value || '').trim(); if (!t) return;
    invNewProduct();
    var nm = document.getElementById('invProductName'); if (nm) nm.value = t;
  }
  window.visitOtherProductChanged = visitOtherProductChanged;
  window.visitAddOtherToCatalog = visitAddOtherToCatalog;

  // ── ציוד שסופק — a GRID of tiles by category (עידן 22.9, J2) ──────────────────────────────
  // A tap picks the product (qty 1) and shows −/+/🗑 on the tile; a few seconds later the tile
  // settles to name + quantity, and another tap brings the controls back. The hidden
  // `.prod-chk` / `.prod-qty` contract is UNCHANGED: saveVisit() and the cert gate read those.
  var _tileTimers = {};
  function renderProductsForVisitor() {
    const wrap = document.getElementById('visitProducts');
    if (!wrap) return;
    const visitor = document.getElementById('visitor')?.value || '';
    const source = document.getElementById('visitSource')?.value || POOL_LOCATION;

    if (!visitor) {
      wrap.innerHTML = '<div class="sig-pl-empty">בחר תחילה את המבקר כדי לראות את מלאי החברה</div>';
      return;
    }

    const stock = (typeof computeStock === 'function') ? computeStock() : {};
    const sourceStock = stock[source] || {};

    // Edit-mode: include items already in this visit (so user can adjust)
    let editingProducts = {};
    if (window.editingVisitId) {
      const allVisits = (typeof loadAllVisitsCombined === 'function') ? loadAllVisitsCombined() : [];
      const v = allVisits.find(x => x.id === window.editingVisitId);
      if (v && Array.isArray(v.products)) {
        v.products.forEach(p => {
          const name = typeof p === 'string' ? p : p.name;
          const qty  = typeof p === 'string' ? 1 : (p.qty || 1);
          editingProducts[name] = qty;
        });
      }
    }

    const itemNames = new Set();
    Object.entries(sourceStock).filter(([_, q]) => q > 0).forEach(([p]) => itemNames.add(p));
    Object.keys(editingProducts).forEach(p => itemNames.add(p));

    if (itemNames.size === 0) {
      wrap.innerHTML = `<div class="sig-pl-empty">⚠️ ב-${source} אין כרגע מלאי. השתמש ב"מוצרים נוספים" למטה.</div>`;
      return;
    }

    // Category per product from the catalog; unknown → 'אחר'. 'מונים' first, then by name.
    const catOf = {};
    (typeof getActiveProducts === 'function' ? getActiveProducts() : []).forEach(p => { catOf[p.name] = String(p.category || '').trim(); });
    const groups = {};
    Array.from(itemNames).forEach(p => { const c = catOf[p] || 'אחר'; (groups[c] = groups[c] || []).push(p); });
    const cats = Object.keys(groups).sort((a, b) => (a === 'מונים' ? -1 : b === 'מונים' ? 1 : a === 'אחר' ? 1 : b === 'אחר' ? -1 : a.localeCompare(b, 'he')));

    const tile = p => {
      const available  = sourceStock[p] || 0;
      const usedInVisit = editingProducts[p] || 0;
      const maxAllowed = available + usedInVisit;
      const on = usedInVisit > 0;
      const qtyValue = on ? usedInVisit : '';
      const out = available === 0 && !on;
      const esc = attrEsc(p);
      const arg = jsArgEsc(p);
      return `
        <div class="sig-tile ${on ? 'on' : ''} ${out ? 'out' : ''}" data-row="${esc}" onclick="tileTap(event, '${arg}')">
          <input type="checkbox" class="prod-chk" data-product="${esc}" ${on ? 'checked' : ''} onchange="toggleProductQty(this)" hidden>
          <span class="nm">${esc}</span>
          <span class="sub">במלאי <bdi>${available}</bdi>${out ? ' · אין' : ''}</span>
          <span class="qty-badge"><bdi>${qtyValue}</bdi></span>
          <div class="sig-step" onclick="event.stopPropagation()">
            <button type="button" aria-label="פחות" onclick="stepProductQty('${arg}', -1)">−</button>
            <input type="number" class="prod-qty" data-product="${esc}" data-max="${maxAllowed}" min="1" max="${maxAllowed}" step="1" value="${qtyValue}" ${on ? '' : 'disabled'} oninput="visitDraftTouch();tileSync('${arg}')">
            <button type="button" aria-label="עוד" onclick="stepProductQty('${arg}', 1)">+</button>
            <button type="button" class="bin" aria-label="הסר" onclick="tileRemove('${arg}')">🗑</button>
          </div>
        </div>`;
    };
    wrap.innerHTML = cats.map(c => {
      const names = groups[c].slice().sort((a, b) => a.localeCompare(b, 'he'));
      return (cats.length > 1 || c !== 'אחר' ? '<div class="sig-grid-head">' + attrEsc(c) + '</div>' : '') +
        '<div class="sig-grid">' + names.map(tile).join('') + '</div>';
    }).join('');
    paintVisitCertStatus();
  }
  function tileFor(product) { return document.querySelector('.sig-tile[data-row="' + String(product).replace(/"/g, '\\"') + '"]'); }
  function tileEdit(product, on) {
    const t = tileFor(product); if (!t) return;
    t.classList.toggle('editing', !!on);
    clearTimeout(_tileTimers[product]);
    if (on) _tileTimers[product] = setTimeout(() => t.classList.remove('editing'), 3500);
  }
  function tileSync(product) {
    const t = tileFor(product); if (!t) return;
    const q = t.querySelector('.prod-qty'); const b = t.querySelector('.qty-badge bdi');
    if (b) b.textContent = q && !q.disabled ? (q.value || '') : '';
  }
  function tileTap(e, product) {
    const t = tileFor(product); if (!t) return;
    const chk = t.querySelector('.prod-chk');
    if (!chk.checked) { chk.checked = true; toggleProductQty(chk); }
    tileEdit(product, !t.classList.contains('editing'));
    tileSync(product);
  }
  function tileRemove(product) {
    const t = tileFor(product); if (!t) return;
    const chk = t.querySelector('.prod-chk');
    if (chk.checked) { chk.checked = false; toggleProductQty(chk); }
    tileEdit(product, false); tileSync(product); visitDraftTouch();
  }
  window.tileTap = tileTap; window.tileRemove = tileRemove; window.tileSync = tileSync;

  /** The visible checkbox square. Flips the real (hidden) `.prod-chk`, which owns the state. */
  function toggleProductRow(btn) {
    const row = btn.closest('.sig-pi');
    const chk = row && row.querySelector('.prod-chk');
    if (!chk) return;
    chk.checked = !chk.checked;
    toggleProductQty(chk);
  }

  /** ± on the quantity stepper. Clamps to the available stock and unchecks at zero. */
  function stepProductQty(product, delta) {
    const qty = document.querySelector('.prod-qty[data-product="' + String(product).replace(/"/g, '\\"') + '"]');
    if (!qty) return;
    const chk = document.querySelector('.prod-chk[data-product="' + String(product).replace(/"/g, '\\"') + '"]');
    const max = parseInt(qty.dataset.max);
    let n = (parseInt(qty.value) || 0) + delta;
    if (n <= 0) {
      // Stepping below 1 is how someone un-picks an item with the same thumb he picked it.
      if (chk && chk.checked) { chk.checked = false; toggleProductQty(chk); }
      return;
    }
    if (!isNaN(max) && n > max) n = max;
    if (chk && !chk.checked) { chk.checked = true; toggleProductQty(chk); }
    qty.value = String(n);
    visitDraftTouch();
    tileSync(product); tileEdit(product, true);
  }
  window.toggleProductRow = toggleProductRow;
  window.stepProductQty = stepProductQty;

  function toggleProductQty(chk) {
    const product = chk.dataset.product;
    const qtyInput = document.querySelector('.prod-qty[data-product="' + product + '"]');
    if (!qtyInput) return;
    if (chk.checked) {
      qtyInput.disabled = false;
      if (!qtyInput.value) qtyInput.value = '1';
    } else {
      qtyInput.disabled = true;
      qtyInput.value = '';
    }
    const row = chk.closest && (chk.closest('.sig-pi') || chk.closest('.sig-tile'));
    if (row) row.classList.toggle('on', chk.checked);
    if (row && row.classList.contains('sig-tile')) tileSync(product);
    paintVisitCertStatus();
    visitDraftTouch();
  }

  // Status chip next to "🚚 תעודת משלוח" in the visit form: has an issued cert been linked yet?
  // No-op (clears) when no products are checked — the gate only applies when equipment is supplied.
  async function paintVisitCertStatus() {
    const el = document.getElementById('visitCertStatus');
    const save = document.getElementById('visitSaveBtn');
    if (!el) return;
    const vid = window.editingVisitId || window._visitDraftId || '';
    const hasProducts = document.querySelectorAll('.prod-chk:checked').length > 0;
    if (!hasProducts) {
      el.innerHTML = '';
      // §7k #5: the save button only promises a certificate while equipment is actually ticked.
      if (save) save.innerHTML = '💾 שמור ביקור';
      return;
    }
    const n = vid && typeof certIssuedForVisit === 'function' ? await certIssuedForVisit(vid) : 0;
    // Both states keep a 🚚 button (review fix, minor): the pre-re-skin form had one at all
    // times, so a technician could reprint or issue a corrected certificate for a visit that
    // already has one — spec §5 rule 4 keeps reprint/reissue, and the re-skin had dropped it
    // by only showing the button while the gate was unsatisfied.
    el.innerHTML = n
      ? '<div class="sig-certchip ok">✅ תעודה <bdi>' + n + '</bdi> נופקה<span class="sp"></span>'
        + '<button type="button" onclick="certFromVisitForm()">🚚 תעודה נוספת</button></div>'
      : '<div class="sig-certchip">⚠️ סופק ציוד, טרם הופקה תעודת משלוח<span class="sp"></span>'
        + '<button type="button" onclick="certFromVisitForm()">🚚 הפק</button></div>';
    // The label states the order of operations, which is what the gate enforces anyway.
    if (save) save.innerHTML = n ? '💾 שמור ביקור' : '🚚 הפק תעודה ← שמור';
  }
  window.paintVisitCertStatus = paintVisitCertStatus;

  function loadAllVisits() {
    try {
      const raw = localStorage.getItem(VISITS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function saveAllVisits(visits) {
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  }

  function getLastVisit(kibbutzName) {
    const all = loadAllVisitsCombined().filter(v => v.kibbutz === kibbutzName);
    if (!all.length) return null;
    return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  }

  // Stash last 3 visits per kibbutz so they can be edited too
  window.currentKibbutzVisits = [];

  // Read-only "last visit report" text — shared by the visit tab and the edit tab.
  function lastVisitText(visit) {
    if (!visit) return '';
    const date = new Date(visit.date).toLocaleDateString('he-IL');
    const dur = visit.workday ? '🗓️ יום עבודה' : ('⏱️ ' + visit.duration + ' שעות');
    let text = `📅 ${date} | ${dur} | 👤 ${visit.visitor || '—'}\n`;
    if (visit.contact) text += `🤝 איש קשר: ${visit.contact}\n`;
    if (visit.products && visit.products.length) {
      const productsStr = visit.products.map(p =>
        typeof p === 'string' ? p : (p.qty && p.qty > 1 ? p.name + ' (×' + p.qty + ')' : p.name)).join(', ');
      text += `📦 מוצרים שסופקו: ${productsStr}\n`;
    }
    if (visit.productsOther) text += `📦 אחר: ${visit.productsOther}\n`;
    if (visit.summary) text += `\n${visit.summary}`;
    // §5.1b: what he left open is the part the NEXT visit has to act on, so it is called out
    // rather than folded into the summary. Old visits have none — then there is nothing to show.
    const open = visit.openItems || visit.open_items;
    if (open) text += `\n\n⚠️ נשאר פתוח:\n${open}`;
    return text;
  }

  function renderLastVisit(kibbutzName) {
    // "ביקורים אחרונים" = visits within the last ~month. Trailing 31 days from midnight —
    // avoids the setMonth() rollover bug (e.g. May 31 → "Apr 31" → May 1 collapses the window).
    const monthAgo = new Date(); monthAgo.setHours(0, 0, 0, 0); monthAgo.setDate(monthAgo.getDate() - 31);
    const allForKibbutz = loadAllVisitsCombined()
      .filter(v => v.kibbutz === kibbutzName && v.date && new Date(v.date) >= monthAgo)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    window.currentKibbutzVisits = allForKibbutz;

    const box = document.getElementById('lastVisitBox');
    const content = document.getElementById('lastVisitContent');
    const editBtn = document.getElementById('editLastVisitBtn');
    const historyWrap = document.getElementById('visitsHistoryWrap');

    if (!allForKibbutz.length) {
      box.style.display = 'none';
      return;
    }

    const last = allForKibbutz[0];
    content.textContent = lastVisitText(last);
    editBtn.style.display = last.id ? 'inline-block' : 'none';
    editBtn.dataset.visitId = last.id || '';
    const certBtn = document.getElementById('certLastVisitBtn');
    if (certBtn) certBtn.style.display = (last.id && (last.products || []).length) ? 'inline-block' : 'none';

    // Build history of older visits (up to 3 more)
    historyWrap.innerHTML = '';
    if (allForKibbutz.length > 1) {
      const olderTitle = document.createElement('div');
      olderTitle.style.cssText = 'font-weight:700;margin-top:10px;padding-top:8px;border-top:1px dashed #a7f3d0;font-size:11px;';
      olderTitle.textContent = '📚 ביקורים קודמים:';
      historyWrap.appendChild(olderTitle);
      allForKibbutz.slice(1, 4).forEach(v => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:4px 0;border-bottom:1px solid #a7f3d0;';
        const dt = new Date(v.date).toLocaleDateString('he-IL');
        row.innerHTML = `<span>📅 ${dt} · ⏱️ ${v.duration}ש · 👤 ${v.visitor || '—'}</span>` +
          (v.id ? `<span style="display:flex;gap:4px;">` +
            ((v.products || []).length ? `<button onclick="certFromVisit('${v.id}')" style="background:#1b2a4a;color:white;border:none;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:10px;font-family:inherit;">🚚</button>` : '') +
            `<button onclick="editVisit('${v.id}')" style="background:#10b981;color:white;border:none;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:10px;font-family:inherit;">✏️ ערוך</button></span>` : '<span style="color:#94a3b8;font-size:10px;">— לא ניתן לערוך</span>');
        historyWrap.appendChild(row);
      });
    }

    box.style.display = 'block';
  }

  function editLastVisit() {
    if (!window.currentKibbutzVisits.length) return;
    const last = window.currentKibbutzVisits[0];
    if (!last.id) { alert('הביקור הזה נשמר ללא ID, לא ניתן לערוך. נסה שוב אחרי שהדף סונכרן.'); return; }
    editVisit(last.id);
  }

  function editVisit(visitId) {
    const visit = window.currentKibbutzVisits.find(v => v.id === visitId);
    if (!visit) return;
    // Mark editing FIRST so renderProductsForVisitor can include the visit's items
    window.editingVisitId = visitId;
    // Pre-fill form with this visit's data
    document.getElementById('visitSummary').value = visit.summary || '';
    const oi = document.getElementById('visitOpenItems');
    if (oi) oi.value = visit.openItems || visit.open_items || '';
    document.getElementById('visitProductsOther').value = visit.productsOther || '';
    document.getElementById('visitContact').value = visit.contact || '';
    document.getElementById('visitDuration').value = visit.workday ? '' : (visit.duration || '');
    const wdEl = document.getElementById('visitWorkday');
    if (wdEl) { wdEl.checked = !!visit.workday; toggleVisitWorkday(); }
    syncVisitDurationChips();
    document.getElementById('visitor').value = visit.visitor || '';
    const d = visit.date ? new Date(visit.date) : new Date();
    document.getElementById('visitDate').value =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    // Restore returned items from visit (if any)
    visitReturnedItems = Array.isArray(visit.returnedItems) ? visit.returnedItems.slice() : [];
    renderReturnedItems();
    // Set source (auto by visitor) and re-render product list dynamically
    onVisitorChange(visit.visitor || '');
    switchTab('visit');
    paintVisitCertStatus();
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // VISIT DRAFTS — "nothing typed is ever lost" (spec §5.1c)
  //
  // The draft's id IS the pre-minted visit id (`visitDraftId()`), so the draft, a delivery
  // certificate issued from it and the saved visit all share one identity: the cert's refId
  // keeps pointing at the right visit although the visit row does not exist yet.
  //
  // Two stores, on purpose: `visit_drafts` in Supabase so the draft follows the person to
  // another device, and a localStorage MIRROR so a phone with no signal — the normal state in
  // a cowshed — loses nothing. The mirror is written first and is authoritative for the
  // resume prompt; the row is best-effort.
  //
  // Everything below is guarded with `typeof`: this module is evaluated by
  // test-visit-cert-gate.mjs inside a function scope with a fixed set of stubs, and an
  // unguarded global would turn a re-skin into a broken save path.
  // ═══════════════════════════════════════════════════════════════════════════
  // v2 = a MAP keyed by (person, kibbutz, date); v1 was one slot and is migrated on read.
  const DRAFT_MIRROR_KEY = 'visitDrafts_v2';
  const DRAFT_DEBOUNCE_MS = 800;
  let visitDraftTimer = null;

  function draftToday() {
    const el = document.getElementById('visitDate');
    const v = el && el.value;
    return v || new Date().toISOString().slice(0, 10);
  }

  /**
   * WHOSE draft is this? The LOGGED-IN person, not the value of the "מי ביקר" select.
   * They are usually the same, but not always — עידן opening אביאם's form would otherwise
   * write a draft nobody is ever offered again (caught in the browser smoke: the card chip
   * and the resume prompt both went missing). The draft belongs to whoever will come back
   * to this device; the visitor field is what he is REPORTING, and it lives in the payload.
   */
  function draftPerson() {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    if (me) return me;
    const el = document.getElementById('visitor');
    return (el && el.value) || '';
  }

  /** Everything the form holds right now. One shape, used by save AND restore. */
  function visitDraftPayload() {
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const products = [];
    document.querySelectorAll('.prod-chk:checked').forEach(chk => {
      const name = chk.dataset.product;
      const qtyEl = document.querySelector('.prod-qty[data-product="' + String(name).replace(/"/g, '\\"') + '"]');
      products.push({ name: name, qty: parseInt(qtyEl && qtyEl.value) || 1 });
    });
    const wd = document.getElementById('visitWorkday');
    return {
      kibbutz: (typeof currentKibbutz !== 'undefined' && currentKibbutz) || '',
      visitor: val('visitor'),
      source: val('visitSource'),
      date: val('visitDate'),
      duration: val('visitDuration'),
      workday: !!(wd && wd.checked),
      products: products,
      productsOther: val('visitProductsOther'),
      summary: val('visitSummary'),
      openItems: val('visitOpenItems'),
      contact: val('visitContact'),
      returnedItems: (typeof visitReturnedItems !== 'undefined' && Array.isArray(visitReturnedItems))
        ? visitReturnedItems.slice() : []
    };
  }

  /** Pure-ish: is there anything worth keeping? An untouched form must not leave a draft. */
  function visitDraftHasContent(payload) {
    if (!payload) return false;
    return !!(String(payload.summary || '').trim()
      || String(payload.openItems || '').trim()
      || String(payload.productsOther || '').trim()
      || String(payload.contact || '').trim()
      || String(payload.duration || '').trim()
      || payload.workday
      || (payload.products || []).length
      || (payload.returnedItems || []).length);
  }

  // ── the mirror is a MAP, keyed by (person, kibbutz, date) ────────────────────
  // Review fix 1: it used to be ONE slot, so starting a summary at a second kibbutz on the
  // same day silently destroyed the first one — the exact failure §5.1c exists to prevent.
  // The key is the same triple `draftState()` already models on the React side.
  function draftKey(person, kibbutz, date) {
    return [person || '', kibbutz || '', String(date || '').slice(0, 10)].join('|');
  }

  /** The whole map. A corrupt store reads as empty rather than throwing. */
  function draftMirrorAll() {
    let map = null;
    try { map = JSON.parse(localStorage.getItem(DRAFT_MIRROR_KEY) || 'null'); }
    catch (e) { map = null; }
    if (!map || typeof map !== 'object' || Array.isArray(map)) map = {};

    // One-time migration from the single-slot v1 key, so a draft someone is in the middle of
    // typing survives the upgrade instead of being the one draft this fix loses.
    try {
      const old = JSON.parse(localStorage.getItem('visitDraft_v1') || 'null');
      if (old && old.id && old.kibbutz) {
        const k = draftKey(old.person, old.kibbutz, old.date);
        if (!map[k]) map[k] = old;
        localStorage.removeItem('visitDraft_v1');
        localStorage.setItem(DRAFT_MIRROR_KEY, JSON.stringify(map));
      }
    } catch (e) { /* nothing to migrate */ }
    return map;
  }

  function draftMirrorSave(map) {
    try {
      if (map && Object.keys(map).length) localStorage.setItem(DRAFT_MIRROR_KEY, JSON.stringify(map));
      else localStorage.removeItem(DRAFT_MIRROR_KEY);
    } catch (e) { /* private mode */ }
  }

  function draftMirrorPut(row) {
    const map = draftMirrorAll();
    map[draftKey(row.person, row.kibbutz, row.date)] = row;
    draftMirrorSave(map);
  }

  /** Remove by id (the caller never has to know the key). Returns the row it dropped. */
  function draftMirrorDeleteById(id) {
    const map = draftMirrorAll();
    let gone = null;
    Object.keys(map).forEach(function (k) {
      if (map[k] && map[k].id === id) { gone = map[k]; delete map[k]; }
    });
    draftMirrorSave(map);
    return gone;
  }

  /** Rows sorted newest-first. `person` omitted = everyone on this device. */
  function draftMirrorList(person) {
    const map = draftMirrorAll();
    return Object.keys(map)
      .map(function (k) { return map[k]; })
      .filter(function (r) { return r && r.id && r.kibbutz && (!person || r.person === person); })
      .sort(function (x, y) { return String(y.updated_at || '').localeCompare(String(x.updated_at || '')); });
  }

  /**
   * Pure: merge remote rows into the mirror, NEWEST `updated_at` WINS (review fix 2).
   * Exported for the test — the rule is the whole point of the cross-device claim, and it is
   * the kind of thing that is easy to get backwards and impossible to notice by hand.
   */
  function draftMergeRows(mirror, remote) {
    const out = Object.assign({}, mirror || {});
    (remote || []).forEach(function (r) {
      if (!r || !r.id || !r.kibbutz) return;
      const k = draftKey(r.person, r.kibbutz, r.date);
      const mine = out[k];
      const newer = !mine || String(r.updated_at || '') > String(mine.updated_at || '');
      if (newer) out[k] = r;
    });
    return out;
  }
  window.draftMergeRows = draftMergeRows;

  /**
   * Pull this person's drafts from the shared table and merge them in (review fix 2 — the
   * table was write-only, so "the draft follows you to another device" was not true).
   * Silent by design: no network, no pass, no table → the mirror is already on screen.
   */
  async function visitDraftsSync() {
    const me = draftPerson();
    if (!me) return null;
    if (typeof SB_URL !== 'string' || typeof SB_ANON !== 'string' || typeof fetch !== 'function') return null;
    try {
      const tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : SB_ANON;
      const r = await fetch(SB_URL + '/rest/v1/visit_drafts?person=eq.' + encodeURIComponent(me)
        + '&select=id,person,kibbutz,date,payload,updated_at', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + tok } });
      if (!r.ok) return null;
      const rows = await r.json();
      if (!Array.isArray(rows)) return null;
      draftMirrorSave(draftMergeRows(draftMirrorAll(), rows));
      if (typeof sigmaEmit === 'function') sigmaEmit('visit-draft-changed', { synced: rows.length });
      return rows.length;
    } catch (e) { return null; }
  }
  window.visitDraftsSync = visitDraftsSync;

  /** Save the draft now (no debounce). Editing an EXISTING visit never leaves a draft —
   *  the visit itself is the record, and a draft beside it would offer to restore the past. */
  function visitDraftSave() {
    if (window.editingVisitId) return null;
    const payload = visitDraftPayload();
    if (!payload.kibbutz || !visitDraftHasContent(payload)) return null;
    const row = {
      id: visitDraftId(),
      person: draftPerson(),
      kibbutz: payload.kibbutz,
      date: draftToday(),
      payload: payload,
      updated_at: new Date().toISOString()
    };
    draftMirrorPut(row);
    // Best effort to the shared table — a failure is invisible, because the mirror already has it.
    if (typeof SHEET_API === 'string' && typeof fetch === 'function') {
      try {
        fetch(SHEET_API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'visitDraft', draft: row })
        }).catch(function () { /* offline — the mirror is the record */ });
      } catch (e) { /* no network at all */ }
    }
    if (typeof sigmaEmit === 'function') sigmaEmit('visit-draft-changed', { kibbutz: row.kibbutz, at: row.updated_at });
    return row;
  }

  /** Debounced autosave — every keystroke, 800 ms after the last one (spec §5.1c). */
  function visitDraftTouch() {
    if (window.editingVisitId) return;
    if (visitDraftTimer) clearTimeout(visitDraftTimer);
    visitDraftTimer = setTimeout(function () { visitDraftTimer = null; visitDraftSave(); }, DRAFT_DEBOUNCE_MS);
  }

  /** Flush a pending debounce immediately — tab switch, pagehide, tab hidden. */
  function visitDraftFlush() {
    if (visitDraftTimer) { clearTimeout(visitDraftTimer); visitDraftTimer = null; }
    visitDraftSave();
  }

  /**
   * Is there a draft for this kibbutz / person / day? Any argument may be omitted to widen
   * the match (the bottom-nav 🚚 asks "any draft of mine today?"), and a widened match that
   * hits several returns the NEWEST — never an arbitrary one.
   */
  function visitDraftFor(kibbutz, person, date) {
    const rows = draftMirrorList(person).filter(function (r) {
      if (kibbutz && r.kibbutz !== kibbutz) return false;
      if (date && String(r.date).slice(0, 10) !== String(date).slice(0, 10)) return false;
      return true;
    });
    return rows[0] || null;
  }

  /** Every open draft of this person's, newest first — what the resume prompt lists. */
  function visitDraftsForPerson(person) {
    return draftMirrorList(person || draftPerson());
  }

  /** Drop ONE draft. `announce` = the person pressed "התחל מחדש", so the form is cleared too. */
  // F12: התחל מחדש deletes the draft server-side too, so the button carries the wait.
  function visitDraftDiscard(id, announce, btn) {
    if (btn) setBtnLoading(btn, true, 'מוחק…');
    // With no id, discard the draft for the kibbutz the form is actually on — never "whatever
    // was stored", which with a map would be somebody else's kibbutz.
    const target = id
      || (visitDraftFor((typeof currentKibbutz !== 'undefined' && currentKibbutz) || '', draftPerson(), null) || {}).id
      || window._visitDraftId;
    const row = target ? draftMirrorDeleteById(target) : null;
    if (visitDraftTimer) { clearTimeout(visitDraftTimer); visitDraftTimer = null; }
    if (target && typeof SHEET_API === 'string' && typeof fetch === 'function') {
      try {
        fetch(SHEET_API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'visitDraftDelete', id: target })
        }).catch(function () { /* it is gone locally, which is what the person asked for */ });
      } catch (e) { /* no network */ }
    }
    if (announce) {
      ['visitSummary', 'visitOpenItems', 'visitProductsOther', 'visitContact', 'visitDuration'].forEach(function (fid) {
        const el = document.getElementById(fid);
        if (el) el.value = '';
      });
      const wd = document.getElementById('visitWorkday');
      if (wd && wd.checked) { wd.checked = false; toggleVisitWorkday(); }
      window._visitDraftId = null;
      if (typeof renderProductsForVisitor === 'function') renderProductsForVisitor();
    }
    visitDraftPromptHide();
    if (typeof sigmaEmit === 'function') sigmaEmit('visit-draft-changed', { kibbutz: row && row.kibbutz, at: null });
    if (btn) setBtnLoading(btn, false);
  }

  /** Put a draft back into the form. No id = the draft for the kibbutz on screen. */
  function visitDraftRestore(id) {
    const row = id
      ? draftMirrorList(null).find(function (r) { return r.id === id; })
      : visitDraftFor((typeof currentKibbutz !== 'undefined' && currentKibbutz) || '', draftPerson(), null);
    const d = row && row.payload;
    if (!d) { visitDraftPromptHide(); return false; }
    window._visitDraftId = row.id;                 // the pre-minted id comes back with it
    const set = (fid, v) => { const el = document.getElementById(fid); if (el && v != null) el.value = v; };
    set('visitor', d.visitor);
    if (d.visitor && typeof onVisitorChange === 'function') onVisitorChange(d.visitor);
    set('visitSource', d.source);
    set('visitDate', d.date);
    set('visitDuration', d.duration);
    set('visitProductsOther', d.productsOther);
    set('visitSummary', d.summary);
    set('visitOpenItems', d.openItems);
    set('visitContact', d.contact);
    const wd = document.getElementById('visitWorkday');
    if (wd) { wd.checked = !!d.workday; toggleVisitWorkday(); }
    if (typeof visitReturnedItems !== 'undefined' && Array.isArray(d.returnedItems)) {
      visitReturnedItems = d.returnedItems.slice();
      if (typeof renderReturnedItems === 'function') renderReturnedItems();
    }
    // The products list is rebuilt from live stock; re-tick what the draft had, clamped by
    // whatever the checkbox for that product still allows.
    if (typeof renderProductsForVisitor === 'function') renderProductsForVisitor();
    (d.products || []).forEach(function (p) {
      const sel = String(p.name).replace(/"/g, '\\"');
      const chk = document.querySelector('.prod-chk[data-product="' + sel + '"]');
      const qty = document.querySelector('.prod-qty[data-product="' + sel + '"]');
      if (!chk) return;
      chk.checked = true;
      if (typeof toggleProductQty === 'function') toggleProductQty(chk);
      if (qty) {
        const max = parseInt(qty.dataset.max);
        qty.value = String(!isNaN(max) ? Math.min(p.qty || 1, max) : (p.qty || 1));
      }
    });
    syncVisitDurationChips();
    paintVisitCertStatus();
    visitDraftPromptHide();
    if (typeof sigmaTrack === 'function') sigmaTrack('visit-draft-restored', row.kibbutz || '');
    return true;
  }

  function visitDraftPromptHide() {
    const box = document.getElementById('visitDraftPrompt');
    if (box) box.style.display = 'none';
    const more = document.getElementById('visitDraftPromptMore');
    if (more) more.innerHTML = '';
  }

  function draftTime(row) {
    const t = new Date(row && row.updated_at);
    return isNaN(t) ? '' : (String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'));
  }

  /**
   * Offer to resume. One draft → "המשך טיוטה מ-14:02". SEVERAL (review fix 1: now possible,
   * and before this fix the second one ate the first) → the prompt lists every open draft of
   * his with its kibbutz and time, so he picks instead of guessing which one comes back.
   * The copy names the time and the next step and nothing else (copy rule: no system talk).
   */
  function visitDraftPromptShow(kibbutz) {
    const box = document.getElementById('visitDraftPrompt');
    if (!box) return false;
    const me = draftPerson();
    const here = visitDraftFor(kibbutz || (typeof currentKibbutz !== 'undefined' ? currentKibbutz : ''), me, null);
    const mine = visitDraftsForPerson(me);
    const others = mine.filter(function (r) { return !here || r.id !== here.id; });
    if ((!here && !others.length) || window.editingVisitId) { visitDraftPromptHide(); return false; }

    const label = document.getElementById('visitDraftPromptText');
    if (label) {
      label.textContent = here
        ? ('המשך טיוטה מ-' + draftTime(here))
        : ('יש לך ' + mine.length + ' טיוטות פתוחות');
    }
    // The continue/discard pair only makes sense for the kibbutz on screen.
    ['visitDraftContinue', 'visitDraftRestart'].forEach(function (id) {
      const b = document.getElementById(id);
      if (b) b.style.display = here ? '' : 'none';
    });

    const more = document.getElementById('visitDraftPromptMore');
    if (more) {
      more.innerHTML = '';
      others.forEach(function (r) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.kibbutz + ' · ' + draftTime(r);
        b.onclick = function () { visitDraftRestore(r.id); };
        more.appendChild(b);
      });
    }
    box.style.display = '';
    return true;
  }

  /**
   * Save a draft that came from DATA rather than from the form's DOM (§7p chapters — the
   * React stepper in app/src/islands/Field.tsx owns its own fields, and "שמור וסגור" has to
   * persist them with no legacy form on screen). Same row shape, same two stores, same
   * event, so a chapters draft and a form draft are ONE kind of thing: either can be resumed
   * by the other, and `visitDraftFor` cannot tell them apart.
   *
   * The id is passed in (the pre-minted visit id), so the draft, the delivery certificate
   * issued from it and the visit it becomes keep one identity — exactly as visitDraftSave.
   */
  function visitDraftPut(row) {
    const r = row || {};
    if (!r.kibbutz || !r.person) return null;
    const out = {
      id: String(r.id || visitDraftId()),
      person: String(r.person),
      kibbutz: String(r.kibbutz),
      date: String(r.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      payload: r.payload || {},
      updated_at: new Date().toISOString()
    };
    draftMirrorPut(out);
    if (typeof SHEET_API === 'string' && typeof fetch === 'function') {
      try {
        fetch(SHEET_API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'visitDraft', draft: out })
        }).catch(function () { /* offline — the mirror is the record */ });
      } catch (e) { /* no network at all */ }
    }
    if (typeof sigmaEmit === 'function') sigmaEmit('visit-draft-changed', { kibbutz: out.kibbutz, at: out.updated_at });
    return out;
  }
  window.visitDraftPut = visitDraftPut;

  window.visitDraftPayload = visitDraftPayload;
  window.visitDraftHasContent = visitDraftHasContent;
  window.visitDraftSave = visitDraftSave;
  window.visitDraftTouch = visitDraftTouch;
  window.visitDraftFlush = visitDraftFlush;
  window.visitDraftFor = visitDraftFor;
  window.visitDraftsForPerson = visitDraftsForPerson;
  window.visitDraftDiscard = visitDraftDiscard;
  window.visitDraftRestore = visitDraftRestore;
  window.visitDraftPromptShow = visitDraftPromptShow;

  // A user switch changes WHOSE drafts these are, so the new person's are pulled in (review
  // fix 2). Guarded: `sigmaBus` is the bridge's, and this module is also evaluated by the
  // gate test with no bus at all.
  try {
    if (window.sigmaBus && typeof window.sigmaBus.addEventListener === 'function') {
      window.sigmaBus.addEventListener('user-changed', function () { visitDraftsSync(); });
    }
  } catch (e) { /* no bus */ }

  // Autosave triggers. Delegated on the document (the form's markup is re-rendered), and the
  // page-level ones flush a pending debounce so closing the app mid-sentence keeps it.
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('input', function (e) {
      const t = e && e.target;
      if (t && t.closest && t.closest('#tab-visit')) visitDraftTouch();
    }, true);
    document.addEventListener('change', function (e) {
      const t = e && e.target;
      if (t && t.closest && t.closest('#tab-visit')) visitDraftTouch();
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') visitDraftFlush();
    });
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', function () { visitDraftFlush(); });
  }

  // ── required fields say so IN PLACE (עידן 22.9, J6): a red star is already on the label;
  // a miss puts a thin red frame + a blink on the field's block and scrolls to the FIRST one.
  function visitRequireMiss(ids) {
    var first = null;
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      var box = el && ((typeof el.closest === 'function' && el.closest('.sig-frm')) || el.parentElement);
      if (!box || !box.classList) return;
      box.classList.add('sig-req-miss');
      if (!first) first = box;
    });
    if (first) { try { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* a bare DOM */ } }
  }
  // Typing into a marked block clears the mark. (Guarded: test-inventory-pool.mjs evaluates
  // this module against a bare `document` stub.)
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    var _reqClear = function (e) { var t = e.target; var box = t && t.closest && t.closest('.sig-req-miss'); if (box) box.classList.remove('sig-req-miss'); };
    document.addEventListener('input', _reqClear, true);
    document.addEventListener('change', _reqClear, true);
  }

  async function saveVisit(btn) {
    const workday = !!(document.getElementById('visitWorkday') && document.getElementById('visitWorkday').checked);
    // Work day = either/or with hours: stored as the ~8h equivalent so hour-stats stay correct.
    const duration = workday ? WORKDAY_HOURS : parseFloat(document.getElementById('visitDuration').value);
    const visitor = document.getElementById('visitor').value;
    const missing = [];
    if (!visitor) missing.push('visitor');
    // The date must be picked explicitly. This used to fall back to "today" further down, which
    // silently stamped the wrong day on any visit reported after the fact — the mis-dated visits we
    // then had no way to fix. Refuse instead of guessing.
    if (!document.getElementById('visitDate').value) missing.push('visitDate');
    if (!workday && (isNaN(duration) || duration <= 0)) missing.push('visitDuration');
    // איש קשר מלווה is required (עידן 22.9, J5 — "כרגע אני רוצה לחנך").
    if (!document.getElementById('visitContact').value.trim()) missing.push('visitContact');
    // QA round 2 · C3: the four REQUIRED fields are מי ביקר · משך ותאריך · מה עשיתי · איש קשר.
    // Everything else on this form is optional, and a summary with no "מה עשיתי" is not one.
    var _sum = document.getElementById('visitSummary');
    if (_sum && !_sum.value.trim()) missing.push('visitSummary');
    if (missing.length) { visitRequireMiss(missing); sigmaError('חסרים פרטים בשדות המסומנים'); return; }
    const emsIntent = readVisitEmsIntent();   // EMS status is mandatory when an open task exists
    if (emsIntent === false) return;          // validation failed → stay in the form
    if (currentKibbutz) localStorage.setItem('last_visit_kibbutz', currentKibbutz); // for the quick-visit FAB default

    // Visual: show saving state on the save button
    const saveBtn = btn || (typeof event !== 'undefined' ? event.currentTarget : null);
    setBtnLoading(saveBtn, true);

    // Collect products with quantities (clamped to available stock)
    const products = [];
    document.querySelectorAll('.prod-chk:checked').forEach(chk => {
      const product = chk.dataset.product;
      const qtyInput = document.querySelector('.prod-qty[data-product="' + product + '"]');
      let qty = parseInt(qtyInput.value) || 1;
      const maxAllowed = parseInt(qtyInput.dataset.max);
      if (!isNaN(maxAllowed) && qty > maxAllowed) qty = maxAllowed;
      products.push({ name: product, qty: qty });
    });

    // הקשחה (עידן 2026-07-15): ציוד שסופק בביקור חייב תעודת משלוח נופקה, מקושרת לביקור.
    // חדש או הוספת ציוד להיקף שלא היה — נדרש; עריכת ביקור שכבר תועד בו ציוד — לא נחסמת רטרואקטיבית.
    if (products.length) {
      const isEditingV = !!window.editingVisitId;
      const prevV = isEditingV ? (window.currentKibbutzVisits || []).find(v => v.id === window.editingVisitId) : null;
      const prevHadProducts = !!(prevV && (prevV.products || []).length);
      if (!isEditingV || !prevHadProducts) {
        const vid = window.editingVisitId || visitDraftId();
        const certNum = (typeof certIssuedForVisit === 'function') ? await certIssuedForVisit(vid) : 0;
        if (!certNum) {
          setBtnLoading(saveBtn, false);
          alert('סופק ציוד בביקור, חובה להפיק תעודת משלוח לפני שמירת הסיכום.\nלחץ על "🚚 תעודת משלוח", הפק (נדרש חיבור), וחזור לשמור.');
          return;
        }
      }
    }

    // A contact nobody knew yet is kept for next time (J5). Best effort, never blocks the save.
    try { visitContactPersist(currentKibbutz, document.getElementById('visitContact').value.trim()); } catch (e) { /* offline */ }

    const dateInput = document.getElementById('visitDate').value;   // guaranteed non-empty (validated above)
    const visitDate = new Date(dateInput + 'T12:00:00').toISOString();
    const summary = document.getElementById('visitSummary').value.trim();
    // §5.1b — "מה נשאר לי פתוח" is its own field (visits.open_items).
    const openItemsEl = document.getElementById('visitOpenItems');
    const openItems = openItemsEl ? String(openItemsEl.value || '').trim() : '';

    // Pre-edit snapshot (a DIFFERENT object from `visit` below) — used to tell a linked EMS task what
    // changed, and to know which task this visit was already reporting against.
    const prevVisit = window.editingVisitId
      ? (window.currentKibbutzVisits || []).find(v => String(v.id) === String(window.editingVisitId)) : null;
    const linkedEmsTaskId = (prevVisit && prevVisit.emsTaskId) || '';

    const visit = {
      kibbutz: currentKibbutz,
      date: visitDate,
      visitor: visitor,
      duration: duration,
      contact: document.getElementById('visitContact').value.trim(),
      products: products,
      productsOther: document.getElementById('visitProductsOther').value.trim(),
      returnedItems: visitReturnedItems.filter(r => r.name && r.qty > 0),
      summary: summary,
      openItems: openItems,
      workday: workday
    };

    // Save locally as backup
    const all = loadAllVisits();
    all.push(visit);
    saveAllVisits(all);

    // Try to save to Google Sheet (Apps Script v5.3)
    const isEditing = !!window.editingVisitId;
    const reqBody = {
      type: 'visit',
      kibbutz: visit.kibbutz,
      date: visit.date,
      visitor: visit.visitor,
      duration: visit.duration,
      contact: visit.contact,
      products: visit.products,
      productsOther: visit.productsOther,
      returnedItems: visit.returnedItems,
      summary: visit.summary,
      openItems: visit.openItems,
      workday: visit.workday,
      id: window.editingVisitId || window._visitDraftId || undefined,
      isNew: !window.editingVisitId
    };
    if (!reqBody.id) delete reqBody.id;
    // Persist WHICH EMS task this visit reported against, so a later edit knows where to push its
    // update comment. Only sent when a task was actually chosen — otherwise the key is omitted and
    // writeVisit's upsert-merge preserves the visit's existing link (see 01-data.js).
    if (emsIntent && emsIntent.taskId) reqBody.emsTaskId = emsIntent.taskId;
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(reqBody)
    }).then(r => r.json()).then(res => {
      if (res && res.ok) {
        visit.synced = true;
        saveAllVisits(loadAllVisits());

        // Patch the snapshot in place so the נוכחות report shows the corrected day IMMEDIATELY —
        // refreshData() only lands ~1.5s later and does not re-render attendance on its own.
        const savedId = window.editingVisitId || res.id || window._visitDraftId || '';
        if (savedId && window.SHEET_DATA && Array.isArray(window.SHEET_DATA.visits)) {
          const sv = window.SHEET_DATA.visits.find(x => String(x.id) === String(savedId));
          const patch = { kibbutz: visit.kibbutz, date: visit.date, visitor: visit.visitor, duration: visit.duration,
                          contact: visit.contact, products: visit.products, productsOther: visit.productsOther,
                          summary: visit.summary, workday: visit.workday };
          if (sv) Object.assign(sv, patch);
          else window.SHEET_DATA.visits.push(Object.assign({ id: String(savedId), emsTaskId: reqBody.emsTaskId || '' }, patch));
          if (reqBody.emsTaskId && sv) sv.emsTaskId = reqBody.emsTaskId;
        }
        if (document.getElementById('attendance-view') && document.getElementById('attendance-view').style.display !== 'none'
            && typeof renderAttendanceReport === 'function') renderAttendanceReport();

        // ----- Inventory movements (event-sourced) -----
        // NEW visit  → post full supply (source → kibbutz).
        // EDIT visit → post only the DELTA vs the previous products, so stock
        //              always matches reality instead of silently diverging.
        // The supply leaves the ONE company pool (inventory spec §1). The visitor is still on
        // the row — as `created_by`, which is where "who did it" belongs.
        const source = POOL_LOCATION;
        const refId = res.id || window.editingVisitId || '';
        const movementPromises = [];
        const postMovement = (product, from, to, qty, reason) => {
          if (!product || qty <= 0) return;
          movementPromises.push(fetch(SHEET_API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ type: 'movement', product, fromLocation: from, toLocation: to, quantity: qty, reason, refId, createdBy: visitor })
          }).catch(e => console.warn('Movement failed:', e)));
        };

        // Previous products (only known when editing — loaded with the visit)
        const oldMap = {};
        if (isEditing) {
          const prev = (window.currentKibbutzVisits || []).find(v => v.id === window.editingVisitId);
          (prev?.products || []).forEach(p => { oldMap[p.name] = (oldMap[p.name] || 0) + (parseInt(p.qty) || 0); });
        }
        const newMap = {};
        products.forEach(p => { newMap[p.name] = (newMap[p.name] || 0) + (parseInt(p.qty) || 0); });

        new Set([...Object.keys(oldMap), ...Object.keys(newMap)]).forEach(name => {
          const delta = (newMap[name] || 0) - (oldMap[name] || 0);
          if (delta > 0)      postMovement(name, source, currentKibbutz, delta, isEditing ? 'visit_supply_edit' : 'visit_supply');
          else if (delta < 0) postMovement(name, currentKibbutz, source, -delta, 'visit_supply_edit'); // reverse over-supply
        });

        // Returns leave the kibbutz. "↩️ למלאי" (toStock) = intact → back to the VISITING employee's
        // available stock; otherwise defective → the 'תקול' bucket (stays out of available stock).
        // Only on a new visit: edits can't reliably diff returns (not loaded with the visit).
        if (!isEditing) {
          const visitorLoc = POOL_LOCATION;   // an intact return goes back into the pool (§1)
          (visit.returnedItems || []).forEach(r => {
            if (r.toStock) postMovement(r.name, currentKibbutz, visitorLoc, parseInt(r.qty) || 0, 'return_restock');
            else postMovement(r.name, currentKibbutz, DEFECTIVE_LOCATION, parseInt(r.qty) || 0, 'return_defective');
          });
        }

        if (movementPromises.length) {
          if (typeof sigmaEmit === 'function') sigmaEmit('stock-changed', { source: 'visit', kibbutz: currentKibbutz });
          Promise.all(movementPromises).then(() => setTimeout(refreshData, 1500));
        }
        else setTimeout(refreshData, 1500);
      }
    }).catch(e => {
      console.warn('Visit save to Sheet failed (will rely on localStorage):', e);
    }).finally(() => {
      setBtnLoading(saveBtn, false);
    });

    // Clear editing flag + reset returns list
    // The draft's whole job is over the moment the visit is a record (spec §5.1c).
    try { visitDraftDiscard(reqBody.id || null, false); } catch (e) { console.warn('draft cleanup', e); }
    window.editingVisitId = null;
    window._visitDraftId = null;
    if (openItemsEl) openItemsEl.value = '';
    visitReturnedItems = [];
    renderReturnedItems();

    // NOTE: a visit report is NO LONGER appended to the kibbutz status (per request). The card already
    // shows the last visit (date + who) via applyCardLastVisit(); the full summary lives on the visit record
    // (viewable in the visit/last-visit panel), not smeared into the status text.

    closeModal({target: {id: 'modalBackdrop'}});
    const t = document.getElementById('toast');
    t.textContent = '✅ סיכום הביקור נשמר + הסטטוס עודכן';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
    if (typeof sigmaEmit === 'function') sigmaEmit('visit-saved', { kibbutz: visit.kibbutz });   // → React islands (bridge)
    if (typeof sigmaTrack === 'function') sigmaTrack('visit-saved', visit.kibbutz);   // 📈 שימוש (spec §7j)

    // Phase 2: push the summary as a comment + status to the chosen open EMS task
    // (captured in-form before the modal closed; sent live or queued if not connected).
    try { if (emsIntent && summary) pushVisitToEms(visit.kibbutz, visit, emsIntent); } catch (e) { console.warn('EMS visit push failed', e); }
    // EDIT of a visit already linked to an EMS task, with no in-form EMS intent this time (the usual
    // "just fix the date" case): still tell that task what changed. Skipped when emsIntent exists —
    // pushVisitToEms already sends the full updated summary (which carries the corrected date), so
    // this would be a duplicate comment.
    try {
      if (isEditing && linkedEmsTaskId && !emsIntent && prevVisit && typeof pushVisitEditToEms === 'function') {
        pushVisitEditToEms(linkedEmsTaskId, prevVisit, visit);
      }
    } catch (e) { console.warn('EMS visit-edit push failed', e); }
  }

  // ───────────────────────── headless save (spec §7i — 📝 יומן היום) ─────────────────────────
  // ONE card of the day log → one visit record, WITHOUT the form. `saveVisit` above is the
  // form's path: it reads the DOM, then does exactly what this does. This is the same work
  // with the values handed in instead of read off inputs, and — this is the point — the SAME
  // GATES: a visitor, an explicit date, a real duration, and the delivery-certificate rule
  // when equipment was supplied. A day log that skipped any of them would put a record in the
  // system that the form itself would have refused.
  //
  // Returns a promise of { ok:true, id } or { ok:false, error } — never throws, never alerts:
  // the caller is a React card that shows the failure on that card and keeps the others.
  async function saveVisitFromData(data) {
    const d = data || {};
    const kibbutz = String(d.kibbutz || '').trim();
    const visitor = String(d.visitor || '').trim();
    const dateStr = String(d.date || '').trim();
    const workday = !!d.workday;
    const duration = workday ? WORKDAY_HOURS : (parseFloat(d.duration) || 0);
    const products = (d.products || [])
      .map(p => ({ name: String((p && p.name) || '').trim(), qty: parseInt(p && p.qty, 10) || 1 }))
      .filter(p => p.name && p.qty > 0);

    if (!kibbutz) return { ok: false, error: 'חסר שם הקיבוץ' };
    if (!visitor) return { ok: false, error: 'חסר מי ביקר' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { ok: false, error: 'חסר תאריך הביקור' };
    if (!workday && !(duration > 0)) return { ok: false, error: 'חסר משך הביקור בשעות' };

    // The cert rule. QA round 2 · C7 moved the certificate AFTER the save for the visit-summary
    // sheet — it lands on the certificate screen the moment the visit is filed — so a caller may
    // opt out with `certAfter: true`. Every other caller (📝 יומן היום, the legacy form) keeps the
    // gate exactly as it was: equipment supplied → an issued certificate linked to this visit.
    const id = String(d.id || '') || ('v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    if (products.length && !d.certAfter) {
      const certNum = (typeof certIssuedForVisit === 'function') ? await certIssuedForVisit(id) : 0;
      if (!certNum) return { ok: false, error: 'סופק ציוד, נדרשת תעודת משלוח לפני שמירת הסיכום', needsCert: true, visitId: id };
    }

    const visit = {
      kibbutz: kibbutz,
      date: new Date(dateStr + 'T12:00:00').toISOString(),
      visitor: visitor,
      duration: duration,
      contact: String(d.contact || '').trim(),
      products: products,
      productsOther: String(d.productsOther || '').trim(),
      // C5: 🔧 ציוד שהוחזר מהקיבוץ travels with the visit (the returns tab reads it).
      returnedItems: (d.returned || d.returnedItems || [])
        .map(function (r) { return { name: String((r && r.name) || '').trim(), qty: parseInt(r && r.qty, 10) || 1, note: String((r && r.note) || '') }; })
        .filter(function (r) { return !!r.name; }),
      summary: String(d.summary || '').trim(),
      // C6: why he was there, when the summary was linked to nothing at all.
      reason: String(d.reason || '').trim(),
      openItems: String(d.openItems || '').trim(),
      workday: workday
    };

    // Local backup first — same as the form, so a failed network call still leaves the day recorded.
    try { const all = loadAllVisits(); all.push(visit); saveAllVisits(all); } catch (e) { console.warn('local visit backup', e); }

    const reqBody = {
      type: 'visit', kibbutz: visit.kibbutz, date: visit.date, visitor: visit.visitor, duration: visit.duration,
      contact: visit.contact, products: visit.products, productsOther: visit.productsOther,
      returnedItems: visit.returnedItems, summary: visit.summary, openItems: visit.openItems,
      workday: visit.workday, reason: visit.reason,
      id: id, isNew: true
    };
    if (d.emsTaskId) reqBody.emsTaskId = String(d.emsTaskId);

    let res;
    try {
      const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(reqBody) });
      res = await r.json();
    } catch (e) {
      console.warn('Visit save failed (kept locally):', e);
      return { ok: false, error: 'השמירה נכשלה, הסיכום נשמר במכשיר, נסה שוב' };
    }
    if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'השמירה נכשלה' };

    visit.synced = true;
    try { saveAllVisits(loadAllVisits()); } catch (e) {}
    const savedId = res.id || id;

    // Keep the in-memory snapshot honest immediately — the cards and the נוכחות report read it
    // long before refreshData() lands.
    try {
      if (window.SHEET_DATA && Array.isArray(window.SHEET_DATA.visits)) {
        window.SHEET_DATA.visits.push({
          id: String(savedId), emsTaskId: reqBody.emsTaskId || '',
          kibbutz: visit.kibbutz, date: visit.date, visitor: visit.visitor, duration: visit.duration,
          contact: visit.contact, products: visit.products, productsOther: visit.productsOther,
          summary: visit.summary, workday: visit.workday
        });
      }
    } catch (e) {}

    // Stock: the supply leaves the ONE company pool — the same default `onVisitorChange` puts in
    // the form's מלאי מקור picker (inventory spec §1).
    //
    // audit C #13: this read `d.source` first. `d` is the day-log PARSER's output, i.e. text a
    // model produced from what somebody dictated — so a person's name landing in `source` moved
    // stock out of a personal bag that stopped existing in §1, and the quantity simply vanished
    // from poolStock(). There is one source, and the client does not get to name it.
    const source = POOL_LOCATION;
    const moves = products.map(p => fetch(SHEET_API, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'movement', product: p.name, fromLocation: source, toLocation: kibbutz, quantity: p.qty, reason: 'visit_supply', refId: savedId, createdBy: visitor })
    }).catch(e => console.warn('Movement failed:', e)));
    if (moves.length) { try { await Promise.all(moves); } catch (e) {} }
    setTimeout(refreshData, 1500);

    if (typeof sigmaEmit === 'function') sigmaEmit('visit-saved', { kibbutz: visit.kibbutz });
    if (typeof sigmaTrack === 'function') sigmaTrack('visit-saved', visit.kibbutz, 'daylog');
    return { ok: true, id: String(savedId) };
  }
  window.saveVisitFromData = saveVisitFromData;

  // Append visit info to the kibbutz's status field in Google Sheet
  async function autoAppendVisitToStatus(kibbutzName, dateShort, visitor, summary) {
    if (!window.SHEET_DATA || !window.SHEET_DATA.tasks) return;
    const task = window.SHEET_DATA.tasks.find(t => t.name === kibbutzName);
    if (!task) return;

    const shortSummary = summary.length > 200 ? summary.slice(0, 200) + '…' : summary;
    const visitLine = '📍 ' + dateShort + ' (' + visitor + '): ' + shortSummary;
    const newStatus = task.status
      ? task.status + '\n' + visitLine
      : visitLine;

    try {
      await fetch(SHEET_API, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({
          row: task.row,
          status: newStatus,
          editor: visitor + ' (ביקור)',
          lastSeenTs: task.lastModified || ''
        })
      });
      setTimeout(refreshData, 1500);
    } catch(e) {
      console.error('Failed to append visit to status:', e);
    }
  }

  // ponytail: buildVisitsReport removed with the standalone visits report — visits are now
  // reported as part of the נוכחות PDF (downloadAttendancePDF).

  // Opens the delivery-cert / Excel tools from the נוכחות page. (Was openVisitsReportModal — the
  // visits REPORT it used to front is gone; visits now live in the נוכחות PDF.)
  function openVisitsToolsModal() {
    // Default: full previous calendar month
    const now = new Date();
    const firstOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfPrev = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 of next = last day of prev
    const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const fromInput = document.getElementById('visitsReportFrom');
    const toInput = document.getElementById('visitsReportTo');
    fromInput.value = fmt(firstOfPrev);
    toInput.value = fmt(lastOfPrev);
    fromInput.setAttribute('value', fmt(firstOfPrev));
    toInput.setAttribute('value', fmt(lastOfPrev));
    document.getElementById('visitsReportModal').classList.add('open');
  }

