// 🗓 The meeting bullets on a kibbutz card (spec §3.3). Rendered by KibbutzCard BETWEEN the
// name row and the legacy-decorated area, so the card reads name → notes → EMS tasks.
//
// This module also owns the ['meetingNotes'] query and the three writes every surface needs
// (link a bullet to a new EMS task, mark it done, undo) — ImportNotes.tsx and
// ModalMeetings.tsx import them instead of re-implementing the contract. Every write ends by
// emitting `notes-changed` on sigmaBus, which is what makes the card, the modal tab and the
// import preview agree without any of them knowing the others exist (docs/integration-map.md).
import * as React from 'react';
import { CalendarDays, Link2, Loader2, MoreHorizontal, Plus } from 'lucide-react';
import { useClickAway } from '@/lib/useClickAway';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { IconBubble } from '@/components/ui/icon-bubble';
import { ListRow } from '@/components/ui/list-row';
import { sigma, sigmaBus } from '@/bridge';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { queryClient } from '@/lib/query';
import {
  chipDate, collapseBullets, isQuiet, KIND_LABEL, notesForKibbutz, taskFromBullet,
  type MeetingGroup, type MeetingKind, type NoteRow,
} from '@/lib/meetingNotes';

export const NOTES_QUERY_KEY = ['meetingNotes'] as const;
/** The bus event every notes write emits. Consumers: this component, ModalMeetings, ImportNotes. */
export const NOTES_CHANGED = 'notes-changed' as const;

export async function fetchMeetingNotes(): Promise<NoteRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('kibbutz_meeting_notes')
    .select('*')
    .order('meeting_date', { ascending: false })
    .order('seq', { ascending: true });
  if (error) throw error;
  return (data || []) as NoteRow[];
}

// Another surface wrote → refetch. Attached ONCE per page, at module scope, against the
// queryClient singleton: a listener per component would mean one per CARD (54 of them on the
// home page), all invalidating the same key on every single write. This is the whole
// cross-surface contract (docs/integration-map.md).
let listening = false;
function listenForNotesChanges(): void {
  if (listening || !sigmaBus) return;
  listening = true;
  sigmaBus.addEventListener(NOTES_CHANGED, () => {
    void queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
  });
  // The outbound EMS queue drained → every bullet that was stamped `pending:<queueId>`
  // while offline now has a real task id waiting for it (js/src/13-ems.js emsQueueFlush).
  // Without this the 🔗 would stay un-clickable for the rest of that note's life.
  sigmaBus.addEventListener('ems-queue-flushed', e => {
    const created = ((e as CustomEvent).detail?.created || []) as Array<{ queueId: string; taskId: string }>;
    if (created.length) void resolvePendingTasks(created);
  });
}

/**
 * `pending:<queueId>` → the real EMS task id, for each createTask the queue just sent.
 * Best-effort: a row that no longer exists, or a write we are not authenticated for, must
 * not turn into a toast — the queue flush is a background event the user did not ask for.
 */
export async function resolvePendingTasks(created: Array<{ queueId: string; taskId: string }>): Promise<number> {
  const sb = await getSupabase();
  let fixed = 0;
  for (const { queueId, taskId } of created) {
    if (!queueId || !taskId) continue;
    try {
      const { data } = await sb.from('kibbutz_meeting_notes')
        .update({ ems_task_id: taskId })
        .eq('ems_task_id', 'pending:' + queueId)
        .select('id');
      fixed += (data || []).length;
    } catch (e) { console.warn('[notes] could not resolve pending task', queueId, e); }
  }
  if (fixed) emitNotesChanged({ resolved: fixed });
  return fixed;
}

/** All notes, shared by every card and the modal tab (TanStack dedupes + persists them). */
export function useMeetingNotes() {
  React.useEffect(listenForNotesChanges, []);
  return useQuery({ queryKey: NOTES_QUERY_KEY, queryFn: fetchMeetingNotes });
}

export function emitNotesChanged(detail?: Record<string, unknown>): void {
  try { sigmaBus?.dispatchEvent(new CustomEvent(NOTES_CHANGED, { detail })); } catch { /* no bus */ }
}

// ───────────────────────────── writes ─────────────────────────────

