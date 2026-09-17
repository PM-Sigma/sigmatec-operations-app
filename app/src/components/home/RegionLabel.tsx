// The region sub-header (spec §7b: "a small muted label with a hairline, never a card or a
// colored bar"). It spans the whole grid row so the cards below it start on a fresh line.
// A motion element, because it lives inside the cards' AnimatePresence list and has to
// enter and leave with them when a filter or a search empties its region.
import { motion, useReducedMotion } from 'motion/react';
import { NO_REGION_LABEL } from '@/lib/kibbutzim';

export function RegionLabel({ region }: { region: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.16 } }}
      transition={{ duration: 0.22 }}
      className="col-span-full -mb-0.5 mt-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground"
      data-region={region}
    >
      <span>{region || NO_REGION_LABEL}</span>
      <span className="h-px flex-1 bg-border" />
    </motion.div>
  );
}
