// 📝 יומן היום — #sigma-daylog (spec §7i, Part L).
//
// The field team already writes the day somewhere: on paper, in WhatsApp, in their head on the
// drive home. This is that same sentence, typed or spoken once, turned into the visit summaries
// the company needs — and NOTHING is saved until the person has looked at every card and
// pressed שמור הכל. The AI drafts; the person signs.
//
// Three things this screen refuses to do, on purpose:
//   · invent a kibbutz — a name the catalog does not have opens a picker, never a guess;
//   · save a card behind the person's back — every card is editable, and the button is explicit;
//   · post an EMS comment he did not choose — every matched task is a chip he can remove with ✕.
import * as React from 'react';
import { Check, Loader2, Mic, Square, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { track } from '@/lib/track';
import { sigma, useCurrentUser } from '@/bridge';
import { SB_ANON, SB_URL } from '@/lib/supabase';
import { speechCaps, startLive, startRecording, uploadAndTranscribe, type RecordSession } from '@/lib/speech';
import {
  cardReady, emsCommentText, normalizeDayLog, visitPayload,
  type DayLogCatalog, type DayLogResult, type DayLogVisit, type GroundingTask,
} from '@/lib/daylog';

export const DAYLOG_OPEN_EVENT = 'sigma-open-daylog';

/** Open 📝 יומן היום from anywhere (⋯ עוד, the visit page, a nudge deep link). */
export function openDayLog(): void {
  pendingOpen = true;   // cleared by the listener, or drained by the island's first effect
  try { window.dispatchEvent(new CustomEvent(DAYLOG_OPEN_EVENT)); } catch { /* no DOM */ }
}

/** Cold-open flag — read synchronously by the island's first render (same shape as Gaps). */
let pendingOpen = false;

// ─────────────────────── the open latch (the REAL daylog.spec flake) ───────────────────────
// `mount()` calls `createRoot(...).render(...)`, which SCHEDULES a render — main.tsx flips its
// `mounted` flag the instant that returns, but the component's own window listener only exists
// after React commits, one tick later. An open event dispatched in that gap therefore reached
// nobody: main.tsx saw `mounted === true` and stood down, and the island was not listening yet.
// That is the daylog.spec.ts timeout that was filed to Task 18 as a flake, and it is a real user
// bug — tapping ⋯ → יומן היום at the moment the chunk lands did nothing. (`openDayLog()` alone
// could not cover it: the ⋯ row and the specs dispatch the raw event.)
//
// This listener is attached when the CHUNK evaluates — strictly before the first render — and
// only raises the flag. The component's own handler is registered later, so on a warm open it
// runs after this one and clears the flag again.
try { window.addEventListener(DAYLOG_OPEN_EVENT, () => { pendingOpen = true; }); } catch { /* no DOM */ }

/** Who gets the entry: the field team writes days, עידן reviews them. */
export function canUseDayLog(user: string): boolean {
  if (!user) return false;
  try { if (sigma.isIdan?.()) return true; } catch { /* legacy not loaded */ }
  const people = (() => { try { return sigma.ATT_PEOPLE || []; } catch { return ['אביאם', 'ניתאי']; } })();
  return people.includes(user) || user === 'עידן';
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The three grounding lists, read live off the bridge. Empty is fine; wrong is not. */
export function readCatalog(): DayLogCatalog {
  const kibbutzim = (() => { try { return sigma.kibbutzNames?.() || []; } catch { return []; } })();
  const products = (() => { try { return sigma.productNames?.() || []; } catch { return []; } })();
  const tasks: GroundingTask[] = (() => {
    try {
      const closed = ['done', 'cancelled', 'closed'];
      return (sigma.emsCacheData?.()?.tasks || [])
        .filter((t: any) => t && t.id && t.title && !closed.includes(String(t.status || '')))
        .slice(0, 60)
        .map((t: any) => ({ id: String(t.id), title: String(t.title), kibbutz: t.site?.name ? String(t.site.name) : undefined }));
    } catch { return []; }
  })();
  return { kibbutzim, products, tasks };
}

/** Ask `parse-daylog`. Throws with a sentence the person can act on — never a status code. */
async function parseDayLog(text: string, catalog: DayLogCatalog, external?: AbortController): Promise<any> {
  const token = (() => { try { return sigma.emsToken?.() || ''; } catch { return ''; } })();
  if (!token) throw new Error('יש להתחבר כדי לנתח את היום — אפשר לכתוב סיכום ביקור ידנית');
  // F19: the caller may hand in its own controller so a בטל button can end the wait. The
  // 30 s deadline still fires on top of it.
  const ac = external || new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const r = await fetch(`${SB_URL}/functions/v1/parse-daylog`, {
      method: 'POST', signal: ac.signal,
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token, text, today: today(),
        kibbutzim: catalog.kibbutzim, products: catalog.products, tasks: catalog.tasks,
      }),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok || res?.error) throw new Error(r.status === 401 ? 'יש להתחבר שוב כדי לנתח את היום' : 'הניתוח לא הצליח — נסה שוב או כתוב סיכום ידנית');
    return res;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(external && external.signal.aborted && !(e as any).__deadline
        ? 'CANCELLED'
        : 'הניתוח לוקח יותר מדי זמן — נסה שוב');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Record the person's edits so the next parse is better. Fire-and-forget, by design. */
function recordCorrection(person: string, rawLen: number, before: DayLogResult, after: DayLogResult): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const token = (() => { try { return sigma.emsToken?.() || ''; } catch { return ''; } })();
  const pass = (() => { try { return sigma.sbPass?.()?.token || ''; } catch { return ''; } })();
  if (!token) return;
  void fetch(`${SB_URL}/functions/v1/parse-daylog`, {
    method: 'POST',
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'correction', token, sbToken: pass, person, raw_len: rawLen, json_before: before, json_after: after }),
  }).catch(() => { /* the learning loop is a nicety; a lost row costs nothing */ });
}

