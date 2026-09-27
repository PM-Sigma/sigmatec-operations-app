// #sigma-usage — the 📈 שימוש screen (spec §7j). עידן ONLY, and gated three times over:
//   1. the ⋯ עוד entry is `visible: () => sigma.isIdan()` (a LIVE predicate, so changeUser()
//      can never leave it listed for someone else)
//   2. the dialog closes itself the moment the current user stops being עידן
//   3. the DATA is behind `usage_report()`, a SECURITY DEFINER RPC that refuses any actor but
//      עידן — the client gate is the first door, not the only one (db/usage_events.sql)
//
// Everything on screen comes out of ONE pure aggregate() call (app/src/lib/usage.ts), so the
// numbers are covered by goldens rather than by reading this file. The only chart is the
// 30-day bar (shadcn Charts / Recharts — the app's first use of the chart library, spec §7j).
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Loader2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionBlock } from '@/components/ui/section-block';
import { SectionError } from '@/components/ui/section-error';
import { ListRow } from '@/components/ui/list-row';
import { StatTile, StatTileGrid } from '@/components/ui/stat-tile';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { registerMoreItem } from '@/lib/registry';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { flushNow } from '@/lib/track';
import {
  aggregate, heatBucket, lastSeenLabel, mmss, PAGE_KEYS, PAGE_LABEL, USAGE_ROSTER,
  type UsageEvent, type UsageReport,
} from '@/lib/usage';
import { usageNarrative } from '@/lib/usageNarrative';
import { EmsGate } from '@/components/EmsGate';
import { SESSION_LOST_MSG } from '@/lib/session';

export const USAGE_QUERY_KEY = ['usage', 30] as const;
const DAYS = 30;

// ───────────────────────── gates ─────────────────────────

/** Live, never cached: the page is עידן's alone (spec §7j) and a viewer never sees it. */
export function canSeeUsage(): boolean {
  try { return !!sigma?.isIdan?.() && !sigma?.isViewer?.(); } catch { return false; }
}

/**
 * The RPC refuses an unauthenticated (anon) call outright — which is what a phone with no live
 * EMS session has. "permission denied for function usage_report" is true but useless on screen,
 * so it becomes the same sentence every other gated surface uses.
 */
export function usageError(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? '');
  if (/permission denied|42501|401|JWT|row-level security/i.test(msg)) {
    return SESSION_LOST_MSG;
  }
  return msg || 'לא ניתן לטעון את נתוני השימוש.';
}

let opener: (() => void) | null = null;

export function openUsage(): void {
  if (!canSeeUsage()) { sigma?.toast?.('עמוד השימוש מוגבל לעידן'); return; }
  if (opener) opener(); else sigma?.toast?.('העמוד עוד לא נטען. אפשר לרענן.');
}

// ───────────────────────── data ─────────────────────────

/**
 * `usage_events` has NO client select policy — the only way in is the RPC, which checks the
 * actor server-side. A flush first, so the events from this very session are in the report
 * instead of being 10 seconds behind it.
 */
async function fetchUsage(actor: string): Promise<UsageEvent[]> {
  flushNow('pagehide');
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('usage_report', { p_days: DAYS, p_actor: actor });
  if (error) throw error;
  return (data || []) as UsageEvent[];
}

// ───────────────────────── pieces ─────────────────────────

function Kpi({ report }: { report: UsageReport }) {
  const cells: { id: string; value: string; label: string }[] = [
    { id: 'actions', value: String(report.kpi.actionsWeek), label: 'פעולות השבוע' },
    { id: 'active', value: report.kpi.activePeople + '/' + report.kpi.people, label: 'משתמשים פעילים' },
    { id: 'zero', value: String(report.kpi.zeroPages), label: 'דפים ללא שימוש' },
    { id: 'median', value: mmss(report.kpi.medianSeconds), label: 'דק׳ לפעולה ראשונה' },
  ];
  return (
    <StatTileGrid>
      {cells.map(c => <StatTile key={c.id} value={<bdi>{c.value}</bdi>} label={c.label} />)}
    </StatTileGrid>
  );
}

// Tokens only (spec §6): the shading is the brand primary at four opacities, so it follows the
// theme in light AND dark instead of carrying its own palette.
const HEAT_BG = ['bg-muted/40', 'bg-primary/15', 'bg-primary/35', 'bg-primary/60'] as const;

