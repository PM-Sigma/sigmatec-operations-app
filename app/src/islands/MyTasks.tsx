// המשימות שלי — #sigma-my-tasks (round 4, Package X; redesigned round 5, Task U4).
//
// עידן, 22.9: "המשימות הפנימיות שלי" was a floating strip pinned above the bottom bar on every
// page. It covered the end of every list, it carried a padlock as if the work were a secret,
// and it showed only the 🔒 half: his EMS work lived somewhere else entirely. The strip is
// gone. This is one sheet with ALL of it, grouped by the place the work belongs to: כללי
// (company-wide) first, then the kibbutzim in Hebrew order.
//
// Round 5, Task U4: SectionBlock/ListRow throughout, taskTags(...) chips instead of loose emoji,
// and closing a 🔒 row is undoable — the write commits only once the 5s toast window closes
// (see undoable() / UNDO_MS in lib/myTasks.ts), so a mis-tap is free to take back.
//
// Three ways in, all of them the same sheet: the button next to the bell in the header (with
// the count on it), the ⋯ עוד row, and, once it exists, the personal area. `openMyTasks()` is
// the single entry point, so a fourth caller is one line.
//
// Every decision here is pure and golden-tested in app/src/lib/myTasks.ts.
import * as React from 'react';
import { CalendarDays, Check, Clock, ListTodo, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { IconBubble } from '@/components/ui/icon-bubble';
import { EmptyState } from '@/components/ui/empty-state';
import { Tag } from '@/components/ui/chip';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { dueText, isOverdue, statusLabel } from '@/lib/emsTasks';
import type { ListTask } from '@/lib/taskList';
import { dueLabel, isOverdueInternal, type InternalTaskRow } from '@/lib/internalTasks';
import { myTaskGroups, MY_TASKS_TITLE, taskTags, undoable, UNDO_MS, type MyTaskGroup, type TaskTag } from '@/lib/myTasks';
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

const TAG_ICON = { Clock, CalendarDays, Lock } as const;

/** taskTags(...) chips (round 5 L3) — up to 3, a 4th+ collapses into "+N". */
function TagsRow({ tags }: { tags: TaskTag[] }) {
  if (!tags.length) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {tags.map((t, i) => {
        const Icon = t.icon ? TAG_ICON[t.icon] : null;
        return (
          <Tag key={i} role={t.role}>
            {Icon && <Icon aria-hidden className="h-3 w-3" />}
            <bdi>{t.text}</bdi>
          </Tag>
        );
      })}
    </span>
  );
}

// ───────────────────────────── rows ─────────────────────────────

function EmsRow({ task, now, onClose }: { task: ListTask; now: Date; onClose: () => void }) {
  const late = isOverdue(task, now);
  const due = dueText(task);
  const tags = taskTags({ status: task.status, due, late, priority: task.priority, internal: false });
  return (
    <ListRow
      data-task={task.id}
      title={<bdi>{task.title}</bdi>}
      meta={<><span>{statusLabel(task.status)}</span><TagsRow tags={tags} /></>}
      onClick={() => {
        track('my-tasks-open', 'ems');
        onClose();
        try { sigma.openKibbutzEmsTask?.(task.id); } catch { /* legacy not up */ }
      }}
    />
  );
}

/**
 * A 🔒 internal row. Tapping "סימון כטופל" is instant to the eye (the check draws, the phone
 * buzzes) but the write is undoable (spec §Review Focus 2): the row STAYS in the list, showing
 * the drawn check, for the whole `UNDO_MS` window. `commit()` fires the real write only once
 * that window closes with no cancel; the row then collapses (`grid-template-rows`, base) and
 * `onCommitted` drops it from the parent's own render so a stale item can't reappear before the
 * next refetch lands.
 */
