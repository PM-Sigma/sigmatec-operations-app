// 📲 Pull-to-refresh — phone only (spec §7k #10, Task 20).
//
// The app paints from cache and revalidates in the background (lib/query.ts), which means the
// refresh is invisible by design. Pull-to-refresh is the deliberate counterpart: the gesture
// every phone user already knows, for the moment someone does NOT trust what is on screen —
// "עמיחי just told me he closed that task". It invalidates every TanStack query AND forces the
// legacy EMS cache sync (`sigma.emsSync`), because those are two different caches and the
// on-card task widget reads the second one.
//
// Deliberately NOT a library: react-simple-pull-to-refresh and friends all want to OWN the
// scroll container, and ours is the document — a legacy page with React islands mounted into
// it. Document-level touch listeners are ~40 lines and cost nothing in the bundle.
//
// Desktop does nothing: there is no pull gesture with a mouse, and Ctrl+R already exists.
import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { mount } from '@/islands';
import { refreshAll } from '@/lib/query';
import { track } from '@/lib/track';

/** How far the finger travels (after resistance) before the release counts as a refresh. */
export const PULL_THRESHOLD = 64;
/** Past the threshold the indicator stops following the finger. */
export const PULL_MAX = 96;
/** Half of the finger's travel, so the gesture feels weighted instead of sticky. */
const RESISTANCE = 0.5;
const PHONE = '(max-width: 767px)';

/**
 * Pure: the indicator's offset for a raw finger delta, and whether releasing now refreshes.
 * Extracted so the arithmetic is unit-tested without a touch harness — the listeners below are
 * the thin layer. A pull UP (negative delta) is not a pull at all.
 */
export function pullState(deltaY: number): { offset: number; armed: boolean } {
  if (!(deltaY > 0)) return { offset: 0, armed: false };
  const offset = Math.min(deltaY * RESISTANCE, PULL_MAX);
  return { offset, armed: offset >= PULL_THRESHOLD };
}

/** The document is at the very top — the only place a pull may start. */
function atTop(): boolean {
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
}

/**
 * ONE gesture per page, even if two islands render the component. The listeners are on
 * `document`, so a second instance would refresh twice on one pull; the flag lives on `window`
 * because index.html can evaluate ui/sigma.js twice (see islands.tsx `mount`).
 */
function claim(): boolean {
  const w = window as any;
  if (w.__sigmaPullToRefresh) return false;
  w.__sigmaPullToRefresh = true;
  return true;
}
function release(): void { (window as any).__sigmaPullToRefresh = false; }

export function PullToRefresh() {
  const [offset, setOffset] = React.useState(0);
  const [armed, setArmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [phone, setPhone] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(PHONE).matches === true,
  );

  // The viewport can cross the breakpoint mid-session (a rotation, or a desktop window
  // dragged narrow), so the gesture follows the media query rather than the boot-time width.
  React.useEffect(() => {
    const mq = window.matchMedia?.(PHONE);
    if (!mq) return;
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Refs, not state: the touch handlers run dozens of times per second and must not re-bind.
  const startY = React.useRef<number | null>(null);
  const armedRef = React.useRef(false);
  const busyRef = React.useRef(false);

  const run = React.useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    track('pull-to-refresh');
    // A refresh that fails is invisible by design — the screen keeps the data it already has.
    // The `catch` is what makes it invisible: without it an offline pull, the commonest way
    // for this to fail, escaped as an unhandled promise rejection (Task 18, pinned by
    // PullToRefresh.test.tsx "the guard is released even when the refresh REJECTS").
    try { await refreshAll(); }
    catch { /* offline or a dead query — the next pull tries again */ }
    finally {
      busyRef.current = false;
      setBusy(false);
      setOffset(0);
      setArmed(false);
      armedRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!phone) return;
    if (!claim()) return;

    const onStart = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1 || !atTop()) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || busyRef.current || !e.touches.length) return;
      const delta = e.touches[0].clientY - startY.current;
      // Scrolled away from the top mid-gesture, or the finger went up → this is a normal
      // scroll and we hand it straight back to the browser.
      if (delta <= 0 || !atTop()) { startY.current = null; setOffset(0); setArmed(false); armedRef.current = false; return; }
      const s = pullState(delta);
      // Only once the pull is real do we take the gesture from the browser — otherwise this
      // listener would fight every ordinary scroll on the page.
      if (s.offset > 4 && e.cancelable) e.preventDefault();
      setOffset(s.offset);
      setArmed(s.armed);
      armedRef.current = s.armed;
    };
    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      if (armedRef.current) void run();
      else { setOffset(0); setArmed(false); }
    };

    // touchmove is NOT passive on purpose (it is the only one that calls preventDefault);
    // the other two stay passive so they never delay a scroll.
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      release();
    };
  }, [phone, run]);

  if (!phone || (!offset && !busy)) return null;

  const shown = busy ? PULL_THRESHOLD : offset;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pull-to-refresh"
      data-armed={armed || busy ? '1' : '0'}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{ transform: `translateY(${Math.max(0, shown - 28)}px)`, transition: busy ? 'transform 160ms ease' : 'none' }}
    >
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-lg">
        <RefreshCw
          className={'h-3.5 w-3.5' + (busy ? ' animate-spin' : '')}
          style={busy ? undefined : { transform: `rotate(${Math.round((shown / PULL_THRESHOLD) * 180)}deg)` }}
        />
        {busy ? 'מרענן…' : armed ? 'שחרר לרענון' : 'משוך לרענון'}
      </span>
    </div>
  );
}

/**
 * Mounted ONCE for the whole app from main.tsx (#sigma-refresh sits at the end of index.html,
 * next to the toaster). It is a page-wide gesture, not a screen's widget: the listeners are on
 * `document`, so wherever the person is — cards, יומן, נוכחות — the same pull refreshes
 * everything that is mounted.
 */
export function mountPullToRefresh(): boolean {
  return mount('sigma-refresh', PullToRefresh);
}