/** Mark a bullet handled / undo it. `done` false clears `done_at`. */
export async function setNoteDone(id: string, done: boolean): Promise<void> {
  const sb = await getSupabase();
  await sbWrite(() =>
    sb.from('kibbutz_meeting_notes')
      .update({ done_at: done ? new Date().toISOString() : null })
      .eq('id', id)
      .select('id')
      .single());
  emitNotesChanged({ id, done });
}

/**
 * ➕ — open an EMS task from the bullet and remember which task it became.
 * `sigma.createTask` answers `{sent:true, id}` when it went out live and
 * `{queued:true, queueId}` when EMS was unreachable; in the queued case there is no task id
 * yet, so the note is marked `pending:<queueId>` and the row shows 🔗 as pending (the real
 * id is stamped by whoever flushes the queue — out of scope for this task, spec §3.3).
 */
export async function linkNoteToTask(row: NoteRow): Promise<'sent' | 'queued'> {
  const res = (await sigma.createTask(taskFromBullet(row as any))) as any;
  if (res && res.error) throw new Error(String(res.error));
  const taskId = res && res.id ? String(res.id) : null;
  const queued = !taskId;
  const value = taskId || 'pending:' + (res?.queueId || Date.now());
  if (row.id) {
    const sb = await getSupabase();
    await sbWrite(() =>
      sb.from('kibbutz_meeting_notes').update({ ems_task_id: value }).eq('id', row.id!).select('id').single());
  }
  emitNotesChanged({ id: row.id, ems_task_id: value });
  return queued ? 'queued' : 'sent';
}

// ───────────────────────────── rows ─────────────────────────────

const isPending = (id?: string | null) => !!id && id.startsWith('pending:');

function OwnerChip({ name }: { name: string }) {
  return (
    <span className="owner-chip rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
      {name}
    </span>
  );
}

