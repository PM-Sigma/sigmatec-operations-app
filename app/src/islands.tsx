// Island mounting. Each island is an independent createRoot into a placeholder that
// index.html reserves; a missing placeholder is simply skipped, so the legacy page keeps
// working even if a task's markup is not there yet.
//
// mount() is deliberately BARE — no providers. An island that reads data wraps its own tree
// in <SigmaProviders> (app/src/lib/query.ts), which keeps TanStack and Supabase out of the
// bundle's boot path for islands that need neither (nav, toaster).
import { Component, StrictMode, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { trackMount } from '@/lib/track';

/**
 * A crashed island must not take the page with it (22.9, K4): the tree under it renders a
 * short "משהו נשבר" with a one-tap report (the same crash card the legacy guard shows), and
 * every other island keeps working.
 */
class IslandBoundary extends Component<{ id: string; children: ReactNode }, { err: unknown }> {
  state = { err: null as unknown };
  static getDerivedStateFromError(err: unknown) { return { err }; }
  componentDidCatch(err: unknown, info: ErrorInfo) {
    try { (window as any).sigmaCrash?.(err, this.props.id.replace(/^sigma-/, '')); } catch { /* no guard */ }
    console.error('[sigma] island crashed: ' + this.props.id, err, info?.componentStack);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div role="alert" data-testid="island-crashed" className="rounded-xl border border-destructive/40 bg-card px-3 py-2 text-[13px]">
        <b>משהו נשבר כאן.</b>{' '}
        <button type="button" className="underline" onClick={() => this.setState({ err: null })}>נסה שוב</button>
      </div>
    );
  }
}

export function mount(id: string, Component: ComponentType): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  // Mounting twice puts TWO React roots in one container, and both render — the island's
  // whole tree appears duplicated. The marker lives on the DOM, not in a module-scoped Set,
  // deliberately: index.html loads ui/sigma.js with a `?v=` cache-bust stamp while the lazy
  // chunks import it bare, so the browser evaluates the entry TWICE and a module-scoped
  // guard would not be shared between the two copies. (Seen for real: #sigma-modal-meetings
  // rendered its panel twice.)
  if (el.dataset.sigmaMounted === '1') return false;
  el.dataset.sigmaMounted = '1';
  el.classList.add('sigma-root');
  el.setAttribute('dir', 'rtl');          // RTL is a release gate (spec §6): every island root declares it
  trackMount(id);                         // 📈 שימוש (spec §7j) — one event per island, per mount
  createRoot(el).render(
    <StrictMode>
      <IslandBoundary id={id}>
        <Component />
      </IslandBoundary>
    </StrictMode>,
  );
  return true;
}
