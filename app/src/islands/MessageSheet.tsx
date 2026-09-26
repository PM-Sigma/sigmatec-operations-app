// הודעה לעובד — the only UI to send a staff message (spec §7m R5, ruling 4).
//
// X-L7: moved out of CommandBar.tsx (its ⋯ עוד row + the sheet itself, F1) BEFORE Ctrl+K was
// deleted — this is the only place that still opens it. The message itself is unchanged:
// `sigma.staffSendMessage` → the same `messages` row.
//
// X-U1 (round 5, design system): rebuilt on the DS primitives only — a bottom Sheet, the roster
// as FilterChips (never a native <select>, security context now live: person-scoped RLS means
// recipients exclude yourself and the viewer, `db/rls_person_scoped.sql`), a 16px Textarea, and
// a BubbleButton footer. A 42501 from the server (the write-policy said no — a stale pass, or a
// staff member with no `staff_identities` row yet, X-L1 review focus 1) renders inline above
// "שליחה" (not a toast — the header toast read as a system error, not this form's own state) so
// the exact wording stays put with a retry, instead of vanishing with the next toast.
//
// X-U2 (designer round 2): the receive side (js/src/17-messages.js `staffCheckMessages`) now
// hands its rows to THIS chunk instead of building its own centered-modal popup, the moment the
// chunk is loaded and ready — `window.__sigmaStaffMessagesReady` + `sigma-staff-unread`, exactly
// the handoff 17-messages.js already documented waiting for. Full production wiring (making sure
// this chunk is loaded before the login-time check ever runs) is package R/U13's job — this only
// makes the popup a real Sheet the moment it IS loaded, same shell as compose.
import * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { FilterChip } from '@/components/ui/chip';
import { BubbleButton } from '@/components/ui/bubble-button';
import { EmsGate } from '@/components/EmsGate';
import { mount } from '@/islands';
import { track } from '@/lib/track';
import { sigma } from '@/bridge';
import { registerMoreItem } from '@/lib/registry';
import { toast } from 'sonner';
import { unreadTitle } from '@/lib/staffMessages';

const MESSAGE_EVENT = 'sigma-open-message';
const UNREAD_EVENT = 'sigma-staff-unread';

// The open latch every lazy island carries (main.tsx mounts this chunk on the FIRST tap of the
// ⋯ עוד row or the first `sigma-open-message` — never at boot). `mount()` only schedules the
// first render, so an event dispatched in that gap would reach nobody without this: attached
// when the chunk evaluates (synchronously, before React even renders), drained by the
// component's own `useState` initializer.
let pendingOpen: { to?: string } | null = null;
try {
  window.addEventListener(MESSAGE_EVENT, (e) => {
    pendingOpen = (e as CustomEvent<{ to?: string } | undefined>).detail || {};
  });
} catch { /* no DOM */ }

// Same latch for the receive side, plus the "I am ready" flag 17-messages.js checks before it
// falls back to its own legacy popup (js/src/17-messages.js `staffCheckMessages`).
interface StaffMsg { id: number | string; text: string; from_person?: string; created_at: string }
let pendingInbox: StaffMsg[] | null = null;
try {
  (window as unknown as { __sigmaStaffMessagesReady?: boolean }).__sigmaStaffMessagesReady = true;
  window.addEventListener(UNREAD_EVENT, (e) => {
    const msgs = (e as CustomEvent<{ messages?: StaffMsg[] } | undefined>).detail?.messages || [];
    if (msgs.length) pendingInbox = msgs;
  });
} catch { /* no DOM */ }

/** Open the message sheet from anywhere (the ⋯ עוד row, or a caller with a recipient in mind). */
export function openMessageSheet(to?: string): void {
  try { window.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: to ? { to } : undefined })); } catch { /* no DOM */ }
}

/** The roster minus me — a person never messages himself, and the viewer isn't in STAFF_PEOPLE
    to begin with (person-scoped RLS: he can't send as anyone, round 5 X-R3). */
function recipients(): string[] {
  let people: string[] = [];
  let me = '';
  try { people = sigma.STAFF_PEOPLE || []; } catch { /* no bridge */ }
  try { me = sigma.getCurrentUser?.() || ''; } catch { /* no bridge */ }
  return people.filter(p => p !== me);
}

/** A candidate recipient is only honoured if it's a real, messageable person — never myself
    (a caller passing a stale/self "to", Opus review round 5), never someone off the roster. */
function pickRecipient(candidate: string | undefined, people: string[]): string {
  return candidate && people.includes(candidate) ? candidate : (people[0] || '');
}

