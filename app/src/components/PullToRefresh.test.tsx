// @vitest-environment jsdom
// 📲 Pull-to-refresh (spec §7k #10, Task 20).
//
// Two things are worth pinning here and nothing else. The ARITHMETIC — how far the finger has
// to travel and how much resistance it meets — because it is what the gesture feels like, and
// it is pure. And the two ways this component can go wrong in a way no one would notice until
// a user complains: firing on a desktop that has no pull gesture, and attaching twice so one
// pull refreshes the world twice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PULL_MAX, PULL_THRESHOLD, PullToRefresh, pullState } from './PullToRefresh';
import { refreshAll } from '@/lib/query';

vi.mock('@/lib/query', () => ({ refreshAll: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));

describe('pullState', () => {
  it('a pull UP, or no movement, is not a pull', () => {
    expect(pullState(0)).toEqual({ offset: 0, armed: false });
    expect(pullState(-80)).toEqual({ offset: 0, armed: false });
  });

  it('moves at half the finger\'s speed, so the sheet feels weighted', () => {
    expect(pullState(40).offset).toBe(20);
    expect(pullState(100).offset).toBe(50);
  });

  it('arms exactly at the threshold, never before', () => {
    expect(pullState((PULL_THRESHOLD - 1) * 2).armed).toBe(false);
    expect(pullState(PULL_THRESHOLD * 2).armed).toBe(true);
  });

  it('stops following the finger past the maximum', () => {
    expect(pullState(10_000).offset).toBe(PULL_MAX);
    expect(pullState(10_000).armed).toBe(true);
  });
});

// ── the component ────────────────────────────────────────────────────────────

function setViewport(isPhone: boolean) {
  const listeners = new Set<() => void>();
  (window as any).matchMedia = vi.fn().mockReturnValue({
    matches: isPhone,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  });
}

describe('<PullToRefresh>', () => {
  beforeEach(() => { (window as any).__sigmaPullToRefresh = false; });
  afterEach(() => { cleanup(); delete (window as any).__sigmaPullToRefresh; });

  it('renders nothing, and listens to nothing, on desktop', () => {
    setViewport(false);
    const add = vi.spyOn(document, 'addEventListener');
    render(<PullToRefresh />);
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull();
    expect(add.mock.calls.filter(c => String(c[0]).startsWith('touch'))).toHaveLength(0);
    add.mockRestore();
  });

  it('is invisible on a phone until a pull actually begins', () => {
    setViewport(true);
    render(<PullToRefresh />);
    expect(screen.queryByTestId('pull-to-refresh')).toBeNull();
  });

  it('attaches the touch listeners on a phone', () => {
    setViewport(true);
    const add = vi.spyOn(document, 'addEventListener');
    render(<PullToRefresh />);
    const touch = add.mock.calls.map(c => String(c[0])).filter(n => n.startsWith('touch'));
    expect(touch).toEqual(['touchstart', 'touchmove', 'touchend', 'touchcancel']);
    // touchmove is the only one that may call preventDefault, so it is the only non-passive one
    const move = add.mock.calls.find(c => c[0] === 'touchmove');
    expect((move?.[2] as AddEventListenerOptions).passive).toBe(false);
    expect((add.mock.calls.find(c => c[0] === 'touchstart')?.[2] as AddEventListenerOptions).passive).toBe(true);
    add.mockRestore();
  });

  it('a SECOND instance is inert — one pull must never refresh twice', () => {
    setViewport(true);
    render(<PullToRefresh />);
    const add = vi.spyOn(document, 'addEventListener');
    render(<PullToRefresh />);
    expect(add.mock.calls.filter(c => String(c[0]).startsWith('touch'))).toHaveLength(0);
    add.mockRestore();
  });

  // The in-flight guard. `busyRef` short-circuits BOTH the new gesture (touchstart bails) and
  // a second `run()`, and the review that filed this to Task 18 could only verify it by reading
  // the code. A slow network is exactly when a person pulls again, and two concurrent
  // refreshAll()s mean two full EMS crawls and two writes of the shared snapshot.
  describe('while a refresh is in flight', () => {
    /** Drive one complete armed pull through the real document listeners. */
    async function pull() {
      const touch = (y: number) => [{ clientY: y }] as unknown as Touch[];
      await act(async () => {
        document.dispatchEvent(Object.assign(new Event('touchstart'), { touches: touch(0) }));
        document.dispatchEvent(Object.assign(new Event('touchmove', { cancelable: true }),
          { touches: touch(PULL_THRESHOLD * 2 + 10) }));
        document.dispatchEvent(Object.assign(new Event('touchend'), { touches: [] }));
      });
    }

    beforeEach(() => {
      vi.mocked(refreshAll).mockClear();
      Object.defineProperty(document.documentElement, 'scrollTop', { value: 0, configurable: true });
      Object.defineProperty(document.body, 'scrollTop', { value: 0, configurable: true });
    });

    it('a second pull does NOT start a second refresh', async () => {
      setViewport(true);
      let release!: () => void;
      vi.mocked(refreshAll).mockImplementation(() => new Promise<void>(r => { release = () => r(); }));
      render(<PullToRefresh />);

      await pull();
      expect(refreshAll).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('pull-to-refresh').textContent).toContain('מרענן…');

      await pull();                                  // pulled again while the first is running
      expect(refreshAll).toHaveBeenCalledTimes(1);   // …and nothing new was started

      await act(async () => { release(); });
      expect(screen.queryByTestId('pull-to-refresh')).toBeNull();   // the strip clears when it lands
    });

    it('the guard is released even when the refresh REJECTS, so the gesture is not dead', async () => {
      setViewport(true);
      vi.mocked(refreshAll).mockRejectedValueOnce(new Error('offline'));
      render(<PullToRefresh />);

      // `run()` swallows the error (a failed refresh is invisible by design) — the assertion
      // is that the guard was released, so the NEXT pull still works. Before the Task 18 fix
      // this also produced an unhandled rejection on every offline pull.
      await pull();
      vi.mocked(refreshAll).mockResolvedValueOnce(undefined);
      await pull();
      expect(refreshAll).toHaveBeenCalledTimes(2);
    });
  });

  it('releases the claim on unmount, so a remount works', () => {
    setViewport(true);
    const first = render(<PullToRefresh />);
    first.unmount();
    expect((window as any).__sigmaPullToRefresh).toBe(false);
    const add = vi.spyOn(document, 'addEventListener');
    render(<PullToRefresh />);
    expect(add.mock.calls.filter(c => String(c[0]).startsWith('touch'))).toHaveLength(4);
    add.mockRestore();
  });
});
