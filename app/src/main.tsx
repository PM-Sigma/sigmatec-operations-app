// ui/sigma.js entry — mounts the Task 0 islands (nav + toaster) and hands Sonner's toast
// back to the legacy bridge. Later tasks add #sigma-home / #sigma-field / #sigma-feedback /
// #sigma-import here.
import './styles.css';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Nav } from '@/components/Nav';
import { mountReLoginSheet } from '@/components/ReLoginSheet';
import { mount } from '@/islands';
import { applyTheme, storedTheme } from '@/lib/theme';
import { applySettings, getSettings, loadSettings, openSettings } from '@/lib/settings';
import { applyLanding } from '@/lib/landing';
import { registerMoreItem } from '@/lib/registry';
import { startTracking } from '@/lib/track';
import { installEmsBridge } from '@/lib/ems/gateway';

// REGRESSION GUARD for the cache-bust stamps. index.html loads this module as
// `ui/sigma.js?v=<ver>`; build.mjs stamps the chunks' own `./sigma*.js` specifiers with the
// SAME ver so there is exactly ONE URL — and therefore one evaluation — per module. If the two
// ever disagree again the entry is evaluated twice: two queryClients over one localStorage
// key, and every island mounted twice. The counter makes that loud instead of subtle.
const evals = ((window as any).__sigmaEntryEvals = (((window as any).__sigmaEntryEvals as number) || 0) + 1);
if (evals > 1) {
  console.warn(
    `[sigma] ui/sigma.js evaluated ${evals}× — the ?v= stamps in index.html and the ui/ chunks disagree (build.mjs)`,
  );
}

/**
 * Run after the first paint is out of the way (task 22b). Used for 📈 שימוש only: its chunk is
 * 400 kB of Recharts for a panel one person opens from a menu, and importing it during boot
 * spent that bandwidth against the first paint ("reduce unused JavaScript ≈ 1.7 s" on the
 * Lighthouse gate). It still mounts on every boot, one idle tick later.
 *
 * The other panels are NOT deferred, deliberately: each registers its own ⋯ row / open
 * listener when it mounts, so a deferred one means a 📣 tap in the first second does nothing —
 * qa/playwright/tests/feedback.spec.ts caught exactly that. Their chunks are 1–8 kB each.
 */
function whenIdle(fn: () => void): void {
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => void);
  if (ric) ric(fn, { timeout: 1500 });
  else setTimeout(fn, 200);
}

function SigmaToaster() {
  return <Toaster richColors position="top-center" dir="rtl" closeButton />;
}

