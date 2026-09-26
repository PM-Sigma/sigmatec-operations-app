// הודעה לעובד — the only UI to send a staff message (spec §7m R5, ruling 4).
//
// X-L7: moved out of CommandBar.tsx (its ⋯ עוד row + the sheet itself, F1) BEFORE Ctrl+K was
// deleted — this is the only place that still opens it. The message itself is unchanged:
// `sigma.staffSendMessage` → the same `messages` row, and the recipient still sees it in the
// unread popup on his next load (that popup belongs to package R, not here).
//
// X-U1 (round 5, design system): rebuilt on the DS primitives only — a bottom Sheet, the roster
// as FilterChips (never a native <select>, security context now live: person-scoped RLS means
// recipients exclude yourself and the viewer, `db/rls_person_scoped.sql`), a 16px Textarea, and
// a BubbleButton footer. A 42501 from the server (the write-policy said no — a stale pass, or a
// staff member with no `staff_identities` row yet, X-L1 review focus 1) gets its own toast
// instead of the generic failure line.
import * as React from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { FilterChip } from '@/components/ui/chip';
import { BubbleButton } from '@/components/ui/bubble-button';
import { EmsGate } from '@/components/EmsGate';
import { mount } from '@/islands';
import { track } from '@/lib/track';
import { sigma } from '@/bridge';
import { registerMoreItem } from '@/lib/registry';

const MESSAGE_EVENT = 'sigma-open-message';

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

/** A 42501 is the write-policy answering "not as him" — distinct from a network hiccup. */
function sendFailedMessage(e: unknown): string {
  const code = (e as { code?: string } | undefined)?.code;
  if (code === '42501') return 'אין הרשאה לשלוח כרגע. כדאי להתחבר מחדש ולנסות שוב.';
  const msg = String((e as { message?: string } | undefined)?.message ?? e ?? '');
  return msg ? 'ההודעה לא נשלחה: ' + msg : 'ההודעה לא נשלחה. אפשר לנסות שוב.';
}

export function MessageSheetPanel() {
  // Drained ONCE, atomically, by the first initializer that runs — every later one reads the
  // captured snapshot, never the mutable module flag (which the drain has already cleared).
  const [initial] = React.useState(() => { const p = pendingOpen; pendingOpen = null; return p; });
  const [open, setOpen] = React.useState(() => initial !== null);
  const people = React.useMemo(recipients, []);
  const [to, setTo] = React.useState(() => initial?.to || people[0] || '');
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ to?: string } | undefined>).detail;
      setTo(detail?.to || people[0] || '');
      setText('');
      setOpen(true);
    };
    window.addEventListener(MESSAGE_EVENT, onEvent as EventListener);
    return () => window.removeEventListener(MESSAGE_EVENT, onEvent as EventListener);
  }, [people]);

  async function send() {
    const body = text.trim();
    if (!to || !body) return;
    setBusy(true);
    try {
      await sigma.staffSendMessage?.(to, body);
      setOpen(false);
      toast.success('ההודעה נשלחה');
      track('message-sent', to);
    } catch (e) {
      toast.error(sendFailedMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" dir="rtl" className="max-h-[85svh] overflow-y-auto" data-testid="cmd-message">
        <SheetHeader>
          <SheetTitle>הודעה לעובד</SheetTitle>
          <SheetDescription>הוא יראה אותה בכניסה הבאה שלו.</SheetDescription>
        </SheetHeader>
        <EmsGate>
          <div className="mt-3">
            <div className="mb-1.5 text-[12.5px] font-semibold text-foreground">למי</div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="למי" data-testid="cmd-message-to">
              {people.map(p => (
                <FilterChip key={p} selected={p === to} onClick={() => setTo(p)}>
                  {p}
                </FilterChip>
              ))}
            </div>
          </div>
          <label className="mt-3 block text-[12.5px] font-semibold text-foreground">
            ההודעה
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="מה רוצים להגיד"
              className="mt-1.5 min-h-[96px] py-2 text-[16px]"
              data-testid="cmd-message-text"
            />
          </label>
          <BubbleButton
            variant="primary" size="lg" className="mt-4" data-testid="cmd-message-send"
            disabled={busy || !to || !text.trim()} loading={busy} onClick={() => void send()}
          >
            שליחה
          </BubbleButton>
        </EmsGate>
      </SheetContent>
    </Sheet>
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
  return mount('sigma-message', MessageSheetPanel);
}
