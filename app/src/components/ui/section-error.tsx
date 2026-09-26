import { TriangleAlert } from 'lucide-react';
import { BubbleButton } from '@/components/ui/bubble-button';
import { cn } from '@/lib/utils';

/**
 * SectionError — design-system spec §2 "Components → SectionError": a load failure inside a
 * section, not a full-page crash. Danger ink on the surface, one line of text, and a tonal
 * retry bubble. `role="alert"` so a screen reader announces it the moment it mounts.
 */
export function SectionError({
  text,
  onRetry,
  className,
}: {
  text: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-2 px-6 py-8 text-center text-[var(--danger-ink)]',
        className,
      )}
    >
      <TriangleAlert aria-hidden className="h-5 w-5" />
      <p className="text-[length:var(--fs-body)] font-semibold leading-[var(--lh-body)]">{text}</p>
      {onRetry && (
        <BubbleButton variant="tonal" size="sm" className="mt-1" onClick={onRetry}>
          ניסיון נוסף
        </BubbleButton>
      )}
    </div>
  );
}
