// 📋 Open EMS tasks on a kibbutz card, IN FULL (spec §4 Part C). Reads the same shared cache
// the legacy widget used (`sigma.emsCacheTasksForKibbutz`) and re-renders on `ems-cache-synced`.
//
// Replaces `renderCardEmsTasks`/`applyCardEmsWidgets` (js/src/13-ems.js), which task-3-brief's
// REVISION 2 delta removes from `sigma.decorateCards()` once this ports — the legacy kibbutz
// TASK MODAL (`prepModalEmsSection`, js/src/14-calendar.js) is a separate surface and is
// untouched. Rendered by KibbutzCard right after <MeetingNotes>, so the card still reads
// name → notes → EMS tasks (spec §3.3, unchanged by this task).
//
// §5.1b (field-worker view): this component shows the SAME open tasks to every role — tasks
// ARE field work — and carries no admin-only affordance (no create/edit/delete here; that
// stays inside the kibbutz modal). Nothing here needs `sigma.getRole()`.
import * as React from 'react';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { sortTasksForCard, taskMeta, EMS_STATUS_LABEL, type CardEmsTask } from '@/lib/emsTasks';

// Pending עידן's final word (task-3-brief REVISION 2 delta): the spec (§4, "No line-clamp —
// D5") wants the full description everywhere, but the controller asked for a phone compromise
// until he confirms — clamp to 2 lines under `md` with a per-task "עוד" toggle, remembered only
// in this component's memory (never persisted). Flip this one constant to `false` to drop the
// phone clamp and always show the full description, matching the spec's default exactly.
const CLAMP_MOBILE_DESCRIPTION = true;

/** Live snapshot of one kibbutz's open tasks, refreshed on mount and on every cache sync. */
function useCardEmsTasks(kibbutz: string): CardEmsTask[] {
  const read = React.useCallback((): CardEmsTask[] => {
    try { return (sigma?.emsCacheTasksForKibbutz?.(kibbutz) as CardEmsTask[]) || []; }
    catch { return []; }
  }, [kibbutz]);
  const [tasks, setTasks] = React.useState<CardEmsTask[]>(read);
  React.useEffect(() => { setTasks(read()); }, [read]);
  useSigmaEvent('ems-cache-synced', () => setTasks(read()));
  return tasks;
}

function PriorityDot({ priority }: { priority?: string }) {
  const tone =
    priority === 'urgent' ? 'bg-destructive' :
    priority === 'high' ? 'bg-[color:var(--sigma-warn)]' :
    priority === 'low' ? 'bg-muted-foreground/40' : 'bg-muted-foreground';
  return <span aria-hidden className={'t-dot inline-block h-2 w-2 shrink-0 rounded-full ' + tone} />;
}

function EmsTaskRow({
  task, expanded, onToggle,
}: {
  task: CardEmsTask;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = React.useMemo(() => taskMeta(task), [task]);
  const clamp = CLAMP_MOBILE_DESCRIPTION && !expanded;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={e => { e.stopPropagation(); sigma.openKibbutzEmsTask(task.id); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sigma.openKibbutzEmsTask(task.id); } }}
      className={
        'card-ems-task status-' + task.status + (meta.overdue ? ' overdue' : '') + ' ' +
        'flex cursor-pointer flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2 transition-colors hover:bg-muted/70'
      }
    >
      <div className="t-row flex min-w-0 items-center gap-1.5">
        <PriorityDot priority={task.priority} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{task.title}</span>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
          {EMS_STATUS_LABEL[task.status] || task.status}
        </span>
      </div>

      {task.description && (
        <>
          <p className={'t-desc whitespace-pre-line text-[12px] leading-snug text-muted-foreground ' + (clamp ? 'line-clamp-2 md:line-clamp-none' : '')}>
            {task.description}
          </p>
          {CLAMP_MOBILE_DESCRIPTION && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onToggle(); }}
              className="t-more self-start text-[11px] font-semibold text-primary md:hidden"
            >
              {expanded ? 'פחות' : 'עוד'}
            </button>
          )}
        </>
      )}

      <div className="t-meta flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
        {meta.assigneeFirstName && <span>👤 {meta.assigneeFirstName}</span>}
        {meta.due && (
          <span className={meta.overdue ? 'font-semibold text-destructive' : ''}>
            {meta.overdue ? '⏰' : '📅'} <bdi>{meta.due}</bdi>
          </span>
        )}
        {meta.priorityLabel && <span>{meta.priorityLabel}</span>}
      </div>
    </div>
  );
}

export function EmsTasks({ kibbutz }: { kibbutz: string }) {
  const rawTasks = useCardEmsTasks(kibbutz);
  const { name: me } = useCurrentUser();
  const tasks = React.useMemo(() => sortTasksForCard(rawTasks, me), [rawTasks, me]);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  if (!tasks.length) return null;

  return (
    <div className="card-ems-tasks mt-1.5 border-t border-border/70 pt-1.5">
      <div className="card-ems-head mb-1 flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
        <span>📋 משימות EMS</span>
        <span className="badge rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold">{tasks.length} פתוחות</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {tasks.map(t => (
          <EmsTaskRow
            key={t.id}
            task={t}
            expanded={!!expanded[t.id]}
            onToggle={() => setExpanded(e => ({ ...e, [t.id]: !e[t.id] }))}
          />
        ))}
      </div>
    </div>
  );
}
