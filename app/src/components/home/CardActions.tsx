// Card quick-action row (spec §3.3). One tap from the card straight into the form —
// "סיכום ביקור כבר מלחיצה על קיבוץ". Role-gated: the viewer only gets the read-only timeline.
import { MapPin } from 'lucide-react';
import { sigma } from '@/bridge';
import { cardActionsFor, type CardAction } from '@/lib/kibbutzim';

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

const LABEL: Record<CardAction, string> = { visit: 'סיכום ביקור' };
const ICON = { visit: MapPin } as const;

export function CardActions({ name, role }: { name: string; role: string }) {
  const actions = cardActionsFor(role);
  const run = (a: CardAction) => {
    // 📍 — ruling 19.9: the card's visit action opens the chapters sheet for every role,
    // same as briefing/gaps/nudge (one visit path). Legacy form stays only as the fallback
    // for a browser where the chapters island did not mount.
    if (a === 'visit') { if (!openChapters(name)) sigma.openVisitQuick(name); }
  };
  if (!actions.length) return null;
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
              'border-transparent bg-primary/10 text-foreground'
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
