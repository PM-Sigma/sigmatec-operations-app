// Island mounting. Each island is an independent createRoot into a placeholder that
// index.html reserves; a missing placeholder is simply skipped, so the legacy page keeps
// working even if a task's markup is not there yet.
import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister } from '@/lib/query';

/** Everything an island needs: query cache + RTL + the `.sigma-root` style scope. */
function Island({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {children}
    </PersistQueryClientProvider>
  );
}

export function mount(id: string, Component: ComponentType): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.classList.add('sigma-root');
  el.setAttribute('dir', 'rtl');          // RTL is a release gate (spec §6): every island root declares it
  createRoot(el).render(
    <StrictMode>
      <Island><Component /></Island>
    </StrictMode>,
  );
  return true;
}

/** Islands that need no query cache (the toaster) — cheaper and independent of the network. */
export function mountBare(id: string, Component: ComponentType): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.classList.add('sigma-root');
  el.setAttribute('dir', 'rtl');
  createRoot(el).render(<Component />);
  return true;
}

export { QueryClientProvider };
