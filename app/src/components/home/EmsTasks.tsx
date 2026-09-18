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
import { cardDescClamp, useSettings } from '@/lib/settings';
import {
  isUnassigned, sortTasksForCard, statusLabel, taskMeta, toggleClamp, unassignedCount,
  type CardEmsTask,
} from '@/lib/emsTasks';

// §7k #2 (accepted with a 3-week test period, reminder ≈ 9.10.26): the phone clamps a long
// description to 2 lines with a per-task "עוד"; the desktop card, the briefing and the modal
// never clamp. This constant is the DEFAULT; ⚙️ הגדרות → "תיאור משימות בכרטיס" overrides it per
// person at runtime (app/src/lib/settings.ts `card_desc`), which is why the components below
// read `clampOn` from the settings store instead of the constant directly.
export const CLAMP_MOBILE_DESCRIPTION = true;

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
  task, expanded, onToggle, clampOn,
}: {
  task: CardEmsTask;
  expanded: boolean;
  onToggle: () => void;
  /** ⚙️ הגדרות → תיאור משימות בכרטיס: 'מקוצר' clamps on the phone, 'מלא' never clamps. */
  clampOn: boolean;
}) {
  const meta = React.useMemo(() => taskMeta(task), [task]);
  const clamp = clampOn && !expanded;
  const orphan = isUnassigned(task);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={e => { e.stopPropagation(); sigma.openKibbutzEmsTask(task.id); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sigma.openKibbutzEmsTask(task.id); } }}
      className={
        'card-ems-task status-' + task.status + (meta.overdue ? ' overdue' : '') + ' ' +
        // A row inside the panel, separated by a hairline — the mockup's `.task`. Each task in
        // its own bordered box made a card of five tasks read as five cards.
        'flex cursor-pointer flex-col gap-0.5 border-t border-border py-[7px] transition-colors first:border-t-0 first:pt-0 hover:opacity-90'
      }
    >
      <div className="t-row flex min-w-0 items-center gap-1.5">
        <PriorityDot priority={task.priority} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-foreground">{task.title}</span>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
          {statusLabel(task.status)}
        </span>
        {/* §7k #6: a task nobody owns is the failure mode worth showing on the card itself. */}
        {orphan && (
          <span className="t-orphan shrink-0 whitespace-nowrap rounded-full bg-[color:var(--sigma-warn)]/15 px-1.5 py-px text-[10px] font-bold text-[color:var(--sigma-warn)]">
            ⚠️ ללא אחראי
          </span>
        )}
      </div>

      {task.description && (
        <>
          <p className={'t-desc my-[3px] whitespace-pre-line text-[14px] leading-[1.55] text-muted-foreground ' + (clamp ? 'line-clamp-2 md:line-clamp-none' : '')}>
            {task.description}
          </p>
          {clampOn && (
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

      <div className="t-meta flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground [&>span]:rounded-md [&>span]:border [&>span]:border-border [&>span]:bg-card [&>span]:px-1.5 [&>span]:py-px">
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

/** True while the viewport is a phone — the clamp setting only ever applies there (§7k #2). */
function usePhone(): boolean {
  const [phone, setPhone] = React.useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false,
  );
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

export function EmsTasks({ kibbutz }: { kibbutz: string }) {
  const rawTasks = useCardEmsTasks(kibbutz);
  const { name: me } = useCurrentUser();
  const tasks = React.useMemo(() => sortTasksForCard(rawTasks, me), [rawTasks, me]);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const settings = useSettings();
  const phone = usePhone();
  const clampOn = CLAMP_MOBILE_DESCRIPTION && cardDescClamp(settings, phone);
  // The count is for the people who can DO something about it (§7k #6); a technician seeing
  // "3 ללא אחראי" on a card he cannot assign is noise, and the per-row badge already tells
  // him which task has no owner.
  const orphans = React.useMemo(() => unassignedCount(tasks), [tasks]);
  const isAdmin = React.useMemo(() => { try { return !!sigma?.isAdmin?.(); } catch { return false; } }, [me]);

  if (!tasks.length) return null;

  return (
    <div className="card-ems-tasks mt-2.5 rounded-[10px] bg-muted px-2.5 py-2">
      <div className="card-ems-head mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        <span>📋 משימות EMS</span>
        <span className="badge rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold">{tasks.length} פתוחות</span>
        {isAdmin && orphans > 0 && (
          <span className="badge-orphans rounded-full bg-[color:var(--sigma-warn)]/15 px-1.5 py-px text-[10px] font-bold text-[color:var(--sigma-warn)]">
            ⚠️ <bdi>{orphans}</bdi> ללא אחראי
          </span>
        )}
      </div>
      <div className="flex flex-col">
        {tasks.map(t => (
          <EmsTaskRow
            key={t.id}
            task={t}
            expanded={!!expanded[t.id]}
            clampOn={clampOn}
            onToggle={() => setExpanded(e => toggleClamp(e, t.id))}
          />
        ))}
      </div>
    </div>
  );
}
