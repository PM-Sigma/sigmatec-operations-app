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
  // Designer re-review: a centred pill (Tag) read as a floating chip rather than a system
  // banner, and its dot duplicated the WifiOff icon's own "no connection" meaning. A slim,
  // full-width strip directly under the header — the same warn tokens, no dot, no pill shape —
  // matches how the version-check "עלתה גרסה חדשה" bar/other system banners sit against the
  // page instead of floating over it.
  return (
    <div
      role="status"
      dir="rtl"
      className="flex w-full items-center justify-center gap-1.5 bg-[var(--warn-fill)] px-4 py-1.5 text-[13px] font-semibold text-[var(--warn-ink)]"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      {OFFLINE_TEXT}
    </div>
  );
}

export function mountOfflineBanner(): boolean {
  return mount('sigma-offline', OfflineBanner);
}