function HeatTable({ report }: { report: UsageReport }) {
  return (
    <div className="relative rounded-xl border border-border">
      {/* Designer (round-5 R-U Opus audit, 412 width): the heat table's own columns run past
          the card edge with nothing telling the reader more sits off-screen — the last column
          just gets cut. A fade on the scroll container's inline-end edge (physically the LEFT
          in this RTL app — the sticky "שם" column pins the start/right edge, so the table can
          only ever overflow further left) reads as "there's more here" without JS or a scroll
          listener. `to-l`/`to-card` are physical on purpose: they track the visual left edge
          regardless of writing direction, which is what a person actually sees cut off. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 z-10 w-8 rounded-e-xl bg-gradient-to-l from-transparent to-card" />
      <div className="overflow-x-auto rounded-xl">
      <table className="w-full border-collapse text-center text-[12px] tabular-nums">
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky start-0 bg-muted/60 p-1.5 text-start font-bold">שם</th>
            {report.pages.map(p => (
              <th key={p} className="p-1.5 font-bold">{PAGE_LABEL[p] || p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.heat.map(row => (
            <tr key={row.person} className="border-t border-border">
              <td className="sticky start-0 bg-card p-1.5 text-start font-bold">{row.person}</td>
              {report.pages.map(p => {
                const n = row.cells[p] || 0;
                return (
                  <td key={p} className={'p-1.5 ' + HEAT_BG[heatBucket(n, report.maxCell)]}>
                    {n ? <bdi className="font-semibold">{n}</bdi> : <span className="text-muted-foreground">0</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// "אירועים", not "פעולות": perDay counts EVERYTHING that happened that day (page views and
// island mounts included), while the KPI's "פעולות השבוע" counts primary actions only.
const CHART_CONFIG = {
  count: { label: 'אירועים', color: 'hsl(var(--primary))' },
} satisfies ChartConfig;

function PerDayChart({ report }: { report: UsageReport }) {
  const data = React.useMemo(
    () => report.perDay.map(d => ({ ...d, label: d.date.slice(8) + '.' + d.date.slice(5, 7) })),
    [report.perDay],
  );
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[160px] w-full">
      {/* rtl-ok: Recharts' margin prop takes physical sides only, and this one is symmetric. */}
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} tickMargin={6} />
        <YAxis width={28} tickLine={false} axisLine={false} allowDecimals={false} orientation="right" />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

function Narrative({ events }: { events: UsageEvent[] }) {
  // The SAME builder push-send runs on Sunday — what עידן reads here is what he will be sent.
  const lines = React.useMemo(() => {
    const cut = Date.now() - 7 * 86400_000;
    const prevCut = Date.now() - 14 * 86400_000;
    const week = events.filter(e => +new Date(e.at) >= cut);
    const prev = events.filter(e => +new Date(e.at) >= prevCut && +new Date(e.at) < cut);
    return usageNarrative(week, prev, USAGE_ROSTER, PAGE_KEYS);
  }, [events]);

  return (
    <SectionBlock title={<><Bell aria-hidden className="me-1 inline h-4 w-4" /> השבוע</>} className="mt-0">
      <p className="px-4 pb-1 text-[12px] text-muted-foreground">התקציר השבועי (ראשון 08:00)</p>
      {lines.map((l, i) => <ListRow key={i} title={l} />)}
    </SectionBlock>
  );
}

function TopActions({ report }: { report: UsageReport }) {
  if (!report.topActions.length) {
    return <p className="text-[12.5px] text-muted-foreground">לא נרשמה פעולה עיקרית בשבוע האחרון.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {report.topActions.map(a => (
        <div key={a.action} className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-1 text-[12.5px]">
          <span className="font-semibold">{a.label}</span>
          <bdi className="font-extrabold">{a.count}</bdi>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── the dialog ─────────────────────────

function UsageSheet() {
  const { name: actor } = useCurrentUser();
  const [open, setOpen] = React.useState(false);
  const allowed = canSeeUsage();

  React.useEffect(() => { opener = () => setOpen(true); return () => { opener = null; }; }, []);
  React.useEffect(() => { if (open && !allowed) setOpen(false); }, [open, allowed]);

  // The weekly push opens the app at #usage. Like the 📣 inbox, the island mounts BEFORE the
  // user has identified themselves, so the gate is re-checked on every user-changed.
  const checkHash = React.useCallback(() => {
    if (location.hash !== '#usage') return;
    if (!canSeeUsage()) return;
    setOpen(true);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* private mode */ }
  }, []);
  React.useEffect(() => {
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [checkHash]);
  useSigmaEvent('user-changed', checkHash);

  const { data, isLoading, error } = useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: () => fetchUsage(actor),
    enabled: open && allowed,
    staleTime: 60_000,
  });

  const events = data || [];
  const report = React.useMemo(
    () => aggregate(events, { now: Date.now(), people: USAGE_ROSTER, pages: PAGE_KEYS, days: DAYS }),
    [events],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* The width keys off the VIEWPORT, not the document: the legacy page overflows
          horizontally on a phone, and `w-full` would inherit that wider width and push half
          the sheet off screen (seen in the 375 px smoke). Desktop (1440) centers per the DS rule
          via the `sm:` breakpoint below — the panel becomes a fixed-width centered sheet instead
          of a full-width bottom sheet once there is room for one. */}
      <SheetContent
        side="bottom"
        className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto sm:inset-x-0 sm:mx-auto sm:mb-[5vh] sm:rounded-[var(--r-lg)]"
        dir="rtl"
      >
        <SheetHeader>
          <SheetTitle>שימוש · 30 ימים אחרונים</SheetTitle>
          <SheetDescription>
            מי נכנס לאיזה עמוד וכמה, הפעולות המובילות, עמודים שלא נפתחו, ומה ייצא בתקציר של יום ראשון.
          </SheetDescription>
        </SheetHeader>
      <EmsGate>

        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[62px] rounded-xl" />
            <Skeleton className="h-[160px] rounded-xl" />
            <Skeleton className="h-[140px] rounded-xl" />
          </div>
        )}

        {!!error && <SectionError text={usageError(error)} />}

        {!isLoading && !error && (
          <div className="flex flex-col gap-3">
            <Kpi report={report} />

            {!events.length ? (
              <p className="rounded-xl border border-border bg-muted/40 p-3 text-[13px] text-muted-foreground">
                עוד לא נאספו נתוני שימוש. כל פתיחת עמוד ופעולה עיקרית נרשמת מכאן והלאה.
              </p>
            ) : (
              <>
                <SectionBlock title={<>פעילות יומית · <bdi>30</bdi> ימים</>}>
                  <div className="px-4"><PerDayChart report={report} /></div>
                </SectionBlock>

                <SectionBlock title="מפת חום: אדם × עמוד (כניסות)">
                  <div className="px-4">
                    <HeatTable report={report} />
                    {!!report.zeroPages.length && (
                      <p className="mt-1 text-[11.5px] text-muted-foreground">
                        עמודים שלא נפתחו כלל: {report.zeroPages.map(p => PAGE_LABEL[p] || p).join(' · ')}
                      </p>
                    )}
                  </div>
                </SectionBlock>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SectionBlock title={<>פעולות מובילות · <bdi>7</bdi> ימים</>}>
                    <div className="px-4"><TopActions report={report} /></div>
                  </SectionBlock>
                  <SectionBlock title="נראו לאחרונה">
                    {report.people.map(p => (
                      <ListRow key={p} title={p} meta={<bdi>{lastSeenLabel(report.lastSeen[p] || null)}</bdi>} />
                    ))}
                  </SectionBlock>
                </div>

                <Narrative events={events} />
              </>
            )}
          </div>
        )}

        {isLoading && (
          <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> טוען נתוני שימוש…
          </p>
        )}
      </EmsGate>
      </SheetContent>
    </Sheet>
  );
}

export function Usage() {
  return (
    <SigmaProviders>
      <UsageSheet />
    </SigmaProviders>
  );
}

export function mountUsage(): boolean {
  const ok = mount('sigma-usage', Usage);
  if (!ok) return false;
  registerMoreItem({
    id: 'usage',
    group: 'admin',
    label: 'שימוש',
    icon: 'TrendingUp',
    roles: ['idan'],
    visible: canSeeUsage,
    onSelect: openUsage,
  });
  return true;
}
