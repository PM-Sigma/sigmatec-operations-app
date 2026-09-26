// 🔔 יומן התראות — #sigma-pushlog (G-U3). The push-send log, rebuilt on the design system:
// עידן only, four StatTiles, a list of ListRows (title = what + where, meta = recipient · when
// · status, and for a failed row the error text right on the row — never only in a hover
// tooltip, so it reads on the phone). A row opens a small sheet with the full detail. A רענון
// bubble refetches. Read-only: no writes exist for this table.
import * as React from 'react';
import { RefreshCw, Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageActionRow } from '@/components/ui/page-action-row';
import { StatTile, StatTileGrid } from '@/components/ui/stat-tile';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { Tag } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { BubbleButton } from '@/components/ui/bubble-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { mount } from '@/islands';
import { SigmaProviders, hasPersistedData, showSkeleton } from '@/lib/query';
import { EmsGate } from '@/components/EmsGate';
import { sigma } from '@/bridge';
import {
  fetchPushLog, pushLogCanSee, pushLogLine, pushLogTiles, PUSH_LOG_QUERY_KEY, type PushLogRow,
} from '@/lib/pushLog';

const TITLE = 'יומן התראות';

function usePushLog(enabled: boolean) {
  return useQuery({
    queryKey: PUSH_LOG_QUERY_KEY,
    queryFn: () => fetchPushLog(200),
    enabled,
  });
}

function isIdanNow(): boolean {
  try { return !!sigma?.isIdan?.(); } catch { return false; }
}

function PushLogInner() {
  const [isIdan, setIsIdan] = React.useState(isIdanNow);
  React.useEffect(() => {
    const onUser = () => setIsIdan(isIdanNow());
    window.addEventListener('user-changed' as any, onUser);
    return () => window.removeEventListener('user-changed' as any, onUser);
  }, []);
  const name = (() => { try { return sigma?.getCurrentUser?.() || ''; } catch { return ''; } })();
  const canSee = pushLogCanSee(name, isIdan);

  const q = usePushLog(canSee);
  const rows = q.data || [];
  const [onlyFailed, setOnlyFailed] = React.useState(false);
  const [openRow, setOpenRow] = React.useState<PushLogRow | null>(null);

  const tiles = pushLogTiles(rows);
  const shown = onlyFailed ? rows.filter(r => r.status === 'failed') : rows;

  if (!canSee) return null;

  const isLoading = q.isLoading;
  if (isLoading && showSkeleton(rows.length > 0, hasPersistedData(['pushLog']))) {
    return (
      <div className="flex flex-col gap-3 p-2">
        <PageActionRow title={TITLE} onBack={() => (window as any).pageBack?.()} />
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-2">
        <PageActionRow title={TITLE} onBack={() => (window as any).pageBack?.()} />
        <EmptyState
          icon={<Bell />}
          title="לא הצלחנו לטעון את היומן."
          action={{ label: 'ניסיון נוסף', onClick: () => void q.refetch() }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-2 pb-24" data-testid="pushlog-page">
      <PageActionRow
        title={TITLE}
        onBack={() => (window as any).pageBack?.()}
        actions={
          <BubbleButton
            variant="icon"
            size="sm"
            aria-label="רענון"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw className={q.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </BubbleButton>
        }
      />

      <StatTileGrid>
        <StatTile value={tiles.total} label="סה״כ" />
        <StatTile value={tiles.sent} label="נשלחו" role="ok" />
        <StatTile
          value={tiles.failed}
          label="נכשלו"
          role="danger"
          selected={onlyFailed}
          onClick={() => setOnlyFailed(v => !v)}
        />
        <StatTile value={tiles.expired} label="מנוי מת" />
      </StatTileGrid>

      {shown.length === 0 ? (
        <EmptyState icon={<Bell />} title="עוד לא נשלחו התראות." />
      ) : (
        <SectionBlock>
          <div className="divide-y divide-border">
            {shown.map((r, i) => {
              const line = pushLogLine(r);
              return (
                <div key={`${r.sent_at}-${r.recipient}-${i}`} data-testid="pushlog-row">
                  <ListRow
                    title={`${line.what}${line.where ? ' · ' + line.where : ''}`}
                    meta={
                      <>
                        <span>{line.who} · <bdi>{line.when}</bdi>{' · '}
                          <Tag role={line.status.role as any}>{line.status.label}</Tag>
                        </span>
                        {r.status === 'failed' && line.error && (
                          <span className="block text-[var(--danger-ink)]">{line.error}</span>
                        )}
                      </>
                    }
                    onClick={() => setOpenRow(r)}
                    className="px-4"
                  />
                </div>
              );
            })}
          </div>
        </SectionBlock>
      )}

      <Sheet open={!!openRow} onOpenChange={o => { if (!o) setOpenRow(null); }}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[80svh] overflow-y-auto">
          <SheetHeader><SheetTitle>פרטי התראה</SheetTitle></SheetHeader>
          {openRow && (() => {
            const line = pushLogLine(openRow);
            return (
              <div className="flex flex-col gap-3 px-1 py-2 text-[length:var(--fs-body)]">
                <div><span className="text-muted-foreground">כותרת: </span>{openRow.title || line.what}</div>
                <div><span className="text-muted-foreground">נמען: </span>{line.who}</div>
                <div><span className="text-muted-foreground">זמן: </span><bdi>{line.when}</bdi></div>
                <div><span className="text-muted-foreground">סטטוס: </span><Tag role={line.status.role as any}>{line.status.label}</Tag></div>
                {line.actor && <div><span className="text-muted-foreground">מבצע: </span>{line.actor}</div>}
                {line.error && (
                  <div>
                    <span className="text-muted-foreground">שגיאה: </span>
                    <span className="text-[var(--danger-ink)]">{line.error}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PushLog() {
  return (
    <SigmaProviders>
      <EmsGate>
        <PushLogInner />
      </EmsGate>
    </SigmaProviders>
  );
}

export function mountPushLog(): boolean {
  return mount('sigma-pushlog', PushLog);
}