/** A 42501 is the write-policy answering "not as him" — distinct from a network hiccup. */
function sendFailedMessage(e: unknown): string {
  const code = (e as { code?: string } | undefined)?.code;
  if (code === '42501') return 'אין הרשאה לשלוח כרגע. כדאי להתחבר מחדש ולנסות שוב.';
  const msg = String((e as { message?: string } | undefined)?.message ?? e ?? '');
  return msg ? 'ההודעה לא נשלחה: ' + msg : 'ההודעה לא נשלחה. אפשר לנסות שוב.';
}

/** "26.9 · 22:48" — day.month, no leading zero on the day, and no seconds (designer round 2). */
function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()}.${d.getMonth() + 1} · ${hh}:${mm}`;
}

/** Radix autofocuses the Close button on open by default (the first focusable descendant) —
    with a keyboard-modality flag already set (an Escape/Tab earlier in the session), the
    browser's own `:focus-visible` heuristic then draws a ring on a purely programmatic focus
    nobody asked for (designer round 2, item 1: seen on the inbox's ✕). `preventDefault` +
    focusing the content div itself (already `tabIndex={-1}` on a Radix `Dialog.Content`) puts
    focus somewhere with no visible affordance to begin with, so no heuristic can light it up. */
function focusContentNotClose(contentRef: React.RefObject<HTMLDivElement>) {
  return (e: Event) => { e.preventDefault(); contentRef.current?.focus(); };
}

export function MessageSheetPanel() {
  // Drained ONCE, atomically, by the first initializer that runs — every later one reads the
  // captured snapshot, never the mutable module flag (which the drain has already cleared).
  const [initial] = React.useState(() => { const p = pendingOpen; pendingOpen = null; return p; });
  const [open, setOpen] = React.useState(() => initial !== null);
  const people = React.useMemo(recipients, []);
  const [to, setTo] = React.useState(() => pickRecipient(initial?.to, people));
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ to?: string } | undefined>).detail;
      setTo(pickRecipient(detail?.to, people));
      setText('');
      setError(null);
      setOpen(true);
    };
    window.addEventListener(MESSAGE_EVENT, onEvent as EventListener);
    return () => window.removeEventListener(MESSAGE_EVENT, onEvent as EventListener);
  }, [people]);

  async function send() {
    const body = text.trim();
    if (!to || !body) return;
    setBusy(true);
    setError(null);
    try {
      await sigma.staffSendMessage?.(to, body);
      setOpen(false);
      toast.success('ההודעה נשלחה');
      track('message-sent', to);
    } catch (e) {
      setError(sendFailedMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        ref={contentRef}
        side="bottom" dir="rtl"
        // before:bg-foreground/25, not the sheet's own default before:bg-border (designer round
        // 2, item 2): --border is 89% lightness in light mode — nearly invisible against the
        // sheet's own near-white background. /25 on the always-opposite `foreground` token reads
        // the same, visibly, in both themes instead of relying on --border's own contrast.
        className="max-h-[85svh] overflow-y-auto outline-none before:bg-foreground/25"
        onOpenAutoFocus={focusContentNotClose(contentRef)}
        data-testid="cmd-message"
      >
        <SheetHeader>
          <SheetTitle>הודעה לעובד</SheetTitle>
          <SheetDescription>הוא יראה אותה בכניסה הבאה שלו.</SheetDescription>
        </SheetHeader>
        <EmsGate>
          <div className="mt-3">
            <div className="mb-1.5 text-[12.5px] font-semibold text-foreground">למי</div>
            {/* role="group", not "radiogroup" (Opus review round 5): the chips are toggle
                buttons (aria-pressed), not native radios — a radiogroup demands role="radio"
                children with aria-checked, which these correctly are not. */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="למי" data-testid="cmd-message-to">
              {people.map(p => (
                <FilterChip
                  key={p}
                  selected={p === to}
                  onClick={() => setTo(p)}
                  // h-11 (44px), not the chip's own default h-8 (Opus review round 5): a real
                  // ≥44px tap target on the button's own box, not the `.s-hit` hit-slop escape
                  // hatch the no-overlap sweep otherwise treats as "already compliant".
                  className="h-11"
                >
                  {p}
                </FilterChip>
              ))}
            </div>
          </div>
          <label className="mt-3 block text-[12.5px] font-semibold text-foreground">
            ההודעה
            <Textarea
              value={text}
              onChange={e => { setText(e.target.value); if (error) setError(null); }}
              placeholder="מה רוצים להגיד"
              // resize-none (designer round 2, nice-to-have): the drag handle read as a stray
              // affordance in a sheet this short.
              className="mt-1.5 min-h-[96px] resize-none py-2 text-[16px]"
              data-testid="cmd-message-text"
            />
          </label>
          {error && (
            <div
              role="alert"
              data-testid="cmd-message-error"
              className="mt-3 rounded-[var(--r-sm)] border border-destructive/40 bg-destructive/10 p-2.5 text-[13px] text-destructive"
            >
              <span>{error}</span>{' '}
              <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void send()}>
                נסה שוב
              </button>
            </div>
          )}
          <BubbleButton
            variant="primary" size="lg"
            // disabled:bg-none (designer round 2, item 3): `.s-brand`'s backgroundImage gradient
            // paints OVER background-color, so disabled:bg-muted alone still showed the (washed
            // out) gradient — a flat neutral fill needs the gradient itself turned off first.
            className="mt-4 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            data-testid="cmd-message-send"
            disabled={busy || !to || !text.trim()} loading={busy} onClick={() => void send()}
          >
            שליחה
          </BubbleButton>
        </EmsGate>
      </SheetContent>
    </Sheet>
  );
}

/** The receive side (designer round 2, item 1): the SAME bottom Sheet as compose, not the
    legacy centered `#msgPopup` div — js/src/17-messages.js hands its rows here via
    `sigma-staff-unread` once `window.__sigmaStaffMessagesReady` is true. */
