// Card quick-action row (spec §3.3). One tap from the card straight into the form —
// "סיכום ביקור כבר מלחיצה על קיבוץ". Role-gated: the viewer only gets the read-only timeline.
import { CalendarDays, MapPin, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { sigma, sigmaBus } from '@/bridge';
import { cardActionsFor, type CardAction } from '@/lib/kibbutzim';
import { todayISO } from '@/lib/visitDrafts';

/**
 * Open the §7p chapters sheet if it is mounted, same window-global pattern as Gaps.tsx —
 * no static import of Field.tsx (a lazy island), so the card's own chunk stays small.
 */
function openChapters(kibbutz: string): boolean {
  const api = (window as any).sigmaVisitChapters;
  if (!api?.open) return false;
  api.open(kibbutz);
  return true;
}

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
export function certAfterVisitForm(name: string) {
  // §5.1c: a certificate must hang off a visit summary, so 🚚 with nothing started says so
  // in one sentence and opens the form. With a draft in hand there is nothing to announce —
  // the form comes back with his own words in it and the certificate opens on top.
  let hasDraft = false;
  try {
    const me = sigma?.getCurrentUser?.() || '';
    hasDraft = !!sigma?.visitDraftFor?.(name, me, todayISO());
  } catch { hasDraft = false; }
  if (!hasDraft) toast.info('נדרש קודם סיכום ביקור — פותח את הטופס');

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
    // 📍 — ruling 19.9: the card's visit action opens the chapters sheet for every role,
    // same as briefing/gaps/nudge (one visit path). Legacy form stays only as the fallback
    // for a browser where the chapters island did not mount.
    if (a === 'visit') { if (!openChapters(name)) sigma.openVisitQuick(name); }
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
