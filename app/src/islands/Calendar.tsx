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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, Reorder, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Video } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
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
  abilities, ABSENCE_LABELS, addDays, byDate, calendarItems, dueByKibbutz, EMPTY_DAY,
  groupByKibbutz, HE_DAY_LETTERS, HE_MONTHS, heDate, heShort, monthView, reorder,
  ROUTE_HEADERS, routeWithHeaders, scheduleTasksPlan, stopsOrder, stopsPayload, toKey,
  weekDays, weekView, ymd,
  type AbsenceKind, type AbsenceRow, type CalCell, type CalEmsTask, type CalItem,
  type CalWeek, type OfficeEvent, type RouteRow,
} from '@/lib/calendar';

type ViewMode = 'week' | 'month';

const VIEW_KEY = 'cal_view_v1';
const HIDE_EMS_KEY = 'cal_hide_ems_v1';
const ONLY_MINE_KEY = 'cal_only_mine_v1';

function readFlag(key: string, fallback = false): boolean {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; }
  catch { return fallback; }
}
function writeFlag(key: string, on: boolean): void {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* private mode */ }
}
function readView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month'; } catch { return 'month'; }
}

// ───────────────────────────── data ─────────────────────────────

/** The visible range, as the two plain days every query keys on. */
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

function DayCellBox({
  cell, items, selected, onOpen, onAdd, canAdd, onlyMine,
}: {
  cell: CalCell; items: CalItem[]; selected: boolean;
  onOpen: (d: string) => void; onAdd: (d: string) => void; canAdd: boolean; onlyMine: boolean;
}) {
  const shown = items.slice(0, 3);
  const extra = items.length - shown.length;
  const state = cell.today ? 'today' : cell.holiday ? 'holiday' : cell.weekend ? 'weekend' : 'day';
  return (
    <div
      className={'ucal-cell' + (cell.inMonth ? '' : ' ucal-out') + (selected ? ' ucal-sel' : '')}
      data-date={cell.date}
      data-state={state}
    >
      <div className="ucal-cell-head">
        <button
          type="button"
          className="ucal-daynum"
          data-day={cell.date}
          onClick={() => onOpen(cell.date)}
          aria-label={heDate(cell.date)}
        >
          {cell.day}
          {cell.holiday ? <span className="ucal-holidot" data-testid="cal-holiday" title={cell.holiday.name} /> : null}
        </button>
        {canAdd ? (
          <button
            type="button"
            className="ucal-add"
            data-add={cell.date}
            aria-label={'הוספה ל' + heShort(cell.date)}
            onClick={e => { e.stopPropagation(); onAdd(cell.date); }}
          >
            <Plus size={12} aria-hidden />
          </button>
        ) : null}
      </div>
      <button type="button" className="ucal-cell-body" onClick={() => onOpen(cell.date)} tabIndex={-1} aria-hidden>
        {shown.map(i => <Chip key={i.key} item={i} dim={onlyMine && !i.mine} />)}
        {extra > 0 ? <span className="ucal-more">+{extra} נוספים</span> : null}
      </button>
    </div>
  );
}

