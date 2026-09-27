// The bell sheet's list body — cut out of islands/Alerts.tsx (round 5, L7) so the frame (the
// bell trigger, the badge, the sheet header — Alerts.tsx) stays with package S while the list
// itself (this file) moves to package R. Redesigned onto the design system (round 5, Task U5):
// ListRow per group, a lucide Check IconBubble instead of a bare button, and a neutral bubble
// for the "seen" toggle instead of a border-only pill.
import * as React from 'react';
import { Bell, Check, ChevronDown } from 'lucide-react';
import { BubbleButton } from '@/components/ui/bubble-button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconBubble } from '@/components/ui/icon-bubble';
import { ListRow } from '@/components/ui/list-row';
import { fmtDay, fmtTime } from '@/lib/format';
import { track } from '@/lib/track';
import { sigma } from '@/bridge';
import { alertTarget, alertText, type AlertGroup, type AlertRow } from '@/lib/alerts';

/** Open what the group is about (§5.1). A recount has no screen of its own — the מלאי page is it. */
function openSource(row: AlertRow): void {
  // אתר לא מקושר ל-EMS has no "order" or "visit" behind it — the thing to open is the kibbutz
  // itself, on the home page where its card (and the ⚠️ chip) lives.
  if (row.kind === 'ems_unlinked') { try { sigma.showPage?.('kibbutz'); } catch { /* legacy not up */ } return; }
  const t = alertTarget(row);
  try {
    if (t.kind === 'order' && t.id) { sigma.openOrder?.(t.id); return; }
    sigma.showPage?.('inventory');
  } catch { /* legacy not up */ }
}

/** `היום 14:02 · אביאם` — the meta line, separate from the title's own text. */
function groupMeta(g: AlertGroup): string {
  const head = g.rows[0];
  const parts: string[] = [];
  if (g.at) { const d = new Date(g.at); parts.push(fmtDay(d) + ' ' + fmtTime(d)); }
  if (head?.actor) parts.push(String(head.actor));
  return parts.join(' · ');
}

function GroupRow({ g, onSeen }: { g: AlertGroup; onSeen: (g: AlertGroup) => void }) {
  const [open, setOpen] = React.useState(false);
  const many = g.rows.length > 1;
  const canMarkSeen = !g.seen && g.kind !== 'ems_unlinked';
  return (
    <li data-testid="alert-group" data-count={g.rows.length} className="border-b border-border last:border-b-0">
      <ListRow
        leading={!g.seen ? <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--info-ink)]" /> : undefined}
        title={(
          <button
            type="button"
            // data-hit-slop: a single-line title row is under 48px tall on its own — `.s-hit`
            // grows the real hit area (see chip.tsx's FilterChip for why the sweep needs the
            // attribute too).
            data-hit-slop
            className="s-hit text-start"
            onClick={() => { track('alert-open', String(g.kind)); onSeen(g); openSource(g.rows[0]); }}
          >
            <span className={g.seen ? '' : 'font-bold'}><bdi>{g.title}</bdi></span>
          </button>
        )}
        meta={groupMeta(g) ? <bdi>{groupMeta(g)}</bdi> : undefined}
        trailing={
          <span className="flex items-center gap-1">
            {many && (
              <BubbleButton
                variant="icon"
                aria-label={open ? 'סגירת הפירוט' : 'פירוט'}
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
              >
                <ChevronDown aria-hidden className={'h-4 w-4 transition-transform duration-[var(--s-motion-fast)] ' + (open ? 'rotate-180' : '')} />
              </BubbleButton>
            )}
            {canMarkSeen ? (
              // Designer (round-5 R-U Opus audit): "✓ button ≥44px next to its row" — 32px
              // relied on the invisible `.s-hit` hit-slop growth alone; 40 is the real,
              // VISIBLE tap target the audit expects to see, not just measure.
              <IconBubble
                size={40}
                label="סימון כנקרא"
                icon={<Check aria-hidden className="h-4 w-4" />}
                onClick={() => onSeen(g)}
              />
            ) : null}
          </span>
        }
      />
      {many && open && (
        <ul className="mt-0.5 flex flex-col gap-1 px-4 pb-2 ps-9 text-[12px] text-muted-foreground">
          {g.rows.map(r => <li key={String(r.id)}><bdi>{alertText(r)}</bdi></li>)}
        </ul>
      )}
    </li>
  );
}

export function AlertsList({ groups, onSeen, onSeenAll }: {
  groups: AlertGroup[]; user: string; onSeen: (g: AlertGroup) => void; onSeenAll?: () => void;
}) {
  const [showSeen, setShowSeen] = React.useState(false);
  const unread = groups.filter(g => !g.seen);
  const read = groups.filter(g => g.seen);
  const shown = showSeen ? groups : unread;
  // "מסומן" (ems_unlinked) has no seen state of its own (canMarkSeen excludes it in GroupRow) —
  // it must not block "הכל" from disappearing once every REAL alert is read.
  const markable = unread.filter(g => g.kind !== 'ems_unlinked');
  return (
    <div data-testid="alerts-list">
      {!shown.length && (
        groups.length
          ? <EmptyState icon={<Check />} title="הכול נקרא." />
          : <EmptyState icon={<Bell />} title="עוד לא נשלחו התראות." />
      )}
      {markable.length > 1 && onSeenAll && (
        // Round 6, QA 1.1 (עידן's phone QA: "alerts keep popping up") — a bulk action so the
        // badge can actually drop to zero instead of tapping ✓ once per group.
        <BubbleButton
          variant="tonal"
          size="sm"
          className="mb-2 w-full"
          data-testid="alerts-mark-all-seen"
          onClick={onSeenAll}
        >
          סימון הכל כנקרא
        </BubbleButton>
      )}
      {!!shown.length && <ul className="-mx-4">{shown.map(g => <GroupRow key={g.key} g={g} onSeen={onSeen} />)}</ul>}
      {!!read.length && (
        <BubbleButton
          variant="tonal"
          size="sm"
          className="mt-3 w-full"
          data-testid="alerts-toggle-seen"
          onClick={() => setShowSeen(s => !s)}
        >
          {showSeen ? 'הסתרת מה שנקרא' : <>הצגת מה שנקרא (<bdi>{read.length}</bdi>)</>}
        </BubbleButton>
      )}
    </div>
  );
}
