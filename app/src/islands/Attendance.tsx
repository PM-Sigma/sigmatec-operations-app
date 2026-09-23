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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { isGateOpen, useEmsGate } from '@/lib/session';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { visitorsOf } from '@/lib/field';
import {
  canEditAttendance, canSwitchPerson, cellsOf, dayChip, dayLabel, DAY_ORDER,
  EVE_COUNTDOWN_MS, EVE_DEFAULT_TYPE, eveCountdownText, HE_DAY_LETTERS, holidayNote,
  holidayShort, kpis as computeKpis, missingByPerson, missingDays, monthGrid, savedToast,
  withVisitDays, ymd, type AttRow, type DayCell, type DayType, type Holiday, type VisitLike,
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

/**
 * The visit summaries of the month, straight off the same snapshot. The legacy merge already
 * folds them into `attRows`; reading them HERE as well is what lets `withVisitDays` re-derive
 * the field days from the visits themselves, so an edited visit date moves the day instead
 * of leaving the old one behind (round 2, F-2). The merge is idempotent — no duplicate rows.
 */
function readVisits(person: string, year: number, month: number): VisitLike[] | null {
  if (!person) return null;
  try {
    const data = (window as any).SHEET_DATA;
    if (!data) return null;
    const prefix = year + '-' + String(month).padStart(2, '0');
    return ((data.visits || []) as any[])
      .filter(v => v && visitorsOf(v).includes(person) && String(v.date || '').slice(0, 7) === prefix
        || (v && visitorsOf(v).includes(person) && new Date(v.date).getFullYear() === year
            && new Date(v.date).getMonth() + 1 === month))
      .map(v => ({ id: v.id, visitor: v.visitor, date: v.date, kibbutz: v.kibbutz,
        duration: v.duration, workday: !!v.workday })) as VisitLike[];
  } catch { return null; }
}

async function readHolidays(): Promise<Holiday[]> {
  try {
    await sigma.attHolidaysLoad?.();
    return (sigma.attHolidays?.() || []) as Holiday[];
  } catch { return []; }
}

// ───────────────────────────── small pieces ─────────────────────────────

/** The cell's colour, as a class pair. The STATE is decided in lib/attendance.ts. */
const CELL_CLASS: Record<string, string> = {
  field: 'att-cell-field',
  office: 'att-cell-office',
  away: 'att-cell-away',
  missing: 'att-cell-missing',
  weekend: 'att-cell-weekend',
  holiday: 'att-cell-holiday',
  today: 'att-cell-today',
  future: 'att-cell-future',
};

function Kpi({ label, value, tone }: { label: string; value: number; tone: 'field' | 'office' | 'missing' }) {
  return (
    <div className={'att-kpi att-kpi-' + tone} data-testid={'att-kpi-' + tone}>
      <div className="text-[19px] font-extrabold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[11.5px] font-semibold opacity-80">{label}</div>
    </div>
  );
}

function DayTypeRow({ value, onPick, busy }: { value: DayType | null; onPick: (t: DayType) => void; busy: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="סוג היום">
      {DAY_ORDER.map(t => (
        <button
          key={t}
          type="button"
          disabled={busy}
          data-daytype={t}
          aria-pressed={value === t}
          onClick={() => onPick(t)}
          className={'min-h-9 rounded-full border px-3 text-[12.5px] font-semibold transition-colors duration-150 disabled:opacity-60 '
            + (value === t
              ? 'border-transparent bg-brand-grad text-white'
              : 'border-border bg-muted text-foreground hover:bg-secondary')}
        >
          {dayLabel(t)}
        </button>
      ))}
    </div>
  );
}

function MonthGridView({
  grid, onPick, selected,
}: { grid: ReturnType<typeof monthGrid>; onPick: (c: DayCell) => void; selected: string }) {
  return (
    <div data-testid="att-grid" className="att-grid" role="grid" aria-label={'לוח ' + grid.label}>
      {HE_DAY_LETTERS.map((l, i) => (
        <div key={'h' + i} aria-hidden className="pb-1 text-center text-[11px] font-bold text-muted-foreground">{l}</div>
      ))}
      {grid.weeks.flat().map((c, i) =>
        c === null ? (
          <div key={'b' + i} aria-hidden />
        ) : (
          <button
            key={c.date}
            type="button"
            role="gridcell"
            data-date={c.date}
            data-state={c.state}
            data-eve={c.eve ? '1' : undefined}
            aria-current={c.today ? 'date' : undefined}
            aria-selected={selected === c.date}
            aria-label={dayChip(c.date) + (c.holiday ? ' · ' + c.holiday.name : '')}
            onClick={() => onPick(c)}
            className={'att-cell ' + (CELL_CLASS[c.state] || '') + (selected === c.date ? ' att-cell-sel' : '')}
          >
            <span className="text-[13px] font-bold tabular-nums">{c.day}</span>
            {c.holiday && (!c.holiday.required || c.eve) && (
              <span className="att-cell-tag">{c.onHoliday ? '🕎' : holidayShort(c.holiday)}</span>
            )}
            {!c.holiday && c.row?.kibbutz && <span className="att-cell-tag">{c.row.kibbutz}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/** The editor for one day — the body of the phone sheet AND of the desktop panel. */
function DayEditor({
  cell, busy, canEdit = true, onSave,
}: { cell: DayCell; busy: boolean; canEdit?: boolean; onSave: (type: DayType, note: string) => void }) {
  const fromVisit = cell.row?.source === 'visit';
  const [note, setNote] = React.useState(cell.row?.note || '');
  const [pending, setPending] = React.useState<DayType | null>(null);
  React.useEffect(() => { setNote(cell.row?.note || ''); setPending(null); }, [cell.date, cell.row?.note]);

  // ── ערב חג: the default files itself unless the person stops it (F-5) ────────────
  // A day people mostly spend at home should not cost a tap. Opening an empty ערב חג starts
  // a four-second countdown that saves 🏠 מהבית; touching ANYTHING — another type, the
  // ביטול button — cancels it, and שמירה just files it sooner.
  const eveCandidate = cell.eve && !cell.row && canEdit && !fromVisit;
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

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-extrabold"><bdi>{dayChip(cell.date)}</bdi></span>
        {cell.holiday && <span className="att-badge-holiday">🕎 {cell.holiday.name}</span>}
      </div>

      {/* A חג is an invitation, never a demand (spec §6: positive, no system-talk). */}
      {!!invite && <p data-testid="att-holiday-note" className="text-[12.5px] text-muted-foreground">{invite}</p>}

      {/* the ערב חג countdown, and the one tap that stops it */}
      {eveCandidate && !evePaused && !pending && (
        <div data-testid="att-eve-countdown" className="flex items-center gap-2 rounded-[12px] border border-border bg-muted px-3 py-2">
          <span className="text-[13px] font-bold tabular-nums">{eveCountdownText(secs)}</span>
          <button
            type="button"
            data-testid="att-eve-cancel"
            onClick={() => setEvePaused(true)}
            className="ms-auto min-h-8 rounded-full border border-border bg-background px-3 text-[12.5px] font-bold"
          >
            ביטול
          </button>
        </div>
      )}

      {fromVisit ? (
        <div className="rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[13px]">
          <div className="font-bold">{dayLabel('field')}</div>
          <div className="mt-0.5 text-muted-foreground">
            נרשם מסיכום הביקור{cell.row?.kibbutz ? ' · ' + cell.row.kibbutz : ''}
            {cell.row?.hours ? " · " + cell.row.hours + "ש'" : ''}
          </div>
        </div>
      ) : !canEdit ? (
        <div data-testid="att-readonly" className="rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[13px]">
          <div className="font-bold">{cell.row ? dayLabel(cell.row.type) : 'אין דיווח ליום הזה'}</div>
          <div className="mt-0.5 text-muted-foreground">צפייה בלבד. אפשר להזכיר לו למלא.</div>
        </div>
      ) : (
        <>
          <DayTypeRow value={current} onPick={t => { setEvePaused(true); setPending(t); }} busy={busy} />
          {needsNote && (
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="מה היה היום?"
              aria-label="פירוט היום"
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13.5px] outline-none focus:border-[color:var(--brand-1)]"
            />
          )}
          <button
            type="button"
            data-testid="att-save"
            disabled={busy || !current || (needsNote && !note.trim())}
            onClick={() => current && onSave(current, note)}
            className="min-h-11 w-full rounded-[12px] bg-brand-grad text-[14px] font-extrabold text-white disabled:opacity-50"
          >
            {busy ? 'שומר…' : cell.row ? 'עדכון היום' : 'שמירה'}
          </button>
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
  const visitsQ = useQuery({
    queryKey: ['attVisits', person, ym.y, ym.m],
    queryFn: () => readVisits(person, ym.y, ym.m)
      ?? ((qc.getQueryData(['attVisits', person, ym.y, ym.m]) as VisitLike[] | null | undefined) ?? null),
    enabled: !!person,
    refetchInterval: q => (q.state.data ? false : 1500),
  });
  const holidaysQ = useQuery({ queryKey: ['holidays'], queryFn: readHolidays, staleTime: 6 * 3600_000 });

  const refresh = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['attRows'] });
    // …and the visits with them: a summary saved (or its date corrected) is an attendance day.
    void qc.invalidateQueries({ queryKey: ['attVisits'] });
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

  // F-2: the month, with every saved summary folded in as an automatic יום שטח. The legacy
  // merge already does this; re-deriving it from the visits is what makes an EDITED visit
  // date move the day (the old date goes back to missing) instead of leaving a ghost row.
  const rows = React.useMemo(
    () => withVisitDays((rowsQ.data || []) as AttRow[], (visitsQ.data || []) as VisitLike[], person),
    [rowsQ.data, visitsQ.data, person]);
  const canEdit = canEditAttendance(me, person, flags);
  const holidays = (holidaysQ.data || []) as Holiday[];
  const grid = React.useMemo(() => monthGrid(ym.y, ym.m, rows, holidays, today), [ym, rows, holidays, today]);
  const missing = React.useMemo(() => missingDays(rows, holidays, today, ym.y, ym.m), [rows, holidays, today, ym]);
  const kpis = React.useMemo(() => computeKpis(rows, missing, holidays), [rows, missing, holidays]);
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
      {/* ── header: who, which month, and the two reports ───────────────────── */}
      <header className="mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-[17px] font-extrabold">
          <UserCheck className="h-[18px] w-[18px] text-[color:var(--brand-1)]" />
          נוכחות: <bdi>{person || me}</bdi>
        </h2>

        {canSwitch && people.length > 1 && (
          <div className="flex gap-1" role="group" aria-label="בחירת עובד">
            {people.map(p => (
              <button
                key={p}
                type="button"
                data-person={p}
                aria-pressed={p === person}
                onClick={() => { setPerson(p); track('attendance-person'); }}
                className={'min-h-8 rounded-full border px-2.5 text-[12px] font-bold '
                  + (p === person ? 'border-transparent bg-brand-grad text-white' : 'border-border bg-muted')}
              >
                <bdi>{p}</bdi>
              </button>
            ))}
          </div>
        )}

        <div className="ms-auto flex items-center gap-1">
          {/* RTL: the "previous month" control sits on the right, so it points right. */}
          <button type="button" aria-label="חודש קודם" onClick={() => shiftMonth(-1)} className="att-icon-btn">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span data-testid="att-month" className="min-w-[104px] text-center text-[13.5px] font-bold">{grid.label}</span>
          <button type="button" aria-label="חודש הבא" onClick={() => shiftMonth(1)} className="att-icon-btn">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {/* F-3: two bare icons said nothing. Icon AND label, both tappable at 360 px. */}
          <button
            type="button"
            data-testid="att-pdf"
            onClick={() => { track('attendance-pdf'); sigma.attExportPdf?.(); }}
            className="att-report-btn"
            aria-label="הורדת דוח נוכחות PDF"
          >
            <FileText className="h-4 w-4" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            data-testid="att-excel"
            onClick={() => { track('attendance-xlsx'); sigma.attExportExcel?.(); }}
            className="att-report-btn"
            aria-label="הורדת דוח נוכחות Excel"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Excel</span>
          </button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-3">
          {/* ── חסר לך — FIRST, before anything else (עידן 20.9 #2) ──────────────
              The screen used to open on the calendar and keep the gaps in a box underneath
              it, so the one question a person comes here with — "what do I still owe?" —
              was the last thing answered. It is now the first, and every chip is one tap
              into that day's sheet. */}
          <section data-testid="att-missing" className="rounded-[14px] border border-border bg-card p-3">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-[13px] font-bold">{missing.length ? 'חסר לך' : 'החודש מלא, יפה!'}</span>
              {missing.length > 0 && (
                <span
                  data-testid="att-missing-count"
                  className="rounded-full bg-[color:var(--sigma-warn)]/15 px-2 py-0.5 text-[12px] font-extrabold"
                >
                  <bdi>{missing.length}</bdi>
                </span>
              )}
            </div>
            {missing.length ? (<>
              <p className="mb-1.5 text-[12px] text-muted-foreground">אפשר ללחוץ על יום ולתעד אותו.</p>
              <div className="flex flex-wrap gap-1.5">
                {cellsOf(grid, 'missing').filter(c => c.date < todayKey).map(c => (
                  <button
                    key={c.date}
                    type="button"
                    data-missing={c.date}
                    onClick={() => openDay(c)}
                    aria-label={'תיעוד ' + dayChip(c.date)}
                    className="att-chip-missing"
                  >
                    <span aria-hidden className="att-chip-plus">＋</span>
                    <bdi>{dayChip(c.date)}</bdi>
                  </button>
                ))}
              </div>
            </>) : (
              <p className="text-[12.5px] text-muted-foreground">
                כל ימי העבודה בחודש מתועדים{kpis.onHoliday ? ` · 🕎 ${kpis.onHoliday} ימי עבודה בחג` : ''}
              </p>
            )}
          </section>

          {/* ── …and for עידן / עמיחי / צפייה, the same question for everyone ──── */}
          {canSwitch && teamMissing.length > 1 && (
            <section data-testid="att-missing-team" className="rounded-[14px] border border-border bg-card p-3">
              <div className="mb-1.5 text-[13px] font-bold">חסר לצוות</div>
              <div className="flex flex-wrap gap-1.5">
                {teamMissing.map(t => (
                  <button
                    key={t.person}
                    type="button"
                    data-person-missing={t.person}
                    data-count={t.known ? String(t.count) : ''}
                    aria-pressed={t.person === person}
                    onClick={() => { setPerson(t.person); track('attendance-person'); }}
                    className={'min-h-8 rounded-full border px-2.5 text-[12px] font-bold '
                      + (t.person === person ? 'border-transparent bg-brand-grad text-white' : 'border-border bg-muted')}
                  >
                    <bdi>{t.person}</bdi>
                    {' · '}
                    <bdi>{t.known ? t.count : '—'}</bdi>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── היום: the one thing this screen is for ───────────────────────── */}
          {todayCell && (
            <section data-testid="att-today" className="rounded-[14px] border border-border bg-card p-3">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-[14px] font-extrabold">היום</span>
                <span className="text-[12.5px] text-muted-foreground"><bdi>{dayChip(todayKey)}</bdi></span>
                {todayCell.row && <span className="ms-auto text-[12px] font-bold text-[color:var(--sigma-ink)]">✓ {dayLabel(todayCell.row.type)}</span>}
              </div>
              {todayCell.holiday && !todayCell.holiday.required && (
                <p className="mb-2 text-[12.5px] text-muted-foreground">{holidayNote(todayCell.holiday)}</p>
              )}
              {!canEdit ? (
                <p className="text-[13px] text-muted-foreground">
                  {todayCell.row ? 'דיווח: ' + dayLabel(todayCell.row.type) : 'עוד אין דיווח להיום.'} צפייה בלבד.
                </p>
              ) : todayCell.row?.source === 'visit' ? (
                <p className="text-[13px] text-muted-foreground">
                  נרשם מסיכום הביקור{todayCell.row.kibbutz ? ' · ' + todayCell.row.kibbutz : ''}
                </p>
              ) : (
                <DayTypeRow
                  value={(todayCell.row?.type as DayType) || null}
                  busy={save.isPending}
                  onPick={t => (t === 'other' ? openDay(todayCell) : save.mutate({ date: todayKey, type: t, note: '' }))}
                />
              )}
            </section>
          )}

          {/* ── three numbers, no scrolling ───────────────────────────────────── */}
          <section className="grid grid-cols-3 gap-2">
            <Kpi label="ימי שטח" value={kpis.field} tone="field" />
            <Kpi label="משרד ובית" value={kpis.office} tone="office" />
            <Kpi label="ימים חסרים" value={kpis.missing} tone="missing" />
          </section>

          {/* ── the month ─────────────────────────────────────────────────────── */}
          <section className="rounded-[14px] border border-border bg-card p-2.5">
            {rowsQ.data === null || rowsQ.isLoading
              ? <Skeleton className="h-[236px] w-full rounded-[10px]" />
              : <MonthGridView grid={grid} onPick={openDay} selected={selected} />}
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
          <SheetTitle className="sr-only">{openCell ? dayChip(openCell.date) : 'יום'}</SheetTitle>
          <SheetDescription className="sr-only">עריכת סוג היום.</SheetDescription>
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
