// 📥 משיכת קריאות מתוכנות חיצונית — the readings-pull page (עידן · עמיחי · מתניה).
// Spec: docs/superpowers/specs/2026-09-29-readings-pull-design.md. The page only STARTS a run and
// reads the result: the server carries the run (readings-fetch), so nothing here has to stay on
// screen — app/src/lib/readingsWatch.ts polls from any screen and toasts when the files are ready.
//   1. הריצה האחרונה  — counts, EMS-check state, reasons BEFORE any download, the two downloads,
//                       the red partial strip + retry, the "הועלה ל-EMS" mark.
//   2. הרצה ידנית     — a date (max = yesterday, no min) and a progress line while it runs.
//   3. היסטוריית משיכות — 35 days, one row per day; a day nobody pulled says so, with [משוך].
import * as React from 'react';
import { ArrowDownToLine, FileDown, Loader2, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { Tag } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { BubbleButton } from '@/components/ui/bubble-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { EmsGate } from '@/components/EmsGate';
import { useCurrentUser } from '@/bridge';
import { canUseReadings } from '@/lib/readingsRoster';
import {
  HISTORY_DAYS, addDays, dmHmIL, dmIL, failedSources, historyRows, latestCronPerSite, latestRun, metersForReason,
  progressText, reasonGroups, yesterdayIL, type HistoryRow, type ReadingRun, type ReasonGroup,
} from '@/lib/readingsLogic';
import {
  emsCheck, emsToken, fetchRuns, fetchSites, fetchSources, markSeen, markUploaded, openDownload, retrySource,
  signFile, startRun, type ReadingSite,
} from '@/lib/readingsApi';
import { FOCUS_KEY, trackRun } from '@/lib/readingsWatch';

const TITLE = 'משיכת קריאות מתוכנות חיצונית';
const runsKey = (siteId: string) => ['readings', 'runs', siteId] as const;

const errText = (e: unknown): string => (e as any)?.message || 'הפעולה נכשלה. נסה שוב';
const who = (name: string | null | undefined) => name || '—';

function useFocusRun(siteId: string) {
  const [focus, setFocus] = React.useState<string | null>(() => {
    try { return sessionStorage.getItem(FOCUS_KEY); } catch { return null; }
  });
  React.useEffect(() => {
    const on = (e: Event) => setFocus((e as CustomEvent<string | null>).detail ?? null);
    window.addEventListener('readings-focus', on);
    return () => window.removeEventListener('readings-focus', on);
  }, []);
  React.useEffect(() => { setFocus(null); }, [siteId]);
  const pick = (id: string | null) => {
    setFocus(id);
    try { if (id) sessionStorage.setItem(FOCUS_KEY, id); else sessionStorage.removeItem(FOCUS_KEY); } catch { /* ignore */ }
  };
  return [focus, pick] as const;
}

function StatusTag({ run }: { run: ReadingRun }) {
  if (run.status === 'ok') return <Tag role="ok">הצליח</Tag>;
  if (run.status === 'partial') return <Tag role="danger">חלקי</Tag>;
  if (run.status === 'failed') return <Tag role="danger">נכשל</Tag>;
  return <Tag role="info">רץ עכשיו</Tag>;
}

function Counts({ run }: { run: ReadingRun }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Tag role="ok"><bdi>✅ {run.n_ok ?? 0}</bdi></Tag>
      <Tag role="danger"><bdi>⛔ {run.n_blocked ?? 0}</bdi></Tag>
      <Tag role="warn"><bdi>⚠ {run.n_warn ?? 0}</bdi></Tag>
    </span>
  );
}

// ── a download: sign → a plain <a href download> click ───────────────────────
function useDownload() {
  const [busy, setBusy] = React.useState<string | null>(null);
  const go = async (run: ReadingRun, kind: 'readings' | 'exceptions') => {
    setBusy(run.id + kind);
    try { const { url } = await signFile(run.id, kind); openDownload(url); }
    catch (e) { toast.error(errText(e)); }
    finally { setBusy(null); }
  };
  return { busy, go };
}

