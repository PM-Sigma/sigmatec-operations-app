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
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Video,
  CalendarDays, ClipboardList, Lock, MapPin, PartyPopper, Shield, TreePalm,
  Pencil, Truck, AlignRight, Users,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ListRow } from '@/components/ui/list-row';
import { SectionBlock } from '@/components/ui/section-block';
import { BubbleButton } from '@/components/ui/bubble-button';
import { isLocked } from '@/lib/editLock';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
// Round 3 · Package S: a known kibbutz must try the chapters sheet (and its 🎙 panel) first,
// the legacy form is the fallback only — same pattern `Field.tsx` itself uses.
import { openVisitChapters } from '@/islands/Field';
import type { Holiday } from '@/lib/attendance';
import {
  abilities, ABSENCE_LABELS, addDays, byDate, calCellLook, calendarItems, calendarPeople,
  canPlanDay, canPlanFor, dayLetters, dayListing, dayWhen, dueByKibbutz, EMPTY_DAY, eventDetail,
  gridDays, groupByKibbutz, HE_MONTHS, heDate, heShort, isNoopPick, legendItems, monthView,
  pickBlock, planBlocks, reorder, ROUTE_HEADERS, routeWithHeaders, scheduleTasksPlan, showWeekNumbers,
  stopsPayload, taskOwners, toKey, missingInView, reportedInView, visibleDows, visitRead,
  weekAria, weekDays, weekView, workWeekLabel, ymd,
  type AbsenceKind, type AbsenceRow, type BlockPick, type CalEmsTask, type CalItem,
  type CalWeek, type CalInternalTask, type KibbutzBlock, type OfficeEvent, type RouteRow, type VisitRow,
} from '@/lib/calendar';
import { applyBlockPick, readPlan, undoBlockPick, type PlanGuard } from '@/lib/calendarData';
import { useSettings } from '@/lib/settings';
import { DayCell, type DayCellFill } from '@/components/ui/day-cell';
import type { AttRow } from '@/lib/attendance';
import { dueText, isOverdue, priorityLabel, statusLabel } from '@/lib/emsTasks';
import {
  companyItems, COMPANY_GROUP, DEFAULT_FILTERS, EMPTY_FILTERED, EMPTY_LIST, filterTasks,
  groupTasks, hasActiveFilters, LIST_TITLE, shareText, siteOptions, sortTasks, waLink,
  type CompanyRow, type ListTask, type TaskFilters,
} from '@/lib/taskList';
import { internalForGroups } from '@/lib/myTasks';
import { dueLabel, isOverdueInternal, type InternalTaskRow } from '@/lib/internalTasks';

type ViewMode = 'week' | 'month' | 'list';

const VIEW_KEY = 'cal_view_v1';
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

// readPlan/upsertPlan now live in calendarData.ts (round 5 · C-L4) — imported above.

// ───────────────────────────── small pieces ─────────────────────────────

const LAYER_CLASS: Record<string, string> = {
  event: 'ucal-chip-event',
  visit: 'ucal-chip-visit',
  ems: 'ucal-chip-ems',
  absence: 'ucal-chip-absence',
};

// Round 5 · C7 (calendar.ts CalIcon is a name, not an emoji): the pre-redesign chip still needs
// a real icon, so the name maps here until C-U1 rewrites this island on the design system.
const ICON = {
  calendar: CalendarDays, 'map-pin': MapPin, clipboard: ClipboardList, lock: Lock,
  palm: TreePalm, shield: Shield, party: PartyPopper,
} as const;

function Chip({ item, dim }: { item: CalItem; dim: boolean }) {
  const Icon = ICON[item.icon];
  return (
    <span
      className={'ucal-chip ' + (LAYER_CLASS[item.layer] || '') + (dim ? ' ucal-dim' : '')}
      data-layer={item.layer}
      title={item.title}
    >
      <bdi>{Icon ? <Icon size={13} aria-hidden /> : null} {item.title}</bdi>
    </span>
  );
}

/**
 * Round 5 · C-U3 — one visit summary is one ListRow, not a chip buried under a kibbutz stop.
 * Tapping it opens the compact read view (`VisitSheet`); no "small pins" render anywhere else
 * for the same visit (Review Focus / dayListing splits it out for exactly this reason).
 */
function VisitRows({ visits, onOpen }: { visits: VisitRow[]; onOpen: (v: VisitRow) => void }) {
  if (!visits.length) return null;
  return (
    <div className="ucal-visits" data-testid="cal-visits">
      {visits.map(v => {
        const r = visitRead(v);
        const meta = [r.people, r.duration].filter(Boolean).join(' · ');
        return (
          <ListRow
            key={r.id || v.kibbutz}
            data-visit-row={r.id}
            leading={<MapPin size={16} aria-hidden />}
            title={<bdi>{r.kibbutz}</bdi>}
            meta={meta ? <bdi>{meta}</bdi> : undefined}
            onClick={() => onOpen(v)}
          />
        );
      })}
    </div>
  );
}

