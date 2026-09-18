// Island mounting. Each island is an independent createRoot into a placeholder that
// index.html reserves; a missing placeholder is simply skipped, so the legacy page keeps
// working even if a task's markup is not there yet.
//
// mount() is deliberately BARE — no providers. An island that reads data wraps its own tree
// in <SigmaProviders> (app/src/lib/query.ts), which keeps TanStack and Supabase out of the
// bundle's boot path for islands that need neither (nav, toaster).
import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';

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
  createRoot(el).render(
    <StrictMode>
      <Component />
    </StrictMode>,
  );
  return true;
}
