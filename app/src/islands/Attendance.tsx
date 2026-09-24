// #sigma-attendance — 📅 נוכחות (spec §7e).
//
// THE POINT OF THE REDESIGN: on a phone, the month and today's action fit on ONE screen.
// Header → היום card with the day types one tap away → three KPIs → the month grid →
// the missing days as chips → the report buttons. Nothing important is below the fold.
// On a wide screen the same grid sits beside a day panel that stays open while browsing.
//
// 🕎 Holidays: a day the company was closed is violet and muted, and it is never "missing".
// Entering attendance on one is still perfectly allowed — the sheet says so, positively —
// and the day then counts as a work day with a 🕎 in the monthly report.
//
// WRITES GO THROUGH THE BRIDGE. `sigma.attSave` is the same call the legacy form makes
// (js/src/04-attendance-daily.js attSaveRow), so the gates, the optimistic SHEET_DATA push
// and the PDF/Excel builders keep seeing one shape. This island renders; it does not invent
// a second way to save a day.
//
// Every DECISION is pure and lives in app/src/lib/attendance.ts (goldens: attendance.test.ts).
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, UserCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PageActionRow } from '@/components/ui/page-action-row';
import { IconBubble } from '@/components/ui/icon-bubble';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { FilterChip, Tag } from '@/components/ui/chip';
import { BubbleButton } from '@/components/ui/bubble-button';
import { StatTile, StatTileGrid } from '@/components/ui/stat-tile';
import { DayCell as DayCellUI, type DayCellFill } from '@/components/ui/day-cell';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { isGateOpen, useEmsGate } from '@/lib/session';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import {
  attCellLook, attLegend, attTiles, canEditAttendance, canOverride, canSwitchPerson, dayChip, dayLabel, DAY_ORDER,
  EVE_COUNTDOWN_MS, EVE_DEFAULT_TYPE, eveCountdownText, HE_DAY_LETTERS, holidayNote,
  kpis as computeKpis, mergeByDay, missingBlock, missingByPerson, missingDays, monthGrid, originLine, rowOrigin, savedToast,
  toggleTile, ymd,
  type AttRow, type AttCellState, type DayCell, type DayType, type Holiday, type TileKey,
} from '@/lib/attendance';

// ───────────────────────────── data ─────────────────────────────

/**
 * The legacy bundle owns SHEET_DATA and fills it asynchronously. Returning `null` (rather
 * than an empty array) while it is not there yet is what lets the query keep polling
 * instead of caching "this person has no month".
 */
function readRows(person: string, year: number, month: number): AttRow[] | null {
  if (!person) return null;
  try {
    if (!(window as any).SHEET_DATA) return null;
    return (sigma.attRows?.(person, year, month) || []) as AttRow[];
  } catch { return null; }
}

async function readHolidays(): Promise<Holiday[]> {
  try {
    await sigma.attHolidaysLoad?.();
    return (sigma.attHolidays?.() || []) as Holiday[];
  } catch { return []; }
}

// ───────────────────────────── small pieces ─────────────────────────────

/** attCellLook's AttCellState → the DayCell props it actually is (A-U3). `selected` and
    `today` are independent flags on DayCell; `holiday`/`eve`/`missing` collapse from the one
    look state attCellLook already resolved (tile filter, filer gate, holiday/eve purple —
    all decided in lib/attendance.ts, never here). */
const CELL_FILL: Partial<Record<AttCellState, DayCellFill>> = {
  holiday: 'holiday', field: 'field', office: 'office', away: 'away',
};

/** attLegend's keys → the same swatch colors the grid itself draws (A-U3). */
const LEGEND_DOT: Record<string, string> = {
  holiday: 'bg-[var(--holiday-ink)]', eve: 'bg-[var(--holiday-ink)]', field: 'bg-[var(--ok-ink)]',
  office: 'bg-[var(--info-ink)]', away: 'bg-[var(--neutral-ink)]', missing: 'bg-[var(--danger-ink)]',
};

function DayTypeRow({ value, onPick, busy }: { value: DayType | null; onPick: (t: DayType) => void; busy: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="סוג היום">
      {/* FilterChip has neither a `disabled` prop nor its own prop pass-through — a wrapper
          span carries both the data-daytype test hook and the busy state (visibly dimmed +
          aria-disabled, review round item 4), and the guard against a stray click stays on
          onClick since the chip itself can't be disabled. */}
      {DAY_ORDER.map(t => (
        <span key={t} data-daytype={t} aria-disabled={busy || undefined} className={busy ? 'pointer-events-none opacity-50' : undefined}>
          <FilterChip selected={value === t} onClick={() => !busy && onPick(t)}>
            {dayLabel(t)}
          </FilterChip>
        </span>
      ))}
    </div>
  );
}

