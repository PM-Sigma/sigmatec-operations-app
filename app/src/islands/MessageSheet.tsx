// ✉️ הודעה לעובד — the only UI to send a staff message (spec §7m R5, ruling 4).
//
// X-L7: moved out of CommandBar.tsx (its ⋯ עוד row + the sheet itself, F1) BEFORE Ctrl+K was
// deleted — this is the only place that still opens it. The message itself is unchanged:
// `sigma.staffSendMessage` → the same `messages` row, and the recipient still sees it in the
// unread popup on his next load (that popup belongs to package R, not here).
import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

export function MessageSheetPanel() {
  // Drained ONCE, atomically, by the first initializer that runs — every later one reads the
  // captured snapshot, never the mutable module flag (which the drain has already cleared).
  const [initial] = React.useState(() => { const p = pendingOpen; pendingOpen = null; return p; });
  const [open, setOpen] = React.useState(() => initial !== null);
  const people = React.useMemo(() => { try { return sigma.STAFF_PEOPLE || []; } catch { return []; } }, []);
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
      sigma.toast('✉️ ההודעה נשלחה ל' + to);
      track('message-sent', to);
    } catch (e: any) {
      sigma.toast('ההודעה לא נשלחה: ' + String(e?.message || e));
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[420px]" dir="rtl" data-testid="cmd-message">
        <DialogHeader>
          <DialogTitle>✉️ הודעה לעובד</DialogTitle>
          <p className="text-[12.5px] text-muted-foreground">הוא יראה אותה בכניסה הבאה שלו.</p>
        </DialogHeader>
        <EmsGate>
        <label className="block text-[12.5px] font-semibold">
          למי
          <select className="ucal-input" data-testid="cmd-message-to" value={to} onChange={e => setTo(e.target.value)}>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="block text-[12.5px] font-semibold">
          ההודעה
          <textarea
            className="ucal-input min-h-[90px] py-2" data-testid="cmd-message-text"
            value={text} onChange={e => setText(e.target.value)}
          />
        </label>
        <button
          type="button" className="ucal-primary" data-testid="cmd-message-send"
          disabled={busy || !to || !text.trim()} onClick={send}
        >שלח</button>
        </EmsGate>
      </DialogContent>
    </Dialog>
  );
}

export function mountMessageSheet(): boolean {
  // The Ctrl+K removal (X-L7) took the "פעולות" group with it; ✉️ הודעה לעובד lives only in
  // the ⋯ עוד sheet now, same id as before so MoreSheet's APP_ORDER keeps its place.
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
