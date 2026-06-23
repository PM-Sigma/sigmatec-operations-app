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

    // visible sandbox banner so it's obvious nothing is live
    window.addEventListener('DOMContentLoaded', function () {
      const b = document.createElement('div');
      b.textContent = '🧪 MOCK MODE — סביבת בדיקה לוקאלית · אין חיבור לגיליון/EMS אמיתי';
      b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#7c2d12;color:#fff;' +
        'font:600 12px Heebo,sans-serif;text-align:center;padding:4px 8px;letter-spacing:.3px;';
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
    const sbInsert = async (table, rows) => { const r = await realFetch(SB_URL + '/rest/v1/' + table, { method: 'POST', headers: Object.assign({}, baseH(),{ Prefer: 'return=minimal' }), body: JSON.stringify(rows) }); if (!r.ok) throw new Error('supabase insert ' + table + ' ' + r.status + ' ' + await r.text()); };
    const sbDelete = async (path) => { const r = await realFetch(SB_URL + '/rest/v1/' + path, { method: 'DELETE', headers: H }); if (!r.ok) throw new Error('supabase delete ' + path + ' ' + r.status); };

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
        orders: orders.map(o => ({ id: String(o.id), createdAt: o.created_at || '', createdBy: o.created_by || '', supplier: o.supplier || '', status: o.status || 'pending', items: o.items || [], expectedDate: o.expected_date || '', notes: o.notes || '', deliveredAt: o.delivered_at || '', distribution: o.distribution || {}, lastUpdated: o.last_updated ? String(o.last_updated) : '' })),
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
      order: b => { const id = b.id || genId('ord'); return ['orders', 'id', { id, created_at: b.createdAt || nowISO(), created_by: b.createdBy || '', supplier: b.supplier || '', status: b.status || 'pending', items: b.items || [], expected_date: b.expectedDate || '', notes: b.notes || '', delivered_at: b.status === 'delivered' ? (b.deliveredAt || nowISO()) : (b.deliveredAt || ''), distribution: b.distribution || {}, last_updated: nowISO() }, id]; },
      movement: b => { const id = b.id || genId('mov'); return ['movements', 'id', { id, date: b.date || nowISO(), product: b.product || '', from_location: b.fromLocation || '', to_location: b.toLocation || '', quantity: b.quantity || 0, reason: b.reason || 'manual', ref_id: b.refId || '', created_by: b.createdBy || '' }, id]; },
      requirement: b => { const id = b.id || genId('req'); return ['requirements', 'id', { id, created_at: b.createdAt || nowISO(), created_by: b.createdBy || '', kibbutz: b.kibbutz || '', contact_name: b.contactName || '', items: b.items || [], notes: b.notes || '', status: b.status || 'open', linked_order_id: b.linkedOrderId || '', fulfilled_at: b.status === 'fulfilled' ? (b.fulfilledAt || nowISO()) : (b.fulfilledAt || ''), last_updated: nowISO() }, id]; },
      attendance: b => { const id = b.id || genId('att'); return ['attendance', 'id', { id, date: b.date || nowISO(), person: b.person || '', day_type: b.dayType || '', note: b.note || '' }, id]; },
      setting: b => ['settings', 'key', { key: String(b.key || ''), value: b.value !== undefined ? b.value : null, updated_at: nowISO() }, b.key]
    };

    // visit: upsert the visit AND append any returned-equipment rows (mirrors appendVisit)
    async function writeVisit(b) {
      const id = b.id || genId('v');
      await sbUpsert('visits', 'id', { id, kibbutz: b.kibbutz || '', date: b.date || nowISO(), visitor: b.visitor || '', duration: b.duration || 0, contact: b.contact || '', products: b.products || [], products_other: b.productsOther || '', summary: b.summary || '', created_at: b.createdAt || nowISO(), workday: !!b.workday });
      if (Array.isArray(b.returnedItems) && b.returnedItems.length) {
        const rows = b.returnedItems.filter(it => it && it.name && it.qty > 0).map(it => ({ id: genId('ret'), visit_id: id, date: b.date || nowISO(), kibbutz: b.kibbutz || '', visitor: b.visitor || '', product: it.name, qty: it.qty, reason: it.reason || '', status: 'open' }));
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
          if (b.type === 'visit') return respond(await writeVisit(b));
          if (b.type === 'return') { await sbUpsert('returns', 'id', { id: b.id, status: b.status || 'open' }); return respond({ ok: true, id: b.id }); }
          if (b.type === 'emsCacheWrite') { await sbUpsert('ems_cache', 'id', { id: 1, tasks: b.tasks || [], synced_at: nowISO(), synced_by: b.syncedBy || '' }); return respond({ ok: true, cached: (b.tasks || []).length }); }
          if (b.type === 'emsQueueAdd') { const qid = genId('q'); await sbInsert('ems_queue', [{ payload: Object.assign({ id: qid, at: nowISO() }, b.item || {}) }]); return respond({ ok: true, id: qid }); }
          if (b.type === 'emsQueueClear') { const ids = (b.ids || []).map(x => '"' + String(x).replace(/"/g, '') + '"'); if (ids.length) await sbDelete('ems_queue?payload->>id=in.(' + ids.join(',') + ')'); return respond({ ok: true }); }
          const w = W[b.type]; if (!w) return realFetch(url, opts);
          const parts = w(b); await sbUpsert(parts[0], parts[1], parts[2]); return respond({ ok: true, id: parts[3] });
        };
        return run().catch(e => { console.error('[supabase] write failed: ' + ((b && b.type) || 'task'), e); throw e; });
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

  // ========================================
  // Edit modal logic
  // ========================================

  function switchTab(tabName) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tabName));
  }

  // ===========================================================
  // INVENTORY MANAGEMENT
  // ===========================================================
  const INV_LOCATIONS = ['עמיחי', 'אביאם', 'ניתאי', 'משרד'];
  const STOCK_HOLDERS = ['עמיחי', 'אביאם', 'ניתאי']; // אנשים שמחזיקים מלאי אישי (משרד הוא ברירת מחדל ליתר)
  const DEFECTIVE_LOCATION = 'תקול';                  // defective bucket — returns land here, not back in available stock
  const NON_KIBBUTZ_LOCATIONS = INV_LOCATIONS.concat([DEFECTIVE_LOCATION]); // excluded from the "stock at kibbutzim" matrix
  const ORDER_STATUSES = {
    pending_approval: { label: '🟣 ממתינה לאישור',     color: '#7c3aed' },
    pending:    { label: '🔴 ממתין להזמנה',          color: '#dc2626' },
    in_transit: { label: '🔵 בדרך',                   color: '#2563eb' },
    stuck:      { label: '🟠 תקוע',                   color: '#f97316' },
    at_port:    { label: '🟡 בנמל',                   color: '#eab308' },
    arrived:    { label: '🌸 הגיעה (טרם חולקה)',     color: '#f9a8d4' },
    delivered:  { label: '🟢 סופקה וחולקה',           color: '#10b981' }
  };

  function showPage(page) {
    if (page === 'attendance' && !canSeeAttendance()) page = 'kibbutz'; // private to Aviam/Idan
    if (page === 'ems' && !canUseEms()) page = 'kibbutz';               // EMS tasks — עידן/ניתאי/אביאם
    if (page === 'staff' && typeof canManageStaff === 'function' && !canManageStaff()) page = 'kibbutz'; // עידן + עמיחי only
    if (page === 'inventory' && getCurrentUser() === 'מתניה') page = 'kibbutz'; // מתניה doesn't handle inventory
    if (page === 'dev' && !(typeof canSeeDevTasks === 'function' && canSeeDevTasks())) page = 'kibbutz'; // עידן + עמיחי only
    document.getElementById('kibbutz-view').style.display    = page === 'kibbutz'    ? '' : 'none';
    document.getElementById('inventory-view').style.display  = page === 'inventory'  ? '' : 'none';
    document.getElementById('attendance-view').style.display = page === 'attendance' ? '' : 'none';
    document.getElementById('ems-view').style.display        = page === 'ems'        ? '' : 'none';
    document.getElementById('my-tasks-view').style.display   = page === 'mytasks'    ? '' : 'none';
    document.getElementById('calendar-view').style.display   = page === 'calendar'   ? '' : 'none';
    var _sv = document.getElementById('staff-view'); if (_sv) _sv.style.display = page === 'staff' ? '' : 'none';
    var _dv = document.getElementById('dev-view'); if (_dv) _dv.style.display = page === 'dev' ? '' : 'none';
    document.querySelectorAll('.page-nav button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    if (page === 'inventory')  renderInventory();
    if (page === 'attendance') renderAttendanceReport();
    if (page === 'ems')        renderEmsPage();
    if (page === 'mytasks')    renderMyTasks();
    if (page === 'calendar')   renderCompanyCalendar();
    if (page === 'staff' && typeof renderStaff === 'function') renderStaff();
    if (page === 'dev' && typeof renderDevTasks === 'function') renderDevTasks();
    const fab = document.getElementById('visitFab');
    if (fab) {
      const meF = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
      const isField = (typeof ATT_PEOPLE !== 'undefined' && ATT_PEOPLE.indexOf(meF) !== -1);
      fab.style.display = (page === 'kibbutz' && isField) ? '' : 'none';   // field staff (אביאם/ניתאי) only — office users don't log visits
      fab.textContent = '📋 תיעוד נוכחות';
    }
  }

  // ===== Attendance missing-days reminder (אביאם / ניתאי) =====
  // Workdays (Sun–Thu) in the last 31 calendar days, floored at 2026-05-31 (tracking start),
  // up to yesterday, with NO visit AND NO attendance entry for the person → animated popup
  // next time THEY open the app. Pops for אביאם and ניתאי, each for their own missing days.
  const ATT_REMINDER_FLOOR = new Date(2026, 4, 31);   // 31.05.2026 inclusive
  function personMissingDays(person) {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const logged = new Set();
    (window.SHEET_DATA?.visits || []).filter(v => v.visitor === person)
      .forEach(v => { if (v.date) logged.add(ymd(new Date(v.date))); });
    (window.SHEET_DATA?.attendance || []).filter(a => a.person === person)
      .forEach(a => { if (a.date) logged.add(ymd(new Date(a.date))); });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const floor = new Date(ATT_REMINDER_FLOOR); floor.setHours(0, 0, 0, 0);
    const start = new Date(today); start.setDate(start.getDate() - 31);   // last 31 days
    if (start < floor) start.setTime(floor.getTime());                    // never before tracking start
    const missing = [];
    for (const d = new Date(start); d < today; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();               // 0=Sun … 5=Fri, 6=Sat
      if (dow === 5 || dow === 6) continue; // Israeli weekend
      if (!logged.has(ymd(d))) missing.push(new Date(d));
    }
    return missing.sort((a, b) => a - b);
  }
  function maybeShowAttendanceReminder() {
    const me = getCurrentUser();
    if (ATT_PEOPLE.indexOf(me) === -1) return;   // only אביאם / ניתאי
    if (window._attReminderShown) return;        // once per session
    const missing = personMissingDays(me);
    if (!missing.length) return;
    const head = document.getElementById('aviamReminderHead');
    if (head) head.textContent = me + ', חסר תיעוד!';
    document.getElementById('aviamReminderList').innerHTML = missing
      .map(d => d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' }))
      .join('<br>');
    document.getElementById('aviamReminderModal').classList.add('open');
    window._attReminderShown = true;
  }

  // ===== Quick attendance/visit FAB =====
  // אביאם/ניתאי get the full attendance flow: date → day type → (field only) kibbutz.
  // Everyone else gets the plain "pick a kibbutz → visit form".
  function openVisitQuick() {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    const isAtt = ATT_PEOPLE.indexOf(me) !== -1;
    const sel = document.getElementById('visitQuickKibbutz');
    const names = Array.from(document.querySelectorAll('.kibbutz'))
      .map(c => c.dataset.name).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'he'));
    const last = localStorage.getItem('last_visit_kibbutz') || '';
    sel.innerHTML = '<option value="">-- בחר קיבוץ --</option>' +
      names.map(n => `<option value="${n}" ${n === last ? 'selected' : ''}>${n}</option>`).join('');
    const dateEl = document.getElementById('vqDate'); if (dateEl) dateEl.value = todayYmd();
    document.getElementById('vqTitle').textContent = isAtt ? '📋 תיעוד נוכחות' : '📍 תיעוד ביקור מהיר';
    document.getElementById('vqSub').textContent = isAtt
      ? 'בחר תאריך וסוג יום. ביום שטח גם תבחר קיבוץ ויפתח טופס ביקור.'
      : 'בחר קיבוץ ונפתח לך ישר את טופס הביקור.';
    document.getElementById('vqDayTypes').style.display = isAtt ? '' : 'none';
    window._vqType = 'field';
    vqSetType('field');
    document.getElementById('visitQuickModal').classList.add('open');
  }
  function vqSetType(type) {
    window._vqType = type;
    document.querySelectorAll('.vq-dt').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    document.getElementById('vqOtherWrap').style.display = (type === 'other') ? '' : 'none';
    document.getElementById('vqKibbutzWrap').style.display = (type === 'field') ? '' : 'none';   // kibbutz only for field days
  }
  function visitQuickGo() {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    const isAtt = ATT_PEOPLE.indexOf(me) !== -1;
    const type = isAtt ? (window._vqType || 'field') : 'field';
    const dateVal = document.getElementById('vqDate').value;
    if (!dateVal) { alert('נא לבחור תאריך'); return; }
    const isoDate = new Date(dateVal + 'T12:00:00').toISOString();

    // אביאם/ניתאי, non-field day → save attendance directly (no kibbutz needed)
    if (isAtt && type !== 'field') {
      const note = (type === 'other') ? (document.getElementById('vqOther').value || '').trim() : '';
      if (type === 'other' && !note) { alert('נא לפרט מה היה ביום (אחר)'); return; }
      fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'attendance', person: me, dayType: type, note, date: isoDate }) })
        .then(r => r.json()).then(res => {
          if (res && res.ok) {
            if (window.SHEET_DATA) {
              window.SHEET_DATA.attendance = window.SHEET_DATA.attendance || [];
              window.SHEET_DATA.attendance.push({ id: res.id, person: me, dayType: type, note, date: isoDate });
            }
            const t = document.getElementById('toast');
            t.textContent = '✅ ' + ATT_LABELS[type] + (note ? ' (' + note + ')' : '') + ' נשמר';
            t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
            const av = document.getElementById('attendance-view');
            if (av && av.style.display !== 'none') renderAttendanceReport();
          } else { alert('שגיאה בשמירה'); }
        }).catch(() => alert('שגיאה בשמירה'));
      document.getElementById('visitQuickModal').classList.remove('open');
      return;
    }

    // Field day (or non-attendance user) → open the visit form for the chosen kibbutz
    const name = document.getElementById('visitQuickKibbutz').value;
    if (!name) { alert('נא לבחור קיבוץ'); return; }
    const card = document.querySelector('.kibbutz[data-name="' + name + '"]');
    if (!card) { alert('קיבוץ לא נמצא'); return; }
    document.getElementById('visitQuickModal').classList.remove('open');
    openEditModal(card);
    switchTab('visit');
    const visitorSel = document.getElementById('visitor');
    if (visitorSel && me) { visitorSel.value = me; if (typeof onVisitorChange === 'function') onVisitorChange(me); }
    if (isAtt && typeof setAviamDayType === 'function') setAviamDayType('field');
    const vd = document.getElementById('visitDate'); if (vd) vd.value = dateVal;
  }

  function invShowTab(tab) {
    document.querySelectorAll('.inv-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.invTab === tab));
    document.querySelectorAll('.inv-section').forEach(s => s.classList.toggle('active', s.id === 'inv-section-' + tab));
    renderInventory();
  }

  function renderInventory() {
    invRenderOrders();
    invRenderStock();
    invRenderKibbutzInventory();
    invRenderReturns();
    invRenderProducts();
    if (typeof renderLowStockAlert === 'function') renderLowStockAlert();
  }

  // ===== CUSTOMER REQUIREMENTS =====
  const REQ_STATUSES = {
    open:        { label: '🆕 פתוחה',    color: '#dc2626', bg: '#fee2e2' },
    in_progress: { label: '🔄 בטיפול',   color: '#f59e0b', bg: '#fef3c7' },
    fulfilled:   { label: '✅ סופקה',    color: '#10b981', bg: '#d1fae5' },
    cancelled:   { label: '❌ בוטלה',    color: '#64748b', bg: '#f1f5f9' }
  };
  let reqItems = [];

  function invRenderRequirements() {
    const root = document.getElementById('invRequirementsList');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const all = (window.SHEET_DATA && window.SHEET_DATA.requirements) || [];
    const localExtra = JSON.parse(localStorage.getItem('local_requirements_v1') || '[]');
    const requirements = [...all, ...localExtra.filter(r => !all.find(x => x.id === r.id))];
    const filter = document.getElementById('invReqFilter')?.value;
    // Default filter = 'open' (show open by default to make pending requirements salient)
    const effFilter = filter === undefined || filter === null ? 'open' : filter;
    const filtered = effFilter ? requirements.filter(r => (r.status || 'open') === effFilter) : requirements;
    if (filtered.length === 0) {
      root.innerHTML = `<div style="padding:20px;text-align:center;color:#64748b;">
        אין דרישות ${effFilter === 'open' ? 'פתוחות' : 'בסינון הזה'}. לחץ "+ דרישה חדשה"
      </div>`;
      return;
    }
    let html = '<table class="inv-table"><thead><tr><th>תאריך</th><th>סטטוס</th><th>קיבוץ</th><th>איש קשר</th><th>פריטים</th><th>נוצר ע"י</th><th>הערות</th><th>פעולות</th></tr></thead><tbody>';
    filtered.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).forEach(r => {
      const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('he-IL') : '—';
      const st = REQ_STATUSES[r.status || 'open'] || REQ_STATUSES.open;
      const itemsStr = (r.items || []).map(i => `${i.name} ×${i.qty}`).join('<br>');
      const fulfillBtn = (r.status === 'open' || r.status === 'in_progress')
        ? `<button class="inv-btn small" style="background:#d1fae5;color:#065f46;border:1px solid #10b981;" onclick="quickReqStatus('${r.id}','fulfilled',this)">✅ סופקה</button>` : '';
      html += `<tr>
        <td data-label="תאריך" style="white-space:nowrap;">${date}</td>
        <td data-label="סטטוס"><span class="status-pill-inv" style="background:${st.bg};color:${st.color};">${st.label}</span></td>
        <td data-label="קיבוץ">${r.kibbutz || '—'}</td>
        <td data-label="איש קשר">${r.contactName || '—'}</td>
        <td data-label="פריטים">${itemsStr || '—'}</td>
        <td data-label="נוצר ע&quot;י">${r.createdBy || '—'}</td>
        <td data-label="הערות" style="max-width:200px;font-size:11px;">${(r.notes||'').replace(/</g,'&lt;')}</td>
        <td class="actions-cell">${fulfillBtn} <button class="inv-btn small" onclick="invEditRequirement('${r.id}')">✏️ ערוך</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  function populateReqKibbutzDropdown() {
    const sel = document.getElementById('invReqKibbutz');
    if (!sel) return;
    const tasks = (window.SHEET_DATA && window.SHEET_DATA.tasks) || [];
    const names = Array.from(new Set(tasks.map(t => t.name).filter(Boolean)))
      .sort((a,b) => a.localeCompare(b,'he'));
    const current = sel.value;
    sel.innerHTML = '<option value="">-- בחר --</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (current) sel.value = current;
  }

  function renderReqItems() {
    const wrap = document.getElementById('invReqItems');
    if (!wrap) return;
    if (reqItems.length === 0) {
      wrap.innerHTML = '<div style="font-size:11px;color:#94a3b8;font-style:italic;text-align:center;">לחץ "+ הוסף פריט"</div>';
      return;
    }
    wrap.innerHTML = reqItems.map((it, idx) => `
      <div style="display:flex;gap:6px;align-items:center;margin:4px 0;background:white;padding:5px 8px;border-radius:6px;">
        <select onchange="reqItems[${idx}].name = this.value" style="flex:1;padding:4px 6px;border-radius:4px;border:1px solid #e2e8f0;">
          ${getActiveProducts().map(pr => pr.name).map(p => `<option value="${p}" ${it.name === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${it.qty}" onchange="reqItems[${idx}].qty = parseInt(this.value)||1" style="width:60px;padding:3px 6px;border-radius:4px;border:1px solid #e2e8f0;text-align:center;">
        <button type="button" onclick="reqItems.splice(${idx},1); renderReqItems();" style="background:#dc2626;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">×</button>
      </div>
    `).join('');
  }

  function addRequirementItemRow() {
    reqItems.push({ name: getActiveProducts()[0]?.name || 'מונה EM133', qty: 1 });
    renderReqItems();
  }

  function invNewRequirement() {
    if (!checkEditPermission()) return;
    window.invEditingReqId = null;
    reqItems = [];
    populateReqKibbutzDropdown();
    document.getElementById('invReqTitle').textContent = '📋 דרישה חדשה';
    document.getElementById('invReqKibbutz').value = '';
    document.getElementById('invReqContact').value = '';
    document.getElementById('invReqDate').value = todayYmd();
    document.getElementById('invReqNotes').value = '';
    document.getElementById('invReqStatus').value = 'open';
    renderReqItems();
    document.getElementById('invRequirementModal').classList.add('open');
  }

  function invEditRequirement(id) {
    if (!checkEditPermission()) return;
    const all = (window.SHEET_DATA?.requirements || []).concat(JSON.parse(localStorage.getItem('local_requirements_v1') || '[]'));
    const r = all.find(x => x.id === id);
    if (!r) return alert('לא נמצא');
    window.invEditingReqId = id;
    reqItems = [...(r.items || [])];
    populateReqKibbutzDropdown();
    document.getElementById('invReqTitle').textContent = '📋 ערוך דרישה';
    document.getElementById('invReqKibbutz').value = r.kibbutz || '';
    document.getElementById('invReqContact').value = r.contactName || '';
    document.getElementById('invReqDate').value = r.createdAt ? r.createdAt.slice(0,10) : todayYmd();
    document.getElementById('invReqNotes').value = r.notes || '';
    document.getElementById('invReqStatus').value = r.status || 'open';
    renderReqItems();
    document.getElementById('invRequirementModal').classList.add('open');
  }

  async function invSaveRequirement(btn) {
    const kibbutz = document.getElementById('invReqKibbutz').value;
    if (!kibbutz) { alert('בחר קיבוץ'); return; }
    if (reqItems.length === 0) { alert('הוסף לפחות פריט אחד'); return; }
    const createdBy = getCurrentUser() || 'אנונימי';
    const dateRaw = document.getElementById('invReqDate').value;
    const createdAt = dateRaw ? new Date(dateRaw + 'T12:00:00').toISOString() : new Date().toISOString();
    const body = {
      type: 'requirement',
      kibbutz: kibbutz,
      contactName: document.getElementById('invReqContact').value.trim(),
      createdAt: createdAt,
      createdBy: createdBy,
      items: reqItems,
      notes: document.getElementById('invReqNotes').value.trim(),
      status: document.getElementById('invReqStatus').value
    };
    if (window.invEditingReqId) body.id = window.invEditingReqId;

    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        // Auto-append to kibbutz status (similar to visits)
        const dateShort = new Date(createdAt).toLocaleDateString('he-IL');
        const contactPart = body.contactName ? ` (${body.contactName})` : '';
        const itemsShort = reqItems.map(i => `${i.qty}× ${i.name}`).join(', ');
        const reqLine = `🛒 דרישה ${dateShort}${contactPart}: ${itemsShort}`;
        autoAppendVisitToStatus(kibbutz, dateShort, createdBy, reqLine);
        document.getElementById('invRequirementModal').classList.remove('open');
        setTimeout(refreshData, 1000);
        const t = document.getElementById('toast');
        t.textContent = '✅ הדרישה נשמרה ועודכנה בסטטוס הקיבוץ';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
      } else if (data.error) {
        // Fallback to localStorage if Apps Script doesn't yet know type='requirement'
        const local = JSON.parse(localStorage.getItem('local_requirements_v1') || '[]');
        const id = body.id || ('req_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
        const idx = local.findIndex(x => x.id === id);
        const record = { ...body, id };
        if (idx >= 0) local[idx] = record; else local.push(record);
        localStorage.setItem('local_requirements_v1', JSON.stringify(local));
        document.getElementById('invRequirementModal').classList.remove('open');
        invRenderRequirements();
        const t = document.getElementById('toast');
        t.textContent = '⚠️ נשמר מקומית (Apps Script v5 לא פרוס עדיין)';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000);
      }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  async function quickReqStatus(id, newStatus, btn) {
    if (!checkEditPermission()) return;
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'requirement', id: id, status: newStatus })
      });
      const data = await res.json();
      if (data.ok) setTimeout(refreshData, 800);
      else { // localStorage fallback
        const local = JSON.parse(localStorage.getItem('local_requirements_v1') || '[]');
        const rec = local.find(x => x.id === id);
        if (rec) { rec.status = newStatus; localStorage.setItem('local_requirements_v1', JSON.stringify(local)); invRenderRequirements(); }
      }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  // ===== AVIAM DAILY ATTENDANCE =====
  const ATT_LABELS = { field:'🌾 יום שטח', office:'🏢 משרד', wfh:'🏠 מהבית', reserve:'🪖 מילואים', vacation:'🌴 חופש', off:'🚫 לא בעבודה', other:'➕ אחר' };
  const ATT_COLORS = { field:['#d1fae5','#065f46'], office:['#dbeafe','#1e40af'], wfh:['#ede9fe','#4c1d95'], reserve:['#fee2e2','#991b1b'], vacation:['#fef3c7','#92400e'], off:['#f1f5f9','#475569'], other:['#e0e7ff','#3730a3'] };
  window.aviamDayType = 'field';
  window.attendanceViewYear  = new Date().getFullYear();
  window.attendanceViewMonth = new Date().getMonth();

  function setAviamDayType(type) {
    window.aviamDayType = type;
    document.querySelectorAll('.day-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const isField = type === 'field';
    document.getElementById('visitFieldForm').style.display = isField ? '' : 'none';
    document.getElementById('visitSimpleForm').style.display = isField ? 'none' : '';
    const otherWrap = document.getElementById('aviamOtherWrap');
    if (otherWrap) otherWrap.style.display = (type === 'other') ? '' : 'none';
    if (!isField) {
      const d = document.getElementById('aviamSimpleDate');
      if (d && !d.value) d.value = todayYmd();
    }
  }

  function saveAttendance(btn) {
    const dateVal = document.getElementById('aviamSimpleDate').value;
    if (!dateVal) { alert('נא לבחור תאריך'); return; }
    const dayType = window.aviamDayType || 'office';
    const note = (dayType === 'other') ? (document.getElementById('aviamOtherText').value || '').trim() : '';
    if (dayType === 'other' && !note) { alert('נא לפרט מה היה ביום (אחר)'); return; }
    const person = (document.getElementById('visitor') && document.getElementById('visitor').value) || attPerson();
    setBtnLoading(btn, true);
    const isoDate = new Date(dateVal + 'T12:00:00').toISOString();
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'attendance', person: person, dayType, note, date: isoDate })
    }).then(r => r.json()).then(res => {
      if (res && res.ok) {
        if (window.SHEET_DATA) {
          window.SHEET_DATA.attendance = window.SHEET_DATA.attendance || [];
          window.SHEET_DATA.attendance.push({ id: res.id, person: person, dayType, note, date: isoDate });
        }
        const t = document.getElementById('toast');
        t.textContent = '✅ ' + ATT_LABELS[dayType] + (note ? ' (' + note + ')' : '') + ' נשמר';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
        closeModal();
        if (document.getElementById('attendance-view').style.display !== 'none') renderAttendanceReport();
      }
    }).catch(() => {
      const t = document.getElementById('toast');
      t.textContent = '⚠️ שגיאה בשמירה'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
    }).finally(() => setBtnLoading(btn, false));
  }

  function changeAttendanceMonth(delta) {
    window.attendanceViewMonth += delta;
    if (window.attendanceViewMonth > 11) { window.attendanceViewMonth = 0; window.attendanceViewYear++; }
    if (window.attendanceViewMonth < 0)  { window.attendanceViewMonth = 11; window.attendanceViewYear--; }
    renderAttendanceReport();
  }

  function renderAttendanceReport() {
    const year  = window.attendanceViewYear;
    const month = window.attendanceViewMonth;
    const heMonths = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const lbl = document.getElementById('attendanceMonthLabel');
    if (lbl) lbl.textContent = heMonths[month] + ' ' + year;

    const who = attPerson();   // אביאם / ניתאי — each report is private to that person
    const titleEl = document.getElementById('attendanceTitle');
    if (titleEl) titleEl.textContent = '📅 נוכחות חודשית — ' + who;
    // עידן may switch between people; field users see only themselves
    const toggle = document.getElementById('attPersonToggle');
    if (toggle) {
      if (isIdan()) { toggle.style.display = 'flex';
        toggle.innerHTML = ATT_PEOPLE.map(p => '<button class="day-type-btn ' + (p === who ? 'active' : '') + '" onclick="setAttPerson(\'' + p + '\')">' + p + '</button>').join('');
      } else { toggle.style.display = 'none'; }
    }

    // Non-field days from ATTENDANCE tab (carry the "אחר" note)
    const attRows = ((window.SHEET_DATA && window.SHEET_DATA.attendance) || [])
      .filter(a => a.person === who)
      .map(a => ({ date: new Date(a.date), type: a.dayType, kibbutz: '', duration: 0, note: a.note || '' }))
      .filter(a => a.date.getFullYear() === year && a.date.getMonth() === month);

    // Field days from VISITS (carry the summary so it can be expanded under the row)
    const fieldRows = ((window.SHEET_DATA && window.SHEET_DATA.visits) || [])
      .filter(v => v.visitor === who)
      .map(v => ({ date: new Date(v.date), type: 'field', kibbutz: v.kibbutz || '', duration: parseFloat(v.duration) || 0, summary: v.summary || '', id: v.id || '', workday: !!v.workday }))
      .filter(v => v.date.getFullYear() === year && v.date.getMonth() === month);

    // Merge by calendar date — same day with 2 kibbutzim → ONE row (like the visits report).
    const all = mergeAttendanceByDate([...attRows, ...fieldRows]);
    window._attendanceRows = all; // snapshot for the PDF export

    // Summary — count by merged-day type (a day counts once), hours summed across field visits
    const counts = {};
    all.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    // Hours stat: work days counted as ~8h, shown alongside the loose hours.
    const totalWorkdays = all.reduce((s, r) => s + (r.workdays || 0), 0);
    const totalLooseHours = all.reduce((s, r) => s + (r.hourHours || 0), 0);
    const approxTotal = Math.round((totalLooseHours + totalWorkdays * WORKDAY_HOURS) * 100) / 100;
    let hoursChip = '';
    if (totalWorkdays || totalLooseHours) {
      const segs = [];
      if (totalWorkdays) segs.push(totalWorkdays + ' ימי עבודה');
      if (totalLooseHours) segs.push(totalLooseHours + "ש'");
      hoursChip = `<span class="att-chip" style="background:#f0f9ff;color:#1e40af;">⏱️ ${segs.join(' + ')} (≈${approxTotal}ש' סה"כ)</span>`;
    }
    const summaryEl = document.getElementById('attendanceSummary');
    if (summaryEl) {
      summaryEl.innerHTML = Object.keys(ATT_LABELS)
        .filter(k => counts[k])
        .map(k => {
          const [bg,color] = ATT_COLORS[k];
          return `<span class="att-chip" style="background:${bg};color:${color};">${ATT_LABELS[k]}: ${counts[k]}</span>`;
        }).join('') +
        hoursChip +
        (totalWorkdays ? `<span class="att-chip" style="background:#eef2ff;color:#3730a3;font-size:10px;">יום עבודה ≈ ${WORKDAY_HOURS}ש'</span>` : '') +
        `<span class="att-chip" style="background:#f3f4f6;color:#374151;">סה"כ ימים: ${all.length}</span>` +
        // Reserve-duty form 3010 — rendered to the left of "סה"כ ימים" (RTL: appended last)
        `<a href="https://www.miluim.idf.il/personalzone/milforms/form-3010" target="_blank" rel="noopener"
            class="att-chip" style="background:#1b2a4a;color:white;text-decoration:none;font-weight:700;">🪖 הפקת 3010</a>`;
    }

    // Table
    const tableEl = document.getElementById('attendanceTable');
    if (!tableEl) return;
    if (!all.length) {
      tableEl.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">אין נתונים לחודש זה</div>';
      return;
    }
    const rows = all.map((r, i) => {
      const [bg,color] = ATT_COLORS[r.type] || ['#f3f4f6','#374151'];
      const dateStr = r.date.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', weekday:'short' });
      const kib = r.kibbutz ? `<span style="color:#475569;">${r.kibbutz}</span>` : '—';
      // hours column: work days shown as "יום עבודה" (priced as a day), loose hours as Xש'
      let dur;
      if (r.type === 'field') {
        const segs = [];
        if (r.workdays) segs.push(r.workdays === 1 ? 'יום עבודה' : r.workdays + ' ימי עבודה');
        if (r.hourHours > 0) segs.push(r.hourHours + "ש'");
        dur = segs.join(' + ') || '—';
      } else {
        dur = r.duration > 0 ? r.duration + "ש'" : '—';
      }
      // expandable when a field day has visit summaries, or an "אחר" day has a note
      const fieldDetail = (r.visits || []).filter(v => v.summary);
      const hasDetail = (r.type === 'field' && fieldDetail.length) || (r.type === 'other' && r.note);
      const expandCell = hasDetail
        ? `<button onclick="toggleAttDetail(${i})" id="attToggle-${i}" style="background:#eef2ff;color:#3730a3;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;font-weight:700;">+</button>`
        : '';
      const mainRow = `<tr>
        <td>${dateStr}</td>
        <td><span class="att-badge" style="background:${bg};color:${color};">${ATT_LABELS[r.type]}</span></td>
        <td>${kib}</td>
        <td style="text-align:center;">${dur}</td>
        <td style="text-align:center;">${expandCell}</td>
      </tr>`;
      let detailHtml = '';
      if (r.type === 'field' && fieldDetail.length) {
        detailHtml = (r.visits || []).map(v =>
          `<div style="margin-bottom:6px;"><strong>🏘 ${(v.kibbutz||'—')}${v.workday ? ' (יום עבודה)' : (v.duration ? ' ('+v.duration+'ש\')' : '')}:</strong> ${(v.summary||'').replace(/</g,'&lt;') || '<span style="color:#94a3b8;">ללא סיכום</span>'}</div>`
        ).join('');
      } else if (r.type === 'other' && r.note) {
        detailHtml = `<strong>➕ פירוט:</strong> ${r.note.replace(/</g,'&lt;')}`;
      }
      const detailRow = hasDetail
        ? `<tr id="attDetail-${i}" style="display:none;"><td colspan="5" style="background:#f8fafc;text-align:right;padding:10px 14px;color:#334155;font-size:13px;line-height:1.6;border-right:3px solid #6366f1;">${detailHtml}</td></tr>`
        : '';
      return mainRow + detailRow;
    }).join('');
    tableEl.innerHTML = `<table class="att-table">
      <thead><tr><th>תאריך</th><th>סוג יום</th><th>קיבוץ</th><th>שעות</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Merge attendance/field entries by calendar date → one row per day.
  // A day with field visits becomes a field row (kibbutzim joined, hours summed, per-visit
  // detail kept); otherwise it's the non-field attendance type (with its "אחר" note).
  function mergeAttendanceByDate(entries) {
    const byDay = {};
    entries.forEach(e => {
      const k = e.date.getFullYear() + '-' + e.date.getMonth() + '-' + e.date.getDate();
      if (!byDay[k]) byDay[k] = { date: e.date, fields: [], others: [] };
      if (e.type === 'field') byDay[k].fields.push(e); else byDay[k].others.push(e);
    });
    return Object.values(byDay).map(d => {
      if (d.fields.length) {
        const kibbutzim = [...new Set(d.fields.map(f => f.kibbutz).filter(Boolean))];
        const workdays = d.fields.filter(f => f.workday).length;
        const hourHours = d.fields.filter(f => !f.workday).reduce((s, f) => s + (f.duration || 0), 0);
        return {
          date: d.date, type: 'field',
          kibbutz: kibbutzim.join(', '),
          workdays: workdays,
          hourHours: hourHours,
          duration: hourHours + workdays * WORKDAY_HOURS,   // ≈ total hours (work day ≈ 8h)
          visits: d.fields.map(f => ({ kibbutz: f.kibbutz, summary: f.summary, duration: f.duration, workday: f.workday })),
          note: ''
        };
      }
      const o = d.others[0];
      return { date: d.date, type: o.type, kibbutz: '', duration: 0, visits: [], note: o.note || '' };
    }).sort((a, b) => a.date - b.date);
  }

  // Expand/collapse a field-day's visit summary under its row
  function toggleAttDetail(i) {
    const row = document.getElementById('attDetail-' + i);
    const btn = document.getElementById('attToggle-' + i);
    if (!row) return;
    const open = row.style.display !== 'none';
    row.style.display = open ? 'none' : '';
    if (btn) btn.textContent = open ? '+' : '−';
  }

  // Export the current month's attendance to a printable PDF (browser "Save as PDF")
  function downloadAttendancePDF() {
    const rows = window._attendanceRows || [];
    if (!rows.length) { alert('אין נתונים להורדה בחודש זה'); return; }
    const monthLabel = document.getElementById('attendanceMonthLabel')?.textContent || '';
    const body = rows.map(r => {
      const dateStr = r.date.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', weekday:'short' });
      let dur;
      if (r.type === 'field') {
        const segs = [];
        if (r.workdays) segs.push(r.workdays === 1 ? 'יום עבודה' : r.workdays + ' ימי עבודה');
        if (r.hourHours > 0) segs.push(r.hourHours + " ש'");
        dur = segs.join(' + ') || '—';
      } else { dur = r.duration > 0 ? r.duration + " ש'" : '—'; }
      // Field day: per-visit detail (kibbutz + hours + summary). "אחר" day: the note.
      let detail = '';
      if (r.type === 'field' && (r.visits || []).length) {
        detail = r.visits.map(v => `<div><strong>${(v.kibbutz||'—')}${v.duration ? ' ('+v.duration+"ש')" : ''}:</strong> ${(v.summary||'').replace(/</g,'&lt;')}</div>`).join('');
      } else if (r.type === 'other' && r.note) {
        detail = r.note.replace(/</g,'&lt;');
      }
      return `<tr><td>${dateStr}</td><td>${ATT_LABELS[r.type]}</td><td>${r.kibbutz || '—'}</td><td style="text-align:center;">${dur}</td><td>${detail}</td></tr>`;
    }).join('');
    const counts = {};
    rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    const totalWorkdays = rows.reduce((s, r) => s + (r.workdays || 0), 0);
    const totalLooseHours = rows.reduce((s, r) => s + (r.hourHours || 0), 0);
    const approxTotal = Math.round((totalLooseHours + totalWorkdays * WORKDAY_HOURS) * 100) / 100;
    const hoursSegs = [];
    if (totalWorkdays) hoursSegs.push(`${totalWorkdays} ימי עבודה`);
    if (totalLooseHours) hoursSegs.push(`${totalLooseHours}ש'`);
    const chips = Object.keys(ATT_LABELS).filter(k => counts[k])
      .map(k => `${ATT_LABELS[k]}: ${counts[k]}`).join(' · ') +
      (hoursSegs.length ? ` · ⏱️ ${hoursSegs.join(' + ')} (≈${approxTotal}ש')` : '');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">
      <title>נוכחות ${attPerson()} — ${monthLabel}</title>
      <style>
        body{font-family:Arial,'Heebo',sans-serif;padding:24px;color:#1b2a4a;}
        h1{font-size:20px;margin:0 0 4px;} .sub{color:#64748b;font-size:13px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:13px;} th,td{border:1px solid #e2e8f0;padding:7px 9px;text-align:right;}
        th{background:#1b2a4a;color:white;} tr:nth-child(even) td{background:#f8fafc;}
      </style></head><body>
      <h1>📅 דוח נוכחות — ${attPerson()}</h1>
      <div class="sub">${monthLabel} · ${chips}</div>
      <table><thead><tr><th>תאריך</th><th>סוג יום</th><th>קיבוץ</th><th>שעות</th><th>סיכום ביקור</th></tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    w.document.close();
  }

  // ===== MEETING MODE — personal UX boost for Idan during the team meeting =====
  // Doesn't lock anyone out. Just makes updates faster locally for the active user.
  function isMeetingMode() { return localStorage.getItem('meeting_mode_v1') === '1'; }
  function toggleMeetingMode() {
    const cur = isMeetingMode();
    localStorage.setItem('meeting_mode_v1', cur ? '0' : '1');
    document.body.classList.toggle('meeting-mode', !cur);
    updateMeetingBadge();
    if (!cur) {
      // Entering meeting mode: auto-expand all collapsed sections for fast scanning
      document.querySelectorAll('.section-body.collapsed').forEach(b => b.classList.remove('collapsed'));
      document.querySelectorAll('.section-toggle').forEach(t => t.textContent = '▼');
      if (typeof applyCardLastVisit === 'function') applyCardLastVisit();   // ensure last-visit lines are present
      setTimeout(() => { const s = document.getElementById('searchInput'); if (s) s.focus(); }, 100);   // fast find
    }
    const t = document.getElementById('toast');
    t.textContent = cur ? '🔓 מצב ישיבה כובה' : '🚀 מצב ישיבה הופעל — הטופס מהיר יותר';
    t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
  }
  function updateMeetingBadge() {
    const btn = document.getElementById('meetingBadge');
    if (!btn) return;
    btn.textContent = isMeetingMode() ? '🚀 מצב ישיבה' : '💬 ישיבה';
    btn.style.background = isMeetingMode() ? '#10b981' : '';
    btn.style.color = isMeetingMode() ? 'white' : '';
  }
  // Always permits edit — meeting mode is now a personal boost, not a lock.
  function checkEditPermission() { return true; }

  // Lock editorName + visitor to the current user for everyone except Idan.
  // Idan can pick any name from the dropdowns.
  function applyUserRestrictions() {
    const user = getCurrentUser();
    const idan = isIdan();

    const editorWrap   = document.getElementById('editorNameWrap');
    const editorDisplay = document.getElementById('editorNameDisplay');
    const visitorWrap   = document.getElementById('visitorFieldWrap');
    const visitorDisplay = document.getElementById('visitorFieldDisplay');

    if (idan) {
      // Idan keeps free choice, but the fields DEFAULT to him (editable) so he
      // isn't forced to pick himself every time.
      if (editorWrap)   editorWrap.style.display   = 'none';   // [F] editor is always the logged-in user — never shown/picked
      if (editorDisplay) editorDisplay.style.display = 'none';
      if (visitorWrap)  visitorWrap.style.display   = '';
      if (visitorDisplay) visitorDisplay.style.display = 'none';
      const ed = document.getElementById('editorName');
      if (ed) ed.value = user;
      const vi = document.getElementById('visitor');
      if (vi && !vi.value) { vi.value = user; onVisitorChange(user); }
    } else {
      if (editorWrap)   editorWrap.style.display   = 'none';
      if (editorDisplay) editorDisplay.style.display = 'none';   // [F] no need to show who updates — always the logged-in user
      document.getElementById('editorName').value = user;

      if (visitorWrap)  visitorWrap.style.display   = 'none';
      if (visitorDisplay) {
        visitorDisplay.style.display = '';
        visitorDisplay.textContent   = '👤 מי ביקר: ' + (user || '—');
      }
      document.getElementById('visitor').value = user;
      onVisitorChange(user);
    }
  }

  // Returns the standard "loading" placeholder if data not yet loaded; null otherwise
  function invLoadingPlaceholder() {
    if (window.dataLoaded) return null;
    return '<div style="padding:30px;text-align:center;color:#64748b;"><span class="btn-spinner" style="color:#2563eb;width:18px;height:18px;border-width:3px;"></span><div style="margin-top:8px;font-size:13px;">⏳ טוען נתונים מהגיליון...</div></div>';
  }

  // ===== Returned defective equipment =====
  // Logged to the RETURNS sheet AND, on a new visit, moved out of the kibbutz to the
  // 'תקול' bucket (so the kibbutz matrix stops overstating; defective units don't re-enter available stock).
  let visitReturnedItems = [];
  function addReturnedItemRow() {
    visitReturnedItems.push({ name: getActiveProducts()[0]?.name || 'מונה E360PP', qty: 1, reason: '' });
    renderReturnedItems();
  }
  function renderReturnedItems() {
    const wrap = document.getElementById('visitReturnedList');
    if (!wrap) return;
    if (visitReturnedItems.length === 0) {
      wrap.innerHTML = '<div style="font-size:11px;color:#94a3b8;font-style:italic;">אין פריטים תקולים שהוחזרו</div>';
      return;
    }
    wrap.innerHTML = visitReturnedItems.map((r, idx) => `
      <div style="display:flex;gap:6px;align-items:center;margin:4px 0;background:white;padding:5px 8px;border-radius:6px;">
        <select onchange="visitReturnedItems[${idx}].name = this.value" style="flex:1;padding:3px 6px;border-radius:4px;border:1px solid #fecaca;font-size:11px;">
          ${getActiveProducts().map(pr => pr.name).map(p => `<option value="${p}" ${r.name === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${r.qty}" onchange="visitReturnedItems[${idx}].qty = parseInt(this.value)||1" style="width:50px;padding:3px;border-radius:4px;border:1px solid #fecaca;text-align:center;font-size:11px;">
        <input type="text" value="${(r.reason||'').replace(/"/g,'&quot;')}" placeholder="סיבה (קצר)" onchange="visitReturnedItems[${idx}].reason = this.value" style="flex:1.5;padding:3px 6px;border-radius:4px;border:1px solid #fecaca;font-size:11px;">
        <button type="button" onclick="visitReturnedItems.splice(${idx},1); renderReturnedItems();" style="background:#dc2626;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;">×</button>
      </div>
    `).join('');
  }

  function invRenderReturns() {
    const root = document.getElementById('invReturnsList');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const returns = (window.SHEET_DATA && window.SHEET_DATA.returns) || [];
    if (returns.length === 0) {
      root.innerHTML = `<div style="padding:24px;text-align:center;color:#64748b;">
        עדיין אין ציוד שהוחזר במעקב.<br>
        <small>כשיירשם בסיכום ביקור (תחת "🔧 ציוד שהוחזר"), הוא יופיע כאן — ותוכל להחזיר פריטים תקינים למלאי או לסמן כתקולים.</small>
      </div>`;
      return;
    }
    const open = returns.filter(r => (r.status || 'open') === 'open');
    const totalOpen = open.reduce((s,r) => s + (parseInt(r.qty)||0), 0);
    let html = `<div style="background:#eff6ff;padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:13px;">
      <strong>🔧 ממתינים להחלטה:</strong> ${totalOpen} פריטים. החזר פריט תקין למלאי, או סמן כתקול (נשאר מחוץ למלאי).
    </div>`;
    const STATUS_LABEL = { open: '🕒 ממתין', restocked: '✅ הוחזר למלאי', defective: '🔧 תקול' };
    html += '<table class="inv-table"><thead><tr><th>תאריך</th><th>קיבוץ</th><th>פריט</th><th>כמות</th><th>החזיר</th><th>סטטוס</th><th>פעולות</th></tr></thead><tbody>';
    returns.slice().sort((a,b) => (b.date||'').localeCompare(a.date||'')).forEach(r => {
      const st = r.status || 'open';
      const actions = (st === 'open')
        ? `<button class="inv-btn small success" onclick="returnToStock('${r.id}')">✅ החזר למלאי</button>
           <button class="inv-btn small warning" onclick="markReturnDefective('${r.id}')">🔧 תקול</button>`
        : '—';
      html += `<tr>
        <td data-label="תאריך" style="white-space:nowrap;">${r.date ? new Date(r.date).toLocaleDateString('he-IL') : '—'}</td>
        <td data-label="קיבוץ">${r.kibbutz || '—'}</td>
        <td data-label="פריט"><strong>${r.product || '—'}</strong></td>
        <td data-label="כמות">${r.qty || 0}</td>
        <td data-label="החזיר">${r.visitor || '—'}</td>
        <td data-label="סטטוס">${STATUS_LABEL[st] || st}</td>
        <td class="actions-cell" style="white-space:nowrap;">${actions}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  // Returned item is GOOD → add it back to available stock at a chosen location + mark restocked.
  async function returnToStock(retId) {
    if (!checkEditPermission()) return;
    const r = ((window.SHEET_DATA && window.SHEET_DATA.returns) || []).find(x => x.id === retId);
    if (!r) { alert('פריט החזרה לא נמצא'); return; }
    const qty = parseInt(r.qty) || 0;
    if (qty <= 0) { alert('כמות לא תקינה'); return; }
    const loc = prompt('לאיזה מיקום להחזיר את "' + r.product + '" (×' + qty + ')?\n' + INV_LOCATIONS.join(' / '), 'משרד');
    if (!loc) return;
    if (INV_LOCATIONS.indexOf(loc) === -1) { alert('מיקום לא מוכר. בחר מתוך: ' + INV_LOCATIONS.join(', ')); return; }
    try {
      const by = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
      await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'movement', product: r.product, fromLocation: '', toLocation: loc, quantity: qty, reason: 'return_restock', refId: retId, createdBy: by }) });
      await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'return', id: retId, status: 'restocked' }) });
      if (r) r.status = 'restocked';
      const t = document.getElementById('toast'); t.textContent = '✅ הוחזר למלאי (' + loc + ')';
      t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200);
      setTimeout(refreshData, 1000);
    } catch (e) { alert('שגיאה: ' + e.message); }
  }
  // Returned item is defective → stays out of stock; just record the decision.
  async function markReturnDefective(retId) {
    if (!checkEditPermission()) return;
    if (!confirm('לסמן את הפריט כתקול? הוא יישאר מחוץ למלאי הזמין.')) return;
    try {
      await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'return', id: retId, status: 'defective' }) });
      const r = ((window.SHEET_DATA && window.SHEET_DATA.returns) || []).find(x => x.id === retId);
      if (r) r.status = 'defective';
      setTimeout(refreshData, 800);
    } catch (e) { alert('שגיאה: ' + e.message); }
  }

  // ===== Save-button loading state =====
  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.origText = btn.innerHTML;
      btn.innerHTML = '<span class="btn-spinner"></span> שומר...';
      btn.disabled = true;
      btn.style.opacity = '0.7';
    } else {
      if (btn.dataset.origText) btn.innerHTML = btn.dataset.origText;
      btn.disabled = false;
      btn.style.opacity = '';
    }
  }

  // ========== PRODUCTS — synced with visit checkboxes ==========
  function getActiveProducts() {
    const fromSheet = (window.SHEET_DATA && window.SHEET_DATA.products) || [];
    if (fromSheet.length === 0) return PRODUCT_LIST.map(name => ({ name, active: true, category: '' }));
    return fromSheet.filter(p => p.active);
  }

  function invRenderProducts() {
    const root = document.getElementById('invProductsList');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const products = (window.SHEET_DATA && window.SHEET_DATA.products) || [];
    if (products.length === 0) {
      root.innerHTML = `<div style="padding:20px;text-align:center;color:#64748b;">
        אין פריטים בגיליון עדיין. הפריטים בסיכום ביקור משתמשים ברשימה זמנית.<br>
        לחץ "+ פריט חדש" כדי לבנות את הקטלוג.
      </div>`;
      return;
    }
    let html = '<table class="inv-table"><thead><tr><th>שם</th><th>קטגוריה</th><th>פעיל</th><th>פעולות</th></tr></thead><tbody>';
    products.sort((a,b) => a.name.localeCompare(b.name, 'he')).forEach(p => {
      html += `<tr>
        <td data-label="שם"><strong>${p.name}</strong></td>
        <td data-label="קטגוריה">${p.category || '<span style="color:#94a3b8;">—</span>'}</td>
        <td data-label="פעיל">${p.active ? '✅' : '❌'}</td>
        <td class="actions-cell">
          <button class="inv-btn small" onclick="invEditProduct('${p.id}')">✏️ ערוך</button>
          <button class="inv-btn small ${p.active ? 'warning' : 'success'}" onclick="invToggleProductActive('${p.id}', ${!p.active})">${p.active ? 'השבת' : 'הפעל'}</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  function invNewProduct() {
    if (!checkEditPermission()) return;
    window.invEditingProductId = null;
    document.getElementById('invProductTitle').textContent = '📋 פריט חדש';
    document.getElementById('invProductName').value = '';
    document.getElementById('invProductCategory').value = '';
    document.getElementById('invProductActive').checked = true;
    document.getElementById('invProductModal').classList.add('open');
  }

  function invEditProduct(id) {
    if (!checkEditPermission()) return;
    const p = (window.SHEET_DATA.products || []).find(x => x.id === id);
    if (!p) return;
    window.invEditingProductId = id;
    document.getElementById('invProductTitle').textContent = '📋 ערוך: ' + p.name;
    document.getElementById('invProductName').value = p.name;
    document.getElementById('invProductCategory').value = p.category || '';
    document.getElementById('invProductActive').checked = p.active;
    document.getElementById('invProductModal').classList.add('open');
  }

  function invToggleProductActive(id, makeActive) {
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'product', id: id, active: makeActive })
    }).then(() => setTimeout(refreshData, 1000));
  }

  function invSaveProduct(btn) {
    const name = document.getElementById('invProductName').value.trim();
    if (!name) { alert('נא להזין שם פריט'); return; }
    const body = {
      type: 'product',
      name: name,
      category: document.getElementById('invProductCategory').value,
      active: document.getElementById('invProductActive').checked
    };
    if (window.invEditingProductId) body.id = window.invEditingProductId;
    setBtnLoading(btn, true);
    fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          document.getElementById('invProductModal').classList.remove('open');
          setTimeout(refreshData, 1000);
        } else alert('שגיאה: ' + JSON.stringify(res));
      })
      .finally(() => setBtnLoading(btn, false));
  }

  // ===== Quick status actions for orders =====
  // Returns the next-step quick action for the given status (or null if none)
  // ============================================================
  // CUSTOMER-REQUEST INTAKE  (paste → parse → confirm → pending-approval order)
  // ============================================================
  // Aliases: normalized fragment that may appear in a customer message → a hint
  // string expected to appear in the catalog product name. Deterministic, offline.
  const INTAKE_ALIASES = {
    '360sp':'360sp', '360pp':'360pp', '360ct':'360ct', 'e570':'570', '570':'570',
    'em133':'em133', '133':'133', 'בקר':'בקר', 'בקרים':'בקר', 'robustel':'robustel',
    'רובסטל':'robustel', 'סים':'סים', 'סימים':'סים', 'sim':'סים', 'מונה':'מונה', 'מונים':'מונה'
  };
  const HE_NUMWORDS = { 'אחד':1,'אחת':1,'שני':2,'שתי':2,'שניים':2,'שתיים':2,'שלוש':3,'שלושה':3,
    'ארבע':4,'ארבעה':4,'חמש':5,'חמישה':5,'שש':6,'שישה':6,'שבע':7,'שבעה':7,'שמונה':8,'תשע':9,'תשעה':9,'עשר':10,'עשרה':10 };

  function intakeNormalize(s) {
    return (s || '')
      .replace(/[֑-ׇ]/g, '')   // strip niqqud
      .replace(/['"`׳״]/g, '')           // unify geresh/gershayim/quotes
      .replace(/\s+/g, ' ')
      .toLowerCase().trim();
  }
  function intakeQtyNear(norm, idx) {
    const win = norm.slice(Math.max(0, idx - 18), idx + 18);
    const d = win.match(/(\d{1,3})/);
    if (d) return { value: parseInt(d[1]), uncertain: false };
    for (const [w, n] of Object.entries(HE_NUMWORDS)) {
      if (win.indexOf(intakeNormalize(w)) !== -1) return { value: n, uncertain: false };
    }
    return { value: 1, uncertain: true };   // unknown qty → default 1 but FLAG for manual check
  }

  function openIntake() {
    const sel = document.getElementById('intakeKibbutz');
    const names = Array.from(document.querySelectorAll('.kibbutz')).map(c => c.dataset.name)
      .filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'));
    sel.innerHTML = '<option value="">-- בחר קיבוץ --</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
    document.getElementById('intakeContact').value = '';
    document.getElementById('intakeRaw').value = '';
    document.getElementById('intakeStep1').style.display = '';
    document.getElementById('intakeStep2').style.display = 'none';
    window.intakeItems = [];
    document.getElementById('intakeModal').classList.add('open');
  }
  function intakeBackToStep1() {
    document.getElementById('intakeStep1').style.display = '';
    document.getElementById('intakeStep2').style.display = 'none';
  }
  // AI-first parse (Gemini, with meter-type rules). Falls back to the local
  // keyword matcher if Gemini is unavailable (no key / offline / error).
  async function intakeParse() {
    if (!document.getElementById('intakeKibbutz').value) { alert('נא לבחור קיבוץ'); return; }
    const raw = document.getElementById('intakeRaw').value.trim();
    if (!raw) { alert('נא להדביק את טקסט הבקשה'); return; }
    const btn = document.getElementById('intakeParseBtn');
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '🧠 מנתח עם AI...'; }
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'parseRequest', text: raw, catalog: getActiveProducts().map(p => p.name) })
      }).then(r => r.json());
      if (res && res.ok && Array.isArray(res.items)) {
        window.intakeItems = res.items
          .filter(it => it.name && it.qty > 0)
          .map(it => ({ name: it.name, qty: parseInt(it.qty) || 1, uncertain: false }));
      } else {
        intakeParseLocal(raw);   // AI returned an error → fallback
      }
    } catch (e) {
      intakeParseLocal(raw);     // network/offline → fallback
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
    renderIntakeGrid();
    document.getElementById('intakeStep1').style.display = 'none';
    document.getElementById('intakeStep2').style.display = '';
  }

  // Deterministic keyword/alias matcher against the catalog → [{name,qty,uncertain}].
  function parseLocalToItems(raw) {
    const norm = intakeNormalize(raw);
    const catalog = getActiveProducts().map(p => p.name);
    const items = [];
    catalog.forEach(prodName => {
      const normProd = intakeNormalize(prodName);
      let idx = -1;
      for (const t of normProd.split(' ').filter(t => t.length >= 2)) {
        const at = norm.indexOf(t);
        if (at !== -1) { idx = at; break; }
      }
      if (idx === -1) {
        for (const [alias, hint] of Object.entries(INTAKE_ALIASES)) {
          if (normProd.indexOf(intakeNormalize(hint)) !== -1) {
            const at = norm.indexOf(alias);
            if (at !== -1) { idx = at; break; }
          }
        }
      }
      if (idx !== -1) {
        const q = intakeQtyNear(norm, idx);
        items.push({ name: prodName, qty: q.value, uncertain: q.uncertain });
      }
    });
    const seen = new Set();
    return items.filter(it => { if (seen.has(it.name)) return false; seen.add(it.name); return true; });
  }
  // Offline fallback: keep the old name for the intake modal.
  function intakeParseLocal(raw) { window.intakeItems = parseLocalToItems(raw); }

  // AI-first (Gemini via Apps Script) with local fallback. Returns [{name,qty,uncertain}].
  // ponytail: AI quota-blocked → falls back to the deterministic matcher; wire-through stays.
  async function parseRawToItems(raw) {
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'parseRequest', text: raw, catalog: getActiveProducts().map(p => p.name) })
      }).then(r => r.json());
      if (res && res.ok && Array.isArray(res.items)) {
        return res.items.filter(it => it.name && it.qty > 0).map(it => ({ name: it.name, qty: parseInt(it.qty) || 1, uncertain: false }));
      }
    } catch (e) { /* offline/no-key → fallback */ }
    return parseLocalToItems(raw);
  }
  function renderIntakeGrid() {
    const catalog = getActiveProducts().map(p => p.name);
    const grid = document.getElementById('intakeGrid');
    if (!window.intakeItems || !window.intakeItems.length) {
      grid.innerHTML = '<div style="color:#94a3b8;font-style:italic;padding:8px;">לא זוהו פריטים. הוסף ידנית למטה 👇</div>';
      return;
    }
    grid.innerHTML = window.intakeItems.map((it, i) => `
      <div style="display:flex;gap:6px;align-items:center;margin:4px 0;padding:6px 8px;border-radius:6px;background:${it.uncertain ? '#fef9c3' : '#f8fafc'};border:1px solid ${it.uncertain ? '#fde047' : '#e2e8f0'};">
        <select onchange="window.intakeItems[${i}].name=this.value" style="flex:1;padding:4px;border-radius:4px;border:1px solid #e2e8f0;">
          ${catalog.map(p => `<option value="${p}" ${it.name === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${it.qty}" style="width:64px;padding:4px;text-align:center;border-radius:4px;border:1px solid ${it.uncertain ? '#f59e0b' : '#e2e8f0'};"
          onchange="window.intakeItems[${i}].qty=parseInt(this.value)||1; window.intakeItems[${i}].uncertain=false; renderIntakeGrid();">
        ${it.uncertain ? '<span style="color:#b45309;font-size:11px;white-space:nowrap;">⚠️ כמות?</span>' : ''}
        <button onclick="window.intakeItems.splice(${i},1); renderIntakeGrid();" style="background:#dc2626;color:white;border:none;border-radius:4px;width:24px;height:24px;cursor:pointer;">×</button>
      </div>`).join('');
  }
  function intakeAddRow() {
    window.intakeItems = window.intakeItems || [];
    window.intakeItems.push({ name: getActiveProducts()[0]?.name || '', qty: 1, uncertain: false });
    renderIntakeGrid();
  }
  async function intakeSave(btn) {
    const kibbutz = document.getElementById('intakeKibbutz').value;
    const contact = document.getElementById('intakeContact').value.trim();
    const raw = document.getElementById('intakeRaw').value.trim();
    const items = (window.intakeItems || []).filter(it => it.name && it.qty > 0).map(it => ({ name: it.name, qty: it.qty }));
    if (!kibbutz) { alert('נא לבחור קיבוץ'); return; }
    if (!items.length) { alert('אין פריטים — הוסף לפחות פריט אחד'); return; }
    setBtnLoading(btn, true);
    const createdBy = getCurrentUser() || '';
    const post = body => fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(r => r.json());
    try {
      // 1) customer requirement (open) — keeps per-kibbutz attribution + the raw request
      const reqRes = await post({ type: 'requirement', kibbutz, contactName: contact, items, status: 'open', createdBy, notes: '📥 נקלט מבקשת לקוח:\n' + raw });
      // 2) purchase order awaiting Idan's approval (creates NO stock movement)
      const ordRes = await post({ type: 'order', status: 'pending_approval', items, createdBy, supplier: '', notes: 'בקשת לקוח — ' + kibbutz + (contact ? ' (' + contact + ')' : '') });
      // 3) link them
      if (reqRes?.id && ordRes?.id) {
        await post({ type: 'requirement', id: reqRes.id, status: 'in_progress', linkedOrderId: ordRes.id });
      }
      document.getElementById('intakeModal').classList.remove('open');
      const t = document.getElementById('toast');
      t.textContent = isIdan() ? '✅ נוצרה הזמנה ממתינה לאישור' : '✅ נשלח — ממתין לאישור עידן';
      t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3500);
      setTimeout(refreshData, 1200);
    } catch (e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ============================================================
  // VOICE RECORDING → transcription (Gemini via Apps Script) → form
  // ============================================================
  let _voiceRec = null, _voiceChunks = [], _voiceStream = null, _voiceTimerInt = null, _voiceSecs = 0;
  let _voiceTarget = 'visit', _voiceResult = null;
  window._voiceBusy = false;

  function pickRecorderMime() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const t of types) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; }
    return '';
  }

  function openVoice(target) {
    _voiceTarget = target || 'visit';
    _voiceResult = null;
    _voiceSecs = 0;
    document.getElementById('voiceTimer').textContent = '00:00';
    document.getElementById('voiceHint').textContent = 'לחץ כדי להתחיל להקליט';
    document.getElementById('voiceRecBtn').textContent = '🎤';
    document.getElementById('voiceRecBtn').style.background = '#dc2626';
    document.getElementById('voiceRecordStage').style.display = '';
    document.getElementById('voiceProcessStage').style.display = 'none';
    document.getElementById('voiceReviewStage').style.display = 'none';
    document.getElementById('voiceModal').classList.add('open');
  }
  function closeVoice() {
    if (_voiceRec && _voiceRec.state === 'recording') { try { _voiceRec.stop(); } catch(e){} }
    if (_voiceStream) { _voiceStream.getTracks().forEach(t => t.stop()); _voiceStream = null; }
    clearInterval(_voiceTimerInt);
    window._voiceBusy = false;
    document.getElementById('voiceModal').classList.remove('open');
  }
  function _fmtSecs(s) { return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }

  async function toggleVoiceRecording() {
    if (_voiceRec && _voiceRec.state === 'recording') { _voiceRec.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      alert('הדפדפן לא תומך בהקלטה. נסה Chrome עדכני.'); return;
    }
    try {
      _voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert('לא ניתן לגשת למיקרופון. אשר הרשאה ונסה שוב.'); return;
    }
    const mime = pickRecorderMime();
    _voiceChunks = [];
    _voiceRec = mime ? new MediaRecorder(_voiceStream, { mimeType: mime }) : new MediaRecorder(_voiceStream);
    _voiceRec.ondataavailable = e => { if (e.data.size > 0) _voiceChunks.push(e.data); };
    _voiceRec.onstop = () => {
      clearInterval(_voiceTimerInt);
      if (_voiceStream) { _voiceStream.getTracks().forEach(t => t.stop()); _voiceStream = null; }
      const blob = new Blob(_voiceChunks, { type: _voiceRec.mimeType || 'audio/webm' });
      sendVoiceForTranscription(blob, _voiceRec.mimeType || 'audio/webm');
    };
    _voiceRec.start();
    _voiceSecs = 0;
    document.getElementById('voiceTimer').textContent = '00:00';
    _voiceTimerInt = setInterval(() => { _voiceSecs++; document.getElementById('voiceTimer').textContent = _fmtSecs(_voiceSecs); }, 1000);
    const btn = document.getElementById('voiceRecBtn');
    btn.textContent = '⏹';
    btn.style.background = '#1b2a4a';
    document.getElementById('voiceHint').textContent = '🔴 מקליט... לחץ לעצירה';
  }

  function _fakeProgress() {
    const bar = document.getElementById('voiceBar'), pct = document.getElementById('voicePct');
    let p = 0;
    return setInterval(() => {
      p = Math.min(92, p + Math.max(1, (92 - p) * 0.08));
      bar.style.width = p.toFixed(0) + '%'; pct.textContent = p.toFixed(0) + '%';
    }, 250);
  }

  async function sendVoiceForTranscription(blob, mimeType) {
    window._voiceBusy = true;
    document.getElementById('voiceRecordStage').style.display = 'none';
    document.getElementById('voiceProcessStage').style.display = '';
    const prog = _fakeProgress();
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res(String(r.result).split(',')[1]);   // strip data: prefix
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const catalog = getActiveProducts().map(p => p.name);
      const cleanMime = (mimeType || 'audio/webm').split(';')[0];
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'transcribe', audioBase64: base64, mimeType: cleanMime, catalog })
      }).then(r => r.json());
      clearInterval(prog);
      document.getElementById('voiceBar').style.width = '100%';
      document.getElementById('voicePct').textContent = '100%';
      if (res.error) { alert('שגיאת תמלול: ' + res.error); voiceRetry(); return; }
      _voiceResult = res;
      renderVoiceReview(res);
    } catch (e) {
      clearInterval(prog);
      alert('שגיאה: ' + e.message);
      voiceRetry();
    } finally {
      window._voiceBusy = false;
    }
  }

  function renderVoiceReview(res) {
    document.getElementById('voiceProcessStage').style.display = 'none';
    document.getElementById('voiceReviewStage').style.display = '';
    document.getElementById('voiceTranscript').value = res.transcript || '';
    const items = Array.isArray(res.items) ? res.items : [];
    const wrap = document.getElementById('voiceItemsWrap');
    if (!items.length) { wrap.innerHTML = '<div style="font-size:12px;color:#94a3b8;">לא זוהו פריטים בהקלטה.</div>'; window._voiceItems = []; return; }
    window._voiceItems = items;
    wrap.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">📦 פריטים שזוהו (יסומנו בטופס):</div>' +
      items.map(it => `<div style="font-size:13px;padding:4px 8px;background:#f1f5f9;border-radius:6px;margin:3px 0;">${it.name} × ${it.qty}</div>`).join('');
  }

  function voiceRetry() {
    _voiceResult = null;
    document.getElementById('voiceProcessStage').style.display = 'none';
    document.getElementById('voiceReviewStage').style.display = 'none';
    document.getElementById('voiceRecordStage').style.display = '';
    document.getElementById('voiceTimer').textContent = '00:00';
    document.getElementById('voiceRecBtn').textContent = '🎤';
    document.getElementById('voiceRecBtn').style.background = '#dc2626';
    document.getElementById('voiceHint').textContent = 'לחץ כדי להתחיל להקליט';
  }

  function applyVoiceResult() {
    const transcript = document.getElementById('voiceTranscript').value.trim();
    if (_voiceTarget === 'visit') {
      const ta = document.getElementById('visitSummary');
      ta.value = (ta.value ? ta.value + '\n' : '') + transcript;
      // tick detected products + set quantities (clamped by the existing inputs)
      (window._voiceItems || []).forEach(it => {
        const chk = document.querySelector('.prod-chk[data-product="' + it.name + '"]');
        const qty = document.querySelector('.prod-qty[data-product="' + it.name + '"]');
        if (chk) chk.checked = true;
        if (qty && it.qty > 0) qty.value = it.qty;
      });
    }
    closeVoice();
    const t = document.getElementById('toast');
    t.textContent = '✅ התמלול הוחל לטופס';
    t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
  }

  function getOrderQuickAction(status) {
    switch(status) {
      case 'pending':    return { next: 'in_transit', label: '🔵 הוזמן',  bg: '#dbeafe', fg: '#1e40af' };
      case 'in_transit': return { next: 'at_port',    label: '🟡 בנמל',   bg: '#fef3c7', fg: '#92400e' };
      case 'at_port':    return { next: 'arrived',    label: '📦 התקבל',  bg: '#fce7f3', fg: '#9d174d' };
      case 'stuck':      return { next: 'arrived',    label: '📦 התקבל',  bg: '#fce7f3', fg: '#9d174d' };
      case 'arrived':    return { next: 'distribute',label: '🎯 חלק',   bg: '#d1fae5', fg: '#065f46' };
      default:           return null; // delivered → no quick action
    }
  }
  // Only אביאם / עמיחי may approve orders.
  function canApproveOrders() { return ['אביאם','עמיחי'].indexOf(getCurrentUser()) !== -1; }
  // Approve a pending_approval order → moves it to 'pending' (ready to order)
  async function approveOrder(orderId, btn) {
    if (!canApproveOrders()) { alert('רק אביאם או עמיחי יכולים לאשר הזמנות.'); return; }
    if (!confirm('לאשר את ההזמנה? תעבור לסטטוס "ממתין להזמנה".')) return;
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'order', id: orderId, status: 'pending' })
      });
      const data = await res.json();
      if (data.ok) {
        const t = document.getElementById('toast');
        t.textContent = '✅ ההזמנה אושרה';
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000);
        setTimeout(refreshData, 800);
      } else { alert('שגיאה: ' + JSON.stringify(data)); }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  async function quickOrderStatus(orderId, newStatus, btn) {
    if (!checkEditPermission()) return;
    // Special: 'distribute' opens the edit modal and jumps to distribution section
    if (newStatus === 'distribute') {
      invEditOrder(orderId);
      setTimeout(() => {
        const wrap = document.getElementById('invDistributionWrap');
        if (wrap && wrap.style.display !== 'none') {
          wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
      return;
    }
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'order', id: orderId, status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        const t = document.getElementById('toast');
        t.textContent = '✅ סטטוס עודכן';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
        setTimeout(refreshData, 800);
      } else { alert('שגיאה: ' + JSON.stringify(data)); }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  // ========== ORDERS ==========
  function invRenderOrders() {
    const root = document.getElementById('invOrdersList');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const allOrders = (window.SHEET_DATA && window.SHEET_DATA.orders) || [];
    // Hide deleted orders from default view
    const orders = allOrders.filter(o => o.status !== 'deleted');
    const filter = document.getElementById('invOrdersFilter')?.value || '';
    const filtered = filter ? orders.filter(o => o.status === filter) : orders;
    if (filtered.length === 0) {
      root.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">אין הזמנות. לחץ "+ הזמנה חדשה"</div>';
      return;
    }
    let html = '<table class="inv-table"><thead><tr><th>תאריך</th><th>סטטוס</th><th>ספק</th><th>פריטים</th><th>נוצר ע"י</th><th>הערות</th><th>פעולות</th></tr></thead><tbody>';
    filtered.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach(o => {
      const date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('he-IL') : '—';
      const status = ORDER_STATUSES[o.status] || { label: o.status, color: '#94a3b8' };
      const itemsStr = (o.items || []).map(i => `${i.name} ×${i.qty}`).join('<br>');
      const quick = getOrderQuickAction(o.status);
      const quickBtn = quick
        ? `<button class="inv-btn small" style="background:${quick.bg};color:${quick.fg};border:1px solid ${quick.fg};" onclick="quickOrderStatus('${o.id}','${quick.next}',this)">${quick.label}</button>`
        : '';
      const stuckBtn = (o.status !== 'delivered' && o.status !== 'stuck' && o.status !== 'pending_approval')
        ? `<button class="inv-btn small" style="background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:10px;" onclick="quickOrderStatus('${o.id}','stuck',this)" title="סמן כתקוע">🟠</button>`
        : '';
      // Orders awaiting approval: only אביאם / עמיחי can approve; others see a waiting chip.
      let approvalCell = '';
      if (o.status === 'pending_approval') {
        approvalCell = canApproveOrders()
          ? `<button class="inv-btn small" style="background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;font-weight:700;" onclick="approveOrder('${o.id}',this)">✅ אשר</button>`
          : `<span style="font-size:10px;color:#7c3aed;">🔔 ממתין לאישור אביאם/עמיחי</span>`;
      }
      html += `<tr>
        <td data-label="תאריך" style="white-space:nowrap;">${date}</td>
        <td data-label="סטטוס"><span class="status-pill-inv status-${o.status}">${status.label}</span></td>
        <td data-label="ספק">${o.supplier || '—'}</td>
        <td data-label="פריטים">${itemsStr || '—'}</td>
        <td data-label="נוצר ע&quot;י">${o.createdBy || '—'}</td>
        <td data-label="הערות" style="max-width:200px;font-size:11px;">${(o.notes || '').replace(/</g,'&lt;')}</td>
        <td class="actions-cell" style="white-space:nowrap;">${approvalCell} ${quickBtn} ${stuckBtn} <button class="inv-btn small" onclick="invEditOrder('${o.id}')">✏️ ערוך</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    root.innerHTML = html;
  }

  let invOrderItems = [];
  function invNewOrder() {
    if (!checkEditPermission()) return;
    window.invEditingOrderId = null;
    invOrderItems = [];
    window.invDistribution = {};
    window.invDistributionTouched = false;
    window.invOrigOrderStatus = null;
    window.invImportedReqIds = [];
    window.invOrigDistribution = {};
    document.getElementById('invOrderTitle').textContent = '🧾 הזמנה חדשה';
    document.getElementById('invOrderSupplier').value = '';
    document.getElementById('invOrderExpected').value = todayYmd();
    document.getElementById('invOrderNotes').value = '';
    document.getElementById('invOrderStatus').value = 'pending';
    document.getElementById('invOrderCreatedBy').value = (typeof getCurrentUser === 'function' ? getCurrentUser() : '') || '';
    const rawEl = document.getElementById('invOrderRaw');
    if (rawEl) rawEl.value = '';
    // New orders ALWAYS open as "ממתינה לאישור" — hide the status picker, show the note + raw box.
    document.getElementById('invOrderStatusWrap').style.display = 'none';
    document.getElementById('invOrderNewStatusNote').style.display = '';
    document.getElementById('invOrderRawWrap').style.display = '';
    renderOrderItems();
    invToggleDistribution();
    document.getElementById('invOrderModal').classList.add('open');
  }

  function invEditOrder(id) {
    if (!checkEditPermission()) return;
    const o = (window.SHEET_DATA.orders || []).find(x => x.id === id);
    if (!o) return;
    window.invEditingOrderId = id;
    window.invImportedReqIds = [];
    invOrderItems = [...(o.items || [])];
    document.getElementById('invOrderTitle').textContent = '🧾 ערוך הזמנה';
    document.getElementById('invOrderSupplier').value = o.supplier || '';
    document.getElementById('invOrderExpected').value = o.expectedDate ? o.expectedDate.slice(0,10) : '';
    document.getElementById('invOrderNotes').value = o.notes || '';
    // 'arrived' is shown as 'delivered' in the dropdown (it's a derived sub-state)
    document.getElementById('invOrderStatus').value = (o.status === 'arrived') ? 'delivered' : (o.status || 'pending');
    document.getElementById('invOrderCreatedBy').value = o.createdBy || '';
    window.invDistribution = o.distribution || {};
    // Snapshot the saved distribution so we can post only the correction delta on re-save
    window.invOrigDistribution = JSON.parse(JSON.stringify(o.distribution || {}));
    // If order was already 'delivered' (green) — distribution was confirmed before; otherwise reset touched
    window.invDistributionTouched = (o.status === 'delivered');
    // Remember original status — prevents duplicate movements when re-saving an already-delivered order
    window.invOrigOrderStatus = o.status || 'pending';
    // Editing: the status picker is available; the raw-requirement box + new-order note are hidden.
    document.getElementById('invOrderStatusWrap').style.display = '';
    document.getElementById('invOrderNewStatusNote').style.display = 'none';
    document.getElementById('invOrderRawWrap').style.display = 'none';
    renderOrderItems();
    invToggleDistribution();
    document.getElementById('invOrderModal').classList.add('open');
  }

  function renderOrderItems() {
    const wrap = document.getElementById('invOrderItems');
    if (invOrderItems.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:8px;font-style:italic;">אין פריטים. לחץ "+ הוסף פריט"</div>';
      return;
    }
    const products = getActiveProducts();
    const options = products.map(p => p.name).filter((n,i,a) => a.indexOf(n) === i);
    wrap.innerHTML = invOrderItems.map((it, idx) => `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;background:white;padding:5px 8px;border-radius:6px;">
        <select onchange="invOrderItems[${idx}].name = this.value" style="flex:1;padding:4px 6px;border-radius:4px;border:1px solid #e2e8f0;">
          ${options.map(n => `<option value="${n}" ${it.name === n ? 'selected' : ''}>${n}</option>`).join('')}
          ${options.includes(it.name) ? '' : `<option selected value="${it.name}">${it.name}</option>`}
        </select>
        <input type="number" min="1" value="${it.qty}" onchange="invOrderItems[${idx}].qty = parseInt(this.value) || 1" style="width:70px;padding:3px 6px;border-radius:4px;border:1px solid #e2e8f0;text-align:center;">
        <button onclick="invOrderItems.splice(${idx}, 1); renderOrderItems(); invToggleDistribution();" style="background:#dc2626;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">×</button>
      </div>
    `).join('');
  }

  // Import open requirements: sum quantities per product across all open requirements
  function importOpenRequirements() {
    const all = (window.SHEET_DATA?.requirements || []).concat(
      JSON.parse(localStorage.getItem('local_requirements_v1') || '[]')
    );
    const open = all.filter(r => (r.status || 'open') === 'open');
    if (open.length === 0) { alert('אין דרישות פתוחות.'); return; }
    // Sum per product
    const totals = {};
    open.forEach(r => (r.items || []).forEach(it => {
      totals[it.name] = (totals[it.name] || 0) + (parseInt(it.qty) || 0);
    }));
    const lines = Object.entries(totals).sort((a,b) => a[0].localeCompare(b[0],'he'))
      .map(([n, q]) => `• ${n} × ${q}`).join('\n');
    const summary = `נמצאו ${open.length} דרישות פתוחות.\n\nסה"כ פריטים נדרשים:\n${lines}\n\nלהוסיף הכל להזמנה?`;
    if (!confirm(summary)) return;
    Object.entries(totals).forEach(([name, qty]) => {
      const exists = invOrderItems.find(i => i.name === name);
      if (exists) exists.qty += qty;
      else invOrderItems.push({ name, qty });
    });
    // Remember which requirements fed this order → link + advance them when the order is saved
    window.invImportedReqIds = (window.invImportedReqIds || [])
      .concat(open.map(r => r.id).filter(Boolean));
    renderOrderItems();
    invToggleDistribution();
  }

  function invAddItemRow() {
    const products = getActiveProducts();
    invOrderItems.push({ name: products[0]?.name || 'מונה 360PP', qty: 1 });
    renderOrderItems();
    invToggleDistribution();
  }

  // Parse the raw customer-requirement text into order items (AI when available, local fallback).
  async function orderParseRaw(btn) {
    const raw = (document.getElementById('invOrderRaw').value || '').trim();
    if (!raw) { alert('הדבק תחילה את טקסט הדרישה'); return; }
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '🧠 מנתח...'; }
    try {
      const items = await parseRawToItems(raw);
      if (!items.length) { alert('לא זוהו פריטים מהטקסט — הוסף ידנית.'); return; }
      items.forEach(it => {
        const exists = invOrderItems.find(i => i.name === it.name);
        if (exists) exists.qty += it.qty;
        else invOrderItems.push({ name: it.name, qty: it.qty });
      });
      renderOrderItems();
      invToggleDistribution();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  }

  function onVisitorChange(visitor) {
    const src = document.getElementById('visitSource');
    if (!src) return;
    src.value = STOCK_HOLDERS.includes(visitor) ? visitor : 'משרד';
    if (typeof renderProductsForVisitor === 'function') renderProductsForVisitor();
    // Aviam: show day type selector; reset to field day
    const sel = document.getElementById('aviamDayTypeSelector');
    if (sel) {
      if (ATT_PEOPLE.indexOf(visitor) !== -1) {   // אביאם / ניתאי get the day-type selector
        sel.style.display = '';
        setAviamDayType(window.aviamDayType || 'field');
      } else {
        sel.style.display = 'none';
        document.getElementById('visitFieldForm').style.display = '';
        document.getElementById('visitSimpleForm').style.display = 'none';
      }
    }
  }

  // Ensures distribution defaults to {משרד: totalQty} for each item if not set yet
  function ensureDistributionDefaults() {
    if (!window.invDistribution) window.invDistribution = {};
    invOrderItems.forEach(it => {
      if (!window.invDistribution[it.name]) {
        window.invDistribution[it.name] = { 'משרד': it.qty };
      } else {
        // Always recompute משרד = total - sum(others) (in case items qty changed)
        const others = INV_LOCATIONS.filter(l => l !== 'משרד')
          .reduce((s, l) => s + (parseInt(window.invDistribution[it.name][l]) || 0), 0);
        window.invDistribution[it.name]['משרד'] = it.qty - others;
      }
    });
  }

  // Called when user changes a non-משרד location qty. Validates and rebalances משרד.
  function invDistChange(itemName, location, rawValue) {
    const it = invOrderItems.find(i => i.name === itemName);
    if (!it) return;
    let v = parseInt(rawValue) || 0;
    if (v < 0) v = 0;
    if (v > it.qty) v = it.qty;
    if (!window.invDistribution[itemName]) window.invDistribution[itemName] = {};
    window.invDistribution[itemName][location] = v;
    window.invDistributionTouched = true;
    // Recompute משרד
    const others = INV_LOCATIONS.filter(l => l !== 'משרד')
      .reduce((s, l) => s + (parseInt(window.invDistribution[itemName][l]) || 0), 0);
    const msrad = it.qty - others;
    if (msrad < 0) {
      // Block: revert this change. Should not happen due to max clamp, but defensive.
      alert(`לא ניתן להקצות יותר מהכמות הכוללת (${it.qty}). נסה להקטין מיקומים אחרים קודם.`);
      window.invDistribution[itemName][location] = Math.max(0, v - (-msrad));
    }
    window.invDistribution[itemName]['משרד'] = it.qty - INV_LOCATIONS.filter(l => l !== 'משרד')
      .reduce((s, l) => s + (parseInt(window.invDistribution[itemName][l]) || 0), 0);
    invToggleDistribution();
  }

  function invToggleDistribution() {
    const status = document.getElementById('invOrderStatus').value;
    const wrap = document.getElementById('invDistributionWrap');
    if (status !== 'delivered' || invOrderItems.length === 0) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';
    ensureDistributionDefaults();
    const dist = window.invDistribution;
    const list = document.getElementById('invDistributionList');
    list.innerHTML = invOrderItems.map(it => {
      const itemDist = dist[it.name] || {};
      const others = INV_LOCATIONS.filter(l => l !== 'משרד');
      const usedByOthers = others.reduce((s, l) => s + (parseInt(itemDist[l]) || 0), 0);
      const msradQty = it.qty - usedByOthers;
      const rows = INV_LOCATIONS.map(loc => {
        if (loc === 'משרד') {
          return `
          <div style="display:flex;gap:6px;align-items:center;margin:3px 0;background:#fef3c7;padding:3px 6px;border-radius:4px;">
            <span style="flex:1;font-size:12px;font-weight:700;">🏢 משרד:</span>
            <span style="width:60px;text-align:center;font-weight:700;color:${msradQty === 0 ? '#10b981' : '#0f172a'};">${msradQty}</span>
          </div>`;
        }
        const v = parseInt(itemDist[loc]) || 0;
        const max = it.qty - (usedByOthers - v); // can fill up to remaining + own current
        return `
          <div style="display:flex;gap:6px;align-items:center;margin:3px 0;">
            <span style="flex:1;font-size:12px;">${loc}:</span>
            <input type="number" min="0" max="${max}" value="${v}"
              oninput="invDistChange('${it.name.replace(/'/g, "\\'")}', '${loc}', this.value)"
              style="width:60px;padding:3px;border-radius:4px;border:1px solid #e2e8f0;text-align:center;">
          </div>`;
      }).join('');
      return `<div style="background:white;padding:8px 10px;border-radius:6px;margin-bottom:6px;">
        <div style="font-weight:700;font-size:12px;margin-bottom:4px;">
          ${it.name} (סה"כ: ${it.qty})
        </div>
        ${rows}
      </div>`;
    }).join('');
  }

  async function invSaveOrder(btn) {
    if (invOrderItems.length === 0) { alert('הוסף לפחות פריט אחד'); return; }
    const createdBy = document.getElementById('invOrderCreatedBy').value;
    if (!createdBy && !window.invEditingOrderId) { alert('נא לבחור מי יוצר את ההזמנה'); return; }
    setBtnLoading(btn, true);
    let status = document.getElementById('invOrderStatus').value;
    if (!window.invEditingOrderId) {
      status = 'pending_approval';   // ponytail: new orders are ALWAYS hardcoded to await approval
    } else if (status === 'delivered' && !window.invDistributionTouched) {
      // If "סופקה" was chosen but the distribution was never touched → save as 'arrived' (pink) — no movements yet
      status = 'arrived';
    }
    let notes = document.getElementById('invOrderNotes').value.trim();
    const rawReq = (document.getElementById('invOrderRaw')?.value || '').trim();
    if (!window.invEditingOrderId && rawReq) {
      notes = (notes ? notes + '\n\n' : '') + '📥 דרישת לקוח גולמית:\n' + rawReq;
    }
    const body = {
      type: 'order',
      supplier: document.getElementById('invOrderSupplier').value.trim(),
      expectedDate: document.getElementById('invOrderExpected').value,
      notes: notes,
      status: status,
      items: invOrderItems,
      createdBy: createdBy
    };
    if (window.invEditingOrderId) body.id = window.invEditingOrderId;
    if (status === 'delivered' && window.invDistribution) body.distribution = window.invDistribution;

    try {
      const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      const res = await r.json();
      if (!res.ok) { alert('שגיאה: ' + JSON.stringify(res)); return; }

      // If delivered (green), create movement events. 'arrived' (pink) does NOT create movements.
      // Skip if the order was ALREADY delivered before this edit — movements exist, don't duplicate.
      if (status === 'delivered' && body.distribution && window.invOrigOrderStatus !== 'delivered') {
        const movementPromises = [];
        Object.entries(body.distribution).forEach(([productName, locs]) => {
          Object.entries(locs).forEach(([loc, qty]) => {
            if (qty > 0) {
              movementPromises.push(fetch(SHEET_API, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                  type: 'movement',
                  product: productName,
                  fromLocation: '', // from external (supplier)
                  toLocation: loc,
                  quantity: qty,
                  reason: 'order_delivered',
                  refId: res.id,
                  createdBy: createdBy
                })
              }));
            }
          });
        });
        await Promise.all(movementPromises);
      }
      // Editing an ALREADY-delivered order → post only the correction delta vs the
      // previously-saved distribution, so stock stays accurate instead of diverging silently.
      else if (status === 'delivered' && body.distribution && window.invOrigOrderStatus === 'delivered') {
        const oldD = window.invOrigDistribution || {};
        const newD = body.distribution;
        const corrections = [];
        new Set([...Object.keys(oldD), ...Object.keys(newD)]).forEach(prod => {
          const locs = new Set([...Object.keys(oldD[prod] || {}), ...Object.keys(newD[prod] || {})]);
          locs.forEach(loc => {
            const delta = (parseInt(newD[prod]?.[loc]) || 0) - (parseInt(oldD[prod]?.[loc]) || 0);
            if (delta > 0)      corrections.push({ product: prod, fromLocation: '',  toLocation: loc, quantity: delta });
            else if (delta < 0) corrections.push({ product: prod, fromLocation: loc, toLocation: '',  quantity: -delta });
          });
        });
        await Promise.all(corrections.map(c => fetch(SHEET_API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ type: 'movement', reason: 'order_correction', refId: res.id || window.invEditingOrderId, createdBy }, c))
        }).catch(e => console.warn('Correction movement failed:', e))));
      }

      // ----- Requirement ↔ order linkage (closes the customer-request chain) -----
      const orderId = res.id || window.invEditingOrderId;
      const reqPost = (id, fields) => fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ type: 'requirement', id }, fields))
      }).catch(e => console.warn('Req link failed:', e));

      // Requirements just imported into this order → link them + advance status
      if (Array.isArray(window.invImportedReqIds) && window.invImportedReqIds.length && orderId) {
        const reqStatus = (status === 'delivered') ? 'fulfilled' : 'in_progress';
        await Promise.all(window.invImportedReqIds.map(rid =>
          reqPost(rid, { status: reqStatus, linkedOrderId: orderId })));
      }
      // On delivery, mark every requirement already linked to this order as fulfilled
      if (status === 'delivered' && orderId) {
        const linked = (window.SHEET_DATA?.requirements || [])
          .filter(r => r.linkedOrderId === orderId && r.status !== 'fulfilled');
        await Promise.all(linked.map(r => reqPost(r.id, { status: 'fulfilled' })));
      }
      window.invImportedReqIds = [];

      document.getElementById('invOrderModal').classList.remove('open');
      setTimeout(refreshData, 1500);
    } catch(e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ========== STOCK (by location) ==========
  function computeStock() {
    const movements = (window.SHEET_DATA && window.SHEET_DATA.movements) || [];
    const stock = {}; // stock[location][product] = qty
    movements.forEach(m => {
      const qty = parseFloat(m.quantity) || 0;
      const prod = m.product || '';
      if (!prod) return;
      if (m.fromLocation) {
        if (!stock[m.fromLocation]) stock[m.fromLocation] = {};
        stock[m.fromLocation][prod] = (stock[m.fromLocation][prod] || 0) - qty;
      }
      if (m.toLocation) {
        if (!stock[m.toLocation]) stock[m.toLocation] = {};
        stock[m.toLocation][prod] = (stock[m.toLocation][prod] || 0) + qty;
      }
    });
    return stock;
  }

  // ===== Low-stock "red line" =====
  // Meters: company-wide total PER TYPE (matched by substring so two name spellings of the
  // same meter — e.g. "מונה E360PP" / "מונה 360PP" — collapse into ONE bucket, no duplicate).
  // SIMs: per holder, against that holder's OWN location stock (his bag), since a field user
  // can be low even if his manager אביאם holds plenty.
  const METER_RULES = [
    { label: 'מונה E360PP', match: '360PP', min: 15 },
    { label: 'מונה E360SP', match: '360SP', min: 15 },
    { label: 'מונה E360CT', match: '360CT', min: 15 },
    { label: 'מונה E570',   match: 'E570',  min: 10 },
    { label: 'מונה PM135',  match: 'PM135',  min: 5  },
  ];
  const SIM_HOLDERS = [ { person: 'אביאם', min: 15 }, { person: 'ניתאי', min: 10 } ];

  function lowStockReport() {
    const stock = computeStock();
    const companyTotal = {};
    Object.values(stock).forEach(locObj => Object.entries(locObj).forEach(([p, q]) => {
      companyTotal[p] = (companyTotal[p] || 0) + q;
    }));
    // Meters — company-wide, bucketed by rule.match (dedups name variants)
    const meters = METER_RULES.map(rule => {
      let total = 0, found = false;
      Object.entries(companyTotal).forEach(([p, q]) => {
        if (p.indexOf('מונה') === 0 && p.indexOf(rule.match) !== -1) { total += q; found = true; }
      });
      return { label: rule.label, match: rule.match, total, min: rule.min, found };
    }).filter(m => m.found && m.total < m.min);
    // SIMs — per holder, their own location stock; each SIM type checked separately
    const sims = [];
    SIM_HOLDERS.forEach(h => {
      Object.entries(stock[h.person] || {}).forEach(([p, q]) => {
        if (p.indexOf('סים') === 0 && q < h.min) sims.push({ person: h.person, type: p, qty: q, min: h.min });
      });
    });
    return { meters, sims };
  }

  // Renders the red-line alert: a "company task" line for the company-wide meter shortages
  // (visible to all), plus a main-page banner whose content depends on who's logged in.
  function renderLowStockAlert() {
    const { meters, sims } = lowStockReport();

    // (1) company-task lines — meters are company-wide → visible to everyone
    const ordersOl = document.querySelector('.company-task-group.orders ol');
    if (ordersOl) {
      ordersOl.querySelectorAll('li.low-stock-task').forEach(e => e.remove());
      meters.forEach(m => {
        const li = document.createElement('li');
        li.className = 'low-stock-task';
        li.style.cssText = 'color:#dc2626;font-weight:700;';
        li.textContent = `🔴 מלאי המונים בחברה ירד מתחת לקו האדום, ישנם ${m.total} מסוג "${m.label}" (קו אדום: ${m.min})`;
        ordersOl.appendChild(li);
      });
    }

    // (2) main-page banner — אביאם/עמיחי see meters; SIMs are per-person (אביאם, as manager,
    //     also sees ניתאי's — named, since the stock may be in אביאם's bag).
    const me = getCurrentUser();
    const lines = [];
    if (me === 'אביאם' || me === 'עמיחי') {
      meters.forEach(m => lines.push(`${m.label}: נותרו ${m.total} (קו אדום ${m.min})`));
    }
    sims.forEach(s => {
      if (s.person === me || me === 'אביאם') {
        lines.push(`${s.type} אצל ${s.person}: נותרו ${s.qty} (קו אדום ${s.min})`);
      }
    });

    const view = document.getElementById('kibbutz-view');
    let banner = document.getElementById('lowStockBanner');
    if (!view || lines.length === 0) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'lowStockBanner';
      banner.style.cssText = 'background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:12px 14px;margin:0 0 14px;color:#991b1b;font-weight:600;box-shadow:0 2px 8px rgba(220,38,38,.18);';
      view.insertBefore(banner, view.firstChild);
    }
    banner.innerHTML = '🔴 <strong>התראת מלאי — מתחת לקו האדום</strong><br>' +
      lines.join('<br>') +
      ' <button onclick="document.getElementById(\'lowStockBanner\').remove()" style="float:left;background:none;border:none;font-size:16px;cursor:pointer;color:#991b1b;">✕</button>';
  }

  // ===== Stock transfer between locations =====
  function populateTransferDropdowns() {
    const stock = computeStock();
    const from = document.getElementById('transferFrom');
    const to   = document.getElementById('transferTo');
    if (!from || !to) return;
    // Preserve user's current selection across re-renders (the 10s data poll)
    const prevFrom = from.value;
    const prevTo   = to.value;
    const prevProduct = document.getElementById('transferProduct')?.value || '';
    const prevQty     = document.getElementById('transferQty')?.value || '';

    const fromLocs = INV_LOCATIONS.filter(loc => Object.values(stock[loc] || {}).some(q => q > 0));
    from.innerHTML = '<option value="">-- בחר --</option>' +
      fromLocs.sort((a,b) => a.localeCompare(b,'he')).map(l => `<option value="${l}">${l}</option>`).join('');
    to.innerHTML = '<option value="">-- בחר --</option>' +
      INV_LOCATIONS.slice().sort((a,b) => a.localeCompare(b,'he')).map(l => `<option value="${l}">${l}</option>`).join('');

    if (prevFrom && Array.from(from.options).some(o => o.value === prevFrom)) from.value = prevFrom;
    if (prevTo   && Array.from(to.options).some(o => o.value === prevTo))     to.value = prevTo;
    renderTransferProducts();
    // Restore product + qty after products dropdown re-rendered
    const prodSel = document.getElementById('transferProduct');
    if (prodSel && prevProduct && Array.from(prodSel.options).some(o => o.value === prevProduct)) {
      prodSel.value = prevProduct;
      renderTransferMax();
    }
    const qtyEl = document.getElementById('transferQty');
    if (qtyEl && prevQty) qtyEl.value = prevQty;
  }
  function renderTransferProducts() {
    const fromLoc = document.getElementById('transferFrom')?.value;
    const sel = document.getElementById('transferProduct');
    if (!sel) return;
    if (!fromLoc) {
      sel.innerHTML = '<option value="">-- בחר תחילה מקור --</option>';
      renderTransferMax(); return;
    }
    const stock = computeStock()[fromLoc] || {};
    const items = Object.entries(stock).filter(([_, q]) => q > 0)
      .sort((a,b) => a[0].localeCompare(b[0],'he'));
    sel.innerHTML = '<option value="">-- בחר פריט --</option>' +
      items.map(([p, q]) => `<option value="${p}" data-qty="${q}">${p} (${q})</option>`).join('');
    renderTransferMax();
  }
  function renderTransferMax() {
    const sel = document.getElementById('transferProduct');
    const qty = document.getElementById('transferQty');
    const hint = document.getElementById('transferHint');
    if (!sel || !qty || !hint) return;
    const opt = sel.options[sel.selectedIndex];
    const max = opt && opt.dataset.qty ? parseInt(opt.dataset.qty) : 0;
    qty.max = max || '';
    qty.placeholder = max ? `מקס ${max}` : 'כמות';
    hint.textContent = max ? `📦 זמין במקור: ${max}` : '';
  }
  async function doStockTransfer(btn) {
    if (!checkEditPermission()) return;
    const from    = document.getElementById('transferFrom').value;
    const to      = document.getElementById('transferTo').value;
    const product = document.getElementById('transferProduct').value;
    const qty     = parseInt(document.getElementById('transferQty').value) || 0;
    if (!from || !to)   { alert('בחר מקור ויעד'); return; }
    if (from === to)    { alert('המקור והיעד זהים'); return; }
    if (!product)       { alert('בחר פריט'); return; }
    if (qty <= 0)       { alert('הזן כמות חיובית'); return; }
    const maxOpt = document.querySelector(`#transferProduct option[value="${product}"]`);
    const max = maxOpt ? parseInt(maxOpt.dataset.qty) : 0;
    if (qty > max)      { alert(`לא ניתן להעביר ${qty}. זמין רק ${max}.`); return; }
    setBtnLoading(btn, true);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          type: 'movement',
          product: product,
          fromLocation: from,
          toLocation: to,
          quantity: qty,
          reason: 'transfer'
        })
      });
      const data = await res.json();
      if (data.ok) {
        const t = document.getElementById('toast');
        t.textContent = `✅ הועברו ${qty}× ${product}: ${from} → ${to}`;
        t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
        document.getElementById('transferQty').value = '';
        document.getElementById('transferProduct').value = '';
        setTimeout(refreshData, 1000);
      } else { alert('שגיאה: ' + JSON.stringify(data)); }
    } catch(e) { alert('שגיאה: ' + e.message); }
    finally { setBtnLoading(btn, false); }
  }

  function invRenderStock() {
    const root = document.getElementById('invStockMatrix');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    populateTransferDropdowns();
    const stock = computeStock();
    // red-line helpers: meter types (company-wide) red everywhere; SIM cells red per-holder
    const _lsr = lowStockReport();
    const _lowMeterMatches = _lsr.meters.map(m => m.match);
    const isLowMeter = name => name.indexOf('מונה') === 0 && _lowMeterMatches.some(mm => name.indexOf(mm) !== -1);
    const lowSimCells = new Set(_lsr.sims.map(s => s.type + '|' + s.person));

    if (window.innerWidth < 768) {
      // Mobile: accordion per location (NO scrolling table)
      let html = '';
      INV_LOCATIONS.forEach(loc => {
        const locStock = stock[loc] || {};
        const items = Object.entries(locStock).filter(([_, q]) => q !== 0)
          .sort((a, b) => a[0].localeCompare(b[0], 'he'));
        const totalUnits = items.reduce((s, [_, q]) => s + q, 0);
        if (items.length === 0) {
          html += `<details class="inv-loc-card" style="opacity:0.55;">
            <summary class="inv-loc-head"><span class="loc-name">${loc}</span><span class="loc-count" style="background:#f1f5f9;color:#64748b;">ריק</span></summary>
          </details>`;
          return;
        }
        html += `<details class="inv-loc-card" ${totalUnits > 0 ? 'open' : ''}>
          <summary class="inv-loc-head">
            <span class="loc-name">${loc}</span>
            <span class="loc-count">${totalUnits} יח׳ · ${items.length} פריטים</span>
          </summary>
          <div class="inv-loc-items">
            ${items.map(([p, q]) => `
              <div class="item-row ${q < 0 ? 'neg' : ''}" ${(isLowMeter(p) || lowSimCells.has(p + '|' + loc)) ? 'style="color:#dc2626;font-weight:700;"' : ''}>
                <span>${(isLowMeter(p) || lowSimCells.has(p + '|' + loc)) ? '🔴 ' : ''}${p}</span><span class="qty">${q}</span>
              </div>
            `).join('')}
          </div>
        </details>`;
      });
      root.innerHTML = html || '<div style="padding:20px;text-align:center;color:#64748b;">עוד אין מלאי במיקומים</div>';
      return;
    }

    // Desktop: full matrix. Hide products whose net across all INV_LOCATIONS is 0
    // (these are typically catalog renames or fully-countered demo data).
    const products = Object.keys(stock).reduce((acc, loc) => {
      Object.keys(stock[loc]).forEach(p => acc.add(p));
      return acc;
    }, new Set());
    const productList = Array.from(products)
      .filter(p => INV_LOCATIONS.some(loc => ((stock[loc] && stock[loc][p]) || 0) !== 0))
      .sort((a,b) => a.localeCompare(b, 'he'));

    if (productList.length === 0) {
      root.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">עוד אין מלאי במיקומים. הוסף הזמנה עם סטטוס "סופקה" וחלוקה.</div>';
      return;
    }
    let html = '<div style="overflow-x:auto;"><table class="matrix-table"><thead><tr><th>פריט</th>';
    INV_LOCATIONS.forEach(loc => { html += `<th>${loc}</th>`; });
    html += '<th>סה"כ</th></tr></thead><tbody>';
    productList.forEach(p => {
      let total = 0;
      const low = isLowMeter(p);   // company-wide meter type below its red line
      html += `<tr${low ? ' style="background:#fef2f2;"' : ''}><td>${low ? '🔴 ' : ''}${p}</td>`;
      INV_LOCATIONS.forEach(loc => {
        const q = (stock[loc] && stock[loc][p]) || 0;
        total += q;
        const simLow = lowSimCells.has(p + '|' + loc);   // this holder's SIM below his red line
        const cls = q === 0 ? 'matrix-zero' : (q < 0 ? 'matrix-neg' : '');
        html += `<td class="${cls}"${simLow ? ' style="background:#fef2f2;color:#dc2626;font-weight:700;"' : ''}>${q}</td>`;
      });
      html += `<td style="font-weight:700;${low ? 'color:#dc2626;' : ''}">${total}</td></tr>`;
    });
    html += '</tbody></table></div>';
    root.innerHTML = html;
  }

  // ========== KIBBUTZ INVENTORY ==========
  function invRenderKibbutzInventory() {
    const root = document.getElementById('invKibbutzMatrix');
    if (!root) return;
    const loading = invLoadingPlaceholder();
    if (loading) { root.innerHTML = loading; return; }
    const stock = computeStock();
    const kibbutzLocations = Object.keys(stock).filter(loc => !NON_KIBBUTZ_LOCATIONS.includes(loc) && loc);
    if (kibbutzLocations.length === 0) {
      root.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">עדיין לא סופקו מוצרים לקיבוצים דרך ביקור.</div>';
      return;
    }

    if (window.innerWidth < 768) {
      // Mobile: accordion per kibbutz
      let html = '';
      kibbutzLocations.sort((a,b) => a.localeCompare(b, 'he')).forEach(kib => {
        const items = Object.entries(stock[kib] || {}).filter(([_, q]) => q !== 0)
          .sort((a, b) => a[0].localeCompare(b[0], 'he'));
        const totalUnits = items.reduce((s, [_, q]) => s + q, 0);
        if (items.length === 0) return;
        html += `<details class="inv-loc-card">
          <summary class="inv-loc-head">
            <span class="loc-name">🏘 ${kib}</span>
            <span class="loc-count">${totalUnits} יח׳</span>
          </summary>
          <div class="inv-loc-items">
            ${items.map(([p, q]) => `
              <div class="item-row ${q < 0 ? 'neg' : ''}">
                <span>${p}</span><span class="qty">${q}</span>
              </div>
            `).join('')}
          </div>
        </details>`;
      });
      root.innerHTML = html || '<div style="padding:20px;text-align:center;color:#64748b;">אין נתונים</div>';
      return;
    }

    // Desktop: matrix. Hide products with zero net across all kibbutzim.
    const products = kibbutzLocations.reduce((acc, kib) => {
      Object.keys(stock[kib]).forEach(p => acc.add(p));
      return acc;
    }, new Set());
    const productList = Array.from(products)
      .filter(p => kibbutzLocations.some(kib => ((stock[kib] && stock[kib][p]) || 0) !== 0))
      .sort((a,b) => a.localeCompare(b, 'he'));

    let html = '<div style="overflow-x:auto;"><table class="matrix-table"><thead><tr><th>קיבוץ</th>';
    productList.forEach(p => { html += `<th>${p}</th>`; });
    html += '<th>סה"כ</th></tr></thead><tbody>';
    kibbutzLocations.sort((a,b) => a.localeCompare(b, 'he')).forEach(kib => {
      let total = 0;
      html += `<tr><td>${kib}</td>`;
      productList.forEach(p => {
        const q = (stock[kib] && stock[kib][p]) || 0;
        total += q;
        const cls = q === 0 ? 'matrix-zero' : '';
        html += `<td class="${cls}">${q}</td>`;
      });
      html += `<td style="font-weight:700;">${total}</td></tr>`;
    });
    html += '</tbody></table></div>';
    root.innerHTML = html;
  }

  function invExportStock() {
    const stock = computeStock();
    const products = Array.from(Object.keys(stock).reduce((acc, loc) => {
      Object.keys(stock[loc]).forEach(p => acc.add(p));
      return acc;
    }, new Set())).sort((a,b) => a.localeCompare(b, 'he'));
    const rows = [['פריט', ...INV_LOCATIONS, 'סה"כ']];
    products.forEach(p => {
      const row = [p];
      let total = 0;
      INV_LOCATIONS.forEach(loc => {
        const q = (stock[loc] && stock[loc][p]) || 0;
        total += q;
        row.push(q);
      });
      row.push(total);
      rows.push(row);
    });
    invDownloadCSV(rows, 'inventory_by_location.csv');
  }

  function invExportKibbutzInventory() {
    const stock = computeStock();
    const kibbutzLocations = Object.keys(stock).filter(loc => !NON_KIBBUTZ_LOCATIONS.includes(loc) && loc);
    const products = Array.from(kibbutzLocations.reduce((acc, kib) => {
      Object.keys(stock[kib]).forEach(p => acc.add(p));
      return acc;
    }, new Set())).sort((a,b) => a.localeCompare(b, 'he'));
    const rows = [['קיבוץ', ...products, 'סה"כ']];
    kibbutzLocations.sort((a,b) => a.localeCompare(b, 'he')).forEach(kib => {
      const row = [kib];
      let total = 0;
      products.forEach(p => {
        const q = (stock[kib] && stock[kib][p]) || 0;
        total += q;
        row.push(q);
      });
      row.push(total);
      rows.push(row);
    });
    invDownloadCSV(rows, 'inventory_by_kibbutz.csv');
  }

  function invDownloadCSV(rows, filename) {
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== Visit Summary (Google Sheet, fallback to localStorage) =====
  const VISITS_KEY = 'kibbutzVisits_v1';

  const PRODUCT_LIST = [
    'מונה EM133','מונה PM135','מונה E360PP','מונה E360SP','מונה E360CT','מונה E570',
    'בקר Robustel','בקר PUSR',
    'סים Partner','סים Cellcom',
    'כרטיס תקשורת צרוב',
    'אנטנה',
    'ספק כוח פס-דין','ספק כוח שקע',
    'משנ"ז 250','משנ"ז 400'
  ];

  // 1 full work day ≈ this many hours (for the hours statistic). ponytail: single tunable knob.
  const WORKDAY_HOURS = 8;
  function toggleVisitWorkday() {
    const on = document.getElementById('visitWorkday').checked;
    const dur = document.getElementById('visitDuration');
    if (dur) { dur.disabled = on; dur.style.opacity = on ? '0.45' : ''; if (on) dur.value = ''; }
  }

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
  //   - selected visitor → source location (auto, see onVisitorChange)
  //   - actual current stock at that source (computed from MOVEMENTS)
  //   - + items from the visit being edited (so edit flow shows what was already supplied)
  function renderProductsForVisitor() {
    const wrap = document.getElementById('visitProducts');
    if (!wrap) return;
    const visitor = document.getElementById('visitor')?.value || '';
    const source = document.getElementById('visitSource')?.value || 'משרד';

    if (!visitor) {
      wrap.innerHTML = '<div style="grid-column:1/-1;padding:14px;text-align:center;color:#94a3b8;font-style:italic;font-size:12px;background:white;border-radius:6px;">👤 בחר תחילה את המבקר כדי לראות את המלאי שלו</div>';
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
      wrap.innerHTML = `<div style="grid-column:1/-1;padding:12px;text-align:center;color:#92400e;background:#fef3c7;border-radius:6px;font-size:12px;">
        ⚠️ ב-${source} אין כרגע מלאי. השתמש בשדה "פריטים אחרים" למטה לפריטים מיוחדים.
      </div>`;
      return;
    }

    const sorted = Array.from(itemNames).sort((a, b) => a.localeCompare(b, 'he'));
    const header = `<div style="grid-column:1/-1;font-size:11px;color:#64748b;margin-bottom:4px;font-weight:700;">📦 מלאי זמין ב-${source}:</div>`;
    wrap.innerHTML = header + sorted.map(p => {
      const available  = sourceStock[p] || 0;
      const usedInVisit = editingProducts[p] || 0;
      const maxAllowed = available + usedInVisit;
      const checked  = usedInVisit > 0 ? 'checked' : '';
      const disabled = usedInVisit > 0 ? '' : 'disabled';
      const qtyValue = usedInVisit > 0 ? usedInVisit : '';
      const lowStock = available === 0 && usedInVisit === 0;
      return `
        <div style="display:flex;align-items:center;gap:6px;background:white;padding:4px 8px;border-radius:6px;${lowStock ? 'opacity:0.6;' : ''}">
          <input type="checkbox" class="prod-chk" data-product="${p}" ${checked} onchange="toggleProductQty(this)">
          <label style="font-size:12px;flex:1;">${p} <span style="color:#64748b;font-size:10px;">(${available} זמין)</span></label>
          <input type="number" class="prod-qty" data-product="${p}" data-max="${maxAllowed}" min="1" max="${maxAllowed}" step="1" placeholder="כמות" value="${qtyValue}" style="width:55px;padding:3px 6px;font-size:11px;" ${disabled}>
        </div>
      `;
    }).join('');
  }

  function toggleProductQty(chk) {
    const product = chk.dataset.product;
    const qtyInput = document.querySelector('.prod-qty[data-product="' + product + '"]');
    if (!qtyInput) return;
    if (chk.checked) {
      qtyInput.disabled = false;
      if (!qtyInput.value) qtyInput.value = '1';
      qtyInput.focus();
    } else {
      qtyInput.disabled = true;
      qtyInput.value = '';
    }
  }

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
          (v.id ? `<button onclick="editVisit('${v.id}')" style="background:#10b981;color:white;border:none;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:10px;font-family:inherit;">✏️ ערוך</button>` : '<span style="color:#94a3b8;font-size:10px;">— לא ניתן לערוך</span>');
        historyWrap.appendChild(row);
      });
    }

    box.style.display = 'block';
  }

  function editLastVisit() {
    if (!window.currentKibbutzVisits.length) return;
    const last = window.currentKibbutzVisits[0];
    if (!last.id) { alert('הביקור הזה נשמר ללא ID — לא ניתן לערוך. נסה שוב אחרי שהדף סונכרן.'); return; }
    editVisit(last.id);
  }

  function editVisit(visitId) {
    const visit = window.currentKibbutzVisits.find(v => v.id === visitId);
    if (!visit) return;
    // Mark editing FIRST so renderProductsForVisitor can include the visit's items
    window.editingVisitId = visitId;
    // Pre-fill form with this visit's data
    document.getElementById('visitSummary').value = visit.summary || '';
    document.getElementById('visitProductsOther').value = visit.productsOther || '';
    document.getElementById('visitContact').value = visit.contact || '';
    document.getElementById('visitDuration').value = visit.workday ? '' : (visit.duration || '');
    const wdEl = document.getElementById('visitWorkday');
    if (wdEl) { wdEl.checked = !!visit.workday; toggleVisitWorkday(); }
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
  }

  function saveVisit(btn) {
    const workday = !!(document.getElementById('visitWorkday') && document.getElementById('visitWorkday').checked);
    // Work day = either/or with hours: stored as the ~8h equivalent so hour-stats stay correct.
    const duration = workday ? WORKDAY_HOURS : parseFloat(document.getElementById('visitDuration').value);
    const visitor = document.getElementById('visitor').value;
    if (!visitor) { alert('נא לבחור מי ביקר'); return; }
    if (!workday && (isNaN(duration) || duration <= 0)) { alert('נא להזין משך ביקור בשעות, או לסמן "יום עבודה מלא"'); return; }
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

    const dateInput = document.getElementById('visitDate').value;
    const visitDate = dateInput ? new Date(dateInput + 'T12:00:00').toISOString() : new Date().toISOString();
    const summary = document.getElementById('visitSummary').value.trim();

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
      workday: visit.workday
    };
    if (isEditing) {
      reqBody.id = window.editingVisitId;
    }
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(reqBody)
    }).then(r => r.json()).then(res => {
      if (res && res.ok) {
        visit.synced = true;
        saveAllVisits(loadAllVisits());

        // ----- Inventory movements (event-sourced) -----
        // NEW visit  → post full supply (source → kibbutz).
        // EDIT visit → post only the DELTA vs the previous products, so stock
        //              always matches reality instead of silently diverging.
        const sourceSelect = document.getElementById('visitSource');
        const source = (sourceSelect && sourceSelect.value) || visitor;
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

        // Defective returns leave the kibbutz → 'תקול' bucket (NOT back into available stock).
        // Only on a new visit: edits can't reliably diff returns (not loaded with the visit).
        if (!isEditing) {
          (visit.returnedItems || []).forEach(r => postMovement(r.name, currentKibbutz, DEFECTIVE_LOCATION, parseInt(r.qty) || 0, 'return_defective'));
        }

        if (movementPromises.length) Promise.all(movementPromises).then(() => setTimeout(refreshData, 1500));
        else setTimeout(refreshData, 1500);
      }
    }).catch(e => {
      console.warn('Visit save to Sheet failed (will rely on localStorage):', e);
    }).finally(() => {
      setBtnLoading(saveBtn, false);
    });

    // Clear editing flag + reset returns list
    window.editingVisitId = null;
    visitReturnedItems = [];
    renderReturnedItems();

    // Auto-append visit info to the kibbutz status (clean, no WhatsApp)
    if (summary) {
      const dateShort = new Date(visitDate).toLocaleDateString('he-IL');
      autoAppendVisitToStatus(currentKibbutz, dateShort, visitor, summary);
    }

    closeModal({target: {id: 'modalBackdrop'}});
    const t = document.getElementById('toast');
    t.textContent = '✅ סיכום הביקור נשמר + הסטטוס עודכן';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);

    // Phase 2: push the summary as a comment + status to the chosen open EMS task
    // (captured in-form before the modal closed; sent live or queued if not connected).
    try { if (emsIntent && summary) pushVisitToEms(visit.kibbutz, visit, emsIntent); } catch (e) { console.warn('EMS visit push failed', e); }
  }

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

  function buildVisitsReport(visitor, fromDate, toDate) {
    const all = loadAllVisitsCombined();
    // Dedupe by id (Sheet) or kibbutz+date+visitor (local)
    const seen = new Set();
    const uniq = all.filter(v => {
      const key = v.id || (v.kibbutz + '|' + v.date + '|' + v.visitor);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const from = fromDate ? new Date(fromDate).getTime() : 0;
    const to = toDate ? new Date(toDate + 'T23:59:59').getTime() : Date.now();

    const filtered = uniq.filter(v => {
      const d = new Date(v.date).getTime();
      if (d < from || d > to) return false;
      if (visitor && v.visitor !== visitor) return false;
      return true;
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (!filtered.length) {
      return `📍 דוח ביקורי שטח\n${visitor ? 'שולח: ' + visitor + '\n' : ''}📅 ${new Date().toLocaleString('he-IL')}\n\n✨ אין ביקורים בטווח הזה`;
    }

    let totalHours = 0;
    const byKibbutz = {};
    filtered.forEach(v => {
      totalHours += v.duration || 0;
      if (!byKibbutz[v.kibbutz]) byKibbutz[v.kibbutz] = [];
      byKibbutz[v.kibbutz].push(v);
    });

    let report = `*📍 דוח ביקורי שטח*\n`;
    if (visitor) report += `*שולח: ${visitor}*\n`;
    report += `📅 ${new Date().toLocaleString('he-IL')}\n`;
    report += `📊 ${filtered.length} ביקורים · ${totalHours.toFixed(1)} שעות סה״כ · ${Object.keys(byKibbutz).length} קיבוצים\n\n`;

    Object.entries(byKibbutz).sort((a, b) => a[0].localeCompare(b[0], 'he')).forEach(([kibbutz, visits]) => {
      const kibbutzHours = visits.reduce((s, v) => s + (v.duration || 0), 0);
      report += `*━━━ ${kibbutz} (${kibbutzHours.toFixed(1)} שעות) ━━━*\n`;
      visits.forEach(v => {
        const date = new Date(v.date).toLocaleDateString('he-IL');
        report += `📅 ${date} | ⏱️ ${v.duration}ש | 👤 ${v.visitor}\n`;
        if (v.contact) report += `  🤝 ${v.contact}\n`;
        if (v.products && v.products.length) {
          const productsStr = v.products.map(p => typeof p === 'string' ? p : (p.qty > 1 ? p.name + ' (×' + p.qty + ')' : p.name)).join(', ');
          report += `  📦 ${productsStr}${v.productsOther ? ' · ' + v.productsOther : ''}\n`;
        }
        if (v.summary) report += `  📝 ${v.summary}\n`;
      });
      report += '\n';
    });

    return report;
  }

  function openVisitsReportModal() {
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

  // ===== Daily Activity Tracker — non-migration changes =====
  // Tracks "who's using the dashboard" by looking at:
  //  1. Visits added (VISITS sheet)
  //  2. Task field updates (lastModified + editor in tasks sheet)
  //  Excludes auto-pushed system markers (e.g., 'idan_bulk_proc')
  function openActivityModal() {
    document.getElementById('activityRange').value = 'today';
    document.getElementById('activityModal').classList.add('open');
    renderActivity();
  }

  function getRangeStart(range) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === 'today') return today.getTime();
    if (range === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return y.getTime();
    }
    if (range === 'week') {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return w.getTime();
    }
    return 0;
  }

  function getRangeEnd(range) {
    const now = new Date();
    if (range === 'yesterday') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return today.getTime() - 1;
    }
    return Date.now();
  }

  function collectActivities(range) {
    const from = getRangeStart(range);
    const to = getRangeEnd(range);
    const activities = [];

    // Visits
    loadAllVisitsCombined().forEach(v => {
      const ts = new Date(v.createdAt || v.date).getTime();
      if (ts < from || ts > to) return;
      activities.push({
        time: ts,
        actor: v.visitor || 'לא ידוע',
        type: '📍 ביקור',
        kibbutz: v.kibbutz,
        details: (v.summary ? v.summary.slice(0, 80) : '') + (v.duration ? ' · ' + v.duration + ' שעות' : ''),
        source: 'visit'
      });
    });

    // Task updates (status/expectedTask/owners changed in dashboard)
    const tasks = (window.SHEET_DATA && window.SHEET_DATA.tasks) || [];
    tasks.forEach(t => {
      if (!t.lastModified) return;
      const ts = new Date(t.lastModified).getTime();
      if (ts < from || ts > to) return;
      const editor = String(t.editor || '').trim();
      // Filter out automated/migration-related editors
      if (!editor || /bulk|migration|seed|auto|init/i.test(editor)) return;
      activities.push({
        time: ts,
        actor: editor.replace(/\s*\(ביקור\)\s*$/, ''),
        type: editor.includes('(ביקור)') ? '📍 עדכון סטטוס מביקור' : '✏️ עדכון כרטיס',
        kibbutz: t.name,
        details: t.status ? t.status.split('\n').slice(-1)[0].slice(0, 80) : '',
        source: 'task'
      });
    });

    return activities.sort((a, b) => b.time - a.time);
  }

  function renderActivity() {
    const range = document.getElementById('activityRange').value;
    const activities = collectActivities(range);
    document.getElementById('activityCount').textContent = activities.length + ' פעולות';

    if (!activities.length) {
      document.getElementById('activityContent').innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;font-style:italic;">אין פעילות בתקופה הזו</div>';
      return;
    }

    // Group by actor
    const byActor = {};
    activities.forEach(a => {
      if (!byActor[a.actor]) byActor[a.actor] = [];
      byActor[a.actor].push(a);
    });

    let html = '';
    Object.entries(byActor).sort((a, b) => b[1].length - a[1].length).forEach(([actor, items]) => {
      html += '<div style="background:#f9fafb;border-right:3px solid #8b5cf6;padding:10px 14px;border-radius:8px;margin-bottom:10px;">';
      html += '<div style="font-weight:700;font-size:14px;color:#6d28d9;margin-bottom:6px;">👤 ' + actor + ' <span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:10px;font-size:11px;margin-right:6px;">' + items.length + ' פעולות</span></div>';
      items.forEach(a => {
        const t = new Date(a.time);
        const timeStr = t.toLocaleDateString('he-IL') + ' ' + t.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
        html += '<div style="padding:4px 0;border-bottom:1px solid #e5e7eb;font-size:12px;">';
        html += '<span style="color:#94a3b8;">' + timeStr + '</span> · ';
        html += '<strong>' + a.type + '</strong> · ';
        html += '<span style="color:#1e40af;">' + a.kibbutz + '</span>';
        if (a.details) html += ' <span style="color:#475569;">— ' + a.details.replace(/</g,'&lt;') + '</span>';
        html += '</div>';
      });
      html += '</div>';
    });
    document.getElementById('activityContent').innerHTML = html;
  }

  function copyActivityReport() {
    const range = document.getElementById('activityRange').value;
    const rangeLabels = { today: 'היום', yesterday: 'אתמול', week: '7 ימים אחרונים', all: 'הכל' };
    const activities = collectActivities(range);
    let text = '📊 דוח פעילות במערכת (' + rangeLabels[range] + ')\n';
    text += '📅 נוצר: ' + new Date().toLocaleString('he-IL') + '\n';
    text += 'סה״כ ' + activities.length + ' פעולות\n\n';

    const byActor = {};
    activities.forEach(a => {
      if (!byActor[a.actor]) byActor[a.actor] = [];
      byActor[a.actor].push(a);
    });
    Object.entries(byActor).sort((a, b) => b[1].length - a[1].length).forEach(([actor, items]) => {
      text += '👤 ' + actor + ' (' + items.length + ' פעולות):\n';
      items.forEach(a => {
        const t = new Date(a.time);
        text += '  · ' + t.toLocaleString('he-IL') + ' — ' + a.type + ' — ' + a.kibbutz;
        if (a.details) text += ' — ' + a.details;
        text += '\n';
      });
      text += '\n';
    });

    navigator.clipboard.writeText(text).then(() => {
      const t = document.getElementById('toast');
      t.textContent = '✅ הדוח הועתק לקליפבורד';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    });
  }

  function setReportRange(range) {
    const today = new Date();
    const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let from = '', to = '';
    if (range === 'thisMonth') {
      from = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
      to   = fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (range === 'lastMonth') {
      from = fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      to   = fmt(new Date(today.getFullYear(), today.getMonth(), 0));
    } else if (range === 'last7') {
      const start = new Date(today); start.setDate(start.getDate() - 6);
      from = fmt(start); to = fmt(today);
    } else if (range === 'last30') {
      const start = new Date(today); start.setDate(start.getDate() - 29);
      from = fmt(start); to = fmt(today);
    } else if (range === 'all') {
      from = '2025-01-01'; to = '2099-01-01';
    }
    document.getElementById('visitsReportFrom').value = from;
    document.getElementById('visitsReportTo').value = to;
    document.querySelectorAll('.btn-quick-date').forEach(b => b.classList.remove('active'));
    const active = Array.from(document.querySelectorAll('.btn-quick-date')).find(b => b.getAttribute('onclick')?.includes("'" + range + "'"));
    if (active) active.classList.add('active');
  }

  function generateVisitsReport(action) {
    const visitor = document.getElementById('visitsReportVisitor').value;
    const from = document.getElementById('visitsReportFrom').value;
    const to = document.getElementById('visitsReportTo').value;
    const report = buildVisitsReport(visitor, from, to);

    // Close the modal first so user isn't stuck behind it
    document.getElementById('visitsReportModal').classList.remove('open');

    if (action === 'preview') {
      openVisitsReportHTMLView(visitor, from, to);
    } else if (action === 'copy') {
      navigator.clipboard.writeText(report).then(() => {
        const t = document.getElementById('toast');
        t.textContent = '✅ הדוח הועתק';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
      }).catch(err => {
        alert('שגיאה בהעתקה: ' + err.message);
      });
    } else if (action === 'whatsapp') {
      const contact = visitor && CONTACTS[visitor] ? CONTACTS[visitor] : { phone: '972544649833' };
      window.open('https://wa.me/' + (contact.phone || '972544649833') + '?text=' + encodeURIComponent(report), '_blank');
    }
  }

  // Build a date list from 'from' to 'to' (inclusive)
  function dateRange(fromStr, toStr) {
    const out = [];
    if (!fromStr || !toStr) return out;
    const start = new Date(fromStr + 'T00:00:00');
    const end = new Date(toStr + 'T00:00:00');
    const d = new Date(start);
    while (d <= end) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  const DAY_LETTERS = ['א','ב','ג','ד','ה','ו','ש'];

  function openVisitsReportHTMLView(visitor, fromDate, toDate) {
    const all = loadAllVisitsCombined();
    const seen = new Set();
    const uniq = all.filter(v => {
      const key = v.id || (v.kibbutz + '|' + v.date + '|' + v.visitor);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const from = fromDate ? new Date(fromDate).getTime() : 0;
    const to = toDate ? new Date(toDate + 'T23:59:59').getTime() : Date.now();
    const filtered = uniq.filter(v => {
      const d = new Date(v.date).getTime();
      if (d < from || d > to) return false;
      if (visitor && v.visitor !== visitor) return false;
      return true;
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Group visits by their YYYY-MM-DD
    const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const visitsByDay = {};
    filtered.forEach(v => {
      const k = dayKey(new Date(v.date));
      if (!visitsByDay[k]) visitsByDay[k] = [];
      visitsByDay[k].push(v);
    });

    // Stats
    const totalHours = filtered.reduce((s, v) => s + (v.duration || 0), 0);
    const uniqueKibbutzim = new Set(filtered.map(v => v.kibbutz));
    const uniqueVisitors = new Set(filtered.map(v => v.visitor || 'לא ידוע'));
    const byVisitor = {};
    filtered.forEach(v => {
      const vis = v.visitor || 'לא ידוע';
      if (!byVisitor[vis]) byVisitor[vis] = { count: 0, hours: 0 };
      byVisitor[vis].count++;
      byVisitor[vis].hours += v.duration || 0;
    });

    const allDates = dateRange(fromDate, toDate);
    const fromLabel = fromDate ? new Date(fromDate).toLocaleDateString('he-IL') : '—';
    const toLabel = toDate ? new Date(toDate).toLocaleDateString('he-IL') : '—';
    const monthYearLabel = fromDate ? new Date(fromDate).toLocaleDateString('he-IL', {month:'long', year:'numeric'}) : '';

    // Build calendar table rows — only days with visits
    const tableRows = [];
    allDates.forEach(d => {
      const k = dayKey(d);
      const dayLetter = DAY_LETTERS[d.getDay()];
      const isWeekend = d.getDay() === 5 || d.getDay() === 6;
      const dateText = d.getDate() + '.' + (d.getMonth() + 1);
      const visits = visitsByDay[k] || [];

      if (visits.length === 0) {
        return; // skip empty days
      }
      {
        // For each visit, create product rows
        // First, compute total rowspan for day/date cell
        let totalRowspan = 0;
        visits.forEach(v => {
          const products = (v.products || []).filter(Boolean);
          const productCount = products.length;
          totalRowspan += Math.max(1, productCount);
        });

        let isFirstRowOfDay = true;
        visits.forEach((v, vi) => {
          const products = (v.products || []).map(p => typeof p === 'string' ? { name: p, qty: 1 } : p);
          const productCount = products.length;
          const visitRowspan = Math.max(1, productCount);
          let isFirstRowOfVisit = true;

          if (productCount === 0) {
            // One row, no products
            const rowDayCell = isFirstRowOfDay ? `<td class="day" rowspan="${totalRowspan}">${dayLetter}</td><td class="date" rowspan="${totalRowspan}">${dateText}</td>` : '';
            tableRows.push(`<tr class="${isWeekend ? 'weekend-row' : ''}">
              ${rowDayCell}
              <td><strong>${v.kibbutz || '—'}</strong></td>
              <td><span class="chip visitor">${v.visitor || '—'}</span></td>
              <td class="num">${v.duration || 0}</td>
              <td>${v.contact || '<span class="muted">—</span>'}</td>
              <td class="summary">${(v.summary || '').replace(/</g,'&lt;').replace(/\n/g,'<br>') || '<span class="muted">—</span>'}</td>
              <td>${v.productsOther ? v.productsOther : '<span class="muted">—</span>'}</td>
              <td class="num"><span class="muted">—</span></td>
            </tr>`);
            isFirstRowOfDay = false;
          } else {
            products.forEach((p, pi) => {
              const rowDayCell = isFirstRowOfDay ? `<td class="day" rowspan="${totalRowspan}">${dayLetter}</td><td class="date" rowspan="${totalRowspan}">${dateText}</td>` : '';
              const visitCells = isFirstRowOfVisit ? `
                <td rowspan="${visitRowspan}"><strong>${v.kibbutz || '—'}</strong></td>
                <td rowspan="${visitRowspan}"><span class="chip visitor">${v.visitor || '—'}</span></td>
                <td rowspan="${visitRowspan}" class="num">${v.duration || 0}</td>
                <td rowspan="${visitRowspan}">${v.contact || '<span class="muted">—</span>'}</td>
                <td rowspan="${visitRowspan}" class="summary">${(v.summary || '').replace(/</g,'&lt;').replace(/\n/g,'<br>') || '<span class="muted">—</span>'}</td>
              ` : '';
              tableRows.push(`<tr class="${isWeekend ? 'weekend-row' : ''}">
                ${rowDayCell}
                ${visitCells}
                <td>${p.name}</td>
                <td class="num">${p.qty || 1}</td>
              </tr>`);
              isFirstRowOfDay = false;
              isFirstRowOfVisit = false;
            });
            // If there's productsOther free text, add it as one more row at the bottom of the visit block
            if (v.productsOther) {
              // It's already rolled into the LAST product row above via separate cell? Actually no — let me handle as appended row to summary
              // Skipping for clean layout — productsOther is shown only when there are no checkbox products (covered above)
            }
          }
        });
      }
    });

    // Generate CSV for download
    const csvRows = [];
    csvRows.push(['יום','תאריך','קיבוץ','מבקר','משך (שעות)','איש קשר','סיכום ביקור','פריט','כמות','אחר']);
    allDates.forEach(d => {
      const k = dayKey(d);
      const dayLetter = DAY_LETTERS[d.getDay()];
      const dateText = d.toLocaleDateString('he-IL');
      const visits = visitsByDay[k] || [];
      if (visits.length === 0) {
        return; // skip empty days in CSV
      }
      {
        visits.forEach(v => {
          const products = (v.products || []).map(p => typeof p === 'string' ? { name: p, qty: 1 } : p);
          if (products.length === 0) {
            csvRows.push([dayLetter, dateText, v.kibbutz || '', v.visitor || '', v.duration || 0, v.contact || '', (v.summary || '').replace(/\n/g, ' '), '', '', v.productsOther || '']);
          } else {
            products.forEach((p, pi) => {
              csvRows.push([dayLetter, dateText, pi === 0 ? (v.kibbutz || '') : '', pi === 0 ? (v.visitor || '') : '', pi === 0 ? (v.duration || 0) : '', pi === 0 ? (v.contact || '') : '', pi === 0 ? (v.summary || '').replace(/\n/g, ' ') : '', p.name, p.qty || 1, pi === 0 ? (v.productsOther || '') : '']);
            });
          }
        });
      }
    });
    const csv = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const csvBlob = btoa(unescape(encodeURIComponent('﻿' + csv)));

    const visitorRows = Object.entries(byVisitor).sort((a, b) => b[1].count - a[1].count)
      .map(([n, s]) => `<tr><td><strong>${n}</strong></td><td>${s.count}</td><td>${s.hours.toFixed(1)}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head>
      <meta charset="UTF-8"><title>סיכום ביקורי שטח</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Heebo',Tahoma,sans-serif;background:#f8fafc;color:#1e293b;padding:20px;line-height:1.4}
        .container{max-width:1400px;margin:0 auto}
        header{background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:20px 28px;border-radius:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;box-shadow:0 4px 16px rgba(30,64,175,0.18)}
        h1{font-size:22px}
        .sub{font-size:13px;opacity:0.9;margin-top:4px}
        .actions{display:flex;gap:8px}
        .actions button{background:white;color:#1e40af;padding:8px 14px;border-radius:8px;font-weight:700;font-size:13px;border:none;cursor:pointer}
        .actions button:hover{background:#e0e7ff}
        .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
        .kpi{background:white;padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0;border-right:3px solid #3b82f6;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
        .kpi .label{font-size:11px;color:#64748b;font-weight:600;margin-bottom:3px}
        .kpi .value{font-size:26px;font-weight:800;line-height:1}
        .kpi.green{border-right-color:#10b981}.kpi.green .value{color:#10b981}
        .kpi.orange{border-right-color:#f59e0b}.kpi.orange .value{color:#f59e0b}
        .visitor-panel{background:white;border-radius:10px;border:1px solid #e2e8f0;padding:14px 18px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
        .visitor-panel h3{font-size:14px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}
        .visitor-panel table{width:100%;max-width:500px;font-size:12px}
        table.calendar{width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04);font-size:12.5px}
        table.calendar th{text-align:right;padding:8px 10px;background:#1e293b;color:white;font-weight:700;font-size:12px}
        table.calendar td{padding:7px 10px;border-bottom:1px solid #e2e8f0;border-right:1px solid #f1f5f9;vertical-align:top}
        table.calendar .day{text-align:center;width:32px;font-weight:800;color:#475569;background:#f8fafc}
        table.calendar .date{text-align:center;width:56px;font-weight:700;color:#1e40af;background:#f8fafc;white-space:nowrap}
        table.calendar .num{text-align:center;width:54px}
        table.calendar .summary{max-width:280px;line-height:1.5}
        table.calendar tr.weekend td{background:#fef9c3 !important;color:#854d0e}
        table.calendar tr.weekend-row td{background:#fefce8}
        table.calendar tr.weekend-row .day,table.calendar tr.weekend-row .date{background:#fef08a}
        table.calendar .empty-cell{color:#94a3b8;font-style:italic;text-align:center}
        table.calendar tr.empty-day td:not(.day):not(.date){background:#fafafa}
        .chip{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
        .chip.visitor{background:#d1fae5;color:#065f46}
        .muted{color:#94a3b8;font-style:italic}
        .empty-state{text-align:center;padding:60px;color:#94a3b8;font-style:italic;background:white;border-radius:12px;border:1px solid #e2e8f0}
        @media print{
          body{background:white;padding:0;font-size:11px}
          header{box-shadow:none;background:#1e40af !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .actions{display:none}
          table.calendar{box-shadow:none;font-size:10.5px}
          table.calendar th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
          tr{page-break-inside:avoid}
          .kpi,.visitor-panel{box-shadow:none}
          .kpis{grid-template-columns:repeat(4,1fr)}
        }
      </style></head><body>
      <div class="container">
        <header>
          <div>
            <h1>📍 סיכום ביקורי שטח — ${monthYearLabel || (fromLabel + ' → ' + toLabel)}</h1>
            <div class="sub">${visitor ? '👤 ' + visitor + ' · ' : ''}${filtered.length} ביקורים · ${totalHours.toFixed(1)} שעות · ${uniqueKibbutzim.size} קיבוצים</div>
          </div>
          <div class="actions">
            <button onclick="window.print()">🖨 הדפס / PDF</button>
            <button onclick="downloadCSV()">📊 הורד Excel</button>
          </div>
        </header>

        ${filtered.length === 0 ? '<div class="empty-state">אין ביקורים בתקופה זו</div>' : `
        <div class="kpis">
          <div class="kpi"><div class="label">📊 ביקורים</div><div class="value">${filtered.length}</div></div>
          <div class="kpi green"><div class="label">⏱ שעות</div><div class="value">${totalHours.toFixed(1)}</div></div>
          <div class="kpi orange"><div class="label">🏘 קיבוצים</div><div class="value">${uniqueKibbutzim.size}</div></div>
          <div class="kpi"><div class="label">👥 מבקרים</div><div class="value">${uniqueVisitors.size}</div></div>
        </div>
        ${uniqueVisitors.size > 1 ? `<div class="visitor-panel">
          <h3>👥 פירוט לפי מבקר</h3>
          <table><thead><tr><th>שם</th><th>ביקורים</th><th>שעות</th></tr></thead><tbody>${visitorRows}</tbody></table>
        </div>` : ''}
        `}

        <table class="calendar">
          <thead>
            <tr>
              <th class="day">יום</th>
              <th class="date">תאריך</th>
              <th>קיבוץ</th>
              <th>מבקר</th>
              <th class="num">משך</th>
              <th>איש קשר</th>
              <th>סיכום ביקור</th>
              <th>פריט שסופק</th>
              <th class="num">כמות</th>
            </tr>
          </thead>
          <tbody>${tableRows.join('')}</tbody>
        </table>
      </div>

      <` + `script>
        const CSV_B64 = "${csvBlob}";
        const FILENAME = "visits_${(fromDate || 'all').replace(/-/g, '')}_${(toDate || '').replace(/-/g, '')}.csv";
        function downloadCSV() {
          const binary = atob(CSV_B64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = FILENAME;
          a.click();
          URL.revokeObjectURL(url);
        }
      <\/` + `script>
    </body></html>`;

    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) {
        alert('הדפדפן חסם את פתיחת הדוח. אנא אפשר חלונות קופצים לאתר זה.');
        return;
      }
      // Cleanup the object URL after the new tab loads
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      alert('שגיאה ביצירת הדוח: ' + e.message);
    }
  }

  function openEditModal(card) {
    const name = card.dataset.name;
    currentKibbutz = name;
    const task = (window.SHEET_DATA && window.SHEET_DATA.tasks || []).find(t => t.name === name);

    document.getElementById('modalSub').textContent = 'קיבוץ: ' + name + (task && task.code ? ' (#' + task.code + ')' : '');
    // merged status field — fold any legacy expectedTask into the status text
    document.getElementById('editStatus').value = [task && task.status, task && task.expectedTask]
      .map(x => String(x || '').trim()).filter(x => x && x !== '-').join('\n');
    document.getElementById('editTask').value = '';
    document.getElementById('editOwner1').value = (task && task.owners && task.owners[0]) || '';
    document.getElementById('editOwner2').value = (task && task.owners && task.owners[1]) || '';
    document.getElementById('editorName').value = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    // Setup progress: parse from task field or use card defaults
    const parsedT = task ? parseTaskField(task.task) : {step:null, note:''};
    const cardStep = card.dataset.step ? parseInt(card.dataset.step) : null;
    const cardNote = card.querySelector('.kibbutz-note')?.textContent || '';
    document.getElementById('editStep').value = parsedT.step || cardStep || '';
    document.getElementById('editSetupNote').value = parsedT.note || cardNote || '';
    document.getElementById('editCategory').value = '';
    document.getElementById('editEngagement').value = parsedT.type || '';
    window.currentEditTask = task || null;
    // Reset visit form
    window.editingVisitId = null;
    document.getElementById('visitSummary').value = '';
    document.getElementById('visitProductsOther').value = '';
    document.getElementById('visitContact').value = '';
    document.getElementById('visitDuration').value = '';
    const wdReset = document.getElementById('visitWorkday');
    if (wdReset) { wdReset.checked = false; toggleVisitWorkday(); }
    document.getElementById('visitor').value = '';
    if (typeof prepVisitEmsBlock === 'function') prepVisitEmsBlock(name);   // Phase 2: in-form EMS update
    if (typeof prepModalEmsSection === 'function') prepModalEmsSection(name);   // update tab: open task / create-new below status
    // Default date to today
    const today = new Date();
    document.getElementById('visitDate').value =
      today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    // Reset product list (visitor cleared → placeholder will show)
    window.editingVisitId = null;
    visitReturnedItems = [];
    renderReturnedItems();
    applyUserRestrictions();
    renderProductsForVisitor();
    renderLastVisit(name);
    // Read-only last-visit report above the status (renderLastVisit populated currentKibbutzVisits)
    const elvBox = document.getElementById('editLastVisitBox');
    const elvContent = document.getElementById('editLastVisitContent');
    const lastV = (window.currentKibbutzVisits && window.currentKibbutzVisits[0]) || null;
    if (elvBox && elvContent) {
      if (lastV) { elvContent.textContent = lastVisitText(lastV); elvBox.style.display = 'block'; }
      else { elvBox.style.display = 'none'; }
    }
    switchTab('edit');
    document.getElementById('modalBackdrop').classList.add('open');
  }

  // Override the existing card click handler
  document.querySelectorAll('.kibbutz').forEach(card => {
    const newCard = card.cloneNode(true);
    card.parentNode.replaceChild(newCard, card);
  });
  document.querySelectorAll('.kibbutz').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(card);
    });
  });

  async function saveTask() {
    if (!checkEditPermission()) return;
    const task = window.currentEditTask;
    const editorName = document.getElementById('editorName').value.trim();
    if (!editorName) { alert('נא לבחור מי מעדכן'); return; }

    const owners = [
      document.getElementById('editOwner1').value,
      document.getElementById('editOwner2').value
    ].filter(Boolean);

    // task may be null when the kibbutz exists as a card but has no sheet row yet
    const currentParsed = task ? parseTaskField(task.task) : { proc: null, step: null, note: '', cat: null, type: null };
    const stepVal = parseInt(document.getElementById('editStep').value);
    const noteVal = document.getElementById('editSetupNote').value.trim();
    const catSelected = document.getElementById('editCategory').value;
    const finalCat = catSelected || currentParsed.cat || null;
    const engagementSelected = document.getElementById('editEngagement').value;
    const finalType = engagementSelected || currentParsed.type || null;
    const newTaskField = serializeTaskField(
      currentParsed.proc,
      isNaN(stepVal) ? null : stepVal,
      noteVal,
      finalCat,
      finalType
    );

    // Move card locally for immediate feedback
    if (catSelected && CATEGORIES[catSelected]) {
      const card = document.querySelector('.kibbutz[data-name="' + currentKibbutz + '"]');
      if (card) moveCardToCategory(card, catSelected);
    }

    const body = {
      name: currentKibbutz,
      row: task && task.row ? task.row : null,
      status: document.getElementById('editStatus').value,
      expectedTask: '',   // merged into status — keep this column empty going forward
      owners: owners,
      task: newTaskField,
      editor: editorName,
      lastSeenTs: (task && task.lastModified) ? task.lastModified : ''
    };

    try {
      const r = await fetch(SHEET_API, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(body)
      });
      const res = await r.json();
      if (res.conflict) {
        if (!confirm('השדה עודכן על-ידי משתמש אחר. להחליף בכל זאת?')) return;
        body.lastSeenTs = '';
        await fetch(SHEET_API, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(body)});
      }
      closeModal({target: {id: 'modalBackdrop'}});
      const t = document.getElementById('toast');
      t.textContent = res.created ? '✅ נוסף בהצלחה' : '✅ נשמר בהצלחה';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
      setTimeout(refreshData, 1500);
    } catch (e) {
      alert('שגיאה בשמירה: ' + e.message);
    }
  }

  // Recompute the compact stats row from the actual cards (was hardcoded before)
  // Single source of truth for every displayed count — counts the actual cards
  // in each section grid (so numbers always reflect reality, never hardcoded HTML).
  function updateStatsFromCards() {
    const gridCount = id => {
      const g = document.getElementById(id);
      return g ? g.querySelectorAll('.kibbutz').length : 0;
    };
    const c = {
      priority:  gridCount('grid-priority'),
      newClient: gridCount('grid-new_client'),
      done:      gridCount('grid-done'),
      pending:   gridCount('grid-pending')
    };
    const total = c.priority + c.newClient + c.done + c.pending;
    if (!total) return; // cards not rendered yet — keep placeholders

    // Section-count badges (next to each section header)
    const setSection = (gridId, n) => {
      const grid = document.getElementById(gridId);
      const badge = grid && grid.closest('.section')?.querySelector('.section-count');
      if (badge) badge.textContent = n;
    };
    setSection('grid-priority',   c.priority);
    setSection('grid-new_client', c.newClient);
    setSection('grid-done',       c.done);
    setSection('grid-pending',    c.pending);

    // Filter-chip counts (replaced the old compact stat squares)
    const setCnt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setCnt('cnt-all',        total);
    setCnt('cnt-priority',   c.priority);
    setCnt('cnt-done',       c.done);
    setCnt('cnt-new_client', c.newClient);
    setCnt('cnt-pending',    c.pending);

    // Overall progress = live / total
    const pct = Math.round((c.done / total) * 100);
    const pctEl = document.querySelector('.progress-percent');
    if (pctEl) pctEl.textContent = pct + '%';
    const bar = document.querySelector('.progress-bar');
    if (bar) {
      const w = n => (n / total * 100).toFixed(1) + '%';
      const segDone  = bar.querySelector('.seg-done');
      const segTrack = bar.querySelector('.seg-track');
      const segThird = bar.children[2];
      if (segDone)  segDone.style.width  = w(c.done);
      if (segTrack) segTrack.style.width = w(c.priority);
      if (segThird) segThird.style.width = w(c.newClient);
    }
  }

  // "ביקור אחרון" line on each card (latest visit from VISITS). Always rendered; prominent in meeting mode.
  function applyCardLastVisit() {
    const visits = (window.SHEET_DATA && window.SHEET_DATA.visits) || [];
    const latest = {};
    visits.forEach(v => { if (!v.kibbutz || !v.date) return; if (!latest[v.kibbutz] || new Date(v.date) > new Date(latest[v.kibbutz].date)) latest[v.kibbutz] = v; });
    document.querySelectorAll('.kibbutz[data-name]').forEach(card => {
      card.querySelectorAll('.card-last-visit').forEach(e => e.remove());
      const v = latest[card.dataset.name];
      if (!v) return;
      const d = new Date(v.date).toLocaleDateString('he-IL');
      const el = document.createElement('div');
      el.className = 'card-last-visit excel-injected';
      el.textContent = '📍 ביקור אחרון: ' + d + (v.visitor ? ' · ' + v.visitor : '') + (v.summary ? ' — ' + String(v.summary).slice(0, 70) : '');
      card.appendChild(el);
    });
  }

  function reorderCards() {
    const TOP_CLASSES = ['kibbutz-name-row','kibbutz-name','kibbutz-meta','excel-status','card-ems','card-ems-new','card-last-visit','owners-row','marketing-badge'];
    const BOTTOM_CLASSES = ['kibbutz-note','ready-flow-flag','flow-active-flag','urgent-flag','manual-flow-flag','new-client-flag','flow-bug-flag','bug-details','stepper','current-step-label','proc-btn','calendar-event'];

    document.querySelectorAll('.kibbutz').forEach(card => {
      // Remove existing divider
      card.querySelectorAll('.card-divider').forEach(d => d.remove());

      const top = [], bottom = [], comment = [];
      Array.from(card.children).forEach(child => {
        if (child.classList.contains('priority-flag')) return;
        if (child.classList.contains('comment-hint')) { comment.push(child); return; }
        const cls = Array.from(child.classList);
        if (cls.some(c => TOP_CLASSES.includes(c))) top.push(child);
        else if (cls.some(c => BOTTOM_CLASSES.includes(c))) bottom.push(child);
      });

      // Re-order in place. appendChild MOVES an existing child (no detach gap), so a
      // partial failure or a concurrent re-render can never leave a card blank.
      // (Detaching everything first was the cause of cards vanishing on EMS connect.)
      top.forEach(c => card.appendChild(c));
      if (bottom.length > 0) {
        const div = document.createElement('div');
        div.className = 'card-divider';
        card.appendChild(div);
        bottom.forEach(c => card.appendChild(c));
      }
      comment.forEach(c => card.appendChild(c));
    });
  }

  async function refreshData() {
    const data = await fetchSheetData();
    if (data) {
      window.dataLoaded = true;
      enrichCardsWithSheet(data);
      renderPotentials(data);
      injectCustomerCodes();
      injectSteppers();
      applyCardLastVisit();
      reorderCards();
      updateStatsFromCards();
      renderCompanyTasks();
      maybeShowAttendanceReminder();
      if (typeof renderLowStockAlert === 'function') renderLowStockAlert();
      const lastMod = maxLastModified(data);
      if (lastMod) renderLastUpdated(lastMod);
      // Re-render inventory views if user has them open
      const invView = document.getElementById('inventory-view');
      if (invView && invView.style.display !== 'none' && typeof renderInventory === 'function') {
        renderInventory();
      }
    }
  }

  // Run once on load + poll every 10 seconds
  // Helper: today as YYYY-MM-DD (for default values on <input type="date">)
  function todayYmd() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  // ====== Global Search ======
  function closeGlobalSearch() {
    const box = document.getElementById('globalSearchResults');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('.filter-bar')) closeGlobalSearch();
  });
  function doGlobalSearch(query) {
    const box = document.getElementById('globalSearchResults');
    if (!box) return;
    const q = (query || '').trim();
    if (q.length < 2) { closeGlobalSearch(); return; }
    const ql = q.toLowerCase();
    const data = window.SHEET_DATA || {};
    const tasks = data.tasks || [];
    const requirements = (data.requirements || []).concat(
      JSON.parse(localStorage.getItem('local_requirements_v1') || '[]'));
    const orders = (data.orders || []).filter(o => o.status !== 'deleted');
    const visits = data.visits || [];
    const products = data.products || [];

    const matchText = (s, q) => (s || '').toString().toLowerCase().includes(q);
    const sections = [];

    // 🏘 Kibbutzim
    const kibMatches = tasks.filter(t => matchText(t.name, ql) || matchText(t.status, ql) || matchText(t.expectedTask, ql)).slice(0, 6);
    if (kibMatches.length) sections.push({ title: '🏘 קיבוצים', items: kibMatches.map(t => ({
      icon: '🏘', title: t.name, meta: (t.region || '') + (t.status ? ' · ' + (t.status||'').slice(0,40) : ''),
      onClick: `goToKibbutz('${(t.name||'').replace(/'/g, "\\'")}')`
    })) });

    // 📋 Requirements
    const reqMatches = requirements.filter(r =>
      matchText(r.kibbutz, ql) || matchText(r.contactName, ql) || matchText(r.notes, ql) ||
      (r.items || []).some(i => matchText(i.name, ql))
    ).slice(0, 6);
    if (reqMatches.length) sections.push({ title: '📋 דרישות', items: reqMatches.map(r => ({
      icon: '📋', title: r.kibbutz + (r.contactName ? ' · ' + r.contactName : ''),
      meta: (r.items || []).map(i => `${i.name} ×${i.qty}`).join(', ').slice(0, 80),
      onClick: `goToInventoryTab('requirements')`
    })) });

    // 🧾 Orders
    const ordMatches = orders.filter(o =>
      matchText(o.supplier, ql) || matchText(o.notes, ql) || matchText(o.status, ql) ||
      (o.items || []).some(i => matchText(i.name, ql))
    ).slice(0, 6);
    if (ordMatches.length) sections.push({ title: '🧾 הזמנות', items: ordMatches.map(o => ({
      icon: '🧾', title: (o.supplier || 'ספק לא ידוע') + ' · ' + (o.status || ''),
      meta: (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ').slice(0, 80),
      onClick: `goToInventoryTab('orders'); setTimeout(()=>invEditOrder('${o.id}'), 300)`
    })) });

    // 📝 Visits
    const visitMatches = visits.filter(v =>
      matchText(v.kibbutz, ql) || matchText(v.visitor, ql) || matchText(v.summary, ql) ||
      matchText(v.contact, ql) || (v.products || []).some(p => matchText(p.name || p, ql))
    ).slice(0, 6);
    if (visitMatches.length) sections.push({ title: '📝 ביקורים', items: visitMatches.map(v => ({
      icon: '📝', title: v.kibbutz + ' · ' + (v.visitor || ''),
      meta: (v.date ? new Date(v.date).toLocaleDateString('he-IL') + ' · ' : '') + (v.summary || '').slice(0, 80),
      onClick: `goToKibbutz('${(v.kibbutz||'').replace(/'/g, "\\'")}')`
    })) });

    // 📦 Products
    const prodMatches = products.filter(p => matchText(p.name, ql) || matchText(p.category, ql)).slice(0, 6);
    if (prodMatches.length) sections.push({ title: '📦 פריטים', items: prodMatches.map(p => ({
      icon: '📦', title: p.name, meta: p.category || '',
      onClick: `goToInventoryTab('products')`
    })) });

    if (sections.length === 0) {
      box.innerHTML = '<div class="gs-empty">לא נמצאו תוצאות עבור "' + q.replace(/</g,'&lt;') + '"</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = sections.map(sec => `
      <div class="gs-section">
        <div class="gs-section-title">${sec.title} (${sec.items.length})</div>
        ${sec.items.map(it => `
          <div class="gs-result" onclick="closeGlobalSearch(); ${it.onClick}">
            <span class="gs-icon">${it.icon}</span>
            <div class="gs-text">
              <div class="gs-title">${(it.title||'').replace(/</g,'&lt;')}</div>
              <div class="gs-meta">${(it.meta||'').replace(/</g,'&lt;')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');
    box.style.display = 'block';
  }

  function goToKibbutz(name) {
    // Ensure on kibbutz page first
    if (typeof showPage === 'function') showPage('kibbutz');
    setTimeout(() => {
      const card = document.querySelector(`.kibbutz[data-name="${name}"]`);
      if (!card) return;
      // Expand parent section if collapsed
      const section = card.closest('.section');
      if (section) {
        const body = section.querySelector('.section-body');
        if (body && body.classList.contains('collapsed')) body.classList.remove('collapsed');
      }
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '3px solid #f59e0b';
      setTimeout(() => card.style.outline = '', 2000);
    }, 100);
  }
  function goToInventoryTab(tab) {
    if (typeof showPage === 'function') showPage('inventory');
    setTimeout(() => { if (typeof invShowTab === 'function') invShowTab(tab); }, 150);
  }

  // ====== Soft Login (per-device localStorage) ======
  const USER_KEY = 'dashboard_user_v1';
  const ROLE_KEY = 'dashboard_role_v1';   // 'idan' (elevated, PIN 4556) | 'team' (PIN 0540)
  function getCurrentUser() { return localStorage.getItem(USER_KEY) || ''; }
  function getRole()        { return localStorage.getItem(ROLE_KEY) || ''; }
  // Trustworthy elevated check — only a device that entered Idan's PIN is 'idan'.
  function isIdan()         { return getRole() === 'idan' && getCurrentUser() === 'עידן'; }
  // Who may use the EMS tab (view tasks + act: status/comment/edit/create, visit→EMS).
  // Each connects with their OWN EMS account; tab is gated by name. עידן also has the
  // Idan-only powers (approvals/attendance) — those stay on isIdan(), not this list.
  const EMS_USERS = ['עידן', 'ניתאי', 'אביאם', 'עמיחי', 'מתניה'];
  function canUseEms()      { return EMS_USERS.indexOf(getCurrentUser()) !== -1; }
  // Flow: pick name (loginModal) → enter PIN (authGate). PIN: עידן=4556, all others=0540.
  let _pendingUser = '';
  function setLoggedInUser(name) {
    _pendingUser = name;
    document.getElementById('loginModal').classList.remove('open');
    const sub = document.getElementById('authGateSub');
    if (sub) sub.textContent = 'שלום ' + name + ' — הזן קוד גישה';
    const title = document.getElementById('authGateTitle');
    if (title) title.textContent = '🔑 קוד גישה';
    document.getElementById('authError').textContent = '';
    document.getElementById('authGate').style.display = 'flex';
    const input = document.getElementById('authCode');
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
  function backToNamePicker() {
    _pendingUser = '';
    document.getElementById('authGate').style.display = 'none';
    document.getElementById('authError').textContent = '';
    applyLoginRoleOptions();
    document.getElementById('loginModal').classList.add('open');
  }
  function updateUserBadge() {
    applyNavVisibility();
    const badge = document.getElementById('userBadge');
    if (!badge) return;
    const user = getCurrentUser();
    badge.textContent = user ? `👤 ${user}` : '👤 לא מחובר';
    document.body.classList.toggle('user-idan', isIdan());
  }
  // Aviam's attendance report is private — only Aviam (and Idan, who sees all) may open it.
  const ATT_PEOPLE = ['אביאם', 'ניתאי'];   // each has their OWN private monthly attendance report
  function canSeeAttendance() { return ATT_PEOPLE.indexOf(getCurrentUser()) !== -1 || getCurrentUser() === 'עמיחי'; }   // עידן removed; עמיחי (CEO) sees all
  // Whose attendance the report shows / a save writes: the field user themself; for עידן a toggle.
  function attPerson() { const u = getCurrentUser(); return ATT_PEOPLE.indexOf(u) !== -1 ? u : (window._attPerson || 'אביאם'); }
  function setAttPerson(p) { window._attPerson = p; renderAttendanceReport(); }
  function applyNavVisibility() {
    const att = document.getElementById('navAttendance');
    if (att) att.style.display = canSeeAttendance() ? '' : 'none';
    const ems = document.getElementById('navEms');   // EMS tasks — עידן/ניתאי/אביאם
    if (ems) ems.style.display = canUseEms() ? '' : 'none';
    const staff = document.getElementById('navStaff');   // עידן + עמיחי only
    if (staff) staff.style.display = (typeof canManageStaff === 'function' && canManageStaff()) ? '' : 'none';
    const inv = document.getElementById('navInventory');   // מתניה (dev, office) doesn't handle inventory
    if (inv) inv.style.display = (getCurrentUser() !== 'מתניה') ? '' : 'none';
    const mb = document.getElementById('meetingBadge');    // meeting mode — עידן only
    if (mb) mb.style.display = isIdan() ? '' : 'none';
    const dev = document.getElementById('navDev');         // פיתוח — עידן + עמיחי only
    if (dev) dev.style.display = (typeof canSeeDevTasks === 'function' && canSeeDevTasks()) ? '' : 'none';
    if (typeof updateEmsBubble === 'function') updateEmsBubble();
  }
  // EMS connection bubble — live status (🟢/🟠) + link to the EMS web system.
  function updateEmsBubble() {
    const b = document.getElementById('emsBubble');
    if (!b) return;
    // read the token directly (avoid cross-module calls that can TDZ during init)
    var on = false;
    try {
      var _t = localStorage.getItem('ems_token_v1');
      var _at = parseInt(localStorage.getItem('ems_token_at_v1') || '0', 10);
      on = !!_t && _at > 0 && (Date.now() - _at) < 60 * 60 * 1000;
    } catch (e) {}
    b.textContent = on ? '🟢 מחובר ל-EMS' : '🔴 אין חיבור ל-EMS';
    b.style.background = on ? '#dcfce7' : '#fee2e2';
    b.style.borderColor = on ? '#16a34a' : '#dc2626';
    b.style.color = on ? '#15803d' : '#991b1b';
    b.title = on ? 'מחובר ל-EMS · לחץ לפתיחת המערכת' : 'אין חיבור ל-EMS — לחץ להתחברות למערכת';
  }
  window.updateEmsBubble = updateEmsBubble;
  setInterval(function () { try { updateEmsBubble(); } catch (e) {} }, 60000);
  setTimeout(function () { try { updateEmsBubble(); } catch (e) {} }, 800);
  // עידן is always shown in the picker; clicking it is PIN-gated (see setLoggedInUser).
  function applyLoginRoleOptions() {
    const idanBtn = document.getElementById('loginBtnIdan');
    if (idanBtn) idanBtn.style.display = '';
  }
  function changeUser() {
    if (LOGIN_FLAG) {   // EMS-login mode → real logout (clears the EMS session + identity, back to the gate)
      if (confirm('להתנתק מהמערכת?') && typeof window.gateLogout === 'function') window.gateLogout();
      return;
    }
    if (confirm('להחליף משתמש? (השם הנוכחי יוסר מהמכשיר)')) {
      localStorage.removeItem(USER_KEY);
      updateUserBadge();
      applyLoginRoleOptions();
      document.getElementById('loginModal').classList.add('open');
    }
  }
  // ====== Password gate (per-PIN: 4556=עידן elevated, 0540=team) ======
  const AUTH_KEY = 'dashboard_auth_v4';   // v4: forces one-time re-auth at the EMS-login cutover
  const IDAN_PIN = '4556';
  const TEAM_PIN = '0540';
  function isAuthed() { return localStorage.getItem(AUTH_KEY) === 'ok' && !!getCurrentUser(); }
  function checkAuthCode() {
    const input = document.getElementById('authCode');
    const code = input.value;
    const name = _pendingUser;
    if (!name) { backToNamePicker(); return; }          // safety: no name chosen → back to picker
    const expected = (name === 'עידן') ? IDAN_PIN : TEAM_PIN;
    if (code === expected) {
      localStorage.setItem(USER_KEY, name);
      localStorage.setItem(ROLE_KEY, (name === 'עידן') ? 'idan' : 'team');
      localStorage.setItem(AUTH_KEY, 'ok');
      _pendingUser = '';
      document.getElementById('authGate').style.display = 'none';
      updateUserBadge();
      const t = document.getElementById('toast');
      t.textContent = 'שלום ' + name + ' 👋' + (name === 'עידן' ? ' (הרשאת מנהל)' : '');
      t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
    } else {
      document.getElementById('authError').textContent = 'קוד שגוי — נסה שוב';
      input.value = '';
      input.focus();
    }
  }
  // Entry point. ?login=1 → real EMS login gate (js/src/15-login-gate.js). Otherwise the
  // legacy name-picker + PIN (kept as default so the live app can never lock anyone out).
  const LOGIN_FLAG = location.search.indexOf('login=0') === -1;   // default ON (EMS login); ?login=0 = break-glass to the legacy PIN entry
  if (!LOGIN_FLAG && !isAuthed()) {
    applyLoginRoleOptions();
    document.getElementById('loginModal').classList.add('open');
  }
  applyLoginRoleOptions();
  updateUserBadge();
  updateMeetingBadge();
  if (isMeetingMode()) document.body.classList.add('meeting-mode');

  // Compute the counts/percentages from the static cards on first paint, so the numbers
  // are correct immediately instead of showing stale hardcoded HTML until the fetch lands.
  updateStatsFromCards();
  refreshData();
  // Smart polling: only when tab is visible. Pauses when user switches tabs/minimizes.
  let _pollHandle = null;
  function startPolling() {
    if (_pollHandle) return;
    _pollHandle = setInterval(refreshData, 15000);
  }
  function stopPolling() {
    if (_pollHandle) { clearInterval(_pollHandle); _pollHandle = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling();
    else { refreshData(); startPolling(); }
  });
  if (!document.hidden) startPolling();

  // Re-render inventory on viewport resize (mobile ↔ desktop layout swap)
  let _invResizeTimer = null;
  let _wasMobile = window.innerWidth < 768;
  window.addEventListener('resize', () => {
    clearTimeout(_invResizeTimer);
    _invResizeTimer = setTimeout(() => {
      const isMobile = window.innerWidth < 768;
      if (isMobile === _wasMobile) return; // no crossing the breakpoint
      _wasMobile = isMobile;
      const invView = document.getElementById('inventory-view');
      if (invView && invView.style.display !== 'none' && typeof renderInventory === 'function') {
        renderInventory();
      }
    }, 250);
  });

  // ===== My Tasks Report =====
  // Contact map: name → { email, phone }. Phones in international format (972...).
  const CONTACTS = {
    'עידן':    { email: 'pm@sigmatec-energy.com', phone: '972544649833' },
    'עמיחי':   { email: '',                       phone: '972524234370' },
    'אביאם':   { email: '',                       phone: '972505599535' },
    'ניתאי':   { email: '',                       phone: '972528119081' },
    'אבצן':    { email: '',                       phone: '972547854565' },
    'מתניה':   { email: '',                       phone: '972526928649' },
    'אליה':    { email: '',                       phone: '' }
  };

  // Region order — north to south
  const REGION_ORDER = [
    'גליל וגולן',
    'העמקים',
    'מישור החוף והשרון',
    'שפלה ומרכז',
    'יהודה ושומרון',
    'דרום, עוטף עזה והנגב'
  ];

  // Test if this person is the owner — either via the owners field
  // OR via a line ending with "- person_name" in status/expectedTask/task
  function isOwnerOf(task, person) {
    if ((task.owners || []).map(s => s.trim()).includes(person)) return true;
    const haystack = (task.status || '') + '\n' + (task.expectedTask || '') + '\n' + (task.task || '');
    const esc = person.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('-\\s*' + esc + '\\s*(?:\\n|$)', 'm');
    return re.test(haystack);
  }

  // Extract only the lines that explicitly mention "- person_name"
  function linesForPerson(text, person) {
    if (!text) return [];
    const esc = person.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('-\\s*' + esc + '\\s*$');
    return String(text).split(/\n+/).map(l => l.trim()).filter(l => re.test(l));
  }

  // ===== Company Tasks editing (localStorage with team-share option) =====
  const COMPANY_TASKS_KEY = 'companyTasks_v1';

  function readCompanyTasksFromDOM() {
    const out = {};
    [['orders','🛒 הזמנות'],['info','ℹ️ מידע'],['guidelines','📋 הנחיות']].forEach(([cls,heading]) => {
      const el = document.querySelector('.company-task-group.' + cls + ' ol');
      out[cls] = el ? Array.from(el.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean) : [];
    });
    return out;
  }

  function loadCompanyTasks() {
    // Sheet data takes priority (shared across devices)
    const fromSheet = window.SHEET_DATA && window.SHEET_DATA.settings && window.SHEET_DATA.settings.companyTasks;
    if (fromSheet) return fromSheet;
    try {
      const saved = localStorage.getItem(COMPANY_TASKS_KEY);
      if (!saved) return null;
      return JSON.parse(saved);
    } catch(e) { return null; }
  }

  function renderCompanyTasks() {
    const data = loadCompanyTasks();
    if (!data) return;
    ['orders','info','guidelines'].forEach(g => {
      const el = document.querySelector('.company-task-group.' + g + ' ol');
      if (!el || !Array.isArray(data[g])) return;
      el.innerHTML = data[g].map(item => '<li>' + item.replace(/</g,'&lt;') + '</li>').join('');
    });
  }

  function openCompanyTasksModal() {
    const current = loadCompanyTasks() || readCompanyTasksFromDOM();
    document.getElementById('compOrders').value = (current.orders || []).join('\n');
    document.getElementById('compInfo').value = (current.info || []).join('\n');
    document.getElementById('compGuidelines').value = (current.guidelines || []).join('\n');
    document.getElementById('companyTasksModal').classList.add('open');
  }

  function gatherCompanyTasksFromForm() {
    const clean = id => document.getElementById(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    return {
      orders:     clean('compOrders'),
      info:       clean('compInfo'),
      guidelines: clean('compGuidelines')
    };
  }

  async function saveCompanyTasks() {
    const data = gatherCompanyTasksFromForm();
    localStorage.setItem(COMPANY_TASKS_KEY, JSON.stringify(data)); // local safety net so nothing is lost
    // optimistic UI: reflect immediately + close the modal, then persist in the background
    if (window.SHEET_DATA) {
      window.SHEET_DATA.settings = window.SHEET_DATA.settings || {};
      window.SHEET_DATA.settings.companyTasks = data;
    }
    renderCompanyTasks();
    document.getElementById('companyTasksModal').classList.remove('open');
    const t = document.getElementById('toast');
    t.textContent = '⏳ שומר…';
    t.classList.add('show');
    // Persist to Supabase (settings.companyTasks via the write shim). Writes need the AUTHENTICATED
    // bridge pass — anon is read-only (RLS). If the pass is missing/expired, re-mint it first, else the
    // write goes out as anon and is rejected → the old "saved locally only" failure. Timeout so a slow
    // backend can't hang the UI; the local copy above is the fallback either way.
    let ok = false;
    try {
      if ((!window._sbToken || (window._sbTokenExp || 0) <= Date.now()) && typeof window._sbBridge === 'function') {
        try { await window._sbBridge(); } catch (e) {}
      }
      const resp = await Promise.race([
        fetch(SHEET_API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'setting', key: 'companyTasks', value: data })
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
      ]);
      const res = await resp.json().catch(() => null);
      ok = !!(res && res.ok);
    } catch (e) { ok = false; }
    t.textContent = ok ? '✅ משימות החברה נשמרו' : '⚠️ נשמר במכשיר — השמירה לשרת נכשלה. ודא חיבור/התחברות ל-EMS ונסה שוב.';
    setTimeout(() => t.classList.remove('show'), ok ? 2500 : 5500);
  }

  // Apply any saved company tasks on load
  renderCompanyTasks();

  function buildCompanyTasksSection() {
    const root = document.querySelector('.company-tasks');
    if (!root) return '';
    let section = '\n*━━━ 📌 משימות חברה כלליות ━━━*\n';
    let hasAny = false;
    root.querySelectorAll('.company-task-group').forEach(group => {
      const heading = (group.querySelector('h4')?.textContent || '').trim();
      const items = Array.from(group.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean);
      if (!items.length) return;
      hasAny = true;
      if (heading) section += `\n*${heading}*\n`;
      items.forEach(it => { section += `- ${it}\n`; });
    });
    return hasAny ? section + '\n' : '';
  }

  function buildMyTasksReport(person) {
    if (!window.SHEET_DATA || !window.SHEET_DATA.tasks) return '';
    const owned = window.SHEET_DATA.tasks.filter(t => isOwnerOf(t, person));

    // Group by region
    const byRegion = {};
    owned.forEach(t => {
      const region = t.region && t.region !== '#N/A' ? t.region : 'ללא אזור';
      if (!byRegion[region]) byRegion[region] = [];
      byRegion[region].push(t);
    });

    // Order regions: known order first, then any unknown alphabetically
    const knownOrdered = REGION_ORDER.filter(r => byRegion[r]);
    const unknown = Object.keys(byRegion).filter(r => !REGION_ORDER.includes(r)).sort();
    const orderedRegions = [...knownOrdered, ...unknown];

    const header = `*📋 משימות באחריותי — ${person}*\n📅 ${new Date().toLocaleString('he-IL')}\n`;
    const companySection = buildCompanyTasksSection();

    if (orderedRegions.length === 0) {
      return header + companySection + '\n✨ אין משימות אישיות פתוחות';
    }

    let report = header + companySection;

    orderedRegions.forEach(region => {
      report += `\n*━━━ ${region} ━━━*\n`;
      byRegion[region].forEach(t => {
        // Decide which lines to show:
        // 1. Lines mentioning "- person" in status/expectedTask
        // 2. If none, but person is in owners array → show all status/task lines
        const personStatusLines = linesForPerson(t.status, person);
        const personTaskLines = linesForPerson(t.expectedTask, person);
        const allPersonLines = [...personStatusLines, ...personTaskLines];

        const cleanLines = (raw) => String(raw || '').split(/\n+/).map(s => s.trim()).filter(s => s && s !== '-');

        let lines;
        if (allPersonLines.length > 0) {
          lines = allPersonLines;
        } else {
          // person is in owners — show generic status/task
          const allStatus = cleanLines(t.status);
          const allTask = cleanLines(t.expectedTask);
          lines = [...allTask, ...allStatus];
        }

        // De-duplicate while preserving order
        const seen = new Set();
        lines = lines.filter(l => { if (seen.has(l)) return false; seen.add(l); return true; });

        report += `*${t.name}*${t.code ? ' (#' + t.code + ')' : ''}\n`;
        if (lines.length === 0) {
          report += `- (אין פירוט)\n`;
        } else {
          lines.forEach(l => { report += `- ${l}\n`; });
        }
      });
    });

    report += `\n🔗 https://gist.githack.com/PM-Sigma/4863a959e53104be99a98fa33b5abace/raw/kibbutz-dashboard.html`;
    return report;
  }

  function generateMyTasksReport(action) {
    const person = document.getElementById('myTasksPerson').value;
    if (!person) { alert('בחר אחראי קודם'); return; }
    const report = buildMyTasksReport(person);
    const contact = CONTACTS[person] || {};

    if (action === 'preview') {
      try {
        const html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>דוח</title></head><body><pre style="font-family:Heebo,Tahoma,sans-serif;font-size:14px;direction:rtl;padding:20px;white-space:pre-wrap;">' + report.replace(/</g, '&lt;') + '</pre></body></html>';
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) alert('הדפדפן חסם את פתיחת הדוח. אנא אפשר חלונות קופצים.');
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } catch (e) {
        alert('שגיאה: ' + e.message);
      }
    } else if (action === 'copy') {
      navigator.clipboard.writeText(report).then(() => {
        const t = document.getElementById('toast');
        t.textContent = '✅ הדוח הועתק לקליפבורד';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
      });
    } else if (action === 'email') {
      const to = contact.email || '';
      const subject = encodeURIComponent('משימות באחריותך — ' + person);
      const body = encodeURIComponent(report);
      window.location.href = 'mailto:' + to + '?subject=' + subject + '&body=' + body;
    } else if (action === 'whatsapp') {
      if (!contact.phone) { alert('אין מספר טלפון רשום עבור ' + person); return; }
      window.open('https://wa.me/' + contact.phone + '?text=' + encodeURIComponent(report), '_blank');
    }
  }

  // ===========================================================
  // EMS INTEGRATION
  // ===========================================================
  const EMS_URL_KEY      = 'ems_url_v1';
  const EMS_TOKEN_KEY    = 'ems_token_v1';
  const EMS_TOKEN_AT_KEY = 'ems_token_at_v1';
  const EMS_MAX_SESSION_MS = 60 * 60 * 1000;   // hard cap: 60 minutes per connection

  function getEmsUrl()      { return (localStorage.getItem(EMS_URL_KEY) || 'https://api.sigmatec-ems.com').replace(/\/$/, ''); }
  // Session expires after 60 min (or sooner if the JWT 401s — handled in emsApi).
  function emsSessionExpired() {
    const at = parseInt(localStorage.getItem(EMS_TOKEN_AT_KEY) || '0', 10);
    return !at || (Date.now() - at) > EMS_MAX_SESSION_MS;
  }
  function clearEmsSession() {
    localStorage.removeItem(EMS_TOKEN_KEY);
    localStorage.removeItem(EMS_TOKEN_AT_KEY);
  }
  function getEmsToken() {
    if (emsSessionExpired()) { clearEmsSession(); return ''; }
    return localStorage.getItem(EMS_TOKEN_KEY) || '';
  }
  function isEmsConnected() { return !!getEmsToken(); }

  // Proactively log out exactly at the 60-min cap while the user sits on the page.
  let _emsExpiryTimer = null;
  function scheduleEmsExpiry() {
    if (_emsExpiryTimer) clearTimeout(_emsExpiryTimer);
    const at = parseInt(localStorage.getItem(EMS_TOKEN_AT_KEY) || '0', 10);
    if (!at) return;
    const left = EMS_MAX_SESSION_MS - (Date.now() - at);
    _emsExpiryTimer = setTimeout(() => {
      clearEmsSession();
      if (document.getElementById('ems-view').style.display !== 'none') renderEmsPage();
      const t = document.getElementById('toast');
      if (t) { t.textContent = '🔒 החיבור ל-EMS פג (60 דק׳) — התחבר מחדש'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000); }
    }, Math.max(0, left));
  }

  function emsDisconnect() {
    if (!confirm('לנתק מה-EMS?')) return;
    clearEmsSession();
    if (_emsExpiryTimer) clearTimeout(_emsExpiryTimer);
    renderEmsPage();
  }

  // All EMS calls are relayed through the Apps Script proxy (type='ems') to
  // bypass browser CORS — the dashboard never talks to the EMS host directly.
  // Proxy returns { status, body } (or { error }).
  async function emsProxyCall(base, path, method, token, payload) {
    const res = await fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'ems', base, path, method, token, payload })
    });
    return res.json();
  }

  async function emsApi(path, options = {}) {
    const wrapped = await emsProxyCall(
      getEmsUrl(),
      '/v1' + path,
      options.method || 'GET',
      getEmsToken(),
      options.body ? JSON.parse(options.body) : null
    );
    if (wrapped.error) throw new Error(wrapped.error);
    if (wrapped.status === 401) {
      clearEmsSession();
      renderEmsPage();
      throw new Error('פג תוקף החיבור — התחבר מחדש');
    }
    // Surface real API errors (422/403/500…) instead of silently returning an
    // error body that callers mistake for "empty".
    if (wrapped.status && wrapped.status >= 400) {
      const b = wrapped.body || {};
      const msg = Array.isArray(b.message) ? b.message.join(', ') : (b.message || (typeof b === 'string' ? b.slice(0, 160) : JSON.stringify(b).slice(0, 160)));
      throw new Error('(' + wrapped.status + ') ' + msg);
    }
    return wrapped.body;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EMS shared CACHE + outbound QUEUE  (Phase 1)
  // ---------------------------------------------------------------------------
  // The Sheet holds a full snapshot of OPEN EMS tasks (EMS_CACHE), refreshed on
  // every successful connect, PLUS an outbound QUEUE (EMS_QUEUE) of writes made
  // while disconnected. All EMS users are admins → full-replace snapshot and any
  // connected user may flush the queue. This is what lets field users (who don't
  // connect to EMS) still SEE open tasks on kibbutz cards, and lets their visit
  // summaries reach EMS on the next connect by anyone.
  // ═══════════════════════════════════════════════════════════════════════════
  function emsOpenStatuses() {
    return Object.keys(EMS_STATUS).filter(s => EMS_CLOSED.indexOf(s) === -1);
  }
  function emsCacheData() {
    const c = window.SHEET_DATA && window.SHEET_DATA.emsCache;
    return (c && Array.isArray(c.tasks)) ? c : { tasks: [], syncedAt: '', syncedBy: '' };
  }
  // Open EMS tasks for a kibbutz card — reads the shared cache, resolves via the
  // bridge map (aggregates across merged sites, e.g. שדה אליהו + חקלאות).
  function emsCacheTasksForKibbutz(name) {
    const ids = kibbutzSiteIds(name);
    if (!ids.length) return [];
    return emsCacheData().tasks.filter(t => t.site && ids.indexOf(t.site.id) !== -1 && EMS_CLOSED.indexOf(t.status) === -1);
  }

  // Pull ALL open tasks from EMS (paginated) and write a fresh snapshot to the Sheet.
  async function emsSyncCache() {
    if (!isEmsConnected()) return { cached: 0 };
    const TAKE = 200;
    const open = [];
    let page = 1;
    for (;;) {
      const params = new URLSearchParams({ page: page, take: TAKE });
      emsOpenStatuses().forEach(s => params.append('status', s));
      const res = await emsApi('/employee-tasks?' + params.toString());
      const batch = res.data || (Array.isArray(res) ? res : []);
      open.push.apply(open, batch);
      const total = (res.meta && (res.meta.total != null ? res.meta.total : res.meta.count));
      // stop on: empty page, short page (last page), reached total, or page cap. The short-page
      // check also guards APIs that omit meta.total and clamp page → repeating full pages.
      if (batch.length < TAKE || (total != null && open.length >= total)) break;
      if (page >= 20) { console.warn('[EMS] cache sync hit page cap (20) — snapshot may be truncated at', open.length, 'of', total); break; }
      page++;
    }
    // de-dup by id (clamping/overlapping pages can repeat tasks)
    const _seen = {};
    const slim = open.filter(t => t && t.id && !_seen[t.id] && (_seen[t.id] = 1)).map(t => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority, type: t.type,
      site: t.site ? { id: t.site.id, name: t.site.name } : null,
      expectedCompletionDate: t.expectedCompletionDate || '',
      assignee: t.assignee ? { id: t.assignee.id, firstName: t.assignee.firstName, lastName: t.assignee.lastName } : null,
      linkType: (t.linkType || t.link_type || ''), linkCount: emsLinkIds(t).length
    }));
    const syncedBy = localStorage.getItem('dashboard_user_v1') || '';
    // ponytail: last-writer-wins snapshot — a slow sync could overwrite a fresher one.
    // Self-heals on the next connect/sync. Upgrade path: send fetch-start ts, server keeps newer.
    await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'emsCacheWrite', syncedBy: syncedBy, tasks: slim }) });
    if (window.SHEET_DATA) window.SHEET_DATA.emsCache = { tasks: slim, syncedAt: new Date().toISOString(), syncedBy: syncedBy };
    return { cached: slim.length };
  }

  // Outbound queue ---------------------------------------------------------
  function emsQueuePending() { return (window.SHEET_DATA && window.SHEET_DATA.emsQueue) || []; }
  // Enqueue a write to perform on the next connect. item = {kind:'comment'|'status', taskId, message?, status?, meta?}
  async function emsQueueAdd(item) {
    const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'emsQueueAdd', item: item }) });
    let id = null; try { const b = await r.json(); id = b && b.id; } catch (e) {}
    // reflect in memory immediately so a same-session flush sees the item with its server id
    if (id && window.SHEET_DATA) { (window.SHEET_DATA.emsQueue = window.SHEET_DATA.emsQueue || []).push(Object.assign({ id: id }, item)); }
    return id;
  }
  async function emsSendItem(item) {
    if (item.kind === 'comment') return emsApi('/employee-tasks/' + item.taskId + '/comments', { method: 'POST', body: JSON.stringify({ message: item.message }) });
    if (item.kind === 'status')  return emsApi('/employee-tasks/' + item.taskId, { method: 'PATCH', body: JSON.stringify({ status: item.status }) });
  }
  // Try a write live; queue it for next connect ONLY on connectivity/expiry errors.
  // A real API rejection (4xx/5xx — emsApi throws "(NNN) …") is NOT retryable: queuing
  // it would loop forever, so we surface it instead.
  async function emsWriteOrQueue(item) {
    if (isEmsConnected()) {
      try { await emsSendItem(item); return { sent: true }; }
      catch (e) {
        const httpErr = /^\(\d{3}\)/.test(e.message || '');
        if (httpErr && isEmsConnected()) return { sent: false, error: e.message };   // real rejection → don't queue
        /* connectivity/expiry → fall through to queue */
      }
    }
    await emsQueueAdd(item);
    return { sent: false, queued: true };
  }

  // Idempotency guard: ids we already sent to EMS but haven't confirmed-cleared from
  // the Sheet queue yet. Prevents duplicate EMS comments if emsQueueClear ever fails.
  function _emsFlushedIds() { try { return JSON.parse(localStorage.getItem('ems_flushed_ids_v1') || '[]'); } catch (e) { return []; } }
  function _emsAddFlushed(id) { const s = _emsFlushedIds(); if (id && s.indexOf(id) === -1) { s.push(id); localStorage.setItem('ems_flushed_ids_v1', JSON.stringify(s.slice(-300))); } }
  function _emsDropFlushed(ids) { localStorage.setItem('ems_flushed_ids_v1', JSON.stringify(_emsFlushedIds().filter(x => ids.indexOf(x) === -1))); }

  // Replay queued writes (called on connect). Returns {done, failed, skipped, dead}.
  // ponytail: dedup guard is per-browser (localStorage _emsFlushedIds). Two admins flushing the
  // SAME Sheet queue at the same instant can double-send one comment — rare + reversible.
  // Upgrade path if it bites: claim rows server-side under the script lock before sending.
  async function emsQueueFlush() {
    if (!isEmsConnected()) return { done: 0, failed: 0, skipped: 0, dead: 0 };
    const q = emsQueuePending();
    const alreadySent = _emsFlushedIds();
    const doneIds = []; let failed = 0, skipped = 0, dead = 0;
    for (const item of q) {
      if (item.id && alreadySent.indexOf(item.id) !== -1) { doneIds.push(item.id); skipped++; continue; }  // sent before, clear pending
      try {
        await emsSendItem(item);
        _emsAddFlushed(item.id);
        doneIds.push(item.id);
      } catch (e) {
        if (!isEmsConnected()) break;             // 401/expiry → stop, leave the rest queued
        const httpErr = /^\(\d{3}\)/.test(e.message || '');
        if (httpErr) { _emsAddFlushed(item.id); doneIds.push(item.id); dead++; }   // permanently rejected → dead-letter (NOT a successful send)
        else failed++;
      }
    }
    if (doneIds.length) {
      try {
        const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'emsQueueClear', ids: doneIds }) });
        const body = await r.json().catch(() => null);
        if (body && body.ok) _emsDropFlushed(doneIds);   // confirmed cleared → release the guard ids
      } catch (e) { console.warn('emsQueueClear failed — items stay guarded against re-send', e); }
    }
    return { done: doneIds.length - skipped - dead, failed: failed, skipped: skipped, dead: dead };  // done = real sends only
  }

  // Orchestrate on a successful connect: flush pending writes, then refresh the snapshot.
  let _emsSyncedThisSession = false;
  async function emsOnConnected(force) {
    if (_emsSyncedThisSession && !force) return;
    _emsSyncedThisSession = true;
    let flushed = { done: 0, failed: 0, dead: 0 };
    try { flushed = await emsQueueFlush(); } catch (e) { console.warn('EMS queue flush failed', e); }
    try { await emsSyncCache(); } catch (e) { console.warn('EMS cache sync failed', e); }
    if (flushed.done) emsToast('✅ נשלחו ' + flushed.done + ' פעולות שהמתינו בתור');
    if (flushed.dead) emsToast('⚠️ ' + flushed.dead + ' פעולות בתור נדחו ע"י EMS ונמחקו (בדוק בלוג)');
    setTimeout(function () { if (typeof refreshData === 'function') refreshData(); }, 1200);
  }

  // ---- On-card EMS tasks widget (field 2) ----
  const EMS_PRIORITY_DOT = { urgent: '#dc2626', high: '#ea580c', normal: '#64748b', low: '#94a3b8' };
  function emsSyncStamp(iso) {
    if (!iso) return '';
    try { return ' · עודכן ' + new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  // Attach the EMS-tasks widget to every site-mapped card. Runs as its own pass so it
  // also covers cards that have NO Sheet row (e.g. a newly-added kibbutz). No-op until
  // the shared cache has actually been synced (syncedAt set) — until then cards keep
  // their legacy expectedTask via the enrichment fallback.
  function applyCardEmsWidgets() {
    if (!emsCacheData().syncedAt) return;
    document.querySelectorAll('.kibbutz[data-name]').forEach(card => {
      card.querySelectorAll('.card-ems, .card-ems-new').forEach(e => e.remove());   // clear stale
      const nm = card.dataset.name;
      if (!kibbutzSiteIds(nm).length) return;   // not an EMS-mapped kibbutz
      // Widget appears ONLY when there are open tasks. The "open new EMS task" affordance
      // lives inside the kibbutz modal (below the status), not on the cards.
      try { renderCardEmsTasks(card, nm); }
      catch (e) { console.warn('[EMS] card widget failed for', nm, e); }
    });
  }
  // Append the "משימות מה-EMS" block to a kibbutz card (open tasks from the shared cache).
  function renderCardEmsTasks(card, name) {
    const tasks = emsCacheTasksForKibbutz(name);
    if (!tasks.length) return false;   // no open task → caller shows the "open new EMS task" line
    const cache = emsCacheData();
    const wrap = document.createElement('div');
    wrap.className = 'card-ems excel-injected';
    const head = document.createElement('div');
    head.className = 'card-ems-head';
    head.innerHTML = '📋 משימות מה-EMS <span class="card-ems-stale">(' + tasks.length + emsSyncStamp(cache.syncedAt) + ')</span>';
    wrap.appendChild(head);
    tasks.forEach(t => {
      const row = document.createElement('div');
      const overdue = t.expectedCompletionDate && EMS_CLOSED.indexOf(t.status) === -1 && new Date(t.expectedCompletionDate) < new Date();
      row.className = 'card-ems-task status-' + t.status + (overdue ? ' overdue' : '');
      row.innerHTML =
        '<span class="t-dot" style="background:' + (EMS_PRIORITY_DOT[t.priority] || '#94a3b8') + '"></span>' +
        '<span class="t-title">' + (overdue ? '⏰ ' : '') + emsEsc(t.title) + (t.linkCount ? ' 🔗' + t.linkCount : '') + '</span>' +
        '<span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span>';
      row.onclick = (e) => { e.stopPropagation(); openKibbutzEmsTask(t.id); };
      wrap.appendChild(row);
    });
    // deterministic order: name → status → EMS tasks. Insert right after the status
    // (or the name) instead of blind-append, so the widget can never land above the name.
    const anchor = card.querySelector(':scope > .excel-status')
                || card.querySelector(':scope > .kibbutz-name-row')
                || card.querySelector(':scope > .kibbutz-name');
    if (anchor) anchor.insertAdjacentElement('afterend', wrap);
    else card.appendChild(wrap);
    return true;
  }
  // Click a task on a card: connected → full live detail (+comments); offline → cached read-only view.
  function openKibbutzEmsTask(id) {
    if (isEmsConnected()) { openEmsTask(id); return; }
    const t = emsCacheData().tasks.find(x => x.id === id);
    const modal = document.getElementById('emsDetailModal');
    if (!t || !modal) { alert('המשימה אינה בנתונים המקומיים — התחבר ל-EMS לצפייה מלאה.'); return; }
    window._emsCurrentTask = t;
    const site = t.site && t.site.name ? t.site.name : '—';
    const due  = t.expectedCompletionDate ? new Date(t.expectedCompletionDate).toLocaleDateString('he-IL') : '—';
    document.getElementById('emsDetailContent').innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
        '<h3 style="margin:0;flex:1;color:var(--primary);">' + emsEsc(t.title) + '</h3>' +
        '<button onclick="document.getElementById(\'emsDetailModal\').classList.remove(\'open\')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">✕</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">' +
        '<span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span>' +
        '<span class="ems-badge priority-' + t.priority + '">' + (EMS_PRIORITY[t.priority] || t.priority) + '</span>' +
      '</div>' +
      '<div style="font-size:13px;color:#475569;line-height:1.9;">🏢 אתר: ' + emsEsc(site) + '<br>📅 יעד: ' + due + '</div>' +
      '<div style="margin-top:12px;padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12px;color:#9a3412;">🔌 תצוגה מהמטמון המקומי. התחבר ל-EMS (טאב 📋 EMS משימות) כדי לראות תגובות, לעדכן סטטוס ולהגיב.</div>';
    modal.classList.add('open');
  }

  // ===== "המשימות שלי" (Phase 3) — merge EMS (assignee/owner) + status "- name" lines =====
  function openKibbutzByName(name) {
    const sel = (window.CSS && CSS.escape) ? CSS.escape(name) : name.replace(/"/g, '\\"');
    const card = document.querySelector('.kibbutz[data-name="' + sel + '"]');
    if (card) openEditModal(card);
  }
  // ===== Company calendar (visits + attendance/vacations + scheduled EMS tasks + events) =====
  window.calViewYear  = new Date().getFullYear();
  window.calViewMonth = new Date().getMonth();
  function changeCalMonth(delta) {
    window.calViewMonth += delta;
    if (window.calViewMonth > 11) { window.calViewMonth = 0; window.calViewYear++; }
    if (window.calViewMonth < 0)  { window.calViewMonth = 11; window.calViewYear--; }
    renderCompanyCalendar();
  }
  function calEsc(s) { return String(s == null ? '' : s).replace(/</g, '&lt;'); }
  // One-click "add to MY calendar": a Google-Calendar create-event URL from any event.
  function calAddLink(d, title, details) {
    const start = new Date(d);
    if (isNaN(start.getTime())) return '#';
    const end = new Date(start.getTime() + 60 * 60000);
    const fmt = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(title || 'אירוע')
      + '&dates=' + fmt(start) + '/' + fmt(end)
      + '&details=' + encodeURIComponent(details || 'מתוך מערכת ניהול סיגמטק');
  }
  // Build { 'Y-M-D': [{icon,text,cls}] } from all data sources.
  function collectCalendarEvents() {
    const ev = {};
    const push = (d, o) => { if (isNaN(d.getTime())) return; const k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); (ev[k] = ev[k] || []).push(o); };
    (typeof loadAllVisitsCombined === 'function' ? loadAllVisitsCombined() : []).forEach(v => {
      if (!v.date) return;
      push(new Date(v.date), { icon: '📍', text: (v.visitor || '') + ' · ' + (v.kibbutz || '') + (v.workday ? ' (יום עבודה)' : ''), cls: 'cal-visit' });
    });
    // ponytail: per request — the calendar shows ONLY visits (attendance/EMS/events removed).
    return ev;
  }
  function renderCompanyCalendar() {
    const year = window.calViewYear, month = window.calViewMonth;
    const heMonths = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const lbl = document.getElementById('calMonthLabel'); if (lbl) lbl.textContent = heMonths[month] + ' ' + year;
    const grid = document.getElementById('calGrid'); if (!grid) return;
    const ev = collectCalendarEvents();
    const startDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const t = new Date(); const todayK = t.getFullYear() + '-' + t.getMonth() + '-' + t.getDate();
    let html = ['א','ב','ג','ד','ה','ו','ש'].map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < startDow; i++) html += '<div class="cal-cell cal-empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const k = year + '-' + month + '-' + day;
      const items = ev[k] || [];
      let cell = `<div class="cal-cell${k === todayK ? ' cal-today' : ''}" onclick="calDayDetail(${year},${month},${day})"><div class="cal-daynum">${day}</div>`;
      items.slice(0, 3).forEach(it => { cell += `<div class="cal-chip ${it.cls}">${it.icon} ${calEsc(it.text)}</div>`; });
      if (items.length > 3) cell += `<div class="cal-more">+${items.length - 3} נוספים</div>`;
      cell += '</div>';
      html += cell;
    }
    grid.innerHTML = html;
    const panel = document.getElementById('calDayPanel'); if (panel) panel.innerHTML = '';
    renderCalendarAgenda();
  }
  // Upcoming agenda — events from today up to +31 days, ascending (like Google's Schedule view).
  // Surfaces what's "about to happen": future visits + open EMS tasks by due date + calendar events.
  function renderCalendarAgenda() {
    const box = document.getElementById('calAgenda'); if (!box) return;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(end.getDate() + 31);
    const items = [];
    const within = d => !isNaN(d.getTime()) && d >= now && d <= end;
    (typeof loadAllVisitsCombined === 'function' ? loadAllVisitsCombined() : []).forEach(v => {
      if (!v.date) return; const d = new Date(v.date);
      if (within(d)) items.push({ d: d, icon: '📍', text: (v.visitor || '') + ' · ' + (v.kibbutz || ''), cls: 'cal-visit' });
    });
    const emsTasks = (typeof emsCacheData === 'function' ? (emsCacheData().tasks || []) : []);
    emsTasks.forEach(t => {
      if (!t.expectedCompletionDate) return;
      if (typeof EMS_CLOSED !== 'undefined' && EMS_CLOSED.indexOf(t.status) !== -1) return;
      const d = new Date(t.expectedCompletionDate);
      if (within(d)) items.push({ d: d, icon: '📋', text: (t.title || '') + (t.site && t.site.name ? ' · ' + t.site.name : ''), cls: 'cal-ems' });
    });
    const cal = (window.SHEET_DATA && window.SHEET_DATA.calendar) || {};
    Object.entries(cal).forEach(([kib, list]) => (list || []).forEach(e => {
      if (!e || !e.start) return; const d = new Date(e.start);
      if (within(d)) items.push({ d: d, icon: '📅', text: (e.type || 'אירוע') + ' · ' + kib, cls: 'cal-event' });
    }));
    items.sort((a, b) => a.d - b.d);
    let html = '<div class="cal-agenda-head">📋 לוח זמנים — מהקרוב לחודש קדימה</div>';
    if (!items.length) { box.innerHTML = html + '<div style="color:#94a3b8;font-size:13px;padding:6px;">אין אירועים קרובים ב-31 הימים הבאים</div>'; return; }
    let lastK = '';
    items.forEach(it => {
      const k = it.d.getFullYear() + '-' + it.d.getMonth() + '-' + it.d.getDate();
      if (k !== lastK) { lastK = k; html += '<div class="cal-agenda-day">' + it.d.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' }) + '</div>'; }
      html += '<div class="cal-agenda-row"><span class="cal-chip ' + it.cls + '" style="display:inline-block;">' + it.icon + ' ' + calEsc(it.text) + '</span>'
        + '<a href="' + calAddLink(it.d, it.icon + ' ' + it.text, '') + '" target="_blank" rel="noopener" title="הוסף ליומן האישי שלי" style="margin-right:8px;font-size:12px;text-decoration:none;color:var(--primary);white-space:nowrap;">📅 ליומן שלי</a></div>';
    });
    box.innerHTML = html;
  }

  function calDayDetail(y, m, d) {
    const items = (collectCalendarEvents()[y + '-' + m + '-' + d]) || [];
    const panel = document.getElementById('calDayPanel'); if (!panel) return;
    const dateStr = new Date(y, m, d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    panel.innerHTML = '<div class="cal-panel"><strong>' + dateStr + '</strong>' +
      (items.length ? items.map(it => `<div style="margin-top:6px;"><span class="cal-chip ${it.cls}" style="display:inline-block;">${it.icon} ${calEsc(it.text)}</span> <a href="${calAddLink(new Date(y,m,d,9,0), it.icon+' '+it.text, '')}" target="_blank" rel="noopener" style="font-size:12px;text-decoration:none;color:var(--primary);white-space:nowrap;">📅 ליומן שלי</a></div>`).join('')
                    : '<br><span style="color:#94a3b8;">אין אירועים ביום זה</span>') + '</div>';
  }

  function renderMyTasks() {
    const box = document.getElementById('myTasksList');
    if (!box) return;
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    if (!me) { box.innerHTML = '<div style="color:#94a3b8;font-style:italic;">לא מזוהה משתמש מחובר.</div>'; return; }
    const sheetTasks = (window.SHEET_DATA && window.SHEET_DATA.tasks) || [];
    const taskByKib = {}; sheetTasks.forEach(t => { if (t.name) taskByKib[t.name] = t; });
    const siteToKib = {};
    Object.keys(KIBBUTZ_SITE_MAP).forEach(k => (KIBBUTZ_SITE_MAP[k] || []).forEach(id => { if (!siteToKib[id]) siteToKib[id] = k; }));
    const groups = {};
    const g = k => (groups[k] = groups[k] || { ems: [], lines: [] });
    // 1) EMS open tasks: assigned to me OR in a kibbutz I'm responsible for (owners / "- me")
    ((typeof emsCacheData === 'function' ? emsCacheData().tasks : []) || []).forEach(t => {
      if (EMS_CLOSED.indexOf(t.status) !== -1) return;
      const kib = (t.site && siteToKib[t.site.id]) || (t.site && t.site.name) || '—';
      const assignedToMe = t.assignee && emsUserName(t.assignee).indexOf(me) !== -1;
      const sheetT = taskByKib[kib];
      if (assignedToMe || (sheetT && isOwnerOf(sheetT, me))) g(kib).ems.push(t);
    });
    // 2) status / expectedTask lines ending with "- me"
    sheetTasks.forEach(t => {
      const lines = linesForPerson(t.status, me).concat(linesForPerson(t.expectedTask, me));
      const seen = {};
      lines.forEach(l => { if (!seen[l]) { seen[l] = 1; g(t.name).lines.push(l); } });
    });
    const kibs = Object.keys(groups).filter(k => groups[k].ems.length || groups[k].lines.length).sort((a, b) => a.localeCompare(b, 'he'));
    if (!kibs.length) { box.innerHTML = '<div style="color:#94a3b8;font-style:italic;padding:24px 0;text-align:center;">אין משימות פתוחות עבורך 🎉</div>'; return; }
    let html = '';
    kibs.forEach(k => {
      const grp = groups[k], kEsc = k.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      html += '<div style="background:white;border:1px solid var(--border);border-right:3px solid var(--accent);border-radius:10px;padding:10px 12px;margin-bottom:10px;">';
      html += '<div style="font-weight:700;color:var(--primary);margin-bottom:6px;cursor:pointer;" onclick="openKibbutzByName(\'' + kEsc + '\')">🏘️ ' + emsEsc(k) + '</div>';
      grp.ems.forEach(t => {
        const overdue = t.expectedCompletionDate && new Date(t.expectedCompletionDate) < new Date();
        html += '<div class="card-ems-task status-' + t.status + (overdue ? ' overdue' : '') + '" onclick="openKibbutzEmsTask(\'' + t.id + '\')" style="cursor:pointer;">' +
          '<span class="t-dot" style="background:' + (EMS_PRIORITY_DOT[t.priority] || '#94a3b8') + '"></span>' +
          '<span class="t-title">' + (overdue ? '⏰ ' : '') + 'EMS · ' + emsEsc(t.title) + (t.linkCount ? ' 🔗' + t.linkCount : '') + '</span>' +
          '<span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span></div>';
      });
      grp.lines.forEach(l => {
        html += '<div style="font-size:13px;color:#334155;padding:5px 8px;background:#f8fafc;border:1px solid #e8eef5;border-radius:7px;margin:3px 0;cursor:pointer;" onclick="openKibbutzByName(\'' + kEsc + '\')">📝 ' + emsEsc(l) + '</div>';
      });
      html += '</div>';
    });
    box.innerHTML = html;
  }

  // ---- After a visit summary is saved: push it to the kibbutz's open EMS task(s) ----
  function buildVisitSummaryText(kibbutz, visit) {
    const d = visit.date ? new Date(visit.date).toLocaleDateString('he-IL') : '';
    let s = '📋 סיכום ביקור — ' + kibbutz + '\n';
    s += '📅 ' + d + ' · ⏱️ ' + (visit.duration || '?') + ' שעות · 👤 ' + (visit.visitor || '') + '\n';
    if (visit.contact) s += '🤝 איש קשר מלווה: ' + visit.contact + '\n';
    if (visit.products && visit.products.length) s += '📦 מוצרים: ' + visit.products.map(p => (p.qty > 1 ? p.name + ' ×' + p.qty : p.name)).join(', ') + '\n';
    if (visit.productsOther) s += '📦 מוצרים נוספים: ' + visit.productsOther + '\n';
    if (visit.returnedItems && visit.returnedItems.length) s += '↩️ הוחזר (תקול): ' + visit.returnedItems.map(r => r.name + ' ×' + r.qty).join(', ') + '\n';
    if (visit.summary) s += '\n' + visit.summary;
    return s;
  }

  // ---- Phase 2: EMS update folded INTO the visit form (replaces the post-save popup) ----
  window._visitEmsTasks = [];
  // Populate the in-form EMS block when the visit form opens for a kibbutz.
  function prepVisitEmsBlock(kibbutz) {
    const block = document.getElementById('visitEmsBlock');
    const newBlock = document.getElementById('visitEmsNewBlock');
    if (!block) return;
    block.style.display = 'none'; if (newBlock) newBlock.style.display = 'none';
    window._visitEmsTasks = (typeof emsCacheTasksForKibbutz === 'function') ? emsCacheTasksForKibbutz(kibbutz) : [];
    const tasks = window._visitEmsTasks;
    if (tasks.length) {
      document.getElementById('visitEmsTaskPick').innerHTML = tasks.length > 1
        ? tasks.map((t, i) => '<label style="display:flex;gap:6px;align-items:center;font-size:13px;margin:3px 0;cursor:pointer;"><input type="radio" name="visitEmsTask" value="' + t.id + '" ' + (i === 0 ? 'checked' : '') + ' onchange="onVisitEmsTaskChange()"><span style="flex:1;">' + emsEsc(t.title) + '</span><span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span></label>').join('')
        : '<div style="font-weight:700;font-size:13px;">' + emsEsc(tasks[0].title) + '</div><input type="radio" name="visitEmsTask" value="' + tasks[0].id + '" checked style="display:none;">';
      const sel = document.getElementById('visitEmsStatus');
      sel.innerHTML = Object.keys(EMS_STATUS).map(s => '<option value="' + s + '">' + EMS_STATUS[s] + '</option>').join('');
      sel.value = tasks[0].status;   // default = current status
      const head = document.getElementById('visitEmsHead');   // clear message about which task is being updated
      if (head) head.textContent = tasks.length > 1 ? '🔗 בחר את משימת ה-EMS לעדכון מהביקור:' : '🔗 הביקור יעדכן את משימת ה-EMS: «' + tasks[0].title + '»';
      const note = document.getElementById('visitEmsConnNote');
      if (note) note.textContent = isEmsConnected() ? '' : ' (לא מחובר — יישלח בהתחברות הבאה)';
      block.style.display = '';
    } else if (newBlock && typeof canUseEms === 'function' && canUseEms()) {
      newBlock.style.display = '';   // no open task → offer to create one
    }
  }
  function onVisitEmsTaskChange() {
    const picked = document.querySelector('input[name="visitEmsTask"]:checked');
    const t = (window._visitEmsTasks || []).find(x => x.id === (picked && picked.value));
    if (t) document.getElementById('visitEmsStatus').value = t.status;
  }
  function createEmsTaskFromVisit() {
    if (typeof createEmsTaskForKibbutz === 'function') createEmsTaskForKibbutz();
  }
  // Read the in-form EMS intent at save time. null = no block; false = validation failed
  // (status is MANDATORY when a task exists); object = {taskId,status,curStatus}.
  function readVisitEmsIntent() {
    const block = document.getElementById('visitEmsBlock');
    if (!block || block.style.display === 'none') return null;
    const tasks = window._visitEmsTasks || [];
    const picked = document.querySelector('input[name="visitEmsTask"]:checked');
    const taskId = picked ? picked.value : (tasks.length === 1 ? tasks[0].id : null);
    if (!taskId) { alert('נא לבחור משימת EMS לעדכון'); return false; }
    const status = (document.getElementById('visitEmsStatus') || {}).value;
    if (!status) { alert('נא לבחור סטטוס למשימת EMS (חובה)'); return false; }
    const cur = tasks.find(t => t.id === taskId);
    return { taskId: taskId, status: status, curStatus: cur ? cur.status : null };
  }
  // Push the visit summary as a comment (+ status if changed) to the chosen EMS task.
  async function pushVisitToEms(kibbutz, visit, intent) {
    if (!intent) return;
    let queued = false, errored = '';
    try {
      const r1 = await emsWriteOrQueue({ kind: 'comment', taskId: intent.taskId, message: buildVisitSummaryText(kibbutz, visit), meta: { kibbutz: kibbutz } });
      if (r1 && r1.error) errored = r1.error;
      let r2 = { sent: true };
      if (intent.status && intent.status !== intent.curStatus) r2 = await emsWriteOrQueue({ kind: 'status', taskId: intent.taskId, status: intent.status, meta: { kibbutz: kibbutz } });
      if (r2 && r2.error) errored = r2.error;
      queued = (r1 && r1.queued) || (r2 && r2.queued);
    } catch (e) { console.warn('EMS visit push failed', e); errored = e.message; }
    emsToast(errored ? ('⚠️ שגיאת EMS: ' + errored) : (queued ? '🕒 הסיכום יישלח ל-EMS בהתחברות הבאה' : '✅ הסיכום נשלח ל-EMS + הסטטוס עודכן'));
    if (!errored && isEmsConnected()) { try { await emsSyncCache(); } catch (e) {} }
  }

  // ponytail: dead post-save EMS popup removed — superseded by the in-form visit→EMS block.

  async function emsDoLogin() {
    const url   = (document.getElementById('emsUrlInput').value.trim() || 'https://api.sigmatec-ems.com').replace(/\/$/, '');
    const email = document.getElementById('emsEmailInput').value.trim();
    const pass  = document.getElementById('emsPasswordInput').value;
    const errEl = document.getElementById('emsLoginError');
    if (!email || !pass) { errEl.textContent = 'נא למלא אימייל וסיסמה'; return; }
    errEl.textContent = '⏳ מתחבר...';
    try {
      const wrapped = await emsProxyCall(url, '/v1/auth/login/password', 'POST', null, { login: email, password: pass });
      if (wrapped.error) { errEl.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
      const data = wrapped.body || {};
      // 2FA: password validated but EMS emailed a one-time code and returned a TEMPORARY token.
      // That temp token is NOT usable for tasks — we must verify-otp to get the STANDARD token.
      if (data.accessToken && data.type === '2FA') {
        window._emsTempToken = data.accessToken;
        window._emsLoginUrl = url;
        errEl.textContent = '';
        document.getElementById('emsOtpBox').style.display = '';
        const otp = document.getElementById('emsOtpInput'); otp.value = ''; setTimeout(() => otp.focus(), 50);
        return;
      }
      if (data.accessToken) {
        localStorage.setItem(EMS_URL_KEY, url);
        localStorage.setItem(EMS_TOKEN_KEY, data.accessToken);
        localStorage.setItem(EMS_TOKEN_AT_KEY, String(Date.now()));  // start the 60-min session clock
        scheduleEmsExpiry();
        _emsSites = null;
        _emsSyncedThisSession = false;
        document.getElementById('emsOtpBox').style.display = 'none';
        renderEmsPage();
        emsOnConnected(true);   // flush queued writes + refresh shared cache snapshot
      } else {
        // Diagnostic: show the real HTTP status + server message so we can tell
        // a wrong API URL (404 / HTML) from a genuine auth error (401/422).
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        // surface the per-field validation reason (422 hides it inside data.errors[])
        const fieldErrs = Array.isArray(data.errors) ? data.errors.map(er => (er.field ? er.field + ': ' : '') + (er.message || '')).filter(Boolean).join(' · ') : '';
        const bodyPeek = typeof wrapped.body === 'string' ? wrapped.body.slice(0, 120) : '';
        const detail = fieldErrs || msg || bodyPeek || 'שם משתמש או סיסמה שגויים';
        errEl.textContent = '(' + (wrapped.status || '?') + ') ' + detail + (wrapped.status === 422 ? ' — בדוק אימייל/סיסמה של EMS' : '');
      }
    } catch (e) {
      errEl.textContent = 'שגיאת חיבור: ' + e.message;
    }
  }

  // 2FA step 2 — exchange the emailed OTP (Bearer = temp token) for a usable STANDARD token.
  async function emsVerifyOtp() {
    const errEl = document.getElementById('emsLoginError');
    const code = (document.getElementById('emsOtpInput').value || '').trim();
    const temp = window._emsTempToken;
    const url  = window._emsLoginUrl || (document.getElementById('emsUrlInput').value.trim() || 'https://api.sigmatec-ems.com').replace(/\/$/, '');
    if (!temp) { errEl.textContent = 'פג תוקף שלב האימות — התחבר מחדש'; document.getElementById('emsOtpBox').style.display = 'none'; return; }
    if (!code) { errEl.textContent = 'נא להזין את הקוד מהאימייל'; return; }
    errEl.textContent = '⏳ מאמת קוד...';
    try {
      const wrapped = await emsProxyCall(url, '/v1/auth/verify-otp', 'POST', temp, { code: code });
      if (wrapped.error) { errEl.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
      const data = wrapped.body || {};
      if (data.accessToken) {
        localStorage.setItem(EMS_URL_KEY, url);
        localStorage.setItem(EMS_TOKEN_KEY, data.accessToken);   // the STANDARD token
        localStorage.setItem(EMS_TOKEN_AT_KEY, String(Date.now()));
        window._emsTempToken = null;
        scheduleEmsExpiry();
        _emsSites = null; _emsSyncedThisSession = false;
        errEl.textContent = '';
        document.getElementById('emsOtpBox').style.display = 'none';
        renderEmsPage();
        emsOnConnected(true);
      } else {
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        errEl.textContent = '(' + (wrapped.status || '?') + ') ' + (msg || 'קוד שגוי או שפג תוקפו');
      }
    } catch (e) { errEl.textContent = 'שגיאת חיבור: ' + e.message; }
  }
  // Re-send the OTP email (Bearer = temp token).
  async function emsResendOtp() {
    const errEl = document.getElementById('emsLoginError');
    const temp = window._emsTempToken;
    const url  = window._emsLoginUrl || (document.getElementById('emsUrlInput').value.trim() || 'https://api.sigmatec-ems.com').replace(/\/$/, '');
    if (!temp) { errEl.textContent = 'פג תוקף שלב האימות — התחבר מחדש'; document.getElementById('emsOtpBox').style.display = 'none'; return; }
    try {
      await emsProxyCall(url, '/v1/auth/resend-otp', 'POST', temp, {});
      emsToast('📧 קוד חדש נשלח לאימייל');
    } catch (e) { errEl.textContent = 'שגיאה בשליחת קוד: ' + e.message; }
  }

  // Sites cache
  // ---- caches + helpers ----
  let _emsSites = null, _emsUsers = null;
  async function getEmsSites() {
    if (_emsSites) return _emsSites;
    const res = await emsApi('/sites');
    _emsSites = Array.isArray(res) ? res : (res.data || []);
    return _emsSites;
  }
  // Normalize a Hebrew site/kibbutz name for matching (collapse whitespace, trim).
  function emsNormName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  // Best-effort map a kibbutz name → EMS site id. Returns '' if no confident match.
  async function emsSiteIdForKibbutz(name) {
    const target = emsNormName(name);
    if (!target) return '';
    const sites = await getEmsSites();
    // exact (normalized) match first, then containment either way ("קיבוץ X" vs "X")
    let hit = sites.find(s => emsNormName(s.name) === target);
    if (!hit) hit = sites.find(s => { const n = emsNormName(s.name); return n && (n.indexOf(target) !== -1 || target.indexOf(n) !== -1); });
    return hit ? hit.id : '';
  }
  // Admin-role users — eligible task assignees. May 403 if the token role is low → empty list.
  async function getEmsUsers() {
    if (_emsUsers) return _emsUsers;
    const res = await emsApi('/users?roles=admin&statuses=active&take=200&sortBy=firstName&sortOrder=ASC');
    _emsUsers = res.data || (Array.isArray(res) ? res : []);
    return _emsUsers;
  }
  function emsUserName(u) {
    if (!u) return '—';
    const n = ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
    return n || u.email || u.id;
  }
  function emsEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function emsToast(msg) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
  // Decode the JWT payload (id, role, type) — used to explain site-scoping.
  function emsTokenRole() {
    const tok = getEmsToken();
    if (!tok || tok.split('.').length < 2) return '';
    try { return (JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) || {}).role || ''; }
    catch (e) { return ''; }
  }
  // Populate the site filter dropdown (lets you scope to a specific site).
  async function emsPopulateSiteFilter() {
    const sel = document.getElementById('emsFilterSite');
    if (!sel || sel.dataset.loaded) return;
    try {
      const sites = await getEmsSites();
      sel.innerHTML = '<option value="">כל האתרים</option>' +
        sites.map(s => `<option value="${s.id}">${emsEsc(s.name)}</option>`).join('');
      sel.dataset.loaded = '1';
    } catch (e) { /* leave default */ }
  }

  // Tasks state (page-based pagination — the API uses page/take, not skip)
  let _emsPage = 1, _emsTasksTotal = 0, _emsSearchTimer = null;
  function debounceEmsSearch() {
    clearTimeout(_emsSearchTimer);
    _emsSearchTimer = setTimeout(() => { _emsPage = 1; loadEmsTasks(); }, 400);
  }

  async function loadEmsTasks(append = false) {
    if (!isEmsConnected()) return;
    if (!append) _emsPage = 1;
    const status   = document.getElementById('emsFilterStatus')?.value || '';
    const priority = document.getElementById('emsFilterPriority')?.value || '';
    const search   = document.getElementById('emsSearch')?.value.trim() || '';
    const myOnly   = document.getElementById('emsMyTasksOnly')?.checked;
    const overdue  = document.getElementById('emsOverdueOnly')?.checked;
    const site     = document.getElementById('emsFilterSite')?.value || '';
    // NOTE: only whitelisted params — the API uses forbidNonWhitelisted, so an
    // unknown param (e.g. sortOrder) 422s the whole call.
    const params   = new URLSearchParams({ page: _emsPage, take: 50 });
    if (status)   params.set('status', status);
    if (priority) params.set('priority', priority);
    if (search)   params.set('search', search);
    if (myOnly)   params.set('myTasksOnly', 'true');
    if (overdue)  params.set('overdueOnly', 'true');
    if (site)     params.set('siteId', site);
    const listEl = document.getElementById('emsTasksList');
    if (!append) listEl.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;">⏳ טוען משימות...</div>';
    try {
      const reqPath = '/employee-tasks?' + params.toString();
      const res   = await emsApi(reqPath);
      const tasks = res.data || (Array.isArray(res) ? res : []);
      _emsTasksTotal = (res.meta && (res.meta.total != null ? res.meta.total : res.meta.count)) != null
        ? (res.meta.total != null ? res.meta.total : res.meta.count) : tasks.length;
      if (!append) listEl.innerHTML = '';
      if (!tasks.length && !append) {
        const role = emsTokenRole() || '?';
        listEl.innerHTML =
          '<div style="padding:24px;text-align:center;color:#94a3b8;">אין משימות תואמות' +
          '<div style="margin-top:10px;font-size:11px;color:#64748b;">role: <b>' + role + '</b> · total: ' + _emsTasksTotal + '</div></div>';
      } else {
        tasks.forEach(t => listEl.insertAdjacentHTML('beforeend', renderEmsTaskCard(t)));
      }
      renderEmsLoadMore();
    } catch (e) {
      listEl.innerHTML = '<div style="padding:20px;color:#dc2626;">שגיאה בטעינה: ' + emsEsc(e.message) + '</div>';
    }
  }

  // Exact EMS enum values (lowercase, from the backend)
  const EMS_STATUS = {
    new:'🆕 חדשה', in_progress:'🔄 בטיפול', waiting_for_client:'⏳ ממתין ללקוח', on_hold:'⏸️ מוקפא',
    done:'✅ בוצע', rejected:'🚫 נדחה', not_relevant:'➖ לא רלוונטי', cancelled:'❌ בוטל'
  };
  const EMS_PRIORITY = { low:'🔵 נמוכה', normal:'🟡 רגילה', high:'🟠 גבוהה', urgent:'🔴 דחופה' };
  const EMS_TYPE     = { supplying_meters:'📦 אספקת מונים', fixing_fault:'🔧 תיקון תקלה', other:'📌 אחר' };
  const EMS_CLOSED   = ['done', 'rejected', 'not_relevant', 'cancelled'];
  function emsStatusLabel(s) { return EMS_STATUS[s] || s; }

  function renderEmsTaskCard(t) {
    const site     = t.site && t.site.name ? t.site.name : '—';
    const assignee = emsUserName(t.assignee);
    const due      = t.expectedCompletionDate ? new Date(t.expectedCompletionDate).toLocaleDateString('he-IL') : '';
    const overdue  = due && EMS_CLOSED.indexOf(t.status) === -1 && new Date(t.expectedCompletionDate) < new Date();
    return `
    <div class="ems-task-card priority-${t.priority} status-${t.status}" onclick="openEmsTask('${t.id}')" style="cursor:pointer;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <div style="font-weight:700;font-size:14px;color:var(--primary);flex:1;">${emsEsc(t.title)}</div>
        <div style="white-space:nowrap;">
          <span class="ems-badge status-${t.status}">${emsStatusLabel(t.status)}</span>
          <span class="ems-badge priority-${t.priority}">${EMS_PRIORITY[t.priority] || t.priority}</span>
        </div>
      </div>
      <div style="display:flex;gap:14px;font-size:12px;color:#64748b;flex-wrap:wrap;">
        <span>🏢 ${emsEsc(site)}</span>
        <span>${EMS_TYPE[t.type] || t.type}</span>
        <span>👤 ${emsEsc(assignee)}</span>
        ${due ? `<span style="color:${overdue ? '#dc2626' : 'inherit'}">${overdue ? '⚠️ פגר — ' : '📅 '}${due}</span>` : ''}
      </div>
    </div>`;
  }

  function renderEmsLoadMore() {
    const wrap = document.getElementById('emsLoadMoreWrap');
    if (!wrap) return;
    if (_emsPage * 50 < _emsTasksTotal) {
      wrap.innerHTML = `<button class="btn btn-secondary" onclick="_emsPage++; loadEmsTasks(true)">טען עוד</button>`;
    } else {
      wrap.innerHTML = _emsTasksTotal > 0
        ? `<div style="font-size:12px;color:#94a3b8;margin-top:8px;">סה"כ ${_emsTasksTotal} משימות</div>` : '';
    }
  }

  let _emsEditingId = null;
  function closeEmsModal() { document.getElementById('emsTaskModal').classList.remove('open'); }

  // Populate the site + assignee dropdowns (assignee may be empty if /users 403s)
  async function emsFillSiteAndAssignee(siteId, assigneeId) {
    const siteSel = document.getElementById('emsTaskSite');
    const asgSel  = document.getElementById('emsTaskAssignee');
    siteSel.innerHTML = '<option value="">⏳ טוען...</option>';
    asgSel.innerHTML  = '<option value="">⏳ טוען...</option>';
    const [sites, users] = await Promise.all([
      getEmsSites().catch(() => []),
      getEmsUsers().catch(() => [])
    ]);
    siteSel.innerHTML = '<option value="">-- בחר אתר --</option>' +
      sites.map(s => `<option value="${s.id}" ${s.id === siteId ? 'selected' : ''}>${emsEsc(s.name)}</option>`).join('');
    asgSel.innerHTML = '<option value="">-- ללא --</option>' +
      users.map(u => `<option value="${u.id}" ${u.id === assigneeId ? 'selected' : ''}>${emsEsc(emsUserName(u))}</option>`).join('');
  }

  async function emsCreateTaskModal(prefilledSiteId) {
    if (!isEmsConnected()) { alert('נא להתחבר ל-EMS תחילה'); return; }
    _emsEditingId = null;
    document.getElementById('emsTaskModalTitle').textContent = '📋 משימה חדשה ב-EMS';
    document.getElementById('emsTaskSaveBtn').textContent    = '💾 צור משימה';
    document.getElementById('emsTaskTitle').value    = '';
    document.getElementById('emsTaskDesc').value     = '';
    document.getElementById('emsTaskType').value     = 'supplying_meters';
    document.getElementById('emsTaskPriority').value = 'normal';
    document.getElementById('emsTaskDueDate').value  = '';
    document.getElementById('emsTaskStatusWrap').style.display = 'none';
    document.getElementById('emsTaskModal').classList.add('open');
    await emsFillSiteAndAssignee(prefilledSiteId || '', '');
  }

  // Open the EMS create-task modal from a kibbutz card, pre-selecting the matching site.
  // Update-tab EMS section (below status): show the open EMS task(s) to act on, or a
  // "create new" button. Both lead to the EMS login when not connected.
  function prepModalEmsSection(name) {
    const box = document.getElementById('modalEmsSection');
    if (!box) return;
    if (!(typeof canUseEms === 'function' && canUseEms())) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    const ids = (typeof kibbutzSiteIds === 'function') ? kibbutzSiteIds(name) : [];
    const tasks = ids.length ? emsCacheTasksForKibbutz(name) : [];
    // Full-width button when there's NO open task; small side bubble when a task exists.
    const newBtnFull = '<button type="button" onclick="createEmsTaskForKibbutz()" style="width:100%;margin-top:6px;background:#eff6ff;color:#1d4ed8;border:1px dashed #93c5fd;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;">➕ פתח משימה חדשה ב-EMS</button>';
    const newBubble = '<button type="button" onclick="createEmsTaskForKibbutz()" style="background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd;border-radius:14px;padding:4px 11px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap;">➕ משימה חדשה</button>';
    if (tasks.length) {
      let h = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">' +
              '<div style="font-size:13px;font-weight:800;color:#1e3a8a;">📋 משימת EMS פתוחה — לחץ לעדכון/תגובה:</div>' + newBubble + '</div>';
      tasks.forEach(t => { h += '<div class="card-ems-task status-' + t.status + '" onclick="emsModalTaskClick(\'' + t.id + '\')" style="cursor:pointer;margin:4px 0;"><span class="t-dot" style="background:' + (EMS_PRIORITY_DOT[t.priority] || '#94a3b8') + '"></span><span class="t-title">' + emsEsc(t.title) + '</span><span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span></div>'; });
      box.innerHTML = h;
    } else {
      box.innerHTML = newBtnFull;
    }
  }
  function emsModalTaskClick(id) {
    if (!isEmsConnected()) { closeModal({ target: { id: 'modalBackdrop' } }); showPage('ems'); emsToast('🔌 התחבר ל-EMS לעדכון המשימה'); return; }
    openEmsTask(id);   // full live detail + comments + status change
  }

  async function createEmsTaskForKibbutz() {
    const name = currentKibbutz;
    if (!isEmsConnected()) {   // not connected → send to the EMS login panel
      closeModal({ target: { id: 'modalBackdrop' } });
      showPage('ems');
      emsToast('🔌 התחבר ל-EMS כדי לפתוח משימה');
      return;
    }
    // ponytail: do NOT close the kibbutz modal — the EMS task modal (z-index 1160) stacks
    // on top of it (1000), so any unsaved card edits survive while creating the EMS task.
    let siteId = '';
    try { siteId = await emsSiteIdForKibbutz(name); } catch (e) { /* fall back to manual pick */ }
    await emsCreateTaskModal(siteId);
    if (!siteId) emsToast('⚠️ לא נמצא אתר EMS תואם ל"' + name + '" — בחר אתר ידנית');
  }

  async function emsEditTask(id) {
    const t = window._emsCurrentTask;
    if (!t || t.id !== id) return;
    document.getElementById('emsDetailModal').classList.remove('open');
    _emsEditingId = id;
    document.getElementById('emsTaskModalTitle').textContent = '✏️ עריכת משימה';
    document.getElementById('emsTaskSaveBtn').textContent    = '💾 שמור שינויים';
    document.getElementById('emsTaskTitle').value    = t.title || '';
    document.getElementById('emsTaskDesc').value     = t.description || '';
    document.getElementById('emsTaskType').value     = t.type || 'other';
    document.getElementById('emsTaskPriority').value = t.priority || 'normal';
    document.getElementById('emsTaskStatusWrap').style.display = '';
    document.getElementById('emsTaskStatus').value   = t.status || 'new';
    document.getElementById('emsTaskDueDate').value  = t.expectedCompletionDate ? new Date(t.expectedCompletionDate).toISOString().slice(0, 10) : '';
    document.getElementById('emsTaskModal').classList.add('open');
    await emsFillSiteAndAssignee(t.siteId || (t.site && t.site.id) || '', t.assigneeUserId || (t.assignee && t.assignee.id) || '');
  }

  // After any EMS write (create / edit / status change): re-pull the shared cache so the
  // kibbutz cards (which read the cache, not EMS live) reflect the change immediately.
  async function emsAfterWrite() {
    try { await emsSyncCache(); } catch (e) { console.warn('emsAfterWrite sync failed', e); }
    if (typeof applyCardEmsWidgets === 'function') applyCardEmsWidgets();
    if (typeof reorderCards === 'function') reorderCards();
    // If the kibbutz modal is still open (task created from a card), refresh its EMS section.
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop && backdrop.classList.contains('open') && currentKibbutz && typeof prepModalEmsSection === 'function') {
      prepModalEmsSection(currentKibbutz);
    }
  }

  async function saveEmsTask(btn) {
    const title  = document.getElementById('emsTaskTitle').value.trim();
    const siteId = document.getElementById('emsTaskSite').value;
    if (!title)  { alert('נא להזין כותרת'); return; }
    if (!siteId) { alert('נא לבחור אתר'); return; }
    setBtnLoading(btn, true);
    try {
      const body = {
        title,
        type:     document.getElementById('emsTaskType').value,
        priority: document.getElementById('emsTaskPriority').value,
        siteId
      };
      const desc     = document.getElementById('emsTaskDesc').value.trim();
      const due      = document.getElementById('emsTaskDueDate').value;
      const assignee = document.getElementById('emsTaskAssignee').value;
      if (desc)     body.description = desc;
      if (assignee) body.assigneeUserId = assignee;
      if (due)      body.expectedCompletionDate = new Date(due + 'T12:00:00').toISOString();
      let res;
      if (_emsEditingId) {
        body.status = document.getElementById('emsTaskStatus').value;
        res = await emsApi('/employee-tasks/' + _emsEditingId, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        res = await emsApi('/employee-tasks', { method: 'POST', body: JSON.stringify(body) });
      }
      if (res && res.id) {
        closeEmsModal();
        emsToast(_emsEditingId ? '✅ המשימה עודכנה' : '✅ המשימה נוצרה ב-EMS');
        if (document.getElementById('ems-view').style.display !== 'none') loadEmsTasks();
        emsAfterWrite();   // show the new/updated task on the kibbutz card immediately
      } else {
        alert('שגיאה: ' + (Array.isArray(res.message) ? res.message.join(', ') : (res.message || JSON.stringify(res))));
      }
    } catch (e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ---- Task detail (status change + comments + calendar) ----
  async function openEmsTask(id) {
    const modal = document.getElementById('emsDetailModal');
    document.getElementById('emsDetailContent').innerHTML = '⏳ טוען...';
    modal.classList.add('open');
    try {
      const t = await emsApi('/employee-tasks/' + id);
      renderEmsDetail(t);
      loadEmsComments(id);
    } catch (e) {
      document.getElementById('emsDetailContent').innerHTML = '<div style="color:#dc2626;padding:10px;">שגיאה: ' + e.message + '</div>';
    }
  }

  function emsCalendarLink(t) {
    const start = new Date(t.expectedCompletionDate);
    const end   = new Date(start.getTime() + 30 * 60000);
    const fmt   = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent('EMS: ' + (t.title || ''))
      + '&dates=' + fmt(start) + '/' + fmt(end)
      + '&details=' + encodeURIComponent('משימת EMS' + (t.site && t.site.name ? ' · ' + t.site.name : '') + ' · ' + (t.id || ''));
  }

  // Linked entities on an EMS task (e.g. meters). API may use camelCase or snake_case; ids may be a JSON string.
  function emsLinkIds(t){ var x = t && (t.linkedEntityIds || t.linked_entity_ids); if(!x) return []; if(typeof x==='string'){ try{ x=JSON.parse(x); }catch(e){ x=x.replace(/[\[\]"]/g,'').split(',').map(function(s){return s.trim();}).filter(Boolean); } } return Array.isArray(x)?x:[]; }
  function emsLinkLabel(type){ var m={meter:'מונים', site:'אתרים', consumer:'צרכנים', device:'מכשירים'}; return m[type] || type || 'ישויות'; }
  // Resolve linked meters → number + a link to the EMS admin meter page. Cached. Needs a live EMS token (we have it after login).
  var _emsMeterCache = {};
  async function emsFetchMeter(id){
    if (_emsMeterCache[id] !== undefined) return _emsMeterCache[id];
    try {
      var res = await emsApi('/meters/' + id);
      // endpoint may return a single object OR a {data:[...]} list — handle both
      var m = (res && Array.isArray(res.data)) ? (res.data.find(function(x){return x.id===id;}) || res.data[0]) : res;
      _emsMeterCache[id] = m || null;
    } catch(e){ _emsMeterCache[id] = null; }
    return _emsMeterCache[id];
  }
  // Best-effort meter label across possible field names (confirm against a real /v1/meters/:id payload).
  function emsMeterNumber(m, id){
    if (!m) return id.slice(0,8) + '…';
    return m.serialNumber || m.number || m.meterNumber || m.serial || m.code || (id.slice(0,8) + '…');
  }
  function emsMeterIcon(m){ var t = m && m.energyType && m.energyType.type; return t==='water' ? '💧' : (t==='gas' ? '🔥' : '⚡'); }
  // After the detail renders: replace the "🔗 N מונים" box with real meter numbers + links.
  async function emsEnrichMeters(t){
    var box = document.getElementById('emsLinkedBox'); if (!box) return;
    var type = t.linkType || t.link_type;
    var ids = emsLinkIds(t);
    if (!ids.length || type !== 'meter' || typeof isEmsConnected !== 'function' || !isEmsConnected()) return;
    var base = 'https://sigmatec-ems.com/admin/meters/';
    var chips = await Promise.all(ids.map(async function(id){
      var m = await emsFetchMeter(id);
      var num = emsMeterNumber(m, id);
      var addr = (m && m.address) ? ' · ' + m.address : '';
      return '<a href="' + base + id + '" target="_blank" rel="noopener" style="display:inline-block;background:#dbeafe;border:1px solid #93c5fd;border-radius:6px;padding:3px 9px;margin:2px;font-size:12px;text-decoration:none;color:#1e40af;">' + emsMeterIcon(m) + ' ' + emsEsc(String(num)) + emsEsc(addr) + ' ↗</a>';
    }));
    box.innerHTML = '<div style="font-size:12px;color:#1e40af;margin-bottom:4px;">🔗 מונים מקושרים (' + ids.length + '):</div>' + chips.join('');
  }

  function renderEmsDetail(t) {
    window._emsCurrentTask = t;
    const site = t.site && t.site.name ? t.site.name : '—';
    const due  = t.expectedCompletionDate ? new Date(t.expectedCompletionDate).toLocaleDateString('he-IL') : '—';
    const statusOpts = Object.keys(EMS_STATUS).map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${EMS_STATUS[s]}</option>`).join('');
    const cal = t.expectedCompletionDate
      ? `<a href="${emsCalendarLink(t)}" target="_blank" rel="noopener" class="btn btn-secondary" style="padding:6px 12px;font-size:12px;text-decoration:none;">📅 הוסף ליומן</a>` : '';
    document.getElementById('emsDetailContent').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <h3 style="margin:0;flex:1;color:var(--primary);">${emsEsc(t.title)}</h3>
        <button onclick="document.getElementById('emsDetailModal').classList.remove('open')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">✕</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
        <span class="ems-badge priority-${t.priority}">${EMS_PRIORITY[t.priority] || t.priority}</span>
        <span class="ems-badge">${EMS_TYPE[t.type] || t.type}</span>
      </div>
      ${t.description ? `<div style="font-size:13px;color:#334155;background:#f8fafc;padding:8px 10px;border-radius:6px;margin:8px 0;white-space:pre-wrap;">${emsEsc(t.description)}</div>` : ''}
      <div style="font-size:13px;color:#475569;line-height:1.9;">🏢 אתר: ${emsEsc(site)}<br>👤 אחראי: ${emsEsc(emsUserName(t.assignee))}<br>📅 יעד: ${due}</div>
      ${(function(){var ids=emsLinkIds(t);return ids.length?'<div id="emsLinkedBox" style="font-size:13px;color:#1e40af;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 10px;margin:8px 0;">🔗 '+ids.length+' '+emsLinkLabel(t.linkType||t.link_type)+' משויכים למשימה…</div>':'';})()}
      <div style="display:flex;gap:8px;align-items:center;margin:12px 0;flex-wrap:wrap;">
        <label style="margin:0;font-size:13px;font-weight:600;">סטטוס:</label>
        <select id="emsDetailStatus" onchange="changeEmsStatus('${t.id}', this.value)" style="flex:1;min-width:120px;">${statusOpts}</select>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="emsEditTask('${t.id}')">✏️ ערוך</button>
        ${cal}
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:10px 0;">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;">💬 תגובות</div>
      <div id="emsComments" style="max-height:30vh;overflow-y:auto;margin-bottom:8px;">⏳ טוען...</div>
      <div style="display:flex;gap:6px;">
        <input type="text" id="emsCommentInput" placeholder="כתוב תגובה..." style="flex:1;" onkeydown="if(event.key==='Enter')addEmsComment('${t.id}')">
        <button class="btn btn-primary" style="padding:8px 14px;" onclick="addEmsComment('${t.id}')">שלח</button>
      </div>`;
    try { emsEnrichMeters(t); } catch (e) {}
  }

  async function changeEmsStatus(id, status) {
    try {
      await emsApi('/employee-tasks/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
      emsToast('✅ הסטטוס עודכן');
      if (window._emsCurrentTask && window._emsCurrentTask.id === id) window._emsCurrentTask.status = status;
      if (document.getElementById('ems-view').style.display !== 'none') loadEmsTasks();
      emsAfterWrite();   // reflect the new status on the kibbutz card (was the "can't update" bug)
    } catch (e) { alert('שגיאה: ' + e.message); }
  }

  async function loadEmsComments(id) {
    const el = document.getElementById('emsComments');
    if (!el) return;
    try {
      const res  = await emsApi('/employee-tasks/' + id + '/comments');
      const list = Array.isArray(res) ? res : (res.data || []);
      if (!list.length) { el.innerHTML = '<div style="font-size:12px;color:#94a3b8;font-style:italic;">אין תגובות עדיין</div>'; return; }
      el.innerHTML = list.map(c => {
        const when = c.createdAt ? new Date(c.createdAt).toLocaleString('he-IL') : '';
        return `<div style="background:#f1f5f9;border-radius:8px;padding:6px 10px;margin:4px 0;font-size:13px;"><div style="font-weight:600;color:#1e40af;font-size:11px;margin-bottom:2px;">${emsEsc(emsUserName(c.author))} · ${when}</div>${emsEsc(c.message)}</div>`;
      }).join('');
      el.scrollTop = el.scrollHeight;
    } catch (e) {
      el.innerHTML = '<div style="color:#dc2626;font-size:12px;">שגיאה בטעינת תגובות</div>';
    }
  }

  async function addEmsComment(id) {
    const input = document.getElementById('emsCommentInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    try {
      await emsApi('/employee-tasks/' + id + '/comments', { method: 'POST', body: JSON.stringify({ message: msg }) });
      loadEmsComments(id);
    } catch (e) { alert('שגיאה: ' + e.message); input.value = msg; }
  }

  function renderEmsPage() {
    const connected = isEmsConnected();
    document.getElementById('emsLoginPanel').style.display     = connected ? 'none' : '';
    document.getElementById('emsConnectedPanel').style.display = connected ? '' : 'none';
    if (!connected) {
      const urlEl = document.getElementById('emsUrlInput');
      if (urlEl && !urlEl.value) urlEl.value = getEmsUrl();
      return;
    }
    scheduleEmsExpiry();   // arm the 60-min auto-logout for a returning session
    emsPopulateSiteFilter();
    loadEmsTasks();
    emsOnConnected();      // once per session: flush queue + refresh shared cache
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // EMS LOGIN GATE — real sign-in with EMS credentials (flag: ?login=1).
  // Default OFF (the name+PIN entry still works → zero lockout risk). Test via
  // ?login=1; once verified for everyone, make it the default. Identity is resolved
  // from the EMS profile (typed email → matching EMS user's firstName → app person),
  // so all per-person features (attendance, "my tasks", admin powers) work as before.
  // Reuses the proven EMS auth (emsProxyCall + the 2FA/verify-otp flow) — the existing
  // EMS-tab login is left untouched.
  // ═══════════════════════════════════════════════════════════════════════════
  (function setupEmsLoginGate() {
    if (typeof LOGIN_FLAG === 'undefined' || !LOGIN_FLAG) return;
    const gate = document.getElementById('emsLoginGate');
    const show = () => { if (gate) gate.style.display = 'flex'; };
    const hide = () => { if (gate) gate.style.display = 'none'; };
    if (typeof isAuthed === 'function' ? !isAuthed() : true) show();
    else if (typeof getEmsToken === 'function' && getEmsToken()) sbBridge().then(function () { if (typeof refreshData === 'function') refreshData(); });   // returning session → refresh the DB pass

    // EMS→Supabase bridge: trade the EMS token for a short-lived Supabase pass (role=authenticated).
    async function sbBridge() {
      try {
        var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
        if (!tok) return false;
        var r = await fetch(SB_URL + '/functions/v1/ems-auth', {
          method: 'POST',
          headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
          body: JSON.stringify({ emsToken: tok })
        });
        if (r.ok) {
          var d = await r.json();
          if (d && d.token) {
            window._sbToken = d.token; window._sbTokenExp = Date.now() + 55 * 60 * 1000;
            // self-verify: the pass must actually pass RLS, else drop it → stay on anon (safe during staging)
            try {
              var t = await fetch(SB_URL + '/rest/v1/tasks?select=name&limit=1', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + window._sbToken } });
              if (!t.ok) { console.warn('[bridge] pass rejected (' + t.status + ') — staying on anon'); window._sbToken = null; window._sbTokenExp = 0; }
              else {
                console.log('%c🔒 Supabase pass active (authenticated)', 'color:#15803d;font-weight:700');
                // proactive re-mint before expiry → writes never silently fail post-lockdown (while the EMS session lives)
                try { clearTimeout(window._sbRefreshTimer); } catch (e) {}
                window._sbRefreshTimer = setTimeout(function () { if (window._sbBridge) window._sbBridge(); }, 50 * 60 * 1000);
              }
            } catch (e) { window._sbToken = null; window._sbTokenExp = 0; }
            return !!window._sbToken;
          }
        } else console.warn('[bridge] ems-auth ' + r.status);
      } catch (e) { console.warn('[bridge] failed', e); }
      return false;
    }
    window._sbBridge = sbBridge;

    async function resolveIdentity(email) {
      try {
        const users = await getEmsUsers();
        const me = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
        if (me) return (me.firstName || '').trim();
      } catch (e) { console.warn('[gate] EMS user lookup failed (need admin role?)', e); }
      return '';
    }
    async function onAuthed(email) {
      const person = await resolveIdentity(email);
      const name = person || email;            // fall back to email if no profile match
      localStorage.setItem(USER_KEY, name);
      localStorage.setItem(ROLE_KEY, name === 'עידן' ? 'idan' : 'team');
      localStorage.setItem(AUTH_KEY, 'ok');
      if (typeof updateUserBadge === 'function') updateUserBadge();
      hide();
      try { await sbBridge(); } catch (e) {}   // get the Supabase pass before loading data
      try { if (typeof emsOnConnected === 'function') emsOnConnected(true); } catch (e) {}
      try { if (typeof refreshData === 'function') refreshData(); } catch (e) {}
      try { if (typeof staffCheckMessages === 'function') { window._msgsChecked = false; staffCheckMessages(); } } catch (e) {}
      if (!person) console.warn('[gate] signed in but no EMS profile matched email "' + email + '" — using email as display name');
    }
    function storeToken(url, token) {
      localStorage.setItem(EMS_URL_KEY, url);
      localStorage.setItem(EMS_TOKEN_KEY, token);
      localStorage.setItem(EMS_TOKEN_AT_KEY, String(Date.now()));
      if (typeof scheduleEmsExpiry === 'function') scheduleEmsExpiry();
    }

    window.gateLogin = async function () {
      const url = (typeof getEmsUrl === 'function') ? getEmsUrl() : 'https://api.sigmatec-ems.com';
      const email = (document.getElementById('gateEmail').value || '').trim();
      const pass = document.getElementById('gatePass').value;
      const err = document.getElementById('gateError');
      if (!email || !pass) { err.textContent = 'נא למלא אימייל וסיסמה'; return; }
      err.innerHTML = '<span class="gate-spin"></span> מתחבר...';
      try {
        const wrapped = await emsProxyCall(url, '/v1/auth/login/password', 'POST', null, { login: email, password: pass });
        if (wrapped.error) { err.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
        const data = wrapped.body || {};
        if (data.accessToken && data.type === '2FA') {           // 2FA → emailed OTP
          window._gateTemp = data.accessToken; window._gateEmail = email;
          err.textContent = '';
          document.getElementById('gateOtpBox').style.display = '';
          const o = document.getElementById('gateOtp'); o.value = ''; setTimeout(() => o.focus(), 50);
          return;
        }
        if (data.accessToken) { storeToken(url, data.accessToken); err.textContent = ''; await onAuthed(email); }
        else if (wrapped.status >= 500) { err.textContent = '⏳ המערכת בעליית גרסה — נא לנסות שוב בעוד מספר דקות'; }
        else {
          const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
          err.textContent = '(' + (wrapped.status || '?') + ') ' + (msg || 'אימייל או סיסמה שגויים');
        }
      } catch (e) { err.textContent = 'שגיאת חיבור: ' + e.message; }
    };
    window.gateVerifyOtp = async function () {
      const url = (typeof getEmsUrl === 'function') ? getEmsUrl() : 'https://api.sigmatec-ems.com';
      const err = document.getElementById('gateError');
      const code = (document.getElementById('gateOtp').value || '').trim();
      const temp = window._gateTemp;
      if (!temp) { err.textContent = 'פג תוקף שלב האימות — התחבר מחדש'; document.getElementById('gateOtpBox').style.display = 'none'; return; }
      if (!code) { err.textContent = 'נא להזין את הקוד מהאימייל'; return; }
      err.innerHTML = '<span class="gate-spin"></span> מאמת קוד...';
      try {
        const wrapped = await emsProxyCall(url, '/v1/auth/verify-otp', 'POST', temp, { code: code });
        if (wrapped.error) { err.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
        const data = wrapped.body || {};
        if (data.accessToken) {
          storeToken(url, data.accessToken); window._gateTemp = null; err.textContent = '';
          document.getElementById('gateOtpBox').style.display = 'none';
          await onAuthed(window._gateEmail || (document.getElementById('gateEmail').value || '').trim());
        } else if (wrapped.status >= 500) { err.textContent = '⏳ המערכת בעליית גרסה — נא לנסות שוב בעוד מספר דקות'; }
        else {
          const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
          err.textContent = '(' + (wrapped.status || '?') + ') ' + (msg || 'קוד שגוי או שפג תוקפו');
        }
      } catch (e) { err.textContent = 'שגיאת חיבור: ' + e.message; }
    };
    window.gateResendOtp = async function () {
      const url = (typeof getEmsUrl === 'function') ? getEmsUrl() : 'https://api.sigmatec-ems.com';
      const err = document.getElementById('gateError'); const temp = window._gateTemp;
      if (!temp) { err.textContent = 'פג תוקף שלב האימות — התחבר מחדש'; return; }
      try { await emsProxyCall(url, '/v1/auth/resend-otp', 'POST', temp, {}); if (typeof emsToast === 'function') emsToast('📧 קוד חדש נשלח לאימייל'); }
      catch (e) { err.textContent = 'שגיאה בשליחת קוד: ' + e.message; }
    };
    window.gateLogout = function () {
      try { localStorage.removeItem(EMS_TOKEN_KEY); localStorage.removeItem(EMS_TOKEN_AT_KEY); } catch (e) {}
      localStorage.removeItem(USER_KEY); localStorage.removeItem(AUTH_KEY); localStorage.removeItem(ROLE_KEY);
      location.reload();
    };
  })();
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
  // ===========================================================
  // STAFF MANAGEMENT — עידן + עמיחי only (gated by canManageStaff()).
  // Per-employee: task load + breakdown, system-usage by actions, upcoming vacations,
  // progress, and leave-a-message (shown to the employee on their next login).
  // Analytics come from the loaded snapshot (window.SHEET_DATA); messages use a small
  // Supabase `messages` table via REST. No EMS dependency.
  // ===========================================================
  const STAFF_PEOPLE = ['עידן', 'אביאם', 'ניתאי', 'מתניה'];   // עמיחי (CEO) excluded — not a managed employee

  function canManageStaff() {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    return (typeof isIdan === 'function' && isIdan()) || me === 'עמיחי';
  }

  function _staffHeaders(json) {
    const tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : SB_ANON;
    const h = { apikey: SB_ANON, Authorization: 'Bearer ' + tok };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  async function staffSendMessage(toPerson, text) {
    const from = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    const r = await fetch(SB_URL + '/rest/v1/messages', {
      method: 'POST', headers: Object.assign(_staffHeaders(true), { Prefer: 'return=minimal' }),
      body: JSON.stringify({ to_person: toPerson, from_person: from, text: text })
    });
    if (!r.ok) throw new Error('שמירה נכשלה (' + r.status + ')');
  }
  async function staffFetchMessages(toPerson, unreadOnly) {
    let q = 'messages?select=*&to_person=eq.' + encodeURIComponent(toPerson) + '&order=created_at.desc';
    if (unreadOnly) q += '&read_at=is.null';
    const r = await fetch(SB_URL + '/rest/v1/' + q, { headers: _staffHeaders(false) });
    if (!r.ok) return [];
    return r.json();
  }
  async function staffMarkRead(ids) {
    if (!ids || !ids.length) return;
    try {
      await fetch(SB_URL + '/rest/v1/messages?id=in.(' + ids.join(',') + ')', {
        method: 'PATCH', headers: Object.assign(_staffHeaders(true), { Prefer: 'return=minimal' }),
        body: JSON.stringify({ read_at: new Date().toISOString() })
      });
    } catch (e) { /* best effort */ }
  }

  function staffStats(person) {
    const data = window.SHEET_DATA || {};
    const myTasks = (data.tasks || []).filter(t => (t.owners || []).indexOf(person) !== -1);
    const cats = { priority: 0, done: 0, pending: 0, new_client: 0 };
    myTasks.forEach(t => {
      const c = (typeof parseTaskField === 'function') ? (parseTaskField(t.task).cat || 'pending') : 'pending';
      cats[c] = (cats[c] || 0) + 1;
    });
    const visits = (data.visits || []).filter(v => v.visitor === person);
    const attendance = (data.attendance || []).filter(a => a.person === person);
    const edits = (data.tasks || []).filter(t => t.editor === person).length;
    const since30 = Date.now() - 30 * 86400000;
    const recentVisits = visits.filter(v => v.date && new Date(v.date).getTime() >= since30).length;
    const today0 = new Date(new Date().toDateString()).getTime();
    const upcomingVac = attendance
      .filter(a => (a.dayType === 'vacation' || a.dayType === 'reserve') && a.date && new Date(a.date).getTime() >= today0)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const total = myTasks.length;
    const progress = total ? Math.round((cats.done / total) * 100) : 0;
    return { total, cats, visits: visits.length, recentVisits, attendance: attendance.length, edits, upcomingVac, progress };
  }

  function _staffEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  const STAFF_ROLES = {
    'עידן':  { kind: 'ops',   title: 'מנהל מוצר ותפעול' },
    'אביאם': { kind: 'field', title: 'ראש צוות שטח' },
    'ניתאי': { kind: 'field', title: 'טכנאי שטח' },
    'מתניה': { kind: 'dev',   title: 'מפתח (משרד)' }
  };
  // company-wide go-live pipeline — counts from the rendered card grids (the real categorization)
  function staffPipeline() {
    const g = id => { const el = document.getElementById(id); return el ? el.querySelectorAll('.kibbutz').length : 0; };
    const live = g('grid-done'), priority = g('grid-priority'), pending = g('grid-pending'), nw = g('grid-new_client');
    const total = live + priority + pending + nw;
    return { live, priority, pending, new_client: nw, total, pctLive: total ? Math.round(live / total * 100) : 0 };
  }

  async function renderStaff() {
    const el = document.getElementById('staffContent');
    if (!el) return;
    if (!canManageStaff()) { el.innerHTML = '<div style="color:#991b1b;">אין הרשאה לעמוד זה.</div>'; return; }
    const CATL = { priority: '🔴 עדיפות', done: '✅ באוויר', pending: '⬜ ממתין', new_client: '🆕 חדש' };

    // unread message counts per person (best effort; empty if the table isn't created yet)
    const unreadByPerson = {};
    try {
      const r = await fetch(SB_URL + '/rest/v1/messages?select=to_person,read_at', { headers: _staffHeaders(false) });
      if (r.ok) (await r.json()).forEach(m => { if (!m.read_at) unreadByPerson[m.to_person] = (unreadByPerson[m.to_person] || 0) + 1; });
    } catch (e) { /* table may not exist yet */ }

    const pipe = staffPipeline();

    el.innerHTML = STAFF_PEOPLE.map(p => {
      const role = STAFF_ROLES[p] || { kind: 'field', title: '' };
      const s = staffStats(p);
      const e = _staffEsc(p);
      const ub = unreadByPerson[p] || 0;
      const vac = s.upcomingVac.length
        ? s.upcomingVac.slice(0, 3).map(v => (v.dayType === 'reserve' ? '🪖' : '🌴') + ' ' + new Date(v.date).toLocaleDateString('he-IL')).join(' · ')
        : '<span style="color:#94a3b8;">אין</span>';

      let body = '';
      if (role.kind === 'ops') {
        body = `
        <div style="font-size:12px;color:#64748b;margin:4px 0 6px;">צנרת העלאה לאוויר — כל החברה</div>
        <div style="background:#e2e8f0;border-radius:6px;height:10px;overflow:hidden;"><div style="background:#10b981;height:100%;width:${pipe.pctLive}%;"></div></div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">${pipe.live}/${pipe.total} עלו לאוויר (${pipe.pctLive}%)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-top:12px;font-size:13px;">
          <div>✅ באוויר: <strong>${pipe.live}</strong></div>
          <div>🔴 בעדיפות: <strong>${pipe.priority}</strong></div>
          <div>⬜ ממתינים: <strong>${pipe.pending}</strong></div>
          <div>🆕 חדשים: <strong>${pipe.new_client}</strong></div>
          <div>📝 עדכוני סטטוס שלי: <strong>${s.edits}</strong></div>
        </div>`;
      } else if (role.kind === 'field') {
        body = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:8px;font-size:13px;">
          <div>🚗 ביקורים: <strong>${s.visits}</strong> <span style="color:#94a3b8;">(${s.recentVisits} ב-30 יום)</span></div>
          <div>📋 קיבוצים באחריותי: <strong>${s.total}</strong></div>
          <div>📅 רישומי נוכחות: <strong>${s.attendance}</strong></div>
        </div>
        <div style="margin-top:10px;font-size:13px;">פירוט עומס: ${Object.keys(CATL).map(c => `${CATL[c]} <strong>${s.cats[c] || 0}</strong>`).join(' · ')}</div>
        <div style="margin-top:8px;font-size:13px;">חופשות/מילואים קרובים: ${vac}</div>${p === 'אביאם' ? '\n        <div style="margin-top:6px;font-size:12px;color:#64748b;">👥 מנהל את ניתאי</div>' : ''}`;
      } else {
        body = `
        <div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.8;">
          🧑‍💻 עומס משימות פיתוח — <span style="color:#94a3b8;">תצוגה בהמשך (ממתין למקור משימות הפיתוח)</span><br>
          🧾 תמיכה בעידן בסגירת חשבונות לקוחות בסוף חודש.
        </div>`;
      }

      return `<div class="card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <h3 style="margin:0;">👤 ${e} ${ub ? `<span class="badge priority">${ub} שלא נקראו</span>` : ''}</h3>
          <div style="font-size:12px;color:#64748b;">${_staffEsc(role.title)}</div>
        </div>
        ${body}
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">
          <input id="msgTo_${e}" placeholder="השאר הודעה ל${e} (תוצג בכניסה הבאה שלו)" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit;font-size:13px;">
          <button class="inv-btn small" onclick="staffSendMessageUI('${e}')">✉️ שלח</button>
        </div>
      </div>`;
    }).join('');
  }

  async function staffSendMessageUI(person) {
    const inp = document.getElementById('msgTo_' + person);
    if (!inp) return;
    const text = (inp.value || '').trim();
    if (!text) { alert('נא לכתוב הודעה'); return; }
    try {
      await staffSendMessage(person, text);
      inp.value = '';
      if (typeof emsToast === 'function') emsToast('✉️ ההודעה נשלחה ל' + person); else alert('ההודעה נשלחה');
      renderStaff();
    } catch (e) {
      alert('שגיאה בשליחה: ' + e.message + '\n(ייתכן שטבלת ההודעות עדיין לא נוצרה ב-Supabase)');
    }
  }

  // Login-time popup: show the current user their unread messages, once per session.
  async function staffCheckMessages() {
    if (window._msgsChecked || window._msgsChecking) return;
    window._msgsChecking = true;
    try {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    if (!me) return;
    let msgs;
    try { msgs = await staffFetchMessages(me, true); } catch (e) { return; }
    if (!msgs || !msgs.length) return;
    window._msgsChecked = true;
    var _ex = document.getElementById('msgPopup'); if (_ex) _ex.remove();
    const ids = msgs.map(m => m.id);
    const ov = document.createElement('div');
    ov.id = 'msgPopup';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:440px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="margin:0 0 12px;color:#1e40af;">✉️ יש לך ${msgs.length} הודעות חדשות</h3>
      <div style="max-height:50vh;overflow:auto;">${msgs.map(m => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:14px;white-space:pre-wrap;">${_staffEsc(m.text)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">מאת ${_staffEsc(m.from_person || '?')} · ${new Date(m.created_at).toLocaleString('he-IL')}</div>
      </div>`).join('')}</div>
      <button class="inv-btn" style="margin-top:8px;width:100%;" onclick="document.getElementById('msgPopup').remove();staffMarkRead([${ids.join(',')}]);">קראתי, סגור</button>
    </div>`;
    document.body.appendChild(ov);
    } finally { window._msgsChecking = false; }
  }

  window.staffSendMessageUI = staffSendMessageUI;
  window.staffCheckMessages = staffCheckMessages;
  window.staffMarkRead = staffMarkRead;
  // returning sessions (identity already stored): check shortly after the snapshot loads.
  setTimeout(function () { try { staffCheckMessages(); } catch (e) {} }, 2500);
  // ===========================================================
  // DEV TASKS (פיתוח) — read-only view of the GitHub tickets (Sigmatec-Energy/tasks),
  // for עידן + עמיחי only. Live via the `github` Edge Function (EMS-gated).
  //
  // TREE (native <details>, 3 levels):
  //   📂 Topic  →  אב Parent (sub-topic; click = show/hide children)  →  בן Task (click = show detail)
  // Parent grouping: key = sub (3-part "T|S|D") OR desc (2-part "T|S"). A group containing any 3-part
  // ticket renders as a collapsible אב; a 2-part-only group renders as a leaf task. Parents/leaves are
  // sorted A→Z (Hebrew) so near-identical names cluster (e.g. "ייצוא אקסל" next to "ייצוא לאקסל").
  // GitHub = explicit icon button (does NOT toggle the row / is not the default action).
  // Detail = state/assignee/priority/dates + body (body needs the github fn redeploy to appear).
  // ===========================================================
  function canSeeDevTasks() { return (typeof canManageStaff === 'function') && canManageStaff(); }
  window._devState = 'open';

  var DEV_GH = '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

  function devPriorityRank(p) {
    p = (p || '').trim();
    if (/גבוה|דחוף|critical|high|urgent/i.test(p)) return { label: 'גבוהה', cls: 'high' };
    if (/בינוני|medium|normal/i.test(p))           return { label: 'בינונית', cls: 'med' };
    if (/נמוך|low/i.test(p))                        return { label: 'נמוכה', cls: 'low' };
    return { label: p, cls: 'low' };
  }
  // Priority is shown if the ticket sets one — from the body "## עדיפות" (t.priority) OR a GitHub
  // LABEL whose name contains a priority keyword. No labels exist yet (0/100); the moment one is
  // added (e.g. "דחוף" / "בינוני" / "נמוך"), the chip appears — no function redeploy needed.
  function devPriority(t) {
    if (t.priority) return devPriorityRank(t.priority);
    var labs = t.labels || [];
    for (var i = 0; i < labs.length; i++) {
      var L = String(labs[i]);
      if (/גבוה|דחוף|critical|high|urgent|🔴/i.test(L)) return { label: 'גבוהה', cls: 'high' };
      if (/בינוני|medium|normal|🟡/i.test(L)) return { label: 'בינונית', cls: 'med' };
      if (/נמוך|low|🟢/i.test(L)) return { label: 'נמוכה', cls: 'low' };
    }
    return null;
  }
  function devEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function devFmtDate(s) { if (!s) return ''; var d = new Date(s); if (isNaN(d.getTime())) return ''; return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }

  async function devFetchTasks(state) {
    var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
    if (!tok) throw new Error('יש להתחבר ל-EMS כדי לראות משימות פיתוח');
    // client-side timeout so a cold/slow function never hangs the page on an endless spinner
    var ac = new AbortController();
    var to = setTimeout(function () { ac.abort(); }, 20000);
    var r;
    try {
      r = await fetch(SB_URL + '/functions/v1/github', {
        method: 'POST', signal: ac.signal,
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok, state: state || 'open' })
      });
    } catch (e) {
      throw new Error(ac.signal.aborted ? 'השרת מתעורר (cold start) — נסה שוב בעוד רגע' : ('תקלת רשת: ' + (e && e.message || e)));
    } finally { clearTimeout(to); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ('github ' + r.status));
    return d.tasks || [];
  }

  // title encodes "נושא | תת-נושא | תיאור"
  function devParseT(title) {
    var parts = String(title || '').split(/\s*\|\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length >= 3) return { topic: parts[0], sub: parts[1], desc: parts.slice(2).join(' · ') };
    if (parts.length === 2) return { topic: parts[0], sub: '', desc: parts[1] };
    return { topic: 'אחר', sub: '', desc: parts[0] || String(title || '') };
  }

  // open the GitHub issue WITHOUT toggling the <details> (explicit button, not the default row action)
  window.devGitOpen = function (e, el) { e.preventDefault(); e.stopPropagation(); window.open(el.href, '_blank', 'noopener'); };

  // בן — a task as a collapsible <details>: summary (desc + git button) → detail panel.
  function devTaskNode(t) {
    var pr = devPriority(t);
    var closed = t.state === 'closed';
    var s = devEsc((t._p.topic + ' ' + t._p.sub + ' ' + t._p.desc + ' #' + t.number + ' ' + (t.assignee || '')).toLowerCase());
    var created = devFmtDate(t.createdAt), updated = devFmtDate(t.updatedAt);
    var detail = '<div class="dev-detail">' +
      '<div class="dev-detail-row">' +
        '<span class="dev-st ' + (closed ? 'dev-st-closed' : 'dev-st-open') + '">' + (closed ? '✅ סגור' : '🟢 פתוח') + '</span>' +
        '<span class="dev-detail-num"><bdi dir="ltr">#' + devEsc(String(t.number)) + '</bdi></span>' +
        (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
        (t.assignee ? '<span class="dev-assignee">👤 <bdi>' + devEsc(t.assignee) + '</bdi></span>' : '') +
        (created ? '<span class="dev-detail-date">📅 ' + created + (updated && updated !== created ? ' · עודכן ' + updated : '') + '</span>' : '') +
      '</div>' +
      (t.body ? '<div class="dev-detail-body">' + devEsc(t.body) + '</div>' : '<div class="dev-detail-empty">— אין תיאור זמין (יופיע אחרי עדכון פונקציית github) —</div>') +
      '<a class="dev-detail-link" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">פתח ב-GitHub ↗</a>' +
    '</div>';
    return '<details class="dev-task" data-s="' + s + '">' +
      '<summary class="dev-task-sum">' +
        '<span class="dev-caret" aria-hidden="true">▸</span>' +
        '<span class="dev-task-desc">' + devEsc(t._p.desc) + '</span>' +
        (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
        (closed ? '<span class="dev-done" title="סגור">✅</span>' : '') +
        '<a class="dev-git" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="devGitOpen(event,this)" title="פתח את הכרטיס ב-GitHub">' + DEV_GH + '</a>' +
      '</summary>' + detail +
    '</details>';
  }

  // אב — a parent (sub-topic) as a collapsible <details>: summary (name + count) → children.
  function devParentNode(name, group) {
    return '<details class="dev-parent" data-s="' + devEsc(String(name).toLowerCase()) + '">' +
      '<summary class="dev-parent-sum">' +
        '<span class="dev-caret" aria-hidden="true">▸</span>' +
        '<span class="dev-parent-name"><bdi>' + devEsc(name) + '</bdi></span>' +
        '<span class="dev-parent-n">' + group.length + '</span>' +
      '</summary>' +
      '<div class="dev-parent-body">' + group.map(devTaskNode).join('') + '</div>' +
    '</details>';
  }

  async function renderDevTasks() {
    var el = document.getElementById('devTasksContent');
    if (!el) return;
    if (!canSeeDevTasks()) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">אין הרשאה לעמוד זה.</div></div>'; return; }
    el.innerHTML = '<div class="dev-wrap"><div class="dev-loading">⏳ טוען משימות מ-GitHub…</div></div>';
    var tasks;
    try { tasks = await devFetchTasks(window._devState); }
    catch (e) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">⚠️ ' + devEsc(e.message) + ' <button class="inv-btn small" style="margin-right:8px;" onclick="renderDevTasks()">🔄 נסה שוב</button></div></div>'; return; }

    tasks.forEach(function (t) { t._p = devParseT(t.title); });
    var topics = {};
    tasks.forEach(function (t) {
      var topic = t._p.topic, P = t._p.sub || t._p.desc;
      var tp = (topics[topic] = topics[topic] || { n: 0, parents: {} });
      tp.n++;
      (tp.parents[P] = tp.parents[P] || []).push(t);
    });
    var topicNames = Object.keys(topics).sort(function (a, b) { return topics[b].n - topics[a].n; });

    var active = function (s) { return window._devState === s ? ' active' : ''; };
    var head = '<div class="dev-toolbar">' +
      '<div class="dev-counts"><strong>' + tasks.length + '</strong> משימות<span class="dev-counts-sub">· ' + topicNames.length + ' נושאים</span></div>' +
      '<input id="devSearch" class="dev-search" oninput="devFilter(this.value)" placeholder="🔍 חיפוש משימה…" inputmode="search">' +
      '<div class="dev-state-btns">' +
        '<button class="inv-btn small' + active('open') + '" onclick="devSetState(\'open\')">פתוחות</button>' +
        '<button class="inv-btn small' + active('all') + '" onclick="devSetState(\'all\')">הכל</button>' +
        '<button class="inv-btn small" onclick="renderDevTasks()">🔄 רענן</button>' +
      '</div></div>';

    var chips = '<div class="dev-chips">' + topicNames.map(function (topic, i) {
      return '<button class="dev-chip" onclick="devJump(' + i + ')">📂 <bdi>' + devEsc(topic) + '</bdi><span class="dev-chip-n">' + topics[topic].n + '</span></button>';
    }).join('') + '</div>';

    var recent = tasks.filter(function (t) { return t.state !== 'closed'; })
      .slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }).slice(0, 6);
    var ipBox = recent.length ? '<div class="card dev-now"><h3 class="dev-now-head">🔨 בפיתוח עכשיו <span class="dev-now-sub">· פעילות אחרונה</span></h3>' +
      '<div class="dev-now-list">' + recent.map(devTaskNode).join('') + '</div></div>' : '';

    var body = topicNames.map(function (topic, i) {
      var tp = topics[topic];
      var keys = Object.keys(tp.parents).sort(function (a, b) { return a.localeCompare(b, 'he'); });
      var inner = keys.map(function (k) {
        var group = tp.parents[k];
        var hasChild = group.some(function (t) { return !!t._p.sub; });
        return hasChild ? devParentNode(k, group) : group.map(devTaskNode).join('');
      }).join('');
      return '<details id="dtopic-' + i + '" class="dev-topic"' + (i === 0 ? ' open' : '') + '>' +
        '<summary class="dev-topic-sum"><span class="dev-topic-ico" aria-hidden="true">📂</span>' +
        '<span class="dev-topic-name"><bdi>' + devEsc(topic) + '</bdi></span>' +
        '<span class="dev-topic-n">' + tp.n + '</span><span class="dev-topic-caret" aria-hidden="true">⌄</span></summary>' +
        '<div class="dev-topic-body">' + inner + '</div></details>';
    }).join('');

    el.innerHTML = '<div class="dev-wrap">' + head + chips + ipBox + (tasks.length ? body : '<div class="dev-empty">אין משימות להצגה.</div>') + '</div>';
  }

  window.devJump = function (i) { var d = document.getElementById('dtopic-' + i); if (!d) return; d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  // live filter: show/hide tasks; reveal (but don't expand the detail of) matching tasks' ancestors.
  window.devFilter = function (q) {
    q = (q || '').trim().toLowerCase();
    document.querySelectorAll('#devTasksContent .dev-task').forEach(function (t) {
      t.style.display = (!q || (t.getAttribute('data-s') || '').indexOf(q) !== -1) ? '' : 'none';
    });
    document.querySelectorAll('#devTasksContent .dev-parent').forEach(function (p) {
      var any = Array.prototype.some.call(p.querySelectorAll('.dev-task'), function (t) { return t.style.display !== 'none'; });
      p.style.display = any ? '' : 'none'; if (q) p.open = any;
    });
    document.querySelectorAll('#devTasksContent .dev-topic').forEach(function (d) {
      var any = Array.prototype.some.call(d.querySelectorAll('.dev-task'), function (t) { return t.style.display !== 'none'; });
      d.style.display = any ? '' : 'none'; if (q) d.open = any;
    });
  };

  window.devSetState = function (s) { window._devState = s; renderDevTasks(); };
  window.renderDevTasks = renderDevTasks;
  window.canSeeDevTasks = canSeeDevTasks;