function NoteBullet({
  row, canAct, index, dateBadge,
}: { row: NoteRow; canAct: boolean; index: number; /** rendered inline in this bullet's meta line, only for the group's first bullet (designer round 8). */ dateBadge?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [menu, setMenu] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const menuRef = React.useRef<HTMLSpanElement>(null);

  // A tap anywhere else, or Escape, closes it. `mousedown`/`touchstart` rather than `click`
  // so the menu is gone before the thing underneath reacts, and the listener only exists
  // while the menu is open.
  useClickAway(menu, menuRef, () => setMenu(false));   // F14 ⑩ — the ONE copy
  const done = !!row.done_at;
  const linked = !!row.ems_task_id;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMenu(false);
    try { await fn(); toast.success(ok); }
    catch (e: any) { toast.error(e?.message || 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  };

  const pending = isPending(row.ems_task_id);
  // The wording moved on after the task was opened (set by db/kibbutz_meeting_notes_import.sql
  // on a re-import). The link is kept — the task is real and someone is working it — but the
  // row says so, so nobody assumes the EMS task still matches this sentence.
  const stale = !!row.text_changed_at && !!row.ems_task_id;

  const openTask = () => {
    if (pending) { toast.info('המשימה ממתינה לסנכרון עם EMS'); return; }
    sigma.openKibbutzEmsTask(String(row.ems_task_id));
  };

  // DS IconBubble, default 40px visual size — but the RENDERED box must clear 44×44 on its
  // own (designer round 9: not via the .s-hit overlay), so min-w/min-h-[44px] floor it; a
  // tinted fill (not the ghost ready-on-hover default) so it reads in both light and dark
  // without a hover to reveal it.
  // dark:bg-white/10, not dark:bg-s-surface-2 (designer round 10 — "raise the tint one
  // surface step"): s-surface-2 sat too close to the card's own dark background to read as a
  // filled bubble; a light overlay lifts it one visible step above the card regardless of
  // which dark surface it sits on.
  const ACTION_CLS = 'min-w-[44px] min-h-[44px] bg-secondary dark:bg-white/10';

  return (
    <motion.li
      data-id={row.id}
      // `y` only: `x` is a PHYSICAL axis, so a 6px x-offset slides the wrong way in RTL
      // (and the right way in LTR) — a vertical entry is direction-agnostic.
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: reduce ? 0 : Math.min(index, 8) * 0.03 }}
      className={'note-bullet ' + (done ? 'done opacity-50 line-through decoration-1' : '')}
    >
      {/* One real ListRow (designer round 9): title = the note text (clamp 2), meta = the
          date chip (first bullet only) + owner chips, trailing = the actions — vertically
          centred on the WHOLE row by ListRow itself, not squeezed into the meta line.
          px-4 is ListRow's OWN default — kept, not overridden (designer round 10): the
          section's SectionBlock wraps every row in `-mx-4 divide-y`, which relies on each
          row restoring that 16px with its own inline padding. Dropping it to px-0 last round
          is what let the row (and the ⋯ bubble) spill past the card's real edge. */}
      <ListRow
        className="min-h-0 py-[5px]"
        leading={<span aria-hidden className="text-[10px] text-muted-foreground">•</span>}
        title={<span className={isQuiet(row.text) ? 'text-muted-foreground' : ''}>{row.text}</span>}
        // Always rendered now (designer round 10): a bullet with no date and no owners used to
        // skip the meta line entirely, so rows in the same list had different heights. A
        // missing owner shows "—" instead of just vanishing.
        // No "—" placeholder (designer round 11, reversing round 10): a missing date/owner
        // just renders nothing — but the span keeps a min-h so every row is still the same
        // height whether or not it has anything to show here.
        meta={
          <span className="inline-flex min-h-[18px] flex-wrap items-center gap-1">
            {dateBadge}
            {(row.owners || []).map(o => <OwnerChip key={o} name={o} />)}
          </span>
        }
        trailing={
          <span className="flex items-center gap-1">
            {linked ? (
              <IconBubble
                icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                label={pending ? 'ממתין לסנכרון עם EMS' : stale ? 'המשימה נפתחה מנוסח קודם של הבולט' : 'פתח את המשימה ב-EMS'}
                onClick={() => openTask()}
                className={ACTION_CLS + (pending ? ' opacity-60' : '') + (stale ? ' text-[color:var(--sigma-warn)]' : '')}
              />
            ) : canAct && !done ? (
              <IconBubble
                icon={<Plus className="h-4 w-4" />}
                label="פתח משימה ב-EMS"
                onClick={() => { if (!busy) void act(() => linkNoteToTask(row).then(r => { if (r === 'queued') toast.info('המשימה נשמרה ותיפתח ב-EMS בעוד רגע'); }), 'נפתחה משימה ב-EMS'); }}
                className={ACTION_CLS}
              />
            ) : null}
            {canAct && (
              <span ref={menuRef} className="relative">
                <IconBubble
                  icon={<MoreHorizontal className="h-4 w-4" />}
                  label="עוד פעולות לבולט"
                  active={menu}
                  onClick={() => setMenu(v => !v)}
                  className={ACTION_CLS}
                />
                {menu && (
                  <span className="absolute top-full z-20 mt-1 flex w-max flex-col overflow-hidden rounded-lg border border-border bg-popover text-[12px] shadow-lg [inset-inline-end:0]">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={e => { e.stopPropagation(); void act(() => setNoteDone(row.id!, !done), done ? 'הסימון בוטל' : 'סומן כטופל'); }}
                      className="px-3 py-2 text-start hover:bg-muted"
                    >
                      {done ? '↩︎ בטל' : '✓ סמן כטופל'}
                    </button>
                  </span>
                )}
              </span>
            )}
          </span>
        }
      />
    </motion.li>
  );
}

