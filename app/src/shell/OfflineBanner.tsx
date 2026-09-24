// OfflineBanner — "אין חיבור. השינויים יישמרו במכשיר." (S-14). Mounted into `#sigma-offline`,
// between the header/page-bar and the page body, so it is on screen the moment `useOnline`
// reads `navigator.onLine === false` on the very first render (Review Focus 4) — no waiting
// for an `offline` event.
//
// Built on the DS `Tag` primitive (`role="warn"` → `--warn-fill`/`--warn-ink`), not a one-off
// `<div>` with inline colors: those tokens ARE redefined under `:root[data-theme=dark]`
// (styles.css `--sigma-warn-ink`/`--s-warn-fill`), so the banner gets a real dark-mode variant
// instead of the same light-mode pair rendered on a dark page (the finding this replaces).
import * as React from 'react';
import { WifiOff } from 'lucide-react';
import { mount } from '@/islands';
import { useOnline, OFFLINE_TEXT } from '@/lib/online';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  // Designer round 3: still boxed inside `body`'s own 12–24px padding (index.html), not truly
  // edge-to-edge — the classic "break out of the padded container" trick (100vw + a negative
  // margin sized off the viewport, not off any specific ancestor's padding value, so it holds
  // at every breakpoint without duplicating body's own padding numbers here).
  return (
    <div
      role="status"
      dir="rtl"
      className="flex items-center justify-center gap-1.5 bg-[var(--warn-fill)] py-1.5 text-[13px] font-semibold text-[var(--warn-ink)]"
      style={{ width: '100vw', marginInlineStart: 'calc(50% - 50vw)', marginInlineEnd: 'calc(50% - 50vw)' }}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      {OFFLINE_TEXT}
    </div>
  );
}

export function mountOfflineBanner(): boolean {
  return mount('sigma-offline', OfflineBanner);
}
