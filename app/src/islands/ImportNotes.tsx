// #sigma-import — 📥 ייבוא סיכום ישיבה (spec §3.2). Admins only (עידן, עמיחי).
//
// Paste the summary markdown → the date + kind are auto-detected (both editable) →
// תצוגה מקדימה shows every section with its resolved card / a red "אין כרטיס תואם" and a
// צור קיבוץ · דלג pair → שמור N בולטים deletes that (date, kind) and inserts the parse again,
// so a re-import REPLACES instead of doubling (the table's unique key backs that up).
//
// Opened from two places, neither of which imports this module directly:
//   • the ⋯ עוד sheet, via registerMoreItem (registry.ts)
//   • the kibbutz modal's 🗓 ישיבות tab, via openImportSheet() below
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { registerMoreItem } from '@/lib/registry';
import { sigma, useCurrentUser } from '@/bridge';
import { emitNotesChanged, NOTES_QUERY_KEY } from '@/components/home/MeetingNotes';
import type { KibbutzRow } from '@/lib/kibbutzim';
import {
  canImportNotes, countRowsToSave, dmy, KIND_LABEL, parseMeetingSummary, rowsFromParsed,
  type MeetingKind, type ParsedMeeting,
} from '@/lib/meetingNotes';

export { canImportNotes };

// ───────────────────────── the opener (no shared global) ─────────────────────────

type Opener = (prefill?: string) => void;
let opener: Opener | null = null;

/** Open the import sheet from anywhere in the React bundle. No-op before the island mounts. */
export function openImportSheet(prefill?: string): void {
  if (opener) opener(prefill);
  else toast.error('מסך הייבוא עוד לא נטען — רענן את העמוד');
}

const KINDS: MeetingKind[] = ['company', 'dev', 'client'];

const fieldBox =
  'w-full min-h-[44px] rounded-xl border border-border bg-muted px-3 py-2 text-base outline-none focus:border-[color:var(--brand-1)]';

// ───────────────────────────── the write ─────────────────────────────

/**
 * Idempotent save: DELETE that (date, kind) then INSERT the whole parse. Rows for unmatched
 * names are simply never built (rowsFromParsed skips a section with no card), so nothing is
 * written under a name that has no card.
 */
export async function saveParsedMeeting(parsed: ParsedMeeting, createdBy: string): Promise<number> {
  const rows = rowsFromParsed(parsed, createdBy);
  const sb = await getSupabase();
  await sbWrite(() =>
    sb.from('kibbutz_meeting_notes').delete()
      .eq('meeting_date', parsed.meeting_date)
      .eq('meeting_kind', parsed.meeting_kind)
      .select('id'));
  if (rows.length) {
    await sbWrite(() => sb.from('kibbutz_meeting_notes').insert(rows).select('id'));
  }
  emitNotesChanged({ imported: rows.length, meeting_date: parsed.meeting_date });
  return rows.length;
}

// ───────────────────────────── preview ─────────────────────────────

