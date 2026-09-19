// One kibbutz card. The React tree owns the name row, the notes and the EMS-tasks widget (in
// that order); everything else (last visit, customer code, site warnings) is still appended by
// the LEGACY decorating passes, which is why the DOM contract below is load-bearing:
//   .kibbutz[data-name][data-section][data-marketing]  +  a direct child .kibbutz-name-row
// (01-data.js / 10-activity.js query exactly that and insert after the name row; the on-card
// EMS-tasks widget itself moved to React in task-3-brief — see EmsTasks.tsx).
// No status/flow badges — spec §2: "A card shows only: name · energy badge · 🤝 tag".
import { motion, useReducedMotion } from 'motion/react';
import { useVisitDraft } from '@/lib/visitDrafts';
import { CardActions } from '@/components/home/CardActions';
import { EmsTasks } from '@/components/home/EmsTasks';
import { MeetingNotes } from '@/components/home/MeetingNotes';
import { BurnChip } from '@/components/home/Burns';
import { energyText, labelOf, sectionOf, isSubsite, type KibbutzRow } from '@/lib/kibbutzim';

export function KibbutzCard({
  row, role, highlight, onEdit, canEdit, index = 0,
}: {
  row: KibbutzRow;
  role: string;
  highlight: boolean;
  canEdit: boolean;
  onEdit: (row: KibbutzRow) => void;
  /** Position in the section — entering cards stagger 25 ms each (spec §6 motion budget). */
  index?: number;
}) {
  const reduce = useReducedMotion();
  const section = sectionOf(row);
  const sub = isSubsite(row);
  // §5.1c: an open draft is visible state — the person sees that his own typing is waiting
  // for him, and the gaps list counts it as "started, not filed" rather than as a miss.
  const draft = useVisitDraft(row.name);

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: 6, transition: { duration: 0.16 } }}
      transition={{ duration: 0.22, ease: 'easeOut', delay: reduce ? 0 : Math.min(index, 12) * 0.025 }}
      // `kibbutz` + the section class are the legacy hooks (selectors + the delegated
      // click handler in 10-activity.js that opens the kibbutz modal); the Tailwind
      // utilities that follow win the cascade (important: '.sigma-root' adds specificity).
      className={
        'kibbutz ' + section + ' relative m-0 rounded-lg border border-border bg-card p-3 pb-2.5 shadow-none ' +
        'transition-transform active:scale-[.985] ' +
        (section === 'new' ? 'border-s-[3px] border-s-[color:var(--sigma-warn)] ' : 'border-s-[3px] border-s-[color:var(--brand-2)] ') +
        (highlight ? 'sigma-beam ' : '')
      }
      // ---- legacy decorator contract ----
      data-name={row.name}
      data-section={section}
      data-marketing={row.marketing ? 'true' : 'false'}
      {...(sub ? { 'data-parent': row.parent as string } : {})}
      data-region={row.region || ''}
    >
      <div className="kibbutz-name-row flex flex-wrap items-center gap-2">
        <h4 className="kibbutz-name flex-1 text-[17px] font-bold leading-tight">{labelOf(row)}</h4>
        <span className="energy-badge rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {energyText(row)}
        </span>
        {sub && (
          <span className="tag-subsite rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            ↳ תת-אתר של {row.parent}
          </span>
        )}
        {draft && (
          <span className="tag-draft rounded-full bg-[color:var(--brand-1)]/15 px-2 py-0.5 text-[11px] font-semibold text-foreground">
            ✍️ סיכום ביקור בהתהוות
          </span>
        )}
        {/* 🔥 צריבות (Task 23) — a TEMPORARY project chip: `נותרו X/Y` while there is work
            left here, and nothing at all once the kibbutz is finished. It counts as part of
            the card's routine open work (עידן 18.9 21:50), so it is not gated to the field role. */}
        <BurnChip kibbutz={row.name} />
        {row.marketing && (
          <span className="tag-marketing rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-foreground">
            🤝 בתהליך שיווקי
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            title="פרטי קיבוץ"
            onClick={e => { e.stopPropagation(); onEdit(row); }}
            className="rounded-lg px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          >
            ✏️
          </button>
        )}
      </div>
      {/* name → EMS TASKS → NOTES (§7k #7, עידן 18.9): the tasks are the ACTION and go first;
          the bullets are history and are collapsed to the latest lines below them. No legacy
          decorator anchors on `.card-notes` any more (the EMS widget became React in Task 3),
          so the swap is free of the old DOM contract. */}
      <EmsTasks kibbutz={row.name} />
      <MeetingNotes kibbutz={row.name} canAct={role !== 'viewer'} />
      <CardActions name={row.name} role={role} />
    </motion.div>
  );
}
