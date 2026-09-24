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
import { Tag } from '@/components/ui/chip';
import { useOnline, OFFLINE_TEXT } from '@/lib/online';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" dir="rtl" className="flex justify-center px-4 py-2">
      <Tag role="warn" dot className="h-9 gap-2 px-3 text-[13px] font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          {OFFLINE_TEXT}
        </span>
      </Tag>
    </div>
  );
}

export function mountOfflineBanner(): boolean {
  return mount('sigma-offline', OfflineBanner);
}
