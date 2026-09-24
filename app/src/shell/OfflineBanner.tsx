// OfflineBanner — "אין חיבור. השינויים יישמרו במכשיר." (S-14). Mounted into `#sigma-offline`,
// between the header/page-bar and the page body, so it is on screen the moment `useOnline`
// reads `navigator.onLine === false` on the very first render (Review Focus 4) — no waiting
// for an `offline` event.
//
// Colors are `--warning`/`--warning-light` (index.html tokens), which are NOT redefined under
// `:root[data-theme=dark]` — they stay the same cream-on-amber pair in both themes. That is
// deliberate here: a banner that only reads as "amber text on amber-tinted card" in light mode
// and silently drops to near-invisible low-contrast in dark would fail exactly the thing this
// task exists to fix, so it does not lean on --card/--bg at all.
import * as React from 'react';
import { WifiOff } from 'lucide-react';
import { mount } from '@/islands';
import { useOnline, OFFLINE_TEXT } from '@/lib/online';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      dir="rtl"
      className="flex min-h-[40px] items-center gap-2 px-4 py-2 text-[13px] font-semibold"
      style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>{OFFLINE_TEXT}</span>
    </div>
  );
}

export function mountOfflineBanner(): boolean {
  return mount('sigma-offline', OfflineBanner);
}
