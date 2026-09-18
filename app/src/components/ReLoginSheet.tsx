// ONE expiry experience for the whole app (spec §7n). Mounted once, on every page, listening
// for the single `session-expired` event that every 401 funnels into: an EMS call, a supabase-js
// read/write and the legacy REST reads all end up here, debounced, so a screen that fired five
// requests shows ONE sheet and no per-page error toasts.
//
// The sign-in itself stays where it has always been — the legacy gate with its e-mail + code
// flow. This sheet remembers the page, the scroll position and the open draft, hands over, and
// the gate lands the person back on the same screen afterwards.
import * as React from 'react';
import { KeyRound } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { mount } from '@/islands';
import { SESSION_EXPIRED, beginReLogin } from '@/lib/session';

export const RELOGIN_TITLE = 'נדרשת התחברות מחדש';
export const RELOGIN_BODY = 'התחבר שוב ותחזור בדיוק לאותו מקום, עם מה שהתחלת לכתוב.';
export const RELOGIN_CTA = 'התחבר מחדש';

/** A cert link opened by a customer is not a session — a recipient must never see a sign-in. */
function isPublicCertView(): boolean {
  try { return !!(window as any)._certViewMode; } catch { return false; }
}

/** The draft line, only when there really is one waiting. */
function openDraftNote(): string {
  try {
    const d = (window as any).sigma?.visitDraftFor?.();
    if (!d) return '';
    const at = String(d.updated_at || '').slice(11, 16);
    return at ? 'הטיוטה מ-' + at + ' שמורה.' : 'הטיוטה שלך שמורה.';
  } catch { return ''; }
}

export function ReLoginSheet() {
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    const bus = (window as any).sigmaBus as EventTarget | undefined;
    const onExpired = () => {
      if (isPublicCertView()) return;
      setNote(openDraftNote());
      setOpen(true);
    };
    bus?.addEventListener(SESSION_EXPIRED, onExpired);
    // The legacy re-login path (js/src/12-reports.js `emsRequireLogin`) calls this directly,
    // so a 401 on a legacy page opens THIS sheet instead of the old modal.
    (window as any).sigmaOpenReLogin = onExpired;
    return () => {
      bus?.removeEventListener(SESSION_EXPIRED, onExpired);
      if ((window as any).sigmaOpenReLogin === onExpired) delete (window as any).sigmaOpenReLogin;
    };
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        data-sigma-relogin
        className="flex h-[88vh] max-h-[88vh] flex-col justify-center gap-6 overflow-y-auto"
      >
        <SheetHeader className="items-center text-center">
          <span
            className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-hidden
          >
            <KeyRound className="h-6 w-6" />
          </span>
          <SheetTitle className="text-[22px] font-extrabold tracking-tight">{RELOGIN_TITLE}</SheetTitle>
          <SheetDescription className="text-[13px]">
            {RELOGIN_BODY}
            {note ? ' ' + note : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="mx-auto w-full max-w-sm">
          <Button
            type="button"
            size="lg"
            className="w-full text-[15px] font-extrabold"
            onClick={() => { setOpen(false); beginReLogin(); }}
          >
            <KeyRound className="me-1.5 h-4 w-4" aria-hidden />
            {RELOGIN_CTA}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function mountReLoginSheet(): boolean {
  return mount('sigma-relogin', ReLoginSheet);
}
