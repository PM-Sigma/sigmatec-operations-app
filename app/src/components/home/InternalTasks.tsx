// 🔒 internal_tasks — Task 26, reshaped 22.9 (עידן, phone QA round D3).
//
// Two surfaces over one shared TanStack query (['internalTasks']):
//   · the CARD at home reads only — title, the owner's dot + name, the due date. No checkbox,
//     no promote, no input: "no internal-task actions outside the card";
//   · the kibbutz MODAL (islands/InternalModal.tsx) carries the actions — done, promote to
//     EMS, and the ➕ that opens the form (InternalTaskSheet) with owner · due · priority · kind.
// ONE module-scope bus listener for `internal-tasks-changed`, so 54 cards + המשימות שלי
// invalidate together; every write funnels through the pure decisions in lib/internalTasks.ts.
//
// Round 4, Package X: the third surface, the floating "המשימות הפנימיות שלי" strip, is gone.
// A person's own rows now live in islands/MyTasks.tsx next to his EMS work.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sigma, sigmaBus, useCurrentUser } from '@/bridge';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { queryClient } from '@/lib/query';
import {
  canWriteInternal, countBadge, dueLabel, isOverdueInternal, openFor, priorityLabelOf,
  promoteToEms, toggleDone, type InternalTaskExtra, type InternalTaskRow,
} from '@/lib/internalTasks';

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

/**
 * Create a row. The three 22.9 fields ride along when given; a database that has not had
 * db/internal_tasks_fields.sql applied yet refuses unknown columns, and then the row is
 * written in the old shape rather than not at all — the title and the owner are the task.
 */
export async function createInternalTask(
  title: string, kibbutz: string | null, owner: string | null, createdBy: string, extra?: InternalTaskExtra,
): Promise<void> {
  const t = title.trim();
  if (!t) return;
  const sb = await getSupabase();
  const base = { title: t, kibbutz, owner: owner || null, created_by: createdBy };
  const full = extra ? { ...base, ...extra } : base;
  try {
    await sbWrite(() => sb.from('internal_tasks').insert(full).select('id').single());
  } catch (e: any) {
    if (!extra || !/column|schema/i.test(String(e?.message || ''))) throw e;
    await sbWrite(() => sb.from('internal_tasks').insert(base).select('id').single());
  }
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

function OwnerDot({ owner }: { owner?: string | null }) {
  if (!owner) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--brand-2)]" />
      {owner}
    </span>
  );
}