function Grid({
  weeks, index, selected, onOpen, onAdd, canAdd, onlyMine, mode,
}: {
  weeks: CalWeek[]; index: Record<string, CalItem[]>; selected: string;
  onOpen: (d: string) => void; onAdd: (d: string) => void; canAdd: boolean;
  onlyMine: boolean; mode: ViewMode;
}) {
  return (
    <div className={'ucal-grid' + (mode === 'week' ? ' ucal-grid-week' : '')} data-testid="cal-grid">
      {/* The header row: the (empty) week column first — right in RTL — then Sunday→Saturday. */}
      <div className="ucal-weekno ucal-weekno-head" aria-hidden>#</div>
      {HE_DAY_LETTERS.map(l => <div key={l} className="ucal-dow" aria-hidden>{l}</div>)}
      {weeks.map(w => (
        <React.Fragment key={w.days[0].date}>
          <WeekNumbers week={w.week} />
          {w.days.map(c => (
            <DayCellBox
              key={c.date}
              cell={c}
              items={index[c.date] || []}
              selected={c.date === selected}
              onOpen={onOpen}
              onAdd={onAdd}
              canAdd={canAdd}
              onlyMine={onlyMine}
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

function DayBody({
  date, items, rows, canReorder, onMove, onPlace, onBriefing, onCheckin,
}: {
  date: string; items: CalItem[]; rows: RouteRow[]; canReorder: boolean;
  onMove: (f: number, t: number) => void; onPlace: (k: string) => void;
  onBriefing: (k: string) => void; onCheckin: (k: string) => void;
}) {
  const today = ymd(new Date());
  // Office events and company-wide absences: real context for the day, but not a stop on
  // anyone's route — `groupByKibbutz` parks them in the one bucket marked `real: false`.
  const loose = groupByKibbutz(items).filter(g => !g.real).flatMap(g => g.items);
  if (!items.length) {
    return (
      <div className="ucal-day" data-testid="cal-day">
        <h3 className="ucal-day-title"><bdi>{heDate(date)}</bdi></h3>
        <p className="text-[13px] text-muted-foreground">{EMPTY_DAY}</p>
      </div>
    );
  }
  return (
    <div className="ucal-day" data-testid="cal-day">
      <h3 className="ucal-day-title"><bdi>{heDate(date)}</bdi></h3>
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
    </div>
  );
}

// ───────────────────────────── ➕ schedule EMS tasks ─────────────────────────────

function ScheduleSheet({
  date, open, onClose, onScheduled,
}: {
  date: string; open: boolean; onClose: () => void;
  onScheduled: (plan: ReturnType<typeof scheduleTasksPlan>) => void;
}) {
  const [kibbutz, setKibbutz] = React.useState('');
  const [picked, setPicked] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => { if (!open) { setKibbutz(''); setPicked({}); } }, [open]);

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
  const plan = scheduleTasksPlan(selected, date);

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" data-testid="cal-schedule" className="max-h-[86svh] overflow-y-auto">
        <SheetTitle>שיבוץ משימות EMS ל{heShort(date)}</SheetTitle>
        <SheetDescription className="text-[12.5px]">
          בוחרים קיבוץ, מסמנים מה עושים באותו יום — והתאריך ב-EMS מתעדכן.
        </SheetDescription>
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
              disabled={!plan.count}
              onClick={() => onScheduled(plan)}
            >
              שבץ {plan.count} משימות
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
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

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" data-testid="cal-absence" className="max-h-[86svh] overflow-y-auto">
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
  const [hideEms, setHideEms] = React.useState(() => readFlag(HIDE_EMS_KEY));
  const [onlyMine, setOnlyMine] = React.useState(() => readFlag(ONLY_MINE_KEY, false));
  const [selected, setSelected] = React.useState('');
  const [sheetDay, setSheetDay] = React.useState('');
  const [addDay, setAddDay] = React.useState('');
  const [scheduleDay, setScheduleDay] = React.useState('');
  const [absenceDay, setAbsenceDay] = React.useState('');

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

  const items = React.useMemo(() => calendarItems({
    events: events.data || [],
    visits: (() => { try { return sigma.loadAllVisitsCombined?.() || []; } catch { return []; } })(),
    emsTasks: (() => { try { return (sigma.emsCacheData?.()?.tasks || []) as CalEmsTask[]; } catch { return []; } })(),
    absences: absences.data || [],
  }, { hideEms, me }), [events.data, absences.data, hideEms, me, tick]);

  const index = React.useMemo(() => byDate(items), [items]);

  const [y, m] = anchor.split('-').map(Number);
  const weeks: CalWeek[] = view === 'month'
    ? monthView(y, m, holidays.data || [], today).weeks
    : [weekView(anchor, holidays.data || [], today)];
  const label = view === 'month'
    ? HE_MONTHS[m - 1] + ' ' + y
    : 'שבוע ' + weeks[0].week + ' · ' + heShort(weeks[0].days[0].date) + '–' + heShort(weeks[0].days[6].date);

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
          <button type="button" className="ucal-icon" data-testid="cal-prev" aria-label="הקודם" onClick={() => step(-1)}>
            <ChevronRight size={16} aria-hidden />
          </button>
          <strong className="min-w-[140px] text-center text-[14px] tabular-nums" data-testid="cal-label">{label}</strong>
          <button type="button" className="ucal-icon" data-testid="cal-next" aria-label="הבא" onClick={() => step(1)}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" className="ucal-mini" data-testid="cal-today" onClick={() => setAnchor(today)}>היום</button>
        </div>
      </header>

      {/* The switcher. רשימה is Task 14 — the slot is here so the shape is final. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="ucal-switch" role="group" aria-label="תצוגה">
          {([['week', 'שבוע'], ['month', 'חודש']] as Array<[ViewMode, string]>).map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              data-view={v}
              aria-pressed={view === v}
              className={'ucal-switch-btn' + (view === v ? ' ucal-switch-on' : '')}
              onClick={() => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* */ } }}
            >
              {lbl}
            </button>
          ))}
          <button type="button" className="ucal-switch-btn" data-view="list" disabled title="בקרוב">רשימה</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            <Switch
              checked={hideEms}
              data-testid="cal-hide-ems"
              onCheckedChange={v => { setHideEms(v); writeFlag(HIDE_EMS_KEY, v); track('calendar-hide-ems', v ? '1' : '0'); }}
            />
            הסתר משימות EMS
          </label>
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
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {loading ? <Skeleton className="h-[280px] w-full rounded-[14px]" /> : (
            <Grid
              weeks={weeks}
              index={index}
              selected={selected}
              onOpen={openDay}
              onAdd={d => setAddDay(d)}
              canAdd={can.canAdd}
              onlyMine={onlyMine}
              mode={view}
            />
          )}
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
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">בוחרים יום בלוח כדי לראות מה יש בו.</p>
            )}
          </div>
        </aside>
      </div>

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
        open={!!scheduleDay}
        onClose={() => setScheduleDay('')}
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