function InternalRow({ row, canAct, onCommitted, groupKibbutz, groupReal, onClose }: {
  row: InternalTaskRow; canAct: boolean; onCommitted: (id: string) => void;
  groupKibbutz: string; groupReal: boolean; onClose: () => void;
}) {
  const [closing, setClosing] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const late = isOverdueInternal(row);
  const due = dueLabel(row);
  const tags = taskTags({ due, late, internal: true });

  const close = () => {
    try { navigator.vibrate?.(10); } catch { /* no vibration API */ }
    setClosing(true);
    const handle = undoable(async () => {
      await writeToggleDone(row);
      track('my-tasks-done', row.id);
    }, UNDO_MS);
    const t = toast('המשימה סומנה כטופלה', {
      duration: UNDO_MS,
      action: {
        label: 'ביטול',
        onClick: () => { if (handle.cancel()) setClosing(false); },
      },
    });
    handle.done
      .then(committed => {
        if (committed === null) return; // cancelled — nothing was written, row stays as-is
        setCollapsed(true);
        window.setTimeout(() => onCommitted(row.id), 220);
      })
      .catch((e: any) => {
        toast.dismiss(t);
        toast.error(e?.message || 'הפעולה נכשלה');
        setClosing(false);
      });
  };

  // Round 6, 1.2 (עידן's phone QA): the whole row opens the kibbutz the task belongs to —
  // before this only the group's own "site name" ("פתיחה" on SectionBlock) was tappable, and
  // an internal task row itself did nothing except its own ✓ button. `openRow` is a no-op for
  // the company-wide group (there is no kibbutz to open), matching GroupBlock's own `real` gate.
  const openRow = groupReal
    ? () => { track('my-tasks-open', 'internal'); onClose(); try { sigma.openKibbutzModal?.(groupKibbutz); } catch { /* legacy not up */ } }
    : undefined;

  return (
    <div
      className="grid transition-[grid-template-rows]"
      style={{
        gridTemplateRows: collapsed ? '0fr' : '1fr',
        transitionDuration: 'var(--s-motion-base)',
        transitionTimingFunction: 'var(--s-ease-standard)',
      }}
    >
      <div className="overflow-hidden">
        {/* A plain div, not ListRow's own onClick (that renders a <button> — nesting the ✓
            IconBubble's <button> inside it would be invalid markup). The stopPropagation span
            around the ✓ keeps it working on its own without also opening the kibbutz. */}
        <div
          data-testid={openRow ? 'internal-row-open' : undefined}
          role={openRow ? 'button' : undefined}
          // An EXPLICIT aria-label, not left to content-based computation: without it this
          // wrapper's accessible name is built from every descendant's own name, so it would
          // ALSO match "סימון כטופל" (the nested ✓ button's aria-label) — and since it is the
          // OUTER element, `getByRole('button', { name: 'סימון כטופל' }).first()` picked THIS
          // wrapper instead of the real button, opening the kibbutz instead of closing the
          // task (round 6 QA 1.2 fix-forward — caught by my-tasks.spec.ts's own undo test).
          aria-label={openRow ? row.title : undefined}
          tabIndex={openRow ? 0 : undefined}
          onClick={openRow}
          onKeyDown={openRow ? (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(); }
          } : undefined}
          className={openRow ? 'cursor-pointer' : undefined}
        >
          <ListRow
            className="internal-task-row"
            data-id={row.id}
            title={<bdi>{row.title}</bdi>}
            meta={<TagsRow tags={tags} />}
            trailing={canAct ? (
              <span onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <IconBubble
                  size={48}
                  label="סימון כטופל"
                  onClick={close}
                  className={closing ? 'my-task-check-done' : undefined}
                  icon={<Check aria-hidden className="h-5 w-5" />}
                />
              </span>
            ) : null}
          />
        </div>
      </div>
    </div>
  );
}

function GroupBlock({ group, now, canAct, onClose, onCommitted }: {
  group: MyTaskGroup; now: Date; canAct: boolean; onClose: () => void; onCommitted: (id: string) => void;
}) {
  return (
    // data-group: SectionBlock takes no arbitrary props, so the group identity my-tasks.spec.ts
    // (and this file's own tests) key off lives on a thin wrapper instead of the section itself.
    <div className="my-task-group mb-3" data-group={group.kibbutz}>
      <SectionBlock
        title={group.company ? 'כללי' : group.kibbutz}
        count={group.count}
        action={group.real ? {
          label: 'פתיחה',
          onClick: () => { onClose(); try { sigma.openKibbutzModal?.(group.kibbutz); } catch { /* legacy not up */ } },
        } : undefined}
      >
        {group.ems.map(t => <EmsRow key={'e:' + t.id} task={t} now={now} onClose={onClose} />)}
        {group.internal.map(r => (
          <InternalRow
            key={'i:' + r.id}
            row={r}
            canAct={canAct}
            onCommitted={onCommitted}
            groupKibbutz={group.kibbutz}
            groupReal={group.real}
            onClose={onClose}
          />
        ))}
      </SectionBlock>
    </div>
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
  // Rows the undo window already committed, hidden locally so a stale item can never flash
  // back in before the underlying query refetches.
  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    const on = () => { pendingOpen = false; setOpen(true); track('my-tasks-open', 'sheet'); };
    window.addEventListener(MY_TASKS_OPEN_EVENT, on as EventListener);
    return () => window.removeEventListener(MY_TASKS_OPEN_EVENT, on as EventListener);
  }, []);

  const internal = useInternalTasks();
  const now = new Date();
  const groups = React.useMemo(() => {
    const rows = (internal.data || []).filter(r => !hidden.has(r.id));
    return myTaskGroups(emsTasks(), rows, { me, now });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internal.data, me, tick, open, hidden]);
  const total = groups.reduce((n, g) => n + g.count, 0);

  const onCommitted = React.useCallback((id: string) => {
    setHidden(s => (s.has(id) ? s : new Set(s).add(id)));
  }, []);

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
          groups.map(g => (
            <GroupBlock key={g.kibbutz} group={g} now={now} canAct={canAct} onClose={() => setOpen(false)} onCommitted={onCommitted} />
          ))
        ) : (
          <EmptyState icon={<ListTodo />} title="אין משימות פתוחות." hint="משימה חדשה נפתחת מכרטיס הקיבוץ." />
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
