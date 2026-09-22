// #sigma-calendar — 🗓️ יומן (spec §7f).
//
// ONE calendar, three layers, one toggle. What the redesign is FOR: a field day is a route
// between kibbutzim, not a list of tickets — so tapping a day does not open "the day's
// events", it opens the day GROUPED BY KIBBUTZ, in the order the person will actually drive
// it, with 📍 בריפינג and ➕ צ׳ק-אין on each stop. That is the link between the calendar and
// the arrival flow (§5.1): the order saved here is the order the arrival sheet offers.
//
// WEEK NUMBERS SIT ON THE RIGHT. In RTL the first grid column is the rightmost one, so the
// week cell is simply first in the DOM — same treatment as the day letters on top: small,
// muted, never interactive.
//
// WRITES: day_plans and calendar_absences go through supabase-js (RLS: the authenticated EMS
// pass). Every EMS write goes through the bridge — `sigma.emsPatchTasks` — because EMS has
// exactly one writer in this app and it lives in js/src/14-calendar.js.
//
// Every DECISION is pure and lives in app/src/lib/calendar.ts (goldens: calendar.test.ts).
import * as React from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, Reorder, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Video } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import type { Holiday } from '@/lib/attendance';
import {
  abilities, ABSENCE_LABELS, addDays, byDate, calendarItems, canPlanDay, dayLetters, dayWhen,
  dueByKibbutz, EMPTY_DAY, gridDays, groupByKibbutz, HE_MONTHS, heDate, heShort, monthView,
  reorder, ROUTE_HEADERS, routeWithHeaders, scheduleTasksPlan, stopsOrder, stopsPayload, toKey,
  missingInView, visibleDows, visitsOn, weekDays, weekView, workWeekLabel, ymd,
  type AbsenceKind, type AbsenceRow, type CalCell, type CalEmsTask, type CalItem,
  type CalWeek, type OfficeEvent, type RouteRow, type VisitRow,
} from '@/lib/calendar';
import type { AttRow } from '@/lib/attendance';
import { dueText, isOverdue, priorityLabel, statusLabel } from '@/lib/emsTasks';
import {
  companyItems, COMPANY_GROUP, DEFAULT_FILTERS, EMPTY_FILTERED, EMPTY_LIST, filterTasks,
  groupTasks, hasActiveFilters, LIST_TITLE, shareText, siteOptions, sortTasks, waLink,
  type CompanyRow, type ListTask, type TaskFilters,
} from '@/lib/taskList';

type ViewMode = 'week' | 'month' | 'list';

const VIEW_KEY = 'cal_view_v1';
const ONLY_MINE_KEY = 'cal_only_mine_v1';
/** Round 2 · G1 — א–ה is the DEFAULT, so an unset flag reads as "on". */
const WORK_WEEK_KEY = 'cal_work_week_v1';

function readFlag(key: string, fallback = false): boolean {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; }
  catch { return fallback; }
}
function writeFlag(key: string, on: boolean): void {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* private mode */ }
}
function readView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'week' || v === 'list' ? v : 'month';
  } catch { return 'month'; }
}

// ───────────────────────────── data ─────────────────────────────

/**
 * The visible range, as the two plain days every query keys on. רשימה has no range of its own
 * — it reads the whole open cache — so it keys on the MONTH, which keeps the office-events and
 * absences queries warm for the day the person switches back to a grid.
 */
function rangeOf(view: ViewMode, anchor: string): { from: string; to: string } {
  if (view === 'week') {
    const d = weekDays(anchor);
    return { from: d[0], to: d[6] };
  }
  const [y, m] = anchor.split('-').map(Number);
  const weeks = monthView(y, m);
  const days = weeks.weeks.flatMap(w => w.days);
  return { from: days[0].date, to: days[days.length - 1].date };
}

async function readHolidays(): Promise<Holiday[]> {
  try { await sigma.attHolidaysLoad?.(); return (sigma.attHolidays?.() || []) as Holiday[]; }
  catch { return []; }
}

async function readEvents(from: string, to: string): Promise<OfficeEvent[]> {
  try { return (await sigma.calFetchEvents?.({ from, to })) || []; }
  catch { return []; }
}

async function readAbsences(from: string, to: string): Promise<AbsenceRow[]> {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('calendar_absences')
      .select('id,person,kind,start_date,end_date,note,required')
      .lte('start_date', to).gte('end_date', from);
    if (error) throw error;
    return (data || []) as AbsenceRow[];
  } catch { return []; }
}

/**
 * The person's attendance rows for ONE month, off the legacy snapshot — the same reader (and
 * the same query key) the נוכחות island uses, so the two screens share one cache and can
 * never disagree about what is missing. `null` while SHEET_DATA is still in flight, which is
 * what lets the query poll instead of caching "this month has nothing".
 */
function readAttRows(person: string, year: number, month: number): AttRow[] | null {
  if (!person) return null;
  try {
    if (!(window as any).SHEET_DATA) return null;
    return (sigma.attRows?.(person, year, month) || []) as AttRow[];
  } catch { return null; }
}

async function readPlan(person: string, date: string): Promise<string[]> {
  if (!person) return [];
  try {
    const sb = await getSupabase();
    const { data } = await sb.from('day_plans').select('stops')
      .eq('person', person).eq('date', date).maybeSingle();
    return stopsOrder((data as any)?.stops);
  } catch { return []; }
}

// ───────────────────────────── small pieces ─────────────────────────────

const LAYER_CLASS: Record<string, string> = {
  event: 'ucal-chip-event',
  visit: 'ucal-chip-visit',
  ems: 'ucal-chip-ems',
  absence: 'ucal-chip-absence',
};

function Chip({ item, dim }: { item: CalItem; dim: boolean }) {
  return (
    <span
      className={'ucal-chip ' + (LAYER_CLASS[item.layer] || '') + (dim ? ' ucal-dim' : '')}
      data-layer={item.layer}
      title={item.title}
    >
      <bdi>{item.icon} {item.title}</bdi>
    </span>
  );
}

/** 🎥 — rendered ONLY when Google really gave a conference link (spec §7f). */
function MeetButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="cal-meet"
      className="ucal-meet"
      onClick={() => track('calendar-meet-open')}
    >
      <Video size={13} aria-hidden /> הצטרף ל-Meet
    </a>
  );
}

/**
 * The narrow week-number column. FIRST in the DOM, which in RTL puts it on the right —
 * exactly where the spec asks for it, and with the same muted treatment as the day letters.
 */
function WeekNumbers({ week }: { week: number }) {
  return (
    <div className="ucal-weekno" data-testid="cal-weekno" data-week={week} aria-hidden>
      {week}
    </div>
  );
}

/**
 * Round 2 · G1: the ➕ that used to sit in every cell is GONE. It was a 20 px target on a
 * 44 px box that opened a sheet nobody asked for, and it stole the taps meant for the day.
 * Adding to a day now happens INSIDE the day, where the day is already open.
 */
