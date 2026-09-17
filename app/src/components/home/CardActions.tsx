// Card quick-action row (spec §3.3). One tap from the card straight into the form —
// "סיכום ביקור כבר מלחיצה על קיבוץ". Role-gated: the viewer only gets the read-only timeline.
import { CalendarDays, MapPin, Truck } from 'lucide-react';
import { sigma, sigmaBus } from '@/bridge';
import { cardActionsFor, type CardAction } from '@/lib/kibbutzim';

const LABEL: Record<CardAction, string> = {
  visit: 'סיכום ביקור',
  cert: 'תעודת משלוח',
  meetings: 'ישיבות',
};
const ICON = { visit: MapPin, cert: Truck, meetings: CalendarDays } as const;

/**
 * 🚚 opens the visit form first and only then asks for the certificate, so the cert is
 * linked to that visit (spec §5 cert rules). The visit form is legacy DOM, so we wait for
 * the bridge's one-shot `visit-form-open` event rather than guessing at a timeout.
 */
function certAfterVisitForm(name: string) {
  const once = () => {
    sigmaBus.removeEventListener('visit-form-open', once);
    clearTimeout(timer);
    sigma.certFromVisitForm();
  };
  const timer = setTimeout(() => sigmaBus.removeEventListener('visit-form-open', once), 120_000);
  sigmaBus.addEventListener('visit-form-open', once);
  sigma.openVisitQuick(name);
}

export function CardActions({ name, role }: { name: string; role: string }) {
  const actions = cardActionsFor(role);
  const run = (a: CardAction) => {
    if (a === 'visit') sigma.openVisitQuick(name);
    else if (a === 'cert') certAfterVisitForm(name);
    else sigma.openKibbutzModal(name, 'meetings');
  };
  return (
    <div className="mt-2.5 flex gap-1.5 border-t border-border pt-2">
      {actions.map(a => {
        const Icon = ICON[a];
        return (
          <button
            key={a}
            type="button"
            // The card body itself opens the modal via a delegated legacy listener on
            // document — stopPropagation keeps a quick action from also opening it.
            onClick={e => { e.stopPropagation(); run(a); }}
            className={
              'flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition-transform active:scale-[.97] ' +
              (a === 'visit'
                ? 'border-transparent bg-primary/10 text-foreground'
                : 'border-border bg-muted text-foreground')
            }
          >
            <Icon className="h-4 w-4" />
            <span>{LABEL[a]}</span>
          </button>
        );
      })}
    </div>
  );
}
