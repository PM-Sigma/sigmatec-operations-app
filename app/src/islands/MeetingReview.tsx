// #sigma-meeting-review — 📝 ישיבה → סיכום (company-process spec §1.3).
//
// עידן's EDITOR, not an approver's checklist. The parsed summary arrives from the import
// sheet (📝 עבור על הסיכום), every sentence opens with a PROPOSED chip, and he walks the
// kibbutzim changing what the proposal got wrong: one tap on a chip, an owner, ✏️ to rewrite
// the sentence, ➕ to add a line nobody said aloud, and a drag (⋯ on a phone) when the
// transcript filed a line under the wrong kibbutz.
//
// The rule the whole screen exists to keep: **nothing is written before בצע**. Every edit is
// a pure mutator on an in-memory draft (lib/meetingReview.ts, which cannot even import
// supabase), so "ביטול" really does throw the whole session away — including the 📋 task
// modal, which EDITS THE PREFILL and does not open a task (§1.3 says the task is created
// from this screen rather than later; "later" is בצע, a few taps away, and a task created
// mid-review that עידן then cancels cannot be taken back out of EMS).
//
// Copy rule (master spec §6): Hebrew everywhere, nothing explains the app's own mechanics.
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { mount } from '@/islands';
import { track } from '@/lib/track';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { INTERNAL_TASKS_WRITABLE } from '@/lib/caps';
import { sigma, useCurrentUser } from '@/bridge';
import { emitNotesChanged, NOTES_QUERY_KEY } from '@/components/home/MeetingNotes';
import { EmsGate } from '@/components/EmsGate';
import { dmy, KIND_LABEL, MEETING_PEOPLE, type ParsedMeeting } from '@/lib/meetingNotes';
import {
  addLine, applyReview, canReview, CHIP_LABELS, draftFromParsed, editLine, moveLine, removeLine,
  reviewChips, reviewPayload, reviewSummary, setChip, setOwner, setTask, summaryLabel,
  type Chip, type ReviewBundle, type ReviewDraft, type ReviewLine,
} from '@/lib/meetingReview';

// ───────────────────────── the opener (no shared global) ─────────────────────────

type Opener = (parsed: ParsedMeeting, marked?: string[]) => void;
let opener: Opener | null = null;
/** Set before the island's first render when the hand-off beat the mount (see Presenter.tsx). */
let pending: { parsed: ParsedMeeting; marked?: string[] } | null = null;

/**
 * Hand a parsed summary to the review screen. Safe to call before the island has mounted —
 * the draft waits in `pending` and the island's first render picks it up.
 */
export function openMeetingReview(parsed: ParsedMeeting, marked?: string[]): void {
  if (opener) opener(parsed, marked);
  else pending = { parsed, marked };
}

// ───────────────────────────── the write (thin) ─────────────────────────────

export interface ReviewResult { notes: number; tasks: number; internal: number; queued: number; failed: number }

export interface SaveReviewOpts {
  /** Line keys that already carry an EMS task id from an earlier, partially-failed בצע. */
  created?: Record<string, string>;
  /** Called the instant a line gets a task id, so the caller can persist it before any later
   *  line in the same run throws — a crash on line 3 must not lose what line 1 and 2 wrote. */
  onCreated?: (key: string, taskId: string) => void;
  /** 🔒-line keys that already have an `internal_tasks` row from an earlier, partially-failed
   *  בצע — mirrors `created` for the EMS loop, so a retry never re-inserts them. */
  createdInternal?: Record<string, string>;
  /** Called the instant a 🔒 line's row is inserted, so the caller can persist it the same way
   *  `onCreated` does for EMS tasks. */
  onInternalCreated?: (key: string, rowId: string) => void;
}

/**
 * בצע — and the ONLY function in this feature that writes anything.
 *
 * Three steps, in this order, because each needs the one before it:
 *   1. the bullets, through `import_meeting_notes(jsonb)` — the SAME transactional merge the
 *      import uses, on the same (kibbutz, date, kind, seq) key. Reviewing a meeting that was
 *      already imported therefore REPLACES its bullets instead of doubling them, and keeps
 *      every `ems_task_id` / `done_at` set in between;
 *   2. the rows are read back, so each 📋 line knows the id of the note it produced;
 *   3. one `sigma.createTask` per 📋 line, then the note's `ems_task_id` is PATCHed — the
 *      same two steps `linkNoteToTask` does for a single bullet (not reused: the review
 *      carries the 📋 modal's overrides, which that helper cannot see).
 * An EMS call that is only queued (no network) still links, as `pending:…` — exactly what the
 * card's ➕ does, so `resolvePendingTasks` picks it up when the queue drains.
 *
 * Idempotent under a partial failure: a line that already has an `ems_task_id` — either from
 * `opts.created` (this island's in-memory record of an earlier failed run) or from the freshly
 * re-read note row — is never re-sent to `sigma.createTask`; בצע pressed again only fills the
 * gaps. A `createTask` throw is caught per line (not re-thrown), so one bad line does not stop
 * the rest of the batch from linking; the caller decides whether to close on `result.failed`.
 */
