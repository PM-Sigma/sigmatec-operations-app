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
import { Loader2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
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
    return 'יש להתחבר ל-EMS כדי לראות נתוני שימוש (הנתונים מוגבלים לעידן).';
  }
  return msg || 'לא ניתן לטעון את נתוני השימוש.';
}

let opener: (() => void) | null = null;

export function openUsage(): void {
  if (!canSeeUsage()) { sigma?.toast?.('עמוד השימוש מוגבל לעידן'); return; }
  if (opener) opener(); else sigma?.toast?.('העמוד עוד לא נטען — רענן');
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
  const cells: { value: string; label: string }[] = [
    { value: String(report.kpi.actionsWeek), label: 'פעולות השבוע' },
    { value: report.kpi.activePeople + '/' + report.kpi.people, label: 'משתמשים פעילים' },
    { value: String(report.kpi.zeroPages), label: 'דפים ללא שימוש' },
    { value: mmss(report.kpi.medianSeconds), label: 'דק׳ לפעולה ראשונה' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map(c => (
        <div key={c.label} className="rounded-xl border border-border bg-muted/50 p-2 text-center">
          <b className="block text-lg font-extrabold leading-tight"><bdi>{c.value}</bdi></b>
          <small className="text-[11px] text-muted-foreground">{c.label}</small>
        </div>
      ))}
    </div>
  );
}

// Tokens only (spec §6): the shading is the brand primary at four opacities, so it follows the
// theme in light AND dark instead of carrying its own palette.
const HEAT_BG = ['bg-muted/40', 'bg-primary/15', 'bg-primary/35', 'bg-primary/60'] as const;

function HeatTable({ report }: { report: UsageReport }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-center text-[12px]">
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
    <div className="rounded-xl border border-border bg-muted/40 p-2.5">
      <b className="text-[13px]">🔔 התקציר השבועי (ראשון 08:00)</b>
      <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[12.5px] leading-snug">
        {lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
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

function UsageDialog() {
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
    <Dialog open={open} onOpenChange={setOpen}>
      {/* The width keys off the VIEWPORT, not the document: the legacy page overflows
          horizontally on a phone, and `w-full` would inherit that wider width and push half
          the dialog off screen (seen in the 375 px smoke). */}
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>📈 שימוש · 30 ימים אחרונים</DialogTitle>
          <DialogDescription>
            מי נכנס לאיזה עמוד וכמה, הפעולות המובילות, עמודים שלא נפתחו — ומה ייצא בתקציר של יום ראשון.
          </DialogDescription>
        </DialogHeader>
      <EmsGate>

        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[62px] rounded-xl" />
            <Skeleton className="h-[160px] rounded-xl" />
            <Skeleton className="h-[140px] rounded-xl" />
          </div>
        )}

        {!!error && (
          <p className="rounded-xl border border-border bg-muted p-3 text-[13px] text-muted-foreground">
            {usageError(error)}
          </p>
        )}

        {!isLoading && !error && (
          <div className="flex flex-col gap-3">
            <Kpi report={report} />

            {!events.length ? (
              <p className="rounded-xl border border-border bg-muted/40 p-3 text-[13px] text-muted-foreground">
                עוד לא נאספו נתוני שימוש. כל פתיחת עמוד ופעולה עיקרית נרשמת מכאן והלאה.
              </p>
            ) : (
              <>
                <section>
                  <h3 className="mb-1 text-[13px] font-bold">פעילות יומית · <bdi>30</bdi> ימים</h3>
                  <PerDayChart report={report} />
                </section>

                <section>
                  <h3 className="mb-1 text-[13px] font-bold">מפת חום — אדם × עמוד (כניסות)</h3>
                  <HeatTable report={report} />
                  {!!report.zeroPages.length && (
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      עמודים שלא נפתחו כלל: {report.zeroPages.map(p => PAGE_LABEL[p] || p).join(' · ')}
                    </p>
                  )}
                </section>

                <div className="grid gap-3 sm:grid-cols-2">
                  <section>
                    <h3 className="mb-1 text-[13px] font-bold">פעולות מובילות · <bdi>7</bdi> ימים</h3>
                    <TopActions report={report} />
                  </section>
                  <section>
                    <h3 className="mb-1 text-[13px] font-bold">נראו לאחרונה</h3>
                    <div className="flex flex-col gap-1 text-[12.5px]">
                      {report.people.map(p => (
                        <div key={p} className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-1">
                          <span className="font-semibold">{p}</span>
                          <bdi className="text-muted-foreground">{lastSeenLabel(report.lastSeen[p] || null)}</bdi>
                        </div>
                      ))}
                    </div>
                  </section>
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
      </DialogContent>
    </Dialog>
  );
}

export function Usage() {
  return (
    <SigmaProviders>
      <UsageDialog />
    </SigmaProviders>
  );
}

export function mountUsage(): boolean {
  const ok = mount('sigma-usage', Usage);
  if (!ok) return false;
  registerMoreItem({
    id: 'usage',
    group: 'admin',
    label: '📈 שימוש',
    icon: 'TrendingUp',
    roles: ['idan'],
    visible: canSeeUsage,
    onSelect: openUsage,
  });
  return true;
}