function DayCellBox({
  cell, items, selected, onOpen, onlyMine, missing,
}: {
  cell: CalCell; items: CalItem[]; selected: boolean;
  onOpen: (d: string) => void; onlyMine: boolean;
  /** A past work day with no attendance row — red ring + dot (round 2, F-4 · G). */
  missing?: boolean;
}) {
  const shown = items.slice(0, 3);
  const extra = items.length - shown.length;
  const state = cell.today ? 'today' : cell.holiday ? 'holiday' : cell.weekend ? 'weekend' : 'day';
  return (
    <div
      className={'ucal-cell' + (cell.inMonth ? '' : ' ucal-out') + (selected ? ' ucal-sel' : '')}
      data-date={cell.date}
      data-state={state}
      data-missing={missing ? '1' : undefined}
    >
      <div className="ucal-cell-head">
        <button
          type="button"
          className="ucal-daynum"
          data-day={cell.date}
          onClick={() => onOpen(cell.date)}
          aria-label={heDate(cell.date) + (missing ? ' · לא דווחה נוכחות' : '')}
        >
          {cell.day}
          {cell.holiday ? <span className="ucal-holidot" data-testid="cal-holiday" title={cell.holiday.name} /> : null}
          {missing ? (
            <span className="ucal-missdot" data-testid="cal-missing" title="לא דווחה נוכחות" aria-hidden />
          ) : null}
        </button>
      </div>
      <button type="button" className="ucal-cell-body" onClick={() => onOpen(cell.date)} tabIndex={-1} aria-hidden>
        {shown.map(i => <Chip key={i.key} item={i} dim={onlyMine && !i.mine} />)}
        {extra > 0 ? <span className="ucal-more">+{extra} נוספים</span> : null}
      </button>
    </div>
  );
}

