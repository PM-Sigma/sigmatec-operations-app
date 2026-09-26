// D-U1 — the flow strip: one StackedBar over the whole board (`devFlowSegments`, D-L4). Plain
// SVG/CSS, 2px surface gaps, in-segment counts, a legend; tapping a segment sets the stage
// filter. D-R7: the palette passes the dataviz validator in both themes — the two greys
// (fields/backlog) merge into ONE neutral role + a diagonal texture on fields (a parent-only
// stage), rather than inventing a second grey the validator would merge back anyway.
import * as React from 'react';
import type { DevStage } from '@/lib/sprintPrep';
import type { FlowSegment } from '@/lib/devFlow';

/** Stage → semantic role, reusing the validated Tag palette instead of new hex values. */
const STAGE_ROLE: Record<DevStage, { fill: string; ink: string; texture?: boolean }> = {
  fields: { fill: 'var(--neutral-fill)', ink: 'var(--neutral-ink)', texture: true },
  backlog: { fill: 'var(--neutral-fill)', ink: 'var(--neutral-ink)' },
  scope: { fill: 'var(--warn-fill)', ink: 'var(--warn-ink)' },
  ready: { fill: 'var(--info-fill)', ink: 'var(--info-ink)' },
  prog: { fill: 'var(--holiday-fill)', ink: 'var(--holiday-ink)' },
  review: { fill: 'var(--warn-fill)', ink: 'var(--warn-ink)', texture: true },
  committed: { fill: 'var(--ok-fill)', ink: 'var(--ok-ink)' },
};

export function FlowStrip({ segments, activeStage, onStageClick }: {
  segments: FlowSegment[];
  activeStage?: string;
  onStageClick: (stage: DevStage) => void;
}) {
  if (!segments.length) return null;
  return (
    <div data-testid="dev-flow-strip" className="flex flex-col gap-2">
      <div className="flex h-7 w-full overflow-hidden rounded-[var(--r-sm)]" role="list" aria-label="פילוג כרטיסים לפי שלב">
        {segments.map(s => {
          const role = STAGE_ROLE[s.key];
          const active = activeStage === s.key;
          return (
            <button
              key={s.key}
              type="button"
              role="listitem"
              aria-label={`${s.label}: ${s.count} כרטיסים, ${s.pct}%`}
              aria-pressed={active}
              data-testid={'dev-flow-seg-' + s.key}
              onClick={() => onStageClick(s.key)}
              className="relative flex h-full min-w-[6px] items-center justify-center overflow-hidden text-[10px] font-bold transition-[filter]"
              style={{
                flexGrow: Math.max(s.pct, 1),
                background: role.fill,
                color: role.ink,
                marginInlineEnd: '2px',
                outline: active ? '2px solid var(--sigma-ink)' : undefined,
                outlineOffset: active ? '-2px' : undefined,
                backgroundImage: role.texture
                  ? 'repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 1px, transparent 6px)'
                  : undefined,
                backgroundBlendMode: role.texture ? 'overlay' : undefined,
                opacity: role.texture ? 0.92 : 1,
              }}
            >
              {s.pct >= 8 ? <bdi>{s.count}</bdi> : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1" data-testid="dev-flow-legend">
        {segments.map(s => {
          const role = STAGE_ROLE[s.key];
          return (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: role.fill }} />
              <bdi>{s.label} · {s.count}</bdi>
            </span>
          );
        })}
      </div>
    </div>
  );
}
