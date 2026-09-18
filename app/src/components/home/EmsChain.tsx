// The EMS verification chain panel (spec §7b). Five rows, each ⏳ → ✓ / ⚠️ / ✗ with the value
// that was actually pulled. Rows animate in one after the other as the run progresses, and
// every step is reported even when an earlier one failed.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Check, Loader2, Minus, X } from 'lucide-react';
import type { ChainState, ChainStep } from '@/lib/kibbutzim';

const ICON: Record<ChainState, typeof Check> = {
  pending: Loader2,
  ok: Check,
  warn: AlertTriangle,
  bad: X,
  skipped: Minus,
};

const TONE: Record<ChainState, string> = {
  pending: 'text-muted-foreground',
  ok: 'text-[color:var(--brand-2)]',
  warn: 'text-[color:var(--sigma-warn)]',
  bad: 'text-destructive',
  skipped: 'text-muted-foreground',
};

export function EmsChain({ steps, running }: { steps: ChainStep[]; running: boolean }) {
  const reduce = useReducedMotion();
  if (!steps.length) return null;
  return (
    <div className="my-1.5 flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {steps.map((s, i) => {
          const Icon = ICON[s.state];
          return (
            <motion.div
              key={s.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: reduce ? 0 : i * 0.025 }}
              className="flex items-center gap-2 rounded-xl border border-border bg-muted px-2.5 py-2 text-[12.5px]"
            >
              <Icon className={'h-4 w-4 shrink-0 ' + TONE[s.state] + (s.state === 'pending' ? ' animate-spin' : '')} />
              <span className="shrink-0 font-bold">{s.label}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {s.state === 'pending' ? (running ? 'בודק…' : 'ממתין') : s.value}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
