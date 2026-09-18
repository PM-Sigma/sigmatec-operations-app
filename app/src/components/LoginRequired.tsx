// The one thing an island renders instead of its content when there is no live sign-in
// (spec §7n). Compact on purpose: it replaces a card, a panel or a sheet body, so it must
// read as "one step to take", not as an error screen.
//
// Copy: one sentence to the person about what he needs to do next. Nothing about the
// mechanics, nothing about who else sees what.
import * as React from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { beginReLogin } from '@/lib/session';

export interface LoginRequiredProps {
  /** Shown instead of the default line when a surface needs a more concrete sentence. */
  note?: string;
  className?: string;
}

export const LOGIN_REQUIRED_TITLE = 'כדי לראות את זה צריך להתחבר ל-EMS';

export function LoginRequired({ note, className }: LoginRequiredProps) {
  return (
    <div
      data-sigma-login-required
      role="status"
      className={
        'mx-auto my-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border '
        + 'bg-card p-6 text-center shadow-sm ' + (className || '')
      }
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="h-5 w-5" aria-hidden />
      </span>
      <div className="text-[15px] font-extrabold leading-snug">{LOGIN_REQUIRED_TITLE}</div>
      {note ? <div className="text-[13px] text-muted-foreground">{note}</div> : null}
      <Button type="button" className="w-full" onClick={() => beginReLogin()}>
        <KeyRound className="me-1.5 h-4 w-4" aria-hidden />
        התחבר
      </Button>
    </div>
  );
}
