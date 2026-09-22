// ✅ המשימות שלי — #sigma-my-tasks (round 4, Package X).
//
// עידן, 22.9: "המשימות הפנימיות שלי" was a floating strip pinned above the bottom bar on every
// page. It covered the end of every list, it carried a padlock as if the work were a secret,
// and it showed only the 🔒 half: his EMS work lived somewhere else entirely. The strip is
// gone. This is one sheet with ALL of it, grouped by the place the work belongs to: חברה
// first, then the kibbutzim in Hebrew order.
//
// Three ways in, all of them the same sheet: the button next to the bell in the header (with
// the count on it), the ⋯ עוד row, and, once it exists, the personal area. `openMyTasks()` is
// the single entry point, so a fourth caller is one line.
//
// Every decision here is pure and golden-tested in app/src/lib/myTasks.ts.
import * as React from 'react';
import { ListTodo } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { dueText, isOverdue, priorityLabel, statusLabel } from '@/lib/emsTasks';
import { EMPTY_LIST, type ListTask } from '@/lib/taskList';
import { dueLabel, isOverdueInternal, type InternalTaskRow } from '@/lib/internalTasks';
import { myTaskGroups, MY_TASKS_TITLE, type MyTaskGroup } from '@/lib/myTasks';
import { useInternalTasks, writeToggleDone } from '@/components/home/InternalTasks';

export const MY_TASKS_OPEN_EVENT = 'sigma-open-my-tasks';

// The open latch every lazy island carries (see islands/Gaps.tsx for the long version):
// `mount()` only SCHEDULES the first render, so an event dispatched in that gap would reach
// nobody. Attached when the CHUNK evaluates, drained by the component's `useState` initializer.
let pendingOpen = false;
try { window.addEventListener(MY_TASKS_OPEN_EVENT, () => { pendingOpen = true; }); } catch { /* no DOM */ }

/** Open המשימות שלי from anywhere: the header button, ⋯ עוד, the personal area. */
export function openMyTasks(): void {
  pendingOpen = true;
  try { window.dispatchEvent(new CustomEvent(MY_TASKS_OPEN_EVENT)); } catch { /* no DOM */ }
}

/** The EMS tasks the shared cache holds. Offline-first, exactly like the calendar's list. */
function emsTasks(): ListTask[] {
  try { return (sigma.emsCacheData?.()?.tasks || []) as ListTask[]; } catch { return []; }
}

// ───────────────────────────── rows ─────────────────────────────

