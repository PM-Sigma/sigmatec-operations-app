// "A tap anywhere else, or Escape, closes it" — written twice, identically, in UserChip and
// in MeetingNotes (task 31 audit D, F14 ⑩). Both used capture-phase mousedown + touchstart so
// a menu closes before the thing underneath it reacts, and both only listened while open.
// One copy now, with that contract in one place.
import * as React from 'react';

/**
 * @param active  listen only while this is true — a closed menu costs nothing
 * @param ref     the element a tap INSIDE does not count as "away"
 * @param onAway  called on an outside tap or on Escape
 */
export function useClickAway(
  active: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onAway: () => void,
): void {
  // Read through a ref so a fresh closure each render does not re-bind the listeners.
  const cb = React.useRef(onAway);
  cb.current = onAway;

  React.useEffect(() => {
    if (!active) return;
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) cb.current(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cb.current(); };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('touchstart', away, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('touchstart', away, true);
      document.removeEventListener('keydown', esc);
    };
  }, [active, ref]);
}
