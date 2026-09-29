// 📥 The global readings watcher — mounted ONCE (HeaderActions loads this lazy chunk), for the
// signed-in non-viewer staff only, and free when idle: no timer, no request, no DOM until there is a
// run to watch. It is what makes a pull a server-side job the person can walk away from:
//   · active run ids live in localStorage, polled every 5 s from ANY screen;
//   · a floating chip "⏳ משיכת חולדה…" (tap → the page) while a run is going;
//   · on finish a toast with "לקבצים ←" (red + the reason for partial/failed), after the EMS
//     check that a manual run does by itself when the person has an EMS token;
//   · the ⋯ badge (latest cron run partial/failed and not yet opened by this user);
//   · the Sunday EMS sync, once per ISO week.
// It also mounts the page island the first time #readings-view is shown (the same page-open
// trigger main.tsx uses for the other lazy pages — done here so the boot file stays untouched).
import { toast } from 'sonner';
import { canUseReadings } from './readingsRoster';
import {
  ACTIVE_KEY, SUNDAY_KEY, addActive, badgeCount, finishToast, isoWeekKey, latestCronPerSite, parseActive,
  removeActive, shouldSundayCheck, watchVerdict, type ActiveRun,
} from './readingsLogic';
import {
  currentUser, emsCheck, emsSync, emsToken, fetchRecentCronRuns, fetchRunStatus, fetchSites,
} from './readingsApi';
import { registerMoreItem } from './registry';

export const FOCUS_KEY = 'sigma_readings_focus_v1';
const POLL_MS = 5000;
const w = window as any;

const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

const isRoster = (): boolean => {
  try { return canUseReadings(w.sigma?.getCurrentUser?.(), !!w.sigma?.isViewer?.()); } catch { return false; }
};

let timer: ReturnType<typeof setInterval> | null = null;
let chip: HTMLButtonElement | null = null;
let busy = false;
const doing = new Set<string>();              // runs already being finished (EMS check in flight)

const load = (): ActiveRun[] => parseActive(lsGet(ACTIVE_KEY));
const save = (l: ActiveRun[]) => lsSet(ACTIVE_KEY, JSON.stringify(l));

// ── badge ────────────────────────────────────────────────────────────────────
export function setBadge(n: number): void {
  const changed = (w.__readingsBadge | 0) !== n;
  w.__readingsBadge = n;
  // The ⋯ sheet re-renders on registry changes: re-registering the row nudges it (its badge() reads the global).
  if (changed) registerReadingsRow();
}

/** The ⋯ row lives here (this lazy chunk), not in the boot file's MORE_PAGES: label, gate and badge. */
function registerReadingsRow(): void {
  registerMoreItem({
    id: 'readings', label: 'משיכת קריאות מתוכנות חיצונית', icon: 'FileDown', group: 'admin',
    onSelect: () => gotoReadings(), visible: () => isRoster(), badge: () => w.__readingsBadge | 0,
  });
}

export async function refreshBadge(): Promise<void> {
  if (!isRoster()) { setBadge(0); return; }
  try {
    const [sites, runs] = await Promise.all([fetchSites(), fetchRecentCronRuns()]);
    const active = new Set(sites.map(s => s.id));
    setBadge(badgeCount(latestCronPerSite(runs.filter(r => active.has(r.site_id))), currentUser()));
  } catch { /* leave the badge as it was */ }
}

// ── navigation ───────────────────────────────────────────────────────────────
/** Open the page (optionally on one run — the toast's "לקבצים ←"). */
export function gotoReadings(runId?: string): void {
  if (runId) { try { sessionStorage.setItem(FOCUS_KEY, runId); } catch { /* ignore */ } }
  w.sigma?.showPage?.('readings');
  window.dispatchEvent(new CustomEvent('readings-focus', { detail: runId || null }));
}

// ── chip ─────────────────────────────────────────────────────────────────────
function paintChip(text: string | null): void {
  if (!text || w._currentPage === 'readings') { chip?.remove(); chip = null; return; }
  if (!chip) {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.setAttribute('data-testid', 'readings-chip');
    chip.setAttribute('role', 'status');
    chip.className = 'fixed z-[60] rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground shadow-lg';
    chip.style.insetInlineStart = '12px';
    chip.style.bottom = 'calc(var(--nav-h, 0px) + 12px)';
    chip.addEventListener('click', () => gotoReadings());
    document.body.appendChild(chip);
  }
  chip.textContent = text;
}