function EmsRow({ task, now, onClose }: { task: ListTask; now: Date; onClose: () => void }) {
  const late = isOverdue(task, now);
  const due = dueText(task);
  return (
    <li className="my-task-row border-b border-border last:border-b-0" data-task={task.id}>
      <button
        type="button"
        className="flex w-full flex-col items-start gap-1 py-2.5 text-start"
        onClick={() => {
          track('my-tasks-open', 'ems');
          onClose();
          try { sigma.openKibbutzEmsTask?.(task.id); } catch { /* legacy not up */ }
        }}
      >
        <span className="text-[14px] font-semibold leading-snug text-foreground"><bdi>{task.title}</bdi></span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-border bg-card px-1.5 py-px text-[11px] text-muted-foreground">{statusLabel(task.status)}</span>
          {due ? (
            <span className={'rounded-md border border-border bg-card px-1.5 py-px text-[11px] ' + (late ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
              {late ? '⏰' : '📅'} <bdi>{due}</bdi>
            </span>
          ) : null}
          {task.priority ? (
            <span className="my-task-priority rounded-full bg-muted px-2 py-px text-[11px] font-semibold text-muted-foreground">
              {priorityLabel(task.priority)}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function InternalRow({ row, canAct }: { row: InternalTaskRow; canAct: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const late = isOverdueInternal(row);
  const due = dueLabel(row);
  const markDone = async () => {
    setBusy(true);
    try { await writeToggleDone(row); track('my-tasks-done', row.id); toast.success('סומן כטופל'); }
    catch (e: any) { toast.error(e?.message || 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  };
  return (
    <li className="my-task-row internal-task-row flex items-start gap-2 border-b border-border py-2.5 last:border-b-0" data-id={row.id}>
      {canAct ? (
        <button
          type="button"
          disabled={busy}
          aria-label="סמן כטופל"
          onClick={() => void markDone()}
          className="mt-[3px] h-4 w-4 shrink-0 rounded border border-border text-[11px] leading-4 text-muted-foreground hover:bg-muted"
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="text-[14px] font-semibold leading-snug text-foreground"><bdi>{row.title}</bdi></span>
        {due ? (
          <span className={'ms-1.5 rounded-md border border-border bg-card px-1.5 py-px text-[11px] ' + (late ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
            {late ? '⏰' : '📅'} <bdi>{due}</bdi>
          </span>
        ) : null}
      </span>
      {/* the padlock is a small mark at the END of the row, never the name of the list */}
      <span title="משימה פנימית" className="mt-[3px] shrink-0 text-[11px] opacity-60">🔒</span>
    </li>
  );
}

function GroupBlock({ group, now, canAct, onClose }: {
  group: MyTaskGroup; now: Date; canAct: boolean; onClose: () => void;
}) {
  return (
    <section className="my-task-group mb-3 rounded-[12px] border border-border bg-card px-3 py-1.5" data-group={group.kibbutz}>
      <header className="flex items-center gap-1.5 border-b border-border py-1.5">
        {group.real ? (
          <button
            type="button"
            className="flex-1 text-start text-[13px] font-extrabold text-foreground"
            onClick={() => { onClose(); try { sigma.openKibbutzModal?.(group.kibbutz); } catch { /* legacy not up */ } }}
          >
            🏘️ <bdi>{group.kibbutz}</bdi>
          </button>
        ) : (
          <span className="flex-1 text-[13px] font-extrabold text-foreground">
            {group.company ? '📌 ' : ''}<bdi>{group.kibbutz}</bdi>
          </span>
        )}
        <span className="rounded-full bg-muted px-2 py-px text-[11px] font-bold text-muted-foreground"><bdi>{group.count}</bdi></span>
      </header>
      <ul>
        {group.ems.map(t => <EmsRow key={'e:' + t.id} task={t} now={now} onClose={onClose} />)}
        {group.internal.map(r => <InternalRow key={'i:' + r.id} row={r} canAct={canAct} />)}
      </ul>
    </section>
  );
}

// ───────────────────────────── the sheet ─────────────────────────────

function MyTasksIsland() {
  const [open, setOpen] = React.useState(() => {
    if (pendingOpen) { pendingOpen = false; return true; }
    return false;
  });
  const { name: me, role } = useCurrentUser();
  const canAct = role !== 'viewer';
  const [tick, setTick] = React.useState(0);
  useSigmaEvent('ems-cache-synced', () => setTick(t => t + 1));

  React.useEffect(() => {
    const on = () => { pendingOpen = false; setOpen(true); track('my-tasks-open', 'sheet'); };
    window.addEventListener(MY_TASKS_OPEN_EVENT, on as EventListener);
    return () => window.removeEventListener(MY_TASKS_OPEN_EVENT, on as EventListener);
  }, []);

  const internal = useInternalTasks();
  const now = new Date();
  const groups = React.useMemo(
    () => myTaskGroups(emsTasks(), internal.data || [], { me, now }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [internal.data, me, tick, open],
  );
  const total = groups.reduce((n, g) => n + g.count, 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" data-testid="my-tasks" className="max-h-[88svh] overflow-y-auto">
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ListTodo className="h-5 w-5" aria-hidden /> {MY_TASKS_TITLE}
            {total > 0 ? (
              <span data-testid="my-tasks-total" className="rounded-full bg-muted px-2 py-px text-[12px] font-bold text-muted-foreground"><bdi>{total}</bdi></span>
            ) : null}
          </SheetTitle>
          <SheetDescription>המשימות והמעקבים שפתוחים עליך, לפי קיבוץ</SheetDescription>
        </SheetHeader>
        {internal.isLoading && !internal.data ? (
          <div className="flex flex-col gap-2 py-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : groups.length ? (
          groups.map(g => <GroupBlock key={g.kibbutz} group={g} now={now} canAct={canAct} onClose={() => setOpen(false)} />)
        ) : (
          <p data-testid="my-tasks-empty" className="py-5 text-center text-[14px] font-semibold text-muted-foreground">{EMPTY_LIST}</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function MyTasks() {
  return <SigmaProviders><MyTasksIsland /></SigmaProviders>;
}

export function mountMyTasks(): boolean {
  const ok = mount('sigma-my-tasks', MyTasks);
  if (!ok) return false;
  (window as any).sigmaOpenMyTasks = openMyTasks;
  registerMoreItem({
    id: 'my-tasks',
    label: MY_TASKS_TITLE,
    icon: 'ListTodo',
    group: 'app',
    onSelect: openMyTasks,
  });
  return true;
}
