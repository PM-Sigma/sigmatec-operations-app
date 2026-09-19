// F17 / pattern 3 of `docs/ux-loading-patterns.md` — background revalidation, made visible.
//
// §7k #10 paints cached rows instantly and refreshes behind them, which is the right
// behaviour and was completely invisible: a stale screen and a refreshing screen looked
// identical, so a person watching an old number had no way to know one was on its way.
//
// The indicator is deliberately the smallest thing that can work: a 2 px brand hairline
// pinned under the header while `isFetching && !isPending`. It never blocks, never moves
// layout (it is `fixed`), and it disappears the moment the refresh lands. A first load with
// no cache is a Skeleton (pattern 1), not this — hence the `!isPending` half.
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

export function SyncHairline() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const on = fetching + mutating > 0;

  // prefers-reduced-motion keeps the bar, drops the sweep (rule 8).
  return (
    <div
      aria-hidden
      data-testid="sync-hairline"
      data-syncing={on ? 'true' : 'false'}
      className={'pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] transition-opacity duration-200 '
        + (on ? 'bg-brand-grad opacity-100 motion-safe:animate-pulse' : 'opacity-0')}
    />
  );
}
