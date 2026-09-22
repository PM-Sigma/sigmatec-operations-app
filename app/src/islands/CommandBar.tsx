// Ctrl+K — one input, one list, keyboard first (spec §7k.1, decision #12).
//
// Sources merged and ranked by `lib/commands.ts`: kibbutzim (from the same localStorage cache
// the cards paint from, so the bar works offline), open EMS tasks (the shared cache), and the
// pages the person may actually open — the bar can never offer something the header or the
// sheet would refuse. Package O §3 (22.9, round 3) removed the "פעולות" group entirely; every
// action it used to run is still reachable from its own surface (header ➕, ⋯ עוד, ● user chip).
//
// Opened by Ctrl/Cmd+K, by the desktop header search, and by the phone search field
// (`sigma.openCommandBar()`). Every open and every pick is tracked (§7j) so a source nobody
// uses can be removed later instead of argued about.
import * as React from 'react';
import {
  Command as CommandRoot, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { mount } from '@/islands';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent, type SigmaPage } from '@/bridge';
import { roleOf } from '@/lib/landing';
import { labelOf, sectionOf, type KibbutzRow } from '@/lib/kibbutzim';
import { EmsGate } from '@/components/EmsGate';
import {
  KIND_HEADING, pushRecent, rankCommands, rankedRows, readRecents, type Command,
} from '@/lib/commands';
import { canShowPage } from '@/lib/canShowPage';
import { registerMoreItem } from '@/lib/registry';

const OPEN_EVENT = 'sigma-open-command-bar';
const MESSAGE_EVENT = 'sigma-open-message';

/** Open the command bar from anywhere (the header search, the phone search, a shortcut). */
export function openCommandBar(): void {
  try { window.dispatchEvent(new CustomEvent(OPEN_EVENT)); } catch { /* no DOM */ }
}

/**
 * ✉️ הודעה לעובד — the compose half of the messaging the עובדים page used to hold (§7m R5,
 * ruling 4). It rides along with the command bar because that is the one island mounted on
 * every page, and because the action that opens it lives right there.
 *
 * The message itself is unchanged: `sigma.staffSendMessage` → the same `messages` row, and the
 * recipient still sees it in the unread popup on his next load.
 */
