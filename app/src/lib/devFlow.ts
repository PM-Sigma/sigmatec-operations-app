// D-L4 — the flow strip: one stacked bar for the whole board (port of devFlowSegments +
// devPctSegments, 18-dev-tasks.js). Integer percentages that sum to exactly 100 (largest
// remainder method; ties break by pipeline order, so a re-run never reshuffles).
import { STAGE_LABEL, stageOf, type DevCard, type DevStage } from './sprintPrep';

/** The whole pipeline, in the order the flow strip and the day-stamps walk it. */
export const DEV_STAGE_ORDER: DevStage[] = ['fields', 'backlog', 'scope', 'ready', 'prog', 'review', 'committed'];

export interface FlowSegment { key: DevStage; label: string; count: number; pct: number }

export function devFlowSegments(cards: DevCard[] | null | undefined): FlowSegment[] {
  const counts: Partial<Record<DevStage, number>> = {};
  for (const c of cards || []) {
    if (!c || !Number.isFinite(Number(c.number))) continue;
    const k = stageOf(c);
    counts[k] = (counts[k] || 0) + 1;
  }
  const total = DEV_STAGE_ORDER.reduce((a, k) => a + (counts[k] || 0), 0);
  if (!total) return [];

  const rows = DEV_STAGE_ORDER
    .map((k, i) => ({ key: k, n: counts[k] || 0, i }))
    .filter(r => r.n > 0)
    .map(r => {
      const exact = (r.n * 100) / total;
      return { ...r, pct: Math.floor(exact), rem: exact - Math.floor(exact) };
    });

  const left = 100 - rows.reduce((a, r) => a + r.pct, 0);
  const bump = new Set(
    rows.slice()
      .sort((a, b) => (b.rem - a.rem) || (a.i - b.i))
      .slice(0, Math.max(0, Math.min(left, rows.length)))
      .map(r => r.key),
  );

  return rows.map(r => ({ key: r.key, label: STAGE_LABEL[r.key], count: r.n, pct: r.pct + (bump.has(r.key) ? 1 : 0) }));
}