function boot() {
  // Same two-copies-of-the-entry problem as in islands.tsx `mount`, but here the cost is
  // higher than duplicate DOM: a second evaluation brings a SECOND TanStack queryClient and
  // a second persister writing the same localStorage key. The flag is on `window` so it is
  // shared by both copies.
  const w = window as any;
  if (w.__sigmaBooted) return;
  w.__sigmaBooted = true;

  // Re-apply the stored theme through the full path (the <head> snippet only set the class
  // before first paint; this also syncs theme-color and announces 'theme-changed').
  applyTheme(storedTheme() ?? 'system');
  // …then the person's own choices, from the localStorage mirror: the font token lands before
  // the first island paints, so nothing re-types after the fact.
  applySettings(getSettings());

  // 📈 שימוש (spec §7j): install the flush loop BEFORE the first mount, so the mount
  // events themselves are buffered. Nothing here touches Supabase until the first flush.
  startTracking();

  // 🔗 Publish the ONE EmsGateway instance as `sigma.ems` (spec §7o) before anything can ask
  // the EMS for something. Legacy and React share this object, so a future `ems-mcp` adapter
  // swaps both at once. Synchronous and network-free.
  installEmsBridge();

  // 🔑 The re-login sheet (spec §7n) is NOT lazy and NOT deferred: it is the surface every
  // 401 in the app raises, so it has to be listening before the first request goes out. It is
  // provider-free and a few hundred bytes.
  mountReLoginSheet();

  // Both are provider-free islands — neither reads data, so neither pulls TanStack or supabase-js in.
  mount('sigma-toaster', SigmaToaster);
  mount('sigma-nav', Nav);

  // 📲 Pull-to-refresh (§7k #10). Lazy, and loaded on the FIRST TOUCH — not at boot, and not
  // on `whenIdle` either. It reaches into the query client, so a static import would drag
  // TanStack into the boot chunk; and `whenIdle` fires in exactly the window where the card
  // home is flushing its effects, which made an extra chunk fetch+parse into real contention.
  // That cost a measured regression: under the 4-project Playwright load a Ctrl+K landed
  // before the card home had published `window.KIBBUTZIM`, and the command bar opened with no
  // kibbutzim at all (qa/playwright/tests/command-bar.spec.ts — 2 of 3 full runs, against 0 of
  // 3 on the same tree without this task). The bar is robust to that now (islands/Home.tsx
  // announces the publish), but the right place for a touch-only feature is still the first
  // touch: a device that never receives one can never pull, and it pays nothing.
  //
  // `once` + passive, so it never delays a scroll. The gesture that triggers the import is not
  // the one that refreshes — the component is not mounted yet — so the very first pull of a
  // session is spent loading it, and nothing after.
  if (document.getElementById('sigma-refresh')) {
    const loadPullToRefresh = () => void import('@/components/PullToRefresh')
      .then(m => m.mountPullToRefresh())
      .catch(e => console.warn('[sigma] pull-to-refresh island failed', e));
    document.addEventListener('touchstart', loadPullToRefresh, { once: true, passive: true });
  }

  // 📝 יומן היום (§7i) — the row that used to say "בקרוב" here is the real thing now; it is
  // registered further down, next to the island it opens, under the same id `field-journal`
  // so the sheet's order does not move.

  // Sonner replaces the legacy #toast strip for everything that goes through the bridge.
  const sigma = (window as any).sigma;
  if (sigma) sigma.toast = (msg: string, opts?: Record<string, unknown>) => toast(msg, opts as any);

  // The card home is a LAZY chunk (ui/sigma-Home.js): it drags in TanStack Query and
  // supabase-js, which no other island needs, so the boot bundle stays small. If the chunk
  // fails to load the legacy renderer (js/src/24-kibbutzim.js) still paints the cards.
  if (document.getElementById('sigma-home')) {
    import('@/islands/Home')
      .then(m => m.mountHome())
      .catch(e => console.warn('[sigma] card home island failed — legacy cards stay', e));
  }

  // ✅ המשימות שלי (round 4, Package X) — the sheet that replaced the floating 🔒 strip. It
  // fills the same #sigma-my-tasks placeholder, and it is NOT deferred: the header button and
  // the ⋯ row both open it, and a first tap that does nothing is the bug Package X is fixing.
  // Its `registerMoreItem` also has to run before the sheet is listed.
  if (document.getElementById('sigma-my-tasks')) {
    import('@/islands/MyTasks')
      .then(m => m.mountMyTasks())
      .catch(e => console.warn('[sigma] my-tasks island failed', e));
  }

  // 📍 The field day (Task 5): the arrival sheet + briefing (#sigma-field) and the "היום"
  // strip above the cards (#sigma-today). One lazy chunk, two roots — the strip has to render
  // before the cards, and the sheet is a portal. Neither surface exists for a non-field role,
  // so a failed chunk costs nothing but the nudge.
  if (document.getElementById('sigma-field') || document.getElementById('sigma-today')) {
    import('@/islands/Field')
      .then(m => m.mountField())
      .catch(e => console.warn('[sigma] field island failed', e));
  }

  // 🗓 Meeting notes (Task 2): the modal tab + the admin-only import sheet. Same lazy-chunk
  // reasoning as the home island — both read data, and the modal tab is only ever opened
  // from a card. They are separate roots so one failing never takes the other down.
  if (document.getElementById('sigma-modal-meetings')) {
    import('@/islands/ModalMeetings')
      .then(m => m.mountModalMeetings())
      .catch(e => console.warn('[sigma] meetings tab island failed', e));
  }
  // 🔥 צריבות (Task 23) — the temporary meter-burn project: the kibbutz-modal section and
  // the landing progress strip. A lazy chunk like every data island, and one that simply
  // renders nothing for anyone outside the project's audience or once BURNS_PROJECT_ACTIVE
  // is false — at which point this block is the only line that has to be deleted.
  if (document.getElementById('sigma-burns') || document.getElementById('sigma-burns-modal')) {
    import('@/islands/Burns')
      .then(m => m.mountBurns())
      .catch(e => console.warn('[sigma] burns island failed', e));
  }
  // 🩺 מצב הקיבוץ (Task 28) — the DRAFT health strip in the kibbutz modal. Lazy like every
  // data island, and it renders nothing for anyone outside the overview's audience. Its mount
  // also publishes `sigma.presenterStrip` for ▶ מצב ישיבה; a chunk that never lands simply
  // leaves that strip out.
  // 🔒 משימות פנימיות in the kibbutz modal (22.9) — the rows with their actions and the ➕.
  if (document.getElementById('sigma-internal-modal')) {
    import('@/islands/InternalModal')
      .then(m => m.mountInternalModal())
      .catch(e => console.warn('[sigma] internal-tasks island failed', e));
  }
  if (document.getElementById('sigma-health-modal')) {
    import('@/islands/Health')
      .then(m => m.mountHealth())
      .catch(e => console.warn('[sigma] health island failed', e));
  }
  // 📣 Feedback box (Task 6): the sheet for everyone, the admin inbox as its own root so a
  // failure in one never takes the other down. Both register their own ⋯ עוד entries.
  if (document.getElementById('sigma-feedback')) {
    import('@/islands/Feedback')
      .then(m => m.mountFeedback())
      .catch(e => console.warn('[sigma] feedback island failed', e));
  }
  // 🔢 דיווח שינוי במלאי (inventory spec §4b): NOT deferred, like the feedback sheet and for
  // the same reason — the 📦 מלאי page renders a legacy button that dispatches the raw open
  // event, so the island has to be listening before the first tap. Its chunk is a few kB.
  if (document.getElementById('sigma-stock-change')) {
    import('@/islands/StockChange')
      .then(m => m.mountStockChange())
      .catch(e => console.warn('[sigma] stock-change island failed', e));
  }
  // 🔔 התראות מלאי (inventory spec §5.1) — the header bell. Not deferred: it carries the
  // unseen badge, and a badge that appears a second late is a badge nobody trusts.
  if (document.getElementById('sigma-alerts')) {
    import('@/islands/Alerts')
      .then(m => m.mountAlerts())
      .catch(e => console.warn('[sigma] alerts island failed', e));
  }
  // 🧾 הזמנות פתוחות + 🎚 מינימום מלאי (§4a, §5) — lives inside the 📦 מלאי page, so it
  // loads with everything else on that page rather than on its own idle tick.
  if (document.getElementById('sigma-inventory-strip')) {
    import('@/islands/InventoryStrip')
      .then(m => m.mountInventoryStrip())
      .catch(e => console.warn('[sigma] inventory-strip island failed', e));
  }
  if (document.getElementById('sigma-feedback-inbox')) {
    import('@/islands/FeedbackInbox')
      .then(m => m.mountFeedbackInbox())
      .catch(e => console.warn('[sigma] feedback inbox island failed', e));
  }
  // 📅 נוכחות (Task 12) + 🕎 חגים. Same lazy-chunk reasoning as the rest: both read data.
  // The attendance island also HIDES the legacy summary/table when it mounts, so a chunk
  // that never lands simply leaves the old page on screen — working, just not redesigned.
  // Loaded WHEN THE PAGE IS FIRST OPENED, not at boot. נוכחות is only ever reached by a nav
  // click, and its chunk pulls TanStack and supabase-js in — on the card home (which is
  // where almost every session starts) that was bandwidth and main-thread time spent on a
  // screen nobody is looking at, and it showed up as the command bar building its list a
  // beat late. `showPage` toggles the view's inline `display`, so watching that attribute is
  // the whole trigger; a deep link that lands on the page already open is handled by the
  // immediate check.
  const attView = document.getElementById('attendance-view');
  if (attView && document.getElementById('sigma-attendance')) {
    const loadAttendance = () => import('@/islands/Attendance')
      .then(m => m.mountAttendance())
      .catch(e => console.warn('[sigma] attendance island failed — legacy report stays', e));
    if (attView.style.display !== 'none') void loadAttendance();
    else {
      const obs = new MutationObserver(() => {
        if (attView.style.display === 'none') return;
        obs.disconnect();
        void loadAttendance();
      });
      obs.observe(attView, { attributes: true, attributeFilter: ['style'] });
    }
  }
  // 🗓️ יומן (Task 13). Same page-open trigger as נוכחות, and for the same reason: the
  // calendar chunk pulls TanStack, supabase-js and Motion's Reorder in, and almost every
  // session starts on the cards. A failed chunk simply leaves the legacy month grid on
  // screen — working, just not redesigned.
  // ⏱ שעות מול לקוחות (22.9, E2) — loaded when the page first opens, like נוכחות and יומן.
  const hoursView = document.getElementById('hours-view');
  if (hoursView && document.getElementById('sigma-hours')) {
    const loadHours = () => import('@/islands/Hours')
      .then(m => m.mountHours())
      .catch(e => console.warn('[sigma] hours island failed', e));
    if (hoursView.style.display !== 'none') void loadHours();
    else {
      const obs = new MutationObserver(() => {
        if (hoursView.style.display === 'none') return;
        obs.disconnect();
        void loadHours();
      });
      obs.observe(hoursView, { attributes: true, attributeFilter: ['style'] });
    }
  }
  const calView = document.getElementById('calendar-view');
  if (calView && document.getElementById('sigma-calendar')) {
    const loadCalendar = () => import('@/islands/Calendar')
      .then(m => m.mountCalendar())
      .catch(e => console.warn('[sigma] calendar island failed — legacy grid stays', e));
    if (calView.style.display !== 'none') void loadCalendar();
    else {
      const obs = new MutationObserver(() => {
        if (calView.style.display === 'none') return;
        obs.disconnect();
        void loadCalendar();
      });
      obs.observe(calView, { attributes: true, attributeFilter: ['style'] });
    }
  }
  if (document.getElementById('sigma-holidays')) {
    import('@/islands/Holidays')
      .then(m => m.mountHolidays())
      .catch(e => console.warn('[sigma] holidays island failed', e));
  }
  // 📈 שימוש (Task 17) — עידן only, and a lazy chunk like every data island: it drags in
  // Recharts, which nobody else needs.
  if (document.getElementById('sigma-usage')) {
    whenIdle(() => void import('@/islands/Usage')
      .then(m => m.mountUsage())
      .catch(e => console.warn('[sigma] usage island failed', e)));
  }
  // The header cluster (§6). Lazy; the legacy header chips stay if the chunk never lands.
  if (document.getElementById('sigma-header-actions')) {
    import('@/islands/HeaderActions')
      .then(m => { if (m.mountHeaderActions()) document.body.classList.add('sigma-header-ready'); })
      .catch(e => console.warn('[sigma] header', e));
  }
  // Ctrl+K — package X deletes this block together with CommandBar.tsx.
  if (document.getElementById('sigma-command')) {
    import('@/islands/CommandBar')
      .then(m => m.mountCommandBar())
      .catch(e => console.warn('[sigma] cmdk', e));
  }

  // ⚙️ הגדרות (§7h) — a lazy chunk like every other panel, but its row in the ⋯ sheet and the
  // user-chip menu are registered by the island itself, so a failed chunk simply means no row.
  if (document.getElementById('sigma-settings')) {
    import('@/islands/Settings')
      .then(m => m.mountSettings())
      .catch(e => console.warn('[sigma] settings island failed', e));
  }
  // 📋 הפערים שלי (§7h) — a lazy chunk, and a DEFERRED one: it reads five sources, so it
  // drags TanStack and supabase-js behind it, and it is a panel reached from a menu. Loading
  // it during boot cost a measured 7 points of Lighthouse performance on the card home.
  //
  // Deferring a panel normally means a tap in the first second does nothing (the reason every
  // other panel here is NOT deferred — qa/playwright/tests/feedback.spec.ts caught exactly
  // that). So the row and the opener are registered NOW, cheaply, and `whenIdle` mounts the
  // chunk (unopened) a tick later so the panel is ready before anyone asks for it.
  //
  // FIX ROUND 1 (task-15 review §Important): the ORIGINAL open path re-dispatched the open
  // event right after `mountGaps()` resolved, racing the island's own `useEffect` listener
  // (attached asynchronously) and sometimes losing a tap that landed on the very first,
  // still-loading chunk. `mountGaps({ open })` now hands the island a flag it consumes
  // synchronously inside its OWN first render (see Gaps.tsx's `pendingOpen`), so the ONE
  // mount call that actually happens never needs an event round-trip. `wantOpen` (not a
  // per-call argument closed over a single `.then`) is what lets a click that lands WHILE the
  // idle-triggered load is still in flight upgrade that same in-flight mount from "just warm
  // it up" to "and open it" — reading a shared, live variable inside every `.then` callback,
  // rather than each callback's own frozen copy of the flag at the time it was attached.
  if (document.getElementById('sigma-gaps')) {
    let modulePromise: Promise<typeof import('@/islands/Gaps')> | null = null;
    let mounted = false;
    let wantOpen = false;
    const ensureLoaded = () => (modulePromise ||= import('@/islands/Gaps'));
    const mountOnce = (open: boolean) => {
      wantOpen = wantOpen || open;
      void ensureLoaded()
        .then(m => {
          if (mounted) {
            // Mounted by an earlier call already — that island's effect listener has had a
            // full macrotask (at least) to attach, so a plain dispatch is safe here.
            if (wantOpen) { wantOpen = false; window.dispatchEvent(new CustomEvent('sigma-open-gaps')); }
            return;
          }
          mounted = m.mountGaps({ open: wantOpen });
          wantOpen = false;
        })
        .catch(e => { modulePromise = null; console.warn('[sigma] gaps island failed', e); });
    };
    const openGaps = () => {
      if (mounted) { window.dispatchEvent(new CustomEvent('sigma-open-gaps')); return; }
      mountOnce(true);
    };
    // An event that arrives BEFORE the island exists: load-and-open. Once `mounted` is true
    // the island owns the event itself via its own listener, so this never double-opens.
    window.addEventListener('sigma-open-gaps', () => { if (!mounted) openGaps(); });
    (window as any).sigmaOpenGaps = openGaps;          // the ?pushact=gaps deep link
    registerMoreItem({
      id: 'gaps',
      label: 'פערים',
      icon: 'ClipboardList',
      group: 'app',
      // Gated here too, not only in the island: the row is registered before the chunk
      // lands, and for the seconds in between it must not offer a panel to someone the
      // panel is not for. `mountGaps` re-registers the same id with the same rule.
      visible: () => {
        try {
          const s = (window as any).sigma;
          const me = s?.getCurrentUser?.() || '';
          return !!s?.isViewer?.() || !!s?.isIdan?.() || me === 'עמיחי'
            || (s?.ATT_PEOPLE || ['אביאם', 'ניתאי']).includes(me);
        } catch { return false; }
      },
      onSelect: openGaps,
    });
    whenIdle(() => mountOnce(false));
  }

  // 📝 יומן היום (§7i) — deferred exactly like the gaps panel, and for the same reason: it is
  // a sheet reached from a menu, and it pulls the speech helpers in behind it. The row and the
  // opener are registered NOW so a tap in the first second still lands; `whenIdle` warms the
  // chunk, and the cold-open flag is handed to the island's first render rather than
  // re-dispatched at it (the task-15 fix-round lesson, applied from the start here).
  if (document.getElementById('sigma-daylog')) {
    let modulePromise: Promise<typeof import('@/islands/DayLog')> | null = null;
    let mounted = false;
    let wantOpen = false;
    const ensureLoaded = () => (modulePromise ||= import('@/islands/DayLog'));
    const mountOnce = (open: boolean) => {
      wantOpen = wantOpen || open;
      void ensureLoaded()
        .then(m => {
          if (mounted) {
            if (wantOpen) { wantOpen = false; window.dispatchEvent(new CustomEvent('sigma-open-daylog')); }
            return;
          }
          mounted = m.mountDayLog({ open: wantOpen });
          wantOpen = false;
        })
        .catch(e => { modulePromise = null; console.warn('[sigma] daylog island failed', e); });
    };
    const openDayLog = () => {
      if (mounted) { window.dispatchEvent(new CustomEvent('sigma-open-daylog')); return; }
      mountOnce(true);
    };
    window.addEventListener('sigma-open-daylog', () => { if (!mounted) openDayLog(); });
    (window as any).sigmaOpenDayLog = openDayLog;
    registerMoreItem({
      id: 'field-journal',
      label: 'יומן היום',
      icon: 'Notebook',
      group: 'app',
      visible: () => {
        try {
          const s = (window as any).sigma;
          const me = s?.getCurrentUser?.() || '';
          return !!me && (!!s?.isIdan?.() || (s?.ATT_PEOPLE || ['אביאם', 'ניתאי']).includes(me));
        } catch { return false; }
      },
      onSelect: openDayLog,
    });
    whenIdle(() => mountOnce(false));
  }
  // ▶ מצב ישיבה (company-process §1.2) — deferred like the two panels above. It is opened
  // once a week, by two people, from a menu; loading its overlay, its sheet and the meeting
  // tables at boot would cost every other screen for nothing. The ⋯ row is registered NOW
  // (with the same live role predicate the island uses) so the first tap lands, and the
  // cold-open flag rides into the island's own first render.
  if (document.getElementById('sigma-presenter')) {
    let modulePromise: Promise<typeof import('@/islands/Presenter')> | null = null;
    let mounted = false;
    let wantOpen = false;
    const ensureLoaded = () => (modulePromise ||= import('@/islands/Presenter'));
    const mountOnce = (open: boolean) => {
      wantOpen = wantOpen || open;
      void ensureLoaded()
        .then(m => {
          if (mounted) {
            if (wantOpen) { wantOpen = false; window.dispatchEvent(new CustomEvent('sigma-open-presenter')); }
            return;
          }
          mounted = m.mountPresenter({ open: wantOpen });
          wantOpen = false;
        })
        .catch(e => { modulePromise = null; console.warn('[sigma] presenter island failed', e); });
    };
    const openPresenter = () => {
      if (mounted) { window.dispatchEvent(new CustomEvent('sigma-open-presenter')); return; }
      mountOnce(true);
    };
    window.addEventListener('sigma-open-presenter', () => { if (!mounted) openPresenter(); });
    (window as any).sigmaOpenPresenter = openPresenter;
    registerMoreItem({
      id: 'presenter',
      label: 'מצב ישיבה',
      icon: 'Presentation',
      group: 'admin',
      visible: () => {
        try {
          const s = (window as any).sigma;
          const me = s?.getCurrentUser?.() || '';
          return !s?.isViewer?.() && (!!s?.isAdmin?.() || me === 'עידן' || me === 'עמיחי');
        } catch { return false; }
      },
      onSelect: openPresenter,
    });
    whenIdle(() => mountOnce(false));
  }
  // ▶ ישיבת פיתוח (company-process §7) — the same deferred pattern as ▶ מצב ישיבה above, and
  // for the same reason: one meeting a week, three people, opened from a menu. The ⋯ row is
  // registered NOW with the dev-page's own live gate (עידן + מתניה + אליה, or an admin, never
  // a viewer) so the first tap lands, and the island pulls the board only once it is open.
  if (document.getElementById('sigma-dev-presenter')) {
    let modulePromise: Promise<typeof import('@/islands/DevPresenter')> | null = null;
    let mounted = false;
    let wantOpen = false;
    const ensureLoaded = () => (modulePromise ||= import('@/islands/DevPresenter'));
    const mountOnce = (open: boolean) => {
      wantOpen = wantOpen || open;
      void ensureLoaded()
        .then(m => {
          if (mounted) {
            if (wantOpen) { wantOpen = false; window.dispatchEvent(new CustomEvent('sigma-open-dev-presenter')); }
            return;
          }
          mounted = m.mountDevPresenter({ open: wantOpen });
          wantOpen = false;
        })
        .catch(e => { modulePromise = null; console.warn('[sigma] dev presenter island failed', e); });
    };
    const openDevPresenter = () => {
      if (mounted) { window.dispatchEvent(new CustomEvent('sigma-open-dev-presenter')); return; }
      mountOnce(true);
    };
    window.addEventListener('sigma-open-dev-presenter', () => { if (!mounted) openDevPresenter(); });
    (window as any).sigmaOpenDevPresenter = openDevPresenter;
    registerMoreItem({
      id: 'dev-presenter',
      label: 'ישיבת פיתוח',
      icon: 'GitPullRequest',
      group: 'admin',
      visible: () => {
        try {
          const s = (window as any).sigma;
          const me = s?.getCurrentUser?.() || '';
          return !s?.isViewer?.()
            && (!!s?.isAdmin?.() || me === 'עידן' || me === 'מתניה' || me === 'אליה');
        } catch { return false; }
      },
      onSelect: openDevPresenter,
    });
    whenIdle(() => mountOnce(false));
  }
  if (document.getElementById('sigma-import')) {
    import('@/islands/ImportNotes')
      .then(m => m.mountImportNotes())
      .catch(e => console.warn('[sigma] import island failed', e));
  }
  // First screen per role (§7l). Last in boot, and only ever once per session: the landing
  // reads the page gates, which need the legacy bundle to be fully up.
  //
  // The landing is decided ONCE, from the localStorage mirror, and is deliberately NOT
  // re-applied when the person's stored row arrives a moment later: a screen that moves under
  // someone a second after he started reading is worse than a preference that takes effect on
  // his next visit. The row is still fetched here, so the mirror is right from then on.
  applyLanding(getSettings());
  const who = (window as any).sigma?.getCurrentUser?.() || '';
  if (who) void loadSettings(who).catch(() => { /* the mirror is authoritative offline */ });
}

/** Exposed for the ⋯ sheet / user chip in a page that never mounted the settings island. */
(window as any).sigmaOpenSettings = openSettings;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
