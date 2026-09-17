// ui/sigma.js entry — mounts the Task 0 islands (nav + toaster) and hands Sonner's toast
// back to the legacy bridge. Later tasks add #sigma-home / #sigma-field / #sigma-feedback /
// #sigma-import here.
import './styles.css';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Nav } from '@/components/Nav';
import { mount, mountBare } from '@/islands';
import { applyTheme, storedTheme } from '@/lib/theme';
import { adoptLegacyBridgePass } from '@/lib/supabase';

function SigmaToaster() {
  return <Toaster richColors position="top-center" dir="rtl" closeButton />;
}

function boot() {
  // Re-apply the stored theme through the full path (the <head> snippet only set the class
  // before first paint; this also syncs theme-color and announces 'theme-changed').
  applyTheme(storedTheme() ?? 'system');

  mountBare('sigma-toaster', SigmaToaster);
  mount('sigma-nav', Nav);

  // Sonner replaces the legacy #toast strip for everything that goes through the bridge.
  const sigma = (window as any).sigma;
  if (sigma) sigma.toast = (msg: string, opts?: Record<string, unknown>) => toast(msg, opts as any);

  adoptLegacyBridgePass();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