/** A-U3: the design-system DayCell grid, its look decided by attCellLook (A-L3) — a tile
    colors only its own category; holiday/eve purple is context and always stays; missing is
    red only for a filer (mustFile). `data-state` keeps monthGrid's own semantic state too
    (holiday/eve/weekend/…) — DayCell's `data-fill` only covers the fills it draws, and
    Holidays.tsx / other readers still key off the state monthGrid computed. */
function MonthGridView({
  grid, onPick, selected, person, tile,
}: { grid: ReturnType<typeof monthGrid>; onPick: (c: DayCell) => void; selected: string; person: string; tile: TileKey | null }) {
  // role="group", not "grid": a CSS grid of DayCell buttons isn't organized into ARIA "row"
  // ancestors, and role="grid" without them is an axe aria-required-children/parent critical
  // (review round item 3). Each cell already carries its own aria-label.
  return (
    <div data-testid="att-grid" className="att-grid" role="group" aria-label={'לוח ' + grid.label}>
      {HE_DAY_LETTERS.map((l, i) => (
        <div key={'h' + i} aria-hidden className="pb-1 text-center text-[11px] font-bold text-muted-foreground">{l}</div>
      ))}
      {grid.weeks.flat().map((c, i) => {
        if (c === null) return <div key={'b' + i} aria-hidden />;
        const isSelected = selected === c.date;
        const look = attCellLook(c, { person, tile, selected: isSelected });
        return (
          <DayCellUI
            key={c.date}
            day={c.day}
            data-date={c.date}
            data-state={c.state}
            data-att-state={c.state}
            data-eve={c.eve ? '1' : undefined}
            fill={CELL_FILL[look.state] || 'none'}
            eve={look.state === 'eve'}
            missing={look.state === 'missing'}
            selected={look.state === 'selected'}
            today={look.today}
            label={look.label}
            onClick={() => onPick(c)}
          />
        );
      })}
    </div>
  );
}

/** The editor for one day — the body of the phone sheet AND of the desktop panel.
    `showHeader` is false on the phone: the Sheet's own visible SheetTitle (A-U4) already
    carries the date, and this header would just repeat it right underneath. */