function Grid({
  weeks, index, selected, onOpen, onlyMine, mode, workWeek, missing,
}: {
  weeks: CalWeek[]; index: Record<string, CalItem[]>; selected: string;
  onOpen: (d: string) => void;
  onlyMine: boolean; mode: 'week' | 'month'; workWeek: boolean;
  /** The person's unreported past days — painted red (round 2, F-4 · G). */
  missing: Set<string>;
}) {
  const cols = visibleDows(mode, workWeek).length;
  return (
    <div
      className={'ucal-grid' + (mode === 'week' ? ' ucal-grid-week' : '')}
      data-testid="cal-grid"
      data-cols={cols}
      style={{ gridTemplateColumns: 'var(--ucal-weekno-w) repeat(' + cols + ', minmax(0, 1fr))' }}
    >
      {/* The header row: the (empty) week column first — right in RTL — then the day letters. */}
      <div className="ucal-weekno ucal-weekno-head" aria-hidden>#</div>
      {dayLetters(mode, workWeek).map(l => <div key={l} className="ucal-dow" aria-hidden>{l}</div>)}
      {weeks.map(w => (
        <React.Fragment key={w.days[0].date}>
          <WeekNumbers week={w.week} />
          {gridDays(w, mode, workWeek).map(c => (
            <DayCellBox
              key={c.date}
              cell={c}
              items={index[c.date] || []}
              selected={c.date === selected}
              onOpen={onOpen}
              onlyMine={onlyMine}
              missing={missing.has(c.date)}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

// ───────────────────────────── the route ─────────────────────────────

/**
 * "מסלול היום" — the day's kibbutz groups as an ORDERED list. Drag (mouse + touch, via
 * Motion's Reorder) and ↑ ↓ both do the same thing, because a phone in the sun is not a
 * place to be precise with a drag, and a keyboard user has no drag at all.
 *
 * The headers are DERIVED from position by `routeWithHeaders` — they are re-derived on every
 * move, which is why a reorder can never leave "🌇 אחרון להיום" stranded in the middle.
 */
function RoutePlan({
  rows, items, canReorder, onMove, onPlace, onBriefing, onCheckin, isToday,
}: {
  rows: RouteRow[]; items: CalItem[]; canReorder: boolean;
  onMove: (from: number, to: number) => void;
  onPlace: (kibbutz: string) => void;
  onBriefing: (k: string) => void; onCheckin: (k: string) => void; isToday: boolean;
}) {
  const placed = rows.filter(r => r.index >= 0);
  const unplaced = rows.filter(r => r.index < 0);
  // The same grouping the day panel shows — one function, so the route and the panel can
  // never disagree about what belongs to a stop.
  const byKib = React.useMemo(() => {
    const m: Record<string, CalItem[]> = {};
    for (const g of groupByKibbutz(items)) if (g.real) m[g.kibbutz] = g.items;
    return m;
  }, [items]);

  const Stop = (r: RouteRow, i: number, total: number, draggable: boolean) => (
    <div className="ucal-stop" data-stop={r.kibbutz} data-header={r.header}>
      <div className="ucal-stop-head">
        <span className="ucal-stop-hdr" data-testid="cal-route-header">{r.headerLabel}</span>
        <strong className="ucal-stop-name"><bdi>{r.kibbutz}</bdi></strong>
        {canReorder && draggable ? (
          /* `onPointerDown` is stopped on every control inside a draggable stop: Motion's
             Reorder.Item starts a drag on pointerdown, and on a TOUCH screen that swallowed
             the tap — ↑ ↓ did nothing on a phone, which is the one device they exist for. */
          <span className="ucal-arrows" onPointerDown={e => e.stopPropagation()}>
            <button
              type="button" className="ucal-arrow" aria-label={'העלה את ' + r.kibbutz}
              data-up={r.kibbutz} disabled={i === 0} onClick={() => onMove(i, i - 1)}
            ><ChevronUp size={14} aria-hidden /></button>
            <button
              type="button" className="ucal-arrow" aria-label={'הורד את ' + r.kibbutz}
              data-down={r.kibbutz} disabled={i === total - 1} onClick={() => onMove(i, i + 1)}
            ><ChevronDown size={14} aria-hidden /></button>
          </span>
        ) : null}
      </div>
      <div className="ucal-stop-items">
        {(byKib[r.kibbutz] || []).map(it => (
          <div key={it.key} className="ucal-stop-row">
            <Chip item={it} dim={false} />
            {it.person ? <span className="ucal-who"><bdi>{it.person}</bdi></span> : null}
          </div>
        ))}
        {!(byKib[r.kibbutz] || []).length ? <span className="ucal-empty">אין משימות פתוחות כאן היום</span> : null}
      </div>
      <div className="ucal-stop-actions" onPointerDown={e => e.stopPropagation()}>
        <button type="button" className="ucal-mini" data-brief={r.kibbutz} onClick={() => onBriefing(r.kibbutz)}>
          📍 בריפינג
        </button>
        {isToday ? (
          <button type="button" className="ucal-mini" data-checkin={r.kibbutz} onClick={() => onCheckin(r.kibbutz)}>
            ➕ צ׳ק-אין
          </button>
        ) : null}
        {/* A 📥 stop joins the route by a TAP, not a drag: there is nowhere to drag it from,
            and on a phone in the sun a tap is the only honest gesture. */}
        {canReorder && r.index < 0 ? (
          <button type="button" className="ucal-mini" data-place={r.kibbutz} onClick={() => onPlace(r.kibbutz)}>
            ➕ הוסף למסלול
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="ucal-route" data-testid="cal-route">
      {canReorder ? (
        <Reorder.Group
          axis="y"
          values={placed.map(r => r.kibbutz)}
          onReorder={next => {
            // Motion hands back the whole new order; translate it into the one move that
            // produced it, so the mutation and the ↑↓ buttons take the exact same path.
            const before = placed.map(r => r.kibbutz);
            const from = before.findIndex((k, i) => k !== next[i]);
            if (from < 0) return;
            const to = next.indexOf(before[from]);
            if (to >= 0) onMove(from, to);
          }}
          className="ucal-route-list"
        >
          {placed.map((r, i) => (
            <Reorder.Item key={r.kibbutz} value={r.kibbutz} className="ucal-route-item">
              {Stop(r, i, placed.length, true)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="ucal-route-list">
          {placed.map((r, i) => <div key={r.kibbutz} className="ucal-route-item">{Stop(r, i, placed.length, false)}</div>)}
        </div>
      )}
      {unplaced.length ? (
        <div className="ucal-unplaced" data-testid="cal-place">
          <div className="ucal-stop-hdr">{ROUTE_HEADERS.unplaced}</div>
          {unplaced.map(r => <div key={r.kibbutz} className="ucal-route-item">{Stop(r, -1, 0, false)}</div>)}
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────── the day panel ─────────────────────────────

/**
 * Round 2 · G3 — a day that is over. It shows what was FILED (the visit summary, read only)
 * and offers nothing to plan: no route, no "הוסף למסלול", no briefing. A briefing for
 * yesterday is a lie about a drive that already happened.
 */
function PastDay({ date, items, visits }: { date: string; items: CalItem[]; visits: VisitRow[] }) {
  const filed = visitsOn(visits, date);
  return (
    <div className="ucal-day" data-testid="cal-day" data-when="past">
      <h3 className="ucal-day-title"><bdi>{heDate(date)}</bdi></h3>
      {filed.length ? (
        <div className="ucal-past" data-testid="cal-past-visits">
          {filed.map((v, n) => (
            <article className="ucal-past-visit" key={(v.id || '') + n} data-past-visit={v.kibbutz || ''}>
              <div className="ucal-stop-head">
                <strong className="ucal-stop-name"><bdi>📍 {v.kibbutz || 'ביקור'}</bdi></strong>
                {v.visitor ? <span className="ucal-who"><bdi>{v.visitor}</bdi></span> : null}
              </div>
              {v.summary ? <p className="ucal-past-text">{v.summary}</p> : null}
              {v.open_items ? (
                <p className="ucal-past-open"><b>נשאר פתוח</b><span>{v.open_items}</span></p>
              ) : null}
              {!v.summary && !v.open_items ? <p className="ucal-empty">הביקור נרשם בלי טקסט</p> : null}
            </article>
          ))}
        </div>
      ) : null}
      {!filed.length && !items.length ? <p className="text-[13px] text-muted-foreground">{EMPTY_DAY}</p> : null}
      {items.length ? (
        <div className="ucal-loose">
          {items.map(i => <div key={i.key} className="ucal-stop-row"><Chip item={i} dim={false} /></div>)}
        </div>
      ) : null}
    </div>
  );
}

/** Round 2 · G4 — search a kibbutz and put it in the day's route. Future days only. */
function PlaceSearch({ names, placed, onPlace }: { names: string[]; placed: string[]; onPlace: (k: string) => void }) {
  const [q, setQ] = React.useState('');
  const taken = new Set(placed);
  const hits = React.useMemo(() => {
    const term = q.trim();
    if (!term) return [] as string[];
    return names.filter(n => !taken.has(n) && n.includes(term)).slice(0, 8);
  }, [q, names, placed.join('|')]);
  return (
    <div className="ucal-place" data-testid="cal-place-search">
      <input
        className="ucal-input"
        type="search"
        data-testid="cal-place-input"
        placeholder="🔍 חיפוש קיבוץ להוספה למסלול"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      {q.trim() && !hits.length ? <p className="ucal-empty">אין קיבוץ בשם הזה</p> : null}
      {hits.length ? (
        <div className="ucal-place-hits">
          {hits.map(n => (
            <button key={n} type="button" className="ucal-mini" data-place-hit={n} onClick={() => { onPlace(n); setQ(''); }}>
              ➕ <bdi>{n}</bdi>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DayBody({
  date, items, rows, canReorder, onMove, onPlace, onBriefing, onCheckin, onAdd, canAdd, visits, kibbutzim,
}: {
  date: string; items: CalItem[]; rows: RouteRow[]; canReorder: boolean;
  onMove: (f: number, t: number) => void; onPlace: (k: string) => void;
  onBriefing: (k: string) => void; onCheckin: (k: string) => void;
  onAdd: (d: string) => void; canAdd: boolean;
  visits: VisitRow[]; kibbutzim: string[];
}) {
  const today = ymd(new Date());
  if (!canPlanDay(date, today)) return <PastDay date={date} items={items} visits={visits} />;
  // Office events and company-wide absences: real context for the day, but not a stop on
  // anyone's route — `groupByKibbutz` parks them in the one bucket marked `real: false`.
  const loose = groupByKibbutz(items).filter(g => !g.real).flatMap(g => g.items);
  const header = (
    <div className="ucal-day-head">
      <h3 className="ucal-day-title"><bdi>{heDate(date)}</bdi></h3>
      {/* Round 2 · G6 — a day with a route opens its briefing from the day itself, not only
          from a stop: that is the thing he wants the evening before. */}
      {rows.some(r => r.index >= 0) ? (
        <button
          type="button"
          className="ucal-mini"
          data-testid="cal-day-brief"
          onClick={() => onBriefing(rows.filter(r => r.index >= 0)[0].kibbutz)}
        >
          📍 בריפינג
        </button>
      ) : null}
      {canAdd ? (
        <button type="button" className="ucal-mini" data-add={date} data-testid="cal-day-add" onClick={() => onAdd(date)}>
          <Plus size={13} aria-hidden /> הוספה ליום
        </button>
      ) : null}
    </div>
  );
  // A day with nothing ON it can still be PLANNED — that is the whole point of a future day
  // (round 2 · G4), so the search stays even when the day is empty.
  if (!items.length && !rows.length) {
    return (
      <div className="ucal-day" data-testid="cal-day" data-when={dayWhen(date, today)}>
        {header}
        <p className="text-[13px] text-muted-foreground">{EMPTY_DAY}</p>
        {canReorder ? <PlaceSearch names={kibbutzim} placed={rows.map(r => r.kibbutz)} onPlace={onPlace} /> : null}
      </div>
    );
  }
  return (
    <div className="ucal-day" data-testid="cal-day" data-when={dayWhen(date, today)}>
      {header}
      {loose.length ? (
        <div className="ucal-loose" data-testid="cal-loose">
          {loose.map(i => (
            <div key={i.key} className="ucal-stop-row">
              <Chip item={i} dim={false} />
              {i.meetLink ? <MeetButton href={i.meetLink} /> : null}
            </div>
          ))}
        </div>
      ) : null}
      <RoutePlan
        rows={rows}
        items={items}
        canReorder={canReorder}
        onMove={onMove}
        onPlace={onPlace}
        onBriefing={onBriefing}
        onCheckin={onCheckin}
        isToday={date === today}
      />
      {canReorder ? <PlaceSearch names={kibbutzim} placed={rows.map(r => r.kibbutz)} onPlace={onPlace} /> : null}
    </div>
  );
}

// ───────────────────────────── ➕ schedule EMS tasks ─────────────────────────────

/**
 * ONE scheduler, two doors. From a day cell the date is already known and the person picks a
 * kibbutz; from a רשימה row (📅 שבץ) the TASK is already known and the person picks a day —
 * so `preTask` skips straight to the task list and the date turns into a field. Same plan,
 * same PATCHes, same undo (spec §7g: "opens the same scheduler as §7f with the task
 * preselected").
 */
function ScheduleSheet({
  date, open, onClose, onScheduled, preTask,
}: {
  date: string; open: boolean; onClose: () => void;
  onScheduled: (plan: ReturnType<typeof scheduleTasksPlan>) => void;
  preTask?: CalEmsTask | null;
}) {
  const [kibbutz, setKibbutz] = React.useState('');
  const [picked, setPicked] = React.useState<Record<string, boolean>>({});
  const [when, setWhen] = React.useState(date);
  React.useEffect(() => {
    if (!open) { setKibbutz(''); setPicked({}); return; }
    setWhen(date || ymd(new Date()));
    if (preTask) { setKibbutz((preTask.site && preTask.site.name) || ''); setPicked({ [preTask.id]: true }); }
  }, [open, date, preTask]);

  const all = React.useMemo<CalEmsTask[]>(() => {
    try { return (sigma.emsCacheData?.()?.tasks || []) as CalEmsTask[]; } catch { return []; }
  }, [open]);

  const kibbutzim = React.useMemo(() => {
    const names = new Set<string>();
    for (const t of all) if (t.site && t.site.name) names.add(t.site.name);
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'he'));
  }, [all]);

  const tasks = React.useMemo(
    () => all.filter(t => kibbutz && t.site && t.site.name === kibbutz),
    [all, kibbutz],
  );
  const selected = tasks.filter(t => picked[t.id]);
  const plan = scheduleTasksPlan(selected, when);

  // §7p: tasks already ticked for a day are unsaved work — a stray backdrop tap re-opens to
  // an empty sheet and the person starts again.
  const schedGuard = useUnsavedGuard({
    dirty: () => selected.length > 0,
    onDiscard: onClose,
    onClose,
  });

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) schedGuard.ask(); }}>
      <SheetContent side="bottom" data-testid="cal-schedule" className="max-h-[86svh] overflow-y-auto" {...schedGuard.contentProps}>
        <SheetTitle>שיבוץ משימות EMS{when ? ' ל' + heShort(when) : ''}</SheetTitle>
        <SheetDescription className="text-[12.5px]">
          {date
            ? 'בוחרים קיבוץ, מסמנים מה עושים באותו יום — והתאריך ב-EMS מתעדכן.'
            : 'בוחרים יום למשימה — והתאריך ב-EMS מתעדכן.'}
        </SheetDescription>
        {/* Opened from a רשימה row there is no day yet, so the day is the first thing asked. */}
        {!date ? (
          <label className="mt-3 block text-[12.5px] font-semibold">
            ליום
            <input
              type="date" className="ucal-input" data-testid="cal-schedule-date"
              value={when} onChange={e => setWhen(e.target.value)}
            />
          </label>
        ) : null}
        {!kibbutz ? (
          <Command className="mt-3 rounded-[12px] border border-border">
            <CommandInput placeholder="חיפוש קיבוץ…" data-testid="cal-kib-search" />
            <CommandList>
              <CommandEmpty>אין קיבוץ בשם הזה</CommandEmpty>
              <CommandGroup>
                {kibbutzim.map(n => (
                  <CommandItem key={n} value={n} onSelect={() => setKibbutz(n)} data-kib={n}>
                    <bdi>{n}</bdi>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div className="mt-3 space-y-2">
            <button type="button" className="ucal-mini" onClick={() => { setKibbutz(''); setPicked({}); }}>
              ← קיבוץ אחר
            </button>
            <div className="space-y-1.5" data-testid="cal-task-list">
              {tasks.map(t => {
                const due = toKey(t.expectedCompletionDate);
                return (
                  <label key={t.id} className="ucal-task" data-task={t.id}>
                    <input
                      type="checkbox"
                      checked={!!picked[t.id]}
                      onChange={e => setPicked(p => ({ ...p, [t.id]: e.target.checked }))}
                    />
                    <span className="flex-1">
                      <bdi className="font-semibold">{t.title}</bdi>
                      <span className="block text-[11.5px] text-muted-foreground">
                        {due ? 'מתוכנן ל' + heShort(due) : 'ללא תאריך'}
                      </span>
                    </span>
                  </label>
                );
              })}
              {!tasks.length ? <p className="text-[13px] text-muted-foreground">אין כאן משימות פתוחות</p> : null}
            </div>
            <button
              type="button"
              className="ucal-primary"
              data-testid="cal-schedule-go"
              disabled={!plan.count || !when}
              onClick={() => onScheduled(plan)}
            >
              שבץ {plan.count} משימות
            </button>
          </div>
        )}
        {schedGuard.prompt}
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────── רשימה — the third view (spec §7g) ─────────────────────────────

/**
 * What the standalone משימות page and the legacy 📋 EMS page used to be (§7m R1/R2): MY open
 * work, grouped by the kibbutz it is at, the oldest debt first — with their filters and their
 * ⋯ exports on top of it.
 *
 * It reads the SHARED CACHE, not EMS live. That is the same source the cards, the calendar
 * layers and Ctrl+K already read: it holds every open task, it answers instantly, and it works
 * with no signal — which is the state a phone in a kibbutz is usually in. The old page's
 * paginated fetch and its "טען עוד" went with the page.
 */
function TaskListView({
  me, canSeeOthers, onOpenCard, onBriefing, onSchedule, onRefresh, tick,
}: {
  me: string; canSeeOthers: boolean;
  onOpenCard: (kibbutz: string) => void;
  onBriefing: (kibbutz: string) => void;
  onSchedule: (task: ListTask) => void;
  onRefresh: () => void;
  tick: number;
}) {
  // Someone who sees everyone (עידן / עמיחי) starts with everyone, exactly as the two grids
  // already show him everyone's day — his job here is triage, and a screen that opens empty
  // because EMS spells his name differently is a screen that looks broken. A field user gets
  // his own work and is never offered the toggle (spec §7g: "כולל של אחרים" is for admins).
  const [filters, setFilters] = React.useState<TaskFilters>(() => ({ ...DEFAULT_FILTERS, mine: !canSeeOthers }));
  const [showCompany, setShowCompany] = React.useState(true);
  const [busy, setBusy] = React.useState('');
  const now = new Date();
  const set = <K extends keyof TaskFilters>(k: K, v: TaskFilters[K]) => setFilters(f => ({ ...f, [k]: v }));

  const all = React.useMemo<ListTask[]>(() => {
    try { return (sigma.emsCacheData?.()?.tasks || []) as ListTask[]; } catch { return []; }
  }, [tick]);

  // 🔒 "חברה" — internal tasks with no kibbutz. Until the one-shot migration has run, the
  // retired home block's three lists stand in for them (§7m R3); `companyItems` prefers a real
  // row the moment one exists, so the same item can never show twice.
  const company = useQuery({
    queryKey: ['cal', 'company-tasks'],
    queryFn: async (): Promise<CompanyRow[]> => {
      try {
        const sb = await getSupabase();
        const { data, error } = await sb.from('internal_tasks')
          .select('id,title,kibbutz,done,owner').is('kibbutz', null).eq('done', false);
        if (error) throw error;
        return (data || []) as CompanyRow[];
      } catch { return []; }
    },
    staleTime: 5 * 60 * 1000,
  });
  const companyRows = React.useMemo(
    () => companyItems(company.data || [], (() => { try { return sigma.companyTasks?.() || null; } catch { return null; } })()),
    [company.data, tick],
  );

  const shown = React.useMemo(
    () => sortTasks(filterTasks(all, filters, { me, now }), now),
    [all, filters, me, tick],
  );
  const groups = React.useMemo(() => groupTasks(shown, now), [shown]);
  const sites = React.useMemo(() => siteOptions(all), [all]);
  const openCount = React.useMemo(
    () => filterTasks(all, { ...DEFAULT_FILTERS, mine: false }, { me, now }).length,
    [all, me, tick],
  );

  async function finish(task: ListTask) {
    setBusy(task.id);
    try {
      await sigma.emsSetStatus?.(task.id, 'done');
      track('list-task-done', task.id);
      onRefresh();
    } finally { setBusy(''); }
  }

  function share(how: 'copy' | 'whatsapp') {
    const text = shareText({ person: me || 'הצוות', groups, company: companyRows, now });
    if (how === 'copy') {
      navigator.clipboard?.writeText(text)
        .then(() => toast.success('הדוח הועתק'))
        .catch(() => toast.error('ההעתקה לא עברה'));
      track('list-share', 'copy');
      return;
    }
    const phone = (() => { try { return sigma.contactPhone?.(me) || ''; } catch { return ''; } })();
    const url = waLink(phone, text);
    if (!url) { toast.error('אין מספר טלפון רשום'); return; }
    window.open(url, '_blank', 'noopener');
    track('list-share', 'whatsapp');
  }

  return (
    <div data-testid="cal-list">
      {/* ── the filters the retired EMS page carried ─────────────────────── */}
      <div className="ucal-filters" data-testid="cal-list-filters">
        <input
          className="ucal-input" data-testid="cal-list-search" type="search"
          placeholder="🔍 חיפוש משימה" value={filters.q} onChange={e => set('q', e.target.value)}
        />
        <select className="ucal-input" data-testid="cal-list-status" value={filters.status} onChange={e => set('status', e.target.value)}>
          <option value="">כל הסטטוסים</option>
          <option value="new">🆕 חדשה</option>
          <option value="in_progress">🔄 בטיפול</option>
          <option value="waiting_for_client">⏳ ממתין ללקוח</option>
          <option value="on_hold">⏸️ מוקפא</option>
        </select>
        <select className="ucal-input" data-testid="cal-list-priority" value={filters.priority} onChange={e => set('priority', e.target.value)}>
          <option value="">כל העדיפויות</option>
          <option value="urgent">🔴 דחופה</option>
          <option value="high">🟠 גבוהה</option>
          <option value="normal">🟡 רגילה</option>
          <option value="low">🔵 נמוכה</option>
        </select>
        <select className="ucal-input" data-testid="cal-list-site" value={filters.site} onChange={e => set('site', e.target.value)}>
          <option value="">כל הקיבוצים</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button
          type="button" data-testid="cal-list-overdue" aria-pressed={filters.overdue}
          className={'ucal-mini' + (filters.overdue ? ' ucal-mini-on' : '')}
          onClick={() => set('overdue', !filters.overdue)}
        >⏰ באיחור</button>
        {canSeeOthers ? (
          <button
            type="button" data-testid="cal-list-others" aria-pressed={!filters.mine}
            className={'ucal-mini' + (!filters.mine ? ' ucal-mini-on' : '')}
            onClick={() => set('mine', !filters.mine)}
          >👥 כולל של אחרים</button>
        ) : null}
        {/* ⋯ — where the retired page's launchers and its report live now (rulings 1 + 2). */}
        <details className="ucal-more" data-testid="cal-list-more">
          <summary className="ucal-mini">⋯ עוד</summary>
          <div className="ucal-more-menu">
            <button type="button" className="ucal-row" data-testid="cal-list-copy" onClick={() => share('copy')}>📋 העתק את הרשימה</button>
            <button type="button" className="ucal-row" data-testid="cal-list-wa" onClick={() => share('whatsapp')}>📱 שתף בוואטסאפ</button>
            <button type="button" className="ucal-row" data-testid="cal-list-visits" onClick={() => sigma.openVisitsReport?.()}>📍 דוח ביקורים</button>
            <button type="button" className="ucal-row" data-testid="cal-list-activity" onClick={() => sigma.openActivity?.()}>📊 פעילות היום</button>
          </div>
        </details>
      </div>

      {/* ── 🏢 חברה — collapsible, at the top (spec §7g) ──────────────────── */}
      {companyRows.length ? (
        <section className="ucal-company" data-testid="cal-list-company">
          <button
            type="button" className="ucal-company-head" aria-expanded={showCompany}
            onClick={() => setShowCompany(v => !v)}
          >
            📌 {COMPANY_GROUP} <span className="ucal-count">{companyRows.length}</span>
            {showCompany ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
          {showCompany ? (
            <ul className="ucal-company-list">
              {companyRows.map(i => (
                <li key={i.id}>
                  {i.heading ? <span className="ucal-company-tag"><bdi>{i.heading}</bdi></span> : null}
                  <bdi>{i.title}</bdi>
                  {i.owner ? <span className="ucal-who"><bdi>{i.owner}</bdi></span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* ── the work, by kibbutz ──────────────────────────────────────────── */}
      {!groups.length ? (
        <div className="ucal-list-empty" data-testid="cal-list-empty">
          <p className="text-[14px] font-semibold">{hasActiveFilters(filters) ? EMPTY_FILTERED : EMPTY_LIST}</p>
          {filters.mine && !hasActiveFilters(filters) && openCount ? (
            <button type="button" className="ucal-mini mt-2" data-testid="cal-list-show-all" onClick={() => set('mine', false)}>
              👥 הצג את כל {openCount} המשימות הפתוחות
            </button>
          ) : null}
          {hasActiveFilters(filters) ? (
            <button type="button" className="ucal-mini mt-2" data-testid="cal-list-clear" onClick={() => setFilters({ ...DEFAULT_FILTERS, mine: filters.mine })}>
              נקה סינון
            </button>
          ) : null}
        </div>
      ) : groups.map(g => (
        <section className="ucal-lgroup" data-group={g.kibbutz} key={g.kibbutz}>
          <div className="ucal-lgroup-head">
            {g.real ? (
              <button type="button" className="ucal-lgroup-name" data-open-card={g.kibbutz} onClick={() => onOpenCard(g.kibbutz)}>
                🏘️ <bdi>{g.kibbutz}</bdi>
              </button>
            ) : (
              <span className="ucal-lgroup-name"><bdi>{g.kibbutz}</bdi></span>
            )}
            {g.overdue ? <span className="ucal-late" data-testid="cal-list-late">⏰ {g.overdue} באיחור</span> : null}
            {g.real ? (
              <button type="button" className="ucal-mini" data-brief={g.kibbutz} onClick={() => onBriefing(g.kibbutz)}>📍 בריפינג</button>
            ) : null}
          </div>
          {g.items.map(t => {
            const late = isOverdue(t, now);
            const due = dueText(t);
            return (
              <article className={'ucal-ltask' + (late ? ' ucal-ltask-late' : '')} data-task={t.id} key={t.id}>
                <button type="button" className="ucal-ltask-main" onClick={() => sigma.openKibbutzEmsTask(t.id)}>
                  <strong className="ucal-ltask-title"><bdi>{t.title}</bdi></strong>
                  <span className="ucal-ltask-meta">
                    <span className="ucal-badge">{statusLabel(t.status)}</span>
                    <span className="ucal-badge">{priorityLabel(t.priority || '')}</span>
                    {due ? <span className="ucal-badge">{(late ? '⏰ ' : '📅 ') + due}</span> : null}
                    {t.assignee?.firstName ? <span className="ucal-who"><bdi>{t.assignee.firstName}</bdi></span> : null}
                  </span>
                  {t.description ? <span className="ucal-ltask-desc"><bdi>{t.description}</bdi></span> : null}
                </button>
                <div className="ucal-ltask-actions">
                  <button type="button" className="ucal-mini" data-schedule={t.id} onClick={() => onSchedule(t)}>📅 שבץ</button>
                  <button
                    type="button" className="ucal-mini" data-done={t.id}
                    disabled={busy === t.id} onClick={() => finish(t)}
                  >✓ סיים</button>
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// ───────────────────────────── 🌴 absences ─────────────────────────────

function AbsenceSheet({
  date, open, onClose, me, canOthers, onSaved,
}: {
  date: string; open: boolean; onClose: () => void; me: string; canOthers: boolean;
  onSaved: (a: { person: string | null; kind: AbsenceKind; start_date: string; end_date: string; note: string }) => void;
}) {
  const [kind, setKind] = React.useState<AbsenceKind>('vacation');
  const [person, setPerson] = React.useState(me);
  const [from, setFrom] = React.useState(date);
  const [to, setTo] = React.useState(date);
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (open) { setKind('vacation'); setPerson(me); setFrom(date); setTo(date); setNote(''); }
  }, [open, date, me]);

  const people = React.useMemo(() => {
    try { return (sigma.ATT_PEOPLE || []) as string[]; } catch { return ['אביאם', 'ניתאי']; }
  }, []);

  // §7p: a typed note (and a range widened past the day it opened on) is unsaved input.
  const absGuard = useUnsavedGuard({
    dirty: () => note.trim() !== '' || from !== date || to !== date,
    onDiscard: onClose,
    onClose,
  });

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) absGuard.ask(); }}>
      <SheetContent side="bottom" data-testid="cal-absence" className="max-h-[86svh] overflow-y-auto" {...absGuard.contentProps}>
        <SheetTitle>יום לא רגיל</SheetTitle>
        <SheetDescription className="text-[12.5px]">חופש, מילואים או אירוע — וכולם יראו את זה ביומן.</SheetDescription>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['vacation', 'reserve', 'event'] as AbsenceKind[]).map(k => (
            <button
              key={k}
              type="button"
              data-kind={k}
              aria-pressed={kind === k}
              className={'ucal-mini' + (kind === k ? ' ucal-mini-on' : '')}
              onClick={() => setKind(k)}
            >
              {ABSENCE_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[12.5px] font-semibold">
            מתאריך
            <input type="date" className="ucal-input" data-testid="cal-abs-from" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="text-[12.5px] font-semibold">
            עד תאריך
            <input type="date" className="ucal-input" data-testid="cal-abs-to" value={to} onChange={e => setTo(e.target.value)} />
          </label>
        </div>
        {kind !== 'event' ? (
          <label className="mt-2 block text-[12.5px] font-semibold">
            מי
            <select
              className="ucal-input"
              data-testid="cal-abs-person"
              value={person}
              disabled={!canOthers}
              onChange={e => setPerson(e.target.value)}
            >
              {(canOthers ? people : [me]).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        ) : null}
        <label className="mt-2 block text-[12.5px] font-semibold">
          הערה
          <input className="ucal-input" value={note} onChange={e => setNote(e.target.value)} placeholder="אופציונלי" />
        </label>
        <button
          type="button"
          className="ucal-primary mt-3"
          data-testid="cal-abs-save"
          disabled={!from || !to || to < from}
          onClick={() => onSaved({
            person: kind === 'event' ? null : person,
            kind,
            start_date: from,
            end_date: to,
            note: note.trim(),
          })}
        >
          שמור
        </button>
        {absGuard.prompt}
      </SheetContent>
    </Sheet>
  );
}

/** The ➕ menu on a day: three doors, no page jump. */
function AddSheet({
  date, open, onClose, onSchedule, onAbsence, onNewTask,
}: {
  date: string; open: boolean; onClose: () => void;
  onSchedule: () => void; onAbsence: () => void; onNewTask: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" data-testid="cal-add" className="max-h-[60svh]">
        <SheetTitle><bdi>{heDate(date)}</bdi></SheetTitle>
        <SheetDescription className="text-[12.5px]">מה מוסיפים ליום הזה?</SheetDescription>
        <div className="mt-3 grid gap-2">
          <button type="button" className="ucal-row" data-testid="cal-add-schedule" onClick={onSchedule}>
            📋 שיבוץ משימות EMS
          </button>
          <button type="button" className="ucal-row" data-testid="cal-add-task" onClick={onNewTask}>
            ➕ משימה חדשה
          </button>
          <button type="button" className="ucal-row" data-testid="cal-add-absence" onClick={onAbsence}>
            🌴 חופש / 🪖 מילואים / 🎉 אירוע
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────── the island ─────────────────────────────

function CalendarIsland() {
  const qc = useQueryClient();
  const { name: me, role } = useCurrentUser();
  const can = abilities(role, me);
  const reduced = useReducedMotion();
  const dur = reduced ? 0 : 0.18;

  const today = ymd(new Date());
  const [view, setView] = React.useState<ViewMode>(readView);
  const [anchor, setAnchor] = React.useState(today);
  const [onlyMine, setOnlyMine] = React.useState(() => readFlag(ONLY_MINE_KEY, false));
  const [workWeek, setWorkWeek] = React.useState(() => readFlag(WORK_WEEK_KEY, true));
  const [selected, setSelected] = React.useState('');
  const [sheetDay, setSheetDay] = React.useState('');
  const [addDay, setAddDay] = React.useState('');
  const [scheduleDay, setScheduleDay] = React.useState('');
  const [absenceDay, setAbsenceDay] = React.useState('');
  // 📅 שבץ from a רשימה row: the TASK is known and the day is not — the opposite of the day
  // cell's ➕, and the same sheet either way.
  const [scheduleTask, setScheduleTask] = React.useState<CalEmsTask | null>(null);

  const range = rangeOf(view, anchor);

  // The legacy caches are refreshed by other screens; re-read them when they say so.
  const [tick, setTick] = React.useState(0);
  useSigmaEvent('ems-cache-synced', () => setTick(t => t + 1));
  useSigmaEvent('visit-saved', () => setTick(t => t + 1));

  const holidays = useQuery({ queryKey: ['cal', 'holidays'], queryFn: readHolidays, staleTime: 60 * 60 * 1000 });
  const events = useQuery({
    queryKey: ['cal', 'events', range.from, range.to],
    queryFn: () => readEvents(range.from, range.to),
    staleTime: 5 * 60 * 1000,
  });
  const absences = useQuery({
    queryKey: ['cal', 'absences', range.from, range.to],
    queryFn: () => readAbsences(range.from, range.to),
    staleTime: 60 * 1000,
  });

  // The visits are read here rather than inside `calendarItems` too, because a PAST day
  // shows the summary text itself (round 2 · G3) and the CalItem carries only a title.
  const visits = React.useMemo<VisitRow[]>(() => {
    try { return (sigma.loadAllVisitsCombined?.() || []) as VisitRow[]; } catch { return []; }
  }, [tick]);

  const items = React.useMemo(() => calendarItems({
    events: events.data || [],
    visits,
    emsTasks: (() => { try { return (sigma.emsCacheData?.()?.tasks || []) as CalEmsTask[]; } catch { return []; } })(),
    absences: absences.data || [],
  }, { me }), [events.data, absences.data, visits, me, tick]);

  /** Every kibbutz the day panel's search may place — the EMS cache is the one roster here. */
  const kibbutzNames = React.useMemo(() => {
    const names = new Set<string>();
    try {
      for (const t of (sigma.emsCacheData?.()?.tasks || []) as CalEmsTask[]) {
        if (t.site && t.site.name) names.add(t.site.name);
      }
    } catch { /* no cache yet */ }
    for (const v of visits) if (v.kibbutz) names.add(v.kibbutz);
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'he'));
  }, [visits, tick]);

  const index = React.useMemo(() => byDate(items), [items]);

  const [y, m] = anchor.split('-').map(Number);
  const weeks: CalWeek[] = view === 'week'
    ? [weekView(anchor, holidays.data || [], today)]
    : monthView(y, m, holidays.data || [], today).weeks;
  const label = view === 'week'
    ? 'שבוע ' + weeks[0].week + ' · ' + heShort(weeks[0].days[0].date) + '–' + heShort(weeks[0].days[6].date)
    : HE_MONTHS[m - 1] + ' ' + y;

  // ── the days he never reported, in red (round 2, F-4 · G) ──────────────
  //
  // A red cell is a NUDGE, not a verdict: it only ever shows the signed-in person's own
  // gaps (the calendar has no person switch — that lives on נוכחות), only on days already
  // past, and it goes away the moment the day is filled in. The months are read with the
  // נוכחות island's own key, so filing a day there repaints the calendar too.
  const viewMonths = React.useMemo(() => {
    const out = new Set<string>();
    for (const w of weeks) for (const c of w.days) out.add(c.date.slice(0, 7));
    return Array.from(out).sort();
  }, [weeks.map(w => w.days[0].date).join('|')]);

  const attMonths = useQueries({
    queries: viewMonths.map(ym => {
      const [ry, rm] = ym.split('-').map(Number);
      return {
        queryKey: ['attRows', me, ry, rm],
        queryFn: () => readAttRows(me, ry, rm)
          ?? ((qc.getQueryData(['attRows', me, ry, rm]) as AttRow[] | null | undefined) ?? null),
        enabled: !!me,
        // SHEET_DATA lands a beat after boot and announces nothing — poll until it does.
        refetchInterval: (q: any) => (q.state.data ? false : 1500),
      };
    }),
  });

  const attByMonth = React.useMemo(() => {
    const map = new Map<string, AttRow[] | null>();
    viewMonths.forEach((ym, i) => { map.set(ym, (attMonths[i]?.data as AttRow[] | null) ?? null); });
    return map;
  }, [viewMonths.join('|'), attMonths.map(q => (q.data ? (q.data as AttRow[]).length : -1)).join('|')]);

  const missing = React.useMemo(
    () => missingInView(
      me,
      weeks,
      (_p, ry, rm) => attByMonth.get(ry + '-' + String(rm).padStart(2, '0')) ?? null,
      holidays.data || [],
    ),
    [me, attByMonth, holidays.data, weeks.map(w => w.days[0].date).join('|')],
  );

  // ── the day's route ────────────────────────────────────────────────────
  const openDate = sheetDay || selected;
  const dayItems = openDate ? (index[openDate] || []) : [];
  const due = React.useMemo(() => dueByKibbutz(dayItems), [dayItems]);
  const plan = useQuery({
    queryKey: ['cal', 'plan', me, openDate],
    queryFn: () => readPlan(me, openDate),
    enabled: !!me && !!openDate,
    // ALWAYS fresh, against the 60 s default. The route is shared state — he reorders it
    // here and the arrival sheet reads the same row (§5.1) — and the query cache is
    // PERSISTED to localStorage, so the default would serve yesterday's order (or the empty
    // one from before he arranged the day) straight out of storage after a reload.
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const [draft, setDraft] = React.useState<string[] | null>(null);
  React.useEffect(() => { setDraft(null); }, [openDate]);
  const order = draft ?? (plan.data || []);
  const rows = React.useMemo(() => routeWithHeaders(order, due), [order, due]);

  const savePlan = useMutation({
    mutationFn: async (next: string[]) => sbWrite(async sb => sb.from('day_plans')
      .upsert({ person: me, date: openDate, stops: stopsPayload(next, due), updated_at: new Date().toISOString() },
        { onConflict: 'person,date' })
      .select('stops').maybeSingle()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cal', 'plan', me, openDate] });
      // The arrival sheet reads the same row (spec §5.1) — tell it without a reload.
      try { (window as any).sigmaEmit?.('dayplan-changed', { person: me, date: openDate }); } catch { /* no bus */ }
      track('calendar-route-saved', openDate);
    },
    onError: (e: any) => toast.error(String(e?.message || 'השמירה לא עברה')),
  });

  function move(from: number, to: number) {
    const placed = rows.filter(r => r.index >= 0).map(r => r.kibbutz);
    // Reordering a route that was never saved starts from what the day HAS, in its order —
    // otherwise the first ↑ on an all-unplaced day would move nothing.
    const base = placed.length ? placed : rows.map(r => r.kibbutz);
    const next = reorder(base, from, to);
    setDraft(next);
    savePlan.mutate(next);
  }

  /** A kibbutz that only sits under 📥 — dragging is not the way to place it; tapping is. */
  function placeStop(kibbutz: string) {
    const next = (draft ?? (plan.data || [])).concat([kibbutz]);
    setDraft(next);
    savePlan.mutate(next);
  }

  // ── the EMS scheduler ──────────────────────────────────────────────────
  const schedule = useMutation({
    mutationFn: async (p: ReturnType<typeof scheduleTasksPlan>) => {
      const res = await sigma.emsPatchTasks!(p.patches);
      if (res.failed.length) throw new Error(res.failed.length + ' משימות לא עודכנו');
      return p;
    },
    onSuccess: p => {
      setScheduleDay('');
      setScheduleTask(null);
      setTick(t => t + 1);
      toast.success(p.message, {
        action: {
          label: 'ביטול',
          onClick: () => {
            sigma.emsPatchTasks!(p.undo)
              .then(() => { setTick(t => t + 1); toast('השיבוץ בוטל'); })
              .catch(() => toast.error('הביטול לא עבר'));
          },
        },
      });
      track('calendar-tasks-scheduled', String(p.count));
    },
    onError: (e: any) => toast.error(String(e?.message || 'השיבוץ לא עבר')),
  });

  // ── absences ───────────────────────────────────────────────────────────
  const saveAbsence = useMutation({
    mutationFn: async (a: { person: string | null; kind: AbsenceKind; start_date: string; end_date: string; note: string }) =>
      sbWrite(async sb => sb.from('calendar_absences')
        .insert({ ...a, created_by: me }).select('id').maybeSingle()),
    onSuccess: () => {
      setAbsenceDay('');
      qc.invalidateQueries({ queryKey: ['cal', 'absences'] });
      toast.success('נרשם ביומן');
      track('calendar-absence-added');
    },
    onError: (e: any) => toast.error(String(e?.message || 'השמירה לא עברה')),
  });

  // ── navigation ─────────────────────────────────────────────────────────
  function step(delta: number) {
    if (view === 'week') { setAnchor(a => addDays(a, delta * 7)); return; }
    setAnchor(a => {
      const [yy, mm] = a.split('-').map(Number);
      const d = new Date(yy, mm - 1 + delta, 1);
      return ymd(d);
    });
  }

  /** 📍 בריפינג — the field island owns that surface (§5.1); the card modal is the fallback. */
  function openBriefing(kibbutz: string) {
    try {
      const field = (window as any).sigmaField;
      if (field && typeof field.openBriefing === 'function') { field.openBriefing(kibbutz); return; }
      sigma.openKibbutzModal?.(kibbutz);
    } catch { /* neither surface is up — nothing to open */ }
  }

  function openDay(date: string) {
    setSelected(date);
    if (window.matchMedia && window.matchMedia('(max-width: 1023px)').matches) setSheetDay(date);
    track('calendar-day-open', date);
  }

  const loading = holidays.isLoading && events.isLoading;

  return (
    <div className="pb-4" data-testid="cal-island">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[19px] font-extrabold text-primary">🗓️ יומן</h2>
        <div className="flex items-center gap-1.5">
          {/* רשימה is not a period — there is nothing to step through, so the arrows go away
              rather than sit there doing nothing. */}
          {view !== 'list' ? (
            <>
              <button type="button" className="ucal-icon" data-testid="cal-prev" aria-label="הקודם" onClick={() => step(-1)}>
                <ChevronRight size={16} aria-hidden />
              </button>
              <strong className="min-w-[140px] text-center text-[14px] tabular-nums" data-testid="cal-label">{label}</strong>
              <button type="button" className="ucal-icon" data-testid="cal-next" aria-label="הבא" onClick={() => step(1)}>
                <ChevronLeft size={16} aria-hidden />
              </button>
              <button type="button" className="ucal-mini" data-testid="cal-today" onClick={() => setAnchor(today)}>היום</button>
            </>
          ) : (
            <strong className="text-[14px]" data-testid="cal-label">{LIST_TITLE}</strong>
          )}
        </div>
      </header>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {/* Round 2 · G5 — the three views, each its own separated target. */}
        <div className="ucal-switch ucal-switch-split" role="group" aria-label="תצוגה">
          {([['month', 'חודש'], ['week', 'שבוע'], ['list', 'רשימה']] as Array<[ViewMode, string]>).map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              data-view={v}
              aria-pressed={view === v}
              className={'ucal-switch-btn' + (view === v ? ' ucal-switch-on' : '')}
              onClick={() => {
                setView(v);
                try { localStorage.setItem(VIEW_KEY, v); } catch { /* */ }
                track('calendar-view', v);
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
        {/* The two layer toggles belong to the GRIDS; רשימה has its own filter bar. */}
        {view !== 'list' ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* Round 2 · G1 — the label is the DESTINATION, never the current state. */}
            {view === 'month' ? (
              <button
                type="button"
                className="ucal-mini"
                data-testid="cal-work-week"
                data-work-week={workWeek ? '1' : '0'}
                onClick={() => {
                  const next = !workWeek;
                  setWorkWeek(next);
                  writeFlag(WORK_WEEK_KEY, next);
                  track('calendar-work-week', next ? '1' : '0');
                }}
              >
                {workWeekLabel(workWeek)}
              </button>
            ) : null}
            {!can.seesEveryone ? (
              <label className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                <Switch
                  checked={onlyMine}
                  data-testid="cal-only-mine"
                  onCheckedChange={v => { setOnlyMine(v); writeFlag(ONLY_MINE_KEY, v); }}
                />
                רק שלי
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      {view === 'list' ? (
        <TaskListView
          me={me}
          canSeeOthers={can.seesEveryone}
          onOpenCard={k => sigma.openKibbutzModal?.(k)}
          onBriefing={openBriefing}
          onSchedule={t => { setScheduleTask(t); setScheduleDay(''); }}
          onRefresh={() => setTick(t => t + 1)}
          tick={tick}
        />
      ) : (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {loading ? <Skeleton className="h-[280px] w-full rounded-[14px]" /> : (
            <Grid
              weeks={weeks}
              index={index}
              selected={selected}
              onOpen={openDay}
              onlyMine={onlyMine}
              mode={view === 'week' ? 'week' : 'month'}
              workWeek={workWeek}
              missing={missing}
            />
          )}
          {/* The legend appears only when there is something to explain — a permanent line
              saying "red = missing" on a clean month is noise. */}
          {!loading && missing.size ? (
            <p className="ucal-legend" data-testid="cal-missing-legend">
              <span className="ucal-missdot" aria-hidden /> ימים באדום — לא דווחה נוכחות
            </p>
          ) : null}
        </div>

        {/* desktop: the day panel stays open while browsing days */}
        <aside className="hidden lg:block" data-testid="cal-panel">
          <div className="sticky top-3 max-h-[78svh] overflow-y-auto rounded-[14px] border border-border bg-card p-3.5">
            {selected ? (
              <DayBody
                date={selected}
                items={dayItems}
                rows={rows}
                canReorder={can.canReorder}
                onMove={move}
                onPlace={placeStop}
                onBriefing={openBriefing}
                onCheckin={k => sigma.openVisitQuick?.(k)}
                onAdd={d => setAddDay(d)}
                canAdd={can.canAdd}
                visits={visits}
                kibbutzim={kibbutzNames}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">בוחרים יום בלוח כדי לראות מה יש בו.</p>
            )}
          </div>
        </aside>
      </div>
      )}

      {/* phone: the same day, as a bottom sheet */}
      <Sheet open={!!sheetDay} onOpenChange={o => { if (!o) setSheetDay(''); }}>
        <SheetContent side="bottom" data-testid="cal-sheet" className="max-h-[84svh] overflow-y-auto lg:hidden">
          <SheetTitle className="sr-only">{sheetDay ? heDate(sheetDay) : 'יום'}</SheetTitle>
          <SheetDescription className="sr-only">פירוט היום לפי קיבוץ.</SheetDescription>
          <AnimatePresence mode="wait" initial={false}>
            {sheetDay ? (
              <motion.div
                key={sheetDay}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: dur, ease: 'easeOut' }}
              >
                <DayBody
                  date={sheetDay}
                  items={dayItems}
                  rows={rows}
                  canReorder={can.canReorder}
                  onMove={move}
                  onPlace={placeStop}
                  onBriefing={openBriefing}
                  onCheckin={k => sigma.openVisitQuick?.(k)}
                  onAdd={d => setAddDay(d)}
                  canAdd={can.canAdd}
                  visits={visits}
                  kibbutzim={kibbutzNames}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </SheetContent>
      </Sheet>

      <AddSheet
        date={addDay}
        open={!!addDay}
        onClose={() => setAddDay('')}
        onSchedule={() => { setScheduleDay(addDay); setAddDay(''); }}
        onAbsence={() => { setAbsenceDay(addDay); setAddDay(''); }}
        onNewTask={() => {
          const d = addDay; setAddDay('');
          // The legacy create modal, with this day already in the due-date field — the
          // modal fills asynchronously, so the value is written on the next tick.
          try { void (window as any).emsCreateTaskModal?.(''); } catch { /* */ }
          setTimeout(() => {
            try {
              const el = document.getElementById('emsTaskDueDate') as HTMLInputElement | null;
              if (el) el.value = d;
            } catch { /* */ }
          }, 0);
        }}
      />
      <ScheduleSheet
        date={scheduleDay}
        open={!!scheduleDay || !!scheduleTask}
        preTask={scheduleTask}
        onClose={() => { setScheduleDay(''); setScheduleTask(null); }}
        onScheduled={p => schedule.mutate(p)}
      />
      <AbsenceSheet
        date={absenceDay}
        open={!!absenceDay}
        onClose={() => setAbsenceDay('')}
        me={me}
        canOthers={can.canAbsentOthers}
        onSaved={a => saveAbsence.mutate(a)}
      />

    </div>
  );
}

export function Calendar() {
  return <SigmaProviders><CalendarIsland /></SigmaProviders>;
}

/**
 * Mount, and fold the legacy month grid away. Same contract the attendance island has with
 * `#attendanceLegacy`: the old markup stays in the DOM (the agenda builders and
 * `test-calendar-legacy.mjs` still reach the functions behind it), it just stops painting.
 */
export function mountCalendar(): boolean {
  const ok = mount('sigma-calendar', Calendar);
  if (ok) { try { sigma.calIslandMounted?.(); } catch { /* legacy bundle absent */ } }
  return ok;
}
