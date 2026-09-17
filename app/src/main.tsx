// ui/sigma.js entry — mounts the Task 0 islands (nav + toaster) and hands Sonner's toast
// back to the legacy bridge. Later tasks add #sigma-home / #sigma-field / #sigma-feedback /
// #sigma-import here.
import './styles.css';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Nav } from '@/components/Nav';
import { mount } from '@/islands';
import { applyTheme, storedTheme } from '@/lib/theme';

function SigmaToaster() {
  return <Toaster richColors position="top-center" dir="rtl" closeButton />;
}

function boot() {
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
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