function SectionPreview({
  section, skipped, onSkip, onCreate,
}: {
  section: ParsedMeeting['sections'][number];
  skipped: boolean;
  onSkip: () => void;
  onCreate: (name: string) => void;
}) {
  const unmatched = section.unmatched.length > 0 && section.kibbutzim.length === 0;
  return (
    <div
      className={'rounded-xl border p-2.5 ' + (unmatched ? 'border-[color:var(--sigma-warn)] bg-destructive/5' : 'border-border')
        + (skipped ? ' opacity-40' : '')}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-bold">{section.heading}</span>
        {section.kibbutzim.map(k => (
          <span key={k} className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold">כרטיס: {k}</span>
        ))}
        {section.unmatched.map(n => (
          <span key={n} className="rounded-full bg-destructive/15 px-2 py-px text-[11px] font-bold text-destructive">
            אין כרטיס תואם: {n}
          </span>
        ))}
        {unmatched && !skipped && (
          <>
            <button type="button" onClick={() => onCreate(section.unmatched[0])}
                    className="rounded-lg border border-border px-2 py-px text-[11px] font-semibold hover:bg-muted">
              צור קיבוץ
            </button>
            <button type="button" onClick={onSkip}
                    className="rounded-lg px-2 py-px text-[11px] font-semibold text-muted-foreground hover:bg-muted">
              דלג
            </button>
          </>
        )}
        {skipped && <span className="text-[11px] font-semibold text-muted-foreground">דולג</span>}
      </div>
      <ul className="flex flex-col gap-0.5">
        {section.bullets.map(b => (
          <li key={b.seq} className={'flex items-start gap-1.5 text-[12px] leading-snug ' + (b.quiet ? 'text-muted-foreground' : '')}>
            <span aria-hidden className="mt-[3px] text-[10px] text-muted-foreground">•</span>
            <span className="min-w-0 flex-1">
              {b.text}
              {b.owners.map(o => (
                <span key={o} className="owner-chip ms-1 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                  {o}
                </span>
              ))}
            </span>
          </li>
        ))}
        {!section.bullets.length && <li className="text-[12px] text-muted-foreground">(ללא בולטים)</li>}
      </ul>
    </div>
  );
}

// ───────────────────────────── the sheet ─────────────────────────────

