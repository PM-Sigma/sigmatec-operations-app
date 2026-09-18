// shadcn/ui Collapsible (hand-vendored, same source as the CLI emits) — the "היסטוריה"
// disclosure on a kibbutz card (spec §3.3). The open/close height animation is driven by
// Radix's CSS vars through the `collapsible-down|up` keyframes in styles.css.
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