// ───────────────────────────── one card ─────────────────────────────

function VisitCard({ v, catalog, saved, onChange, onDrop }: {
  v: DayLogVisit;
  catalog: DayLogCatalog;
  saved?: { ok: boolean; note: string };
  onChange: (patch: Partial<DayLogVisit>) => void;
  onDrop: () => void;
}) {
  const needsPick = !v.kibbutzConfident;
  return (
    <div
      data-testid="daylog-card"
      data-kibbutz={v.kibbutz}
      className="rounded-xl border border-border bg-card p-3 space-y-2"
      style={{ opacity: saved?.ok ? 0.6 : 1 }}
    >
      <div className="flex items-center gap-2">
        {needsPick ? (
          <select
            aria-label="קיבוץ"
            data-testid="daylog-kibbutz-pick"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={catalog.kibbutzim.includes(v.kibbutz) ? v.kibbutz : ''}
            onChange={e => onChange({ kibbutz: e.target.value, kibbutzConfident: !!e.target.value })}
          >
            <option value="">איזה קיבוץ? — {v.kibbutz || 'לא זוהה'}</option>
            {catalog.kibbutzim.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        ) : (
          <div className="flex-1 font-semibold">{v.kibbutz}</div>
        )}
        {saved?.ok
          ? <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="size-3" />נשמר</span>
          : (
            <Button variant="ghost" size="icon" aria-label="הסר כרטיס" data-testid="daylog-drop" onClick={onDrop}>
              <Trash2 className="size-4" />
            </Button>
          )}
      </div>

      <Textarea
        aria-label="מה נעשה"
        data-testid="daylog-summary"
        rows={3}
        value={v.summary}
        placeholder="מה נעשה בביקור"
        onChange={e => onChange({ summary: e.target.value })}
      />
      <Textarea
        aria-label="מה נשאר פתוח"
        data-testid="daylog-open"
        rows={2}
        value={v.open_items}
        placeholder="מה נשאר פתוח"
        onChange={e => onChange({ open_items: e.target.value })}
      />

      {v.items.length > 0 && (
        <div className="space-y-1">
          {v.items.map((it, i) => (
            <div key={`${it.product}-${i}`} className="flex items-center gap-2 text-sm">
              {/* Product names are Latin codes ("Satec EM133", "Landis+Gyr E360PP") sitting in a
                  Hebrew line — isolated, or the model number re-orders itself next to the qty. */}
              <span className={it.resolved ? '' : 'text-muted-foreground line-through'}><bdi>{it.product}</bdi></span>
              <input
                type="number" min={1} aria-label={`כמות ${it.product}`}
                className="w-16 rounded-md border border-border bg-background px-2 py-1"
                value={it.qty}
                onChange={e => {
                  const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
                  onChange({ items: v.items.map((x, j) => (j === i ? { ...x, qty } : x)) });
                }}
              />
              {!it.resolved && <span className="text-xs text-muted-foreground">לא בקטלוג — לא ייכנס למלאי</span>}
            </div>
          ))}
        </div>
      )}

      {v.task_matches.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {v.task_matches.map(m => (
            <span key={m.task_id} data-testid="daylog-task-chip" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              🔗 <bdi>{m.title || m.task_id}</bdi>
              <button
                type="button" aria-label={`בטל עדכון למשימה ${m.title || m.task_id}`}
                onClick={() => onChange({ task_matches: v.task_matches.filter(x => x.task_id !== m.task_id) })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {saved && !saved.ok && <div className="text-xs text-destructive" data-testid="daylog-card-error">{saved.note}</div>}
    </div>
  );
}

// ───────────────────────────── the sheet ─────────────────────────────

function DayLogSheet() {
  const me = useCurrentUser().name;
  const [open, setOpen] = React.useState(() => { const p = pendingOpen; pendingOpen = false; return p; });
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  // F19 / pattern 5: a long job gets an elapsed counter and a בטל wired to its controller.
  const [analysing, setAnalysing] = React.useState(false);
  const [analyseSec, setAnalyseSec] = React.useState(0);
  const analyseAc = React.useRef<AbortController | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState<DayLogResult | null>(null);
  const [saved, setSaved] = React.useState<Record<number, { ok: boolean; note: string }>>({});
  const [listening, setListening] = React.useState(false);
  const original = React.useRef<DayLogResult | null>(null);
  const rawLen = React.useRef(0);
  const catalog = React.useMemo(() => readCatalog(), [open]);
  const live = React.useRef<{ stop: () => void } | null>(null);
  const rec = React.useRef<RecordSession | null>(null);

  React.useEffect(() => {
  // The cold-load open is already handled: `openX()` raises `pendingOpen` before it dispatches,
  // and the `useState` initializer above drains it during the very render `mount()` schedules —
  // strictly before this effect commits. So this effect only has to carry the WARM path (the
  // island is mounted, somebody dispatches the event). A second `pendingOpen` drain here would
  // be dead code: the initializer has always cleared it by the time we get here.
    const onEvent = () => { pendingOpen = false; setOpen(true); };
    window.addEventListener(DAYLOG_OPEN_EVENT, onEvent as EventListener);
    return () => window.removeEventListener(DAYLOG_OPEN_EVENT, onEvent as EventListener);
  }, []);

  const append = (chunk: string) => {
    const t = String(chunk || '').trim();
    if (!t) return;
    setText(prev => (prev ? prev.replace(/\s+$/, '') + ' ' + t : t));
  };

  // Dictation, the same two rungs the feedback box uses (app/src/lib/speech.ts): the browser's
  // own he-IL recognition when it has one, otherwise record → the `transcribe` function.
  const stopVoice = async () => {
    setListening(false);
    if (live.current) { live.current.stop(); live.current = null; return; }
    const session = rec.current;
    rec.current = null;
    if (!session) return;
    setBusy(true);
    try {
      const audio = await session.stop();
      if (audio) {
        const out = await uploadAndTranscribe(audio);
        append(out.text);
      }
    } catch (e: any) {
      toast.error(String(e?.message || 'התמלול נכשל — אפשר להקליד'));
    } finally {
      setBusy(false);
    }
  };

  const startVoice = async () => {
    const caps = speechCaps();
    setListening(true);
    if (caps.speechRecognition && !caps.forceOffLive) {
      live.current = startLive({
        onFinal: append,
        onInterim: () => { /* the interim guess is noise in a long day log */ },
        onError: (_kind, _detail) => { setListening(false); live.current = null; toast.error('ההקלטה נכשלה — אפשר להקליד'); },
        onEnd: () => { setListening(false); live.current = null; },
      });
      if (live.current) return;
    }
    if (!caps.mediaRecorder) { setListening(false); toast.error('הדפדפן הזה לא תומך בהקלטה — אפשר להקליד'); return; }
    rec.current = await startRecording({
      onError: () => { setListening(false); rec.current = null; toast.error('אין הרשאה למיקרופון — אפשר להקליד'); },
    });
    if (!rec.current) setListening(false);
  };

  const cancelAnalyse = () => {
    analyseAc.current?.abort();
    analyseAc.current = null;
  };

  // The elapsed counter only ticks while a job is actually in flight.
  React.useEffect(() => {
    if (!analysing) { setAnalyseSec(0); return; }
    const id = window.setInterval(() => setAnalyseSec(n => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [analysing]);

  const analyse = async () => {
    const raw = text.trim();
    if (!raw || analysing) return;
    setBusy(true);
    setAnalysing(true);
    setSaved({});
    const ac = new AbortController();
    analyseAc.current = ac;
    try {
      const json = await parseDayLog(raw, catalog, ac);
      const norm = normalizeDayLog(json, catalog);
      rawLen.current = raw.length;
      original.current = JSON.parse(JSON.stringify(norm));
      setResult(norm);
      track('daylog-parsed', String(norm.visits.length));
      if (!norm.visits.length) toast.message('לא זוהו ביקורים בטקסט — אפשר לנסח מחדש');
    } catch (e: any) {
      // A cancel the person asked for is not a failure — say nothing, the text is still there.
      if (String(e?.message) !== 'CANCELLED') toast.error(String(e?.message || 'הניתוח לא הצליח'));
    } finally {
      setBusy(false);
      setAnalysing(false);
      analyseAc.current = null;
    }
  };

  const patch = (i: number, p: Partial<DayLogVisit>) => {
    setResult(prev => (prev ? { ...prev, visits: prev.visits.map((v, j) => (j === i ? { ...v, ...p } : v)) } : prev));
  };
  const drop = (i: number) => {
    setResult(prev => (prev ? { ...prev, visits: prev.visits.filter((_, j) => j !== i) } : prev));
  };

  const saveAll = async () => {
    if (!result) return;
    setSaving(true);
    const marks: Record<number, { ok: boolean; note: string }> = { ...saved };
    let ok = 0;
    for (let i = 0; i < result.visits.length; i++) {
      if (marks[i]?.ok) continue;                        // a retry must not save the same day twice
      const v = result.visits[i];
      if (!cardReady(v)) { marks[i] = { ok: false, note: 'בחר קיבוץ כדי לשמור את הכרטיס' }; continue; }
      const payload = visitPayload(v, me, today());
      const res = await (sigma.saveVisitFromData?.({ ...payload, emsTaskId: v.task_matches[0]?.task_id })
        ?? Promise.resolve({ ok: false, error: 'שמירת ביקור אינה זמינה' }));
      if (!res?.ok) { marks[i] = { ok: false, note: String(res?.error || 'השמירה נכשלה') }; continue; }
      ok++;
      marks[i] = { ok: true, note: '' };
      // The matched tasks get עידן's sentence, one comment each. A failure here is reported but
      // never un-saves the visit — the visit is the record, the comment is the courtesy.
      for (const m of v.task_matches) {
        const r = await (sigma.emsAddComment?.(m.task_id, emsCommentText(me, m.text), { kibbutz: v.kibbutz })
          ?? Promise.resolve({ ok: false }));
        // `ok` covers two different outcomes and the person deserves to know which: the
        // legacy writer returns `{ ok: true, queued: true }` when there is no connection and
        // the comment was parked for the next sign-in. Reporting that as a plain success is
        // how somebody walks away believing the team already saw his update (Task 16 → 18).
        if (!r?.ok) toast.error(`העדכון למשימה "${m.title || m.task_id}" לא נשלח`);
        else if (r.queued) toast(`🕒 העדכון למשימה "${m.title || m.task_id}" יישלח בהתחברות הבאה`);
      }
    }
    setSaved(marks);
    setSaving(false);
    track('daylog-saved', String(ok));
    if (original.current) recordCorrection(me, rawLen.current, original.current, result);
    if (ok) toast.success(ok === 1 ? 'הביקור נשמר' : `${ok} ביקורים נשמרו`);
    if (ok === result.visits.length) {
      setText('');
      setResult(null);
      setOpen(false);
    }
  };

  const allSaved = !!result && result.visits.length > 0 && result.visits.every((_, i) => saved[i]?.ok);

  // §7p: a dictated day is minutes of talking — a backdrop tap must not end it.
  const guard = useUnsavedGuard({
    dirty: () => text.trim() !== '',
    onDiscard: () => { setText(''); setResult(null); },
    onClose: () => setOpen(false),
  });

  return (
    <Sheet open={open} onOpenChange={guard.onOpenChange(setOpen)}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto" data-testid="daylog-sheet" {...guard.contentProps}>
        <SheetHeader>
          <SheetTitle>📝 יומן היום</SheetTitle>
          <SheetDescription>ספר מה עשית היום — בכתיבה או בדיבור. תראה כרטיס לכל קיבוץ לפני שמשהו נשמר.</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 p-4">
          <Textarea
            aria-label="יומן היום"
            data-testid="daylog-text"
            rows={6}
            value={text}
            placeholder="היום הייתי בדפנה, החלפתי מונה ראשי בלול… אחר כך חוקוק…"
            onChange={e => setText(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <Button
              type="button" variant={listening ? 'destructive' : 'secondary'}
              data-testid="daylog-mic" aria-label={listening ? 'עצור הקלטה' : 'דבר'}
              onClick={() => (listening ? void stopVoice() : void startVoice())}
              disabled={busy && !listening}
            >
              {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
              <span className="ms-1">{listening ? 'עצור' : 'דבר'}</span>
            </Button>
            <Button type="button" data-testid="daylog-analyse" loading={busy} onClick={() => void analyse()} disabled={!text.trim()}>
              <span className="ms-1">נתח</span>
            </Button>
          </div>

          {/* F19 / pattern 5: the long job says how long it has been running and offers a way
              out. The text area stays editable the whole time — nothing here blocks it. */}
          {analysing && (
            <div data-testid="daylog-progress" className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-[13px]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span className="font-semibold">מנתח את היום…</span>
              <span className="tabular-nums text-muted-foreground"><bdi>{analyseSec}s</bdi></span>
              <button
                type="button"
                data-testid="daylog-cancel"
                onClick={cancelAnalyse}
                className="ms-auto rounded-lg border border-border px-2 py-0.5 text-[12px] font-bold hover:bg-muted"
              >
                בטל
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-2" data-testid="daylog-cards">
              {result.visits.map((v, i) => (
                <VisitCard
                  key={i}
                  v={v}
                  catalog={catalog}
                  saved={saved[i]}
                  onChange={p => patch(i, p)}
                  onDrop={() => drop(i)}
                />
              ))}

              {result.unmatched.length > 0 && (
                <div className="rounded-xl border border-dashed border-border p-3 text-sm" data-testid="daylog-unmatched">
                  <div className="mb-1 font-medium">לא שויך לקיבוץ</div>
                  {result.unmatched.map((u, i) => <div key={i} className="text-muted-foreground">{u}</div>)}
                </div>
              )}

              {result.visits.length > 0 && !allSaved && (
                <Button type="button" className="w-full" data-testid="daylog-save-all" onClick={() => void saveAll()} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span className="ms-1">שמור הכל</span>
                </Button>
              )}
            </div>
          )}
        </div>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

export function DayLog() {
  return (
    <SigmaProviders>
      <DayLogSheet />
    </SigmaProviders>
  );
}

export function mountDayLog(opts?: { open?: boolean }): boolean {
  if (opts?.open) pendingOpen = true;
  const ok = mount('sigma-daylog', DayLog);
  if (!ok) return false;
  (window as any).sigmaOpenDayLog = openDayLog;
  registerMoreItem({
    id: 'field-journal',
    label: 'יומן היום',
    icon: 'Notebook',
    group: 'app',
    visible: () => {
      try { return canUseDayLog(sigma.getCurrentUser?.() || ''); } catch { return false; }
    },
    onSelect: openDayLog,
  });
  return true;
}