export function MessageInboxPanel() {
  const [initial] = React.useState(() => { const m = pendingInbox; pendingInbox = null; return m; });
  const [messages, setMessages] = React.useState<StaffMsg[]>(() => initial || []);
  const [open, setOpen] = React.useState(() => !!initial?.length);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onEvent = (e: Event) => {
      const msgs = (e as CustomEvent<{ messages?: StaffMsg[] } | undefined>).detail?.messages || [];
      if (!msgs.length) return;
      setMessages(msgs);
      setOpen(true);
    };
    window.addEventListener(UNREAD_EVENT, onEvent as EventListener);
    return () => window.removeEventListener(UNREAD_EVENT, onEvent as EventListener);
  }, []);

  function close() {
    setOpen(false);
    const ids = messages.map(m => m.id);
    try { (window as unknown as { staffMarkRead?: (ids: Array<number | string>) => void }).staffMarkRead?.(ids); } catch { /* no bridge */ }
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) close(); }}>
      <SheetContent
        ref={contentRef}
        side="bottom" dir="rtl"
        className="max-h-[85svh] overflow-y-auto outline-none before:bg-foreground/25"
        onOpenAutoFocus={focusContentNotClose(contentRef)}
        data-testid="cmd-inbox"
      >
        <SheetHeader>
          <SheetTitle>✉️ {unreadTitle(messages.length)}</SheetTitle>
        </SheetHeader>
        <div className="mt-3 space-y-2">
          {messages.map(m => (
            // bg-muted (a raised-surface token), not bg-card/bg-background: in dark mode the
            // sheet's own background and the scrim behind it read too close together
            // (designer round 2, item 5) — a message row needs to sit visibly above the sheet.
            <div key={m.id} className="rounded-[var(--r-sm)] border border-border bg-muted p-3">
              <div className="whitespace-pre-wrap text-[14px] text-foreground">{m.text}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                מאת {m.from_person || '?'} · {formatMsgTime(m.created_at)}
              </div>
            </div>
          ))}
        </div>
        <BubbleButton variant="primary" size="lg" className="mt-4" onClick={close}>
          קראתי, סגור
        </BubbleButton>
      </SheetContent>
    </Sheet>
  );
}

/** Both sheets share the one `#sigma-message` root (index.html has no second mount point, and
    two sibling Sheet roots under one React root is exactly what Radix's own portal is for). */
function MessageIslandRoot() {
  return (
    <>
      <MessageSheetPanel />
      <MessageInboxPanel />
    </>
  );
}

export function mountMessageSheet(): boolean {
  // The Ctrl+K removal (X-L7) took the "פעולות" group with it; הודעה לעובד lives only in
  // the ⋯ עוד sheet now, same id and label as `main.tsx`'s boot-time placeholder row (so the
  // swap from placeholder to this real registration is invisible), same id CommandBar had so
  // MoreSheet's APP_ORDER keeps its place.
  registerMoreItem({
    id: 'staff-message',
    label: '✉️ הודעה לעובד',
    icon: 'Mail',
    group: 'app',
    visible: () => { try { return !sigma.isViewer?.() && !!sigma.getCurrentUser?.(); } catch { return false; } },
    onSelect: () => openMessageSheet(),
  });
  // The command bar's recents key is dead with it — cleared once, not left to rot in storage.
  try { localStorage.removeItem('sigma_cmd_recents_v1'); } catch { /* no storage */ }
  return mount('sigma-message', MessageIslandRoot);
}
