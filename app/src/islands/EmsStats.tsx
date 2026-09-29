// סטטיסטיקת משימות EMS — #sigma-emsstats (H5). Time-to-assign, on-time close %, opened per
// kibbutz per month, open backlog age, closed per month, all from `ems_task_state`.
// Audience: עידן and עמיחי only (canSeeEmsStats here, canShowPage('emsstats') in the bridge, and
// the RLS policy on the tables). Formulas and their denominators: lib/emsLifecycle.ts.
import * as React from 'react';
import { BarChart3 } from 'lucide-react';
import { PageActionRow } from '@/components/ui/page-action-row';
import { StatTile, StatTileGrid } from '@/components/ui/stat-tile';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { EmsGate } from '@/components/EmsGate';
import { useCurrentUser } from '@/bridge';
import { useLifecycleStats } from '@/lib/emsLifecycleData';
import { canSeeEmsStats, formatDuration, monthLabel, type LifecycleStats } from '@/lib/emsLifecycle';

const TITLE = 'סטטיסטיקת משימות EMS';
const MONTHS_SHOWN = 6;

const num = (n: number) => <bdi className="tabular-nums">{n}</bdi>;

function Header() {
  return <PageActionRow title={TITLE} onBack={() => (window as any).pageBack?.()} />;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[length:var(--fs-body-sm)] leading-[var(--lh-body-sm)] text-muted-foreground">{children}</p>;
}

function Body({ s }: { s: LifecycleStats }) {
  const openedMonths = React.useMemo(() => {
    const by = new Map<string, { site: string; count: number }[]>();
    for (const c of s.opened) {
      const a = by.get(c.month) || [];
      a.push({ site: c.site, count: c.count });
      by.set(c.month, a);
    }
    return [...by.entries()].slice(0, MONTHS_SHOWN);
  }, [s.opened]);
  const t = s.timeToAssign;
  const o = s.onTime;
  return (
    <>
      <StatTileGrid>
        <StatTile value={formatDuration(t.medianHours)} label="חציון עד שיבוץ" role="info" />
        <StatTile value={o.pct == null ? '—' : <bdi>{o.pct}%</bdi>} label="נסגרו בזמן" role={o.pct == null ? 'neutral' : o.pct >= 80 ? 'ok' : o.pct >= 50 ? 'warn' : 'danger'} />
        <StatTile value={num(s.backlog.open)} label="פתוחות עכשיו" role="neutral" />
        <StatTile value={num(s.total)} label="משימות במעקב" role="neutral" />
      </StatTileGrid>

      <SectionBlock title="זמן עד שיבוץ" count={t.n}>
        <ListRow title="חציון" trailing={<span className="font-semibold text-foreground">{formatDuration(t.medianHours)}</span>} />
        <ListRow title="ממוצע" trailing={<span className="font-semibold text-foreground">{formatDuration(t.avgHours)}</span>} />
        <Note>שובצה = יש גם אחראי וגם תאריך יעד. נמדד ממועד הפתיחה, בדיוק של כחצי שעה, על משימות שראינו נהיות משובצות בלבד ({num(t.n)}).</Note>
      </SectionBlock>

      <SectionBlock title="סגירה בזמן" count={o.n}>
        <ListRow title="נסגרו עד תאריך היעד" trailing={<span className="font-semibold text-foreground">{o.n ? <bdi>{o.onTime} מתוך {o.n}</bdi> : '—'}</span>} />
        <Note>נספרות משימות שבוצעו או בוטלו ויש להן תאריך יעד.</Note>
      </SectionBlock>

      <SectionBlock title="גיל הצבר הפתוח" count={s.backlog.open}>
        {s.backlog.buckets.map(b => (
          <ListRow key={b.key} title={b.label} trailing={<span className="font-semibold text-foreground">{num(b.count)}</span>} />
        ))}
        {s.backlog.unknownAge > 0 && (
          <ListRow title="גיל לא ידוע" trailing={<span className="font-semibold text-foreground">{num(s.backlog.unknownAge)}</span>} />
        )}
        <ListRow title="חציון גיל" trailing={<span className="font-semibold text-foreground">{s.backlog.medianDays == null ? '—' : <bdi>{s.backlog.medianDays} ימים</bdi>}</span>} />
      </SectionBlock>

      {openedMonths.length === 0
        ? <SectionBlock title="נפתחו לפי קיבוץ וחודש"><Note>עוד אין משימות עם תאריך פתיחה.</Note></SectionBlock>
        : openedMonths.map(([month, cells]) => (
          <SectionBlock key={month} title={`נפתחו · ${monthLabel(month)}`} count={cells.reduce((a, c) => a + c.count, 0)} collapsible defaultOpen={month === openedMonths[0][0]}>
            {cells.map(c => <ListRow key={c.site} title={c.site} trailing={<span className="font-semibold text-foreground">{num(c.count)}</span>} />)}
          </SectionBlock>
        ))}

      <SectionBlock title="נסגרו לפי חודש">
        {s.closed.length === 0
          ? <Note>עוד לא נרשמו סגירות.</Note>
          : s.closed.slice(0, MONTHS_SHOWN).map(c => (
            <ListRow key={c.month} title={monthLabel(c.month)} trailing={<span className="font-semibold text-foreground">{num(c.count)}</span>} />
          ))}
      </SectionBlock>
    </>
  );
}

function EmsStatsInner() {
  const { name, isViewer } = useCurrentUser();
  const allowed = canSeeEmsStats(name, isViewer);
  const q = useLifecycleStats(allowed);
  if (!allowed) return null;                       // nothing at all, and the query never ran

  if (q.isPending) {    // isPending, not isLoading: while the persisted cache restores, nothing is fetching yet but there is no data either
    return (
      <div className="flex flex-col gap-3 p-2" data-testid="emsstats-loading">
        <Header />
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="p-2" data-testid="emsstats-error">
        <Header />
        <EmptyState
          icon={<BarChart3 />}
          title="המעקב עוד לא פעיל."
          hint="הטבלאות של הסטטיסטיקה נוצרות ביום ההפעלה. אם זה כבר קרה, נסו שוב."
          action={{ label: 'ניסיון נוסף', onClick: () => void q.refetch() }}
        />
      </div>
    );
  }
  const s = q.data;
  if (!s) return null;
  if (s.total === 0) {
    return (
      <div className="p-2" data-testid="emsstats-empty">
        <Header />
        <EmptyState
          icon={<BarChart3 />}
          title="עוד אין נתונים."
          hint="הסטטיסטיקה מתמלאת מהסנכרון הבא מול EMS, ומשם צוברת משימה אחרי משימה."
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 p-2 pb-24" data-testid="emsstats-page">
      <Header />
      <Body s={s} />
    </div>
  );
}

export function EmsStats() {
  return (
    <SigmaProviders>
      <EmsGate>
        <EmsStatsInner />
      </EmsGate>
    </SigmaProviders>
  );
}

export function mountEmsStats(): boolean {
  return mount('sigma-emsstats', EmsStats);
}
