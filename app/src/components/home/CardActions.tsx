// Card quick-action row (spec §3.3, round-9 "card visit button" pass). Two full-width bubbles —
// "➕ סיכום ביקור חדש" always, plus "✏️ עריכת הסיכום האחרון" once the kibbutz has a filed visit —
// straight from the closed card, no need to open the kibbutz sheet first (עידן 27.9: "no
// dedicated button to edit, or to create a new visit"). Role-gated: the viewer gets no row at all.
import { sigma } from '@/bridge';
import { BubbleButton } from '@/components/ui/bubble-button';
import { cardActionsFor } from '@/lib/kibbutzim';
import { latestVisitFor } from '@/lib/kibbutzDetail';
import { useKibbutzVisits } from '@/lib/kibbutzVisits';
import { visitEditLocked } from '@/lib/visitEdit';

const EDIT_LOCK_TITLE = 'הסיכום נעול לעריכה';

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
  const canAct = cardActionsFor(role).length > 0;
  const visits = useKibbutzVisits(name);
  const lastVisit = latestVisitFor(visits, name);
  if (!canAct) return null;

  const openNew = () => {
    // ruling 19.9: the card's visit action opens the chapters sheet for every role, same as
    // briefing/gaps/nudge (one visit path). Legacy form stays only as the fallback for a
    // browser where the chapters island did not mount.
    if (!openChapters(name)) sigma.openVisitQuick(name);
  };
  const locked = lastVisit ? visitEditLocked(lastVisit) : false;
  const openLastEdit = () => {
    if (!lastVisit || locked) return;
    sigma?.openVisitEditor?.({ kibbutz: name, visitId: lastVisit.id, mode: 'edit' });
  };

  return (
    <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border pt-2">
      <BubbleButton
        variant="primary"
        size="lg"
        // The card body itself opens the modal via a delegated legacy listener on document —
        // stopPropagation keeps this quick action from also opening it.
        onClick={e => { e.stopPropagation(); openNew(); }}
      >
        ➕ סיכום ביקור חדש
      </BubbleButton>
      {lastVisit && (
        <BubbleButton
          variant="tonal"
          size="lg"
          disabled={locked}
          title={locked ? EDIT_LOCK_TITLE : undefined}
          onClick={e => { e.stopPropagation(); openLastEdit(); }}
        >
          ✏️ עריכת הסיכום האחרון
        </BubbleButton>
      )}
    </div>
  );
}
