// ⏱ שעות עבודה מול לקוחות — #sigma-hours, the `hours` page (עידן 22.9, E2).
//
// Every `work_sessions` row in one table for עידן, עמיחי and מתניה (and the viewer, read-only):
// month / person / kibbutz filters, totals, an edit sheet and a manual-add sheet for עידן and
// עמיחי, and 📄 PDF / 📗 Excel of what is on screen. Every write is logged by the database
// (db/work_sessions_log.sql — a trigger, so nothing here can forget to log).
// Rules are pure in lib/hours.ts; this file is the shell.
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileDown, FileText, Loader2, Pencil, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { mount } from '@/islands';
import { SigmaProviders, hasPersistedData, showSkeleton } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { APP_PEOPLE } from '@/lib/people';
import { fmtDuration } from '@/lib/format';
import {
  canEditHours, canSeeHours, durationMin, filterHours, hoursBody, hoursPrintHtml, hoursXlsxSpec,
  monthsOf, peopleOf, toLocalInput, totals, validateHours, type HoursDraft, type WorkSessionRow,
} from '@/lib/hours';

const KEY = ['workSessions'] as const;

async function fetchSessions(): Promise<WorkSessionRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('work_sessions').select('*').order('started_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data || []) as WorkSessionRow[];
}

const box = 'w-full min-h-[44px] rounded-xl border border-border bg-muted px-3 text-base outline-none focus:border-[color:var(--brand-1)]';
const lbl = 'mb-1 mt-3 block text-xs font-bold text-muted-foreground';

/** Edit an existing row or add a manual one. `row = null` = add. */
function HoursSheet({ row, kibbutzim, onClose, onSaved }: {
  row: WorkSessionRow | null; kibbutzim: string[]; onClose: () => void; onSaved: () => void;
}) {
  const { name: me } = useCurrentUser();
  const now = new Date();
  const [d, setD] = React.useState<HoursDraft>(() => row ? {
    person: row.person, kibbutz: row.kibbutz || '', started_at: row.started_at, ended_at: row.ended_at || row.started_at,
    attendees: row.attendees || [], tags: row.tags || [], billable: !!row.billable, note: row.note || '',
  } : {
    person: me, kibbutz: '', started_at: new Date(now.getTime() - 3600_000).toISOString(), ended_at: now.toISOString(),
    attendees: [], tags: [], billable: false, note: '',
  });
  const [saving, setSaving] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const set = (patch: Partial<HoursDraft>) => setD(prev => ({ ...prev, ...patch }));
  const csv = (arr: string[]) => arr.join(', ');
  const uncsv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

  const save = async () => {
    const errs = validateHours(d);
    if (errs.length) { toast.error(errs[0]); return; }
    setSaving(true);
    try {
      const body = hoursBody(d);
      await sbWrite(sb => (row
        ? sb.from('work_sessions').update(body).eq('id', row.id).select('id').single()
        : sb.from('work_sessions').insert(body).select('id').single()) as any);
      track(row ? 'hours-edit' : 'hours-add', d.kibbutz || null);
      toast.success(row ? 'השורה עודכנה' : 'השעות נוספו');
      onSaved(); onClose();
    } catch (e: any) {
      toast.error(e?.message || 'השמירה נכשלה');
    } finally { setSaving(false); }
  };
  const del = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await sbWrite(sb => sb.from('work_sessions').delete().eq('id', row.id).select('id') as any);
      track('hours-delete', row.kibbutz || null);
      toast.success('השורה נמחקה'); onSaved(); onClose();
    } catch (e: any) { toast.error(e?.message || 'המחיקה נכשלה'); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" data-testid="hours-sheet" className="max-h-[90svh] overflow-y-auto p-4 pb-7">
        <SheetHeader className="text-start">
          <SheetTitle className="text-[18px] font-extrabold">{row ? 'עריכת שעות' : 'הוספת שעות ידנית'}</SheetTitle>
          <SheetDescription>כל שינוי נרשם ביומן השינויים</SheetDescription>
        </SheetHeader>
        <label className={lbl} htmlFor="hPerson">עובד</label>
        <select id="hPerson" className={box} value={d.person} onChange={e => set({ person: e.target.value })}>
          {APP_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className={lbl} htmlFor="hKib">קיבוץ</label>
        <input id="hKib" className={box} list="hKibList" value={d.kibbutz} onChange={e => set({ kibbutz: e.target.value })} autoComplete="off" />
        <datalist id="hKibList">{kibbutzim.map(k => <option key={k} value={k} />)}</datalist>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl} htmlFor="hStart">התחלה</label>
            <input id="hStart" type="datetime-local" className={box} value={toLocalInput(d.started_at)}
                   onChange={e => { const t = Date.parse(e.target.value); if (Number.isFinite(t)) set({ started_at: new Date(t).toISOString() }); }} />
          </div>
          <div>
            <label className={lbl} htmlFor="hEnd">סיום</label>
            <input id="hEnd" type="datetime-local" className={box} value={toLocalInput(d.ended_at)}
                   onChange={e => { const t = Date.parse(e.target.value); if (Number.isFinite(t)) set({ ended_at: new Date(t).toISOString() }); }} />
          </div>
        </div>
        <label className={lbl} htmlFor="hTags">תגיות <span className="font-medium">· מופרדות בפסיק</span></label>
        <input id="hTags" className={box} defaultValue={csv(d.tags)} onBlur={e => set({ tags: uncsv(e.target.value) })} />
        <label className={lbl} htmlFor="hPeople">משתתפים <span className="font-medium">· מופרדים בפסיק</span></label>
        <input id="hPeople" className={box} defaultValue={csv(d.attendees)} onBlur={e => set({ attendees: uncsv(e.target.value) })} />
        <label className={lbl} htmlFor="hNote">הערה</label>
        <input id="hNote" className={box} value={d.note} onChange={e => set({ note: e.target.value })} />
        <label className="mt-3 flex items-center gap-2 text-[14px] font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={d.billable} onChange={e => set({ billable: e.target.checked })} /> לחיוב
        </label>
        <div className="mt-4 flex gap-2">
          <button type="button" data-testid="hours-save" disabled={saving} onClick={() => void save()}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl s-brand text-[15px] font-bold disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} שמור
          </button>
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-2xl border border-border px-4 text-[15px] font-semibold">ביטול</button>
        </div>
        {row && (confirmDel ? (
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={saving} onClick={() => void del()} className="min-h-[44px] flex-1 rounded-xl bg-destructive text-[14px] font-bold text-destructive-foreground">כן, למחוק</button>
            <button type="button" onClick={() => setConfirmDel(false)} className="min-h-[44px] flex-1 rounded-xl border border-border text-[14px] font-semibold">ביטול</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDel(true)} className="mt-2 min-h-[44px] w-full rounded-xl border border-border text-[14px] font-semibold text-destructive">מחק שורה</button>
        ))}
      </SheetContent>
    </Sheet>
  );
}

