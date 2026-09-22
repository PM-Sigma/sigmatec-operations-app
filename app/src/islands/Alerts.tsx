// 🔔 התראות מלאי — #sigma-alerts (inventory spec §5.1, reshaped 22.9 — עידן, G1).
//
// The bell in the header. Everything that moves in the pool raises a row in the database
// (db/inventory_pool.sql's trigger), so this island never has to be told about a change by the
// code that caused it: it reads `inventory_alerts`, newest first, and listens on the realtime
// channel.
//
// 22.9: the rows are GROUPED — one visit summary that moved three products is one line, not
// three; the low-stock rows of a day are one line. What was read drops off the list (a toggle
// brings it back), and the badge counts the unread GROUPS, so five products in one visit are
// one thing to look at, not five.
//
// Tapping a group opens the thing that happened — the visit, the order, the product — never a
// screen about the alert itself. An alert is a pointer, not a place.
//
// The rules (the words, the grouping, where a row leads, who has a bell at all) are pure and
// golden-tested in app/src/lib/alerts.ts, which the Edge Function shares byte for byte.
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, ChevronDown } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import {
  alertTarget, alertText, canSeeAlerts, groupAlerts, isSeen, type AlertGroup, type AlertRow,
} from '@/lib/alerts';

export const ALERTS_OPEN_EVENT = 'sigma-open-alerts';

// The open latch every lazy island carries (Task 18b): `mount()` only SCHEDULES the first
// render, so an event dispatched in that gap would reach nobody. Attached when the CHUNK
// evaluates, drained synchronously by the component's `useState` initializer.
let pendingOpen = false;
try { window.addEventListener(ALERTS_OPEN_EVENT, () => { pendingOpen = true; }); } catch { /* no DOM */ }

/** Open 🔔 התראות מלאי from anywhere (the bell, a KPI tile on the מלאי page, a push). */
export function openAlerts(): void {
  pendingOpen = true;
  try { window.dispatchEvent(new CustomEvent(ALERTS_OPEN_EVENT)); } catch { /* no DOM */ }
}

/** The rows the bell lists — the last 80, newest first (groups need a little more room). */
async function fetchAlerts(): Promise<AlertRow[]> {
  const sb = await getSupabase();
  const { data } = await sb.from('inventory_alerts')
    .select('id,kind,product,qty,from_location,to_location,reason,ref_id,actor,created_at,seen_by')
    .order('created_at', { ascending: false }).limit(80);
  return (data ?? []) as AlertRow[];
}

/** Open what the group is about (§5.1). A recount has no screen of its own — the מלאי page is it. */
function openSource(row: AlertRow): void {
  const t = alertTarget(row);
  try {
    if (t.kind === 'order' && t.id) { sigma.openOrder?.(t.id); return; }
    sigma.showPage?.('inventory');
  } catch { /* legacy not up */ }
}

function GroupRow({ g, user, onSeen }: { g: AlertGroup; user: string; onSeen: (g: AlertGroup) => void }) {
  const [open, setOpen] = React.useState(false);
  const many = g.rows.length > 1;
  return (
    <li data-testid="alert-group" data-count={g.rows.length} className="border-b border-border py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { track('alert-open', String(g.kind)); onSeen(g); openSource(g.rows[0]); }}
          className={`flex-1 text-start text-[13px] leading-snug ${g.seen ? 'text-muted-foreground' : 'font-bold text-foreground'}`}
        >
          <bdi>{g.title}</bdi>
        </button>
        {many && (
          <button
            type="button"
            aria-label={open ? 'סגור פירוט' : 'פירוט'}
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
            className="min-h-8 flex-none rounded-[10px] border border-border px-2 text-[12px] text-muted-foreground"
          >
            <ChevronDown className={'size-4 transition-transform ' + (open ? 'rotate-180' : '')} />
          </button>
        )}
        {!g.seen && (
          <button
            type="button"
            aria-label="סמן כנקרא"
            onClick={() => onSeen(g)}
            className="min-h-8 flex-none rounded-[10px] border border-border px-2 text-[12px] text-muted-foreground"
          >
            <Check className="size-4" />
          </button>
        )}
      </div>
      {many && open && (
        <ul className="mt-1.5 flex flex-col gap-1 ps-3 text-[12px] text-muted-foreground">
          {g.rows.map(r => <li key={String(r.id)}><bdi>{alertText(r)}</bdi></li>)}
        </ul>
      )}
    </li>
  );
}

