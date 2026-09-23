import * as React from 'react';
import { BubbleButton } from '@/components/ui/bubble-button';
import { cn } from '@/lib/utils';

/**
 * EmptyState — design-system spec §2 "Components → EmptyState": a muted icon, a line saying
 * WHAT is missing, one line on HOW it gets filled, and at most one bubble. e.g. "עוד לא נשלחו
 * התראות." / "אין משימות פתוחות לקיבוץ הזה." + "משימה חדשה".
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <span aria-hidden className="text-muted-foreground [&_svg]:h-8 [&_svg]:w-8">{icon}</span>
      <p className="text-[length:var(--fs-body)] font-semibold leading-[var(--lh-body)]">{title}</p>
      {hint && <p className="text-[length:var(--fs-body-sm)] leading-[var(--lh-body-sm)] text-muted-foreground">{hint}</p>}
      {action && (
        <BubbleButton variant="tonal" size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </BubbleButton>
      )}
    </div>
  );
}