export async function saveReview(
  draft: ReviewDraft, createdBy: string, bundle?: ReviewBundle, opts?: SaveReviewOpts,
): Promise<ReviewResult> {
  const b = bundle || applyReview(draft, createdBy);
  const sb = await getSupabase();
  const already = opts?.created || {};
  const alreadyInternal = opts?.createdInternal || {};

  await sbWrite(() => sb.rpc('import_meeting_notes', { p: reviewPayload(b, draft, createdBy) }) as any);

  let internal = 0;
  let internalFailed = 0;
  if (INTERNAL_TASKS_WRITABLE) {
    for (const t of b.internalTasks) {
      if (alreadyInternal[t.key]) { internal++; continue; } // already inserted by an earlier, partial בצע
      try {
        // `sbWrite` already unwraps to the row (or throws on error) — no `{data,error}` here.
        const row = await sbWrite(() => sb.from('internal_tasks')
          .insert({ title: t.title, owner: t.owner, kibbutz: t.kibbutz, created_by: createdBy })
          .select('id').single() as any);
        const rowId = row?.id ? String(row.id) : '';
        if (rowId) opts?.onInternalCreated?.(t.key, rowId);
        internal++;
      } catch {
        internalFailed++;
        // keep going — the rest of the batch is independent, and a retry can pick up just this line
      }
    }
  }

  let tasks = 0;
  let queued = 0;
  let failed = 0;
  if (b.emsTasks.length) {
    const { data } = await sb.from('kibbutz_meeting_notes')
      .select('id,kibbutz,seq,ems_task_id')
      .eq('meeting_date', draft.meeting_date)
      .eq('meeting_kind', draft.meeting_kind);
    const idOf = new Map<string, string>();
    const existing = new Map<string, string>();
    (data || []).forEach((r: any) => {
      idOf.set(String(r.kibbutz) + '#' + String(r.seq), String(r.id));
      if (r.ems_task_id) existing.set(String(r.kibbutz) + '#' + String(r.seq), String(r.ems_task_id));
    });

    for (const t of b.emsTasks) {
      const noteKey = t.kibbutz + '#' + t.seq;
      const noteId = idOf.get(noteKey);
      let value = already[t.key] || existing.get(noteKey) || null;

      if (!value) {
        try {
          const res = (await sigma.createTask(t.task)) as any;
          if (res && res.error) throw new Error(String(res.error));
          const taskId = res && res.id ? String(res.id) : null;
          if (!taskId) queued++;
          value = taskId || 'pending:' + (res?.queueId || Date.now());
          opts?.onCreated?.(t.key, value);
        } catch {
          failed++;
          continue; // keep going — the rest of the batch is independent, and a retry can pick up just this line
        }
      }

      if (noteId) {
        await sbWrite(() => sb.from('kibbutz_meeting_notes')
          .update({ ems_task_id: value }).eq('id', noteId).select('id').single() as any);
      }
      tasks++;
    }
  }

  emitNotesChanged({ meeting_date: draft.meeting_date, review: true, notes: b.notes.length, tasks });
  return {
    notes: b.notes.length, tasks, internal, queued, failed: failed + internalFailed,
  };
}

// ───────────────────────────── small pieces ─────────────────────────────

const btn = 'min-h-9 rounded-xl border border-border bg-card px-2.5 text-[12px] font-bold hover:bg-muted';
const field =
  'w-full min-h-[44px] rounded-xl border border-border bg-muted px-3 py-2 text-base outline-none focus:border-[color:var(--brand-1)]';