function AlertsList({ groups, user, onSeen }: { groups: AlertGroup[]; user: string; onSeen: (g: AlertGroup) => void }) {
  const [showSeen, setShowSeen] = React.useState(false);
  const unread = groups.filter(g => !g.seen);
  const read = groups.filter(g => g.seen);
  const shown = showSeen ? groups : unread;
  return (
    <div data-testid="alerts-list">
      {!shown.length && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {groups.length ? 'הכול נקרא' : 'אין תנועות מלאי'}
        </p>
      )}
      {!!shown.length && <ul className="mt-1">{shown.map(g => <GroupRow key={g.key} g={g} user={user} onSeen={onSeen} />)}</ul>}
      {!!read.length && (
        <button
          type="button"
          onClick={() => setShowSeen(s => !s)}
          data-testid="alerts-toggle-seen"
          className="mt-3 w-full rounded-xl border border-border py-2 text-[12.5px] font-semibold text-muted-foreground"
        >
          {showSeen ? 'הסתר מה שנקרא' : `הצג מה שנקרא (${read.length})`}
        </button>
      )}
    </div>
  );
}

function AlertsBell() {
  const { name: user, isViewer } = useCurrentUser();
  const [open, setOpen] = React.useState(() => { const o = pendingOpen; pendingOpen = false; return o; });
  const qc = useQueryClient();
  const allowed = canSeeAlerts(user, isViewer);

  const q = useQuery({ queryKey: ['inventoryAlerts'], queryFn: fetchAlerts, enabled: allowed });
  const rows = React.useMemo(() => q.data ?? [], [q.data]);
  const groups = React.useMemo(() => groupAlerts(rows, user), [rows, user]);

  React.useEffect(() => {
    const onOpen = () => { pendingOpen = false; setOpen(true); };
    window.addEventListener(ALERTS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ALERTS_OPEN_EVENT, onOpen);
  }, []);

  // A stock change made in this tab lands in the ledger through the legacy page; the bell
  // follows it without waiting for the realtime round trip.
  useSigmaEvent('stock-changed', () => { qc.invalidateQueries({ queryKey: ['inventoryAlerts'] }); });

  // Realtime (§5.1): somebody else's visit summary should light this bell within seconds.
  // A project without realtime enabled simply never delivers — the query still refetches on
  // focus, so the list is never stale for long, and nothing here can throw.
  React.useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    let channel: { unsubscribe?: () => void } | null = null;
    (async () => {
      try {
        const sb = await getSupabase();
        const ch = (sb as any).channel?.('inventory_alerts');
        if (!ch || cancelled) return;
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_alerts' }, () => {
          qc.invalidateQueries({ queryKey: ['inventoryAlerts'] });
        }).subscribe();
        channel = ch;
      } catch { /* no realtime */ }
    })();
    return () => { cancelled = true; try { channel?.unsubscribe?.(); } catch { /* already gone */ } };
  }, [allowed, qc]);

  /** Mark a whole group seen — every row in it, optimistically, then the RPC per row. */
  const markSeen = React.useCallback(async (g: AlertGroup) => {
    const todo = g.rows.filter(r => r.id && !isSeen(r, user));
    if (!todo.length) return;
    const ids = new Set(todo.map(r => r.id));
    qc.setQueryData(['inventoryAlerts'], (old: AlertRow[] | undefined) =>
      (old ?? []).map(r => (ids.has(r.id) ? { ...r, seen_by: [...(r.seen_by ?? []), user] } : r)));
    for (const row of todo) {
      try {
        // Through the RPC, not a table UPDATE: `inventory_alerts` is an audit trail and has no
        // client UPDATE or DELETE policy any more (audit C #3, db/rls_2_00_lockdown.sql).
        await sbWrite(sb => sb.rpc('alert_mark_seen', { p_id: row.id as string, p_person: user }) as any);
      } catch { /* the optimistic row stands; the next fetch corrects it */ }
    }
  }, [qc, user]);

  if (!allowed) return null;

  const unseen = groups.filter(g => !g.seen).length;
  return (
    <>
      <button
        type="button"
        data-testid="alerts-bell"
        aria-label={unseen ? `התראות מלאי (${unseen})` : 'התראות מלאי'}
        onClick={() => { track('alerts-open'); setOpen(true); }}
        className="relative inline-flex min-h-9 min-w-9 items-center justify-center rounded-[10px] border border-border bg-card"
      >
        <Bell className="size-[18px] text-foreground" />
        {unseen > 0 && (
          <span
            data-testid="alerts-badge"
            className="absolute -top-1.5 -left-1.5 min-w-[18px] rounded-full bg-[var(--priority)] px-1 text-[11px] font-extrabold leading-[18px] text-white"
          >
            <bdi>{unseen > 99 ? '99+' : unseen}</bdi>
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>🔔 תנועות מלאי</SheetTitle>
            <SheetDescription>מה זז במלאי החברה</SheetDescription>
          </SheetHeader>
          {q.isLoading
            ? <div className="space-y-2 py-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            : <AlertsList groups={groups} user={user} onSeen={markSeen} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

export function Alerts() {
  return (
    <SigmaProviders>
      <AlertsBell />
    </SigmaProviders>
  );
}

export function mountAlerts(): boolean {
  return mount('sigma-alerts', Alerts);
}
