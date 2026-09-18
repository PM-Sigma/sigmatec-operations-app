// ui/sigma.js entry — mounts the Task 0 islands (nav + toaster) and hands Sonner's toast
// back to the legacy bridge. Later tasks add #sigma-home / #sigma-field / #sigma-feedback /
// #sigma-import here.
import './styles.css';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Nav } from '@/components/Nav';
import { mount } from '@/islands';
import { applyTheme, storedTheme } from '@/lib/theme';

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

  // Both are provider-free islands — neither reads data, so neither pulls TanStack or supabase-js in.
  mount('sigma-toaster', SigmaToaster);
  mount('sigma-nav', Nav);

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

  // 🗓 Meeting notes (Task 2): the modal tab + the admin-only import sheet. Same lazy-chunk
  // reasoning as the home island — both read data, and the modal tab is only ever opened
  // from a card. They are separate roots so one failing never takes the other down.
  if (document.getElementById('sigma-modal-meetings')) {
    import('@/islands/ModalMeetings')
      .then(m => m.mountModalMeetings())
      .catch(e => console.warn('[sigma] meetings tab island failed', e));
  }
  if (document.getElementById('sigma-import')) {
    import('@/islands/ImportNotes')
      .then(m => m.mountImportNotes())
      .catch(e => console.warn('[sigma] import island failed', e));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