// ── 1. the run panel ─────────────────────────────────────────────────────────
function RunPanel({ run, site, sourceIds, onChanged, onLatest, isFocus }: {
  run: ReadingRun; site: ReadingSite; sourceIds: Record<string, string>;
  onChanged: () => void; onLatest: () => void; isFocus: boolean;
}) {
  const dl = useDownload();
  const [checking, setChecking] = React.useState(false);
  const [retrying, setRetrying] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState<ReasonGroup | null>(null);
  const failed = failedSources(run);
  const groups = reasonGroups(run);
  const token = emsToken();

  const check = async () => {
    setChecking(true);
    try { await emsCheck(run.id); toast.success('הבדיקה מול EMS הסתיימה'); }
    catch (e) { toast.error(errText(e)); }
    finally { setChecking(false); onChanged(); }
  };
  const retry = async (name: string) => {
    const id = sourceIds[name];
    if (!id) { toast.error('המקור לא נמצא'); return; }
    setRetrying(name);
    try { await retrySource(run.id, id); trackRun({ id: run.id, kibbutz: site.kibbutz, manual: false }); }
    catch (e) { toast.error(errText(e)); }
    finally { setRetrying(null); onChanged(); }
  };
  // optimistic: the box flips at once, the server's answer (refetch) is the truth afterwards
  const [opt, setOpt] = React.useState<boolean | null>(null);
  React.useEffect(() => { setOpt(null); }, [run.id, run.uploaded]);
  const setUploaded = async (v: boolean) => {
    setOpt(v);
    try { await markUploaded(run.id, v); } catch (e) { setOpt(null); toast.error(errText(e)); }
    onChanged();
  };

  return (
    <div className="flex flex-col gap-3 px-4" data-testid="readings-latest">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[length:var(--fs-body)] font-bold"><bdi>{dmIL(run.reading_date)}</bdi></span>
        <Tag role="neutral">{run.trigger === 'cron' ? 'אוטומטית' : 'ידנית'}</Tag>
        <span className="text-[length:var(--fs-body-sm)] text-muted-foreground"><bdi>{dmHmIL(run.started_at)}</bdi></span>
        {run.ems_checked
          ? <Tag role="ok">✓ EMS</Tag>
          : <Tag role="warn">לא נבדק מול EMS</Tag>}
      </div>
      <Counts run={run} />

      {failed.map(f => (
        <div key={f.name} role="alert" data-testid="readings-partial"
          className="flex flex-col gap-2 rounded-[var(--r-md)] bg-[var(--danger-fill)] p-3 text-[length:var(--fs-body-sm)] text-[var(--danger-ink)]">
          <span><b>{f.name}</b> לא זמין ({f.message}). המונים שלו לא נכנסו לקובץ.</span>
          <BubbleButton variant="danger" size="sm" className="self-start" disabled={retrying === f.name}
            onClick={() => void retry(f.name)}>
            {retrying === f.name ? 'מנסה שוב…' : 'נסה שוב רק את המקור הזה'}
          </BubbleButton>
        </div>
      ))}

      {!run.ems_checked && (
        <div className="flex flex-col gap-1">
          <BubbleButton variant="primary" size="lg" data-testid="readings-ems-check" disabled={checking || !token}
            icon={checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : undefined}
            onClick={() => void check()}>
            {checking ? 'בודק מול EMS…' : 'בדוק מול EMS לפני הורדה'}
          </BubbleButton>
          {!token && <span className="text-[length:var(--fs-body-sm)] text-muted-foreground">צריך להתחבר ל-EMS כדי לבדוק.</span>}
        </div>
      )}
      {run.ems_checked && (
        <span className="text-[length:var(--fs-body-sm)] text-muted-foreground">
          נבדק מול EMS ע״י {who(run.ems_checked_by)} · <bdi>{dmHmIL(run.ems_checked_at)}</bdi>
        </span>
      )}

      {/* the reasons, BEFORE any download */}
      <div className="flex flex-col gap-1">
        <span className="text-[length:var(--fs-body-sm)] font-bold">סיכום סיבות</span>
        {groups.length === 0 ? (
          <span className="text-[length:var(--fs-body-sm)] text-muted-foreground">אין חריגות.</span>
        ) : (
          <div className="divide-y divide-border rounded-[var(--r-md)] border border-border">
            {groups.map(g => (
              <button key={g.kind + g.reason} type="button" data-testid="readings-reason" onClick={() => setReason(g)}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-start active:bg-secondary">
                <Tag role={g.kind === 'חוסם' ? 'danger' : 'warn'}>{g.kind}</Tag>
                <span className="min-w-0 flex-1 text-[length:var(--fs-body-sm)]">{g.reason}</span>
                <b><bdi>{g.count}</bdi></b>
              </button>
            ))}
          </div>
        )}
        <span className="text-[length:var(--fs-body-sm)] text-muted-foreground">מספרי המונים לפי האתר.</span>
      </div>

      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        <BubbleButton variant="tonal" data-testid="readings-download-readings" disabled={!run.readings_file || dl.busy === run.id + 'readings'}
          icon={<FileDown className="h-4 w-4" aria-hidden />} onClick={() => void dl.go(run, 'readings')}>
          קובץ קריאות ל-EMS
        </BubbleButton>
        <BubbleButton variant="tonal" data-testid="readings-download-exceptions" disabled={!run.exceptions_file || dl.busy === run.id + 'exceptions'}
          icon={<FileDown className="h-4 w-4" aria-hidden />} onClick={() => void dl.go(run, 'exceptions')}>
          קובץ חריגות
        </BubbleButton>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-[length:var(--fs-body)]">
        <input type="checkbox" data-testid="readings-uploaded" className="h-5 w-5 accent-[var(--sigma-ink)]"
          checked={opt ?? !!run.uploaded} onChange={e => void setUploaded(e.target.checked)} />
        <span className="min-w-0">
          <span className="font-semibold">הועלה ל-EMS ✓</span>
          {run.uploaded && (
            <span className="block text-[length:var(--fs-body-sm)] text-muted-foreground">
              {who(run.uploaded_by)} · <bdi>{dmHmIL(run.uploaded_at)}</bdi>{run.uploaded_source === 'auto' ? ' · סימון אוטומטי' : ''}
            </span>
          )}
        </span>
      </label>

      {isFocus && (
        <button type="button" onClick={onLatest} className="self-start text-[length:var(--fs-body-sm)] font-semibold text-[var(--sigma-ink)]">
          חזרה לריצה האחרונה
        </button>
      )}

      <Sheet open={!!reason} onOpenChange={o => { if (!o) setReason(null); }}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[80svh] overflow-y-auto">
          <SheetHeader><SheetTitle>{reason ? `${reason.kind}: ${reason.reason}` : ''}</SheetTitle></SheetHeader>
          <ul className="flex flex-col divide-y divide-border py-2" data-testid="readings-reason-meters">
            {reason && metersForReason(run.exceptions, reason).map((r, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2 text-[length:var(--fs-body-sm)]">
                <span><b><bdi>{String(r[1] ?? '')}</bdi></b>{r[2] && r[2] !== r[1] ? <> · בקובץ <bdi>{String(r[2])}</bdi></> : null}</span>
                <span className="text-muted-foreground">{String(r[0] ?? '')} · <bdi>{String(r[3] ?? '')}</bdi>{r[4] != null && r[4] !== '' ? <> · סה״כ <bdi>{String(r[4])}</bdi></> : null}</span>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── 2. manual run ────────────────────────────────────────────────────────────
function ManualRun({ site, runs, onStarted }: { site: ReadingSite; runs: ReadingRun[]; onStarted: () => void }) {
  const max = yesterdayIL();
  const [date, setDate] = React.useState(max);
  const [starting, setStarting] = React.useState(false);
  const running = runs.find(r => r.status === 'running');
  const src = running?.progress || {};
  const names = Object.keys(src);
  const done = names.filter(n => src[n].state === 'ok' || src[n].state === 'failed').length;
  const pct = names.length ? Math.round((done / names.length) * 90) + 5 : 5;

  const go = async () => {
    if (!date || date > max) return;
    setStarting(true);
    try {
      const { run_id } = await startRun(site.kibbutz, date);
      trackRun({ id: run_id, kibbutz: site.kibbutz, manual: true });
      onStarted();
    } catch (e) { toast.error(errText(e)); }
    finally { setStarting(false); }
  };

  return (
    <div className="flex flex-col gap-3 px-4" data-testid="readings-manual">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[length:var(--fs-body-sm)] font-semibold">
          תאריך הקריאות
          <input type="date" data-testid="readings-date" value={date} max={max}
            onChange={e => setDate(e.target.value)}
            className="h-11 w-full min-w-0 rounded-[var(--r-md)] border border-input bg-background px-3 text-[length:var(--fs-body)]" />
        </label>
        <BubbleButton variant="primary" data-testid="readings-run" disabled={starting || !!running || !date || date > max}
          icon={starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowDownToLine className="h-4 w-4" aria-hidden />}
          onClick={() => void go()}>
          משוך עכשיו
        </BubbleButton>
      </div>
      {running && (
        <div className="flex flex-col gap-2" data-testid="readings-progress" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div className="h-full rounded-full bg-[var(--sigma-ink)] transition-[width] duration-500" style={{ width: pct + '%' }} />
          </div>
          <span className="text-[length:var(--fs-body-sm)] font-semibold">
            משיכת <bdi>{dmIL(running.reading_date)}</bdi>: {progressText(running.progress)}
          </span>
          <span className="text-[length:var(--fs-body-sm)] text-muted-foreground">אפשר לעבור למסכים אחרים — נודיע לך כשהקבצים מוכנים.</span>
        </div>
      )}
    </div>
  );
}

// ── 3. history ───────────────────────────────────────────────────────────────
function HistoryItem({ row, onOpen, onPull, onDownload, busy, pulling }: {
  row: HistoryRow; onOpen: (id: string) => void; onPull: (date: string) => void;
  onDownload: (run: ReadingRun, kind: 'readings' | 'exceptions') => void; busy: string | null; pulling: boolean;
}) {
  if (row.kind === 'gap') {
    return (
      <div data-testid="readings-history-row" data-gap className="flex min-h-14 items-center gap-2 px-4 py-2">
        <span className="font-semibold text-muted-foreground"><bdi>{dmIL(row.date)}</bdi></span>
        <span className="min-w-0 flex-1 text-[length:var(--fs-body-sm)] text-muted-foreground">לא נמשך</span>
        <BubbleButton variant="tonal" size="sm" disabled={pulling} onClick={() => onPull(row.date)}>משוך</BubbleButton>
      </div>
    );
  }
  const { run } = row;
  const done = run.status === 'ok' || run.status === 'partial';
  return (
    <div data-testid="readings-history-row" data-needs-upload={row.needsUpload || undefined}
      className={'flex flex-col gap-1.5 px-4 py-2.5 ' + (row.needsUpload ? 'border-s-4 border-[var(--warn-ink)]' : '')}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onOpen(run.id)} className="flex min-w-0 flex-1 flex-col text-start">
          <span className="text-[length:var(--fs-body)] font-semibold">
            <bdi>{dmIL(run.reading_date)}</bdi> · {run.trigger === 'cron' ? 'אוטומטית' : 'ידנית'}
          </span>
          <span className="truncate text-[length:var(--fs-body-sm)] text-muted-foreground">
            בוצע <bdi>{dmHmIL(run.started_at)}</bdi> · ע״י {run.trigger === 'cron' ? 'המערכת' : who(run.started_by)}
          </span>
        </button>
        {done && (
          <span className="flex shrink-0 gap-1.5">
            <BubbleButton variant="icon" size="sm" aria-label="הורד קובץ קריאות" disabled={!run.readings_file || busy === run.id + 'readings'}
              onClick={() => onDownload(run, 'readings')}><ArrowDownToLine className="h-4 w-4" /></BubbleButton>
            <BubbleButton variant="icon" size="sm" aria-label="הורד קובץ חריגות" disabled={!run.exceptions_file || busy === run.id + 'exceptions'}
              onClick={() => onDownload(run, 'exceptions')}><FileDown className="h-4 w-4" /></BubbleButton>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusTag run={run} />
        {done && <Counts run={run} />}
        {done && run.ems_checked && <Tag role="ok">✓ EMS</Tag>}
        {done && (run.uploaded ? <Tag role="ok">הועלה</Tag> : <Tag role="warn">לא הועלה</Tag>)}
      </div>
      {run.status === 'failed' && run.error && (
        <span className="text-[length:var(--fs-body-sm)] text-[var(--danger-ink)]">{run.error}</span>
      )}
    </div>
  );
}

// ── the page ─────────────────────────────────────────────────────────────────
function ReadingsInner() {
  const { name: user, isViewer } = useCurrentUser();
  const allowed = canUseReadings(user) && !isViewer;
  const qc = useQueryClient();
  const sitesQ = useQuery({ queryKey: ['readings', 'sites'], queryFn: fetchSites, enabled: allowed });
  const sites = sitesQ.data || [];
  const [siteId, setSiteId] = React.useState('');
  const site = sites.find(s => s.id === siteId) ?? sites[0];
  const sid = site?.id || '';
  const since = addDays(yesterdayIL(), -(HISTORY_DAYS - 1));

  const runsQ = useQuery({
    queryKey: runsKey(sid),
    queryFn: () => fetchRuns(sid, since),
    enabled: allowed && !!sid,
    refetchInterval: q => ((q.state.data as ReadingRun[] | undefined) || []).some(r => r.status === 'running') ? 5000 : false,
  });
  const runs = runsQ.data || [];
  const srcQ = useQuery({ queryKey: ['readings', 'sources', sid], queryFn: () => fetchSources(sid), enabled: allowed && !!sid });
  const sourceIds = React.useMemo(() => Object.fromEntries((srcQ.data || []).map(s => [s.name, s.id])), [srcQ.data]);

  const [focusId, setFocusId] = useFocusRun(sid);
  const shown = (focusId && runs.find(r => r.id === focusId)) || latestRun(runs);
  const refresh = React.useCallback(() => { void qc.invalidateQueries({ queryKey: ['readings', 'runs'] }); }, [qc]);
  const dl = useDownload();

  // a run finished elsewhere (the watcher) → this page shows it without a manual refresh
  React.useEffect(() => {
    window.addEventListener('readings-run-finished', refresh);
    return () => window.removeEventListener('readings-run-finished', refresh);
  }, [refresh]);

  // Viewing the page IS viewing the latest cron run: mark it seen once (clears the ⋯ badge).
  const seenRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    const c = latestCronPerSite(runs)[0];
    if (!c || (c.seen_by || []).includes(user) || seenRef.current.has(c.id)) return;
    seenRef.current.add(c.id);
    void markSeen(c.id).then(() => { refresh(); window.dispatchEvent(new Event('readings-badge-refresh')); }).catch(() => {});
  }, [runs, user, refresh]);

  const pull = async (date: string) => {
    if (!site) return;
    try {
      const { run_id } = await startRun(site.kibbutz, date);
      trackRun({ id: run_id, kibbutz: site.kibbutz, manual: true });
      refresh();
    } catch (e) { toast.error(errText(e)); }
  };

  if (!allowed) return null;

  const back = () => (window as any).pageBack?.();
  if (sitesQ.isLoading || (sid && runsQ.isLoading && !runs.length)) {
    return (
      <div className="flex flex-col gap-3 p-2">
        <PageActionRow title={TITLE} onBack={back} />
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }
  if (sitesQ.isError || runsQ.isError) {
    return (
      <div className="p-2">
        <PageActionRow title={TITLE} onBack={back} />
        <EmptyState icon={<FileDown />} title="לא הצלחנו לטעון את המשיכות."
          action={{ label: 'ניסיון נוסף', onClick: () => { void sitesQ.refetch(); void runsQ.refetch(); } }} />
      </div>
    );
  }
  if (!site) {
    return (
      <div className="p-2">
        <PageActionRow title={TITLE} onBack={back} />
        <EmptyState icon={<FileDown />} title="אין קיבוץ פעיל למשיכה." />
      </div>
    );
  }

  const rows = historyRows(runs);
  const pulling = runs.some(r => r.status === 'running');

  return (
    <div className="flex flex-col gap-3 p-2 pb-24" data-testid="readings-page">
      <PageActionRow title={TITLE} titleLines={2} onBack={back}
        actions={
          <BubbleButton variant="icon" size="sm" aria-label="רענון" onClick={refresh} disabled={runsQ.isFetching}>
            <RefreshCw className={runsQ.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </BubbleButton>
        } />

      <div className="px-1">
        <Select value={site.id} onValueChange={setSiteId}>
          <SelectTrigger aria-label="קיבוץ" data-testid="readings-site"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.kibbutz}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <SectionBlock title={focusId && shown && shown.id === focusId ? 'ריצה שנבחרה' : 'הריצה האחרונה'}>
        {shown
          ? <RunPanel run={shown} site={site} sourceIds={sourceIds} onChanged={refresh}
              isFocus={!!focusId && shown.id === focusId} onLatest={() => setFocusId(null)} />
          : <EmptyState icon={<FileDown />} title="עוד אין משיכה מוצלחת." hint="אפשר למשוך יום ידנית למטה." />}
      </SectionBlock>

      <SectionBlock title="הרצה ידנית">
        <ManualRun site={site} runs={runs} onStarted={refresh} />
      </SectionBlock>

      <SectionBlock title="היסטוריית משיכות" count={rows.filter(r => r.kind === 'run').length}>
        <div className="divide-y divide-border" data-testid="readings-history">
          {rows.map(r => (
            <HistoryItem key={r.date} row={r} pulling={pulling}
              onOpen={id => { setFocusId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onPull={d => void pull(d)} onDownload={(run, k) => void dl.go(run, k)} busy={dl.busy} />
          ))}
        </div>
      </SectionBlock>
    </div>
  );
}

export function ReadingsPull() {
  return (
    <SigmaProviders>
      <EmsGate>
        <ReadingsInner />
      </EmsGate>
    </SigmaProviders>
  );
}

export function mountReadingsPull(): boolean {
  return mount('sigma-readings', ReadingsPull);
}