function HoursPage() {
  const { name: user, isViewer } = useCurrentUser();
  const qc = useQueryClient();
  const allowed = canSeeHours(user, isViewer);
  const editor = canEditHours(user, isViewer);
  const q = useQuery({ queryKey: KEY, queryFn: fetchSessions, enabled: allowed });
  const rows = React.useMemo(() => q.data || [], [q.data]);
  const [month, setMonth] = React.useState<string>('');
  const [person, setPerson] = React.useState<string>('');
  const [kib, setKib] = React.useState<string>('');
  const [editing, setEditing] = React.useState<WorkSessionRow | null | 'new'>(null);

  useSigmaEvent('work-session-saved', () => { void qc.invalidateQueries({ queryKey: KEY }); });

  const months = React.useMemo(() => monthsOf(rows), [rows]);
  React.useEffect(() => { if (!month && months.length) setMonth(months[0]); }, [months, month]);
  const shown = React.useMemo(() => filterHours(rows, { month: month || undefined, person: person || undefined, kibbutz: kib || undefined }), [rows, month, person, kib]);
  const t = React.useMemo(() => totals(shown), [shown]);
  const kibbutzim = React.useMemo(() => Array.from(new Set(rows.map(r => r.kibbutz || '').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he')), [rows]);
  const title = 'שעות מול לקוחות' + (month ? ' · ' + month : '') + (person ? ' · ' + person : '');

  const exportXlsx = () => {
    const fn = (window as any).xlDownload;
    if (typeof fn !== 'function') { toast.error('ייצוא אקסל לא זמין כאן'); return; }
    track('hours-export', 'xlsx');
    void fn(hoursXlsxSpec(shown, title), title.replace(/[^\p{L}\p{N}]+/gu, '_') + '.xlsx');
  };
  const exportPdf = () => {
    track('hours-export', 'pdf');
    const w = window.open('', '_blank');
    if (!w) { toast.error('הדפדפן חסם את החלון'); return; }
    w.document.open(); w.document.write(hoursPrintHtml(shown, title)); w.document.close();
  };

  if (!allowed) return <p className="p-4 text-[14px] text-muted-foreground">העמוד הזה לא זמין למשתמש הזה.</p>;
  if (q.isLoading && showSkeleton(rows.length > 0, hasPersistedData(KEY))) {
    return <div className="space-y-2 p-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="pb-4" data-testid="hours-page">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select aria-label="חודש" className="min-h-[40px] rounded-xl border border-border bg-card px-2 text-[14px]" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">כל החודשים</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="עובד" className="min-h-[40px] rounded-xl border border-border bg-card px-2 text-[14px]" value={person} onChange={e => setPerson(e.target.value)}>
          <option value="">כל העובדים</option>
          {peopleOf(rows).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select aria-label="קיבוץ" className="min-h-[40px] rounded-xl border border-border bg-card px-2 text-[14px]" value={kib} onChange={e => setKib(e.target.value)}>
          <option value="">כל הקיבוצים</option>
          {kibbutzim.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <span className="ms-auto flex gap-1.5">
          <button type="button" onClick={exportPdf} className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-border bg-card px-2.5 text-[13px] font-semibold"><FileText className="h-4 w-4" /> PDF</button>
          <button type="button" onClick={exportXlsx} className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-border bg-card px-2.5 text-[13px] font-semibold"><FileDown className="h-4 w-4" /> Excel</button>
          {editor && (
            <button type="button" data-testid="hours-add" onClick={() => setEditing('new')} className="inline-flex min-h-[40px] items-center gap-1 rounded-xl s-brand px-2.5 text-[13px] font-bold"><Plus className="h-4 w-4" /> הוספה ידנית</button>
          )}
        </span>
      </div>

      <div className="mb-2 text-[13px] text-muted-foreground" data-testid="hours-total">
        {shown.length} רשומות · סה"כ <b className="text-foreground">{fmtDuration(t.all)}</b> שעות
        {Object.keys(t.byPerson).length > 1 && ' · ' + Object.entries(t.byPerson).map(([p, m]) => p + ' ' + fmtDuration(m)).join(' · ')}
      </div>

      {q.isError && <p className="rounded-xl border border-border bg-muted p-3 text-[13px] text-muted-foreground">לא ניתן לטעון את השעות. בדוק חיבור.</p>}
      {!shown.length && !q.isError && <p className="p-6 text-center text-[13px] text-muted-foreground">אין רשומות בסינון הזה</p>}

      {!!shown.length && (
        <div className="scroll-x rounded-[14px] border border-border bg-card">
          <table className="w-full text-[13px]" data-testid="hours-table">
            <thead className="text-[12px] text-muted-foreground">
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-start [&>th]:font-bold">
                <th>תאריך</th><th>עובד</th><th>קיבוץ</th><th>שעות</th><th>משך</th><th>תגיות</th><th>משתתפים</th><th>לחיוב</th><th>הערה</th><th>Clockify</th>{editor && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const clock = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
                return (
                  <tr key={r.id} data-testid="hours-row" className="border-t border-border [&>td]:px-2 [&>td]:py-2 [&>td]:align-top">
                    <td className="whitespace-nowrap"><bdi>{new Date(r.started_at).toLocaleDateString('he-IL')}</bdi></td>
                    <td>{r.person}</td>
                    <td>{r.kibbutz || '—'}</td>
                    <td className="whitespace-nowrap tabular-nums"><bdi>{clock(r.started_at)}–{clock(r.ended_at)}</bdi></td>
                    <td className="tabular-nums">{fmtDuration(durationMin(r))}</td>
                    <td>{(r.tags || []).join(', ')}</td>
                    <td>{(r.attendees || []).join(', ')}</td>
                    <td>{r.billable ? '✓' : ''}</td>
                    <td className="max-w-[220px]">{r.note || ''}</td>
                    <td className={r.clockify_id ? 'text-muted-foreground' : 'font-semibold text-[color:var(--sigma-warn-ink)]'}>{r.clockify_id ? 'נשלח' : 'לא נשלח'}</td>
                    {editor && (
                      <td>
                        <button type="button" aria-label="ערוך" onClick={() => setEditing(r)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && editor && (
        <HoursSheet row={editing === 'new' ? null : editing} kibbutzim={kibbutzim} onClose={() => setEditing(null)}
                    onSaved={() => { void qc.invalidateQueries({ queryKey: KEY }); try { sigma.track?.('hours-changed', null); } catch { /* */ } }} />
      )}
    </div>
  );
}

export function Hours() {
  return (
    <SigmaProviders>
      <HoursPage />
    </SigmaProviders>
  );
}

export function mountHours(): boolean {
  return mount('sigma-hours', Hours);
}
