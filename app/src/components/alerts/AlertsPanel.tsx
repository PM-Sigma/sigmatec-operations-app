// The bell sheet's list body — cut out of islands/Alerts.tsx (round 5, L7) so the frame (the
// bell trigger, the badge, the sheet header — Alerts.tsx) stays with package S while the list
// itself (this file) moves to package R. No visual change from the split itself.
import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
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

export function GroupRow({ g, user, onSeen }: { g: AlertGroup; user: string; onSeen: (g: AlertGroup) => void }) {
  const [open, setOpen] = React.useState(false);
  const many = g.rows.length > 1;
  return (
    <li data-testid="alert-group" data-count={g.rows.length} className="border-b border-border py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { track('alert-open', String(g.kind)); onSeen(g); openSource(g.rows[0]); }}
          className={`flex-1 text-start text-[13px] leading-snug ${g.seen ? 'text-muted-foreground' : 'font-bold text-foreground'}`}
        >
          <bdi>{g.title}</bdi>
        </button>
        {many && (
          <button
            type="button"
            aria-label={open ? 'סגור פירוט' : 'פירוט'}
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
            className="min-h-8 flex-none rounded-[10px] border border-border px-2 text-[12px] text-muted-foreground"
          >
            <ChevronDown className={'size-4 transition-transform ' + (open ? 'rotate-180' : '')} />
          </button>
        )}
        {/* אתר לא מקושר ל-EMS is a standing state, not an event — it has nothing to "mark
            read"; it clears itself the moment the site is actually linked. */}
        {!g.seen && g.kind !== 'ems_unlinked' && (
          <button
            type="button"
            aria-label="סמן כנקרא"
            onClick={() => onSeen(g)}
            className="min-h-8 flex-none rounded-[10px] border border-border px-2 text-[12px] text-muted-foreground"
          >
            <Check className="size-4" />
          </button>
        )}
      </div>
      {many && open && (
        <ul className="mt-1.5 flex flex-col gap-1 ps-3 text-[12px] text-muted-foreground">
          {g.rows.map(r => <li key={String(r.id)}><bdi>{alertText(r)}</bdi></li>)}
        </ul>
      )}
    </li>
  );
}

export function AlertsList({ groups, user, onSeen }: { groups: AlertGroup[]; user: string; onSeen: (g: AlertGroup) => void }) {
  const [showSeen, setShowSeen] = React.useState(false);
  const unread = groups.filter(g => !g.seen);
  const read = groups.filter(g => g.seen);
  const shown = showSeen ? groups : unread;
  return (
    <div data-testid="alerts-list">
      {!shown.length && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {groups.length ? 'הכול נקרא' : 'אין תנועות מלאי'}
        </p>
      )}
      {!!shown.length && <ul className="mt-1">{shown.map(g => <GroupRow key={g.key} g={g} user={user} onSeen={onSeen} />)}</ul>}
      {!!read.length && (
        <button
          type="button"
          onClick={() => setShowSeen(s => !s)}
          data-testid="alerts-toggle-seen"
          className="mt-3 w-full rounded-xl border border-border py-2 text-[12.5px] font-semibold text-muted-foreground"
        >
          {showSeen ? 'הסתר מה שנקרא' : `הצג מה שנקרא (${read.length})`}
        </button>
      )}
    </div>
  );
}
