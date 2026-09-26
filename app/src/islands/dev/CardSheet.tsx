// D-U1 — the card detail sheet: #, state, priority (a SegmentedControl of the 4 tiers + none,
// optimistic with revert), stage ("העברה לשלב" → setStatus, replacing drag), assignee,
// created / updated, day-stamps (stampsFor), body, "פתיחה ב-GitHub".
// D-U review round 2 (Opus): priority was ungated, so anyone could open a write the server
// would 401 for. Both controls now share the same `canMove` gate (canDragOrMove /
// canWriteGithub, lib/devBoard.ts) — עידן/עמיחי/מתניה, the same roster the `github` Edge
// Function's own gate.js enforces server-side.
import * as React from 'react';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tag, FilterChip } from '@/components/ui/chip';
import { setPriority as apiSetPriority, setStatus as apiSetStatus, STAGE_TARGET } from '@/lib/devBoard';
import { PRIO_LABEL, priorityTier, type PrioTier } from '@/lib/devMeeting';
import { STAGE_LABEL, stageOf, type DevCard, type DevStage } from '@/lib/sprintPrep';
import type { StatusLog } from '@/lib/devStatusLog';
import { stampsFor } from '@/lib/devStatusLog';

const TIER_OPTIONS: Array<{ value: PrioTier; label: string }> =
  (['crit', 'high', 'med', 'low', 'none'] as PrioTier[]).map(t => ({ value: t, label: PRIO_LABEL[t] }));

const MOVE_STAGES: DevStage[] = ['backlog', 'scope', 'ready', 'prog', 'review', 'committed'];

/** The Priority option text this app writes for a tier (the free-form field, round-trip safe). */
const TIER_TO_TEXT: Record<PrioTier, string> = {
  crit: 'קריטי', high: 'גבוהה', med: 'בינונית', low: 'נמוכה', none: '',
};

export function CardSheet({ card, statusLog, canMove, onOpenChange, onChanged }: {
  card: DevCard | null;
  statusLog: StatusLog;
  canMove: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [tier, setTier] = React.useState<PrioTier>(() => (card ? priorityTier(card) : 'none'));
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (card) setTier(priorityTier(card)); }, [card?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card) return null;
  const stamps = stampsFor(statusLog, card.number);

  const changeTier = async (next: PrioTier) => {
    const prev = tier;
    setTier(next);   // optimistic
    setBusy(true);
    try {
      await apiSetPriority([card.number], TIER_TO_TEXT[next]);
      toast.success('העדיפות עודכנה');
      onChanged();
    } catch (e: any) {
      setTier(prev);   // revert
      toast.error(e?.message || 'לא הצלחתי לעדכן עדיפות');
    } finally { setBusy(false); }
  };

  const moveTo = async (stage: DevStage) => {
    setBusy(true);
    try {
      await apiSetStatus([card.number], STAGE_TARGET[stage]);
      toast.success('הכרטיס הועבר ל' + STAGE_LABEL[stage]);
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'לא הצלחתי להעביר שלב');
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={!!card} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="dev-card-sheet" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2">
            <bdi>#{card.number}</bdi>
            <Tag role={card.state === 'closed' ? 'neutral' : 'ok'}>{card.state === 'closed' ? 'סגור' : 'פתוח'}</Tag>
          </SheetTitle>
          <SheetDescription><bdi>{card.title}</bdi></SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 py-3">
          <section>
            <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">עדיפות</p>
            {canMove ? (
              // Wrapping FilterChips, not a SegmentedControl — 5 tiers truncated
              // ("גבו…"/"בינו…") in one equal-width row at 360px (designer round-2 finding);
              // chips wrap onto a second row instead of shrinking text.
              <div className="flex flex-wrap gap-1.5" data-testid="dev-priority-chips">
                {TIER_OPTIONS.map(o => (
                  <FilterChip key={o.value} selected={tier === o.value} onClick={() => void changeTier(o.value)}>
                    {o.label}
                  </FilterChip>
                ))}
              </div>
            ) : (
              <Tag role="neutral" data-testid="dev-priority-readonly">{PRIO_LABEL[tier]}</Tag>
            )}
          </section>

          {canMove && (
            <section>
              <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">העברה לשלב</p>
              <div className="flex flex-wrap gap-1.5">
                {MOVE_STAGES.filter(s => s !== stageOf(card)).map(s => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    data-testid={'dev-move-' + s}
                    onClick={() => void moveTo(s)}
                    className="min-h-9 rounded-xl border border-border px-3 text-[13px] font-semibold text-foreground disabled:opacity-50"
                  >
                    {STAGE_LABEL[s]}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            {card.assignee && <p>אחראי: <bdi className="text-foreground">{card.assignee}</bdi></p>}
            {card.createdAt && <p>נפתח: <bdi className="text-foreground">{new Date(card.createdAt).toLocaleDateString('he-IL')}</bdi></p>}
            {card.updatedAt && <p>עודכן: <bdi className="text-foreground">{new Date(card.updatedAt).toLocaleDateString('he-IL')}</bdi></p>}
          </section>

          {stamps.length > 0 && (
            <section>
              <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">היסטוריית שלבים</p>
              <ul className="flex flex-col gap-0.5 text-[13px] text-foreground">
                {stamps.map(s => <li key={s.stage}><bdi>{STAGE_LABEL[s.stage]} — {s.day}</bdi></li>)}
              </ul>
            </section>
          )}

          <section>
            <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">תיאור</p>
            <p className="whitespace-pre-wrap text-[14px] leading-snug text-foreground">
              <bdi>{String(card.body || '').trim() || 'אין תיאור'}</bdi>
            </p>
          </section>

          {card.url && (
            <a
              href={card.url}
              target="_blank"
              rel="noreferrer"
              data-testid="dev-card-open-github"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-[14px] font-semibold text-foreground"
            >
              פתיחה ב-GitHub <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
