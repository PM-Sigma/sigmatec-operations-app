// ⏱ שעות עבודה מול לקוחות — #sigma-hours, the `hours` page (עידן 22.9, E2; round 5 R-U1).
//
// Every `work_sessions` row in one table for עידן, עמיחי and מתניה (and the viewer, read-only):
// month / person / kibbutz filters, totals, an edit sheet and a manual-add sheet for עידן and
// עמיחי, and PDF / Excel exports of what is on screen. Every write is logged by the database
// (db/work_sessions_log.sql — a trigger, so nothing here can forget to log).
// Rules are pure in lib/hours.ts; this file is the shell, now on the design system: the title
// and actions live in a PageActionRow (registered via registerPageAction so any future page
// shell can offer them too), the three native selects became FilterChips that open a small
// picker Sheet, and the table below 768px is SectionBlock/ListRow instead of a scrolling table.
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, FileDown, FileSpreadsheet, FileText, Loader2, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { SectionError } from '@/components/ui/section-error';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { FilterChip, Tag } from '@/components/ui/chip';
import { BubbleButton } from '@/components/ui/bubble-button';
import { StatTile, StatTileGrid } from '@/components/ui/stat-tile';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { mount } from '@/islands';
import { SigmaProviders, hasPersistedData, showSkeleton } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { registerPageAction } from '@/lib/pageActions';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { APP_PEOPLE } from '@/lib/people';
import { fmtDuration } from '@/lib/format';
import {
  canEditHours, canSeeHours, durationMin, filterHours, hoursByDay, hoursPrintHtml, hoursTiles,
  hoursXlsxSpec, monthsOf, peopleOf, toLocalInput, validateHours,
  type HoursDraft, type WorkSessionRow,
} from '@/lib/hours';
import { toastFailure } from '@/lib/pending';

const KEY = ['workSessions'] as const;

async function fetchSessions(): Promise<WorkSessionRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('work_sessions').select('*').order('started_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data || []) as WorkSessionRow[];
}

const box = 'w-full min-h-[44px] rounded-xl border border-border bg-muted px-3 text-base outline-none focus:border-[color:var(--brand-1)]';
const lbl = 'mb-1 mt-3 block text-xs font-bold text-muted-foreground';

/** A one-value picker: a FilterChip that opens a small bottom Sheet of ListRow options, the
    selected one carrying a ✓ (round 5 U1: "each opening a small Sheet … a selected chip gets
    the ink fill + ✓", one-hand reach — DS §4 Missing 4). */