function MessageSheet() {
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState('');
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const people = React.useMemo(() => { try { return sigma.STAFF_PEOPLE || []; } catch { return []; } }, []);

  React.useEffect(() => {
    const onEvent = () => { setTo(people[0] || ''); setText(''); setOpen(true); };
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
        <DialogTitle>✉️ הודעה לעובד</DialogTitle>
        <p className="text-[12.5px] text-muted-foreground">הוא יראה אותה בכניסה הבאה שלו.</p>
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
      </DialogContent>
    </Dialog>
  );
}

// The משימות / 📋 EMS / עובדים pages retired in Task 14 (§7m R1/R2/R5): "המשימות שלי" is the
// calendar's רשימה view, and it is reachable from here under its own name (the action below).
const PAGES: Array<{ page: SigmaPage; label: string }> = [
  { page: 'kibbutz', label: 'קיבוצים' },
  { page: 'calendar', label: 'יומן' },
  { page: 'inventory', label: 'מלאי' },
  { page: 'attendance', label: 'נוכחות' },
  { page: 'dev', label: 'פיתוח' },
  { page: 'pushlog', label: 'התראות' },
];

function readKibbutzim(): KibbutzRow[] {
  // The same cache key the card home writes (`kibbutzim_v1`) — no query, no network, so the
  // bar opens instantly and still works on a phone with no signal.
  try {
    const live = (window as any).KIBBUTZIM;
    if (Array.isArray(live) && live.length) return live as KibbutzRow[];
    const raw = localStorage.getItem('kibbutzim_v1');
    return raw ? (JSON.parse(raw) as KibbutzRow[]) : [];
  } catch { return []; }
}

function buildCommands(user: string, isViewer: boolean): Command[] {
  const out: Command[] = [];
  const canShow = canShowPage;
  void isViewer; // kept in the signature: callers pass it, and role-gating still applies to kibbutzim/tasks/pages

  // Package O §3 (22.9, round 3): the "פעולות" group is removed entirely — קיבוצים · משימות ·
  // מסכים are the whole bar now. Every action it used to offer (➕ קיבוץ, סיכום ביקור, תעודת
  // משלוח, הגדרות, רעיון/באג, …) stays reachable from its own surface (the header ➕, the ⋯ עוד
  // sheet, the ● user-chip menu) — nothing here was the only way in.

  // ---- kibbutzim ----
  for (const row of readKibbutzim()) {
    if (!row?.name || row.archived_at) continue;
    out.push({
      id: 'kibbutz:' + row.name,
      label: labelOf(row),
      keywords: [row.name, row.display_name || '', row.region || ''].join(' '),
      hint: row.region || (sectionOf(row) === 'new' ? 'לקוח חדש' : ''),
      kind: 'kibbutz',
      run: () => sigma.openKibbutzModal(row.name),
    });
  }

  // ---- open EMS tasks ----
  try {
    const tasks = (sigma?.emsCacheData?.()?.tasks || []).slice(0, 300);
    for (const t of tasks) {
      if (!t?.id) continue;
      out.push({
        id: 'task:' + t.id,
        label: t.title || '(משימה ללא כותרת)',
        keywords: t.site?.name || '',
        hint: t.site?.name || '',
        kind: 'task',
        run: () => sigma.openKibbutzEmsTask(String(t.id)),
      });
    }
  } catch { /* no cache yet */ }

  // ---- pages ----
  for (const p of PAGES) {
    if (!canShow(p.page)) continue;
    out.push({ id: 'page:' + p.page, label: p.label, kind: 'page', run: () => sigma.showPage(p.page) });
  }

  return out;
}

/** The one place an ➕ action is executed, shared by the header button and the bar. */
export function runAdd(action: string): void {
  switch (action) {
    case 'kibbutz': {
      const home = (window as any).sigmaHome;
      if (home?.openSheet) home.openSheet();
      else sigma.toast('פתח את עמוד הקיבוצים כדי להוסיף קיבוץ');
      break;
    }
    case 'schedule': case 'event': sigma.showPage('calendar'); break;
    case 'stockChange': sigma.showPage('inventory'); window.dispatchEvent(new CustomEvent('sigma-open-stock-change', { detail: { product: '' } })); break;
    case 'visit': sigma.openVisitQuick(); break;
    case 'feedback': window.dispatchEvent(new CustomEvent('sigma-open-feedback')); break;
    default: break;
  }
}

function CommandBarPanel() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const { name: user, role, isViewer } = useCurrentUser();
  const [recents, setRecents] = React.useState<string[]>(() => readRecents());

  // The source list is rebuilt on every OPEN, never on every keystroke: the caches behind it
  // (kibbutzim, EMS tasks) only change between openings, and rebuilding per keystroke on a
  // 300-task cache is the one way to make a command bar feel slow.
  const [commands, setCommands] = React.useState<Command[]>([]);

  const show = React.useCallback((how: string) => {
    setCommands(buildCommands(user, isViewer));
    setRecents(readRecents());
    setQuery('');
    setOpen(true);
    track('command-open', how);
  }, [user, isViewer]);

  // …with ONE exception to "rebuilt only on open" (Task 20). `readKibbutzim()` reads two stores
  // that nobody notifies about, and on a cold boot the card home publishes them a few
  // milliseconds after the first card is in the DOM. A Ctrl+K inside that window used to leave
  // the bar with no kibbutzim AT ALL, for as long as it stayed open — "לא נמצא כלום" for a
  // kibbutz plainly on the screen behind it. islands/Home.tsx now announces the publish, and
  // this rebuilds on it. Only while OPEN (a closed bar rebuilds on its next open anyway), and
  // the query the person has typed is deliberately NOT cleared — `show()` would wipe it.
  useSigmaEvent('kibbutzim-published', () => {
    if (!open) return;
    setCommands(buildCommands(user, isViewer));
  });

  React.useEffect(() => {
    const onEvent = () => show('trigger');
    window.addEventListener(OPEN_EVENT, onEvent as EventListener);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.key !== 'k' && e.key !== 'K')) return;
      // Mid-composition (an IME / dead-key sequence) the keydown is not a shortcut press.
      if (e.isComposing) return;
      e.preventDefault();
      // Already open: swallow the key rather than rebuild the sources and WIPE what he typed.
      if (open) return;
      show('shortcut');
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onEvent as EventListener);
      document.removeEventListener('keydown', onKey);
    };
  }, [show, open]);

  // The legacy header search and the phone search field call this instead of carrying their
  // own result UI (docs/integration-map.md).
  React.useEffect(() => {
    const s = (window as any).sigma;
    if (s) s.openCommandBar = openCommandBar;
  }, []);

  const personRole = roleOf(user, role);
  const ranked = React.useMemo(
    () => rankCommands(commands, query, { role: personRole, recents }),
    [commands, query, personRole, recents],
  );
  // FLAT, in the global ranked order — so Enter runs the top-ranked result and not the first
  // row of the first group (review fix 4). Each row knows whether it opens a run of its kind.
  const rows = React.useMemo(() => rankedRows(ranked), [ranked]);

  const pick = (cmd: Command) => {
    setOpen(false);
    setRecents(pushRecent(cmd.id));
    track('command-select', cmd.id);
    try { cmd.run(); } catch (e) { console.warn('[sigma] command failed', cmd.id, e); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[560px] p-0" dir="rtl">
        <DialogTitle className="sr-only">חיפוש ופעולות</DialogTitle>
        {/* cmdk's own filtering is OFF — `rankCommands` is the ranking, and it is tested. */}
        <EmsGate>
        <CommandRoot shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="חיפוש: קיבוץ · משימה · מסך"
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>לא נמצא כלום</CommandEmpty>
            {/* One group so cmdk keeps ONE selection sequence in the ranked order. */}
            <CommandGroup>
              {rows.map(({ cmd, startsKind, key }) => (
                <CommandItem key={key} value={cmd.id} onSelect={() => pick(cmd)}>
                  {/* the kind, on the row that opens its run — where a divider would have been */}
                  {startsKind && (
                    <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">
                      {KIND_HEADING[cmd.kind]}
                    </span>
                  )}
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && (
                    <span className="ms-2 shrink-0 text-[11px] text-muted-foreground"><bdi>{cmd.hint}</bdi></span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandRoot>
        </EmsGate>
      </DialogContent>
    </Dialog>
  );
}

/** The bar and the one dialog its actions open — one root, mounted on every page. */
function CommandBarRoot() {
  return (
    <>
      <CommandBarPanel />
      <MessageSheet />
    </>
  );
}

export function mountCommandBar(): boolean {
  // Package O removed the "פעולות" group from Ctrl+K, which was the only way to reach ✉️ הודעה
  // לעובד. It now lives in the ⋯ עוד sheet for every writer (viewers cannot message).
  registerMoreItem({
    id: 'staff-message',
    label: '✉️ הודעה לעובד',
    icon: 'Mail',
    group: 'app',
    visible: () => { try { return !sigma.isViewer?.() && !!sigma.getCurrentUser?.(); } catch { return false; } },
    onSelect: () => { try { window.dispatchEvent(new CustomEvent(MESSAGE_EVENT)); } catch { /* no DOM */ } },
  });
  return mount('sigma-command', CommandBarRoot);
}
