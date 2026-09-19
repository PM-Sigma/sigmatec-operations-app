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
import { track } from '@/lib/track';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { registerMoreItem } from '@/lib/registry';
import { sigma, useCurrentUser } from '@/bridge';
import { emitNotesChanged, NOTES_QUERY_KEY } from '@/components/home/MeetingNotes';
import type { KibbutzRow } from '@/lib/kibbutzim';
import { EmsGate } from '@/components/EmsGate';
import {
  canImportNotes, countRowsToSave, dmy, importPayload, KIND_LABEL, parseMeetingSummary,
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

export const IMPORT_OPEN_EVENT = 'sigma-open-import';

const KINDS: MeetingKind[] = ['company', 'dev', 'client'];

const fieldBox =
  'w-full min-h-[44px] rounded-xl border border-border bg-muted px-3 py-2 text-base outline-none focus:border-[color:var(--brand-1)]';

// ───────────────────────────── the write ─────────────────────────────

export interface ImportResult { inserted: number; updated: number; deleted: number; flagged: number }

/**
 * The save — ONE call to `import_meeting_notes(jsonb)`
 * (db/kibbutz_meeting_notes_import.sql), which is one Postgres transaction.
 *
 * It used to be a client-side DELETE of that (date, kind) followed by an INSERT. That was
 * wrong twice over: it WIPED `ems_task_id` / `done_at`, so re-importing a corrected summary
 * silently unlinked every task opened from a bullet and forgot every ✓; and it was not
 * atomic, so a failure in between left the kibbutz with no bullets at all. The function
 * upserts on the unique key, keeps the link and the ✓, flags a bullet whose wording changed
 * under an existing task, and deletes only the rows the new parse no longer has.
 *
 * Rows for unmatched names are never built (rowsFromParsed skips a section with no card), so
 * nothing is ever written under a name that has no card.
 */
export async function saveParsedMeeting(parsed: ParsedMeeting, createdBy: string): Promise<ImportResult> {
  const sb = await getSupabase();
  const res = await sbWrite<ImportResult>(() =>
    sb.rpc('import_meeting_notes', { p: importPayload(parsed, createdBy) }) as any);
  const out = res || { inserted: 0, updated: 0, deleted: 0, flagged: 0 };
  emitNotesChanged({ meeting_date: parsed.meeting_date, ...out });
  return out;
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
  // `useCurrentUser` re-renders this component on every `user-changed`, so the gate below is
  // re-evaluated live. It used to be computed ONCE at mount, which meant a changeUser() left
  // the sheet openable (or closed off) until a page reload.
  const { name: user, isViewer } = useCurrentUser();
  const admin = canImportNotes(!!sigma?.isAdmin?.(), isViewer);
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
    // A window event as well as the module opener, exactly like the other sheets
    // (feedback, day log, מצב ישיבה): the legacy bundle and the QA harness reach a sheet
    // that way, and a module-scoped function is not reachable from either.
    const onEvent = (e: Event) => opener?.((e as CustomEvent)?.detail?.md);
    window.addEventListener(IMPORT_OPEN_EVENT, onEvent);
    opener = (prefill?: string) => {
      // The gate is checked at OPEN time, not at mount: the ⋯ entry is already hidden for a
      // non-admin, but the modal tab's button and any future caller go through here too.
      if (!canImportNotes(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.())) {
        toast.error('ייבוא סיכום ישיבה מוגבל למנהלים');
        return;
      }
      setOpen(true);
      if (prefill) setMd(prefill);
    };
    return () => { opener = null; window.removeEventListener(IMPORT_OPEN_EVENT, onEvent); };
  }, []);

  // Someone switched to a non-admin while the sheet was open → close it rather than leave a
  // write surface on screen.
  React.useEffect(() => { if (open && !admin) setOpen(false); }, [open, admin]);

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
      const r = await saveParsedMeeting(effective, user);
      await qc.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
      const parts = [`${r.inserted + r.updated} בולטים`];
      if (r.deleted) parts.push(`${r.deleted} הוסרו`);
      if (r.flagged) parts.push(`${r.flagged} עודכנו אחרי פתיחת משימה`);
      track('notes-imported', String(r.inserted + r.updated));   // 📈 שימוש (spec §7j)
      toast.success(`ישיבת ${dmy(effective.meeting_date)}: ${parts.join(' · ')}`);
      setOpen(false); reset();
    } catch (e: any) {
      toast.error(e?.message || 'השמירה נכשלה');
    } finally { setSaving(false); }
  };

  /**
   * ישיבה → סיכום (Task 25, spec §1.3). The straight save above STAYS — a summary that is
   * already right does not need a review — and this is the door to the editor: the parse is
   * handed over as it stands and NOTHING is written until בצע there. The review island is
   * imported lazily, so an ordinary import never pays for its chunk.
   */
  const review = async () => {
    if (!effective || !effective.meeting_date) { toast.error('חסר תאריך ישיבה'); return; }
    try {
      const m = await import('@/islands/MeetingReview');
      m.mountMeetingReview();
      m.openMeetingReview(effective);
      setOpen(false); reset();
    } catch {
      toast.error('מסך הסיכום לא נטען — רענן את העמוד');
    }
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
        <EmsGate>

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
              <button
                type="button"
                data-testid="import-review"
                disabled={saving || !total}
                onClick={() => void review()}
                className="min-h-[48px] rounded-xl border border-border px-3 text-sm font-bold disabled:opacity-40"
              >
                📝 עבור על הסיכום
              </button>
              <button type="button" onClick={() => setPreview(false)}
                      className="min-h-[48px] rounded-xl border border-border px-4 text-sm font-bold">
                חזור
              </button>
            </div>
          </>
        )}
        </EmsGate>
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
  if (!ok) return false;
  // Registered unconditionally, gated by a LIVE predicate. Registering behind an
  // `isAdmin()` read taken at mount meant the entry was decided once, before the user had
  // even picked who they are — and `roles` alone cannot say "admin" (that is
  // canManageStaff(): עידן + עמיחי, a subset of idan + team).
  registerMoreItem({
    id: 'import-meeting',
    group: 'admin',
    label: 'ייבוא סיכום ישיבה',
    icon: 'FileDown',
    roles: ['idan', 'team'],
    visible: () => canImportNotes(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.()),
    onSelect: () => openImportSheet(),
  });
  return ok;
}