function DayEditor({
  cell, busy, canEdit = true, showHeader = true, onSave,
}: { cell: DayCell; busy: boolean; canEdit?: boolean; showHeader?: boolean; onSave: (type: DayType, note: string) => void }) {
  const [note, setNote] = React.useState(cell.row?.note || '');
  const [pending, setPending] = React.useState<DayType | null>(null);
  React.useEffect(() => { setNote(cell.row?.note || ''); setPending(null); }, [cell.date, cell.row?.note]);

  // ── ערב חג: the default files itself unless the person stops it (F-5) ────────────
  // A day people mostly spend at home should not cost a tap. Opening an empty ערב חג starts
  // a four-second countdown that saves 🏠 מהבית; touching ANYTHING — another type, the
  // ביטול button — cancels it, and שמירה just files it sooner.
  const eveCandidate = cell.eve && !cell.row && canEdit;
  const [evePaused, setEvePaused] = React.useState(false);
  // `window.__sigmaEveCountdownMs` lets the QA harness stretch the 4 s (a loaded desktop run
  // took longer than that to reach the ביטול button); production never sets it.
  const eveMs = (typeof window !== 'undefined' && Number((window as any).__sigmaEveCountdownMs)) || EVE_COUNTDOWN_MS;
  const [secs, setSecs] = React.useState(eveMs / 1000);
  React.useEffect(() => { setEvePaused(false); setSecs(eveMs / 1000); }, [cell.date, eveMs]);
  React.useEffect(() => {
    if (!eveCandidate || evePaused || pending || busy) return;
    const started = Date.now();
    const tick = window.setInterval(() => {
      const n = Math.ceil((eveMs - (Date.now() - started)) / 1000);
      setSecs(n > 0 ? n : 0);
    }, 250);
    const fire = window.setTimeout(() => onSave(EVE_DEFAULT_TYPE, ''), eveMs);
    return () => { window.clearInterval(tick); window.clearTimeout(fire); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eveCandidate, evePaused, pending, busy, cell.date]);

  const current = (pending || cell.row?.type || null) as DayType | null;
  const needsNote = current === 'other';
  const invite = holidayNote(cell.holiday);

  // A-U4 (A4): an automatic/calendar day says where it came from instead of opening straight
  // to the chips — "שינוי" reveals them. A manual day (or once revealed) shows the chips as
  // before. `revealed` resets whenever the sheet moves to a different day.
  const origin = rowOrigin(cell.row || null);
  const showOrigin = canEdit && origin !== 'manual' && origin !== 'none' && canOverride(cell.row || null);
  const [revealed, setRevealed] = React.useState(false);
  React.useEffect(() => { setRevealed(false); }, [cell.date]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        {showHeader && <span className="text-[15px] font-extrabold"><bdi>{dayChip(cell.date)}</bdi></span>}
        {cell.holiday && <Tag role="holiday">{cell.holiday.name}</Tag>}
      </div>

      {/* A חג is an invitation, never a demand (spec §6: positive, no system-talk). */}
      {!!invite && <p data-testid="att-holiday-note" className="text-[12.5px] text-muted-foreground">{invite}</p>}

      {/* the ערב חג countdown, and the one tap that stops it */}
      {eveCandidate && !evePaused && !pending && (
        <div data-testid="att-eve-countdown" className="flex items-center gap-2 rounded-[12px] border border-border bg-muted px-3 py-2">
          <span className="text-[13px] font-bold tabular-nums">{eveCountdownText(secs)}</span>
          <BubbleButton variant="neutral" size="sm" className="ms-auto" data-testid="att-eve-cancel" onClick={() => setEvePaused(true)}>
            ביטול
          </BubbleButton>
        </div>
      )}

      {!canEdit ? (
        <div data-testid="att-readonly" className="rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[13px]">
          <div className="font-bold">{cell.row ? dayLabel(cell.row.type) : 'אין דיווח ליום הזה'}</div>
          <div className="mt-0.5 text-muted-foreground">צפייה בלבד.</div>
        </div>
      ) : showOrigin && !revealed ? (
        <div className="rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[13px]">
          <div className="text-muted-foreground">{originLine(cell.row || null)}</div>
          <BubbleButton variant="tonal" size="sm" className="mt-2" onClick={() => setRevealed(true)}>
            שינוי
          </BubbleButton>
        </div>
      ) : (
        <>
          <DayTypeRow value={current} onPick={t => { setEvePaused(true); setPending(t); setRevealed(true); }} busy={busy} />
          {needsNote && (
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="מה היה היום?"
              aria-label="פירוט היום"
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13.5px] outline-none focus:border-[color:var(--brand-1)]"
            />
          )}
          <BubbleButton
            variant="primary"
            size="lg"
            data-testid="att-save"
            disabled={busy || !current || (needsNote && !note.trim())}
            onClick={() => current && onSave(current, note)}
          >
            {busy ? 'שומר…' : cell.row ? 'עדכון' : 'שמירה'}
          </BubbleButton>
        </>
      )}
    </div>
  );
}

// ───────────────────────────── the island ─────────────────────────────