function ImportSheet() {
  const qc = useQueryClient();
  const { name: user } = useCurrentUser();
  const [open, setOpen] = React.useState(false);
  const [md, setMd] = React.useState('');
  const [preview, setPreview] = React.useState(false);
  const [date, setDate] = React.useState('');
  const [kind, setKind] = React.useState<MeetingKind>('company');
  // Names the user said "דלג" to. They produce no rows either way (rowsFromParsed only
  // writes resolved cards) — this just records the decision so the red flag stops shouting.
  const [dismissed, setDismissed] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  // The card catalog the parser resolves names against — the SAME ['kibbutzim'] entry the
  // home island fills, so the import never sees a staler list than the cards do.
  const { data: kibbutzim } = useQuery({
    queryKey: ['kibbutzim'],
    queryFn: async () => {
      const sb = await getSupabase();
      const { data, error } = await sb.from('kibbutzim').select('*').is('archived_at', null);
      if (error) throw error;
      return (data || []) as KibbutzRow[];
    },
    enabled: open,
  });

  React.useEffect(() => {
    opener = (prefill?: string) => { setOpen(true); if (prefill) setMd(prefill); };
    return () => { opener = null; };
  }, []);

  // Auto-detect the date + kind the moment there is text to detect them from; the user can
  // still override both, and an override survives further typing.
  const detected = React.useMemo(() => (md.trim() ? parseMeetingSummary(md, {}) : null), [md]);
  React.useEffect(() => {
    if (!detected) return;
    if (detected.meeting_date) setDate(d => d || detected.meeting_date);
    setKind(k => (k === 'company' ? detected.meeting_kind : k));
  }, [detected]);

  const parsed = React.useMemo(
    () => (md.trim() ? parseMeetingSummary(md, { known: kibbutzim || [], date, kind }) : null),
    [md, kibbutzim, date, kind],
  );
  const effective: ParsedMeeting | null = parsed
    ? { ...parsed, meeting_date: date || parsed.meeting_date, meeting_kind: kind }
    : null;

  const total = React.useMemo(() => (effective ? countRowsToSave(effective) : 0), [effective]);

  const unmatchedCount = effective
    ? effective.sections.filter(s => !s.kibbutzim.length && s.unmatched.length && !s.unmatched.every(n => dismissed.includes(n))).length
    : 0;

  const reset = () => { setMd(''); setPreview(false); setDate(''); setKind('company'); setDismissed([]); };

  const save = async () => {
    if (!effective || !effective.meeting_date) { toast.error('חסר תאריך ישיבה'); return; }
    setSaving(true);
    try {
      const n = await saveParsedMeeting(effective, user);
      await qc.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
      toast.success(`נשמרו ${n} בולטים לישיבת ${dmy(effective.meeting_date)}`);
      setOpen(false); reset();
    } catch (e: any) {
      toast.error(e?.message || 'השמירה נכשלה');
    } finally { setSaving(false); }
  };

  const createKibbutz = (name: string) => {
    const home = (window as any).sigmaHome;
    if (home?.openSheet) { home.openSheet(name); toast.info('צור את הכרטיס ואז חזור לייבוא'); }
    else toast.error('פתח את עמוד הקיבוצים כדי ליצור כרטיס');
  };

  return (
    <Sheet open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>📥 ייבוא סיכום ישיבה</SheetTitle>
          <SheetDescription>הדבק את הסיכום, בדוק את התצוגה המקדימה, ושמור. ייבוא חוזר של אותו תאריך מחליף את הרשומות.</SheetDescription>
        </SheetHeader>

        {!preview ? (
          <>
            <Textarea
              value={md}
              onChange={e => setMd(e.target.value)}
              dir="rtl"
              rows={12}
              placeholder="**סיכום ישיבת חברה — 17.9.26** …"
              className="mt-2 min-h-[220px] font-mono text-[13px]"
            />
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs font-bold text-muted-foreground">
                תאריך הישיבה
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={fieldBox + ' mt-1 w-[170px]'} />
              </label>
              <label className="flex flex-col text-xs font-bold text-muted-foreground">
                סוג
                <select value={kind} onChange={e => setKind(e.target.value as MeetingKind)} className={fieldBox + ' mt-1 w-[150px]'}>
                  {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={!md.trim() || !date}
                onClick={() => setPreview(true)}
                className="min-h-[44px] rounded-xl bg-brand-grad px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                תצוגה מקדימה
              </button>
            </div>
            {detected && !detected.meeting_date && md.trim() && (
              <p className="mt-2 text-xs text-destructive">לא זוהה תאריך בשורה הראשונה — בחר אותו ידנית.</p>
            )}
          </>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded-full bg-muted px-2 py-0.5 font-bold">
                🗓 <bdi>{dmy(effective!.meeting_date)}</bdi> · {KIND_LABEL[kind]}
              </span>
              <span className="text-muted-foreground">{effective!.sections.length} מקטעים · {total} בולטים</span>
              {unmatchedCount > 0 && <span className="font-bold text-destructive">{unmatchedCount} ללא כרטיס</span>}
            </div>

            <div className="mt-2 flex flex-col gap-2">
              {effective!.sections.map((s, i) => (
                <SectionPreview
                  key={i}
                  section={s}
                  skipped={s.unmatched.length > 0 && s.unmatched.every(n => dismissed.includes(n))}
                  onSkip={() => setDismissed(x => [...x, ...s.unmatched])}
                  onCreate={createKibbutz}
                />
              ))}
            </div>

            <div className="sticky bottom-0 mt-3 flex gap-2 border-t border-border bg-background py-2">
              <button
                type="button"
                disabled={saving || !total}
                onClick={() => void save()}
                className="min-h-[48px] flex-1 rounded-xl bg-brand-grad px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `שמור ${total} בולטים`}
              </button>
              <button type="button" onClick={() => setPreview(false)}
                      className="min-h-[48px] rounded-xl border border-border px-4 text-sm font-bold">
                חזור
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ImportNotes() {
  return (
    <SigmaProviders>
      <ImportSheet />
    </SigmaProviders>
  );
}

/** Mounted from main.tsx. Registers the ⋯ עוד entry itself, so nav knows nothing about imports. */
export function mountImportNotes(): boolean {
  const ok = mount('sigma-import', ImportNotes);
  if (ok && canImportNotes(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.())) {
    registerMoreItem({
      id: 'import-meeting',
      label: 'ייבוא סיכום ישיבה',
      icon: 'FileDown',
      roles: ['idan', 'team'],
      onSelect: () => openImportSheet(),
    });
  }
  return ok;
}
