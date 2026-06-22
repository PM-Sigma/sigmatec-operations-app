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

  function saveCompanyTasks() {
    const data = gatherCompanyTasksFromForm();
    localStorage.setItem(COMPANY_TASKS_KEY, JSON.stringify(data));
    // Sync to sheet so all devices see the same data.
    // NOTE: text/plain (not application/json) — avoids a CORS preflight that
    // Apps Script rejects, which previously made this save never reach the sheet.
    // Surface failures (was silently swallowed → a save during the 404-URL window was
    // lost to localStorage only). A warning lets the user retry instead of losing data.
    fetch(SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'setting', key: 'companyTasks', value: data })
    }).then(r => r.json()).then(res => { if (!res || !res.ok) emsToast('⚠️ שמירת משימות החברה לשרת נכשלה — נשמר מקומית בלבד, נסה שוב'); })
      .catch(() => emsToast('⚠️ שמירת משימות החברה לשרת נכשלה — נשמר מקומית בלבד, נסה שוב'));
    // Optimistically update SHEET_DATA so the next loadCompanyTasks() reads fresh data
    if (window.SHEET_DATA) {
      window.SHEET_DATA.settings = window.SHEET_DATA.settings || {};
      window.SHEET_DATA.settings.companyTasks = data;
    }
    renderCompanyTasks();
    document.getElementById('companyTasksModal').classList.remove('open');
    const t = document.getElementById('toast');
    t.textContent = '✅ משימות חברה נשמרו לגיליון';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  function sendCompanyTasksToTeam() {
    const data = gatherCompanyTasksFromForm();
    let msg = '*עידן — עדכון משימות חברה כלליות:*\n\n';
    msg += '*🛒 הזמנות:*\n' + (data.orders.length ? data.orders.map(o => '- ' + o).join('\n') : '(ריק)') + '\n\n';
    msg += '*ℹ️ מידע:*\n' + (data.info.length ? data.info.map(o => '- ' + o).join('\n') : '(ריק)') + '\n\n';
    msg += '*📋 הנחיות:*\n' + (data.guidelines.length ? data.guidelines.map(o => '- ' + o).join('\n') : '(ריק)') + '\n';
    const url = 'https://wa.me/972544649833?text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
    saveCompanyTasks();
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

