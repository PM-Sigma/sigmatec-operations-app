// 🗓 The meeting bullets on a kibbutz card (spec §3.3). Rendered by KibbutzCard BETWEEN the
// name row and the legacy-decorated area, so the card reads name → notes → EMS tasks.
//
// This module also owns the ['meetingNotes'] query and the three writes every surface needs
// (link a bullet to a new EMS task, mark it done, undo) — ImportNotes.tsx and
// ModalMeetings.tsx import them instead of re-implementing the contract. Every write ends by
// emitting `notes-changed` on sigmaBus, which is what makes the card, the modal tab and the
// import preview agree without any of them knowing the others exist (docs/integration-map.md).
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { sigma, sigmaBus } from '@/bridge';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { queryClient } from '@/lib/query';
import {
  chipDate, isQuiet, KIND_LABEL, notesForKibbutz, taskFromBullet,
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

function NoteBullet({ row, canAct, index }: { row: NoteRow; canAct: boolean; index: number }) {
  const reduce = useReducedMotion();
  const [menu, setMenu] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const done = !!row.done_at;
  const linked = !!row.ems_task_id;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMenu(false);
    try { await fn(); toast.success(ok); }
    catch (e: any) { toast.error(e?.message || 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  };

  const openTask = () => {
    if (isPending(row.ems_task_id)) { toast.info('המשימה ממתינה לשליחה ל-EMS'); return; }
    sigma.openKibbutzEmsTask(String(row.ems_task_id));
  };

  return (
    <motion.li
      data-id={row.id}
      initial={reduce ? false : { opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, delay: reduce ? 0 : Math.min(index, 8) * 0.03 }}
      className={
        'note-bullet flex items-start gap-1.5 py-[3px] text-[13px] leading-snug ' +
        (done ? 'done opacity-50 line-through decoration-1 ' : '')
      }
    >
      <span aria-hidden className="mt-[3px] text-[10px] text-muted-foreground">•</span>
      <span className="min-w-0 flex-1">
        {/* `quiet` is derived, not stored: "ללא פערים" is still a row (the kibbutz WAS
            reviewed) but it is not news, so it renders muted. */}
        <span className={isQuiet(row.text) ? 'text-muted-foreground' : ''}>{row.text}</span>
        {(row.owners || []).length > 0 && (
          <span className="ms-1.5 inline-flex flex-wrap gap-1 align-middle">
            {(row.owners || []).map(o => <OwnerChip key={o} name={o} />)}
          </span>
        )}
      </span>

      {/* ➕ ⇄ 🔗 are ONE element as far as Motion is concerned (shared layoutId), so linking a
          bullet morphs the button in place instead of swapping two icons (spec §7c). */}
      <AnimatePresence initial={false} mode="popLayout">
        {linked ? (
          <motion.button
            key="linked"
            layoutId={reduce ? undefined : 'note-act-' + row.id}
            type="button"
            onClick={e => { e.stopPropagation(); openTask(); }}
            title={isPending(row.ems_task_id) ? 'ממתין לשליחה ל-EMS' : 'פתח את המשימה ב-EMS'}
            className={'note-act linked shrink-0 rounded-md px-1 text-[13px] leading-5 hover:bg-muted '
              + (isPending(row.ems_task_id) ? 'opacity-60' : '')}
          >
            🔗
          </motion.button>
        ) : canAct && !done ? (
          <motion.button
            key="add"
            layoutId={reduce ? undefined : 'note-act-' + row.id}
            type="button"
            disabled={busy}
            onClick={e => { e.stopPropagation(); void act(() => linkNoteToTask(row).then(r => { if (r === 'queued') toast.info('אין חיבור ל-EMS — המשימה בתור'); }), 'נפתחה משימה ב-EMS'); }}
            title="פתח משימה ב-EMS"
            className="note-act shrink-0 rounded-md px-1 text-[13px] leading-5 text-muted-foreground hover:bg-muted"
          >
            ＋
          </motion.button>
        ) : null}
      </AnimatePresence>

      {canAct && (
        <span className="relative shrink-0">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setMenu(v => !v); }}
            aria-expanded={menu}
            aria-label="עוד פעולות לבולט"
            className="rounded-md px-1 text-[13px] leading-5 text-muted-foreground hover:bg-muted"
          >
            ⋯
          </button>
          {menu && (
            <span
              className="absolute top-full z-20 mt-1 flex w-max flex-col overflow-hidden rounded-lg border border-border bg-popover text-[12px] shadow-lg [inset-inline-end:0]"
              onMouseLeave={() => setMenu(false)}
            >
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
    </motion.li>
  );
}

function MeetingBlock({ group, canAct }: { group: MeetingGroup; canAct: boolean }) {
  const kindLabel = KIND_LABEL[group.meeting_kind as MeetingKind] || KIND_LABEL.company;
  return (
    <div className="card-notes-meeting">
      <div className="mb-0.5 flex items-center gap-1.5">
        <span
          className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground"
          title={kindLabel}
        >
          🗓 <bdi>{chipDate(group.meeting_date)}</bdi>
        </span>
        {group.meeting_kind !== 'company' && (
          <span className="text-[10px] font-semibold text-muted-foreground">{kindLabel}</span>
        )}
      </div>
      {/* Motion stagger instead of Magic UI's AnimatedList: that component cycles a feed of
          notifications, which is not what a fixed bullet list is (spec §6 motion budget). */}
      <ul>
        {group.bullets.map((b, i) => (
          <NoteBullet key={b.id || b.seq} row={b} canAct={canAct} index={i} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The timeline itself — pure presentation over already-fetched rows, so the card, the modal
 * tab and (one day) a report can all render the same thing.
 * `expandAll` = the modal: full history open, no disclosure.
 */
export function MeetingTimeline({
  rows, kibbutz, canAct, expandAll = false, empty = 'אין סיכום ישיבה עדיין',
}: {
  rows: NoteRow[] | undefined;
  kibbutz: string;
  canAct: boolean;
  expandAll?: boolean;
  empty?: string | null;
}) {
  const groups = React.useMemo(() => notesForKibbutz(rows, kibbutz), [rows, kibbutz]);
  const [open, setOpen] = React.useState(false);

  if (!groups.length) {
    return empty ? <p className="card-notes-empty py-0.5 text-[12px] text-muted-foreground">{empty}</p> : null;
  }

  const [latest, ...older] = groups;

  return (
    <div className="card-notes mt-1.5 border-t border-border/70 pt-1.5">
      <MeetingBlock group={latest} canAct={canAct} />

      {older.length > 0 && (expandAll ? (
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
  return <MeetingTimeline rows={data} kibbutz={kibbutz} canAct={canAct} />;
}