function AttendanceIsland() {
  const gate = useEmsGate();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const { name: me } = useCurrentUser();
  const today = React.useMemo(() => new Date(), []);
  const todayKey = ymd(today);

  const [person, setPerson] = React.useState<string>(() => {
    try { return sigma.attPerson?.() || me; } catch { return me; }
  });
  const [ym, setYm] = React.useState(() => ({ y: today.getFullYear(), m: today.getMonth() + 1 }));
  const [open, setOpen] = React.useState('');            // the date the phone sheet is on
  const [selected, setSelected] = React.useState(todayKey);   // the date the desktop panel shows
  // A-U3 (A3): the selected StatTile filter. Survives a month change, resets on person change
  // (Review Focus #3 — the count updates, the filter keeps working).
  const [tile, setTile] = React.useState<TileKey | null>(null);
  React.useEffect(() => { setTile(null); }, [person]);
  // Review round (designer 2): "חסר לך" shows the latest few days and expands on request.
  const [showAllMissing, setShowAllMissing] = React.useState(false);
  React.useEffect(() => { setShowAllMissing(false); }, [person, ym.y, ym.m]);
  const attGuard = useUnsavedGuard({ dirty: () => false, onClose: () => setOpen('') });

  // עידן, עמיחי (CEO) and the viewer may look at someone else's month; a field worker sees
  // his own. This mirrors js/src/11-search-login.js `canSeeAttendance`, whose own comment
  // says "עידן/עמיחי (CEO) see all via person-toggle" — עמיחי was missing from this half.
  // Round 2 (F-6): אביאם asked to SEE ניתאי's month so he can tell him to fill it in — so
  // the switch got wider and the WRITE did not. Both questions are goldens in lib/attendance.
  const flags = (() => {
    try { return { isIdan: !!sigma.isIdan?.(), isViewer: !!sigma.isViewer?.() }; } catch { return {}; }
  })();
  const canSwitch = canSwitchPerson(me, flags);
  const people: string[] = (() => { try { return sigma.ATT_PEOPLE || []; } catch { return []; } })();

  React.useEffect(() => { if (!person && me) setPerson(me); }, [me, person]);

  const rowsQ = useQuery({
    queryKey: ['attRows', person, ym.y, ym.m],
    // §7k #10: every mount now refetches in the background (lib/query.ts
    // `refetchOnMount: 'always'`), and this reader answers `null` while SHEET_DATA is still
    // in flight. Letting that null land would BLANK a month restored from the persisted
    // cache — exactly the flash stale-while-revalidate exists to prevent — so a null keeps
    // whatever is already there and the poll below tries again.
    queryFn: () => readRows(person, ym.y, ym.m)
      ?? ((qc.getQueryData(['attRows', person, ym.y, ym.m]) as AttRow[] | null | undefined) ?? null),
    enabled: !!person,
    // SHEET_DATA lands a moment after boot and announces nothing. Poll ONLY until it does.
    refetchInterval: q => (q.state.data ? false : 1500),
  });
  const holidaysQ = useQuery({ queryKey: ['holidays'], queryFn: readHolidays, staleTime: 6 * 3600_000 });

  const refresh = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['attRows'] });
  }, [qc]);
  useSigmaEvent('attendance-saved', refresh);
  useSigmaEvent('visit-saved', refresh);
  // The 🕎 list is fetched by the LEGACY side (js/src/04-attendance-daily.js) and cached here
  // for six hours. Mount before that fetch lands — the ordinary cold boot — and the island
  // caches an EMPTY list for the rest of the session: no 🕎 in the month grid, and every
  // holiday counted as a missing day in the KPIs. `holidays-loaded` is emitted exactly when
  // the list arrives; until the Task 18 sweep nothing listened to it (integration contract b).
  useSigmaEvent('holidays-loaded', () => { void qc.invalidateQueries({ queryKey: ['holidays'] }); });
  useSigmaEvent('user-changed', () => { try { setPerson(sigma.attPerson?.() || ''); } catch { /* legacy gone */ } });

  // round 5 · V8: the rows ARE the answer — package V writes every visit day as a visit_auto
  // row, so nothing is derived from the visits any more.
  const rows = React.useMemo(() => mergeByDay((rowsQ.data || []) as AttRow[]), [rowsQ.data]);
  const canEdit = canEditAttendance(me, person, flags);
  const holidays = (holidaysQ.data || []) as Holiday[];
  const grid = React.useMemo(() => monthGrid(ym.y, ym.m, rows, holidays, today), [ym, rows, holidays, today]);
  const missing = React.useMemo(() => missingDays(rows, holidays, today, ym.y, ym.m), [rows, holidays, today, ym]);
  const kpis = React.useMemo(() => computeKpis(rows, missing, holidays), [rows, missing, holidays]);
  const mb = React.useMemo(() => missingBlock(person, me, missing, kpis.onHoliday), [person, me, missing, kpis.onHoliday]);
  // עידן 20.9 #2 — whoever can switch person is here to CHASE the gaps, not to browse a
  // calendar, so they get the same question answered for the whole team at once. Read
  // straight off the legacy snapshot (the same source `readRows` uses for the open person),
  // recomputed when the snapshot lands or the month moves.
  const teamMissing = React.useMemo(
    () => (canSwitch ? missingByPerson(people, p => readRows(p, ym.y, ym.m), holidays, today, ym.y, ym.m) : []),
    // `rows` is in the deps on purpose: it is the signal that SHEET_DATA arrived, which is
    // what makes every OTHER person's rows readable too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canSwitch, people.join('|'), ym.y, ym.m, holidays, today, rows],
  );

  // Keep the LEGACY report in step: it is what `📄 PDF` and `📗 Excel` read
  // (window._attendanceRows + #attendanceMonthLabel), so the month and the person the island
  // shows have to be the month and person the hidden report last rendered.
  React.useEffect(() => {
    try {
      (window as any).attendanceViewYear = ym.y;
      (window as any).attendanceViewMonth = ym.m - 1;
      if (person) sigma.setAttPerson?.(person);
      else sigma.attRefresh?.();
    } catch { /* legacy report not on this page */ }
  }, [ym, person]);

  const save = useMutation({
    mutationFn: async (v: { date: string; type: DayType; note: string }) =>
      sigma.attSave!({ person, date: v.date, dayType: v.type, note: v.note }),
    onSuccess: (_d, v) => {
      track('attendance-save', v.type);
      const cell = grid.cells.find(c => c.date === v.date);
      toast.success(savedToast(v.type, v.date, cell?.holiday || null));
      setOpen('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || 'השמירה לא עברה. אפשר לנסות שוב'),
  });

  const openDay = (c: DayCell) => {
    setSelected(c.date);
    // The phone bottom sheet must stay closed on desktop: opening it renders Radix's
    // full-screen overlay (fixed inset-0 z-50), which isn't scoped by the `lg:hidden` on
    // SheetContent and sat over the sticky att-panel, eating every click — including the
    // ערב חג ביטול button — even though the sheet itself was invisible. Same guard as
    // Calendar.tsx `openDay` for its own sheet.
    if (typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(max-width: 1023px)').matches) {
      track('attendance-day', c.state);
      return;
    }
    setOpen(c.date);
    track('attendance-day', c.state);
  };
  const shiftMonth = (d: number) => setYm(s => {
    const m = s.m + d;
    if (m > 12) return { y: s.y + 1, m: 1 };
    if (m < 1) return { y: s.y - 1, m: 12 };
    return { y: s.y, m };
  });

  const todayCell = grid.cells.find(c => c.date === todayKey) || null;
  const selectedCell = grid.cells.find(c => c.date === selected) || todayCell;
  const openCell = grid.cells.find(c => c.date === open) || null;
  const dur = reduce ? 0 : 0.2;

  if (!isGateOpen(gate)) return null;          // §7n — nothing without a live sign-in

  return (
    <div className="att-root">
      {/* ── header: who, which month, and the two reports (A-U1, design-system PageActionRow) */}
      <div className="mb-2.5">
        <PageActionRow
          title={<><UserCheck aria-hidden className="me-1.5 inline h-[18px] w-[18px] text-[color:var(--brand-1)]" />נוכחות · <bdi>{person || me}</bdi></>}
          actions={<>
            <span data-testid="att-pdf">
              <IconBubble icon={<FileText aria-hidden className="h-4 w-4" />} label="הורדת דוח נוכחות PDF" size={40}
                onClick={() => { track('attendance-pdf'); sigma.attExportPdf?.(); }} />
            </span>
            <span data-testid="att-excel">
              <IconBubble icon={<FileSpreadsheet aria-hidden className="h-4 w-4" />} label="הורדת דוח נוכחות Excel" size={40}
                onClick={() => { track('attendance-xlsx'); sigma.attExportExcel?.(); }} />
            </span>
          </>}
        />

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {/* The person switch (F-6), on FilterChip (A-U review round): FilterChip's 32px
              visual carries `.s-hit`'s invisible ::before, growing the REAL tap target to 48
              (data-hit-slop tells the sweep so) — the plain radio buttons this replaced were
              a genuine 57×32/50×32 undersized target. FilterChip still forwards none of its
              own props to the DOM, so data-person/aria-pressed stay on a wrapper span. */}
          {canSwitch && people.length > 1 && (
            <div data-testid="att-person" className="flex gap-1" role="group" aria-label="בחירת עובד">
              {people.map(p => (
                <span key={p} data-person={p}>
                  <FilterChip selected={p === person} onClick={() => { setPerson(p); track('attendance-person'); }}>
                    <bdi>{p}</bdi>
                  </FilterChip>
                </span>
              ))}
            </div>
          )}

          <div className="ms-auto flex items-center gap-1">
            {/* RTL: the "previous month" control sits on the right, so it points right. */}
            <IconBubble icon={<ChevronRight aria-hidden className="h-4 w-4" />} label="חודש קודם" size={32} onClick={() => shiftMonth(-1)} />
            <span data-testid="att-month" className="min-w-[104px] text-center text-[13.5px] font-bold">{grid.label}</span>
            <IconBubble icon={<ChevronLeft aria-hidden className="h-4 w-4" />} label="חודש הבא" size={32} onClick={() => shiftMonth(1)} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-3">
          {/* ── חסר לך — FIRST, before anything else (עידן 20.9 #2; A-U2, design-system
              SectionBlock/ListRow). The screen used to open on the calendar and keep the
              gaps in a box underneath it, so the one question a person comes here with —
              "what do I still owe?" — was the last thing answered. It is now the first,
              and every row is one tap into that day's sheet. */}
          {mb.show && (
          <div data-testid="att-missing">
            <SectionBlock
              title={<>
                {mb.title}
                {/* SectionBlock's own count Tag isn't wired to a stable test id — a visible
                    span alongside the title carries att-missing-count (§9 ask); the review
                    round asked for the count IN the title, not hidden. */}
                {mb.count > 0 && (
                  <span data-testid="att-missing-count" className="ms-1.5 inline-flex">
                    <Tag role="danger"><bdi>{mb.count}</bdi></Tag>
                  </span>
                )}
              </>}
              titleRole={mb.count ? 'danger' : 'default'}
            >
              {mb.count ? (<>
                {/* Review round: the block ran too tall with a full month of gaps — show the
                    latest few and let "עוד N ימים" expand the rest, same pattern a long list
                    anywhere else in the app uses. */}
                {(showAllMissing ? mb.days : mb.days.slice(-4)).map(d => (
                  <ListRow
                    key={d.date}
                    data-missing={d.date}
                    aria-label={d.aria}
                    title={<bdi>{d.label}</bdi>}
                    onClick={() => openDay(grid.cells.find(c => c.date === d.date)!)}
                  />
                ))}
                {!showAllMissing && mb.days.length > 4 && (
                  <ListRow
                    title={'עוד ' + (mb.days.length - 4) + ' ימים'}
                    onClick={() => setShowAllMissing(true)}
                  />
                )}
              </>) : (
                <p className="px-4 py-1 text-[12.5px] text-muted-foreground">{mb.empty}</p>
              )}
            </SectionBlock>
          </div>
          )}

          {/* ── …and for עידן / עמיחי / צפייה, the same question for everyone ──── */}
          {canSwitch && teamMissing.length > 1 && (
            <div data-testid="att-missing-team">
              <SectionBlock title="חסר לצוות">
                {teamMissing.map(t => (
                  <ListRow
                    key={t.person}
                    data-person-missing={t.person}
                    data-count={t.known ? String(t.count) : ''}
                    aria-pressed={t.person === person}
                    title={<bdi>{t.person}</bdi>}
                    meta={<bdi>{t.known ? t.count : '—'}</bdi>}
                    onClick={() => { setPerson(t.person); track('attendance-person'); }}
                  />
                ))}
              </SectionBlock>
            </div>
          )}

          {/* ── היום: the one thing this screen is for ───────────────────────── */}
          {todayCell && (
            <div data-testid="att-today">
              <SectionBlock title="היום" flush>
                <div className="px-4 py-1">
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-[12.5px] text-muted-foreground"><bdi>{dayChip(todayKey)}</bdi></span>
                    {todayCell.row && <Tag role="ok" className="ms-auto">{dayLabel(todayCell.row.type)}</Tag>}
                  </div>
                  {todayCell.holiday && !todayCell.holiday.required && (
                    <p className="mb-2 text-[12.5px] text-muted-foreground">{holidayNote(todayCell.holiday)}</p>
                  )}
                  {!canEdit ? (
                    <p className="text-[13px] text-muted-foreground">
                      {todayCell.row ? 'דיווח: ' + dayLabel(todayCell.row.type) : 'עוד אין דיווח להיום.'} צפייה בלבד.
                    </p>
                  ) : (
                    <DayTypeRow
                      value={(todayCell.row?.type as DayType) || null}
                      busy={save.isPending}
                      onPick={t => (t === 'other' ? openDay(todayCell) : save.mutate({ date: todayKey, type: t, note: '' }))}
                    />
                  )}
                </div>
              </SectionBlock>
            </div>
          )}

          {/* ── the tiles: tap one to color only its category on the month (A-L3, A3) ── */}
          <StatTileGrid>
            {/* StatTile doesn't forward its own props to the DOM yet — a wrapper span carries
                the att-kpi-<key> test hook (§9-style gap, same as ListRow before its own
                pass-through landed). attTiles()'s own order stays field/office/missing (its
                golden pins that) — only the RENDER order changes: missing leads and spans the
                full row, so a filer's three tiles don't leave a lopsided lone third tile
                (review round item 4). */}
            {[...attTiles(kpis, person)].sort((a, b) => (a.key === 'missing' ? -1 : b.key === 'missing' ? 1 : 0)).map(t => (
              <span key={t.key} data-testid={'att-kpi-' + t.key} className="contents">
                <StatTile
                  value={t.value}
                  label={t.label}
                  role={t.role}
                  selected={tile === t.key}
                  className={t.key === 'missing' ? 'col-span-full' : undefined}
                  onClick={() => { setTile(cur => toggleTile(cur, t.key)); track('attendance-tile', t.key); }}
                />
              </span>
            ))}
          </StatTileGrid>

          {/* ── the month ─────────────────────────────────────────────────────── */}
          <section className="rounded-[14px] border border-border bg-card p-2.5">
            {rowsQ.data === null || rowsQ.isLoading
              ? <Skeleton className="h-[236px] w-full rounded-[10px]" />
              : <MonthGridView grid={grid} onPick={openDay} selected={selected} person={person} tile={tile} />}
            <ul data-testid="att-legend" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {attLegend(person).map(item => (
                <li key={item.key} data-legend={item.key} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span aria-hidden className={'h-1.5 w-1.5 rounded-full ' + LEGEND_DOT[item.key]} />
                  {item.label}
                </li>
              ))}
            </ul>
          </section>

        </div>

        {/* ── desktop: the day panel stays open while browsing the grid ───────── */}
        <aside className="hidden lg:block" data-testid="att-panel">
          <div className="sticky top-3 rounded-[14px] border border-border bg-card p-3.5">
            {selectedCell ? (
              <DayEditor
                cell={selectedCell}
                busy={save.isPending}
                canEdit={canEdit}
                onSave={(t, note) => save.mutate({ date: selectedCell.date, type: t, note })}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">בוחרים יום בלוח כדי לערוך אותו.</p>
            )}
          </div>
        </aside>
      </div>

      {/* ── phone: the same editor as a bottom sheet ─────────────────────────── */}
      {/* §7p, wired for completeness: the day editor writes each choice as it is made, so
          there is no draft to lose and the predicate is honestly false. */}
      <Sheet open={!!open} onOpenChange={o => { if (!o) attGuard.ask(); }}>
        <SheetContent side="bottom" data-testid="att-sheet" className="max-h-[80svh] overflow-y-auto lg:hidden" {...attGuard.contentProps}>
          {/* A-U4: a visible title (dayChip), not sr-only — the design-system Sheet header
              already renders the ✕ "סגירה" close button as a grid cell beside it. */}
          <SheetHeader className="mb-2">
            <SheetTitle><bdi>{openCell ? dayChip(openCell.date) : 'יום'}</bdi></SheetTitle>
            <SheetDescription className="sr-only">עריכת סוג היום.</SheetDescription>
          </SheetHeader>
          <AnimatePresence mode="wait" initial={false}>
            {openCell && (
              <motion.div
                key={openCell.date}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: dur, ease: 'easeOut' }}
              >
                <DayEditor
                  cell={openCell}
                  busy={save.isPending}
                  canEdit={canEdit}
                  showHeader={false}
                  onSave={(t, note) => save.mutate({ date: openCell.date, type: t, note })}
                />
              </motion.div>
            )}
          </AnimatePresence>
        {attGuard.prompt}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function Attendance() {
  return <SigmaProviders><AttendanceIsland /></SigmaProviders>;
}

/**
 * Mount, and fold the legacy summary + table away. They stay in the DOM and keep rendering:
 * `📄 PDF` and `📗 Excel` read what that render leaves behind (window._attendanceRows), so
 * hiding them — rather than deleting them — is what keeps the monthly reports working while
 * the island owns the screen.
 */
export function mountAttendance(): boolean {
  const ok = mount('sigma-attendance', Attendance);
  if (ok) {
    const legacy = document.getElementById('attendanceLegacy');
    if (legacy) legacy.style.display = 'none';
  }
  return ok;
}
