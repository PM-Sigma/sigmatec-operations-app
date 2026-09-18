// Ctrl+K — one input, one list, keyboard first (spec §7k.1, decision #12).
//
// Sources merged and ranked by `lib/commands.ts`: kibbutzim (from the same localStorage cache
// the cards paint from, so the bar works offline), open EMS tasks (the shared cache), the
// pages the person may actually open, and the actions `primaryAdd` + the ⋯ registry already
// model — the bar can never offer something the header or the sheet would refuse.
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
import { openSettings } from '@/lib/settings';
import { sigma, useCurrentUser, type SigmaPage } from '@/bridge';
import { roleOf } from '@/lib/landing';
import { canManageKibbutzim, labelOf, sectionOf, type KibbutzRow } from '@/lib/kibbutzim';
import { primaryAdd, primaryAddLabel } from '@/lib/primaryAdd';
import {
  KIND_HEADING, pushRecent, rankCommands, rankedRows, readRecents, type Command,
} from '@/lib/commands';

const OPEN_EVENT = 'sigma-open-command-bar';

/** Open the command bar from anywhere (the header search, the phone search, a shortcut). */
export function openCommandBar(): void {
  try { window.dispatchEvent(new CustomEvent(OPEN_EVENT)); } catch { /* no DOM */ }
}

const PAGES: Array<{ page: SigmaPage; label: string }> = [
  { page: 'kibbutz', label: 'קיבוצים' },
  { page: 'calendar', label: 'יומן' },
  { page: 'inventory', label: 'מלאי' },
  { page: 'attendance', label: 'נוכחות' },
  { page: 'mytasks', label: 'משימות' },
  { page: 'ems', label: 'משימות EMS' },
  { page: 'staff', label: 'עובדים' },
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
  const page = (() => { try { return ((window as any)._currentPage || 'kibbutz') as SigmaPage; } catch { return 'kibbutz' as SigmaPage; } })();
  const role = roleOf(user, (() => { try { return sigma?.getRole?.() || ''; } catch { return ''; } })());
  const canShow = (p: SigmaPage) => { try { return sigma.canShowPage(p); } catch { return false; } };

  // ---- actions (the `>` prefix) ----
  const add = primaryAdd(page, role, { canManageKibbutzim: canManageKibbutzim(user, isViewer) });
  const addLabel = primaryAddLabel(add);
  if (addLabel) out.push({ id: 'add:' + add, label: addLabel, kind: 'action', run: () => runAdd(add) });

  if (canManageKibbutzim(user, isViewer)) {
    out.push({ id: 'action:new-kibbutz', label: '➕ קיבוץ', kind: 'action', run: () => runAdd('kibbutz') });
    out.push({ id: 'action:import', label: '📥 ייבוא סיכום ישיבה', kind: 'action',
      run: () => window.dispatchEvent(new CustomEvent('sigma-open-import')) });
  }
  if (!isViewer) {
    out.push({ id: 'action:visit', label: '📍 סיכום ביקור', kind: 'action', run: () => sigma.openVisitQuick() });
    out.push({ id: 'action:cert', label: '🚚 תעודת משלוח', kind: 'action', run: () => sigma.openDeliveryCert({}) });
    out.push({ id: 'action:stock', label: '🔢 דיווח שינוי במלאי', kind: 'action', run: () => sigma.showPage('inventory') });
  }
  out.push({ id: 'action:settings', label: '⚙️ הגדרות', kind: 'action', run: openSettings });
  out.push({ id: 'action:feedback', label: '📣 רעיון או תלונה', kind: 'action',
    run: () => window.dispatchEvent(new CustomEvent('sigma-open-feedback')) });

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
    case 'stockChange': sigma.showPage('inventory'); break;
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
        <CommandRoot shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="חיפוש: קיבוץ · משימה · מסך · פעולה"
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
      </DialogContent>
    </Dialog>
  );
}

export function mountCommandBar(): boolean {
  return mount('sigma-command', CommandBarPanel);
}