// ── polling ──────────────────────────────────────────────────────────────────
async function finish(run: ActiveRun, row: NonNullable<Awaited<ReturnType<typeof fetchRunStatus>>>): Promise<void> {
  if (doing.has(run.id)) return;
  doing.add(run.id);
  const v = watchVerdict(row) as 'ok' | 'partial' | 'failed';
  let emsNote = '';
  if (run.manual && v !== 'failed' && emsToken()) {
    paintChip('⏳ בודק מול EMS…');
    try { await emsCheck(run.id); } catch (e: any) { emsNote = ' (הבדיקה מול EMS לא הושלמה)'; void e; }
  }
  save(removeActive(load(), run.id));
  doing.delete(run.id);
  const t = finishToast(v, run.kibbutz, row);
  const opts = { duration: 15000, action: { label: 'לקבצים ←', onClick: () => gotoReadings(run.id) } };
  if (t.error) toast.error(t.text + emsNote, opts); else toast.success(t.text + emsNote, opts);
  window.dispatchEvent(new CustomEvent('readings-run-finished', { detail: run.id }));
  void refreshBadge();
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const list = load();
    if (!list.length) { stop(); return; }
    for (const run of list) {
      let row = null;
      try { row = await fetchRunStatus(run.id); } catch { continue; }   // offline blip — next tick
      if (!row) { if (Date.now() - run.startedAt > 60_000) save(removeActive(load(), run.id)); continue; }
      if (watchVerdict(row) === 'wait') { paintChip(`⏳ משיכת ${run.kibbutz}…`); continue; }
      await finish(run, row);
    }
    if (!load().length) stop();
  } finally { busy = false; }
}

function stop(): void {
  if (timer) { clearInterval(timer); timer = null; }
  paintChip(null);
}

function ensurePolling(): void {
  if (!timer && isRoster() && load().length) {
    paintChip(`⏳ משיכת ${load()[0].kibbutz}…`);
    timer = setInterval(() => void tick(), POLL_MS);
    void tick();
  }
}

/** The page calls this right after `run` answers — from here the watcher carries the run. */
export function trackRun(r: Omit<ActiveRun, 'startedAt'>): void {
  save(addActive(load(), { ...r, startedAt: Date.now() }));
  ensurePolling();
}

// ── Sunday sync ──────────────────────────────────────────────────────────────
async function sundayCheck(): Promise<void> {
  const now = new Date();
  if (!shouldSundayCheck({ now, isRoster: isRoster(), hasEmsToken: !!emsToken(), lastWeekKey: lsGet(SUNDAY_KEY) })) return;
  lsSet(SUNDAY_KEY, isoWeekKey(now));                     // once per week, even if a call below fails
  try { for (const s of await fetchSites()) void emsSync(s.kibbutz).catch(() => {}); } catch { /* silent */ }
}

// ── boot ─────────────────────────────────────────────────────────────────────
export function startReadingsWatch(): void {
  if (w.__readingsWatch) return;
  w.__readingsWatch = true;
  registerReadingsRow();

  // Page island: mounted the first time the view is shown (a deep link to it included).
  const view = document.getElementById('readings-view');
  if (view && document.getElementById('sigma-readings')) {
    const open = () => void import('@/islands/ReadingsPull').then(m => m.mountReadingsPull()).catch(e => console.warn('[sigma] readings island failed', e));
    if (view.style.display !== 'none') open();
    else {
      const obs = new MutationObserver(() => { if (view.style.display !== 'none') { obs.disconnect(); open(); } });
      obs.observe(view, { attributes: true, attributeFilter: ['style'] });
    }
  }

  const arm = () => {
    if (!isRoster()) { stop(); setBadge(0); return; }
    ensurePolling();
    setTimeout(() => { void refreshBadge(); void sundayCheck(); }, 3000);   // after the first paint
  };
  arm();
  (w.sigmaBus || window).addEventListener('user-changed', arm);   // sigmaEmit() fires on the bus, not window
  window.addEventListener('readings-badge-refresh', () => void refreshBadge());
  let lastVis = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !isRoster()) return;
    ensurePolling();
    if (Date.now() - lastVis > 5 * 60_000) { lastVis = Date.now(); void refreshBadge(); }
  });
}
