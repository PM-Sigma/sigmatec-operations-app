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
import { Bell } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { useCurrentUser, useSigmaEvent } from '@/bridge';
import {
  canSeeAlerts, canSeeEmsUnlinkedAlert, emsUnlinkedGroup, groupAlerts,
  isSeen, markRowsSeen, unmarkRowsSeen,
  type AlertGroup, type AlertRow,
} from '@/lib/alerts';
import { fetchKibbutzRows } from '@/lib/kibbutzRows';
import { isUnlinked, labelOf, type KibbutzRow } from '@/lib/kibbutzim';
import { toastFailure } from '@/lib/pending';
import { AlertsList } from '@/components/alerts/AlertsPanel';

const fetchKibbutzim = () => fetchKibbutzRows<KibbutzRow>();   // the SAME reader Home/Presenter use

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

function AlertsBell() {
  const { name: user, isViewer } = useCurrentUser();
  const [open, setOpen] = React.useState(() => { const o = pendingOpen; pendingOpen = false; return o; });
  const qc = useQueryClient();
  const allowed = canSeeAlerts(user, isViewer);

  const q = useQuery({ queryKey: ['inventoryAlerts'], queryFn: fetchAlerts, enabled: allowed });
  const rows = React.useMemo(() => q.data ?? [], [q.data]);

  // אתרים לא מקושרים ל-EMS (Package Y) — עידן/עמיחי only, derived from the SAME `kibbutzim`
  // rows Home/Presenter already query (['kibbutzim'], shared cache — no extra request here).
  const seeUnlinked = canSeeEmsUnlinkedAlert(user);
  const kibbutzimQ = useQuery({ queryKey: ['kibbutzim'], queryFn: fetchKibbutzim, enabled: allowed && seeUnlinked });
  const unlinkedNames = React.useMemo(
    () => (kibbutzimQ.data ?? []).filter(isUnlinked).map(labelOf),
    [kibbutzimQ.data],
  );

  const groups = React.useMemo(() => {
    const inv = groupAlerts(rows, user);
    const unlinked = seeUnlinked ? emsUnlinkedGroup(unlinkedNames) : null;
    return unlinked ? [unlinked, ...inv] : inv;
  }, [rows, user, seeUnlinked, unlinkedNames]);

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

  /**
   * Mark a whole group seen — every row in it, optimistically, then the RPC per row.
   *
   * Round 3, Q: a failed RPC used to be swallowed here. The optimistic row stayed crossed out
   * until the next refetch and then came back unread, which is exactly what עידן saw five
   * times over (the server function itself was broken — db/alert_mark_seen_fix.sql). A write
   * that did not reach the database now undoes its own optimistic row and says so, so the bell
   * never again shows a "read" that is not stored.
   */
  const markSeen = React.useCallback(async (g: AlertGroup) => {
    const todo = g.rows.filter(r => r.id && !isSeen(r, user));
    if (!todo.length) return;
    const ids = todo.map(r => String(r.id));
    qc.setQueryData(['inventoryAlerts'], (old: AlertRow[] | undefined) => markRowsSeen(old ?? [], ids, user));

    const failed: string[] = [];
    let lastErr: unknown = null;
    for (const row of todo) {
      try {
        // Through the RPC, not a table UPDATE: `inventory_alerts` is an audit trail and has no
        // client UPDATE or DELETE policy any more (audit C #3, db/rls_2_00_lockdown.sql).
        // `p_person` is the SAME string `isSeen` compares against — the bridge pass carries no
        // name claim, so this client-side name is the only identity the row can hold.
        await sbWrite(sb => sb.rpc('alert_mark_seen', { p_id: String(row.id), p_person: user }) as any);
      } catch (e) {
        failed.push(String(row.id));
        lastErr = e;
      }
    }
    if (failed.length) {
      qc.setQueryData(['inventoryAlerts'], (old: AlertRow[] | undefined) => unmarkRowsSeen(old ?? [], failed, user));
      toastFailure(lastErr, () => { void markSeenRef.current?.(g); }, 'סימון ההתראה כנקראה לא נשמר. נסה שוב');
      return;
    }
    // Only now, when the server really holds it: re-read, so what the list shows is what the
    // database says and a reload agrees with the screen.
    qc.invalidateQueries({ queryKey: ['inventoryAlerts'] });
  }, [qc, user]);
  const markSeenRef = React.useRef(markSeen);
  markSeenRef.current = markSeen;

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
