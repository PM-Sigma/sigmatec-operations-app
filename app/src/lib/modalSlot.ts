// The kibbutz modal is opened and closed by js/src/10-activity.js, which only ever sets
// `data-kibbutz` on the React slots inside it. An island in that modal therefore keeps ONE
// root for the whole session and reads the kibbutz off its own slot instead of mounting and
// unmounting per open.
//
// Extracted from islands/ModalMeetings.tsx when Task 23 added a second slot
// (#sigma-burns-modal) with exactly the same contract — two copies of a MutationObserver
// that must agree is one copy too many.
import { useEffect, useState } from 'react';

/** The kibbutz the legacy modal is currently showing, as an attribute on `slotId`. */
export function useModalKibbutz(slotId: string): string {
  const [name, setName] = useState('');
  useEffect(() => {
    const el = document.getElementById(slotId);
    if (!el) return;
    const read = () => setName(el.getAttribute('data-kibbutz') || '');
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ['data-kibbutz'] });
    return () => obs.disconnect();
  }, [slotId]);
  return name;
}