function PickerChip({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const chipLabel = value ? label + ': ' + value : label;
  return (
    <>
      <FilterChip selected={!!value} onClick={() => setOpen(true)}>{chipLabel}</FilterChip>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[70svh] overflow-y-auto">
          <SheetHeader className="text-start"><SheetTitle>{label}</SheetTitle></SheetHeader>
          <ListRow
            title="הכול"
            trailing={!value ? <span aria-hidden>✓</span> : null}
            onClick={() => { onChange(''); setOpen(false); }}
          />
          {options.map(o => (
            <ListRow
              key={o}
              title={<bdi>{o}</bdi>}
              trailing={value === o ? <span aria-hidden>✓</span> : null}
              onClick={() => { onChange(o); setOpen(false); }}
            />
          ))}
        </SheetContent>
      </Sheet>
    </>
  );
}

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
  const [otherKib, setOtherKib] = React.useState(!!row?.kibbutz && !kibbutzim.includes(row.kibbutz));
  const set = (patch: Partial<HoursDraft>) => setD(prev => ({ ...prev, ...patch }));
  const csv = (arr: string[]) => arr.join(', ');
  const uncsv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

  const save = async () => {
    const errs = validateHours(d);
    if (errs.length) { toast.error(errs[0]); return; }
    setSaving(true);
    try {
      const body = {
        person: d.person, kibbutz: d.kibbutz || null, started_at: d.started_at, ended_at: d.ended_at,
        attendees: d.attendees, tags: d.tags, billable: d.billable, note: d.note || null,
      };
      await sbWrite(sb => (row
        ? sb.from('work_sessions').update(body).eq('id', row.id).select('id').single()
        : sb.from('work_sessions').insert(body).select('id').single()) as any);
      track(row ? 'hours-edit' : 'hours-add', d.kibbutz || null);
      toast.success(row ? 'השורה עודכנה' : 'השעות נוספו');
      onSaved(); onClose();
    } catch (e: any) {
      toastFailure(e, undefined, 'השמירה נכשלה');
    } finally { setSaving(false); }
  };
  const del = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await sbWrite(sb => sb.from('work_sessions').delete().eq('id', row.id).select('id') as any);
      track('hours-delete', row.kibbutz || null);
      toast.success('השורה נמחקה'); onSaved(); onClose();
    } catch (e: any) { toastFailure(e, undefined, 'המחיקה נכשלה'); }
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
        {otherKib ? (
          <input id="hKib" className={box} value={d.kibbutz} onChange={e => set({ kibbutz: e.target.value })} autoComplete="off" />
        ) : (
          <select id="hKib" className={box} value={kibbutzim.includes(d.kibbutz) ? d.kibbutz : ''}
                  onChange={e => (e.target.value === '__other__' ? setOtherKib(true) : set({ kibbutz: e.target.value }))}>
            <option value="">בחירה…</option>
            {kibbutzim.map(k => <option key={k} value={k}>{k}</option>)}
            <option value="__other__">אחר…</option>
          </select>
        )}
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
        <label className="mt-4 flex items-center justify-between text-[14px] font-semibold">
          לחיוב
          <Switch checked={d.billable} onCheckedChange={v => set({ billable: v })} />
        </label>
        <div className="mt-4 flex gap-2">
          <BubbleButton variant="primary" size="lg" data-testid="hours-save" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} שמירה
          </BubbleButton>
          <BubbleButton variant="neutral" size="lg" onClick={onClose}>ביטול</BubbleButton>
        </div>
        {row && (
          <ListRow
            className="mt-2 text-[var(--danger-ink)]"
            title="מחיקת השורה"
            onClick={() => setConfirmDel(true)}
          />
        )}
        {row && (
          <ConfirmSheet
            open={confirmDel}
            title="למחוק את השורה?"
            lines={[new Date(row.started_at).toLocaleDateString('he-IL'), row.kibbutz || '—', fmtDuration(durationMin(row))]}
            confirmLabel="מחיקה"
            danger
            onConfirm={del}
            onOpenChange={setConfirmDel}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ExportSheet({ open, onOpenChange, onPdf, onXlsx }: {
  open: boolean; onOpenChange: (o: boolean) => void; onPdf: () => void; onXlsx: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader className="text-start"><SheetTitle>ייצוא</SheetTitle></SheetHeader>
        <ListRow leading={<FileText aria-hidden className="h-5 w-5 text-[color:var(--s-danger-ink)]" />} title="PDF (ייצוא ל-PDF)" aria-label="ייצוא ל-PDF" onClick={() => { onPdf(); onOpenChange(false); }} />
        <ListRow leading={<FileSpreadsheet aria-hidden className="h-5 w-5 text-[color:var(--s-ok-ink)]" />} title="Excel (ייצוא ל-Excel)" aria-label="ייצוא ל-Excel" onClick={() => { onXlsx(); onOpenChange(false); }} />
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
  const [exportOpen, setExportOpen] = React.useState(false);

  useSigmaEvent('work-session-saved', () => { void qc.invalidateQueries({ queryKey: KEY }); });

  const months = React.useMemo(() => monthsOf(rows), [rows]);
  React.useEffect(() => { if (!month && months.length) setMonth(months[0]); }, [months, month]);
  const shown = React.useMemo(() => filterHours(rows, { month: month || undefined, person: person || undefined, kibbutz: kib || undefined }), [rows, month, person, kib]);
  const days = React.useMemo(() => hoursByDay(shown), [shown]);
  const tiles = React.useMemo(() => hoursTiles(shown), [shown]);
  const kibbutzim = React.useMemo(() => Array.from(new Set(rows.map(r => r.kibbutz || '').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he')), [rows]);
  const title = 'שעות מול לקוחות' + (month ? ' · ' + month : '') + (person ? ' · ' + person : '');

  const exportXlsx = React.useCallback(() => {
    const fn = (window as any).xlDownload;
    if (typeof fn !== 'function') { toast.error('ייצוא אקסל לא זמין כאן'); return; }
    track('hours-export', 'xlsx');
    void fn(hoursXlsxSpec(shown, title), title.replace(/[^\p{L}\p{N}]+/gu, '_') + '.xlsx');
  }, [shown, title]);
  const exportPdf = React.useCallback(() => {
    track('hours-export', 'pdf');
    const w = window.open('', '_blank');
    if (!w) { toast.error('הדפדפן חסם את החלון'); return; }
    w.document.open(); w.document.write(hoursPrintHtml(shown, title)); w.document.close();
  }, [shown, title]);

  // Registered so any future shell reading the page-action registry can offer the same two
  // actions (round 5 U1) — this island still renders its OWN PageActionRow directly below,
  // since nothing else consumes the registry for this page yet.
  React.useEffect(() => {
    registerPageAction('hours', { id: 'hours-add', label: 'הוספה ידנית', icon: 'Plus', visible: () => editor, onSelect: () => setEditing('new') });
    registerPageAction('hours', { id: 'hours-export', label: 'ייצוא', icon: 'FileDown', onSelect: () => setExportOpen(true) });
  }, [editor]);

  if (!allowed) return <p className="p-4 text-[14px] text-muted-foreground">העמוד הזה לא זמין למשתמש הזה.</p>;
  if (q.isLoading && showSkeleton(rows.length > 0, hasPersistedData(KEY))) {
    return <div className="space-y-2 p-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="flex flex-col gap-3 pb-4" data-testid="hours-page">
      <PageActionRow
        title={<><Clock aria-hidden className="me-1.5 inline h-[18px] w-[18px] text-[color:var(--brand-1)]" />שעות</>}
        actions={<>
          {editor && (
            <BubbleButton variant="icon" aria-label="הוספה ידנית" data-testid="hours-add" onClick={() => setEditing('new')}>
              <Plus aria-hidden className="h-4 w-4" />
            </BubbleButton>
          )}
          <BubbleButton variant="icon" aria-label="ייצוא" onClick={() => setExportOpen(true)}>
            <FileDown aria-hidden className="h-4 w-4" />
          </BubbleButton>
        </>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <PickerChip label="חודש" value={month} options={months} onChange={setMonth} />
        <PickerChip label="כל העובדים" value={person} options={peopleOf(rows)} onChange={setPerson} />
        <PickerChip label="כל הקיבוצים" value={kib} options={kibbutzim} onChange={setKib} />
      </div>

      <StatTileGrid count={tiles.length}>
        {tiles.map(t => <StatTile key={t.id} value={<bdi>{t.value}</bdi>} label={t.label} role={t.role} />)}
      </StatTileGrid>

      {q.isError && <SectionError text="לא הצלחנו לטעון את השעות." onRetry={() => void qc.invalidateQueries({ queryKey: KEY })} />}

      {!q.isError && !shown.length && (
        <EmptyState icon={<Clock />} title="אין רשומות בסינון הזה." hint="אפשר לשנות את הסינון." />
      )}

      {!!shown.length && (
        <>
          {/* below 768px: SectionBlock per day, ListRows — no scroll-x */}
          <div className="flex flex-col gap-3 md:hidden">
            {days.map(day => (
              <SectionBlock key={day.date} title={day.label} count={day.rows.length}>
                {day.rows.map(r => (
                  <ListRow
                    key={r.id}
                    data-testid="hours-row"
                    title={<bdi>{(r.kibbutz || '—') + ' · ' + r.person}</bdi>}
                    meta={<HoursRowMeta r={r} />}
                    trailing={!r.clockify_id ? <Tag role="warn">לא נשלח</Tag> : null}
                    onClick={editor ? () => setEditing(r) : undefined}
                  />
                ))}
              </SectionBlock>
            ))}
          </div>

          {/* from 768px up: the same day blocks, a real table inside each */}
          <div className="hidden flex-col gap-3 md:flex">
            {days.map(day => (
              <SectionBlock key={day.date} title={day.label} count={day.rows.length} flush>
                <table className="w-full text-[13px] tabular-nums" data-testid="hours-table">
                  <thead className="text-[12px] text-muted-foreground">
                    <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-start [&>th]:font-bold">
                      <th>עובד</th><th>קיבוץ</th><th>שעות</th><th>משך</th><th>תגיות</th><th>לחיוב</th><th>Clockify</th>{editor && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {day.rows.map(r => {
                      const clock = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
                      return (
                        <tr key={r.id} data-testid="hours-row" className="border-t border-border [&>td]:px-4 [&>td]:py-2">
                          <td>{r.person}</td>
                          <td>{r.kibbutz || '—'}</td>
                          <td className="whitespace-nowrap"><bdi>{clock(r.started_at)}–{clock(r.ended_at)}</bdi></td>
                          <td>{fmtDuration(durationMin(r))}</td>
                          <td>{(r.tags || []).join(', ')}</td>
                          <td>{r.billable ? '✓' : ''}</td>
                          <td>{r.clockify_id ? 'נשלח' : <Tag role="warn">לא נשלח</Tag>}</td>
                          {editor && (
                            <td>
                              <BubbleButton variant="icon" size="sm" aria-label="עריכה" onClick={() => setEditing(r)}>
                                <FileText aria-hidden className="h-3.5 w-3.5" />
                              </BubbleButton>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </SectionBlock>
            ))}
          </div>
        </>
      )}

      <ExportSheet open={exportOpen} onOpenChange={setExportOpen} onPdf={exportPdf} onXlsx={exportXlsx} />

      {editing !== null && editor && (
        <HoursSheet row={editing === 'new' ? null : editing} kibbutzim={kibbutzim} onClose={() => setEditing(null)}
                    onSaved={() => { void qc.invalidateQueries({ queryKey: KEY }); try { sigma.track?.('hours-changed', null); } catch { /* */ } }} />
      )}
    </div>
  );
}

/** The clamp-safe meta line: time · duration · up to 3 tags, then "+N" (round 5 U1: "up to 3
    tags then +N", the review focus's longest-row rule). */
function HoursRowMeta({ r }: { r: WorkSessionRow }) {
  const clock = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
  const tags = r.tags || [];
  const shown = tags.slice(0, 3);
  const extra = tags.length - shown.length;
  return (
    <span className="tabular-nums">
      <bdi>{clock(r.started_at)}–{clock(r.ended_at)}</bdi> · {fmtDuration(durationMin(r))}
      {!!shown.length && <> · {shown.join(', ')}{extra > 0 && ' +' + extra}</>}
    </span>
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
