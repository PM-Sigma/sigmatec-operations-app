// The hard gate (spec §7n + 2026-09-23 ems-session): an island renders its content only while
// the sign-in is live. One wrapper for every island, so "nothing without a sign-in" is a
// property of the shell and not a check each surface has to remember.
//
// Open for: a live EMS session · the view-only entry (it has no EMS account by design) ·
// `?login=0` on a host allowed to mock (a developer machine or a branch preview).
//
// Closed for a staff user whose session lapsed → the app FREEZES: the one blocking re-login
// (ReLoginSheet) comes up and the island keeps an empty frame underneath. There is no
// per-surface "connect" card any more (עידן, 23.9). Never signed in → the login gate owns the
// screen, so the island renders nothing. The viewer keeps the small sign-in card (PIN entry).
import * as React from 'react';
import { LoginRequired } from '@/components/LoginRequired';
import { useCurrentUser } from '@/bridge';
import { isGateOpen, notifySessionExpired, shouldFreeze, useEmsGate } from '@/lib/session';

export interface EmsGateProps {
  children: React.ReactNode;
  /** A second line for surfaces where the person needs a more concrete sentence (viewer only). */
  note?: string;
  className?: string;
}

export function EmsGate({ children, note, className }: EmsGateProps) {
  const state = useEmsGate();
  const { role, isViewer } = useCurrentUser();
  const freeze = shouldFreeze(state, isViewer ? 'viewer' : String(role || ''));
  React.useEffect(() => { if (freeze) notifySessionExpired('gate-expired'); }, [freeze]);
  if (isGateOpen(state)) return <>{children}</>;
  if (freeze || state === 'locked') return <div data-sigma-frozen aria-hidden className={className} />;
  return <LoginRequired note={note} className={className} />;
}