function DueChip({ row }: { row: InternalTaskRow }) {
  const d = dueLabel(row);
  if (!d) return null;
  const late = isOverdueInternal(row);
  return (
    <span className={'rounded-md border border-border bg-card px-1.5 py-px text-[10px] ' + (late ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
      {late ? '⏰' : '📅'} <bdi>{d}</bdi>
    </span>
  );
}

/** One row. `readOnly` (the card) shows the facts; the modal gets the actions. */
function InternalRow({ row, kibbutz, canAct, readOnly = false }: {
  row: InternalTaskRow; kibbutz: string | null; canAct: boolean; readOnly?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); }
    catch (e: any) { toast.error(e?.message || 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  };
  const actions = canAct && !readOnly;
  return (
    <li data-id={row.id} className="internal-task-row flex items-start gap-2 py-[5px] text-[14px] leading-[1.5]">
      {actions ? (
        <button
          type="button"
          disabled={busy}
          aria-label={row.done ? 'בטל סימון' : 'סמן כטופל'}
          onClick={e => { e.stopPropagation(); void act(() => writeToggleDone(row), row.done ? 'הסימון בוטל' : 'סומן כטופל'); }}
          className="mt-[2px] h-4 w-4 shrink-0 rounded border border-border text-[11px] leading-4 text-muted-foreground hover:bg-muted"
        >
          {row.done ? '✓' : ''}
        </button>
      ) : (
        <span aria-hidden className="mt-[3px] text-[10px] text-muted-foreground">•</span>
      )}
      <span className="min-w-0 flex-1">
        <span className={row.done ? 'text-muted-foreground line-through' : ''}>{row.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <OwnerDot owner={row.owner} />
          <DueChip row={row} />
          {!readOnly && row.priority && (
            <span className="rounded-md border border-border bg-card px-1.5 py-px text-[10px] text-muted-foreground">{priorityLabelOf(row.priority)}</span>
          )}
          {!readOnly && row.kind && (
            <span className="rounded-md border border-border bg-card px-1.5 py-px text-[10px] text-muted-foreground">{row.kind}</span>
          )}
        </span>
      </span>
      {actions && !row.done && kibbutz && (
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

const InternalTaskSheet = React.lazy(() => import('@/components/home/InternalTaskSheet'));

/** The card section at home — READ ONLY (22.9). A soft dashed rule separates it from the EMS tasks. */
export function InternalTasksSection({ kibbutz }: { kibbutz: string; canAct?: boolean }) {
  const { data, isLoading } = useInternalTasks();
  if (isLoading && !data) return null;
  const rows = openFor(data, kibbutz);
  if (!rows.length) return null;
  return (
    <div className="card-internal-tasks mt-2 border-t border-dashed border-border pt-1.5">
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        <span>🔒 משימות פנימיות</span>
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold"><bdi>{rows.length}</bdi></span>
      </div>
      <ul>{rows.map(r => <InternalRow key={r.id} row={r} kibbutz={kibbutz} canAct={false} readOnly />)}</ul>
    </div>
  );
}

/**
 * The two bubbles under the card's tasks (22.9, D3): the ONLY actions the home card offers
 * on tasks. ➕ משימת EMS opens the kibbutz modal and the EMS task form on top of it;
 * ➕ משימה פנימית opens the internal form right here.
 */
export function TaskAdders({ kibbutz }: { kibbutz: string }) {
  const { isViewer } = useCurrentUser();
  const [open, setOpen] = React.useState(false);
  if (!canWriteInternal(isViewer)) return null;
  const addEms = () => {
    try {
      sigma.openKibbutzModal?.(kibbutz, 'meetings');
      const w = window as any;
      if (typeof w.createEmsTaskForKibbutz === 'function') setTimeout(() => { void w.createEmsTaskForKibbutz(); }, 60);
    } catch { /* legacy not up */ }
  };
  const cls = 'inline-flex min-h-[32px] items-center gap-1 rounded-full border border-dashed border-border bg-card px-2.5 text-[12px] font-semibold text-muted-foreground active:scale-[.97]';
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
      <button type="button" className={cls} onClick={addEms} data-testid="add-ems-task">➕ משימת EMS</button>
      <button type="button" className={cls} onClick={() => setOpen(true)} data-testid="add-internal-task">➕ משימה פנימית</button>
      {open && (
        <React.Suspense fallback={null}>
          <InternalTaskSheet kibbutz={kibbutz} open={open} onOpenChange={setOpen} />
        </React.Suspense>
      )}
    </div>
  );
}

/** The modal panel — rows with actions, and the ➕. Mounted by islands/InternalModal.tsx. */
export function InternalTasksPanel({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  const { data, isLoading } = useInternalTasks();
  const [open, setOpen] = React.useState(false);
  if (isLoading && !data) return null;
  const rows = openFor(data, kibbutz);
  const badge = countBadge(data, kibbutz);
  if (!badge && !canAct) return null;
  return (
    <div className="mb-3" data-testid="internal-panel">
      <div className="mb-1 flex items-center gap-1.5">
        <h4 className="flex-1 text-[14px] font-bold">🔒 משימות פנימיות</h4>
        {badge > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><bdi>{badge}</bdi></span>}
        {canAct && (
          <button type="button" onClick={() => setOpen(true)}
                  className="min-h-[32px] rounded-full border border-border bg-card px-2.5 text-[12px] font-semibold">➕ משימה פנימית</button>
        )}
      </div>
      {rows.length > 0
        ? <ul className="rounded-[12px] border border-border bg-card px-2.5">{rows.map(r => <InternalRow key={r.id} row={r} kibbutz={kibbutz} canAct={canAct} />)}</ul>
        : <p className="text-[12.5px] text-muted-foreground">אין משימות פנימיות פתוחות</p>}
      {open && (
        <React.Suspense fallback={null}>
          <InternalTaskSheet kibbutz={kibbutz} open={open} onOpenChange={setOpen} />
        </React.Suspense>
      )}
    </div>
  );
}

export { canWriteInternal };
