// D-U1 — תחומים view: "חדש השבוע" first (collapsible, hidden when empty), then one SectionBlock
// per domain (D-L2 `groupByDomain`), title = domain (or "ללא אפיון"), count Tag, caption tier
// sub-headers and ListRows.
import * as React from 'react';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { directParentLabel, PRIO_LABEL, type DomainGroup } from '@/lib/devMeeting';
import { STAGE_LABEL, stageOf, type DevCard } from '@/lib/sprintPrep';

/** `d.m` — no leading zeros, the format the meeting summary already uses. */
function fmtDayMonth(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

export interface SelectProps { selectMode?: boolean; selected?: Set<number>; onToggle?: (n: number) => void }

function CardRow({ card, onOpen, selectMode, selected, onToggle, testidPrefix = 'dev-card-row-' }: {
  card: DevCard; onOpen: (c: DevCard) => void; testidPrefix?: string;
} & SelectProps) {
  const parentLabel = directParentLabel(card);
  const bits = [STAGE_LABEL[stageOf(card)], card.assignee, parentLabel, fmtDayMonth(card.updatedAt) && ('עודכן ' + fmtDayMonth(card.updatedAt))]
    .filter(Boolean);
  const isSel = !!selected?.has(card.number);
  return (
    <ListRow
      data-testid={testidPrefix + card.number}
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
      meta={<bdi>{bits.join(' · ')}</bdi>}
      onClick={() => (selectMode ? onToggle?.(card.number) : onOpen(card))}
    />
  );
}

export function NewThisWeekBlock({ cards, onOpen, ...sel }: { cards: DevCard[]; onOpen: (c: DevCard) => void } & SelectProps) {
  if (!cards.length) return null;
  return (
    <div data-testid="dev-new-this-week">
      <SectionBlock title="חדש השבוע" count={cards.length} collapsible>
        {cards.map(c => <CardRow key={c.number} card={c} onOpen={onOpen} testidPrefix="dev-card-row-new-" {...sel} />)}
      </SectionBlock>
    </div>
  );
}

function TierGroup({ tier, onOpen, ...sel }: { tier: DomainGroup['tiers'][number]; onOpen: (c: DevCard) => void } & SelectProps) {
  return (
    <div data-testid={'dev-tier-' + tier.tier}>
      <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground first:pt-0">
        {PRIO_LABEL[tier.tier]}
      </p>
      {tier.cards.map(c => <CardRow key={c.number} card={c} onOpen={onOpen} {...sel} />)}
    </div>
  );
}

export function DomainSection({ group, onOpen, ...sel }: { group: DomainGroup; onOpen: (c: DevCard) => void } & SelectProps) {
  const title = group.domain?.title ?? 'ללא אפיון';
  return (
    <div data-testid={'dev-domain-' + (group.domain?.number ?? 'none')}>
      <SectionBlock title={<bdi>{title}</bdi>} count={group.count}>
        {group.tiers.map(t => <TierGroup key={t.tier} tier={t} onOpen={onOpen} {...sel} />)}
      </SectionBlock>
    </div>
  );
}

export function GroupedList({ groups, newThisWeek, onOpen, ...sel }: {
  groups: DomainGroup[]; newThisWeek: DevCard[]; onOpen: (c: DevCard) => void;
} & SelectProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="dev-grouped-list">
      <NewThisWeekBlock cards={newThisWeek} onOpen={onOpen} {...sel} />
      {groups.map(g => <DomainSection key={g.domain?.number ?? 'none'} group={g} onOpen={onOpen} {...sel} />)}
    </div>
  );
}