function ChipRow({ line, onPick }: { line: ReviewLine; onPick: (c: Chip) => void }) {
  const chips = React.useMemo(() => reviewChips({ internalTasks: INTERNAL_TASKS_WRITABLE }), []);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {chips.map(c => (
        <button
          key={c.id}
          type="button"
          data-testid={'review-chip-' + line.key + '-' + c.id}
          aria-pressed={line.chip === c.id}
          onClick={() => onPick(c.id)}
          className={
            'min-h-8 rounded-full border px-2.5 text-[12px] font-extrabold ' +
            (line.chip === c.id
              ? 'border-transparent bg-brand-grad text-white'
              : 'border-border bg-card text-muted-foreground')
          }
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 📋 — the EMS payload this line will open at בצע. It shows which EMS site the kibbutz
 * resolves to (`sigma.emsSiteIdForKibbutz`), so a card with no site is seen HERE and not
 * after the task has gone out under no site at all.
 */
function TaskModal({
  line, kibbutz, prefill, onSave, onClose,
}: {
  line: ReviewLine;
  kibbutz: string;
  prefill: { title: string; description: string; assigneeName?: string; priority: string };
  onSave: (patch: { title?: string; description?: string; assigneeName?: string; priority?: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = React.useState(prefill.title);
  const [description, setDescription] = React.useState(prefill.description);
  const [assignee, setAssignee] = React.useState(prefill.assigneeName || '');
  const [priority, setPriority] = React.useState(prefill.priority || 'medium');
  const [site, setSite] = React.useState<'…' | 'yes' | 'no'>('…');

  React.useEffect(() => {
    let alive = true;
    Promise.resolve(sigma.emsSiteIdForKibbutz?.(kibbutz))
      .then(id => { if (alive) setSite(id ? 'yes' : 'no'); })
      .catch(() => { if (alive) setSite('no'); });
    return () => { alive = false; };
  }, [kibbutz]);

  // §7p: a title and description typed for a new EMS task are unsaved input.
  const taskGuard = useUnsavedGuard({
    dirty: () => title.trim() !== prefill.title.trim() || description.trim() !== (prefill.description || '').trim(),
    onDiscard: onClose,
    onClose,
  });

  return (
    <Sheet open onOpenChange={v => { if (!v) taskGuard.ask(); }}>
      <SheetContent side="bottom" data-testid="review-task-modal" className="max-h-[88svh] overflow-y-auto" {...taskGuard.contentProps}>
        <SheetHeader className="text-start">
          <SheetTitle className="text-base">📋 משימת EMS — <bdi>{kibbutz}</bdi></SheetTitle>
          <SheetDescription>
            {site === '…' ? 'מאתר את האתר במערכת…'
              : site === 'yes' ? 'האתר זוהה במערכת' : 'לא נמצא אתר ב-EMS לקיבוץ הזה. קשרו את הקיבוץ לאתר (✏️ פרטי קיבוץ) לפני פתיחת המשימה'}
          </SheetDescription>
        </SheetHeader>
        <label className="mt-2 flex flex-col text-xs font-bold text-muted-foreground">
          כותרת
          <input data-testid="review-task-title" value={title} onChange={e => setTitle(e.target.value)} className={field + ' mt-1'} />
        </label>
        <label className="mt-2 flex flex-col text-xs font-bold text-muted-foreground">
          פירוט
          <textarea data-testid="review-task-desc" value={description} rows={4}
                    onChange={e => setDescription(e.target.value)} className={field + ' mt-1'} />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="flex flex-col text-xs font-bold text-muted-foreground">
            אחריות
            <select data-testid="review-task-owner" value={assignee} onChange={e => setAssignee(e.target.value)}
                    className={field + ' mt-1 w-[150px]'}>
              <option value="">—</option>
              {MEETING_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs font-bold text-muted-foreground">
            דחיפות
            <select data-testid="review-task-priority" value={priority} onChange={e => setPriority(e.target.value)}
                    className={field + ' mt-1 w-[130px]'}>
              <option value="low">נמוכה</option>
              <option value="medium">רגילה</option>
              <option value="high">גבוהה</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="review-task-save"
            // A task with no EMS site is never opened (the 1.59 site-integrity rule, עידן 22.9):
            // the button waits for the lookup and stays off when it finds nothing.
            disabled={site !== 'yes'}
            onClick={() => { onSave({ title, description, assigneeName: assignee, priority }); onClose(); }}
            className="min-h-[48px] flex-1 rounded-xl bg-brand-grad px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            שמור לטיוטה
          </button>
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-xl border border-border px-4 text-sm font-bold">
            סגור
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground" data-testid="review-task-hint">
          המשימה תיפתח כשתלחץ בצע — <bdi>{line.key ? 'שורה זו בלבד' : ''}</bdi>
        </p>
        {taskGuard.prompt}
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────── one line ─────────────────────────────

function LineRow({
  line, kibbutz, others, onChip, onOwner, onEdit, onMove, onRemove, onTask,
}: {
  line: ReviewLine;
  kibbutz: string;
  others: string[];
  onChip: (c: Chip) => void;
  onOwner: (o: string[]) => void;
  onEdit: (t: string) => void;
  onMove: (to: string) => void;
  onRemove: () => void;
  onTask: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draftText, setDraftText] = React.useState(line.text);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => { setDraftText(line.text); }, [line.text]);

  return (
    <li
      data-testid={'review-line-' + line.key}
      draggable={!editing}
      onDragStart={e => { try { e.dataTransfer.setData('text/plain', line.key); } catch { /* no dnd */ } }}
      className="rounded-xl border border-border bg-card p-2.5"
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            data-testid={'review-edit-text-' + line.key}
            value={draftText}
            rows={3}
            autoFocus
            onChange={e => setDraftText(e.target.value)}
            className={field}
          />
          <div className="flex gap-2">
            <button type="button" data-testid={'review-edit-save-' + line.key} className={btn}
                    onClick={() => { onEdit(draftText); setEditing(false); }}>
              שמור
            </button>
            <button type="button" className={btn} onClick={() => { setDraftText(line.text); setEditing(false); }}>
              בטל
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] leading-snug" data-testid={'review-text-' + line.key}>
          {line.text}
          {line.edited && <span className="ms-1 text-[11px] font-bold text-muted-foreground">✏️</span>}
          {line.added && <span className="ms-1 text-[11px] font-bold text-muted-foreground">➕</span>}
          {line.movedFrom && (
            <span className="ms-1 text-[11px] font-bold text-muted-foreground">
              הועבר מ־<bdi>{line.movedFrom}</bdi>
            </span>
          )}
        </p>
      )}

      <ChipRow line={line} onPick={onChip} />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          data-testid={'review-owner-' + line.key}
          aria-label="אחריות"
          value={line.owners[0] || ''}
          onChange={e => onOwner(e.target.value ? [e.target.value] : [])}
          className="min-h-9 rounded-xl border border-border bg-muted px-2 text-[12px]"
        >
          <option value="">ללא אחריות</option>
          {MEETING_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {!editing && (
          <button type="button" data-testid={'review-edit-' + line.key} className={btn} onClick={() => setEditing(true)}>
            ✏️ עריכה
          </button>
        )}

        {line.chip === 'ems' && (
          <button type="button" data-testid={'review-task-' + line.key} className={btn} onClick={onTask}>
            📋 פרטי המשימה
          </button>
        )}

        <button type="button" data-testid={'review-more-' + line.key} className={btn} onClick={() => setMenu(m => !m)}>
          ⋯
        </button>
      </div>

      {menu && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-muted p-2">
          <label className="text-[12px] font-bold text-muted-foreground" htmlFor={'review-move-' + line.key}>
            העבר לקיבוץ אחר
          </label>
          <select
            id={'review-move-' + line.key}
            data-testid={'review-move-' + line.key}
            value=""
            onChange={e => { if (e.target.value) { onMove(e.target.value); setMenu(false); } }}
            className="min-h-9 rounded-xl border border-border bg-card px-2 text-[12px]"
          >
            <option value="">בחר קיבוץ…</option>
            {others.filter(o => o !== kibbutz).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <button type="button" data-testid={'review-remove-' + line.key} className={btn}
                  onClick={() => { setMenu(false); onRemove(); }}>
            🗑 הסר שורה
          </button>
        </div>
      )}
    </li>
  );
}

// ───────────────────────────── the screen ─────────────────────────────

function ReviewSheet() {
  const qc = useQueryClient();
  const { name: user, isViewer } = useCurrentUser();
  const admin = canReview(!!sigma?.isAdmin?.(), isViewer);

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ReviewDraft | null>(null);
  const [adding, setAdding] = React.useState<string | null>(null);
  const [addText, setAddText] = React.useState('');
  const [taskFor, setTaskFor] = React.useState<{ line: ReviewLine; kibbutz: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Line key → EMS task id, filled in as בצע succeeds per line. Survives a partial failure
  // within the same open review so a retry never re-creates an already-linked task; wiped on
  // ביטול/close and on a fresh start (see cancel()/start()).
  const [created, setCreated] = React.useState<Record<string, string>>({});
  const [createdInternal, setCreatedInternal] = React.useState<Record<string, string>>({});

  const start = React.useCallback((parsed: ParsedMeeting, marked?: string[]) => {
    if (!canReview(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.())) {
      toast.error('מעבר על סיכום ישיבה מוגבל למנהלים');
      return;
    }
    setDraft(draftFromParsed(parsed, { marked }));
    setCreated({});
    setCreatedInternal({});
    setOpen(true);
    track('review-open', parsed.meeting_date || '');
  }, []);

  // Consumed synchronously inside the first render, like the presenter's cold-open flag: the
  // import sheet hands the draft over the moment the chunk resolves, which can be before this
  // component's effects have run.
  const [cold] = React.useState(() => { const p = pending; pending = null; return p; });
  React.useEffect(() => { if (cold) start(cold.parsed, cold.marked); }, [cold, start]);

  React.useEffect(() => {
    opener = start;
    return () => { opener = null; };
  }, [start]);

  // Someone switched to a non-admin mid-review → close rather than leave a write surface up.
  React.useEffect(() => { if (open && !admin) { setOpen(false); setDraft(null); } }, [open, admin]);

  const names = React.useMemo(() => (draft?.sections || []).map(s => s.kibbutz), [draft]);
  const summary = React.useMemo(() => (draft ? reviewSummary(draft) : null), [draft]);

  const cancel = () => {
    // Nothing was written, so there is nothing to undo — the draft simply stops existing.
    setOpen(false); setDraft(null); setAdding(null); setAddText(''); setTaskFor(null);
    setCreated({}); setCreatedInternal({});
  };

  const commit = async () => {
    if (!draft || busy) return;
    if (!draft.meeting_date) { toast.error('חסר תאריך ישיבה'); return; }
    setBusy(true);
    try {
      const r = await saveReview(draft, user, applyReview(draft, user), {
        created,
        // Record as each line lands, not just at the end — if a LATER line throws (it won't,
        // saveReview catches per line, but stay defensive), the earlier successes still stick.
        onCreated: (key, taskId) => setCreated(prev => ({ ...prev, [key]: taskId })),
        createdInternal,
        onInternalCreated: (key, rowId) => setCreatedInternal(prev => ({ ...prev, [key]: rowId })),
      });
      if (r.failed) {
        // The draft stays open and untouched — בצע again only retries the lines still missing
        // a task id (tracked in `created` above), never the ones that already succeeded.
        toast.error(`נוצרו ${r.tasks} משימות, ${r.failed} נכשלו — לחץ שוב כדי להשלים`);
        return;
      }
      await qc.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
      const parts = [`${r.notes} בולטים`];
      if (r.tasks) parts.push(`${r.tasks} משימות`);
      if (r.queued) parts.push(`${r.queued} ייפתחו כשתהיה רשת`);
      if (r.internal) parts.push(`${r.internal} פנימיות`);
      track('review-commit', String(r.notes));
      toast.success(`ישיבת ${dmy(draft.meeting_date)}: ${parts.join(' · ')}`);
      cancel();
    } catch (e: any) {
      toast.error(e?.message || 'לא הצלחתי, נסה שוב');
    } finally { setBusy(false); }
  };

  // §7p: the whole point of this screen is a draft under review — losing it to a stray tap
  // costs the entire meeting summary.
  const reviewGuard = useUnsavedGuard({
    dirty: () => !!draft,
    onDiscard: cancel,
    onClose: cancel,
  });

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) reviewGuard.ask(); }}>
      <SheetContent side="bottom" data-testid="meeting-review" className="max-h-[94svh] overflow-y-auto" {...reviewGuard.contentProps}>
        <SheetHeader className="text-start">
          <SheetTitle>📝 מעבר על הסיכום</SheetTitle>
          <SheetDescription>
            {draft
              ? <>🗓 <bdi>{dmy(draft.meeting_date)}</bdi> · {KIND_LABEL[draft.meeting_kind] || ''} · {names.length} קיבוצים</>
              : '—'}
          </SheetDescription>
        </SheetHeader>
        <EmsGate>
          {draft && (
            <>
              <div className="mt-2 flex flex-col gap-3">
                {draft.sections.map(sec => (
                  <section key={sec.kibbutz} className="rounded-xl border border-border p-2">
                    <div
                      data-testid={'review-section-' + sec.kibbutz}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        let key = '';
                        try { key = e.dataTransfer.getData('text/plain'); } catch { /* no dnd */ }
                        if (key) setDraft(d => (d ? moveLine(d, key, sec.kibbutz) : d));
                      }}
                      className="mb-1.5 flex flex-wrap items-center gap-2"
                    >
                      <span className="text-[14px] font-extrabold"><bdi>{sec.kibbutz}</bdi></span>
                      <span className="text-[12px] text-muted-foreground">{sec.lines.length} שורות</span>
                      <button type="button" data-testid={'review-add-' + sec.kibbutz} className={btn + ' ms-auto'}
                              onClick={() => { setAdding(sec.kibbutz); setAddText(''); }}>
                        ➕ שורה משלי
                      </button>
                    </div>

                    {adding === sec.kibbutz && (
                      <div className="mb-2 flex flex-col gap-2">
                        <textarea
                          data-testid={'review-add-text-' + sec.kibbutz}
                          value={addText}
                          rows={2}
                          autoFocus
                          placeholder="מה עוד צריך לצאת מהקיבוץ הזה"
                          onChange={e => setAddText(e.target.value)}
                          className={field}
                        />
                        <div className="flex gap-2">
                          <button type="button" data-testid={'review-add-save-' + sec.kibbutz} className={btn}
                                  onClick={() => {
                                    setDraft(d => (d ? addLine(d, sec.kibbutz, addText) : d));
                                    setAdding(null); setAddText('');
                                  }}>
                            הוסף
                          </button>
                          <button type="button" className={btn} onClick={() => { setAdding(null); setAddText(''); }}>
                            בטל
                          </button>
                        </div>
                      </div>
                    )}

                    <ul className="flex flex-col gap-2">
                      {sec.lines.map(line => (
                        <LineRow
                          key={line.key}
                          line={line}
                          kibbutz={sec.kibbutz}
                          others={names}
                          onChip={c => setDraft(d => (d ? setChip(d, line.key, c) : d))}
                          onOwner={o => setDraft(d => (d ? setOwner(d, line.key, o) : d))}
                          onEdit={t => setDraft(d => (d ? editLine(d, line.key, t) : d))}
                          onMove={to => setDraft(d => (d ? moveLine(d, line.key, to) : d))}
                          onRemove={() => setDraft(d => (d ? removeLine(d, line.key) : d))}
                          onTask={() => setTaskFor({ line, kibbutz: sec.kibbutz })}
                        />
                      ))}
                      {!sec.lines.length && (
                        <li className="text-[12px] text-muted-foreground">(אין שורות — הקיבוץ נסקר בלי פערים)</li>
                      )}
                    </ul>
                  </section>
                ))}
              </div>

              <div className="sticky bottom-0 mt-3 flex gap-2 border-t border-border bg-background py-2">
                <button
                  type="button"
                  data-testid="review-commit"
                  disabled={busy || !summary}
                  onClick={() => void commit()}
                  className="min-h-[48px] flex-1 rounded-xl bg-brand-grad px-4 text-sm font-bold text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : summaryLabel(summary!)}
                </button>
                <button type="button" data-testid="review-cancel" onClick={cancel}
                        className="min-h-[48px] rounded-xl border border-border px-4 text-sm font-bold">
                  ביטול
                </button>
              </div>
            </>
          )}
        </EmsGate>

        {taskFor && draft && (() => {
          // The prefill is taken from the bundle, so the modal shows exactly what בצע will
          // send for this line — overrides included.
          const hit = applyReview(draft).emsTasks.find(t => t.key === taskFor.line.key);
          if (!hit) return null;
          return (
            <TaskModal
              line={taskFor.line}
              kibbutz={taskFor.kibbutz}
              prefill={hit.task}
              onSave={patch => setDraft(d => (d ? setTask(d, taskFor.line.key, patch) : d))}
              onClose={() => setTaskFor(null)}
            />
          );
        })()}
        {reviewGuard.prompt}
      </SheetContent>
    </Sheet>
  );
}

export function MeetingReview() {
  return (
    <SigmaProviders>
      <ReviewSheet />
    </SigmaProviders>
  );
}

/** Mounted on demand by the import sheet's hand-off (mount() is idempotent). */
export function mountMeetingReview(): boolean {
  return mount('sigma-meeting-review', MeetingReview);
}

export { CHIP_LABELS };
