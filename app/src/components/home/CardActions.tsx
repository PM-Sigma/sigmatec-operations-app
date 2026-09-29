// Card quick-action row (spec §3.3, round-9 card buttons, rebuilt safely). One tap from the card straight into the form —
// "סיכום ביקור כבר מלחיצה על קיבוץ". Role-gated: the viewer only gets the read-only timeline.
import { sigma } from '@/bridge';
import { BubbleButton } from '@/components/ui/bubble-button';
import { useLastVisit } from '@/components/home/LastVisits';
import { cardActionsFor } from '@/lib/kibbutzim';
import { visitEditLocked } from '@/lib/visitEdit';

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

export function CardActions({ name, role }: { name: string; role: string }) {
  // NO per-card query/hook on the visit list: the latest visit comes from the ONE lookup Home
  // builds once (LastVisits.tsx) — a context read, O(1) per card.
  const lastVisit = useLastVisit(name);
  if (!cardActionsFor(role).length) return null;
  const locked = lastVisit ? visitEditLocked(lastVisit) : false;
  // 📍 — ruling 19.9: the visit action opens the chapters sheet for every role; legacy form is
  // only the fallback for a browser where the chapters island did not mount.
  const openNew = () => { if (!openChapters(name)) sigma.openVisitQuick(name); };
  const openLastEdit = () => {
    if (!lastVisit || locked) return;
    sigma?.openVisitEditor?.({ kibbutz: name, visitId: lastVisit.id, mode: 'edit' });
  };
  // stopPropagation lives on the BUTTONS only (the card body opens KibbutzDetail through a
  // delegated listener); the row itself is a plain block, so it never swallows the card's tap.
  return (
    <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border pt-2">
      <BubbleButton variant="primary" size="lg" className="w-full"
        onClick={e => { e.stopPropagation(); openNew(); }}>
        ➕ סיכום ביקור חדש
      </BubbleButton>
      {lastVisit && (
        <BubbleButton variant="tonal" size="lg" className="w-full" disabled={locked}
          onClick={e => { e.stopPropagation(); openLastEdit(); }}>
          {locked ? 'הסיכום נעול לעריכה' : '✏️ עריכת הסיכום האחרון'}
        </BubbleButton>
      )}
    </div>
  );
}
