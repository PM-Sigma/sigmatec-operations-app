// ISO timestamp — מתעדכן בכל פוש
  const LAST_UPDATED = '2026-06-11T10:00';

  function renderLastUpdated(isoStr) {
    const d = new Date(isoStr || LAST_UPDATED);
    const date = d.toLocaleDateString('he-IL');
    const time = d.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
    document.getElementById('lastUpdated').textContent = '📅 עודכן: ' + date + ' · ' + time;
  }
  renderLastUpdated();

  function maxLastModified(data) {
    let max = null;
    (data.tasks || []).forEach(t => {
      if (t.lastModified && (!max || t.lastModified > max)) max = t.lastModified;
    });
    return max;
  }

  let currentFilter = 'all';
  let currentKibbutz = '';

  function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    applyFilters();
  }

  function applyFilters() {
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    document.querySelectorAll('.kibbutz').forEach(card => {
      const name = (card.dataset.name || '').toLowerCase();
      const types = (card.dataset.types || '').split(' ');
      const region = (card.dataset.region || '').toLowerCase();
      // Build full haystack: name + region + all visible text inside the card
      let haystack = name + ' ' + region + ' ' + (card.textContent || '').toLowerCase();

      const matchSearch = !search || haystack.includes(search);
      // When user types in search, ignore category filter (better UX)
      const matchFilter = search ? true : (currentFilter === 'all' || types.includes(currentFilter));
      card.classList.toggle('hidden', !(matchSearch && matchFilter));
    });

    // Hide empty sections when filtering/searching
    document.querySelectorAll('.section').forEach(section => {
      const cards = section.querySelectorAll('.kibbutz:not(.hidden)');
      section.style.display = (search || currentFilter !== 'all') && cards.length === 0 ? 'none' : '';
    });
  }

  function toggleCompactMode() {
    document.body.classList.toggle('compact');
    const isCompact = document.body.classList.contains('compact');
    const btn = document.getElementById('compactToggle');
    if (btn) {
      btn.classList.toggle('active', isCompact);
      btn.textContent = isCompact ? '🖥 תצוגה מלאה' : '📱 תצוגה מצומצמת';
    }
  }

  // Auto-compact ONLY on mobile (no localStorage persistence — fresh each session per device)
  if (window.innerWidth < 768) {
    document.body.classList.add('compact');
    const btn = document.getElementById('compactToggle');
    if (btn) { btn.classList.add('active'); btn.textContent = '🖥 תצוגה מלאה'; }
  }

  function toggleSection(header) {
    header.parentElement.classList.toggle('collapsed');
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const btn = document.getElementById('copyBtn');
      btn.textContent = '✅ הועתק!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '📋 העתק קישור';
        btn.classList.remove('copied');
      }, 2000);
    });
  }

  document.querySelectorAll('.kibbutz').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      currentKibbutz = card.dataset.name;
      if (typeof prepModalEmsSection === 'function') prepModalEmsSection(currentKibbutz);   // open EMS task / create-new, below status
      const _ct = (window.SHEET_DATA && window.SHEET_DATA.tasks || []).find(t => t.name === currentKibbutz);
      const _cu = lastUpdateText(_ct);
      document.getElementById('modalSub').textContent = 'קיבוץ: ' + currentKibbutz + (_cu ? ' · ' + _cu : '');
      document.getElementById('modalBackdrop').classList.add('open');
    });
  });

  function closeModal(e) {
    if (e && e.target && e.target.id !== 'modalBackdrop') return;
    document.getElementById('modalBackdrop').classList.remove('open');
  }

  // ponytail: "💬 הערה" tab removed per request — sendComment/toggleCustomName deleted with it.

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal({target: {id: 'modalBackdrop'}});
  });

  // Customer code mapping + data flow check
  const CUSTOMER_CODES = {
    'משמר השרון': 926, 'תל קציר': 927, 'כפר גלעדי': 906, 'גניגר': 953,
    'גבים': 974, 'מעוז חיים': 948, 'אפיקים': 903, 'גברעם': 934,
    'עין המפרץ': 957, 'אלונים': 959, 'אור הנר': 915, 'מתחם חינוך שער הנגב': 950,
    'שדה אליהו': 951, 'קיבוץ גת': 964, 'מעלה גלבוע': 911, 'גבעת חיים מאוחד': 971,
    'גבת': 960, 'יגור': 940, 'חוקוק': 966, 'כנרת': 941, 'דגניה': 980,
    'עין השופט': 944, 'בית זרע': 975, 'עין חרוד מאוחד': 979,
    'אלומות': 895, 'אפיק': 896, 'חוצות יגור': 972, 'שלוחות': 973,
    'אגודת המים עמק הירדן': 907, 'כפר מסריק': 947, 'להב': 976,
    'קבוצת יבנה': 937, 'שער הגולן': 902, 'בית אריזה גלבוע': 956,
    'כפר מנחם': 961, 'לביא': 968, 'מגן': 935, 'משואות יצחק': 900,
    'פרחי אביב': 930, 'קיבוץ ניצנים': 910, 'כפר דניאל': 977
  };
  const DATA_FLOWING = new Set([926, 951, 927, 946, 957, 911, 950, 919, 915, 964, 959, 934, 974, 906, 971, 975, 948, 953, 903, 944, 940]);

  function injectCustomerCodes() {
    const urgent = new Map();
    document.querySelectorAll('.kibbutz').forEach(card => {
      const name = card.dataset.name;
      const code = CUSTOMER_CODES[name];
      const isDone = (card.dataset.types || '').split(' ').includes('done');

      const meta = card.querySelector('.kibbutz-meta');
      if (meta && !meta.querySelector('.code-badge')) {
        const badge = document.createElement('span');
        badge.className = 'code-badge';
        badge.textContent = code ? '#' + code : '⚠️ אין קוד';
        meta.appendChild(badge);
      }

      // Note: urgent-flag is now redundant with the procedure button.
      // The proc-btn (red pending / green done) is the single source of truth
      // for "data flow active or not" — same concept per user spec.
    });

    if (urgent.size > 0) {
      const alertEl = document.getElementById('urgentAlert');
      alertEl.style.display = 'block';
      const items = [...urgent.entries()].map(([n, c]) =>
        '<strong>' + n + '</strong> <span class="code-badge">' + (typeof c === 'number' ? '#' + c : c) + '</span>'
      ).join(' &nbsp;·&nbsp; ');
      document.getElementById('urgentList').innerHTML = items;
      document.getElementById('urgentCount').textContent = urgent.size;
    }
  }

  window.addEventListener('load', injectCustomerCodes);

  // 12 setup steps stepper
  const STEPS = [
    'הקמת אתר ופרטי המחלק',
    'הקמת מונים',
    'הקמת לקוחות',
    'השלמת פרטי לקוחות ותעריפים',
    'הקמת שיוכים לקוחות/מונים',
    'הקמת מערכות סולאריות',
    'השלמת פרטי מערכות',
    'הקמת שיוכים מערכות/מונים',
    'הקמת תבנית אקסל מותאמת אישית',
    'הקמת משתמשים ושליחת הזמנות',
    'ווידוא פרטי מחלק (אייקון + מס׳ חוזה סולארי)',
    'תיאום הדרכה',
    'חיבור תקשורת / פתיחת זרימת נתונים',
    'בדיקת חשבונות'
  ];
  const TOTAL_STEPS = 14;

  function injectSteppers() {
    document.querySelectorAll('.kibbutz').forEach(card => {
      const types = (card.dataset.types || '').split(' ');
      let currentStep = parseInt(card.dataset.step);
      if (isNaN(currentStep)) {
        if (types.includes('done')) currentStep = TOTAL_STEPS + 1;
        else if (types.includes('priority') || types.includes('dev')) currentStep = 3;
        else return;
      }
      // Finished kibbutz (live / "done" / reached the final step) → hide the whole setup
      // progression (stepper + current-step label). No need to re-show steps. Notes kept.
      if (types.includes('done') || currentStep > TOTAL_STEPS) {
        card.querySelectorAll('.stepper, .current-step-label').forEach(e => e.remove());
        return;
      }
      if (card.querySelector('.stepper')) return;
      const stepper = document.createElement('div');
      stepper.className = 'stepper';
      let html = '';
      for (let i = 1; i <= TOTAL_STEPS; i++) {
        let cls = 'step';
        if (i < currentStep) cls += ' done';
        else if (i === currentStep) cls += ' current';
        html += '<div class="' + cls + '" title="' + i + '. ' + STEPS[i-1] + '">' + i + '</div>';
      }
      stepper.innerHTML = html;
      card.appendChild(stepper);

      const label = document.createElement('div');
      if (currentStep > TOTAL_STEPS) {
        label.className = 'current-step-label complete';
        label.textContent = '✅ כל ' + TOTAL_STEPS + ' השלבים הושלמו';
      } else {
        label.className = 'current-step-label';
        label.textContent = '🟠 שלב נוכחי: ' + currentStep + '. ' + STEPS[currentStep-1];
      }
      card.appendChild(label);
    });
  }

  window.addEventListener('load', injectSteppers);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('stepsModal').classList.remove('open');
      document.getElementById('sidePanel').classList.remove('open');
    }
  });

  // ========================================
  // Google Sheets integration
  // ========================================

  const SHEET_API = 'https://script.google.com/macros/s/AKfycbwUZTz-T9zoK3GnPNqwaJIKpJFTv3MGmYy_rfEYV8nz95kJJRx8s4VUN_-bMco2qTci/exec'; // v5.9 deployment (returns status + attendance note + visit workday)

  // ═══════════════════════════════════════════════════════════════════════════
  // 🧪 MOCK MODE — local sandbox (Phase 0). ACTIVE ONLY on file:// / localhost /
  // 127.0.0.1 (host-gated, see below — there is NO ?mock= query path on purpose).
  // On gist.githack.com it is completely INERT (real backends used), so this block
  // is safe to keep in the deployed file.
  // It wraps window.fetch and intercepts EVERY fetch(SHEET_API, …) — that single
  // endpoint carries the Google-Sheet read/writes AND the EMS proxy — returning
  // in-memory fixtures. Nothing leaves the browser; production is never touched.
  // ═══════════════════════════════════════════════════════════════════════════
  // Mock is allowed ONLY on a local host (file:// or localhost / 127.0.0.1). On the
  // public gist host it is ALWAYS off — so a forwarded "?mock=1" link can NEVER turn
  // a real user into a silent sandbox. Locally it is on by default.
  const _isLocalHost = (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const MOCK_MODE = _isLocalHost;
  if (MOCK_MODE) (function setupMockLayer() {
    const nowISO = () => new Date().toISOString();
    const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
    let _seq = 100;
    const nextId = (p) => p + '-' + (++_seq);

    // ---- EMS fixtures (all users are ADMIN → everyone sees all tasks) ----
    // Real EMS site UUIDs (from the prod reconciliation) so KIBBUTZ_SITE_MAP resolves
    // correctly in local tests. שדה אליהו has TWO sites (main + חקלאות) → tests the merge.
    const SID = {
      yagur:   'ebb4306f-d289-422a-b3cb-ce3e8ee68bdc',
      dganya:  'cc079fe9-5f00-4a3d-a654-707207d831db',
      hukok:   'd1bdff7a-82c2-46d1-92f1-96ab0679911e',
      gvat:    'ed86a5b9-ae41-4317-942e-f42b0ba44aba',
      sde:     '3f91ccf9-67ae-4420-bf30-b7ea57ad16b2',
      sdeAgri: '14a28537-15a6-4860-8a57-410d9cbf738c'
    };
    const M = {
      sites: [
        { id: SID.yagur,   name: 'יגור' },
        { id: SID.dganya,  name: 'דגניה' },
        { id: SID.hukok,   name: 'חוקוק' },
        { id: SID.gvat,    name: 'גבת' },
        { id: SID.sde,     name: 'שדה אליהו' },
        { id: SID.sdeAgri, name: 'שדה אליהו - חקלאות' }
      ],
      users: [
        { id: 'u-idan',   firstName: 'עידן',  lastName: '',       email: 'idan@example.com',  role: 'admin', status: 'active' },
        { id: 'u-aviam',  firstName: 'אביאם', lastName: '',       email: 'aviam@example.com', role: 'admin', status: 'active' },
        { id: 'u-nitai',  firstName: 'ניתאי', lastName: '',       email: 'nitai@example.com', role: 'admin', status: 'active' }
      ],
      tasks: [
        { id: 'task-1', title: 'תקלת תקשורת בבקר', type: 'fixing_fault',     priority: 'high',   status: 'in_progress',        site: { id: SID.yagur,   name: 'יגור' },   assignee: null, expectedCompletionDate: addDays(3),  description: 'הבקר לא מדווח נתונים מאתמול בלילה.' },
        { id: 'task-2', title: 'אספקת 12 מונים',   type: 'supplying_meters', priority: 'urgent', status: 'new',                site: { id: SID.dganya,  name: 'דגניה' },  assignee: null, expectedCompletionDate: addDays(-2), description: 'מתואם מול חשמלאי הקיבוץ.' },
        { id: 'task-3', title: 'התקנה הושלמה',     type: 'supplying_meters', priority: 'normal', status: 'done',               site: { id: SID.hukok,   name: 'חוקוק' },  assignee: null, expectedCompletionDate: addDays(-10), description: '' },
        { id: 'task-4', title: 'ממתין לאישור לקוח', type: 'other',           priority: 'normal', status: 'waiting_for_client', site: { id: SID.yagur,   name: 'יגור' },   assignee: null, expectedCompletionDate: addDays(7),  description: 'נשלחה הצעת מחיר.' },
        { id: 'task-5', title: 'בדיקת זרימת נתונים', type: 'other',          priority: 'low',    status: 'new',                site: { id: SID.gvat,    name: 'גבת' },   assignee: null, expectedCompletionDate: '',          description: '' },
        { id: 'task-6', title: 'תקלה בחלקת החקלאות', type: 'fixing_fault',    priority: 'high',   status: 'new',                site: { id: SID.sdeAgri, name: 'שדה אליהו - חקלאות' }, assignee: null, expectedCompletionDate: addDays(5), description: 'משויך לתת-אתר החקלאות — אמור להופיע תחת כרטיס "שדה אליהו".' }
      ],
      comments: {
        'task-1': [
          { id: 'c-1', message: 'בדקתי מול הספק — נראה שצריך החלפת אנטנה.', author: { id: 'u-aviam', firstName: 'אביאם', lastName: '' }, createdAt: addDays(-1) },
          { id: 'c-2', message: 'מתואם ביקור ליום חמישי.', author: { id: 'u-idan', firstName: 'עידן', lastName: '' }, createdAt: addDays(-1) }
        ],
        'task-2': [
          { id: 'c-3', message: 'המונים בדרך מהמחסן.', author: { id: 'u-nitai', firstName: 'ניתאי', lastName: '' }, createdAt: addDays(-3) }
        ]
      },
      queue: [],       // outbound queue (EMS_QUEUE) — pending EMS writes made offline
      cacheStore: null // shared snapshot (EMS_CACHE) — seeded below
    };
    window.__MOCK = M;   // exposed for console inspection

    const CLOSED = ['done', 'rejected', 'not_relevant', 'cancelled'];
    const slimTask = t => ({ id:t.id, title:t.title, status:t.status, priority:t.priority, type:t.type,
      site: t.site ? { id:t.site.id, name:t.site.name } : null, expectedCompletionDate: t.expectedCompletionDate || '',
      assignee: t.assignee ? { id:t.assignee.id, firstName:t.assignee.firstName, lastName:t.assignee.lastName } : null });
    // Seed the shared cache as if עידן had already synced — so field users see tasks offline.
    M.cacheStore = { syncedAt: nowISO(), syncedBy: 'עידן (mock)', tasks: M.tasks.filter(t => CLOSED.indexOf(t.status) === -1).map(slimTask) };

    // ---- mock Google-Sheet data (kibbutz cards) ----
    function mockSheetData() {
      return {
        tasks: [
          { name: 'יגור',     row: 2, region: 'עמק יזרעאל', owners: ['אביאם'], status: 'מותקנים 12 מונים\nממתין לבקר חדש', expectedTask: 'בדיקת זרימת נתונים', task: '[PROC_DONE] step=9', code: '101', lastModified: nowISO() },
          { name: 'דגניה',    row: 3, region: 'עמק הירדן',  owners: ['ניתאי'], status: 'ממתין למשלוח מונים', expectedTask: 'תיאום ביקור התקנה', task: 'step=3', code: '102', lastModified: nowISO() },
          { name: 'חוקוק',    row: 4, region: 'גליל תחתון', owners: ['אביאם'], status: 'באג: מונה כפול בהקמה', expectedTask: '', task: 'step=2', code: '103', lastModified: nowISO() },
          { name: 'גבת',      row: 5, region: 'עמק יזרעאל', owners: ['עידן'],  status: '', expectedTask: 'שיווק', task: '', code: '104', lastModified: nowISO() },
          { name: 'שדה אליהו', row: 6, region: 'בקעת בית שאן', owners: ['ניתאי'], status: 'באוויר', expectedTask: '', task: '[PROC_DONE] step=9', code: '105', lastModified: nowISO() },
          { name: 'כפר עזה', row: 7, region: 'שער הנגב', owners: ['עמיחי'], status: 'בתהליך אפיון', expectedTask: '🎯 תיאום פגישת אפיון (אין אתר EMS — fallback)', task: 'step=1', code: '106', lastModified: nowISO() }
        ],
        potentials: [], regions: [], orders: [], products: [], movements: [],
        requirements: [], returns: [], settings: [], attendance: [], calendar: {},
        // Phase 1/2 surfaces (shared EMS snapshot + queue, served from the Sheet):
        emsCache: M.cacheStore || { syncedAt: '', syncedBy: '', tasks: [] },
        emsQueue: M.queue
      };
    }

    // ---- EMS proxy router: mirrors the real {status, body} envelope ----
    function mockEms(req) {
      const rawPath = String(req.path || '');
      const method  = (req.method || 'GET').toUpperCase();
      const p        = rawPath.split('?')[0].replace(/^\/v1/, '');
      const qs       = new URLSearchParams(rawPath.split('?')[1] || '');
      const payload  = req.payload || {};
      const ok  = (body, status) => ({ status: status || 200, body });

      // auth
      if (p === '/auth/login/password') {
        const token = 'mock.' + btoa(JSON.stringify({ id: 'u-idan', role: 'admin', type: 'employee' })) + '.sig';
        return ok({ accessToken: token, type: 'employee' });
      }
      if (p === '/sites')  return ok(M.sites);
      if (p === '/users')  return ok({ data: M.users, meta: { total: M.users.length } });
      if (p === '/employee-tasks/overdue-count') {
        const n = M.tasks.filter(t => CLOSED.indexOf(t.status) === -1 && t.expectedCompletionDate && new Date(t.expectedCompletionDate) < new Date()).length;
        return ok({ overdueCount: n });
      }

      // comments  /employee-tasks/:id/comments[/:cid]
      let m = p.match(/^\/employee-tasks\/([^/]+)\/comments(?:\/([^/]+))?$/);
      if (m) {
        const id = m[1];
        if (method === 'GET')  return ok(M.comments[id] || []);
        if (method === 'POST') {
          const c = { id: nextId('c'), message: payload.message, author: M.users[0], createdAt: nowISO() };
          (M.comments[id] = M.comments[id] || []).push(c);
          return ok(c, 201);
        }
        if (method === 'DELETE') {
          if (M.comments[id]) M.comments[id] = M.comments[id].filter(c => c.id !== m[2]);
          return ok({ ok: true });
        }
      }

      // single task  /employee-tasks/:id
      m = p.match(/^\/employee-tasks\/([^/]+)$/);
      if (m) {
        const id = m[1];
        const t  = M.tasks.find(x => x.id === id);
        if (!t) return ok({ message: 'not found' }, 404);
        if (method === 'GET')    return ok(t);
        if (method === 'PATCH')  { Object.assign(t, payload); return ok(t); }
        if (method === 'DELETE') { M.tasks = M.tasks.filter(x => x.id !== id); return ok({ ok: true }); }
      }

      // list / create  /employee-tasks
      if (p === '/employee-tasks') {
        if (method === 'POST') {
          const site = M.sites.find(s => s.id === payload.siteId) || null;
          const t = Object.assign({ id: nextId('task'), status: 'new', assignee: null, site }, payload);
          M.tasks.push(t);
          return ok(t, 201);
        }
        // GET list with light filtering
        let list = M.tasks.slice();
        const st = qs.getAll('status');
        if (st.length) list = list.filter(t => st.indexOf(t.status) !== -1);
        const pr = qs.get('priority'); if (pr) list = list.filter(t => t.priority === pr);
        const si = qs.get('siteId');   if (si) list = list.filter(t => t.site && t.site.id === si);
        const se = qs.get('search');   if (se) list = list.filter(t => (t.title || '').indexOf(se) !== -1);
        if (qs.get('overdueOnly') === 'true') list = list.filter(t => CLOSED.indexOf(t.status) === -1 && t.expectedCompletionDate && new Date(t.expectedCompletionDate) < new Date());
        return ok({ data: list, meta: { total: list.length, skip: 0, take: 50 } });
      }
      return ok({ message: 'mock: unhandled ' + method + ' ' + p }, 404);
    }

    // ---- single entry point: anything POSTed/GETed to SHEET_API ----
    function mockResponse(url, opts) {
      const method = (opts && opts.method ? opts.method : 'GET').toUpperCase();
      let body = null;
      if (opts && opts.body) { try { body = JSON.parse(opts.body); } catch (e) {} }
      let payload;
      if (method === 'GET') {
        payload = mockSheetData();                       // dashboard data load (?v=…)
      } else if (body && body.type === 'ems') {
        payload = mockEms(body);                          // EMS proxy → {status, body}
      } else if (body && body.type === 'emsCacheWrite') {
        // full-replace snapshot (all admins → everyone writes the complete set)
        M.cacheStore = { syncedAt: nowISO(), syncedBy: body.syncedBy || '', tasks: body.tasks || [] };
        payload = { ok: true, cached: M.cacheStore.tasks.length };
      } else if (body && body.type === 'emsQueueAdd') {
        M.queue.push(Object.assign({ id: nextId('q'), at: nowISO() }, body.item || {}));
        payload = { ok: true, queued: M.queue.length };
      } else if (body && body.type === 'emsQueueClear') {
        const ids = body.ids || [];
        M.queue = M.queue.filter(q => ids.indexOf(q.id) === -1);
        payload = { ok: true, remaining: M.queue.length };
      } else {
        payload = { ok: true, success: true, created: false, row: (body && body.row) || _seq++ };
      }
      const txt = JSON.stringify(payload);
      return { ok: true, status: 200, headers: { get: () => 'application/json' },
               json: async () => payload, text: async () => txt };
    }

    const realFetch = window.fetch.bind(window);
    window.fetch = function (url, opts) {
      if (typeof url === 'string' && url.indexOf(SHEET_API) === 0) {
        return Promise.resolve(mockResponse(url, opts));
      }
      return realFetch(url, opts);
    };

    // small left-edge "notch" so it's obvious it's a sandbox, without covering the bottom nav.
    window.addEventListener('DOMContentLoaded', function () {
      const b = document.createElement('div');
      b.textContent = '🧪 DEV';
      b.title = 'סביבת בדיקה (MOCK) — אין חיבור לגיליון/EMS אמיתי';
      b.style.cssText = 'position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:99999;' +
        'background:#7c2d12;color:#fff;font:700 11px Heebo,sans-serif;padding:10px 4px;' +
        'border-radius:0 7px 7px 0;writing-mode:vertical-rl;text-orientation:mixed;letter-spacing:1px;' +
        'box-shadow:1px 0 5px rgba(0,0,0,.3);pointer-events:none;opacity:.9;';
      document.body.appendChild(b);
    });
    console.log('%c🧪 MOCK MODE active', 'color:#f97316;font-weight:700', '— fixtures in window.__MOCK');
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // 🟢 SUPABASE ROUTING LAYER — migration cutover switch (build ·28).
  // USE_SUPABASE=false → identical to today (all SHEET_API traffic → Apps Script).
  // USE_SUPABASE=true  → reads + data-writes go to Supabase; ONLY the live EMS proxy
  // and AI (ems / transcribe / parseRequest) stay on Apps Script (hybrid).
  // Flip this ONE flag to cut over; flip back to roll back. Read+write parity was
  // validated against the Apps Script snapshot before shipping (db/verify_read_parity.mjs).
  // SB_ANON is the public anon key — safe in the browser (RLS is enabled on every table).
  // ═══════════════════════════════════════════════════════════════════════════
  // CUTOVER (build ·29): Supabase is the default backend for EVERYONE.
  // Escape hatch: append ?sb=0 to the URL → falls back to Apps Script/Sheets (per-user, no redeploy).
  // Full rollback = set this back to `location.search.indexOf('sb=1') !== -1` (default off) + redeploy.
  const USE_SUPABASE = location.search.indexOf('sb=0') === -1;
  const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';
  if (USE_SUPABASE) (function setupSupabaseRouter() {
    // Auth header. The bridge mints a role=authenticated token, but the DB only USES it once
    // USE_SB_BRIDGE is on (i.e. AFTER the 'authenticated' RLS policies exist). Until then → anon,
    // so the app always works. Staged: deploy authenticated policies → flip USE_SB_BRIDGE → lockdown.
    const USE_SB_BRIDGE = true;
    const baseH = () => ({ apikey: SB_ANON, Authorization: 'Bearer ' + ((USE_SB_BRIDGE && window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : SB_ANON), 'Content-Type': 'application/json' });
    const nowISO = () => new Date().toISOString();
    const numish = v => (v != null && /^-?\d+$/.test(String(v))) ? Number(v) : v;
    const genId = p => p + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const realFetch = window.fetch.bind(window);
    const sbGet = async (path) => { const r = await realFetch(SB_URL + '/rest/v1/' + path, { headers: baseH() }); if (!r.ok) throw new Error('supabase GET ' + path + ' ' + r.status); return r.json(); };
    const sbUpsert = async (table, key, row) => { const r = await realFetch(SB_URL + '/rest/v1/' + table + '?on_conflict=' + key, { method: 'POST', headers: Object.assign({}, baseH(),{ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(row) }); if (!r.ok) throw new Error('supabase upsert ' + table + ' ' + r.status + ' ' + await r.text()); };
    // PATCH = partial update: writes ONLY the columns in `row`, leaving the rest of the existing record untouched.
    const sbPatch = async (table, filter, row) => { const r = await realFetch(SB_URL + '/rest/v1/' + table + '?' + filter, { method: 'PATCH', headers: Object.assign({}, baseH(),{ Prefer: 'return=minimal' }), body: JSON.stringify(row) }); if (!r.ok) throw new Error('supabase patch ' + table + ' ' + r.status + ' ' + await r.text()); };
    const sbInsert = async (table, rows) => { const r = await realFetch(SB_URL + '/rest/v1/' + table, { method: 'POST', headers: Object.assign({}, baseH(),{ Prefer: 'return=minimal' }), body: JSON.stringify(rows) }); if (!r.ok) throw new Error('supabase insert ' + table + ' ' + r.status + ' ' + await r.text()); };
    const sbDelete = async (path) => { const r = await realFetch(SB_URL + '/rest/v1/' + path, { method: 'DELETE', headers: baseH() }); if (!r.ok) throw new Error('supabase delete ' + path + ' ' + r.status); };
    // insert that RETURNS the row (delivery_certs needs the server-assigned cert_number back)
    const sbInsertRet = async (table, row) => { const r = await realFetch(SB_URL + '/rest/v1/' + table, { method: 'POST', headers: Object.assign({}, baseH(), { Prefer: 'return=representation' }), body: JSON.stringify(row) }); if (!r.ok) throw new Error('supabase insert ' + table + ' ' + r.status + ' ' + await r.text()); return (await r.json())[0]; };
    window._sbCertGet = sbGet;   // read-only handle for the delivery-cert module (kibbutz_details + cert reports)

    // ---- READ: assemble the exact snapshot shape the app already consumes ----
    async function readSnapshot() {
      const q = ['tasks?select=*&order=seq', 'visits?select=*', 'products?select=*', 'orders?select=*', 'movements?select=*', 'requirements?select=*', 'returns?select=*', 'attendance?select=*', 'settings?select=*', 'potentials?select=*', 'regions?select=*', 'ems_cache?select=*&id=eq.1', 'ems_queue?select=*&order=id'];
      const [tasks, visits, products, orders, movements, requirements, returns_, attendance, settings, potentials, regions, cacheRows, queueRows] = await Promise.all(q.map(sbGet));
      const settingsObj = {}; settings.forEach(s => { settingsObj[s.key] = s.value; });
      const regionsObj = {}; regions.forEach(r => { if (r.code) regionsObj[r.code] = r.name || ''; });
      const cache = cacheRows[0] || { tasks: [], synced_at: '', synced_by: '' };
      return {
        updatedAt: nowISO(),
        settings: settingsObj,
        tasks: tasks.map(t => ({ row: t.seq, code: t.code == null ? null : numish(t.code), region: t.region || '', migrated: t.migrated || '', name: t.name || '', status: t.status || '', expectedTask: t.expected_task || '', owners: String(t.owners || '').split(/[,\n\/]/).map(s => s.trim()).filter(Boolean), task: t.task || '', lastCheckup: t.last_checkup || '', editor: t.editor || '', lastModified: t.last_modified ? String(t.last_modified) : '' })),
        potentials: potentials.map(p => ({ serial: (p.serial === '' || p.serial == null) ? '' : numish(p.serial), region: p.region || '', name: p.name || '' })),
        regions: regionsObj,
        visits: visits.map(v => ({ id: String(v.id), kibbutz: v.kibbutz || '', date: v.date || '', visitor: v.visitor || '', duration: parseFloat(v.duration) || 0, contact: v.contact || '', products: v.products || [], productsOther: v.products_other || '', summary: v.summary || '', createdAt: v.created_at || '', workday: !!v.workday })),
        products: products.map(p => ({ id: String(p.id), name: p.name || '', category: p.category || '', active: !!p.active, createdAt: p.created_at ? String(p.created_at) : '', createdBy: p.created_by || '' })),
        orders: orders.map(o => ({ id: String(o.id), createdAt: o.created_at || '', createdBy: o.created_by || '', supplier: o.supplier || '', status: o.status || 'pending', items: o.items || [], expectedDate: o.expected_date || '', notes: o.notes || '', deliveredAt: o.delivered_at || '', distribution: o.distribution || {}, orderType: o.order_type || '', kibbutz: o.kibbutz || '', assignee: o.assignee || '', lastUpdated: o.last_updated ? String(o.last_updated) : '' })),
        movements: movements.map(m => ({ id: String(m.id), date: m.date || '', product: m.product || '', fromLocation: m.from_location || '', toLocation: m.to_location || '', quantity: parseFloat(m.quantity) || 0, reason: m.reason || '', refId: m.ref_id || '', createdBy: m.created_by || '' })),
        requirements: requirements.map(r => ({ id: String(r.id), createdAt: r.created_at || '', createdBy: r.created_by || '', kibbutz: r.kibbutz || '', contactName: r.contact_name || '', items: r.items || [], notes: r.notes || '', status: r.status || 'open', linkedOrderId: r.linked_order_id || '', fulfilledAt: r.fulfilled_at || '', lastUpdated: r.last_updated ? String(r.last_updated) : '' })),
        returns: returns_.map(r => ({ id: String(r.id), visitId: r.visit_id || '', date: r.date || '', kibbutz: r.kibbutz || '', visitor: r.visitor || '', product: r.product || '', qty: parseInt(r.qty) || 0, reason: r.reason || '', status: r.status || 'open' })),
        attendance: attendance.map(a => ({ id: String(a.id), date: a.date || '', person: a.person || '', dayType: a.day_type || '', note: a.note || '' })),
        emsCache: { tasks: cache.tasks || [], syncedAt: cache.synced_at || '', syncedBy: cache.synced_by || '' },
        emsQueue: queueRows.map(qr => qr.payload)
      };
    }

    // ---- WRITE: per-type → Supabase upsert (same field mapping as the importer) ----
    const W = {
      product: b => { const id = b.id || genId('prod'); return ['products', 'id', { id, name: b.name || '', category: b.category || '', active: b.active !== false, created_at: b.createdAt || nowISO(), created_by: b.createdBy || '' }, id]; },
      // order + requirement are handled by writeOrder/writeRequirement (partial-safe) — not via this full-row table.
      movement: b => { const id = b.id || genId('mov'); return ['movements', 'id', { id, date: b.date || nowISO(), product: b.product || '', from_location: b.fromLocation || '', to_location: b.toLocation || '', quantity: b.quantity || 0, reason: b.reason || 'manual', ref_id: b.refId || '', created_by: b.createdBy || '' }, id]; },
      attendance: b => { const id = b.id || genId('att'); return ['attendance', 'id', { id, date: b.date || nowISO(), person: b.person || '', day_type: b.dayType || '', note: b.note || '' }, id]; },
      setting: b => ['settings', 'key', { key: String(b.key || ''), value: b.value !== undefined ? b.value : null, updated_at: nowISO() }, b.key]
    };

    // visit: upsert the visit AND append any returned-equipment rows (mirrors appendVisit)
    async function writeVisit(b) {
      const id = b.id || genId('v');
      const row = { id, kibbutz: b.kibbutz || '', date: b.date || nowISO(), visitor: b.visitor || '', duration: b.duration || 0, contact: b.contact || '', products: b.products || [], products_other: b.productsOther || '', summary: b.summary || '', workday: !!b.workday };
      if (!b.id) row.created_at = b.createdAt || nowISO();   // stamp creation date on INSERT only; an edit omits it → upsert-merge preserves the original (don't reset it to now)
      await sbUpsert('visits', 'id', row);
      if (Array.isArray(b.returnedItems) && b.returnedItems.length) {
        const rows = b.returnedItems.filter(it => it && it.name && it.qty > 0).map(it => ({ id: genId('ret'), visit_id: id, date: b.date || nowISO(), kibbutz: b.kibbutz || '', visitor: b.visitor || '', product: it.name, qty: it.qty, reason: it.reason || '', status: it.toStock ? 'restocked' : 'open' }));
        if (rows.length) await sbInsert('returns', rows);
      }
      return { ok: true, id };
    }

    // task default (no type): keyed by name. Only the fields present are written (partial-safe).
    async function writeTask(b) {
      let name = b.name;
      if (!name && b.row && window.SHEET_DATA && Array.isArray(window.SHEET_DATA.tasks)) { const f = window.SHEET_DATA.tasks.find(t => t.row === b.row); if (f) name = f.name; }
      if (!name) throw new Error('task write: no name/row to key on');
      const row = { name: name, editor: b.editor || 'anon', last_modified: nowISO() };
      if (b.code != null) row.code = String(b.code);
      if (typeof b.region === 'string') row.region = b.region;
      if (typeof b.migrated === 'string') row.migrated = b.migrated;
      if (typeof b.status === 'string') row.status = b.status;
      if (typeof b.expectedTask === 'string') row.expected_task = b.expectedTask;
      if (Array.isArray(b.owners)) row.owners = b.owners.join(', ');
      if (typeof b.task === 'string') row.task = b.task;
      const created = !b.row;
      await sbUpsert('tasks', 'name', row);
      return created ? { ok: true, created: true } : { ok: true, savedAt: row.last_modified };
    }

    // order / requirement writes are PARTIAL-SAFE: a new record (no id) inserts the full row, but an UPDATE
    // (id present — e.g. a status-only {id,status} from approval / quick-status) PATCHes ONLY the fields sent,
    // so it never wipes items/supplier/notes/distribution. (The old full-row upsert defaulted absent fields to
    // empty, which deleted an order's details on the first status change after creation.)
    // orderUpdateRow/reqUpdateRow are pure (body → columns, present-keys only); see test-order-patch.mjs.
    function orderUpdateRow(b) {
      const row = {};
      if (b.status       !== undefined) row.status        = b.status;
      if (b.items        !== undefined) row.items         = b.items;
      if (b.supplier     !== undefined) row.supplier      = b.supplier;
      if (b.expectedDate !== undefined) row.expected_date = b.expectedDate;
      if (b.notes        !== undefined) row.notes         = b.notes;
      if (b.distribution !== undefined) row.distribution  = b.distribution;
      if (b.createdBy    !== undefined) row.created_by    = b.createdBy;
      if (b.deliveredAt  !== undefined) row.delivered_at  = b.deliveredAt;
      if (b.orderType    !== undefined) row.order_type    = b.orderType;
      if (b.kibbutz      !== undefined) row.kibbutz       = b.kibbutz;
      if (b.assignee     !== undefined) row.assignee      = b.assignee;   // column from db/orders_schedule_fields.sql
      return row;
    }
    function reqUpdateRow(b) {
      const row = {};
      if (b.status        !== undefined) row.status          = b.status;
      if (b.items         !== undefined) row.items           = b.items;
      if (b.kibbutz       !== undefined) row.kibbutz         = b.kibbutz;
      if (b.contactName   !== undefined) row.contact_name    = b.contactName;
      if (b.notes         !== undefined) row.notes           = b.notes;
      if (b.linkedOrderId !== undefined) row.linked_order_id = b.linkedOrderId;
      if (b.createdBy     !== undefined) row.created_by      = b.createdBy;
      if (b.fulfilledAt   !== undefined) row.fulfilled_at    = b.fulfilledAt;
      return row;
    }
    async function writeOrder(b) {
      if (!b.id) {
        const id = genId('ord');
        const row = { id, created_at: b.createdAt || nowISO(), created_by: b.createdBy || '', supplier: b.supplier || '', status: b.status || 'pending', items: b.items || [], expected_date: b.expectedDate || '', notes: b.notes || '', delivered_at: b.status === 'delivered' ? (b.deliveredAt || nowISO()) : (b.deliveredAt || ''), distribution: b.distribution || {}, order_type: b.orderType || '', kibbutz: b.kibbutz || '', last_updated: nowISO() };
        if (b.assignee) row.assignee = b.assignee;   // omit when unset so inserts keep working before orders_schedule_fields.sql adds the column
        await sbUpsert('orders', 'id', row);
        return { ok: true, id };
      }
      const row = orderUpdateRow(b);
      if (row.delivered_at === undefined && b.status === 'delivered') row.delivered_at = nowISO();   // stamp on first delivery
      row.last_updated = nowISO();
      await sbPatch('orders', 'id=eq.' + encodeURIComponent(b.id), row);
      return { ok: true, id: b.id };
    }
    async function writeRequirement(b) {
      if (!b.id) {
        const id = genId('req');
        await sbUpsert('requirements', 'id', { id, created_at: b.createdAt || nowISO(), created_by: b.createdBy || '', kibbutz: b.kibbutz || '', contact_name: b.contactName || '', items: b.items || [], notes: b.notes || '', status: b.status || 'open', linked_order_id: b.linkedOrderId || '', fulfilled_at: b.status === 'fulfilled' ? (b.fulfilledAt || nowISO()) : (b.fulfilledAt || ''), last_updated: nowISO() });
        return { ok: true, id };
      }
      const row = reqUpdateRow(b);
      if (row.fulfilled_at === undefined && b.status === 'fulfilled') row.fulfilled_at = nowISO();
      row.last_updated = nowISO();
      await sbPatch('requirements', 'id=eq.' + encodeURIComponent(b.id), row);
      return { ok: true, id: b.id };
    }

    const respond = (payload) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, clone: function () { return this; }, json: async () => payload, text: async () => JSON.stringify(payload) });

    window.fetch = function (url, opts) {
      if (typeof url === 'string' && url.indexOf(SHEET_API) === 0) {
        const method = (opts && opts.method ? opts.method : 'GET').toUpperCase();
        if (method === 'GET') return readSnapshot().then(respond).catch(e => { console.error('[supabase] read failed → falling back to Apps Script', e); return realFetch(url, opts); });
        let b = null; if (opts && opts.body) { try { b = JSON.parse(opts.body); } catch (e) {} }
        if (!b) return realFetch(url, opts);
        if (b.type === 'ems' || b.type === 'transcribe' || b.type === 'parseRequest') return realFetch(url, opts);  // live proxy + AI stay on Apps Script
        const run = async () => {
          // Writes need the AUTHENTICATED bridge pass (anon is read-only post-lockdown). If it lapsed,
          // re-mint BEFORE any upsert — otherwise the write goes out as anon and is rejected, which is the
          // root of the recurring "נשמר מקומית/לוקאלית" failures (company-tasks, requirements, etc.).
          if ((!window._sbToken || (window._sbTokenExp || 0) <= Date.now()) && typeof window._sbBridge === 'function') {
            try { await window._sbBridge(); } catch (e) {}
          }
          if (!b.type) return respond(await writeTask(b));
          if (b.type === 'order') return respond(await writeOrder(b));
          if (b.type === 'requirement') return respond(await writeRequirement(b));
          if (b.type === 'visit') return respond(await writeVisit(b));
          if (b.type === 'return') { await sbUpsert('returns', 'id', { id: b.id, status: b.status || 'open' }); return respond({ ok: true, id: b.id }); }
          if (b.type === 'emsCacheWrite') { await sbUpsert('ems_cache', 'id', { id: 1, tasks: b.tasks || [], synced_at: nowISO(), synced_by: b.syncedBy || '' }); return respond({ ok: true, cached: (b.tasks || []).length }); }
          if (b.type === 'emsQueueAdd') { const qid = genId('q'); await sbInsert('ems_queue', [{ payload: Object.assign({ id: qid, at: nowISO() }, b.item || {}) }]); return respond({ ok: true, id: qid }); }
          if (b.type === 'emsQueueClear') { const ids = (b.ids || []).map(x => '"' + String(x).replace(/"/g, '') + '"'); if (ids.length) await sbDelete('ems_queue?payload->>id=in.(' + ids.join(',') + ')'); return respond({ ok: true }); }
          if (b.type === 'parseCorrection') { await sbInsert('parse_corrections', [{ raw_text: b.rawText || '', items: b.items || [], created_by: b.createdBy || '' }]); return respond({ ok: true }); }
          if (b.type === 'deliveryCert') { const c = b.cert || {}; const row = await sbInsertRet('delivery_certs', { cert_date: c.date || nowISO().slice(0, 10), kibbutz: c.kibbutz || '', customer: c.customer || {}, items: c.items || [], notes: c.notes || '', source: c.source || 'manual', ref_id: c.refId || '', created_by: b.createdBy || '' }); return respond({ ok: true, certNumber: row && row.cert_number, id: row && row.id }); }
          const w = W[b.type]; if (!w) return realFetch(url, opts);
          const parts = w(b); await sbUpsert(parts[0], parts[1], parts[2]); return respond({ ok: true, id: parts[3] });
        };
        return run().catch(async (e) => {
          // Auth/RLS failure (401 / 42501) = the EMS-minted Supabase pass isn't active (the EMS session
          // lapsed → the silent re-mint above produced no pass → the write went out anon → RLS rejected it).
          // Force ONE fresh mint + retry; if it STILL fails, prompt EMS re-login instead of surfacing the
          // raw Postgres 401 ("...row violates row-level security policy for table tasks").
          var msg = String((e && e.message) || e);
          if (/\b401\b|42501|row-level security/i.test(msg) && typeof window._sbBridge === 'function' && b && !b.__authRetried) {
            b.__authRetried = true;
            try { window._sbToken = null; window._sbTokenExp = 0; if (await window._sbBridge()) return await run(); } catch (_) {}
            if (typeof emsRequireLogin === 'function') { try { emsRequireLogin(); } catch (_) {} }
            throw new Error('יש להתחבר מחדש ל-EMS כדי לשמור (פג תוקף החיבור).');
          }
          console.error('[supabase] write failed: ' + ((b && b.type) || 'task'), e); throw e;
        });
      }
      return realFetch(url, opts);
    };
    console.log('%c🟢 Supabase routing active (USE_SUPABASE)', 'color:#16a34a;font-weight:700');
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // KIBBUTZ ↔ EMS site bridge — from the prod-DB reconciliation (kibbutz_site_map.json).
  // Maps a GIST kibbutz card name → array of EMS site UUIDs (usually 1; a few merge 2).
  // Used to pull the right open EMS tasks for each kibbutz from the shared cache.
  // (Long-term this can be overridden from a Sheet tab without redeploy.)
  // ═══════════════════════════════════════════════════════════════════════════
  const KIBBUTZ_SITE_MAP = {
    "אגודת המים עמק הירדן": ["c40203ac-2f3a-4445-9fd8-b3f0d08c1b2f"],
    "אור הנר גז": ["9d755469-c2f7-4abd-9a48-88d1b07c3146"],
    "אור הנר חשמל": ["9d755469-c2f7-4abd-9a48-88d1b07c3146"],
    "אלומות": ["4094e057-97e8-4acc-ba92-e81ab119665e"],
    "אלונים": ["38493e06-b7dd-470d-a81d-c00634337f9f"],
    "אפיק": ["bf8fcda4-ebde-45ca-aada-07075989436d"],
    "אפיקים": ["67e307f8-d6a9-4282-bcc9-7118e1c05999"],
    "בית אריזה גלבוע": ["be289169-6892-416d-b0c8-98ec4326bca6"],
    "בית זרע": ["923f3862-f03d-453a-bbbe-4a53fa3f0641"],
    "גבים": ["4e788393-9301-4eaf-a47f-4983d8636242"],
    "גבעת חיים מאוחד": ["61f76e69-5e90-4edb-9504-94c4f72b5488"],
    "גברעם": ["29b3e1c2-6ce0-4d6b-b699-847fee42d995"],
    "גבת": ["ed86a5b9-ae41-4317-942e-f42b0ba44aba"],
    "גניגר": ["7c70b14b-754a-43ed-8bf1-9c1ade6f075c"],
    "חולדה": ["d697d259-95ee-4dcc-95fa-820f6ec3d32a"],
    "חוצות יגור": ["0cf0467c-f8e6-4807-96dc-1d154e2b7fda"],
    "חוקוק": ["d1bdff7a-82c2-46d1-92f1-96ab0679911e"],
    "יגור": ["ebb4306f-d289-422a-b3cb-ce3e8ee68bdc"],
    "יסעור": ["35df068b-e011-4d07-88d8-5c54dca05b37"],
    "כנרת": ["df584a02-6dcd-4df8-91cd-5c9e4f0c4a8f"],
    "כפר גלעדי": ["858a5a53-0902-46d2-bb66-459a1d848b6c"],
    "כפר דניאל": ["5cbf4b2b-b968-4f10-8733-a055db5cfa60"],
    "כפר מנחם": ["52e1f273-ca7b-4b75-bcc1-3b4451774e87"],
    "כפר מסריק": ["e1f2535b-e977-4f34-82c3-0af89fcd4851"],
    "לביא": ["69a9e842-0742-4d21-b3a2-3ed46b221a73"],
    "להב": ["bcb46661-abd1-4884-a54e-45906a52f6c2"],
    "מגידו": ["d66a0a58-15c2-486d-82c0-d2add10c2b6b"],
    "מגן": ["c54ef394-9a51-46e1-8758-0a0a1b715ab7"],
    "מעוז חיים": ["f5becfd4-5193-4b55-b7a1-4c067ba9e2b9","b7229e14-ff17-4f69-bc94-6d248cdadd7e"],
    "מעלה גלבוע": ["a755f8a2-f3cd-4962-a23c-62b32b619898"],
    "משואות יצחק": ["7e1ce0e8-5ac6-401e-a525-53ebe5f0d62a"],
    "משמר השרון": ["800f1b97-c7ae-425b-bf01-f4a17c028f8b"],
    "מתחם חינוך שער הנגב": ["1eaeb274-7227-46e0-b9ff-31b674ebaaf9"],
    "עין המפרץ": ["5535f354-7a39-4364-a929-e16ad8e4bd07"],
    "עין השופט": ["0ab92b61-53fc-426d-ac44-67f3406b87fb"],
    "עין חרוד מאוחד": ["be2827e9-69eb-4f51-b298-9a04076c775d"],
    "עין חרוד איחוד": ["7f3d9309-67fd-4714-a6cc-c0a0156c9671"],
    "פרחי אביב": ["b3d19aa6-0782-4954-a280-b7940ed60c95"],
    "קבוצת יבנה": ["a2a36e36-58c8-48c7-8a7f-3c5defe5bc43"],
    "קיבוץ גת": ["0b0d7c89-78d6-4dc4-b0fb-4df5cf76c35b"],
    "רמות מנשה": ["b5f691ab-6941-481b-860c-adb1d4532cf5"],
    "שדה אליהו": ["3f91ccf9-67ae-4420-bf30-b7ea57ad16b2","14a28537-15a6-4860-8a57-410d9cbf738c"],
    "שלוחות": ["07ab3dee-7192-4f19-a004-0fae7c09d3fd"],
    "שער הגולן": ["829c78e9-e497-47f4-9aa1-ee8f4bc1085c"],
    "שריד": ["b8a2aa72-feab-400d-9d27-14d7635a7db1"],
    "תל קציר": ["6ec619fb-ee23-4a8d-b075-4c735ef61324"],
    "דגניה": ["cc079fe9-5f00-4a3d-a654-707207d831db"]
  };
  // The EMS site is being renamed "דגניה"→"דגניה א" (UUID is stable, so matching is
  // unaffected). The GIST join-key (card data-name + Sheet row) stays "דגניה"; only
  // the on-card LABEL shows "דגניה א". "דגניה ב" gets its own card+row+site when created.
  // Resolve a kibbutz card name → its EMS site ids (exact, then whitespace-normalized).
  function kibbutzSiteIds(name) {
    if (!name) return [];
    if (KIBBUTZ_SITE_MAP[name]) return KIBBUTZ_SITE_MAP[name];
    const n = String(name).replace(/\s+/g, ' ').trim();
    if (KIBBUTZ_SITE_MAP[n]) return KIBBUTZ_SITE_MAP[n];
    for (const k in KIBBUTZ_SITE_MAP) { if (k.replace(/\s+/g, ' ').trim() === n) return KIBBUTZ_SITE_MAP[k]; }
    return [];
  }

  window.SHEET_DATA = null;
  window.currentEditTask = null;

  // Remove leftover system-test rows (from Claude's setup checks) from the loaded data so
  // they never appear in search/lists/reports. Only "Test Site" (a real EMS site) keeps "test".
  function stripTestData(data) {
    if (!data) return;
    const isTest = s => /TEST_CLAUDE|CLEANUP - test/i.test(String(s || ''));
    if (Array.isArray(data.requirements)) data.requirements = data.requirements.filter(r => !(isTest(r.contactName) || isTest(r.notes)));
    if (Array.isArray(data.orders))       data.orders       = data.orders.filter(o => !isTest(o.supplier) && !isTest(o.notes));
    if (Array.isArray(data.visits))       data.visits       = data.visits.filter(v => v.visitor !== 'TEST' && !/^\[נמחק/.test(String(v.summary || '')));
  }

  async function fetchSheetData() {
    try {
      const r = await fetch(SHEET_API + '?v=' + Date.now());
      const data = await r.json();
      stripTestData(data);   // drop leftover Claude test rows (TEST_CLAUDE / visitor=TEST) from every view
      window.SHEET_DATA = data;
      // Deploy guard: on the real host, a missing emsCache key means the Apps Script
      // (EMS_CACHE/EMS_QUEUE handlers, v5.8) hasn't been deployed yet → EMS widgets
      // stay hidden and cards fall back to expectedTask. Warn once so it's not silent.
      if (!MOCK_MODE && data && typeof data.emsCache === 'undefined' && !window._emsCacheWarned) {
        window._emsCacheWarned = true;
        console.warn('[EMS] SHEET_DATA.emsCache missing — Apps Script v5.8 not deployed yet. EMS task widgets will not show until it is.');
      }
      setSourceIndicator('online');
      return data;
    } catch (e) {
      console.error('Sheet fetch failed:', e);
      setSourceIndicator('offline');
      return null;
    }
  }

  function setSourceIndicator(state) {
    const el = document.getElementById('lastUpdated');
    if (!el) return;
    const existing = el.querySelector('.data-source-pill');
    if (existing) existing.remove();
    const pill = document.createElement('span');
    pill.className = 'data-source-pill' + (state === 'offline' ? ' offline' : '');
    pill.textContent = state === 'offline' ? '⚠️ מקור: גיבוי' : '🔄 חי מהגיליון';
    el.appendChild(pill);
  }

  // Parse the task field which can contain [PROC_DONE] | step=N | note=... | cat=X
  function parseTaskField(taskStr) {
    taskStr = String(taskStr || '');
    const proc = taskStr.includes('[PROC_DONE]');
    const stepMatch = taskStr.match(/step=(\d+)/);
    const noteMatch = taskStr.match(/note=([^|]*?)(?:\||$)/);
    const catMatch = taskStr.match(/cat=([a-z_]+)/);
    const typeMatch = taskStr.match(/type=([a-z_]+)/);
    return {
      proc,
      step: stepMatch ? parseInt(stepMatch[1]) : null,
      note: noteMatch ? noteMatch[1].trim() : '',
      cat: catMatch ? catMatch[1] : null,
      type: typeMatch ? typeMatch[1] : null,
      raw: taskStr
    };
  }

  function serializeTaskField(proc, step, note, cat, type) {
    const parts = [];
    if (proc) parts.push('[PROC_DONE]');
    if (step) parts.push('step=' + step);
    if (note) parts.push('note=' + note);
    if (cat) parts.push('cat=' + cat);
    if (type) parts.push('type=' + type);
    return parts.join(' | ');
  }

  // Engagement type colors / labels
  const ENGAGEMENT_TYPES = {
    ongoing:  { label: '🟢 שוטף',       color: '#10b981' },
    wavering: { label: '🟡 מתנדנד',     color: '#f59e0b' },
    new:      { label: '🔵 חדש',         color: '#3b82f6' },
    prospect: { label: '⚪ פוטנציאלי',   color: '#94a3b8' }
  };

  // Category → DOM target + class config
  const CATEGORIES = {
    priority:   { gridId: 'grid-priority',   classes: 'kibbutz pending priority', types: 'pending priority', addFlag: true  },
    new_client: { gridId: 'grid-new_client', classes: 'kibbutz new-client',       types: 'pending',          addFlag: false },
    done:       { gridId: 'grid-done',       classes: 'kibbutz done',             types: 'done',             addFlag: false },
    pending:    { gridId: 'grid-pending',    classes: 'kibbutz pending',          types: 'pending',          addFlag: false }
  };

  function moveCardToCategory(card, category) {
    const cfg = CATEGORIES[category];
    if (!cfg) return;
    card.className = cfg.classes;
    card.dataset.types = cfg.types;
    const existingFlag = card.querySelector('.priority-flag');
    if (!cfg.addFlag && existingFlag) existingFlag.remove();
    if (cfg.addFlag && !existingFlag) {
      const flag = document.createElement('span');
      flag.className = 'priority-flag';
      flag.textContent = 'עדיפות';
      card.insertBefore(flag, card.firstChild);
    }
    const target = document.getElementById(cfg.gridId);
    if (target && card.parentNode !== target) target.appendChild(card);
  }

  // "עודכן לאחרונה ע"י X · HH:MM" — editor + timestamp already live on each task row
  // (server-set, same fields the activity tracker reads). ponytail: no new storage, just surface them.
  function lastUpdateText(task) {
    if (!task || !task.lastModified) return '';
    const d = new Date(task.lastModified);
    if (isNaN(d.getTime())) return '';
    let who = String(task.editor || '').trim().replace(/\s*\(ביקור\)\s*$/, '');
    if (/bulk|migration|seed|auto|init/i.test(who)) who = '';
    const when = d.toLocaleDateString('he-IL', {day:'2-digit', month:'2-digit'}) + ' ' +
                 d.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
    return '🕒 עודכן' + (who ? ' ע"י ' + who : '') + ' · ' + when;
  }

  function enrichCardsWithSheet(data) {
    if (!data || !data.tasks) return;
    const byName = {};
    data.tasks.forEach(t => { if (t.name) byName[t.name] = t; });

    document.querySelectorAll('.kibbutz').forEach(card => {
      const name = card.dataset.name;
      if (!name) return;
      const task = byName[name];
      if (!task) return;

      card.dataset.row = task.row;
      card.dataset.lastModified = task.lastModified || '';

      const parsed = parseTaskField(task.task);
      // Move card to category if Sheet has a value (overrides static HTML placement)
      if (parsed.cat && CATEGORIES[parsed.cat]) {
        moveCardToCategory(card, parsed.cat);
      }
      // Override data-step if Sheet has a value
      if (parsed.step) {
        card.dataset.step = String(parsed.step);
      }
      // Override the .kibbutz-note if Sheet has one
      if (parsed.note) {
        let noteEl = card.querySelector('.kibbutz-note');
        if (!noteEl) {
          noteEl = document.createElement('div');
          noteEl.className = 'kibbutz-note';
          card.appendChild(noteEl);
        }
        noteEl.textContent = parsed.note;
      }

      // Remove old enrichment if exists
      card.querySelectorAll('.excel-injected').forEach(e => e.remove());
      // Remove old stepper so it can be re-built with possibly new step
      card.querySelectorAll('.stepper, .current-step-label').forEach(e => e.remove());

      const wrap = document.createElement('div');
      wrap.className = 'excel-injected';

      // Region badge — placed in a row with the kibbutz name (LEFT of name in RTL)
      // Clean up old placement if any
      card.querySelectorAll('.kibbutz-meta .region-badge').forEach(e => e.remove());

      const nameEl = card.querySelector('.kibbutz-name');
      if (nameEl && task.region) {
        let nameRow = card.querySelector('.kibbutz-name-row');
        if (!nameRow) {
          nameRow = document.createElement('div');
          nameRow.className = 'kibbutz-name-row';
          nameEl.parentNode.insertBefore(nameRow, nameEl);
          nameRow.appendChild(nameEl);
        }
        // Remove any duplicate region badge in the name row first
        nameRow.querySelectorAll('.region-badge').forEach(e => e.remove());
        const rb = document.createElement('span');
        rb.className = 'region-badge excel-injected';
        rb.setAttribute('data-region', task.region);
        rb.textContent = '📍 ' + task.region;
        nameRow.appendChild(rb);
      }
      // Save region on card itself for filter/search
      if (task.region) card.dataset.region = task.region;

      // (Client-type/engagement badge intentionally not rendered — hidden per request.)
      card.dataset.engagement = parsed.type || '';

      // Status (single merged field). The legacy expectedTask is folded in until the
      // next save migrates it (the edit modal now has one combined "סטטוס ומשימות" field).
      // The EMS-tasks widget (or the "open new EMS task" line) is added below this by
      // applyCardEmsWidgets — reorderCards keeps the order name → status → EMS.
      const mergedStatus = [task.status, task.expectedTask]
        .map(x => String(x || '').trim()).filter(x => x && x !== '-').join('\n');
      if (mergedStatus) {
        const s = document.createElement('div');
        s.className = 'excel-status excel-injected';
        // prominent header inside the element so reorderCards keeps them together
        const sh = document.createElement('div');
        sh.className = 'card-sec-head';
        sh.textContent = '📋 סטטוס ומשימות';
        const sb = document.createElement('div');
        sb.textContent = mergedStatus;
        s.appendChild(sh); s.appendChild(sb);
        card.appendChild(s);
      }

      // Owners as chips (with a prominent header)
      if (task.owners && task.owners.length > 0) {
        const row = document.createElement('div');
        row.className = 'owners-row excel-injected';
        const oh = document.createElement('span');
        oh.className = 'card-sec-head';
        oh.textContent = '👥 אחראים';
        row.appendChild(oh);
        task.owners.slice(0, 2).forEach(o => {
          const chip = document.createElement('span');
          const known = ['עידן','עמיחי','אביאם','ניתאי'];
          chip.className = 'owner-chip ' + (known.includes(o) ? 'owner-' + o : 'owner-other');
          chip.textContent = '👤 ' + o;
          row.appendChild(chip);
        });
        card.appendChild(row);
      }

      // Last-updated indicator (who + when)
      const updTxt = lastUpdateText(task);
      if (updTxt) {
        const u = document.createElement('div');
        u.className = 'card-updated excel-injected';
        u.textContent = updTxt;
        card.appendChild(u);
      }

      // Marketing badge for "שיווק" status
      if (task.status === 'שיווק' || task.expectedTask === 'שיווק') {
        const meta2 = card.querySelector('.kibbutz-meta');
        if (meta2 && !meta2.querySelector('.marketing-badge')) {
          const mb = document.createElement('span');
          mb.className = 'marketing-badge excel-injected';
          mb.textContent = '🛒 שיווק';
          meta2.appendChild(mb);
        }
      }

      // Calendar events for this kibbutz (from data.calendar map)
      const events = (data.calendar && data.calendar[name]) || [];
      events.forEach(ev => {
        const startDate = new Date(ev.start);
        const dateStr = startDate.toLocaleDateString('he-IL') + ' ' + startDate.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
        const el = document.createElement('div');
        el.className = 'calendar-event excel-injected' + (ev.isPast ? ' past' : '');
        el.textContent = (ev.isPast ? '✅ ' : '📅 ') + ev.type + ' — ' + dateStr + (ev.isPast ? ' (בוצע)' : '');
        card.appendChild(el);
      });

      // Single procedure/flow button for "באוויר" kibbutzim
      const types = (card.dataset.types || '').split(' ');
      if (types.includes('done')) {
        const procDone = parsed.proc;
        card.dataset.procDone = procDone ? 'true' : 'false';

        // Remove any stale legacy flags (kept here as cleanup)
        card.querySelectorAll('.flow-active-flag, .urgent-flag').forEach(e => e.remove());

        const btn = document.createElement('button');
        btn.className = 'proc-btn excel-injected ' + (procDone ? 'proc-done' : 'proc-pending');
        btn.textContent = procDone
          ? '🔵 זרימת נתונים פעילה (פרוצדורה בוצעה)'
          : '🚨 אין זרימת נתונים — לחץ לסימון פרוצדורה';
        btn.dataset.row = task.row;
        btn.dataset.currentValue = task.task || '';
        btn.dataset.kibbutzName = task.name;
        btn.onclick = (e) => {
          e.stopPropagation();
          toggleProcedure(btn);
        };
        card.appendChild(btn);
      }
    });

    // Field 2 — attach the EMS-tasks widget to EVERY site-mapped card (independent of
    // whether it had a Sheet row), once the shared cache has been synced.
    if (typeof applyCardEmsWidgets === 'function') applyCardEmsWidgets();
  }

  async function toggleProcedure(btn) {
    const row = parseInt(btn.dataset.row);
    const currentValue = btn.dataset.currentValue || '';
    const parsed = parseTaskField(currentValue);
    const name = btn.dataset.kibbutzName;

    const action = parsed.proc ? 'לבטל סימון פרוצדורה' : 'לסמן פרוצדורה כבוצעה';
    if (!confirm(`האם ${action} עבור "${name}"?`)) return;

    const newValue = serializeTaskField(!parsed.proc, parsed.step, parsed.note, parsed.cat, parsed.type);
    const isDone = parsed.proc;

    const body = {
      row: row,
      task: newValue,
      editor: 'proc_toggle'
    };
    try {
      const r = await fetch(SHEET_API, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(body)
      });
      const res = await r.json();
      if (res.ok) {
        const t = document.getElementById('toast');
        t.textContent = isDone ? '↩️ סימון פרוצדורה בוטל' : '✅ הפרוצדורה סומנה כבוצעה';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
        setTimeout(refreshData, 800);
      } else {
        alert('שגיאה: ' + JSON.stringify(res));
      }
    } catch (e) {
      alert('שגיאת רשת: ' + e.message);
    }
  }

  function renderPotentials(data) {
    if (!data || !data.potentials) return;
    const list = document.getElementById('potentialsList');
    if (!list) return;

    // Exclude potentials that already exist as active kibbutzim. Normalize (strip
    // apostrophes/quotes + collapse spaces) so "דגניה ב'" matches the card "דגניה ב".
    const pNorm = s => String(s || '').replace(/['"׳]/g, '').replace(/\s+/g, ' ').trim();
    const activeNames = new Set();
    document.querySelectorAll('.kibbutz').forEach(c => {
      if (c.dataset.name) activeNames.add(pNorm(c.dataset.name));
    });
    (data.tasks || []).forEach(t => { if (t.name) activeNames.add(pNorm(t.name)); });

    const filteredPotentials = data.potentials.filter(p => p.name && !activeNames.has(pNorm(p.name)));

    const byRegion = {};
    filteredPotentials.forEach(p => {
      if (!p.region) return;
      byRegion[p.region] = byRegion[p.region] || [];
      byRegion[p.region].push(p);
    });

    let html = '';
    Object.keys(byRegion).sort((a,b) => a.localeCompare(b, 'he')).forEach(region => {
      const items = byRegion[region];
      html += '<div class="potential-region">' + region + ' (' + items.length + ')</div>';
      items.forEach(p => {
        html += '<div class="potential-row" data-name="' + (p.name || '') + '"><span>' + (p.name || '') + '</span><span style="color:var(--text-light);font-size:11px;">#' + (p.serial || '') + '</span></div>';
      });
    });
    list.innerHTML = html;
  }

  function filterPotentials() {
    const q = document.getElementById('potentialSearch').value.trim();
    document.querySelectorAll('.potential-row').forEach(r => {
      const name = r.dataset.name || '';
      r.style.display = (!q || name.includes(q)) ? '' : 'none';
    });
  }

