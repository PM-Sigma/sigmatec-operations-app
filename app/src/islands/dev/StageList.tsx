// D-U1 — שלבים view: one SectionBlock per stage (port of the legacy board columns/rail). The
// four "full" working stages (backlog/ready/prog/review) start expanded — the old board's four
// visible columns — the rest (fields/scope/committed) start collapsed, exactly like the old
// minimized rail. From 768px the four full stages sit as a 4-column grid (spec).
import * as React from 'react';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { cardsInStage, STAGE_LABEL, type DevCard, type DevStage } from '@/lib/sprintPrep';
import { directParentLabel } from '@/lib/devMeeting';
import type { SelectProps } from '@/islands/dev/GroupedList';

const STAGE_ORDER: DevStage[] = ['fields', 'backlog', 'scope', 'ready', 'prog', 'review', 'committed'];
const FULL_STAGES = new Set<DevStage>(['backlog', 'ready', 'prog', 'review']);

function StageRow({ card, onOpen, selectMode, selected, onToggle }: { card: DevCard; onOpen: (c: DevCard) => void } & SelectProps) {
  const parentLabel = directParentLabel(card);
  const isSel = !!selected?.has(card.number);
  return (
    <ListRow
      data-testid={'dev-card-row-' + card.number}
      leading={selectMode ? (
        <input
          type="checkbox"
          aria-label={'בחירת #' + card.number}
          data-testid={'dev-select-' + card.number}
          checked={isSel}
          onChange={() => onToggle?.(card.number)}
          onClick={e => e.stopPropagation()}
          className="h-5 w-5"
        />
      ) : undefined}
      title={<bdi>#{card.number} {card.title}</bdi>}
      meta={<bdi>{[parentLabel, card.assignee].filter(Boolean).join(' · ')}</bdi>}
      onClick={() => (selectMode ? onToggle?.(card.number) : onOpen(card))}
    />
  );
}

export function StageList({ cards, onOpen, ...sel }: { cards: DevCard[]; onOpen: (c: DevCard) => void } & SelectProps) {
  const byStage = React.useMemo(
    () => STAGE_ORDER.map(s => ({ stage: s, cards: cardsInStage(cards, s) })).filter(x => x.stage !== 'fields' || x.cards.length),
    [cards],
  );
  const full = byStage.filter(x => FULL_STAGES.has(x.stage));
  const rest = byStage.filter(x => !FULL_STAGES.has(x.stage));

  const Block = ({ stage, cards: sc }: { stage: DevStage; cards: DevCard[] }) => (
    <div data-testid={'dev-stage-' + stage}>
      <SectionBlock title={STAGE_LABEL[stage]} count={sc.length} collapsible defaultOpen={FULL_STAGES.has(stage)}>
        {sc.map(c => <StageRow key={c.number} card={c} onOpen={onOpen} {...sel} />)}
      </SectionBlock>
    </div>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="dev-stage-list">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {full.map(x => <Block key={x.stage} stage={x.stage} cards={x.cards} />)}
      </div>
      {rest.map(x => <Block key={x.stage} stage={x.stage} cards={x.cards} />)}
    </div>
  );
}
