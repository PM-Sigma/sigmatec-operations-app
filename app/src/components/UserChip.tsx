import { cn } from '@/lib/utils';
import { sigma, useCurrentUser, useEmsConnected } from '@/bridge';

/**
 * "● עידן" — the header/sheet identity chip (spec §6: no bare 👤 icon).
 * Green dot = connected to EMS. Tap → the legacy user switcher.
 */
export function UserChip({ className }: { className?: string }) {
  const { name } = useCurrentUser();
  const connected = useEmsConnected();
  return (
    <button
      type="button"
      onClick={() => sigma.changeUser()}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted',
        className,
      )}
      title={connected ? 'מחובר ל-EMS · החלף משתמש' : 'לא מחובר ל-EMS · החלף משתמש'}
    >
      <span
        aria-hidden
        className={cn('h-2 w-2 shrink-0 rounded-full', connected ? 'bg-brand-2' : 'bg-muted-foreground')}
      />
      <span>{name || 'לא מחובר'}</span>
    </button>
  );
}
