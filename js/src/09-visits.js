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

  // ── איש קשר מלווה — a name typed in the chapters sheet is added to `site_contacts` if new ──
  // The sheet's own chips (app/src/lib/visitContacts.ts useKibbutzContacts) read the table
  // directly; this is only the writer. Best effort: an unreadable list means "don't risk a
  // duplicate", never a blocked save.
  async function visitContactEnsure(kibbutz, name) {
    kibbutz = String(kibbutz || '').trim(); name = String(name || '').trim();
    if (!kibbutz || !name) return false;
    var tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : null;
    if (!tok || typeof SB_URL === 'undefined' || typeof window._sbCertGet !== 'function') return false;
    var known;
    try {
      known = ((await window._sbCertGet('site_contacts?select=name&kibbutz=eq.' + encodeURIComponent(kibbutz))) || [])
        .map(function (r) { return String((r && r.name) || '').trim(); });
    } catch (e) { return false; }
    if (known.indexOf(name) !== -1) return false;
    try {
      await fetch(SB_URL + '/rest/v1/site_contacts', {
        method: 'POST', headers: { apikey: SB_ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ kibbutz: kibbutz, name: name, active: true })
      });
      return true;
    } catch (e) { return false; }
  }
  window.visitContactEnsure = visitContactEnsure;


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
  // v3 = round 5 Phase 1 key bump (docs/superpowers/specs/2026-09-23-round-5-design.md, Phase 1): a
  // stale local v2 draft is simply ignored, never migrated forward. v2 = a MAP keyed by
  // (person, kibbutz, date); v1 was one slot and is migrated on read.
  const DRAFT_MIRROR_KEY = 'visitDrafts_v3';

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

  /** Drop ONE draft (round 5 V6/V9: ביטול on the chapters sheet, or the tab's מחיקת טיוטה). */
  function visitDraftDiscard(id, announce, btn) {
    if (btn) setBtnLoading(btn, true, 'מוחק…');
    // With no id, discard the draft for the kibbutz the form is actually on — never "whatever
    // was stored", which with a map would be somebody else's kibbutz.
    const target = id
      || (visitDraftFor((typeof currentKibbutz !== 'undefined' && currentKibbutz) || '', draftPerson(), null) || {}).id
      || window._visitDraftId;
    const row = target ? draftMirrorDeleteById(target) : null;
    if (target && typeof WRITE_ROUTER_URL === 'string' && typeof fetch === 'function') {
      try {
        fetch(WRITE_ROUTER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'visitDraftDelete', id: target })
        }).catch(function () { /* it is gone locally, which is what the person asked for */ });
      } catch (e) { /* no network */ }
    }
    if (announce) window._visitDraftId = null;
    if (typeof sigmaEmit === 'function') sigmaEmit('visit-draft-changed', { kibbutz: row && row.kibbutz, at: null });
    if (btn) setBtnLoading(btn, false);
  }

  /**
   * Save a draft that came from DATA rather than from the form's DOM (§7p chapters — the
   * React stepper in app/src/islands/Field.tsx owns its own fields — the legacy form is gone,
   * so this is the ONLY writer now (round 5, V-U3).
   *
   * The id is passed in (the pre-minted visit id), so the draft, the delivery certificate
   * issued from it and the visit it becomes keep one identity.
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
    if (typeof WRITE_ROUTER_URL === 'string' && typeof fetch === 'function') {
      try {
        fetch(WRITE_ROUTER_URL, {
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

  window.visitDraftFor = visitDraftFor;
  window.visitDraftsForPerson = visitDraftsForPerson;
  window.visitDraftDiscard = visitDraftDiscard;

  // A user switch changes WHOSE drafts these are, so the new person's are pulled in (review
  // fix 2). Guarded: `sigmaBus` is the bridge's, and this module is also evaluated by the
  // gate test with no bus at all.
  try {
    if (window.sigmaBus && typeof window.sigmaBus.addEventListener === 'function') {
      window.sigmaBus.addEventListener('user-changed', function () { visitDraftsSync(); });
    }
  } catch (e) { /* no bus */ }


  // ───────────────────────── the ONE save pipeline (spec §7i — 📝 יומן היום) ──────────────────
  // Round 5, V-U3: the legacy form's own `saveVisit(btn)` is retired — this headless save
  // (values handed in, not read off form inputs) is now the ONLY writer for a visit, called by
  // both the day log and the chapters sheet (app/src/lib/visitSave.ts). It keeps every gate the
  // form used to enforce: a visitor, an explicit date, a real duration, and the
  // delivery-certificate rule when equipment was supplied.
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
    // Idempotency (visit-summary chain spec 23.9): an id that is ALREADY a filed visit is an
    // edit or a retry, never a second visit. Stock then moves by the delta only, returns are not
    // re-inserted, and a linked EMS task gets the "what changed" note instead of a second summary.
    const prior = ((window.SHEET_DATA && window.SHEET_DATA.visits) || []).find(v => v && String(v.id) === id) || null;
    const isEdit = !!prior;

    // Round 5, grill round 5 answers (binding): everything dated August 2026 or earlier is read-only; a record
    // locks on the 10th of the month after it (app/src/lib/editLock.ts; mirrored here as visitEditLocked,
    // 00-consts.js; enforced again by db/visit_edit_lock_trigger.sql). Blocked before any network call — an
    // edit AND a new entry backdated into a locked month are both refused, exactly like the DB trigger's
    // coalesce(new.date, old.date) check.
    if (typeof visitEditLocked === 'function' && (visitEditLocked(dateStr) || (isEdit && visitEditLocked(String((prior && prior.date) || ''))))) {
      return { ok: false, error: 'הביקור נעול לעריכה — התאריך כבר לא ניתן לשינוי', locked: true };
    }

    if (products.length && !d.certAfter && !isEdit) {
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
      id: id, isNew: !isEdit
    };
    // Returns are rows of their own (writeVisit inserts them) — sending them again on an edit or a
    // retry would book the same returned meter twice.
    if (isEdit) reqBody.returnedItems = [];
    // Every EMS task this summary reports on. `emsTaskIds` is the chapters sheet's multi-select
    // (round 2 · C6); `emsTaskId` alone is the day log's single match. The first is the visit's link.
    const emsIds = [];
    [].concat(d.emsTaskIds || [], d.emsTaskId ? [d.emsTaskId] : []).forEach(function (t) {
      const s = String(t || '').trim(); if (s && emsIds.indexOf(s) === -1) emsIds.push(s);
    });
    if (emsIds.length) reqBody.emsTaskId = emsIds[0];

    let res;
    try {
      const r = await fetch(WRITE_ROUTER_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(reqBody) });
      res = await r.json();
    } catch (e) {
      console.warn('Visit save failed (kept locally):', e);
      return { ok: false, error: 'השמירה נכשלה, הסיכום נשמר במכשיר, נסה שוב' };
    }
    if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'השמירה נכשלה' };

    visit.synced = true;
    try { saveAllVisits(loadAllVisits()); } catch (e) {}
    const savedId = res.id || id;

    // Keep the in-memory snapshot honest immediately — the cards, the נוכחות report (field days
    // are DERIVED from these rows, attendance.ts withVisitDays) and the next briefing's "נשאר
    // פתוח" read it long before refreshData() lands. An edit patches its row in place.
    const priorSnap = prior ? JSON.parse(JSON.stringify(prior)) : null;
    try {
      if (window.SHEET_DATA && Array.isArray(window.SHEET_DATA.visits)) {
        const patch = {
          kibbutz: visit.kibbutz, date: visit.date, visitor: visit.visitor, duration: visit.duration,
          contact: visit.contact, products: visit.products, productsOther: visit.productsOther,
          summary: visit.summary, openItems: visit.openItems, reason: visit.reason, workday: visit.workday
        };
        if (prior) { Object.assign(prior, patch); if (reqBody.emsTaskId) prior.emsTaskId = reqBody.emsTaskId; }
        else window.SHEET_DATA.visits.push(Object.assign({ id: String(savedId), emsTaskId: reqBody.emsTaskId || '' }, patch));
      }
    } catch (e) {}

    // איש קשר מלווה who is new to this kibbutz joins its contacts (round 1 · J5), like the form.
    if (visit.contact) { try { visitContactEnsure(kibbutz, visit.contact); } catch (e) { /* offline */ } }

    // Stock: the supply leaves the ONE company pool — the same default `onVisitorChange` puts in
    // the form's מלאי מקור picker (inventory spec §1).
    //
    // audit C #13: this read `d.source` first. `d` is the day-log PARSER's output, i.e. text a
    // model produced from what somebody dictated — so a person's name landing in `source` moved
    // stock out of a personal bag that stopped existing in §1, and the quantity simply vanished
    // from poolStock(). There is one source, and the client does not get to name it.
    const source = POOL_LOCATION;
    // New visit → the full supply. Edit / retry → only the delta against what was filed, so
    // saving the same visit twice never takes the meters off the pool twice.
    //
    // Round 5 V20: priorSnap.products (the visit's own filed row) is the OLD-quantity source, edited
    // once or many times, before or after the inventory breakpoint — it is never touched by the
    // movement archival (2.29), so it is always accurate. (Opus audit: an earlier version of this
    // diffed a pre-breakpoint edit against an archive.movements_pre_breakpoint RPC instead, reasoning
    // the live ledger no longer had the visit's original movement. That RPC always netted to 0 for
    // real archived data — every visit_supply there runs a personal bag → kibbutz, never from חברה —
    // so it silently double-posted the whole new quantity as a fresh addition. Removed entirely;
    // db/archive_pre_breakpoint_rpc.sql is deleted and the archive schema is not read from here.)
    const oldMap = {}, newMap = {};
    ((priorSnap && priorSnap.products) || []).forEach(p => { const n = (p && p.name) || p; oldMap[n] = (oldMap[n] || 0) + (parseInt(p && p.qty, 10) || 0); });
    products.forEach(p => { newMap[p.name] = (newMap[p.name] || 0) + p.qty; });
    const moves = [];
    const move = (product, from, to, qty, why) => moves.push(fetch(WRITE_ROUTER_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'movement', product: product, fromLocation: from, toLocation: to, quantity: qty, reason: why, refId: savedId, createdBy: visitor })
    }).catch(e => console.warn('Movement failed:', e)));
    new Set([...Object.keys(oldMap), ...Object.keys(newMap)]).forEach(name => {
      const delta = (newMap[name] || 0) - (oldMap[name] || 0);
      if (delta > 0) move(name, source, kibbutz, delta, isEdit ? 'visit_supply_edit' : 'visit_supply');
      else if (delta < 0) move(name, kibbutz, source, -delta, 'visit_supply_edit');
    });
    if (moves.length) {
      try { await Promise.all(moves); } catch (e) {}
      if (typeof sigmaEmit === 'function') sigmaEmit('stock-changed', { source: 'visit', kibbutz: kibbutz });
    }
    setTimeout(refreshData, 1500);

    // EMS (round 2 · C6): the summary is a COMMENT on every selected task — the same writer the
    // legacy form uses (pushVisitToEms → emsWriteOrQueue, so no connection means "sent later").
    // Only on `emsComment`: the day log posts its own per-task sentence and must not get two.
    // On an edit, the task the visit was already reporting on gets the "what changed" note.
    if (d.emsComment) {
      try {
        const linked = String((priorSnap && priorSnap.emsTaskId) || '');
        if (isEdit && linked && typeof pushVisitEditToEms === 'function') pushVisitEditToEms(linked, priorSnap, visit);
        if (visit.summary && typeof pushVisitToEms === 'function') {
          emsIds.filter(t => !(isEdit && t === linked)).forEach(t => { pushVisitToEms(kibbutz, visit, { taskId: t }); });
        }
      } catch (e) { console.warn('EMS visit push failed', e); }
    }

    if (typeof sigmaEmit === 'function') sigmaEmit('visit-saved', { kibbutz: visit.kibbutz });
    // V23 (visit-summary chain audit fix): the chapters sheet sends `via: 'chapters'`; every other caller
    // (📝 יומן היום, a future caller) keeps today's 'daylog' label by omitting it.
    if (typeof sigmaTrack === 'function') sigmaTrack('visit-saved', visit.kibbutz, d.via || 'daylog');
    return { ok: true, id: String(savedId), edited: isEdit };
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
      await fetch(WRITE_ROUTER_URL, {
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

