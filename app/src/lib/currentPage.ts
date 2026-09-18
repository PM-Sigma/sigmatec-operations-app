// Which legacy page is on screen. The legacy shell swaps pages by toggling `display` and
// remembering the name in `window._currentPage`; there is no event for it, so React reads that
// global on the cheapest reliable signals — a click anywhere, and a hash change.
//
// Shared by the bottom nav (which tab is active) and the header (which ➕ to offer), so the
// two can never disagree about where the person is.
import * as React from 'react';
import { useSigmaEvent, type SigmaPage } from '@/bridge';

export function currentPage(): SigmaPage {
  try { return (((window as any)._currentPage as SigmaPage) || 'kibbutz'); }
  catch { return 'kibbutz'; }
}

export function useCurrentPage(): SigmaPage {
  const [page, setPage] = React.useState<SigmaPage>(currentPage);
  React.useEffect(() => {
    const on = () => setPage(currentPage());
    // Capture phase, so we read AFTER the legacy handler has run on the same click… which it
    // has not yet, hence the microtask. Re-reading a global is free, so this is cheaper than
    // wrapping showPage a second time (the bridge already wraps it for analytics).
    const onClick = () => setTimeout(on, 0);
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', on);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('hashchange', on); };
  }, []);
  useSigmaEvent('user-changed', () => setPage(currentPage()));
  return page;
}
