// 🔒 internal_tasks — Task 26 (company-process spec §2 + §8b: no due dates, no reminders).
//
// Same shape as MeetingNotes.tsx: one shared TanStack query (['internalTasks']), ONE
// module-scope bus listener for `internal-tasks-changed` so 54 cards + "היום שלי" invalidate
// together instead of one listener each, and every write funnels through the pure decisions
// in lib/internalTasks.ts.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sigma, sigmaBus, useCurrentUser } from '@/bridge';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { queryClient } from '@/lib/query';
import { canWriteInternal, countBadge, myOpen, openFor, promoteToEms, toggleDone, type InternalTaskRow } from '@/lib/internalTasks';

export const INTERNAL_QUERY_KEY = ['internalTasks'] as const;
export const INTERNAL_TASKS_CHANGED = 'internal-tasks-changed' as const;

export async function fetchInternalTasks(): Promise<InternalTaskRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('internal_tasks').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as InternalTaskRow[];
}

let listening = false;
function listenForInternalTasksChanges(): void {
  if (listening || !sigmaBus) return;
  listening = true;
  sigmaBus.addEventListener(INTERNAL_TASKS_CHANGED, () => {
    void queryClient.invalidateQueries({ queryKey: INTERNAL_QUERY_KEY });
  });
}

export function useInternalTasks() {
  React.useEffect(listenForInternalTasksChanges, []);
  return useQuery({ queryKey: INTERNAL_QUERY_KEY, queryFn: fetchInternalTasks });
}

export function emitInternalTasksChanged(detail?: Record<string, unknown>): void {
  try { sigmaBus?.dispatchEvent(new CustomEvent(INTERNAL_TASKS_CHANGED, { detail })); } catch { /* no bus */ }
}

// ───────────────────────────── writes ─────────────────────────────

export async function createInternalTask(
  title: string, kibbutz: string | null, owner: string | null, createdBy: string,
): Promise<void> {
  const t = title.trim();
  if (!t) return;
  const sb = await getSupabase();
  await sbWrite(() => sb.from('internal_tasks')
    .insert({ title: t, kibbutz, owner: owner || null, created_by: createdBy })
    .select('id').single());
  emitInternalTasksChanged({ created: true });
}

export async function writeToggleDone(row: InternalTaskRow): Promise<void> {
  const next = toggleDone(row);
  const sb = await getSupabase();
  await sbWrite(() => sb.from('internal_tasks').update({ done: next.done }).eq('id', row.id).select('id').single());
  emitInternalTasksChanged({ id: row.id, done: next.done });
}

/** ⬆ הפוך למשימת EMS — create the EMS task, THEN mark the internal row done. Never the reverse:
 *  a failed EMS create must leave the row open so it can be retried. */
export async function promoteInternalTask(row: InternalTaskRow, kibbutz: string): Promise<void> {
  const res = (await sigma.createTask(promoteToEms(row, kibbutz))) as any;
  if (res && res.error) throw new Error(String(res.error));
  await writeToggleDone({ ...row, done: false });
}

// ───────────────────────────── rows ─────────────────────────────

function InternalRow({ row, kibbutz, canAct }: { row: InternalTaskRow; kibbutz: string | null; canAct: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); }
    catch (e: any) { toast.error(e?.message || 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  };
  return (
    <li data-id={row.id} className="internal-task-row flex items-start gap-2 py-[5px] text-[14.5px] leading-[1.55]">
      {canAct ? (
        <button
          type="button"
          disabled={busy}
          aria-label={row.done ? 'בטל סימון' : 'סמן כטופל'}
          onClick={e => { e.stopPropagation(); void act(() => writeToggleDone(row), row.done ? 'הסימון בוטל' : 'סומן כטופל'); }}
          className="mt-[1px] h-4 w-4 shrink-0 rounded border border-border text-[11px] leading-4 text-muted-foreground hover:bg-muted"
        >
          {row.done ? '✓' : ''}
        </button>
      ) : (
        <span aria-hidden className="mt-[3px] text-[10px] text-muted-foreground">•</span>
      )}
      <span className="min-w-0 flex-1">
        <span className={row.done ? 'text-muted-foreground line-through' : ''}>{row.title}</span>
        {row.owner && (
          <span className="ms-1.5 inline-flex rounded-full bg-muted px-1.5 py-px align-middle text-[10px] font-semibold text-muted-foreground">
            {row.owner}
          </span>
        )}
      </span>
      {canAct && !row.done && kibbutz && (
        <button
          type="button"
          disabled={busy}
          title="הפוך למשימת EMS"
          onClick={e => { e.stopPropagation(); void act(() => promoteInternalTask(row, kibbutz), 'נפתחה משימה ב-EMS'); }}
          className="internal-task-promote shrink-0 rounded-md px-1 text-[13px] leading-5 text-muted-foreground hover:bg-muted"
        >
          ⬆
        </button>
      )}
    </li>
  );
}

/** The kibbutz-card section, beside the EMS tasks (§7k order: EMS tasks → notes → 🔒). */
export function InternalTasksSection({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  const { data, isLoading } = useInternalTasks();
  const { name: createdBy } = useCurrentUser();
  const [draft, setDraft] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  if (isLoading && !data) return null;
  const rows = openFor(data, kibbutz);
  const badge = countBadge(data, kibbutz);
  if (!badge && !canAct) return null;   // nothing to show and no way to add — the section is a no-op

  const submit = async () => {
    const t = draft.trim();
    if (!t) return;
    setAdding(true);
    // No owner-picker on the card (spec §2 names no per-person assignment UI) — a task
    // someone adds is his own until reassigned, which is what makes it show up under his own
    // "היום שלי" without a second step.
    try { await createInternalTask(t, kibbutz, createdBy, createdBy); setDraft(''); }
    catch (e: any) { toast.error(e?.message || 'ההוספה נכשלה'); }
    finally { setAdding(false); }
  };

  return (
    <div className="card-internal-tasks mt-2.5 border-t border-dashed border-border pt-2">
      <div className="mb-0.5 flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-muted-foreground">🔒</span>
        {badge > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground"><bdi>{badge}</bdi></span>
        )}
      </div>
      {rows.length > 0 && (
        <ul>{rows.map(r => <InternalRow key={r.id} row={r} kibbutz={kibbutz} canAct={canAct} />)}</ul>
      )}
      {canAct && (
        <div className="mt-1 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
            placeholder="משימה פנימית חדשה…"
            disabled={adding}
            className="internal-task-input min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[13px]"
          />
          <button
            type="button"
            disabled={adding || !draft.trim()}
            onClick={() => void submit()}
            className="shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            ➕
          </button>
        </div>
      )}
    </div>
  );
}

/** "היום שלי" — the person's own open 🔒 rows, company-wide and at every kibbutz. Mounted
 *  standalone into `#sigma-pm-today` (index.html) — no kibbutz context, so no ⬆ promote here. */
export function MyInternalTasks({ person, canAct }: { person: string; canAct: boolean }) {
  const { data, isLoading } = useInternalTasks();
  if (isLoading && !data) return null;
  const rows = myOpen(data, person);
  if (!rows.length) return null;
  return (
    <div className="my-internal-tasks">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[12px] font-bold text-muted-foreground">🔒 המשימות הפנימיות שלי</span>
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground"><bdi>{rows.length}</bdi></span>
      </div>
      <ul>{rows.map(r => <InternalRow key={r.id} row={r} kibbutz={r.kibbutz ?? null} canAct={canAct} />)}</ul>
    </div>
  );
}

export { canWriteInternal };