/**
 * Round 5 · C-U3 — the visit read view: title/when/people/duration, the summary text, נשאר
 * פתוח when there is one, and ✏️/🚚 only while the visit's DATE is still editable (the global
 * round-5 edit lock, `isLocked` — `canEditVisit` isn't on `main` yet, so the gate is the plain
 * date rule everyone else already uses).
 */
function VisitSheet({ visit, onClose }: { visit: VisitRow | null; onClose: () => void }) {
  const r = visit ? visitRead(visit) : null;
  const canEdit = !!visit && !isLocked(visit.date);
  return (
    <Sheet open={!!visit} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" data-testid="cal-visit-sheet" className="max-h-[84svh] overflow-y-auto">
        <SheetHeader className="mb-2">
          <SheetTitle><bdi>{r?.kibbutz}</bdi></SheetTitle>
          <SheetDescription>
            <bdi>{r?.when}</bdi>
            {r?.people ? <> · <bdi>{r.people}</bdi></> : null}
            {r?.duration ? <> · <bdi>{r.duration}</bdi></> : null}
          </SheetDescription>
        </SheetHeader>
        {r?.summary ? <p className="ucal-visit-text">{r.summary}</p> : <p className="ucal-empty">הביקור נרשם בלי טקסט</p>}
        {r?.openItems ? (
          <SectionBlock title="נשאר פתוח"><p className="ucal-visit-text">{r.openItems}</p></SectionBlock>
        ) : null}
        {canEdit ? (
          <SheetFooter>
            <BubbleButton
              variant="primary" size="lg" data-testid="cal-visit-edit"
              onClick={() => { onClose(); openVisitChapters(visit!.kibbutz || '', { visitId: visit!.id, mode: 'edit' }); }}
            >
              <Pencil aria-hidden /> עריכה
            </BubbleButton>
            <BubbleButton
              variant="neutral" size="lg" data-testid="cal-visit-cert"
              onClick={() => { onClose(); openVisitChapters(visit!.kibbutz || '', { visitId: visit!.id, mode: 'cert' }); }}
            >
              <Truck aria-hidden /> תעודה
            </BubbleButton>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Round 5 · C-U3 — ONE generic detail sheet for every office-calendar (INFORMATION) event: no
 * per-field guessing, `eventDetail` decides what is worth showing and this only renders it.
 * Empty fields are hidden outright rather than shown blank (spec §6, no system-talk).
 */
function EventSheet({ event, onClose }: { event: OfficeEvent | null; onClose: () => void }) {
  const d = event ? eventDetail(event) : null;
  return (
    <Sheet open={!!event} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" data-testid="cal-event-sheet" className="max-h-[84svh] overflow-y-auto">
        <SheetHeader className="mb-2">
          <SheetTitle><bdi>{d?.title}</bdi></SheetTitle>
          <SheetDescription><bdi>{d?.when}</bdi></SheetDescription>
        </SheetHeader>
        {d?.location ? (
          <p className="ucal-visit-text"><MapPin size={14} aria-hidden /> <bdi>{d.location}</bdi></p>
        ) : null}
        {d?.description ? (
          <p className="ucal-visit-text"><AlignRight size={14} aria-hidden /> <span>{d.description}</span></p>
        ) : null}
        {d?.who.length ? (
          <p className="ucal-visit-text"><Users size={14} aria-hidden /> <bdi>{d.who.join(', ')}</bdi></p>
        ) : null}
        {d?.meetLink ? (
          <a
            href={d.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="cal-meet"
            className="ucal-meet"
            onClick={() => track('calendar-meet-open')}
          >
            <Video size={13} aria-hidden /> הצטרפות ל-Meet
          </a>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Round 5 · C6/C7 — the grid on the design system: one `DayCell` per day, wrapped in a legacy-
 * compatible box (`data-date`/`data-day`/`.ucal-cell`) so the arrival/briefing bridges and the
 * older Playwright specs that still look a day up by date keep working. Week numbers are no
 * longer a column: `showWeekNumbers` decides whether a small caption sits beside each row, and
 * `weekAria` gives it a real screen-reader name ("שבוע 38"), never a bare digit.
 */
function Grid({
  weeks, index, selected, onOpen, mode, workWeek, missing, reported,
}: {
  weeks: CalWeek[]; index: Record<string, CalItem[]>; selected: string;
  onOpen: (d: string) => void;
  mode: 'week' | 'month'; workWeek: boolean;
  /** The calendar person's unreported past days — painted red, filers only (round 5 · C5). */
  missing: Set<string>;
  /** The calendar person's already-filed days — painted green (round 5 · B). */
  reported: Set<string>;
}) {
  const cols = visibleDows(mode, workWeek).length;
  const labels = showWeekNumbers(mode, workWeek);
  return (
    <div
      className={'ucal-grid' + (mode === 'week' ? ' ucal-grid-week' : '')}
      data-testid="cal-grid"
      data-cols={cols}
      // Round 5 · C-U1: the DayCell grid shows a bare "•N" dot, not the old inline chip list —
      // openCalendar() in calendar.spec.ts polls this instead of `.ucal-chip` to know the EMS/
      // visits layers actually landed before it opens a day.
      data-loaded={Object.values(index).some(a => a.length) ? '1' : '0'}
      style={{ ['--ucal-cols' as any]: cols }}
    >
      <div className="ucal-dows" aria-hidden>
        {dayLetters(mode, workWeek).map(l => <span key={l} className="ucal-dow">{l}</span>)}
      </div>
      {weeks.map(w => (
        <div className="ucal-week" data-week-row key={w.days[0].date}>
          {labels ? (
            <span className="ucal-weeklabel" data-testid="cal-weeklabel" aria-label={weekAria(w.week)}>
              <bdi>{w.week}</bdi>
            </span>
          ) : null}
          <div className="ucal-week-days">
            {gridDays(w, mode, workWeek).map(c => {
              const look = calCellLook(c, {
                selected: c.date === selected,
                missing: missing.has(c.date),
                reported: reported.has(c.date),
              });
              const n = (index[c.date] || []).length;
              const fill: DayCellFill = look.state === 'field' ? 'field' : look.state === 'holiday' ? 'holiday' : 'none';
              return (
                <div
                  key={c.date}
                  className={'ucal-cell' + (!c.inMonth ? ' ucal-out' : '') + (c.date === selected ? ' ucal-sel' : '')}
                  data-date={c.date}
                  data-day={c.date}
                  data-state={look.state}
                  data-today={look.today ? '1' : undefined}
                  data-missing={look.state === 'missing' ? '1' : undefined}
                  data-reported={look.state === 'field' ? '1' : undefined}
                >
                  <DayCell
                    day={c.day}
                    fill={fill}
                    today={look.today}
                    selected={c.date === selected}
                    eve={look.state === 'eve'}
                    missing={look.state === 'missing'}
                    eventCount={n || undefined}
                    outside={!c.inMonth}
                    label={look.label}
                    onClick={() => onOpen(c.date)}
                  />
                </div>
              );
            })}
          </div>
        </div>
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
function PastDay({
  date, items, visits, onVisitOpen, onEventOpen,
}: {
  date: string; items: CalItem[]; visits: VisitRow[];
  onVisitOpen: (v: VisitRow) => void; onEventOpen: (eventId: string) => void;
}) {
  // Round 5 · C-U3 — one listing, past AND future: the visit is its own ListRow (no chip
  // rendered a second time under the day), everything else stays a restyled row.
  const listing = dayListing(date, items, visits);
  return (
    <div className="ucal-day" data-testid="cal-day" data-when="past">
      <h3 className="ucal-day-title"><bdi>{heDate(date)}</bdi></h3>
      <VisitRows visits={listing.visits} onOpen={onVisitOpen} />
      {!listing.visits.length && !listing.others.length ? (
        <p className="text-[13px] text-muted-foreground">{EMPTY_DAY}</p>
      ) : null}
      {listing.others.length ? (
        <div className="ucal-loose">
          {listing.others.map(i => (
            <div key={i.key} className="ucal-stop-row">
              {i.layer === 'event' && i.eventId ? (
                <button
                  type="button"
                  data-event-row={i.eventId}
                  className="ucal-event-row"
                  onClick={() => onEventOpen(i.eventId!)}
                >
                  <Chip item={i} dim={false} />
                </button>
              ) : (
                <Chip item={i} dim={false} />
              )}
            </div>
          ))}
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

/**
 * Round 5 · C1 — one kibbutz's open work for the day, with a single pick that BOTH plans the
 * stop and dates whatever got ticked. The button previews `pickBlock` on every keystroke so it
 * is disabled exactly when the pick would write nothing (Review Focus #3).
 */
function Block({
  b, date, stops, onPick, busy, canPlan, peer,
}: {
  b: KibbutzBlock; date: string; stops: string[];
  onPick: (b: KibbutzBlock, ticked: string[]) => void; busy: boolean; canPlan: boolean; peer: boolean;
}) {
  const [ticked, setTicked] = React.useState<string[]>([]);
  React.useEffect(() => { setTicked([]); }, [date, b.kibbutz]);
  const preview = pickBlock(b, ticked, date, stops);
  return (
    <div className="ucal-block" data-block={b.kibbutz}>
      <div className="ucal-block-head">
        <strong><bdi>{b.kibbutz}</bdi></strong>
        {b.placed ? <span className="ucal-badge">במסלול</span> : null}
      </div>
      {b.tasks.length ? b.tasks.map(t => (
        <label className="ucal-block-task" key={t.key}>
          <input
            type="checkbox"
            data-block-task={t.key}
            disabled={!canPlan || t.onThisDay}
            checked={t.onThisDay || ticked.indexOf(t.key) !== -1}
            onChange={e => setTicked(s => (e.target.checked ? s.concat([t.key]) : s.filter(k => k !== t.key)))}
          />
          <span>
            <bdi>{t.title}</bdi>
            <span className="ucal-block-meta">
              {t.onThisDay ? 'כבר ביום הזה' : t.overdue ? 'באיחור' : t.due ? <bdi>{heShort(t.due)}</bdi> : null}
              {peer && t.owner ? <bdi> · {t.owner}</bdi> : null}
            </span>
          </span>
        </label>
      )) : <p className="ucal-empty">אין כאן משימות פתוחות</p>}
      {canPlan ? (
        <button
          type="button" className="ucal-mini" data-block-pick={b.kibbutz}
          disabled={busy || isNoopPick(preview)} onClick={() => onPick(b, ticked)}
        >
          {/* Designer round · C-U: this button both places the stop AND dates the ticked tasks —
              "הוספה ליום" duplicated the header's own ➕ button, which opens a DIFFERENT sheet
              (schedule/absence/new-task). "הוספה למסלול" names what actually happens here,
              matching the wording PlaceSearch/RoutePlan already use for placing a kibbutz. */}
          {b.placed ? 'קביעת המשימות ליום' : 'הוספה למסלול'}
        </button>
      ) : null}
    </div>
  );
}

function DayBody({
  date, items, rows, stops, canReorder, onMove, onPlace, onBriefing, onCheckin, onAdd, canAdd, visits, kibbutzim,
  blocks, onPick, blockBusy, peer, onVisitOpen, onEventOpen,
}: {
  date: string; items: CalItem[]; rows: RouteRow[];
  /** The day's SAVED route order (round 5 · C1) — not derived from `rows`, which also lists
      unplaced 📥 kibbutzim that `pickBlock` must never see as if they were on the route. */
  stops: string[];
  canReorder: boolean;
  onMove: (f: number, t: number) => void; onPlace: (k: string) => void;
  onBriefing: (k: string) => void; onCheckin: (k: string) => void;
  onAdd: (d: string) => void; canAdd: boolean;
  visits: VisitRow[]; kibbutzim: string[];
  /** Round 5 · C1 — the kibbutz blocks for THIS day (already `planBlocks(...)`, empty on a past day). */
  blocks: KibbutzBlock[]; onPick: (b: KibbutzBlock, ticked: string[]) => void; blockBusy: boolean; peer: boolean;
  onVisitOpen: (v: VisitRow) => void; onEventOpen: (eventId: string) => void;
}) {
  const today = ymd(new Date());
  if (!canPlanDay(date, today)) {
    return <PastDay date={date} items={items} visits={visits} onVisitOpen={onVisitOpen} onEventOpen={onEventOpen} />;
  }
  // Round 5 · C-U3 — the visit summaries are their own ListRows (dayListing), never a second
  // time as a chip under a kibbutz stop: `others` is what everything below actually sees.
  const listing = dayListing(date, items, visits);
  const others = listing.others;
  // Office events and company-wide absences: real context for the day, but not a stop on
  // anyone's route — `groupByKibbutz` parks them in the one bucket marked `real: false`.
  const loose = groupByKibbutz(others).filter(g => !g.real).flatMap(g => g.items);
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
  // Round 5 · C1 — the kibbutz blocks, one per place with open work (or already on the route).
  const blocksSection = blocks.length ? (
    <div className="ucal-blocks" data-testid="cal-blocks">
      {blocks.map(b => (
        <Block key={b.kibbutz} b={b} date={date} stops={stops} onPick={onPick} busy={blockBusy} canPlan={canReorder} peer={peer} />
      ))}
    </div>
  ) : null;
  // A day with nothing ON it can still be PLANNED — that is the whole point of a future day
  // (round 2 · G4), so the search stays even when the day is empty.
  if (!others.length && !rows.length && !listing.visits.length) {
    return (
      <div className="ucal-day" data-testid="cal-day" data-when={dayWhen(date, today)}>
        {header}
        <VisitRows visits={listing.visits} onOpen={onVisitOpen} />
        {!blocksSection ? <p className="text-[13px] text-muted-foreground">{EMPTY_DAY}</p> : null}
        {blocksSection}
        {canReorder ? <PlaceSearch names={kibbutzim} placed={rows.map(r => r.kibbutz)} onPlace={onPlace} /> : null}
      </div>
    );
  }
  return (
    <div className="ucal-day" data-testid="cal-day" data-when={dayWhen(date, today)}>
      {header}
      <VisitRows visits={listing.visits} onOpen={onVisitOpen} />
      {loose.length ? (
        <div className="ucal-loose" data-testid="cal-loose">
          {loose.map(i => (
            <div key={i.key} className="ucal-stop-row">
              {i.layer === 'event' && i.eventId ? (
                <button
                  type="button"
                  data-event-row={i.eventId}
                  className="ucal-event-row"
                  onClick={() => onEventOpen(i.eventId!)}
                >
                  <Chip item={i} dim={false} />
                </button>
              ) : (
                <Chip item={i} dim={false} />
              )}
            </div>
          ))}
        </div>
      ) : null}
      <RoutePlan
        rows={rows}
        items={others}
        canReorder={canReorder}
        onMove={onMove}
        onPlace={onPlace}
        onBriefing={onBriefing}
        onCheckin={onCheckin}
        isToday={date === today}
      />
      {blocksSection}
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
        <SheetHeader className="mb-2">
          <SheetTitle>שיבוץ משימות EMS{when ? ' ל' + heShort(when) : ''}</SheetTitle>
          <SheetDescription className="text-[12.5px]">
            {date
              ? 'בוחרים קיבוץ, מסמנים מה עושים באותו יום, והתאריך ב-EMS מתעדכן.'
              : 'בוחרים יום למשימה, והתאריך ב-EMS מתעדכן.'}
          </SheetDescription>
        </SheetHeader>
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

/**
 * Every OPEN 🔒 internal task, read once for the whole calendar (round 4, Package X). Three
 * surfaces share it: the חברה block at the top of רשימה, the 🔒 rows inside each kibbutz block,
 * and the grid layer that puts a dated row on its due day. One query, not three.
 */
function useOpenInternalTasks() {
  return useQuery({
    queryKey: ['cal', 'internal-tasks'],
    queryFn: async (): Promise<InternalTaskRow[]> => {
      try {
        const sb = await getSupabase();
        const { data, error } = await sb.from('internal_tasks')
          .select('id,title,kibbutz,done,owner,due_date').eq('done', false);
        if (error) throw error;
        return (data || []) as InternalTaskRow[];
      } catch { return []; }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** One 🔒 row inside a kibbutz block of רשימה. Read only here: ✓ lives in המשימות שלי. */
function ListInternalRow({ row }: { row: InternalTaskRow }) {
  const due = dueLabel(row);
  const late = isOverdueInternal(row);
  return (
    <article className="ucal-ltask ucal-ltask-internal" data-internal={row.id}>
      <span className="ucal-ltask-main">
        <strong className="ucal-ltask-title">🔒 <bdi>{row.title}</bdi></strong>
        <span className="ucal-ltask-meta">
          {due ? <span className="ucal-badge">{(late ? '⏰ ' : '📅 ') + due}</span> : null}
          {row.owner ? <span className="ucal-who"><bdi>{row.owner}</bdi></span> : null}
        </span>
      </span>
    </article>
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
  const [filterOpen, setFilterOpen] = React.useState(false);
  const now = new Date();
  const set = <K extends keyof TaskFilters>(k: K, v: TaskFilters[K]) => setFilters(f => ({ ...f, [k]: v }));

  const all = React.useMemo<ListTask[]>(() => {
    try { return (sigma.emsCacheData?.()?.tasks || []) as ListTask[]; } catch { return []; }
  }, [tick]);

  // 🔒 "חברה" — internal tasks with no kibbutz. Until the one-shot migration has run, the
  // retired home block's three lists stand in for them (§7m R3); `companyItems` prefers a real
  // row the moment one exists, so the same item can never show twice.
  const internalQ = useOpenInternalTasks();
  const companyRows = React.useMemo(
    () => companyItems(
      (internalQ.data || []).filter(r => !String(r.kibbutz || '').trim()) as CompanyRow[],
      (() => { try { return sigma.companyTasks?.() || null; } catch { return null; } })(),
    ),
    [internalQ.data, tick],
  );

  // 🔒 the person's own internal rows, shown INSIDE the kibbutz blocks next to his EMS work
  // (round 4, Package X). "כולל של אחרים" widens this list exactly as it widens the EMS one.
  const mineInternal = React.useMemo(
    () => (internalQ.data || []).filter(r => !filters.mine || !me || String(r.owner || '').trim() === me),
    [internalQ.data, filters.mine, me],
  );

  const shown = React.useMemo(
    () => sortTasks(filterTasks(all, filters, { me, now }), now),
    [all, filters, me, tick],
  );
  const groups = React.useMemo(() => groupTasks(shown, now), [shown]);
  // The 🔒 rows split across those blocks, plus the kibbutzim that have ONLY 🔒 work and
  // would otherwise be missing from the screen (pure: lib/myTasks.ts `internalForGroups`).
  const { byKibbutz: internalBy, extra: internalOnly } = React.useMemo(
    () => internalForGroups(groups, mineInternal),
    [groups, mineInternal],
  );
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

  // Round 5 · C-U4: the three selects move off the page body into a sheet — "סינון" is the
  // one bubble, so the row never wraps at 360 (design-system rule: an action row holds at
  // most 3 bubbles, a 4th goes behind ⋯).
  const selectFilters = filters.status || filters.priority || filters.site;

  return (
    <div data-testid="cal-list">
      {/* ── the filters the retired EMS page carried ─────────────────────── */}
      <div className="ucal-filters" data-testid="cal-list-filters">
        <input
          className="ucal-input" data-testid="cal-list-search" type="search"
          placeholder="🔍 חיפוש משימה" value={filters.q} onChange={e => set('q', e.target.value)}
        />
        <button
          type="button" data-testid="cal-list-filter-open"
          className={'ucal-mini' + (selectFilters ? ' ucal-mini-on' : '')}
          onClick={() => setFilterOpen(true)}
        >
          סינון{selectFilters ? ' · פעיל' : ''}
        </button>
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

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" data-testid="cal-list-filter-sheet">
          <SheetHeader className="mb-2">
            <SheetTitle>סינון</SheetTitle>
            <SheetDescription className="sr-only">סטטוס, עדיפות וקיבוץ.</SheetDescription>
          </SheetHeader>
          <div className="mt-2 space-y-2">
            <label className="block text-[12.5px] font-semibold">
              סטטוס
              <select className="ucal-input" data-testid="cal-list-status" value={filters.status} onChange={e => set('status', e.target.value)}>
                <option value="">כל הסטטוסים</option>
                <option value="new">חדשה</option>
                <option value="in_progress">בטיפול</option>
                <option value="waiting_for_client">ממתין ללקוח</option>
                <option value="on_hold">מוקפא</option>
              </select>
            </label>
            <label className="block text-[12.5px] font-semibold">
              עדיפות
              <select className="ucal-input" data-testid="cal-list-priority" value={filters.priority} onChange={e => set('priority', e.target.value)}>
                <option value="">כל העדיפויות</option>
                <option value="urgent">דחופה</option>
                <option value="high">גבוהה</option>
                <option value="normal">רגילה</option>
                <option value="low">נמוכה</option>
              </select>
            </label>
            <label className="block text-[12.5px] font-semibold">
              קיבוץ
              <select className="ucal-input" data-testid="cal-list-site" value={filters.site} onChange={e => set('site', e.target.value)}>
                <option value="">כל הקיבוצים</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button
              type="button" className="ucal-mini mt-1" data-testid="cal-list-filter-clear"
              onClick={() => { set('status', ''); set('priority', ''); set('site', ''); }}
            >
              ניקוי סינון
            </button>
          </div>
        </SheetContent>
      </Sheet>

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
      {!groups.length && !internalOnly.length ? (
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
          {(internalBy[g.kibbutz] || []).map(r => <ListInternalRow key={'i:' + r.id} row={r} />)}
        </section>
      ))}

      {/* kibbutzim whose only open work is 🔒 — they get a block of their own, after the rest */}
      {internalOnly.map(name => (
        <section className="ucal-lgroup" data-group={name} key={'io:' + name}>
          <div className="ucal-lgroup-head">
            <button type="button" className="ucal-lgroup-name" data-open-card={name} onClick={() => onOpenCard(name)}>
              🏘️ <bdi>{name}</bdi>
            </button>
          </div>
          {(internalBy[name] || []).map(r => <ListInternalRow key={'i:' + r.id} row={r} />)}
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
        <SheetHeader className="mb-2">
          <SheetTitle>יום לא רגיל</SheetTitle>
          <SheetDescription className="text-[12.5px]">חופש, מילואים או אירוע, וכולם יראו את זה ביומן.</SheetDescription>
        </SheetHeader>
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
        <SheetHeader className="mb-2">
          <SheetTitle><bdi>{heDate(date)}</bdi></SheetTitle>
          <SheetDescription className="text-[12.5px]">מה מוסיפים ליום הזה?</SheetDescription>
        </SheetHeader>
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
  const [workWeek, setWorkWeek] = React.useState(() => readFlag(WORK_WEEK_KEY, true));

  // ── whose calendar (round 5 · C2) ───────────────────────────────────────
  // עידן/עמיחי may show — and plan — a field person's day; a field person sees only his own.
  const people = React.useMemo(() => calendarPeople(role, me), [role, me]);
  const [person, setPerson] = React.useState(() => people[0] || me);
  React.useEffect(() => {
    if (people.length && people.indexOf(person) === -1) setPerson(people[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.join('|')]);
  const canPlan = canPlanFor(me, person, can);
  const [selected, setSelected] = React.useState('');
  const [sheetDay, setSheetDay] = React.useState('');
  const [addDay, setAddDay] = React.useState('');
  // Round 5 · C-U3 — one visit sheet, one event sheet for the whole island (desktop panel AND
  // phone bottom sheet both call into the same state, so only one ever mounts at a time and a
  // close leaves no overlay behind — Radix unmounts the portal with `open={false}`).
  const [openVisit, setOpenVisit] = React.useState<VisitRow | null>(null);
  const [openEventId, setOpenEventId] = React.useState('');
  // Designer round: on the phone, the day itself is a Sheet (`cal-sheet`) — opening VisitSheet/
  // EventSheet as a SECOND Radix dialog on top of it stacked two overlays and two ✕ buttons.
  // One sheet at a time: close the day sheet the moment a visit/event sheet takes over.
  const openVisitOne = React.useCallback((v: VisitRow) => { setSheetDay(''); setOpenVisit(v); }, []);
  const openEventOne = React.useCallback((id: string) => { setSheetDay(''); setOpenEventId(id); }, []);
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

  // 🔒 internal tasks are a layer of the grid too (round 4, Package X): a row with a due date
  // is a thing that happens on a day, and it belongs on the same page as everything else that
  // does. Same query the list view reads.
  const internalTasks = useOpenInternalTasks();

  const items = React.useMemo(() => calendarItems({
    events: events.data || [],
    visits,
    emsTasks: (() => { try { return (sigma.emsCacheData?.()?.tasks || []) as CalEmsTask[]; } catch { return []; } })(),
    internalTasks: (internalTasks.data || []) as CalInternalTask[],
    absences: absences.data || [],
  }, { me }), [events.data, absences.data, internalTasks.data, visits, me, tick]);

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

  // ── the days that calendar person never reported, in red (round 2, F-4 · G) ────────────
  //
  // A red cell is a NUDGE, not a verdict: it shows the person WHOSE CALENDAR IS OPEN (round 5
  // · C2 lets עידן/עמיחי show a field person's calendar), only on days already past, red only
  // for those who file (round 5 · C5), and it goes away the moment the day is filled in.
  const viewMonths = React.useMemo(() => {
    const out = new Set<string>();
    for (const w of weeks) for (const c of w.days) out.add(c.date.slice(0, 7));
    return Array.from(out).sort();
  }, [weeks.map(w => w.days[0].date).join('|')]);

  const attMonths = useQueries({
    queries: viewMonths.map(ym => {
      const [ry, rm] = ym.split('-').map(Number);
      return {
        queryKey: ['attRows', person, ry, rm],
        queryFn: () => readAttRows(person, ry, rm)
          ?? ((qc.getQueryData(['attRows', person, ry, rm]) as AttRow[] | null | undefined) ?? null),
        enabled: !!person,
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
      person,
      weeks,
      (_p, ry, rm) => attByMonth.get(ry + '-' + String(rm).padStart(2, '0')) ?? null,
      holidays.data || [],
    ),
    [person, attByMonth, holidays.data, weeks.map(w => w.days[0].date).join('|')],
  );

  // ── the days that calendar person already reported, in green (round 5 · B) ────────────
  // Same scope as `missing`: the same calendar person, read off the same נוכחות snapshot so
  // filing a day repaints both colours at once and they can never disagree.
  const reported = React.useMemo(
    () => reportedInView(
      person,
      weeks,
      (_p, ry, rm) => attByMonth.get(ry + '-' + String(rm).padStart(2, '0')) ?? null,
      holidays.data || [],
    ),
    [person, attByMonth, holidays.data, weeks.map(w => w.days[0].date).join('|')],
  );

  // ── the day's route ────────────────────────────────────────────────────
  const openDate = sheetDay || selected;
  const dayItems = openDate ? (index[openDate] || []) : [];
  const due = React.useMemo(() => dueByKibbutz(dayItems), [dayItems]);
  const plan = useQuery({
    queryKey: ['cal', 'plan', person, openDate],
    queryFn: () => readPlan(person, openDate),
    enabled: !!person && !!openDate,
    // ALWAYS fresh, against the 60 s default. The route is shared state — he reorders it
    // here and the arrival sheet reads the same row (§5.1) — and the query cache is
    // PERSISTED to localStorage, so the default would serve yesterday's order (or the empty
    // one from before he arranged the day) straight out of storage after a reload.
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const [draft, setDraft] = React.useState<string[] | null>(null);
  React.useEffect(() => { setDraft(null); }, [openDate, person]);
  const order = draft ?? (plan.data || []);
  const rows = React.useMemo(() => routeWithHeaders(order, due), [order, due]);

  const planGuard: PlanGuard = { me, today, can };

  const savePlan = useMutation({
    mutationFn: async (next: string[]) => sbWrite(async sb => sb.from('day_plans')
      .upsert({ person, date: openDate, stops: stopsPayload(next, due), updated_at: new Date().toISOString() },
        { onConflict: 'person,date' })
      .select('stops').maybeSingle()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cal', 'plan', person, openDate] });
      // The arrival sheet reads the same row (spec §5.1) — tell it without a reload.
      try { (window as any).sigmaEmit?.('dayplan-changed', { person, date: openDate }); } catch { /* no bus */ }
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

  // ── kibbutz blocks (round 5 · C1/C2) ────────────────────────────────────
  // "Whose tasks fill the blocks" — the calendar person's, plus אביאם's peer (ניתאי) only
  // when he turned the setting on and he is the one looking at his own calendar.
  const settings = useSettings();
  const owners = React.useMemo(
    () => taskOwners(person, me, settings.cal_peer_tasks),
    [person, me, settings.cal_peer_tasks],
  );
  const blocks = React.useMemo(() => planBlocks({
    date: openDate,
    today,
    owners,
    emsTasks: (() => { try { return (sigma.emsCacheData?.()?.tasks || []) as CalEmsTask[]; } catch { return []; } })(),
    internalTasks: (internalTasks.data || []) as CalInternalTask[],
    stops: order,
  }), [openDate, today, owners.join('|'), internalTasks.data, order.join('|'), tick]);

  const pick = useMutation({
    mutationFn: async (p: BlockPick) => ({ p, res: await applyBlockPick(p, person, openDate, due, planGuard) }),
    onSuccess: ({ p, res }) => {
      setDraft(p.stops);
      setTick(t => t + 1);
      qc.invalidateQueries({ queryKey: ['cal', 'plan', person, openDate] });
      qc.invalidateQueries({ queryKey: ['cal', 'internal-tasks'] });
      const failed = res.failed.length ? ' · ' + res.failed.length + ' לא עודכנו' : '';
      toast(p.message + failed, {
        duration: 5000,
        action: {
          label: 'ביטול',
          onClick: () => {
            void undoBlockPick(p, person, openDate, due, planGuard)
              .then(() => { setDraft(p.stopsBefore); setTick(t => t + 1); })
              .catch(() => toast.error('הביטול לא עבר'));
          },
        },
      });
      track('calendar-block-pick', String(p.count));
    },
    onError: (e: any) => toast.error(String(e?.message || 'השמירה לא עברה')),
  });

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

  // A small test/deep-link hook (round 5 · C-U2) — jumps straight to a day without clicking
  // through months, the way `MOCK_CAL_DAY` already lets Playwright find the sandbox's day.
  React.useEffect(() => {
    (window as any).sigmaCalendarOpenDay = openDay;
    return () => { delete (window as any).sigmaCalendarOpenDay; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          </div>
        ) : null}
      </div>

      {/* Round 5 · C2 — whose calendar. Field people never see this; עידן/עמיחי can show (and
          plan) a field person's day too. */}
      {people.length > 1 ? (
        <div className="mb-2 ucal-person-switch ucal-switch-split" data-testid="cal-person" role="radiogroup" aria-label="של מי היומן">
          {people.map(p => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={person === p}
              className={'ucal-switch-btn' + (person === p ? ' ucal-switch-on' : '')}
              onClick={() => { setPerson(p); track('calendar-person'); }}
            >
              <bdi>{p}</bdi>
            </button>
          ))}
        </div>
      ) : null}

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
              mode={view === 'week' ? 'week' : 'month'}
              workWeek={workWeek}
              missing={missing}
              reported={reported}
            />
          )}
          {/* Round 5 · C5 — the legend always shows (design-system DayCell rulings), red joins
              it only for a filer (אביאם/ניתאי). */}
          {!loading ? (
            <ul className="ucal-legend" data-testid="cal-legend">
              {legendItems(person).map(i => (
                <li key={i.key} data-legend={i.key}>
                  <span className={'ucal-swatch ucal-swatch-' + i.key} aria-hidden />
                  {i.label}
                </li>
              ))}
            </ul>
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
                stops={order}
                canReorder={canPlan}
                onMove={move}
                onPlace={placeStop}
                onBriefing={openBriefing}
                onCheckin={k => { if (!openVisitChapters(k)) sigma.openVisitQuick?.(k); }}
                onAdd={d => setAddDay(d)}
                canAdd={canPlan}
                visits={visits}
                kibbutzim={kibbutzNames}
                blocks={blocks}
                onPick={(b, ticked) => pick.mutate(pickBlock(b, ticked, openDate, order))}
                blockBusy={pick.isPending}
                peer={owners.length > 1}
                onVisitOpen={openVisitOne}
                onEventOpen={openEventOne}
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
          <SheetHeader className="mb-2">
            <SheetTitle className="sr-only">{sheetDay ? heDate(sheetDay) : 'יום'}</SheetTitle>
            <SheetDescription className="sr-only">פירוט היום לפי קיבוץ.</SheetDescription>
          </SheetHeader>
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
                  stops={order}
                  canReorder={canPlan}
                  onMove={move}
                  onPlace={placeStop}
                  onBriefing={openBriefing}
                  onCheckin={k => { if (!openVisitChapters(k)) sigma.openVisitQuick?.(k); }}
                  onAdd={d => setAddDay(d)}
                  canAdd={canPlan}
                  visits={visits}
                  kibbutzim={kibbutzNames}
                  blocks={blocks}
                  onPick={(b, ticked) => pick.mutate(pickBlock(b, ticked, openDate, order))}
                  blockBusy={pick.isPending}
                  peer={owners.length > 1}
                  onVisitOpen={openVisitOne}
                  onEventOpen={openEventOne}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </SheetContent>
      </Sheet>

      <VisitSheet visit={openVisit} onClose={() => setOpenVisit(null)} />
      <EventSheet
        event={openEventId ? (events.data || []).find(e => String(e.id) === openEventId) || null : null}
        onClose={() => setOpenEventId('')}
      />

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