function MeetingBlock({ group, canAct }: { group: MeetingGroup; canAct: boolean }) {
  const kindLabel = KIND_LABEL[group.meeting_kind as MeetingKind] || KIND_LABEL.company;
  // The date badge rides in the FIRST bullet's own meta line now (designer round 8), not a
  // standalone header above the list — py-1 + leading-none (not py-px) so the calendar icon
  // has room and never clips at the chip's edge.
  const dateBadge = (
    <span
      className="inline-flex items-center rounded-full bg-muted px-1.5 py-1 text-[10px] font-bold leading-none text-muted-foreground"
      title={kindLabel}
    >
      <CalendarDays aria-hidden className="me-1 h-2.5 w-2.5 shrink-0" /><bdi>{chipDate(group.meeting_date)}</bdi>
      {group.meeting_kind !== 'company' && <span className="ms-1">· {kindLabel}</span>}
    </span>
  );
  return (
    <div className="card-notes-meeting">
      {/* Motion stagger instead of Magic UI's AnimatedList: that component cycles a feed of
          notifications, which is not what a fixed bullet list is (spec §6 motion budget). */}
      <ul>
        {group.bullets.map((b, i) => (
          <NoteBullet key={b.id || b.seq} row={b} canAct={canAct} index={i} dateBadge={i === 0 ? dateBadge : undefined} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The timeline itself — pure presentation over already-fetched rows, so the card, the modal
 * tab and (one day) a report can all render the same thing.
 * `expandAll` = the modal: full history open, no disclosure.
 * `collapse` = the card (§7k #7): only the latest one or two lines, then "עוד N".
 */
export function MeetingTimeline({
  rows, kibbutz, canAct, expandAll = false, collapse = 0, empty = null,
}: {
  rows: NoteRow[] | undefined;
  kibbutz: string;
  canAct: boolean;
  expandAll?: boolean;
  /** How many bullets to show before the "עוד N" disclosure. 0 = no collapsing. */
  collapse?: number;
  empty?: string | null;
}) {
  const groups = React.useMemo(() => notesForKibbutz(rows, kibbutz), [rows, kibbutz]);
  const [open, setOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const [latest, ...older] = groups;
  const brief = React.useMemo(() => collapseBullets(groups, collapse), [groups, collapse]);
  const collapsed = !expandAll && collapse > 0 && !showAll && brief.hidden > 0;

  // `.card-notes` is rendered UNCONDITIONALLY — empty, and even while the query is still in
  // flight — so the card never reflows by a line when the notes land. (It used to also be the
  // anchor js/src/13-ems.js measured the EMS widget against; that widget is React now, and the
  // card order is EMS tasks → notes per §7k #7, so nothing outside this file depends on it.)
  return (
    <div className={'card-notes ' + (groups.length ? 'mt-2.5 border-t border-dashed border-border pt-2' : '')}>
      {!groups.length && empty && (
        <p className="card-notes-empty py-0.5 text-[12px] text-muted-foreground">{empty}</p>
      )}
      {/* Collapsed card view: the latest line(s) only, with the date chip of the newest
          meeting for context, and one tap to the whole history. */}
      {collapsed && latest && (
        <>
          <ul>
            {brief.shown.map((b, i) => (
              <NoteBullet
                key={b.id || b.seq} row={b} canAct={canAct} index={i}
                dateBadge={i === 0 ? (
                  <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-1 text-[10px] font-bold leading-none text-muted-foreground">
                    <CalendarDays aria-hidden className="me-1 h-2.5 w-2.5 shrink-0" /><bdi>{chipDate(latest.meeting_date)}</bdi>
                  </span>
                ) : undefined}
              />
            ))}
          </ul>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowAll(true); }}
            className="card-notes-more mt-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            עוד <bdi>{brief.hidden}</bdi>
          </button>
        </>
      )}

      {!collapsed && latest && <MeetingBlock group={latest} canAct={canAct} />}

      {!collapsed && !!latest && older.length > 0 && (expandAll ? (
        <div className="mt-2 flex flex-col gap-2">
          {older.map(g => <MeetingBlock key={g.meeting_date + g.meeting_kind} group={g} canAct={canAct} />)}
        </div>
      ) : (
        <Collapsible open={open} onOpenChange={setOpen} className="card-notes-history">
          <CollapsibleTrigger
            onClick={e => e.stopPropagation()}
            className="mt-1 flex w-full items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <span aria-hidden className={'transition-transform ' + (open ? 'rotate-90' : '')}>›</span>
            היסטוריה ({older.length}) ·{' '}
            <bdi>{older.slice(0, 3).map(g => chipDate(g.meeting_date)).join(' · ')}</bdi>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <div className="mt-1.5 flex flex-col gap-2 ps-1">
              {older.map(g => <MeetingBlock key={g.meeting_date + g.meeting_kind} group={g} canAct={canAct} />)}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}

/**
 * The card entry point. Reads the shared query itself (one fetch for the whole page — every
 * card hits the same TanStack entry) and hides itself entirely while it is still loading, so
 * a card never jumps by a line.
 */
export function MeetingNotes({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  const { data, isLoading } = useMeetingNotes();
  if (isLoading && !data) return null;
  // §7k #7: two lines on the card. The full history is one tap away, and the kibbutz modal's
  // summaries tab (expandAll) still opens everything at once.
  return <MeetingTimeline rows={data} kibbutz={kibbutz} canAct={canAct} collapse={CARD_BULLETS} />;
}

/** The latest N bullets a card shows before "עוד N" (§7k #7: "the latest 1–2 lines"). */
export const CARD_BULLETS = 2;
