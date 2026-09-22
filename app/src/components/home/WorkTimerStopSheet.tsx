// The ■ stop sheet (Task 29), in its OWN module so it is a lazy chunk: the card only pays
// for the Sheet primitives and this form when someone actually stops a timer. The rules it
// applies are goldens in app/src/lib/clockify.ts; the render contract is WorkTimer.test.tsx.
import * as React from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { sigmaBus } from '@/bridge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { elapsedFor, endedAtFor, entryPayload, formatElapsed, tagsCached, type ClockifyTag, type RunningSession, type SessionDraft } from '@/lib/clockify';
import { clockifyCall, fetchContacts, fetchProjects, type Contact } from '@/components/home/workTimerApi';
import { WORK_SESSION_SAVED } from '@/components/home/workTimerEvents';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';

// ───────────────────────────── the stop sheet ─────────────────────────────

export default function StopSheet({
  running, onClose, onSaved,
}: { running: RunningSession; onClose: () => void; onSaved: () => void }) {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [tags, setTags] = React.useState<ClockifyTag[]>([]);
  // 22.9 (E1): whatever was filled while the clock ran comes in already picked.
  const [pickedPeople, setPickedPeople] = React.useState<string[]>(running.attendees || []);
  const [pickedTags, setPickedTags] = React.useState<string[]>(running.tags || []);
  const [newContact, setNewContact] = React.useState('');
  const [note, setNote] = React.useState(running.note || '');
  const [billable, setBillable] = React.useState(false);   // default OFF (spec §8b)
  const [saving, setSaving] = React.useState(false);
  // F12 / pattern 4: הוסף inserts into `site_contacts` and had no pending state at all.
  const [addingContact, setAddingContact] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void fetchContacts(running.kibbutz).then(c => {
      if (!live) return;
      const extra = (running.attendees || []).filter(n => !c.some(x => x.name === n)).map(n => ({ name: n }));
      setContacts([...c, ...extra]);
    });
    // The vocabulary is theirs and is read live (cached an hour; a failed fetch keeps the
    // stale list rather than emptying the picker).
    void tagsCached(() => clockifyCall({ action: 'tags', person: running.person }).then(d => (d.tags || []) as ClockifyTag[]))
      .then(t => { if (live) setTags(t); });
    return () => { live = false; };
  }, [running.kibbutz, running.person]);

  // Functional updater on purpose: two taps inside one React batch (or one fast double tap)
  // must both land — with a captured array the second one would overwrite the first.
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, value: string) =>
    set(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  /** Inline add, exactly like the visit summary: the name is usable immediately even if the
   *  `site_contacts` insert is refused (no EMS pass) — the attendee list is free text. */
  const addContact = async () => {
    const name = newContact.trim();
    if (!name || addingContact) return;
    setAddingContact(true);
    setNewContact('');
    if (!contacts.some(c => c.name === name)) setContacts(prev => [...prev, { name }]);
    if (!pickedPeople.includes(name)) setPickedPeople(prev => [...prev, name]);
    try {
      await sbWrite(async sb => await sb.from('site_contacts')
        .insert({ kibbutz: running.kibbutz, name, active: true }).select().single());
    } catch { /* the session still records him; the contact card just was not saved */ }
    finally { setAddingContact(false); }
  };

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    const draft: SessionDraft = {
      person: running.person,
      kibbutz: running.kibbutz,
      started_at: running.started_at,
      // start + the seconds actually worked: a paused stretch is never billed (E1)
      ended_at: endedAtFor(running),
      tags: pickedTags,
      attendees: pickedPeople,
      billable,
      note: note.trim(),
    };

    // 1) Clockify — best effort. A failure here must NOT cost the hours.
    let clockifyId: string | null = null;
    try {
      const projects = await fetchProjects();
      const payload = entryPayload(draft, { projects, tags });
      const d = await clockifyCall({ action: 'entry', entry: payload });
      clockifyId = String(d?.entry?.id || '') || null;
    } catch { clockifyId = null; }

    // 2) the row — the source of truth. It has existed since ▶ (22.9), with `ended_at = null`,
    //    so the server could remind him about it; ■ CLOSES that row rather than adding a
    //    second one. `row_id` is absent only when the ▶ insert was refused — then this is the
    //    original insert, unchanged, and the hours still land.
    const fields = {
      person: draft.person, kibbutz: draft.kibbutz, kind: 'session',
      attendees: draft.attendees, tags: draft.tags,
      description: entryPayload(draft, { projects: [], tags }).description,
      started_at: draft.started_at, ended_at: draft.ended_at,
      billable: draft.billable, clockify_id: clockifyId, note: draft.note || null,
    };
    try {
      if (running.row_id) {
        await sbWrite(async sb => await sb.from('work_sessions')
          .update({ ...fields, paused_at: null, paused_ms: running.paused_ms || 0 })
          .eq('id', running.row_id));
      } else {
        await sbWrite(async sb => await sb.from('work_sessions').insert(fields).select().single());
      }
    } catch (e) {
      setSaving(false);
      toast.error(String((e as Error)?.message || e));
      return;   // the timer keeps running — nothing was lost
    }

    track(clockifyId ? 'clockify_stop' : 'clockify_stop_unsynced', draft.kibbutz);
    try { sigmaBus?.dispatchEvent(new CustomEvent(WORK_SESSION_SAVED, { detail: { kibbutz: draft.kibbutz, clockify_id: clockifyId } })); }
    catch { /* no bus */ }
    toast.success(clockifyId ? 'השעות נשמרו ונשלחו ל-Clockify' : 'השעות נשמרו, הסנכרון ל-Clockify יתבצע מאוחר יותר');
    setSaving(false);
    onSaved();
  };

  // §7p: attendees, tags and a note are minutes of work — a backdrop tap must not end them.
  const guard = useUnsavedGuard({
    dirty: () => pickedPeople.length > 0 || pickedTags.length > 0 || newContact.trim() !== '' || note.trim() !== '',
    onSave: () => confirm(),
    onDiscard: onClose,
    onClose,
  });

  return (
    <Sheet open onOpenChange={o => { if (!o) guard.ask(); }}>
      <SheetContent side="bottom" data-testid="work-timer-sheet" className="max-h-[88svh] overflow-y-auto" {...guard.contentProps}>
        <SheetHeader className="text-start">
          <SheetTitle className="text-base">סגירת שעות: {running.kibbutz}</SheetTitle>
          <SheetDescription>{formatElapsed(elapsedFor(running))} · מי השתתף, על מה, והאם זה לחיוב</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4" onClick={e => e.stopPropagation()}>
          {/* who attended */}
          <section>
            <h4 className="mb-1.5 text-[13px] font-bold">מי השתתף</h4>
            <div className="flex flex-wrap gap-1.5" data-testid="work-timer-attendees">
              {contacts.length === 0 && <span className="text-[12px] text-muted-foreground">אין אנשי קשר שמורים. אפשר להוסיף כאן</span>}
              {contacts.map(c => (
                <button
                  key={c.name} type="button"
                  data-testid={'attendee-' + c.name}
                  aria-pressed={pickedPeople.includes(c.name)}
                  onClick={() => toggle(setPickedPeople, c.name)}
                  className={'rounded-full border px-2.5 py-1 text-[12px] '
                    + (pickedPeople.includes(c.name) ? 'border-transparent bg-primary/15 font-semibold' : 'border-border bg-muted')}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              <input
                data-testid="work-timer-new-contact"
                value={newContact}
                onChange={e => setNewContact(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addContact(); } }}
                placeholder="הוספת איש קשר"
                className="min-h-[36px] flex-1 rounded-lg border border-border bg-background px-2 text-[13px]"
              />
              <button
                type="button" data-testid="work-timer-add-contact" onClick={() => void addContact()}
                disabled={addingContact}
                aria-busy={addingContact || undefined}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-muted px-2.5 text-[13px] font-semibold disabled:opacity-60"
              >
                {addingContact ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" />} הוסף
              </button>
            </div>
          </section>

          {/* tags — the live workspace vocabulary */}
          <section>
            <h4 className="mb-1.5 text-[13px] font-bold">על מה עבדנו</h4>
            <div className="flex max-h-[28vh] flex-wrap gap-1.5 overflow-y-auto" data-testid="work-timer-tags">
              {tags.length === 0 && <span className="text-[12px] text-muted-foreground">רשימת התגיות לא נטענה. אפשר לשמור בלי תגיות</span>}
              {tags.map(t => (
                <button
                  key={t.id} type="button"
                  data-testid={'tag-' + t.name}
                  aria-pressed={pickedTags.includes(t.name)}
                  onClick={() => toggle(setPickedTags, t.name)}
                  className={'rounded-full border px-2.5 py-1 text-[12px] '
                    + (pickedTags.includes(t.name) ? 'border-transparent bg-primary/15 font-semibold' : 'border-border bg-muted')}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </section>

          <label className="block">
            <span className="mb-1 block text-[13px] font-bold">הערה (לא חובה)</span>
            <input
              data-testid="work-timer-note" value={note} onChange={e => setNote(e.target.value)}
              className="min-h-[36px] w-full rounded-lg border border-border bg-background px-2 text-[13px]"
            />
          </label>

          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input
              type="checkbox" data-testid="work-timer-billable"
              checked={billable} onChange={e => setBillable(e.target.checked)}
              className="h-5 w-5"
            />
            לחיוב
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button" data-testid="work-timer-confirm" disabled={saving} onClick={() => void confirm()}
              className="min-h-[44px] flex-1 rounded-xl bg-primary/15 text-[14px] font-bold disabled:opacity-60"
            >
              {saving ? 'שומר…' : 'שמור שעות'}
            </button>
            <button
              type="button" onClick={onClose}
              className="min-h-[44px] rounded-xl border border-border px-4 text-[14px] font-semibold"
            >
              ביטול
            </button>
          </div>
        </div>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}
