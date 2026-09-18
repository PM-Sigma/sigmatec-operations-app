// The hard gate (spec §7n): an island renders its content only while the sign-in is live.
// One wrapper for every island, so "nothing without a sign-in" is a property of the shell and
// not a check each surface has to remember.
//
// Open for: a live EMS session · the view-only entry (it has no EMS account by design) ·
// `?login=0` on a host allowed to mock (a developer machine or a branch preview).
import * as React from 'react';
import { LoginRequired } from '@/components/LoginRequired';
import { isGateOpen, useEmsGate } from '@/lib/session';

export interface EmsGateProps {
  children: React.ReactNode;
  /** A second line for surfaces where the person needs a more concrete sentence. */
  note?: string;
  className?: string;
}

export function EmsGate({ children, note, className }: EmsGateProps) {
  const state = useEmsGate();
  if (!isGateOpen(state)) return <LoginRequired note={note} className={className} />;
  return <>{children}</>;
}
