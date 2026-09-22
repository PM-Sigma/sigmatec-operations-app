// ▶ the running timer's own sheet (עידן 22.9, E1). Tap the ticking clock on a card and this
// opens: the elapsed time, ⏸/▶ pause and resume, the start time to correct by hand, the
// contact and the tags to fill while the clock still runs (saved with "שמור והמשך"), and two
// ways to end it: ■ close the hours (the stop sheet), or 🗑 stop and drop the session.
// A LAZY chunk like the stop sheet: a card that never taps a running timer never loads it.
import * as React from 'react';
import { Loader2, Pause, Play, Plus, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { sbWrite } from '@/lib/supabase';
import {
  AUTO_STOP_MS, elapsedFor, formatElapsed, pauseSession, resumeSession, saveRunning, tagsCached, tagsMatching,
  type ClockifyTag, type RunningSession,
} from '@/lib/clockify';
import { toLocalInput } from '@/lib/hours';
import { clockifyCall, fetchContacts, patchSessionRow, type Contact } from '@/components/home/workTimerApi';

export default function WorkTimerEditSheet({
  running, onChange, onStop, onDrop, onClose,
}: {
  running: RunningSession;
  /** The session was edited (paused, resumed, retimed, tagged) — persist and re-render. */
  onChange: (s: RunningSession) => void;
  /** ■ — hand over to the stop sheet. */
  onStop: () => void;
  /** 🗑 — end it with no row. */
  onDrop: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [tags, setTags] = React.useState<ClockifyTag[]>([]);
  const [people, setPeople] = React.useState<string[]>(running.attendees || []);
  const [picked, setPicked] = React.useState<string[]>(running.tags || []);
  const [note, setNote] = React.useState(running.note || '');
  const [newContact, setNewContact] = React.useState('');
  const [tagQuery, setTagQuery] = React.useState('');
  const [start, setStart] = React.useState(() => toLocalInput(running.started_at));
  const [busy, setBusy] = React.useState(false);
  const [confirmDrop, setConfirmDrop] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => {
    let live = true;
    void fetchContacts(running.kibbutz).then(c => { if (live) setContacts(c); });
    void tagsCached(() => clockifyCall({ action: 'tags', person: running.person }).then(d => (d.tags || []) as ClockifyTag[]))
      .then(t => { if (live) setTags(t); });
    return () => { live = false; };
  }, [running.kibbutz, running.person]);

  const paused = !!running.paused_at;
  const secs = elapsedFor(running, now);
  const remaining = Math.max(0, AUTO_STOP_MS / 1000 - secs);

  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    set(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]));

  const addContact = async () => {
    const name = newContact.trim();
    if (!name) return;
    setNewContact('');
    if (!contacts.some(c => c.name === name)) setContacts(prev => [...prev, { name }]);
    if (!people.includes(name)) setPeople(prev => [...prev, name]);
    try {
      await sbWrite(async sb => await sb.from('site_contacts').insert({ kibbutz: running.kibbutz, name, active: true }).select().single());
    } catch { /* the session still records him */ }
  };

  // The tag search: a typed word narrows the list; when ONE tag is left it is picked for you
  // (עידן: "אם זה ממש קרוב אז תתן את האופציה לבחור"), a close set stays a choice.
  const shown = tagsMatching(tags, tagQuery);
  const addTagQuery = () => {
    const q = tagQuery.trim();
    if (!q) return;
    const exact = shown.length === 1 ? shown[0].name : (tags.find(t => t.name === q)?.name || q);
    if (!picked.includes(exact)) setPicked(prev => [...prev, exact]);
    setTagQuery('');
  };

  // The open `work_sessions` row is kept in step with the clock (22.9): a retimed start, a
  // pause and a resume all change WHEN two hours are up, and the server-side reminder
  // (push-send `timerStale`) reads that row, not this screen. Best effort — a refused write
  // never blocks the edit.
  const syncRow = (s: RunningSession) => {
    if (!s.row_id) return;
    void patchSessionRow(s.row_id, {
      started_at: s.started_at,
      paused_ms: s.paused_ms || 0,
      paused_at: s.paused_at || null,
      attendees: s.attendees || [],
      tags: s.tags || [],
      note: s.note || null,
    });
  };

  const saveAndContinue = () => {
    let s: RunningSession = { ...running, attendees: people, tags: picked, note: note.trim() || undefined };
    const t = Date.parse(start);
    if (Number.isFinite(t) && t <= Date.now()) s = { ...s, started_at: new Date(t).toISOString() };
    else if (start) { toast.error('שעת התחלה בעתיד? בדוק'); return; }
    saveRunning(s);
    syncRow(s);
    onChange(s);
    toast.success('נשמר, השעון ממשיך');
  };
  const pauseOrResume = () => {
    const s = paused ? resumeSession(running, Date.now()) : pauseSession(running, Date.now());
    saveRunning(s);
    syncRow(s);
    onChange(s);
  };

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" data-testid="work-timer-edit" className="max-h-[90svh] overflow-y-auto p-4 pb-7">
        <SheetHeader className="text-start">
          <SheetTitle className="text-[18px] font-extrabold">שעות · {running.kibbutz}</SheetTitle>
          <SheetDescription>
            {paused ? 'מושהה' : 'רץ'} · עצירה אוטומטית בעוד {formatElapsed(remaining)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex items-center gap-3">
          <span data-testid="work-timer-edit-elapsed" className="text-[34px] font-extrabold tabular-nums">{formatElapsed(secs)}</span>
          <button type="button" data-testid="work-timer-pause" onClick={pauseOrResume}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-muted px-3 text-[14px] font-bold">
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {paused ? 'המשך' : 'עצור זמנית'}
          </button>
        </div>

        <label className="mb-1 mt-4 block text-xs font-bold text-muted-foreground" htmlFor="wtStart">שעת התחלה</label>
        <input id="wtStart" type="datetime-local" value={start} onChange={e => setStart(e.target.value)}
               className="w-full min-h-[44px] rounded-xl border border-border bg-muted px-3 text-base outline-none focus:border-[color:var(--brand-1)]" />

        <section className="mt-4">
          <h4 className="mb-1.5 text-[13px] font-bold">מי איתך</h4>
          <div className="flex flex-wrap gap-1.5">
            {contacts.map(c => (
              <button key={c.name} type="button" aria-pressed={people.includes(c.name)} onClick={() => toggle(setPeople, c.name)}
                      className={'rounded-full border px-2.5 py-1 text-[12px] ' + (people.includes(c.name) ? 'border-transparent bg-primary/15 font-semibold' : 'border-border bg-muted')}>
                {c.name}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input value={newContact} onChange={e => setNewContact(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addContact(); } }}
                   placeholder="הוספת איש קשר" className="min-h-[36px] flex-1 rounded-lg border border-border bg-background px-2 text-[13px]" />
            <button type="button" onClick={() => void addContact()} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-muted px-2.5 text-[13px] font-semibold">
              <Plus className="h-4 w-4" /> הוסף
            </button>
          </div>
        </section>

        <section className="mt-4">
          <h4 className="mb-1.5 text-[13px] font-bold">על מה השיחה</h4>
          {!!picked.length && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {picked.map(t => (
                <button key={t} type="button" onClick={() => toggle(setPicked, t)} className="rounded-full border border-transparent bg-primary/15 px-2.5 py-1 text-[12px] font-semibold">
                  {t} ✕
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input value={tagQuery} onChange={e => setTagQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTagQuery(); } }}
                   placeholder="חפש תגית או כתוב חדשה" data-testid="work-timer-tag-search"
                   className="min-h-[36px] flex-1 rounded-lg border border-border bg-background px-2 text-[13px]" />
            <button type="button" onClick={addTagQuery} disabled={!tagQuery.trim()} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-muted px-2.5 text-[13px] font-semibold disabled:opacity-50">
              <Plus className="h-4 w-4" /> הוסף
            </button>
          </div>
          {!!tagQuery.trim() && (
            <div className="mt-1.5 flex max-h-[24vh] flex-wrap gap-1.5 overflow-y-auto">
              {shown.slice(0, 30).map(t => (
                <button key={t.id} type="button" onClick={() => { if (!picked.includes(t.name)) setPicked(p => [...p, t.name]); setTagQuery(''); }}
                        className={'rounded-full border px-2.5 py-1 text-[12px] ' + (shown.length === 1 ? 'border-transparent bg-brand-grad font-semibold text-white' : 'border-border bg-muted')}>
                  {t.name}
                </button>
              ))}
              {!shown.length && <span className="text-[12px] text-muted-foreground">אין תגית כזאת, Enter יוסיף אותה כחדשה</span>}
            </div>
          )}
        </section>

        <label className="mt-4 block">
          <span className="mb-1 block text-[13px] font-bold">הערה</span>
          <input value={note} onChange={e => setNote(e.target.value)} className="min-h-[36px] w-full rounded-lg border border-border bg-background px-2 text-[13px]" />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" data-testid="work-timer-save-continue" onClick={saveAndContinue}
                  className="min-h-[46px] rounded-xl bg-primary/15 text-[14px] font-bold">שמור והמשך</button>
          <button type="button" data-testid="work-timer-finish" onClick={() => { saveAndContinue(); onStop(); }}
                  className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-brand-grad text-[14px] font-bold text-white">
            <Square className="h-4 w-4" /> סגור שעות
          </button>
        </div>
        {confirmDrop ? (
          <div className="mt-2 flex gap-2">
            <button type="button" data-testid="work-timer-drop-yes" disabled={busy} onClick={() => { setBusy(true); onDrop(); }}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl bg-destructive text-[14px] font-bold text-destructive-foreground">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} כן, למחוק את התזמון
            </button>
            <button type="button" onClick={() => setConfirmDrop(false)} className="min-h-[44px] flex-1 rounded-xl border border-border text-[14px] font-semibold">ביטול</button>
          </div>
        ) : (
          <button type="button" data-testid="work-timer-drop" onClick={() => setConfirmDrop(true)}
                  className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-border text-[14px] font-semibold text-destructive">
            <Trash2 className="h-4 w-4" /> עצור ומחק
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}
